"use client";

import { useMemo, useState } from "react";

type Issue = {
  key: string;
  severity: "high" | "medium" | "low";
  fix: string;
};

type AnalyzeResponse = {
  input: string;
  finalUrl?: string;
  httpStatus?: number;
  platform?: string;

  scores?: {
    total?: number;
    performance?: number;
    seo?: number;
    ux?: number;
    trust?: number;
  };

  pagespeed?: {
    scores?: {
      performance?: number; // 0-100
      seo?: number; // 0-100
      bestPractices?: number; // 0-100
      accessibility?: number; // 0-100
    };
    metrics?: {
      lcpMs?: number;
      cls?: number;
      inpMs?: number | null;
    };
    error?: string;
  };

  seo?: {
    title?: string;
    metaDesc?: string;
    h1?: string;
    canonical?: string;
    robots?: string;
    openGraph?: {
      ogTitle?: string;
      ogDesc?: string;
      ogImage?: string;
    };
  };

  trust?: {
    contact?: boolean;
    shipping?: boolean;
    returns?: boolean;
    privacy?: boolean;
    terms?: boolean;
    faq?: boolean;
  };

  issues?: Issue[];
  quickWins?: string[];

  message?: string;
  error?: string;
};

const ISSUE_LABELS: Record<string, string> = {
  "trust.shipping.missing": "Manca pagina Spedizioni",
  "trust.contact.missing": "Manca pagina Contatti",
  "trust.faq.missing": "Manca pagina FAQ",

  "seo.title.length": "Titolo pagina troppo corto",
  "seo.metadesc.length": "Descrizione Google non ottimale",
  "seo.h1.multiple": "Troppi titoli principali (H1)",
  "seo.canonical.missing": "Manca la canonical (rischio duplicati)",

  "ux.cta.unclear": "Call-to-action principale poco chiara",
};

function issueLabel(key: string) {
  return ISSUE_LABELS[key] ?? "Suggerimento tecnico";
}

