"use client";
// app/backtest/page.tsx — run strategy code on historical NSE/BSE data

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, BarChart2, Cpu, IndianRupee, Info, Play, Settings, Target, TrendingDown, TrendingUp,
} from "lucide-react";
import { ApiError, fetchStrategyTemplates, runBacktest, saveMyStrategy } from "@/lib/api";
import type { BacktestResult, StrategyTemplate } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { takeHandoff } from "@/lib/handoff";
import CandleChart, { ChartMarker } from "@/components/CandleChart";
import LedgerReceipts from "@/components/LedgerReceipts";
import DataSourceBanner from "@/components/DataSourceBanner";
import SymbolSearch from "@/components/SymbolSearch";
import LiveQuote from "@/components/LiveQuote";

const PERIODS = [
  { value: "6mo", label: "6 months" },
  { value: "1y", label: "1 year" },
  { value: "2y", label: "2 years" },
  { value: "5y", label: "5 years" },
];

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const inr = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function Stat({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="stat-card">
      <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.4rem" }}>
        <Icon size={15} style={{ color }} /> <span className="stat-label">{label}</span>
      </div>
      <div style={{ fontSize: "1.4rem", fontWeight: 800, color }}>{value}</div>
      {sub && <div className="stat-change">{sub}</div>}
    </div>
  );
}

