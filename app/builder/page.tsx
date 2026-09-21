"use client";
// app/builder/page.tsx — AI Strategy Builder

import { useState, useEffect } from "react";
import {
  Zap, Copy, Check, RefreshCw, PlayCircle, BookOpen,
  Lightbulb, ChevronDown, ChevronUp, Info
} from "lucide-react";
import { generateStrategy, fetchStrategyTemplates, runBacktest, StrategyTemplate } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { saveStrategy } from "@/lib/firebase";

const EXAMPLE_PROMPTS = [
  "Buy when the 20-day moving average crosses above the 50-day moving average, sell when it crosses below",
  "Buy when RSI drops below 30 (oversold), sell when RSI rises above 70 (overbought)",
  "Buy when MACD line crosses above signal line, sell when it crosses below",
  "Buy when price touches the lower Bollinger Band, sell when it touches the upper band",
  "Buy when price breaks above the highest high of the last 20 days, sell when it breaks below the lowest low",
];

export default function BuilderPage() {
  const { user } = useAuth();
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showTemplates, setShowTemplates] = useState(true);
  const [activeTab, setActiveTab] = useState<"describe" | "templates">("describe");

  useEffect(() => {
    fetchStrategyTemplates()
      .then(setTemplates)
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setError("");
    setCode("");
    setSaved(false);
    try {
      const res = await generateStrategy(description);
      setCode(res.code);
      setSource(res.source);
      setNote(res.note || "");
    } catch (e: any) {
      setError(e.message || "Failed to generate strategy. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!user || !code) return;
    try {
      await saveStrategy(user.uid, {
        name: description.slice(0, 60) || "My Strategy",
        description,
        code,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
  };

  const applyTemplate = (t: StrategyTemplate) => {
    setCode(t.code);
    setDescription(t.description);
    setSource("template");
    setNote("");
    setActiveTab("describe");
  };

  const applyPrompt = (p: string) => {
    setDescription(p);
  };

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        {/* Header */}
        <div className="page-header-inner" style={{ marginBottom: "2rem" }}>
          <div>
            <h1 className="page-title">AI Strategy Builder</h1>
            <p className="page-subtitle">Describe your trading idea — we'll write the Python code for you</p>
          </div>
          <div className="alert alert-info" style={{ maxWidth: 360, fontSize: "0.82rem" }}>
            <Info size={16} style={{ flexShrink: 0 }} />
            <span>
              <strong>Tip:</strong> No coding needed! Just describe what you want in plain English.
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "1fr 1fr", alignItems: "start" }}>
          {/* Left — Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Tabs */}
            <div className="tabs">
              <button className={`tab-btn ${activeTab === "describe" ? "active" : ""}`} onClick={() => setActiveTab("describe")}>
                <Zap size={14} style={{ display: "inline", marginRight: 4 }} /> Describe Strategy
              </button>
              <button className={`tab-btn ${activeTab === "templates" ? "active" : ""}`} onClick={() => setActiveTab("templates")}>
                <BookOpen size={14} style={{ display: "inline", marginRight: 4 }} /> Use Template
              </button>
            </div>

            {activeTab === "describe" ? (
              <div className="card">
                <div style={{ marginBottom: "1rem" }}>
                  <label className="form-label">Your Strategy Description</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: 120, marginTop: "0.4rem" }}
                    placeholder="e.g. Buy when the 20-day moving average crosses above the 50-day moving average, sell when it crosses below..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
                    Be specific about indicators (RSI, MACD, MA), thresholds (30, 70, 20-day), and conditions.
                  </div>
                </div>

                <button
                  className="btn btn-primary w-full"
                  onClick={handleGenerate}
                  disabled={loading || !description.trim()}
                >
                  {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Generating...</> : <><Zap size={16} /> Generate Python Code</>}
                </button>

                {error && (
                  <div className="alert alert-danger" style={{ marginTop: "0.75rem" }}>
                    <Info size={16} /> {error}
                  </div>
                )}

                {/* Example prompts */}
                <div style={{ marginTop: "1.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem", cursor: "pointer" }} onClick={() => setShowTemplates(!showTemplates)}>
                    <Lightbulb size={14} style={{ color: "var(--warning)" }} />
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>Example Prompts</span>
                    {showTemplates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                  {showTemplates && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {EXAMPLE_PROMPTS.map((p, i) => (
                        <button
                          key={i}
                          onClick={() => applyPrompt(p)}
                          style={{
                            background: "var(--bg-tertiary)", border: "1px solid var(--border-color)",
                            borderRadius: 8, padding: "0.6rem 0.85rem", cursor: "pointer",
                            color: "var(--text-secondary)", fontSize: "0.8rem", textAlign: "left",
                            transition: "all 0.15s",
                          }}
                          onMouseOver={e => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; (e.target as HTMLElement).style.color = "var(--text-primary)"; }}
                          onMouseOut={e => { (e.target as HTMLElement).style.borderColor = "var(--border-color)"; (e.target as HTMLElement).style.color = "var(--text-secondary)"; }}
                        >
                          "{p}"
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {templates.length === 0 ? (
                  <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
                    <span className="spinner spinner-lg" style={{ margin: "0 auto" }} />
                    <p style={{ marginTop: "1rem", color: "var(--text-muted)" }}>Loading templates...</p>
                  </div>
                ) : (
                  templates.map(t => (
                    <div key={t.id} className="card card-interactive" style={{ cursor: "pointer" }} onClick={() => applyTemplate(t)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "0.3rem" }}>{t.name}</div>
                          <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{t.description}</div>
                        </div>
                        <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0, marginLeft: "0.75rem" }}>
                          Use
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Right — Generated Code */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="code-block" style={{ flex: 1 }}>
              <div className="code-block-header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span className="code-block-lang">Python</span>
                  {source && (
                    <span className={`badge ${source === "gemini" ? "badge-accent" : "badge-info"}`}>
                      {source === "gemini" ? "🤖 AI Generated" : "📚 Template"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {code && (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={handleCopy}>
                        {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy</>}
                      </button>
                      {user && (
                        <button className="btn btn-secondary btn-sm" onClick={handleSave} disabled={saved}>
                          {saved ? "✓ Saved!" : "Save"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <pre style={{ minHeight: 300, color: code ? "var(--text-primary)" : "var(--text-muted)", fontSize: "0.82rem" }}>
                {code || '# Your generated strategy code will appear here...\n\n# Example:\ndef run_strategy(df):\n    df[\'Buy\']  = df[\'Close\'].rolling(20).mean() > df[\'Close\'].rolling(50).mean()\n    df[\'Sell\'] = ~df[\'Buy\']\n    return df'}
              </pre>
            </div>

            {note && (
              <div className="alert alert-warning">
                <Info size={16} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "0.82rem" }}>{note}</span>
              </div>
            )}

            {code && (
              <div className="card" style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}>
                <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: "0.75rem" }}>
                  <strong>Strategy generated!</strong> Now test it against real NSE/BSE data:
                </p>
                <a href="/backtest" className="btn btn-primary w-full">
                  <PlayCircle size={16} /> Run Backtest on Real Data
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 900px) {
          .builder-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
