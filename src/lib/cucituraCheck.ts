import * as cheerio from "cheerio";
import { z } from "zod";

const InputSchema = z.string().min(1);

type Severity = "critical" | "high" | "medium" | "low";
type Issue = { key: string; severity: Severity; fix: string };

function normalizeUrl(input: string) {
  const raw = InputSchema.parse(input).trim();
  const withProto = raw.match(/^https?:\/\//i) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withProto);
  } catch {
    throw new Error("URL non valido. Esempio: https://miosito.com");
  }

  const host = url.hostname.toLowerCase();
  if (["localhost", "127.0.0.1", "0.0.0.0"].includes(host)) {
    throw new Error("Dominio non consentito.");
  }

  return url.toString();
}

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "user-agent": "CucituraCheckBot/1.0 (+https://cucituradigitale.it)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/html")) {
    throw new Error(`La risorsa non è HTML (content-type: ${ct}).`);
  }

  const html = await res.text();
  return { html, finalUrl: res.url, status: res.status };
}

function detectPlatform(html: string) {
  const h = html.toLowerCase();
  if (h.includes("cdn.shopify.com") || h.includes("x-shopify")) return "Shopify";
  if (h.includes("woocommerce") || h.includes("wp-content")) return "WooCommerce/WordPress";
  if (h.includes("magento")) return "Magento";
  if (h.includes("prestashop")) return "PrestaShop";
  if (h.includes("bigcommerce")) return "BigCommerce";
  return "Sconosciuta/Custom";
}

function textLen(s: string) {
  return (s || "").trim().length;
}

function findTrustLinks($: cheerio.CheerioAPI) {
  const links: { href: string; label: string }[] = [];
  $("a[href]").each((_, a) => {
    const href = ($(a).attr("href") || "").trim().toLowerCase();
    const label = ($(a).text() || "").trim().toLowerCase();
    if (!href) return;
    links.push({ href, label });
  });

  const has = (patterns: string[]) =>
    links.some((l) => patterns.some((p) => l.label.includes(p) || l.href.includes(p)));

  return {
    contact: has(["contatt", "contact", "assistenza", "support", "help"]),
    shipping: has(["sped", "shipping", "delivery", "consegna"]),
    returns: has(["reso", "return", "cambi", "refund"]),
    privacy: has(["privacy", "gdpr", "cookie"]),
    terms: has(["termini", "terms", "condizioni"]),
    faq: has(["faq", "domande"]),
  };
}

function seoChecks($: cheerio.CheerioAPI) {
  const title = $("title").first().text() || "";
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const h1 = $("h1");
  const canonical = $('link[rel="canonical"]').attr("href") || "";
  const robots = $('meta[name="robots"]').attr("content") || "";

  const ogTitle = $('meta[property="og:title"]').attr("content") || "";
  const ogDesc = $('meta[property="og:description"]').attr("content") || "";
  const ogImage = $('meta[property="og:image"]').attr("content") || "";

  const issues: Issue[] = [];

  const tLen = textLen(title);
  if (tLen === 0) issues.push({ key: "seo.title.missing", severity: "high", fix: "Aggiungi un <title> unico per la homepage." });
  else if (tLen < 25 || tLen > 65) issues.push({ key: "seo.title.length", severity: "medium", fix: `Ottimizza il title (attuale ${tLen} caratteri).` });

  const dLen = textLen(metaDesc);
  if (dLen === 0) issues.push({ key: "seo.metadesc.missing", severity: "high", fix: "Aggiungi meta description per aumentare CTR su Google." });
  else if (dLen < 70 || dLen > 170) issues.push({ key: "seo.metadesc.length", severity: "medium", fix: `Ottimizza la description (attuale ${dLen} caratteri).` });

  if (h1.length === 0) issues.push({ key: "seo.h1.missing", severity: "high", fix: "Inserisci un H1 chiaro (proposta di valore)." });
  else if (h1.length > 1) issues.push({ key: "seo.h1.multiple", severity: "low", fix: "Mantieni 1 solo H1 principale per pagina." });

  if (!canonical) issues.push({ key: "seo.canonical.missing", severity: "low", fix: "Imposta canonical per evitare duplicazioni." });

  if ((robots || "").toLowerCase().includes("noindex")) {
    issues.push({ key: "seo.noindex", severity: "critical", fix: "Rimuovi noindex dalla homepage (se non voluto)." });
  }

  if (!ogTitle || !ogDesc || !ogImage) {
    issues.push({ key: "seo.opengraph.incomplete", severity: "low", fix: "Completa OpenGraph (og:title/og:description/og:image) per anteprime social." });
  }

  return {
    title,
    metaDesc,
    h1Text: h1.first().text().trim() || "",
    canonical,
    robots,
    openGraph: { ogTitle, ogDesc, ogImage },
    issues,
  };
}

