"use client";
// app/builder/page.tsx — plain English → Python strategy

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Check, Copy, Info, Lightbulb, PlayCircle, ShieldCheck, Zap, AlertTriangle } from "lucide-react";
import { ApiError, fetchStrategyTemplates, generateStrategy, GeneratedStrategy, recordStrategy, saveMyStrategy, StrategyTemplate } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { LedgerReceipt } from "@/lib/types";
import LedgerReceipts from "@/components/LedgerReceipts";
import { setHandoff } from "@/lib/handoff";

const EXAMPLES = [
  "Buy when the 20-day moving average crosses above the 50-day moving average, sell when it crosses below",
  "Buy when RSI(14) drops below 30, sell when RSI rises above 70",
  "Buy when the MACD line crosses above the signal line, sell when it crosses below",
  "Buy when price touches the lower Bollinger Band (20 day, 2 std), sell at the upper band",
  "Buy when price breaks above the highest high of the last 55 days, sell when it breaks the 20-day low",
  "Buy when the close is above the 200-day average and RSI(2) is below 10; sell when RSI(2) goes above 70",
];

export default function BuilderPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [description, setDescription] = useState("");
  const [result, setResult] = useState<GeneratedStrategy | null>(null);
  const [code, setCode] = useState("");
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [tab, setTab] = useState<"describe" | "templates">("describe");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [receipt, setReceipt] = useState<LedgerReceipt | null>(null);

  useEffect(() => {
    fetchStrategyTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  const generate = async () => {
    if (!description.trim()) return;
    setLoading(true); setError(""); setSaved(""); setReceipt(null);
    try {
      const r = await generateStrategy(description);
      setResult(r);
      setCode(r.code);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to generate the strategy. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = (t: StrategyTemplate) => {
    setResult({ code: t.code, source: "template", template_id: t.id, understood: t.description, confident: true });
    setCode(t.code);
    setDescription(t.description);
    setSaved(""); setReceipt(null);
    setTab("describe");
  };

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    if (!user || !code) return;
    setSaving(true); setError("");
    try {
      const { receipt } = await recordStrategy(code);
      setReceipt(receipt);
      await saveMyStrategy({ name: description.slice(0, 60) || "My Strategy", description, code, ledgerId: receipt?.id });
      setSaved("Saved to your dashboard.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the strategy.");
    } finally {
      setSaving(false);
    }
  };

  const backtest = () => {
    setHandoff({ code, description });
    router.push("/backtest?from=builder");
  };

  const edited = result && code !== result.code;

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div className="page-header-inner" style={{ marginBottom: "1.5rem" }}>
          <div>
            <h1 className="page-title">AI Strategy Builder</h1>
            <p className="page-subtitle">Describe a trading idea in plain English and get Python code you can backtest on real data.</p>
          </div>
        </div>

        <div className="two-col">
          {/* input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="tabs">
              <button className={`tab-btn ${tab === "describe" ? "active" : ""}`} onClick={() => setTab("describe")}><Zap size={13} /> Describe</button>
              <button className={`tab-btn ${tab === "templates" ? "active" : ""}`} onClick={() => setTab("templates")}><BookOpen size={13} /> Templates</button>
            </div>

            {tab === "describe" ? (
              <div className="card">
                <div className="form-group">
                  <label className="form-label" htmlFor="desc">Your strategy</label>
                  <textarea
                    id="desc" className="form-textarea" style={{ minHeight: 130 }} maxLength={2000}
                    placeholder="e.g. Buy when the 20-day moving average crosses above the 50-day, sell when it crosses below"
                    value={description} onChange={e => setDescription(e.target.value)}
                  />
                  <span className="small muted">Name the indicators, periods and thresholds (RSI 14 below 30, 20-day MA…). Long-only, daily bars.</span>
                </div>
                <button className="btn btn-primary w-full" style={{ marginTop: "1rem" }} onClick={generate} disabled={loading || !description.trim()}>
                  {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Generating…</> : <><Zap size={16} /> Generate Python code</>}
                </button>
                {error && <div className="alert alert-danger" style={{ marginTop: "0.75rem" }}><AlertTriangle size={16} /> {error}</div>}

                <div style={{ marginTop: "1.25rem" }}>
                  <div className="small" style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.5rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    <Lightbulb size={14} style={{ color: "var(--warning)" }} /> Examples
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {EXAMPLES.map(p => (
                      <button key={p} className="btn btn-secondary btn-sm" style={{ whiteSpace: "normal", textAlign: "left", justifyContent: "flex-start", fontWeight: 500 }} onClick={() => setDescription(p)}>
                        “{p}”
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {!templates.length && <div className="card" style={{ textAlign: "center" }}><span className="spinner" /></div>}
                {templates.map(t => (
                  <button key={t.id} className="card card-interactive" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => applyTemplate(t)}>
                    <div style={{ fontWeight: 700 }}>{t.name}</div>
                    <div className="small" style={{ color: "var(--text-secondary)", marginTop: "0.25rem" }}>{t.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* output */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {result?.understood && (
              <div className={`alert ${result.confident === false ? "alert-warning" : "alert-info"}`}>
                <Info size={16} style={{ flexShrink: 0 }} />
                <span className="small">{result.understood}{result.note ? <><br />{result.note}</> : null}</span>
              </div>
            )}
            {result?.warnings?.map(w => (
              <div key={w} className="alert alert-warning small"><AlertTriangle size={16} style={{ flexShrink: 0 }} /> {w}</div>
            ))}

            <div className="code-block">
              <div className="code-block-header">
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <span className="code-block-lang">Python</span>
                  {result && <span className={`badge ${result.source === "gemini" ? "badge-accent" : "badge-info"}`}>{result.source === "gemini" ? `AI (${result.model})` : "Template"}</span>}
                  {edited && <span className="badge badge-warning">Edited</span>}
                </div>
                {code && (
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button className="btn btn-ghost btn-sm" onClick={copy}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
                    {user ? <button className="btn btn-secondary btn-sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button> : <Link href="/login?next=/builder" className="btn btn-ghost btn-sm">Log in to save</Link>}
                  </div>
                )}
              </div>
              <textarea
                aria-label="Strategy code"
                spellCheck={false}
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder={"# Your strategy code will appear here. You can edit it before backtesting.\n\ndef run_strategy(df):\n    df = df.copy()\n    df['Buy'] = ...\n    df['Sell'] = ...\n    return df"}
                style={{ width: "100%", minHeight: 380, background: "transparent", color: "#e2e8f0", border: "none", resize: "vertical", padding: "1rem", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", lineHeight: 1.55, outline: "none" }}
              />
            </div>

            {saved && <div className="alert alert-success small"><Check size={16} /> {saved}</div>}
            <LedgerReceipts receipts={[receipt]} title="Authorship recorded" />

            {code && (
              <div className="card" style={{ background: "var(--accent-light)", borderColor: "var(--accent)" }}>
                <p className="small" style={{ marginBottom: "0.75rem" }}>
                  <ShieldCheck size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> The backtester runs <strong>exactly this code</strong> in a sandbox, checks it for look-ahead bias, and records the result on the ledger.
                </p>
                <button className="btn btn-primary w-full" onClick={backtest}><PlayCircle size={16} /> Backtest this code</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
