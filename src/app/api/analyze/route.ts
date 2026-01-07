import { NextResponse } from "next/server";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function normalizeUrl(input: string) {
  const s = input.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTagContent(html: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = html.match(re);
  return m ? stripTags(m[1]) : "";
}

function getMetaContent(html: string, key: string, value: string) {
  const re = new RegExp(`<meta[^>]+${key}=["']${value}["'][^>]*>`, "i");
  const m = html.match(re);
  if (!m) return "";
  const tag = m[0];
  const c = tag.match(/content=["']([^"']*)["']/i);
  return c ? c[1].trim() : "";
}

function getLinkHref(html: string, rel: string) {
  const re = new RegExp(`<link[^>]+rel=["']${rel}["'][^>]*>`, "i");
  const m = html.match(re);
  if (!m) return "";
  const tag = m[0];
  const h = tag.match(/href=["']([^"']*)["']/i);
  return h ? h[1].trim() : "";
}

function countTags(html: string, tag: string) {
  const re = new RegExp(`<${tag}\\b`, "gi");
  const m = html.match(re);
  return m ? m.length : 0;
}

function bytesToKB(bytes?: number | null) {
  if (typeof bytes !== "number" || !isFinite(bytes)) return null;
  return Math.round((bytes / 1024) * 10) / 10;
}

function extractPageStats(pagespeedJson: any) {
  const audits = pagespeedJson?.lighthouseResult?.audits ?? {};
  const totalBytes: number | null = audits?.["total-byte-weight"]?.numericValue ?? null;
  const totalWeightKB = bytesToKB(totalBytes);

  const items = audits?.["network-requests"]?.details?.items;
  const requestsCount = Array.isArray(items) ? items.length : null;

  return { totalWeightKB, requestsCount };
}

function parseLdJsonTypes(html: string) {
  const scripts =
    html.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi
    ) || [];
  const types = new Set<string>();
  let count = 0;

  for (const s of scripts) {
    const jsonText = s
      .replace(/^[\s\S]*?>/i, "")
      .replace(/<\/script>\s*$/i, "")
      .trim();
    if (!jsonText) continue;

    try {
      const parsed = JSON.parse(jsonText);
      count++;

      const collect = (obj: any) => {
        if (!obj) return;
        if (Array.isArray(obj)) return obj.forEach(collect);
        if (typeof obj === "object") {
          const t = obj["@type"];
          if (typeof t === "string") types.add(t);
          if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && types.add(x));
          for (const k of Object.keys(obj)) collect(obj[k]);
        }
      };

      collect(parsed);
    } catch {
      // ignore
    }
  }

  return { hasLdJson: scripts.length > 0, count, types: Array.from(types).slice(0, 12) };
}

