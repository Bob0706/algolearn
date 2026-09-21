"use client";
// app/backtest/page.tsx — Strategy Backtester

import { useState, useEffect, useRef } from "react";
import {
  BarChart2, Play, TrendingUp, TrendingDown, Target,
  AlertTriangle, DollarSign, Activity, ArrowUpRight, ArrowDownRight,
  Info, Settings
} from "lucide-react";
import {
  fetchSymbols, fetchStrategyTemplates, runBacktest,
  StockSymbol, StrategyTemplate, BacktestResult, BacktestSummary
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { saveStrategy } from "@/lib/firebase";
import { createChart, IChartApi, ISeriesApi, Time, CandlestickSeries, createSeriesMarkers } from "lightweight-charts";

const PERIODS = [
  { value: "3mo",  label: "3 Months" },
  { value: "6mo",  label: "6 Months" },
  { value: "1y",   label: "1 Year" },
  { value: "2y",   label: "2 Years" },
  { value: "5y",   label: "5 Years" },
];

function SummaryCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string; icon: any; color: string; sub?: string;
}) {
  return (
    <div className="stat-card">
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span className="stat-label">{label}</span>
      </div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color }}>{value}</div>
      {sub && <div className="stat-change">{sub}</div>}
    </div>
  );
}

function LightweightChartComponent({ ohlcv, buySignals, sellSignals }: {
  ohlcv: any[]; buySignals: any[]; sellSignals: any[];
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersPluginRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    if (!chartRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: 'solid', color: 'transparent' } as any,
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: 'rgba(128,128,128,0.1)' },
          horzLines: { color: 'rgba(128,128,128,0.1)' },
        },
        width: chartContainerRef.current.clientWidth,
        height: 300,
        timeScale: {
          timeVisible: true,
          borderColor: 'rgba(128,128,128,0.2)',
        },
        rightPriceScale: {
          borderColor: 'rgba(128,128,128,0.2)',
        }
      });
      const series = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981', downColor: '#ef4444', borderVisible: false,
        wickUpColor: '#10b981', wickDownColor: '#ef4444',
      });
      chartRef.current = chart;
      seriesRef.current = series as any;
      markersPluginRef.current = createSeriesMarkers(series);
      
      const handleResize = () => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
        }
      };
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
        chartRef.current = null;
        seriesRef.current = null;
        markersPluginRef.current = null;
      };
    }
  }, []);

  useEffect(() => {
    if (!seriesRef.current || ohlcv.length === 0) return;
    
    const formattedData = ohlcv.map(d => ({
      time: d.date as string as Time, open: d.open, high: d.high, low: d.low, close: d.close
    }));
    seriesRef.current.setData(formattedData);
    
    const markers: any[] = [];
    buySignals.forEach(sig => {
      markers.push({ time: sig.date as string as Time, position: 'belowBar', color: '#10b981', shape: 'arrowUp', text: 'BUY' });
    });
    sellSignals.forEach(sig => {
      markers.push({ time: sig.date as string as Time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'SELL' });
    });
    
    markers.sort((a, b) => (a.time as string).localeCompare(b.time as string));
    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers(markers);
    }
    
    chartRef.current?.timeScale().fitContent();
  }, [ohlcv, buySignals, sellSignals]);

  return <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }} />;
}

