"use client";

import { useMemo, useState } from "react";

type AnalyzeResponse = {
  input: string;
  finalUrl?: string;
  httpStatus?: number;
  platform?: string;
  scores?: {
    performance?: number;
    seo?: number;
    accessibility?: number;
    bestPractices?: number;
    pwa?: number;
  };
  pagespeed?: {
    scores?: {
      performance?: number;
      seo?: number;
      accessibility?: number;
      bestPractices?: number;
      pwa?: number;
    };
    metrics?: {
      lcpMs?: number | null;
      cls?: number | null;
      inpMs?: number | null;
    };
  };
  message?: string;
  error?: string;
};

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

      setResult(data);
    } catch (e: any) {
      setErr(e?.message || "Errore di rete");
    } finally {
      setLoading(false);
    }
  }

  // ✅ FIX: le card leggono prima da pagespeed.scores (dove arrivano davvero i valori)
  const viewScores = useMemo(() => {
    const ps = result?.pagespeed?.scores ?? {};
    const top = result?.scores ?? {};
    return {
      performance: ps.performance ?? top.performance,
      seo: ps.seo ?? top.seo,
      accessibility: ps.accessibility ?? top.accessibility,
      bestPractices: ps.bestPractices ?? top.bestPractices,
      pwa: ps.pwa ?? top.pwa,
    };
  }, [result]);

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
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
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
                  <b>Platform:</b> {result.platform}
                </div>
              )}
            </div>

            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 10,
              }}
            >
              <Score label="Performance" value={viewScores.performance} />
              <Score label="SEO" value={viewScores.seo} />
              <Score label="Accessibility" value={viewScores.accessibility} />
              <Score label="Best Practices" value={viewScores.bestPractices} />
              <Score label="PWA" value={viewScores.pwa} />
            </div>

            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer" }}>Risposta completa (JSON)</summary>
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

function Score({ label, value }: { label: string; value?: number }) {
  const v = typeof value === "number" ? Math.round(value) : null;
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        background: "rgba(0,0,0,0.25)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      <div style={{ opacity: 0.8, fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 22, marginTop: 6 }}>{v === null ? "—" : v}</div>
    </div>
  );
}