function detectTracking(html: string) {
  const h = html.toLowerCase();

  const metaPixel =
    h.includes("connect.facebook.net") || h.includes("fbq(") || h.includes("facebook pixel");

  const gtm = h.includes("googletagmanager.com/gtm.js") || h.includes("gtm.start");

  const ga4 =
    h.includes("gtag(") ||
    /gtag\/js\?id=g-[a-z0-9]+/i.test(html) ||
    /gtag\('config',\s*'g-/i.test(html);

  const googleAds =
    /googleadservices\.com|googlesyndication\.com|gtag\('config',\s*'aw-/i.test(html);

  const tiktok =
    h.includes("analytics.tiktok.com") || h.includes("ttq(") || h.includes("tiktok pixel");

  return { metaPixel, gtm, ga4, googleAds, tiktok };
}

function detectPlatform(html: string) {
  const h = html.toLowerCase();
  if (h.includes("cdn.shopify.com") || h.includes("shopify")) return "Shopify";
  if (h.includes("wp-content") || h.includes("wordpress")) return "WordPress";
  return "Sconosciuta/Custom";
}

function computeTrustScore(trust: {
  shipping: boolean;
  contact: boolean;
  returns: boolean;
  privacy: boolean;
  terms: boolean;
  faq: boolean;
}) {
  let score = 100;
  if (!trust.shipping) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function weightedTotal(perf: number, seo: number, ux: number, trust: number) {
  const total = 0.35 * perf + 0.25 * seo + 0.2 * ux + 0.2 * trust;
  return Math.round(total);
}

function detectPwaFromHtml(html: string) {
  const h = html.toLowerCase();

  const hasManifest =
    /<link[^>]+rel=["']manifest["'][^>]*>/i.test(html) ||
    /<link[^>]+rel=["']apple-touch-icon["'][^>]*>/i.test(html);

  const hasServiceWorker =
    h.includes("serviceworker.register") ||
    h.includes("navigator.serviceworker") ||
    /service-worker\.js|sw\.js/i.test(html);

  const available = !!(hasManifest && hasServiceWorker);
  return { available, hasManifest, hasServiceWorker };
}

async function runPageSpeed(url: string, key?: string) {
  const attempt = async (maybeKey?: string) => {
    const apiUrl = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    apiUrl.searchParams.set("url", url);
    apiUrl.searchParams.set("strategy", "mobile");

    ["performance", "accessibility", "best-practices", "seo"].forEach((c) =>
      apiUrl.searchParams.append("category", c)
    );

    if (maybeKey) apiUrl.searchParams.set("key", maybeKey);

    try {
      const r = await fetch(apiUrl.toString(), { cache: "no-store" });
      const j = await r.json();

      if (!r.ok) {
        const msg = j?.error?.message || `PageSpeed error (${r.status})`;
        return { ok: false as const, error: msg, json: j };
      }
      return { ok: true as const, json: j };
    } catch (e: any) {
      return { ok: false as const, error: e?.message || "Errore PageSpeed" };
    }
  };

  const first = await attempt(key);

  if (
    !first.ok &&
    key &&
    /api key not valid|invalid api key|keyinvalid|not authorized|forbidden/i.test(first.error || "")
  ) {
    const second = await attempt(undefined);
    if (second.ok) return second;
    return first;
  }

  return first;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const inputRaw = body?.domain ?? body?.url ?? "";
    const inputUrl = normalizeUrl(String(inputRaw));

    if (!inputUrl) {
      return NextResponse.json({ error: "Missing domain/url" }, { status: 400, headers: corsHeaders });
    }

    const key = process.env.PAGESPEED_API_KEY;

    // 1) Fetch HTML
    let html = "";
    let httpStatus: number | undefined;
    let finalUrl: string | undefined;

    try {
      const htmlRes = await fetch(inputUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CucituraCheckBot/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        cache: "no-store",
      });

      httpStatus = htmlRes.status;
      finalUrl = htmlRes.url || inputUrl;

      const t = await htmlRes.text();
      html = t.slice(0, 2_000_000);
    } catch {
      finalUrl = inputUrl;
    }

    const platform = html ? detectPlatform(html) : "Sconosciuta/Custom";

    // 2) PageSpeed
    const ps = await runPageSpeed(finalUrl || inputUrl, key);
    const pagespeedJson = ps.ok ? ps.json : null;
    const pagespeedError = ps.ok ? undefined : ps.error;

    const cats = pagespeedJson?.lighthouseResult?.categories ?? {};
    const score = (id: string) => {
      const s = cats?.[id]?.score;
      return typeof s === "number" ? Math.round(s * 100) : undefined;
    };

    const pagespeedScores = pagespeedJson
      ? {
          performance: score("performance"),
          seo: score("seo"),
          bestPractices: score("best-practices"),
          accessibility: score("accessibility"),
        }
      : {};

    const audits = pagespeedJson?.lighthouseResult?.audits ?? {};

    const lcpMs =
      typeof audits?.["largest-contentful-paint"]?.numericValue === "number"
        ? audits["largest-contentful-paint"].numericValue
        : null;

    const cls =
      typeof audits?.["cumulative-layout-shift"]?.numericValue === "number"
        ? audits["cumulative-layout-shift"].numericValue
        : null;

    // ✅ INP: audit corretto + fallback
    const inpAudit = audits?.["interaction-to-next-paint"] ?? audits?.["interactive-to-next-paint"];
    const inpMs = typeof inpAudit?.numericValue === "number" ? inpAudit.numericValue : null;

    const pageStats = pagespeedJson
      ? extractPageStats(pagespeedJson)
      : { totalWeightKB: null, requestsCount: null };

    // 3) SEO base
    const seo = html
      ? {
          title: getTagContent(html, "title"),
          metaDesc: getMetaContent(html, "name", "description"),
          h1: (() => {
            const re = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
            const all = [...html.matchAll(re)].map((m) => stripTags(m[1])).filter(Boolean);
            return all.join("\n\n");
          })(),
          canonical: getLinkHref(html, "canonical"),
          robots: getMetaContent(html, "name", "robots"),
          openGraph: {
            ogTitle: getMetaContent(html, "property", "og:title"),
            ogDesc: getMetaContent(html, "property", "og:description"),
            ogImage: getMetaContent(html, "property", "og:image"),
          },
        }
      : {
          title: "",
          metaDesc: "",
          h1: "",
          canonical: "",
          robots: "",
          openGraph: { ogTitle: "", ogDesc: "", ogImage: "" },
        };

    const h1Count = html ? countTags(html, "h1") : 0;

    // 4) Trust
    const lower = html.toLowerCase();
    const has = (needle: string) => lower.includes(needle);

    const trust = {
      contact: has("contatti") || has("contact") || has("chi siamo") || has("about"),
      shipping: has("spedizion") || has("shipping") || has("consegna"),
      returns: has("resi") || has("reso") || has("returns"),
      privacy: has("privacy"),
      terms: has("termini") || has("terms") || has("condizioni"),
      faq: has("faq") || has("domande frequenti"),
    };

    // 5) UX (CTA minima)
    const hasCTA =
      has("acquista") ||
      has("shop") ||
      has("nuovi arrivi") ||
      has("collezione") ||
      has("scopri") ||
      /class=["'][^"']*(btn|button)[^"']*["']/i.test(html);

    const ux = hasCTA ? 100 : 92;

    // 6) Issues + quick wins
    const issues: Array<{ key: string; severity: "high" | "medium" | "low"; fix: string }> = [];

    if (!trust.shipping) {
      issues.push({
        key: "trust.shipping.missing",
        severity: "high",
        fix: "Aggiungi una pagina Spedizioni e linkala nel footer.",
      });
    }

    const titleLen = (seo.title || "").trim().length;
    if (titleLen > 0 && titleLen < 25) {
      issues.push({
        key: "seo.title.length",
        severity: "medium",
        fix: `Titolo pagina troppo corto (attuale ${titleLen} caratteri).`,
      });
    }

    const mdLen = (seo.metaDesc || "").trim().length;
    if (mdLen > 0 && (mdLen < 70 || mdLen > 160)) {
      issues.push({
        key: "seo.metadesc.length",
        severity: "medium",
        fix: `Descrizione Google non ottimale (attuale ${mdLen} caratteri).`,
      });
    }

    if (h1Count > 1) {
      issues.push({
        key: "seo.h1.multiple",
        severity: "low",
        fix: "Troppi titoli principali (H1): mantieni 1 solo H1 per pagina.",
      });
    }

    if (!seo.canonical) {
      issues.push({
        key: "seo.canonical.missing",
        severity: "low",
        fix: "Manca la canonical (utile per evitare duplicazioni).",
      });
    }

    if (!hasCTA) {
      issues.push({
        key: "ux.cta.unclear",
        severity: "medium",
        fix: "CTA poco chiara: aggiungi un bottone principale sopra la piega (es. “Scopri i prodotti”).",
      });
    }

    const severityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const quickWins = issues
      .slice()
      .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
      .slice(0, 3)
      .map((i) => i.fix);

    // 7) Tech
    const tech = html
      ? {
          page: pageStats,
          schema: parseLdJsonTypes(html),
          tracking: detectTracking(html),
          pwa: detectPwaFromHtml(html),
        }
      : {
          page: pageStats,
          schema: null,
          tracking: null,
          pwa: { available: false, hasManifest: false, hasServiceWorker: false },
        };

    const perf =
      typeof (pagespeedScores as any).performance === "number"
        ? (pagespeedScores as any).performance
        : undefined;

    const seoScore =
      typeof (pagespeedScores as any).seo === "number"
        ? (pagespeedScores as any).seo
        : undefined;

    const trustScore = computeTrustScore(trust);

    const total =
      typeof perf === "number" && typeof seoScore === "number"
        ? weightedTotal(perf, seoScore, ux, trustScore)
        : undefined;

    return NextResponse.json(
      {
        input: inputUrl,
        finalUrl: pagespeedJson?.lighthouseResult?.finalUrl ?? finalUrl ?? inputUrl,
        httpStatus: typeof httpStatus === "number" ? httpStatus : undefined,
        platform,
        scores: { total, performance: perf, seo: seoScore, ux, trust: trustScore },
        pagespeed: {
          scores: pagespeedScores,
          metrics: { lcpMs, cls, inpMs },
          ...(pagespeedError ? { error: pagespeedError } : {}),
        },
        seo,
        trust,
        tech,
        issues,
        quickWins,
      },
      { headers: corsHeaders }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