export default function BacktestPage() {
  const { user } = useAuth();
  const [symbols,   setSymbols]   = useState<StockSymbol[]>([]);
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [symbol,    setSymbol]    = useState("RELIANCE.NS");
  const [period,    setPeriod]    = useState("1y");
  const [capital,   setCapital]   = useState(100000);
  const [stratCode, setStratCode] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<BacktestResult | null>(null);
  const [error,    setError]    = useState("");
  const [saved,    setSaved]    = useState(false);
  const [tab,      setTab]      = useState<"chart" | "trades" | "equity">("chart");

  useEffect(() => {
    fetchSymbols()   .then(setSymbols)   .catch(() => {});
    fetchStrategyTemplates().then(t => {
      setTemplates(t);
      if (t.length) { setSelectedTemplate(t[0].id); setStratCode(t[0].code); }
    }).catch(() => {});
  }, []);

  const handleTemplateChange = (id: string) => {
    setSelectedTemplate(id);
    const t = templates.find(x => x.id === id);
    if (t) setStratCode(t.code);
  };

  const handleRun = async () => {
    if (!stratCode.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSaved(false);
    try {
      const res = await runBacktest(symbol, period, stratCode, capital);
      setResult(res);
    } catch (e: any) {
      setError(e.message || "Backtest failed. Make sure the Python backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !result) return;
    const t = templates.find(x => x.id === selectedTemplate);
    await saveStrategy(user.uid, {
      name: t?.name || "Custom Strategy",
      description: t?.description || "",
      code: stratCode,
      symbol,
      backtestResult: result.summary,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const s = result?.summary;
  const isPositive = (s?.total_return_pct ?? 0) >= 0;

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div className="page-header-inner" style={{ marginBottom: "2rem" }}>
          <div>
            <h1 className="page-title">Strategy Backtester</h1>
            <p className="page-subtitle">Test your strategy on real NSE/BSE historical data</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "1.5rem", alignItems: "start" }}>
          {/* ─ Config Panel ── */}
          <div className="card" style={{ position: "sticky", top: 80 }}>
            <h3 className="card-title" style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Settings size={17} style={{ color: "var(--accent)" }} /> Backtest Settings
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label className="form-label">Stock / Index</label>
                <select className="form-select" value={symbol} onChange={e => setSymbol(e.target.value)}>
                  {symbols.length ? symbols.map(s => (
                    <option key={s.symbol} value={s.symbol}>{s.name} ({s.symbol})</option>
                  )) : <option value="RELIANCE.NS">Reliance Industries</option>}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Time Period</label>
                <select className="form-select" value={period} onChange={e => setPeriod(e.target.value)}>
                  {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Starting Capital (₹)</label>
                <input
                  className="form-input"
                  type="number"
                  value={capital}
                  onChange={e => setCapital(Number(e.target.value))}
                  min={10000}
                  step={10000}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Strategy Template</label>
                <select className="form-select" value={selectedTemplate} onChange={e => handleTemplateChange(e.target.value)}>
                  <option value="custom">Custom (edit below)</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Strategy Code</label>
                <textarea
                  className="form-textarea"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", minHeight: 180 }}
                  value={stratCode}
                  onChange={e => setStratCode(e.target.value)}
                  placeholder="Paste your strategy code here or select a template above..."
                />
              </div>

              <button
                className="btn btn-primary w-full"
                onClick={handleRun}
                disabled={loading || !stratCode.trim()}
              >
                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Running Backtest...</> : <><Play size={16} /> Run Backtest</>}
              </button>

              {error && (
                <div className="alert alert-danger" style={{ fontSize: "0.82rem" }}>
                  <AlertTriangle size={16} /> {error}
                </div>
              )}
            </div>
          </div>

          {/* ─ Results Panel ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {!result && !loading && (
              <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
                <BarChart2 size={48} style={{ color: "var(--text-muted)", margin: "0 auto 1rem" }} />
                <h3 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Ready to Backtest</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  Configure your settings and click "Run Backtest" to see results.
                </p>
              </div>
            )}

            {loading && (
              <div className="card" style={{ textAlign: "center", padding: "4rem 2rem" }}>
                <span className="spinner spinner-lg" style={{ margin: "0 auto" }} />
                <p style={{ color: "var(--text-secondary)", marginTop: "1.25rem" }}>
                  Fetching data and running strategy...
                </p>
              </div>
            )}

            {result && (
              <>
                {/* Summary Stats */}
                <div className="stats-grid">
                  <SummaryCard
                    label="Total Return"
                    value={`${s!.total_return_pct >= 0 ? "+" : ""}${s!.total_return_pct.toFixed(2)}%`}
                    icon={isPositive ? TrendingUp : TrendingDown}
                    color={isPositive ? "var(--success)" : "var(--danger)"}
                    sub={`₹${s!.initial_capital.toLocaleString("en-IN")} → ₹${s!.final_value.toLocaleString("en-IN")}`}
                  />
                  <SummaryCard
                    label="Max Drawdown"
                    value={`-${s!.max_drawdown_pct.toFixed(2)}%`}
                    icon={AlertTriangle}
                    color="var(--warning)"
                    sub="Worst peak-to-trough loss"
                  />
                  <SummaryCard
                    label="Win Rate"
                    value={`${s!.win_rate_pct.toFixed(1)}%`}
                    icon={Target}
                    color="var(--info)"
                    sub={`${s!.winning_trades} wins / ${s!.total_trades} total`}
                  />
                  <SummaryCard
                    label="Final Portfolio"
                    value={`₹${(s!.final_value / 1000).toFixed(1)}K`}
                    icon={DollarSign}
                    color="var(--success)"
                    sub={`${s!.total_trades} total trades`}
                  />
                </div>

                {/* Rating */}
                <div className="card" style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <Activity size={20} style={{ color: "var(--accent)" }} />
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: "0.2rem" }}>Strategy Rating</div>
                    <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                      {[
                        { label: "Return",   ok: s!.total_return_pct > 15,  val: `${s!.total_return_pct > 0 ? "+" : ""}${s!.total_return_pct.toFixed(1)}%` },
                        { label: "Drawdown", ok: s!.max_drawdown_pct < 30,  val: `-${s!.max_drawdown_pct.toFixed(1)}%` },
                        { label: "Win Rate", ok: s!.win_rate_pct > 50,      val: `${s!.win_rate_pct.toFixed(1)}%` },
                      ].map(x => (
                        <div key={x.label} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          {x.ok ? <ArrowUpRight size={14} style={{ color: "var(--success)" }} /> : <ArrowDownRight size={14} style={{ color: "var(--danger)" }} />}
                          <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{x.label}:</span>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: x.ok ? "var(--success)" : "var(--danger)" }}>{x.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {user && (
                    <button className="btn btn-secondary btn-sm" onClick={handleSave} disabled={saved} style={{ marginLeft: "auto" }}>
                      {saved ? "✓ Saved!" : "Save Strategy"}
                    </button>
                  )}
                </div>

                {/* Chart / Trades / Equity Tabs */}
                <div className="chart-container">
                  <div className="chart-header">
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{symbol} — {period} Backtest</span>
                    <div className="tabs" style={{ padding: "0.15rem", gap: "0.15rem" }}>
                      {(["chart", "trades", "equity"] as const).map(t => (
                        <button key={t} className={`tab-btn ${tab === t ? "active" : ""}`} style={{ padding: "0.3rem 0.75rem" }} onClick={() => setTab(t)}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: "1rem" }}>
                    {tab === "chart" && (
                      <div style={{ height: 300, position: "relative" }}>
                        <LightweightChartComponent ohlcv={result.ohlcv} buySignals={result.buy_signals} sellSignals={result.sell_signals} />
                        <div style={{ display: "flex", gap: "1.25rem", marginTop: "0.75rem", fontSize: "0.78rem" }}>
                          <span>🟢 Buy Signal ({result.buy_signals.length})</span>
                          <span>🔴 Sell Signal ({result.sell_signals.length})</span>
                        </div>
                      </div>
                    )}
                    {tab === "trades" && (
                      <div style={{ maxHeight: 350, overflowY: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                              {["Date", "Type", "Price", "Shares", "Value"].map(h => (
                                <th key={h} style={{ padding: "0.5rem", textAlign: "left", color: "var(--text-muted)", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.trades.map((tr, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                                <td style={{ padding: "0.5rem" }}>{tr.date}</td>
                                <td style={{ padding: "0.5rem" }}>
                                  <span className={`badge ${tr.type === "BUY" ? "badge-success" : "badge-danger"}`}>{tr.type}</span>
                                </td>
                                <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>₹{tr.price.toFixed(2)}</td>
                                <td style={{ padding: "0.5rem" }}>{tr.shares}</td>
                                <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>₹{tr.value.toFixed(0)}</td>
                              </tr>
                            ))}
                            {!result.trades.length && (
                              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No trades generated.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {tab === "equity" && (
                      <div style={{ height: 300, position: "relative" }}>
                        <EquityCurveChart data={result.equity_curve} />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EquityCurveChart({ data }: { data: { date: string; equity: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width  = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const equities = data.map(d => d.equity);
    const minE = Math.min(...equities);
    const maxE = Math.max(...equities);
    const range = maxE - minE || 1;
    const pad   = 30;

    const xScale = (i: number) => pad + (i / (data.length - 1)) * (W - 2 * pad);
    const yScale = (e: number) => H - pad - ((e - minE) / range) * (H - 2 * pad);

    // Fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "rgba(16,185,129,0.3)");
    grad.addColorStop(1, "rgba(16,185,129,0)");
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = xScale(i);
      const y = yScale(d.equity);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(xScale(data.length - 1), H - pad);
    ctx.lineTo(xScale(0), H - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth   = 2;
    data.forEach((d, i) => {
      const x = xScale(i);
      const y = yScale(d.equity);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}