export default function Page() {
  const [domain, setDomain] = useState("https://www.wikipedia.org");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canAnalyze = useMemo(() => domain.trim().length > 0, [domain]);

  async function onAnalyze() {
    setLoading(true);
    setErr(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });

      const data = (await res.json()) as AnalyzeResponse;

      if (!res.ok) {
        setErr(data?.message || data?.error || `Errore API (${res.status})`);
        setResult(data);
        return;
      }

      if (data?.pagespeed?.error) setErr(data.pagespeed.error);

      setResult(data);
    } catch (e: any) {
      setErr(e?.message || "Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  const viewScores = useMemo(() => {
    if (!result) return null;
    const ps = result.pagespeed?.scores;
    const fallback = result.scores;

    return {
      performance: ps?.performance ?? fallback?.performance,
      seo: ps?.seo ?? fallback?.seo,
      accessibility: ps?.accessibility,
      bestPractices: ps?.bestPractices,
    };
  }, [result]);

  const metrics = result?.pagespeed?.metrics;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "#0b0b0b",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Cucitura Check — Analyzer</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>
          Inserisci un dominio/URL e avvia l’analisi (API: <code>/api/analyze</code>).
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="https://www.esempio.com"
            style={{
              flex: "1 1 420px",
              padding: "12px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.06)",
              color: "#fff",
              outline: "none",
            }}
          />
          <button
            onClick={onAnalyze}
            disabled={!canAnalyze || loading}
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: loading ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.14)",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Analizzo..." : "Analizza"}
          </button>
        </div>

        {err && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 10,
              background: "rgba(255,0,0,0.10)",
              border: "1px solid rgba(255,0,0,0.25)",
            }}
          >
            <b>Errore:</b> {err}
          </div>
        )}

        {result && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              borderRadius: 14,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <b>Input:</b> {result.input}
              </div>
              {result.finalUrl && (
                <div>
                  <b>Final URL:</b> {result.finalUrl}
                </div>
              )}
              {typeof result.httpStatus === "number" && (
                <div>
                  <b>Status:</b> {result.httpStatus}
                </div>
              )}
              {result.platform && (
                <div>
                  <b>Piattaforma:</b> {result.platform}
                </div>
              )}
            </div>

            {viewScores && (
              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                  gap: 10,
                }}
              >
                <Score
                  title="Velocità di caricamento"
                  subtitle="Quanto velocemente si apre il sito"
                  value={viewScores.performance}
                />
                <Score
                  title="Visibilità su Google"
                  subtitle="Quanto è chiaro a Google di cosa parla il sito"
                  value={viewScores.seo}
                />
                <Score
                  title="Accessibile a tutti"
                  subtitle="Facilità d’uso anche per chi ha difficoltà"
                  value={viewScores.accessibility}
                />
                <Score
                  title="Affidabilità tecnica"
                  subtitle="Buone pratiche, sicurezza e qualità"
                  value={viewScores.bestPractices}
                />
              </div>
            )}

            {(metrics?.lcpMs || typeof metrics?.cls === "number" || metrics?.inpMs !== undefined) && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Esperienza utente (Core Web Vitals)</div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                  }}
                >
                  <MiniMetric
                    label="Caricamento contenuto principale (LCP)"
                    value={formatMs(metrics?.lcpMs)}
                    hint="Tempo per vedere il contenuto principale"
                  />
                  <MiniMetric
                    label="Stabilità della pagina (CLS)"
                    value={formatCls(metrics?.cls)}
                    hint="Quanto “balla” il layout mentre carica"
                  />
                  <MiniMetric
                    label="Reattività ai click/tocchi (INP)"
                    value={formatMs(metrics?.inpMs)}
                    hint="Quanto risponde velocemente alle interazioni"
                  />
                </div>
              </div>
            )}

            {(result.quickWins?.length || result.issues?.length) && (
              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
                {result.quickWins?.length ? (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: "rgba(0,0,0,0.22)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Cosa migliorare subito (facile e veloce)</div>
                    <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.95 }}>
                      {result.quickWins.map((w, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {result.issues?.length ? (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      background: "rgba(0,0,0,0.22)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>Cose da sistemare</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {result.issues.map((it) => (
                        <div
                          key={it.key}
                          style={{
                            padding: 10,
                            borderRadius: 10,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.10)",
                            display: "flex",
                            gap: 10,
                            alignItems: "flex-start",
                          }}
                        >
                          <Badge severity={it.severity} />
                          <div>
                            <div style={{ opacity: 0.85, fontSize: 13, fontWeight: 700 }}>
                              {issueLabel(it.key)}
                            </div>
                            <div style={{ opacity: 0.55, fontSize: 12, marginTop: 2 }}>
                              {it.key}
                            </div>
                            <div style={{ marginTop: 6 }}>{it.fix}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {result.trust && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Pagine che aumentano la fiducia</div>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(0,0,0,0.22)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 8,
                  }}
                >
                  <CheckItem label="Contatti" ok={!!result.trust.contact} />
                  <CheckItem label="Spedizioni" ok={!!result.trust.shipping} />
                  <CheckItem label="Resi / Rimborsi" ok={!!result.trust.returns} />
                  <CheckItem label="Privacy" ok={!!result.trust.privacy} />
                  <CheckItem label="Termini e condizioni" ok={!!result.trust.terms} />
                  <CheckItem label="FAQ" ok={!!result.trust.faq} />
                </div>
              </div>
            )}

            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer" }}>Dettagli tecnici (JSON)</summary>
              <pre
                style={{
                  marginTop: 10,
                  overflow: "auto",
                  padding: 12,
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.35)",
                }}
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function Score({
  title,
  subtitle,
  value,
  emptyLabel = "—",
}: {
  title: string;
  subtitle?: string;
  value?: number | null;
  emptyLabel?: string;
}) {
  const isNum = typeof value === "number" && Number.isFinite(value);
  const shown = isNum ? Math.round(value as number) : null;

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        background: "rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.10)",
        minHeight: 92,
      }}
    >
      <div style={{ fontWeight: 700 }}>{title}</div>
      {subtitle ? <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>{subtitle}</div> : null}
      <div style={{ fontSize: 24, marginTop: 10 }}>{shown === null ? emptyLabel : shown}</div>
    </div>
  );
}

function MiniMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div style={{ fontWeight: 700 }}>{label}</div>
      {hint ? <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>{hint}</div> : null}
      <div style={{ fontSize: 18, marginTop: 8 }}>{value}</div>
    </div>
  );
}

function Badge({ severity }: { severity: "high" | "medium" | "low" }) {
  const label =
    severity === "high" ? "PRIORITÀ ALTA" : severity === "medium" ? "PRIORITÀ MEDIA" : "PRIORITÀ BASSA";

  return (
    <div
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.06)",
        fontSize: 11,
        fontWeight: 800,
        opacity: 0.95,
        minWidth: 110,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

function CheckItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ fontSize: 16 }}>{ok ? "✅" : "❌"}</span>
      <span style={{ opacity: 0.95 }}>{label}</span>
    </div>
  );
}

function formatMs(ms?: number | null) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatCls(cls?: number) {
  if (typeof cls !== "number" || !Number.isFinite(cls)) return "—";
  return cls.toFixed(3);
}