export default function BacktestPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [period, setPeriod] = useState("1y");
  const [capital, setCapital] = useState(100000);
  const [includeCosts, setIncludeCosts] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [code, setCode] = useState("");
  const [strategyName, setStrategyName] = useState("Custom strategy");
  const [fromBuilder, setFromBuilder] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<{ message: string; errors?: string[]; logs?: string[] } | null>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"chart" | "equity" | "trades">("chart");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("symbol");
    if (fromUrl) setSymbol(fromUrl.toUpperCase());
    const handoff = takeHandoff();
    fetchStrategyTemplates().then(ts => {
      setTemplates(ts);
      if (!handoff && ts.length) {
        setTemplateId(ts[0].id);
        setCode(ts[0].code);
        setStrategyName(ts[0].name);
      }
    }).catch(() => setTemplates([]));
    if (handoff) {
      setCode(handoff.code);
      setStrategyName(handoff.name || handoff.description?.slice(0, 60) || "Custom strategy");
      setTemplateId("custom");
      setFromBuilder(true);
    }
  }, []);

  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (t) { setCode(t.code); setStrategyName(t.name); }
  };

  const run = async () => {
    setLoading(true); setError(null); setResult(null); setSaved(false);
    try {
      setResult(await runBacktest({ symbol, period, strategy_code: code, initial_capital: capital, include_costs: includeCosts }));
      setTab("chart");
    } catch (e) {
      setError(e instanceof ApiError ? { message: e.message, errors: e.errors, logs: e.logs } : { message: "Backtest failed." });
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!user || !result) return;
    const bt = result.ledger?.find(r => r.kind === "BACKTEST");
    setError(null);
    try {
      const metrics = Object.fromEntries(Object.entries(result.summary).filter(([, v]) => typeof v === "number")) as Record<string, number>;
      await saveMyStrategy({ name: strategyName, description: "", code, symbol, backtestResult: metrics, ledgerId: bt?.id });
      setSaved(true);
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "Could not save the strategy." });
    }
  };

  const markers = useMemo<ChartMarker[]>(() => !result ? [] : [
    ...result.trades.map(t => ({
      date: t.date,
      position: (t.type === "BUY" ? "belowBar" : "aboveBar") as ChartMarker["position"],
      color: t.type === "BUY" ? "#10b981" : "#ef4444",
      shape: (t.type === "BUY" ? "arrowUp" : "arrowDown") as ChartMarker["shape"],
      text: `${t.type} @ ${t.price.toFixed(0)}`,
    })),
  ], [result]);

  const s = result?.summary;
  const beatBenchmark = s ? s.total_return_pct > s.buy_hold_return_pct : false;

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div className="page-header-inner" style={{ marginBottom: "1.5rem" }}>
          <div>
            <h1 className="page-title">Strategy Backtester</h1>
            <p className="page-subtitle">Runs your exact Python code on historical NSE/BSE data, with realistic fills and Indian trading charges.</p>
          </div>
        </div>

        <div className="sidebar-layout">
          {/* settings */}
          <div className="card" style={{ position: "sticky", top: 76 }}>
            <h2 className="card-title" style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <Settings size={17} style={{ color: "var(--accent)" }} /> Settings
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
              <SymbolSearch id="sym" value={symbol} onChange={setSymbol} />
              <LiveQuote symbol={symbol} />
              <div className="grid-2" style={{ gap: "0.6rem" }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="per">Period</label>
                  <select id="per" className="form-select" value={period} onChange={e => setPeriod(e.target.value)}>
                    {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="cap">Capital (₹)</label>
                  <input id="cap" className="form-input" type="number" min={1000} step={10000} value={capital} onChange={e => setCapital(Number(e.target.value))} />
                </div>
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={includeCosts} onChange={e => setIncludeCosts(e.target.checked)} />
                Include brokerage, STT, stamp duty & slippage
              </label>
              <div className="form-group">
                <label className="form-label" htmlFor="tpl">Strategy</label>
                <select id="tpl" className="form-select" value={templateId} onChange={e => chooseTemplate(e.target.value)}>
                  <option value="custom">{fromBuilder ? "From Strategy Builder" : "Custom (edit below)"}</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="code">Python code</label>
                <textarea id="code" className="form-textarea mono" spellCheck={false} style={{ fontSize: "0.75rem", minHeight: 220 }}
                  value={code} onChange={e => { setCode(e.target.value); setTemplateId("custom"); }}
                  placeholder="def run_strategy(df): ..." />
              </div>
              <button className="btn btn-primary w-full" onClick={run} disabled={loading || !code.trim()}>
                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Running…</> : <><Play size={16} /> Run backtest</>}
              </button>
              {error && (
                <div className="alert alert-danger small" style={{ flexDirection: "column" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}><AlertTriangle size={16} style={{ flexShrink: 0 }} /> {error.message}</div>
                  {error.errors?.filter(x => x && x !== error.message).map(x => <div key={x} className="mono" style={{ fontSize: "0.72rem" }}>• {x}</div>)}
                  {!!error.logs?.length && <pre className="mono" style={{ fontSize: "0.7rem", whiteSpace: "pre-wrap" }}>{error.logs.join("\n")}</pre>}
                </div>
              )}
            </div>
          </div>

          {/* results */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}>
            {!result && !loading && (
              <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
                <BarChart2 size={44} style={{ color: "var(--text-muted)", margin: "0 auto 1rem" }} />
                <h3 style={{ fontWeight: 700 }}>Ready to backtest</h3>
                <p className="muted small" style={{ marginTop: "0.4rem" }}>Choose a stock and strategy, then press Run backtest.</p>
              </div>
            )}
            {loading && (
              <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
                <span className="spinner spinner-lg" style={{ margin: "0 auto" }} />
                <p className="muted" style={{ marginTop: "1rem" }}>Fetching data, running your code in the sandbox, checking for look-ahead bias…</p>
              </div>
            )}

            {result && s && (
              <>
                <DataSourceBanner source={result.meta.data_source} />
                {result.meta.warnings.filter(w => !w.includes("SYNTHETIC")).map(w => (
                  <div key={w} className={`alert ${w.startsWith("Look-ahead") ? "alert-danger" : "alert-warning"} small`}>
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} /> {w}
                  </div>
                ))}

                <div className="stats-grid">
                  <Stat label="Strategy return" value={pct(s.total_return_pct)} icon={s.total_return_pct >= 0 ? TrendingUp : TrendingDown}
                    color={s.total_return_pct >= 0 ? "var(--success)" : "var(--danger)"} sub={`${inr(s.initial_capital)} → ${inr(s.final_value)}`} />
                  <Stat label="Buy & hold" value={pct(s.buy_hold_return_pct)} icon={Activity} color="var(--info)"
                    sub={beatBenchmark ? "Strategy beat buy & hold" : "Strategy did not beat buy & hold"} />
                  <Stat label="Max drawdown" value={`-${s.max_drawdown_pct.toFixed(2)}%`} icon={AlertTriangle} color="var(--warning)" sub={`Sharpe ${s.sharpe_ratio.toFixed(2)} · CAGR ${pct(s.cagr_pct)}`} />
                  <Stat label="Win rate" value={s.closed_trades ? `${s.win_rate_pct.toFixed(1)}%` : "—"} icon={Target} color="var(--accent)"
                    sub={`${s.winning_trades} of ${s.closed_trades} closed trades · in market ${s.exposure_pct.toFixed(0)}%`} />
                  <Stat label="Charges paid" value={inr(s.total_costs)} icon={IndianRupee} color="var(--text-secondary)"
                    sub={s.open_pnl ? `Open position P&L ${inr(s.open_pnl)}` : `${s.total_trades} orders`} />
                </div>

                <div className="chart-container">
                  <div className="chart-header">
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                      {result.meta.symbol} · {result.ohlcv[0].date} → {result.ohlcv[result.ohlcv.length - 1].date}
                    </span>
                    <div className="tabs">
                      {(["chart", "equity", "trades"] as const).map(t => (
                        <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                          {t === "chart" ? "Price & trades" : t === "equity" ? "Equity vs buy & hold" : `Trades (${result.trades.length})`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: "1rem" }}>
                    {tab === "chart" && <CandleChart bars={result.ohlcv} markers={markers} />}
                    {tab === "equity" && <EquityChart data={result.equity_curve} />}
                    {tab === "trades" && (
                      <div className="table-wrap" style={{ maxHeight: 380 }}>
                        <table className="table">
                          <thead><tr><th>Date (fill)</th><th>Side</th><th>Price</th><th>Shares</th><th>Value</th><th>Charges</th><th>P&L</th></tr></thead>
                          <tbody>
                            {result.trades.map((t, i) => (
                              <tr key={i}>
                                <td>{t.date}</td>
                                <td><span className={`badge ${t.type === "BUY" ? "badge-success" : "badge-danger"}`}>{t.type}</span></td>
                                <td>₹{t.price.toFixed(2)}</td><td>{t.shares}</td><td>{inr(t.value)}</td><td>₹{t.costs.toFixed(2)}</td>
                                <td className={t.pnl === undefined ? "" : t.pnl >= 0 ? "positive" : "negative"}>{t.pnl === undefined ? "" : inr(t.pnl)}</td>
                              </tr>
                            ))}
                            {!result.trades.length && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: "2rem" }}>No trades.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card" style={{ padding: "1rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.6rem" }}>
                    <Cpu size={15} style={{ color: "var(--accent)" }} />
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>How this was computed</span>
                    <span className="badge badge-accent">{result.meta.engine === "python-sandbox" ? "Your Python code (sandbox)" : `Native template: ${result.meta.template_id}`}</span>
                    <span className={`badge ${result.meta.data_source === "synthetic" ? "badge-warning" : "badge-success"}`}>{result.meta.data_source === "synthetic" ? "Synthetic data" : `Real market data (${result.meta.data_source === "upstox" ? "Upstox exchange feed" : "Yahoo Finance"})`}</span>
                    {result.meta.lookahead.checked && (
                      <span className={`badge ${result.meta.lookahead.uses_future_data ? "badge-danger" : "badge-success"}`}>
                        {result.meta.lookahead.uses_future_data ? "Uses future data" : "No look-ahead detected"}
                      </span>
                    )}
                    {user ? <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={save} disabled={saved}>{saved ? "Saved ✓" : "Save to dashboard"}</button> : <Link href="/login?next=/backtest" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }}>Log in to save</Link>}
                  </div>
                  <ul className="small" style={{ color: "var(--text-secondary)", paddingLeft: "1.1rem" }}>
                    {result.meta.assumptions.map(a => <li key={a}>{a}</li>)}
                  </ul>
                  {!!result.meta.logs.length && (
                    <details style={{ marginTop: "0.6rem" }}>
                      <summary className="small" style={{ cursor: "pointer" }}><Info size={12} style={{ display: "inline" }} /> print() output from your strategy</summary>
                      <pre className="mono" style={{ fontSize: "0.72rem", marginTop: "0.4rem", whiteSpace: "pre-wrap" }}>{result.meta.logs.join("\n")}</pre>
                    </details>
                  )}
                </div>

                <LedgerReceipts receipts={result.ledger ?? []} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EquityChart({ data }: { data: { date: string; equity: number; benchmark: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || data.length < 2) return;
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const all = data.flatMap(d => [d.equity, d.benchmark]);
      const min = Math.min(...all), max = Math.max(...all), range = max - min || 1, pad = 28;
      const x = (i: number) => pad + (i / (data.length - 1)) * (W - 2 * pad);
      const y = (v: number) => H - pad - ((v - min) / range) * (H - 2 * pad);
      const muted = getComputedStyle(document.documentElement).getPropertyValue("--text-muted").trim();
      ctx.fillStyle = muted; ctx.font = "11px Inter, sans-serif";
      ctx.fillText(`₹${Math.round(max).toLocaleString("en-IN")}`, 4, pad - 8);
      ctx.fillText(`₹${Math.round(min).toLocaleString("en-IN")}`, 4, H - 8);
      const line = (key: "equity" | "benchmark", color: string, dash: number[]) => {
        ctx.beginPath(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = 2;
        data.forEach((d, i) => (i ? ctx.lineTo(x(i), y(d[key])) : ctx.moveTo(x(i), y(d[key]))));
        ctx.stroke();
      };
      line("benchmark", "#38bdf8", [5, 4]);
      line("equity", "#10b981", []);
      ctx.setLineDash([]);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [data]);
  return (
    <div>
      <canvas ref={ref} style={{ width: "100%", height: 320, display: "block" }} aria-label="Equity curve versus buy and hold" />
      <div className="small" style={{ display: "flex", gap: "1.25rem", marginTop: "0.5rem" }}>
        <span style={{ color: "#10b981", fontWeight: 600 }}>━ Strategy</span>
        <span style={{ color: "#38bdf8", fontWeight: 600 }}>┅ Buy & hold</span>
      </div>
    </div>
  );
}