function scoreFromIssues(issues: Issue[]) {
  let score = 100;
  for (const it of issues) {
    if (it.severity === "critical") score -= 25;
    else if (it.severity === "high") score -= 15;
    else if (it.severity === "medium") score -= 8;
    else if (it.severity === "low") score -= 3;
  }
  return Math.max(0, Math.min(100, score));
}

function severityRank(sev: Severity) {
  return ({ critical: 0, high: 1, medium: 2, low: 3 } as const)[sev] ?? 9;
}

async function runPageSpeed(url: string, strategy: "mobile" | "desktop" = "mobile") {
  const key = process.env.PAGESPEED_API_KEY || "";
  const qs = new URLSearchParams({ url, strategy });
  qs.append("category", "performance");
  qs.append("category", "seo");
  qs.append("category", "best-practices");
  qs.append("category", "accessibility");
  if (key) qs.set("key", key);

  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs.toString()}`;
  const res = await fetch(apiUrl, { method: "GET" });
  if (!res.ok) throw new Error(`PageSpeed API error (${res.status})`);

  const json: any = await res.json();
  const cats = json?.lighthouseResult?.categories || {};
  const audits = json?.lighthouseResult?.audits || {};

  return {
    scores: {
      performance: Math.round((cats.performance?.score ?? 0) * 100),
      seo: Math.round((cats.seo?.score ?? 0) * 100),
      bestPractices: Math.round((cats["best-practices"]?.score ?? 0) * 100),
      accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
    },
    metrics: {
      lcpMs: audits["largest-contentful-paint"]?.numericValue ?? null,
      cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
      inpMs: audits["interaction-to-next-paint"]?.numericValue ?? null,
    },
  };
}

export async function analyzeSite(inputUrl: string) {
  const url = normalizeUrl(inputUrl);

  const { html, finalUrl, status } = await fetchHtml(url);
  const $ = cheerio.load(html);

  const platform = detectPlatform(html);
  const trust = findTrustLinks($);
  const seo = seoChecks($);

  const trustIssues: Issue[] = [];
  if (!trust.contact) trustIssues.push({ key: "trust.contact.missing", severity: "high", fix: "Rendi visibili Contatti/Assistenza (header o footer)." });
  if (!trust.shipping) trustIssues.push({ key: "trust.shipping.missing", severity: "high", fix: "Aggiungi pagina Spedizioni e linkala nel footer." });
  if (!trust.returns) trustIssues.push({ key: "trust.returns.missing", severity: "high", fix: "Aggiungi pagina Resi/Cambi vicino alle CTA prodotto." });
  if (!trust.privacy) trustIssues.push({ key: "trust.privacy.missing", severity: "medium", fix: "Linka Privacy/Cookie policy nel footer." });
  if (!trust.terms) trustIssues.push({ key: "trust.terms.missing", severity: "low", fix: "Aggiungi Termini e Condizioni nel footer." });

  const btnTexts = $("a,button").toArray().map((el) => ($(el).text() || "").trim().toLowerCase());
  const hasPrimaryCta = btnTexts.some((t) => ["acquista", "shop", "scopri", "compra", "aggiungi"].some((k) => t.includes(k)));
  const uxIssues: Issue[] = [];
  if (!hasPrimaryCta) uxIssues.push({ key: "ux.cta.unclear", severity: "medium", fix: "Inserisci una CTA primaria chiara sopra la piega (es. 'Scopri i prodotti')." });

  let psi: any = null;
  try {
    psi = await runPageSpeed(finalUrl, "mobile");
  } catch (e: any) {
    psi = { error: String(e?.message || e) };
  }

  const issues: Issue[] = [...seo.issues, ...trustIssues, ...uxIssues].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity)
  );

  const trustScore = scoreFromIssues(trustIssues);
  const uxScore = scoreFromIssues(uxIssues);

  const perfScore = psi?.scores?.performance ?? null;
  const seoScore = psi?.scores?.seo ?? scoreFromIssues(seo.issues);

  const total =
    perfScore !== null
      ? Math.round(0.35 * perfScore + 0.3 * uxScore + 0.2 * seoScore + 0.15 * trustScore)
      : Math.round(0.4 * seoScore + 0.35 * uxScore + 0.25 * trustScore);

  const quickWins = issues
    .filter((i) => ["critical", "high", "medium"].includes(i.severity))
    .slice(0, 7)
    .map((i) => i.fix);

  return {
    input: inputUrl,
    finalUrl,
    httpStatus: status,
    platform,
    scores: {
      total,
      performance: perfScore,
      seo: seoScore,
      ux: uxScore,
      trust: trustScore,
    },
    pagespeed: psi,
    seo: {
      title: seo.title,
      metaDesc: seo.metaDesc,
      h1: seo.h1Text,
      canonical: seo.canonical,
      robots: seo.robots,
      openGraph: seo.openGraph,
    },
    trust,
    issues,
    quickWins,
  };
}

