"use client";
// app/simulator/page.tsx — Trade Simulator with Candlestick Pattern Analysis

import { useState, useEffect, useRef } from "react";
import {
  Gamepad2, Play, Pause, SkipForward, TrendingUp, TrendingDown,
  RotateCcw, Info, AlertCircle, Activity, Zap, ArrowUpCircle, ArrowDownCircle,
} from "lucide-react";
import { fetchSymbols, fetchStockData, OHLCVBar, StockSymbol } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { updateSimulatorStats } from "@/lib/firebase";
import {
  createChart, IChartApi, ISeriesApi, Time, CandlestickSeries, createSeriesMarkers,
} from "lightweight-charts";
import Web3Connect from "@/components/Web3Connect";

const INITIAL_CAPITAL = 100000;

interface Position    { shares: number; avgPrice: number }
interface TradeRecord { date: string; type: "BUY" | "SELL"; price: number; shares: number; pnl?: number }
interface CandleSignal { date: string; type: "BUY" | "SELL"; pattern: string; strength: "STRONG" | "MODERATE" }

// ─── Candlestick Pattern Analysis Engine ──────────────────────────────────
function analyzeCandlePatterns(data: OHLCVBar[]): CandleSignal[] {
  const signals: CandleSignal[] = [];
  if (data.length < 3) return signals;

  let lastSignalType: "BUY" | "SELL" | null = null;

  for (let i = 2; i < data.length; i++) {
    const c  = data[i];
    const p  = data[i - 1];
    const pp = data[i - 2];

    const bodyC  = Math.abs(c.close - c.open);
    const bodyP  = Math.abs(p.close - p.open);
    const bodyPP = Math.abs(pp.close - pp.open);
    const rangeC = c.high - c.low || 0.001;
    const rangeP = p.high - p.low || 0.001;

    const bullC = c.close > c.open;
    const bearC = c.close < c.open;
    const bullP = p.close > p.open;
    const bearP = p.close < p.open;

    let type: "BUY" | "SELL" | null = null;
    let pattern = "";
    let strength: "STRONG" | "MODERATE" = "MODERATE";

    // ── BULLISH ──────────────────────────────────────
    if (!type && bearP && bullC && c.open <= p.close && c.close >= p.open && bodyC > bodyP * 1.05) {
      type = "BUY"; pattern = "Bullish Engulfing"; strength = "STRONG";
    }
    if (!type && bodyC > 0 && bullC &&
      (c.low < Math.min(c.open, c.close) - bodyC * 1.5) &&
      (c.high - Math.max(c.open, c.close)) < bodyC * 0.5 && bearP) {
      type = "BUY"; pattern = "Hammer";
    }
    if (!type && bearP && bodyP > bodyPP * 1.2 && bullC &&
      c.close > (pp.open + pp.close) / 2 && bodyPP < bodyP * 0.6) {
      type = "BUY"; pattern = "Morning Star"; strength = "STRONG";
    }
    if (!type && bearP && bullC && c.open < p.close &&
      c.close > (p.open + p.close) / 2 && c.close < p.open) {
      type = "BUY"; pattern = "Piercing Line";
    }
    if (!type && bullC && bullP && pp.close > pp.open &&
      p.close > pp.close && c.close > p.close &&
      bodyC > rangeC * 0.55 && bodyP > rangeP * 0.55) {
      type = "BUY"; pattern = "Three White Soldiers"; strength = "STRONG";
    }
    // Doji after downtrend (reversal)
    if (!type && bearP && bodyC < rangeC * 0.15 && bodyP > rangeP * 0.4) {
      type = "BUY"; pattern = "Doji Reversal";
    }

    // ── BEARISH ──────────────────────────────────────
    if (!type && bullP && bearC && c.open >= p.close && c.close <= p.open && bodyC > bodyP * 1.05) {
      type = "SELL"; pattern = "Bearish Engulfing"; strength = "STRONG";
    }
    if (!type && bodyC > 0 && bearC &&
      (c.high > Math.max(c.open, c.close) + bodyC * 1.5) &&
      (Math.min(c.open, c.close) - c.low) < bodyC * 0.5 && bullP) {
      type = "SELL"; pattern = "Shooting Star";
    }
    if (!type && bullP && bodyP > bodyPP * 1.2 && bearC &&
      c.close < (pp.open + pp.close) / 2 && bodyPP < bodyP * 0.6) {
      type = "SELL"; pattern = "Evening Star"; strength = "STRONG";
    }
    if (!type && bullP && bearC && c.open > p.close &&
      c.close < (p.open + p.close) / 2 && c.close > p.open) {
      type = "SELL"; pattern = "Dark Cloud Cover";
    }
    if (!type && bearC && bearP && pp.close < pp.open &&
      p.close < pp.close && c.close < p.close &&
      bodyC > rangeC * 0.55 && bodyP > rangeP * 0.55) {
      type = "SELL"; pattern = "Three Black Crows"; strength = "STRONG";
    }
    // Doji after uptrend (reversal)
    if (!type && bullP && bodyC < rangeC * 0.15 && bodyP > rangeP * 0.4) {
      type = "SELL"; pattern = "Doji Reversal";
    }

    // Strict alternation: BUY only if last != BUY; SELL only if last == BUY
    if (type) {
      const ok =
        (type === "BUY"  && lastSignalType !== "BUY") ||
        (type === "SELL" && lastSignalType === "BUY");
      if (ok) {
        signals.push({ date: c.date, type, pattern, strength });
        lastSignalType = type;
      }
    }
  }

  return signals;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function SimulatorPage() {
  const { user } = useAuth();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef          = useRef<IChartApi | null>(null);
  const seriesRef         = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef        = useRef<any>(null);

  const [symbols,   setSymbols]   = useState<StockSymbol[]>([]);
  const [symbol,    setSymbol]    = useState("RELIANCE.NS");
  const [period,    setPeriod]    = useState("1y");
  const [allData,   setAllData]   = useState<OHLCVBar[]>([]);
  const [signals,   setSignals]   = useState<CandleSignal[]>([]);
  const [cursor,    setCursor]    = useState(50);
  const [playing,   setPlaying]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [started,   setStarted]   = useState(false);
  const [finished,  setFinished]  = useState(false);
  const [error,     setError]     = useState("");

  const [cash,      setCash]      = useState(INITIAL_CAPITAL);
  const [position,  setPosition]  = useState<Position | null>(null);
  const [trades,    setTrades]    = useState<TradeRecord[]>([]);
  const [shares,    setShares]    = useState(10);

  const visibleData    = allData.slice(0, cursor);
  const currentBar     = allData[cursor - 1];
  const currentPrice   = currentBar?.close ?? 0;
  const portfolioValue = cash + (position ? position.shares * currentPrice : 0);
  const totalPnL       = portfolioValue - INITIAL_CAPITAL;
  const totalReturn    = (totalPnL / INITIAL_CAPITAL) * 100;

  // Find the most recent signal within the last 5 visible bars
  const recentSignal: CandleSignal | null = (() => {
    const last5 = visibleData.slice(-5).map(d => d.date);
    for (let i = last5.length - 1; i >= 0; i--) {
      const sig = signals.find(s => s.date === last5[i]);
      if (sig) {
        if (sig.type === "BUY" && !position) return sig;
        if (sig.type === "SELL" && position)  return sig;
      }
    }
    return null;
  })();

  useEffect(() => {
    fetchSymbols().then(setSymbols).catch(() => {});
  }, []);

  // ── Session isolation: reset simulator when user changes (login/logout) ────
  useEffect(() => {
    resetAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const loadData = async () => {
    setLoading(true); setError("");
    try {
      const data = await fetchStockData(symbol, period);
      if (data.length < 60) throw new Error("Not enough historical data.");
      const sigs = analyzeCandlePatterns(data);
      setAllData(data);
      setSignals(sigs);
      setCash(INITIAL_CAPITAL); setPosition(null); setTrades([]);
      setPlaying(false); setCursor(50); setStarted(true); setFinished(false);
    } catch (e: any) {
      setError(e.message || "Failed to load data. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setStarted(false); setFinished(false); setCash(INITIAL_CAPITAL);
    setPosition(null); setTrades([]); setPlaying(false);
    setCursor(50); setAllData([]); setSignals([]);
  };

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCursor(prev => {
        if (prev >= allData.length) { setPlaying(false); setFinished(true); return prev; }
        return prev + 1;
      });
    }, 350);
    return () => clearInterval(id);
  }, [playing, allData.length]);

  const handleBuy = () => {
    if (!currentPrice || shares <= 0) return;
    const cost = shares * currentPrice;
    if (cost > cash) { alert("Not enough cash!"); return; }
    setCash(c => c - cost);
    setPosition(p => p
      ? { shares: p.shares + shares, avgPrice: (p.avgPrice * p.shares + cost) / (p.shares + shares) }
      : { shares, avgPrice: currentPrice }
    );
    setTrades(t => [...t, { date: currentBar.date, type: "BUY", price: currentPrice, shares }]);
  };

  const handleSell = () => {
    if (!position || !currentPrice) return;
    const s2    = Math.min(shares, position.shares);
    const pnl   = (currentPrice - position.avgPrice) * s2;
    setCash(c => c + s2 * currentPrice);
    setPosition(p => {
      if (!p) return null;
      const rem = p.shares - s2;
      return rem > 0 ? { ...p, shares: rem } : null;
    });
    setTrades(t => [...t, { date: currentBar.date, type: "SELL", price: currentPrice, shares: s2, pnl }]);
  };

  useEffect(() => {
    if (!finished || !user) return;
    const wins   = trades.filter(t => t.type === "SELL" && (t.pnl ?? 0) > 0).length;
    const losses = trades.filter(t => t.type === "SELL" && (t.pnl ?? 0) < 0).length;
    updateSimulatorStats(user.uid, { totalTrades: trades.length, wins, losses, totalPnL }).catch(() => {});
  }, [finished]);

  // ── Init chart once ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!started || !chartContainerRef.current || chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: "solid", color: "#0f172a" } as any, textColor: "#94a3b8" },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      width: chartContainerRef.current.clientWidth,
      height: 420,
      timeScale: { timeVisible: true, borderColor: "#334155" },
      rightPriceScale: { borderColor: "#334155" },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981", downColor: "#ef4444",
      wickUpColor: "#10b981", wickDownColor: "#ef4444",
      borderVisible: false,
    });

    markersRef.current = createSeriesMarkers(series);
    seriesRef.current  = series as any;
    chartRef.current   = chart;

    const onResize = () => {
      if (chartContainerRef.current && chartRef.current)
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
      chartRef.current = null; seriesRef.current = null; markersRef.current = null;
    };
  }, [started]);

  // ── Update chart data + markers whenever cursor or trades change ──────────
  useEffect(() => {
    if (!seriesRef.current || visibleData.length === 0) return;

    // Set OHLCV data
    seriesRef.current.setData(
      visibleData.map(d => ({ time: d.date as Time, open: d.open, high: d.high, low: d.low, close: d.close }))
    );

    const markers: any[] = [];

    // System signals — only those within visible range
    signals.forEach(sig => {
      if (!visibleData.some(d => d.date === sig.date)) return;
      markers.push({
        time:     sig.date as Time,
        position: sig.type === "BUY" ? "belowBar" : "aboveBar",
        color:    sig.type === "BUY" ? "#60a5fa" : "#fb923c",
        shape:    sig.type === "BUY" ? "arrowUp"  : "arrowDown",
        text:     sig.type === "BUY"
          ? `BUY: ${sig.pattern}`
          : `SELL: ${sig.pattern}`,
      });
    });

    // User trades
    trades.forEach(tr => {
      markers.push({
        time:     tr.date as Time,
        position: tr.type === "BUY" ? "belowBar" : "aboveBar",
        color:    tr.type === "BUY" ? "#10b981" : "#ef4444",
        shape:    "circle",
        text:     `You: ${tr.type}`,
      });
    });

    markers.sort((a, b) => (a.time as string).localeCompare(b.time as string));
    markersRef.current?.setMarkers(markers);
    chartRef.current?.timeScale().scrollToRealTime();
  }, [cursor, trades, signals]);

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="page">
        <div className="container" style={{ paddingTop: "2rem" }}>
          <div className="page-header-inner" style={{ marginBottom: "2rem" }}>
            <h1 className="page-title">Trade Simulator</h1>
            <p className="page-subtitle">Practice buy/sell on real past data. AI analyses candlestick patterns in real-time.</p>
          </div>

          <div style={{ maxWidth: 520, margin: "0 auto" }}>
            <div className="card">
              <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
                <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--accent-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 0.75rem" }}>
                  <Gamepad2 size={26} style={{ color: "var(--accent)" }} />
                </div>
                <h2 style={{ fontWeight: 800, marginBottom: "0.4rem" }}>Paper Trading Simulator</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem" }}>
                  Chart revealed one candle at a time. The system watches for patterns and signals you when to act.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                <div className="form-group">
                  <label className="form-label">Stock</label>
                  <select className="form-select" value={symbol} onChange={e => setSymbol(e.target.value)}>
                    {symbols.map(s => <option key={s.symbol} value={s.symbol}>{s.name} ({s.symbol})</option>)}
                    {!symbols.length && <option value="RELIANCE.NS">Reliance Industries</option>}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Period</label>
                  <select className="form-select" value={period} onChange={e => setPeriod(e.target.value)}>
                    <option value="6mo">6 Months</option>
                    <option value="1y">1 Year</option>
                    <option value="2y">2 Years</option>
                  </select>
                </div>
              </div>

              <div className="alert alert-info" style={{ marginTop: "1rem", fontSize: "0.82rem" }}>
                <Activity size={14} style={{ flexShrink: 0 }} />
                <div>
                  <strong>Patterns detected:</strong> Bullish/Bearish Engulfing, Hammer, Shooting Star, Morning/Evening Star, Piercing Line, Dark Cloud Cover, Three Soldiers/Crows, Doji Reversal.
                </div>
              </div>

              {error && <div className="alert alert-danger" style={{ marginTop: "0.75rem" }}><AlertCircle size={16} /> {error}</div>}

              <button className="btn btn-primary w-full" style={{ marginTop: "1.25rem" }} onClick={loadData} disabled={loading}>
                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Analysing patterns...</> : <><Play size={16} /> Start Simulation</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Simulation screen ─────────────────────────────────────────────────────
  const sigCount  = signals.filter(s => visibleData.some(d => d.date === s.date)).length;

  return (
    <div className="page">
      <div style={{ padding: "1rem 1.5rem 2rem" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <div>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 800 }}>Simulator — {symbol}</h1>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Bar {cursor} / {allData.length} &bull; {currentBar?.date} &bull; {sigCount} pattern{sigCount !== 1 ? "s" : ""} detected so far
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setPlaying(!playing)} disabled={finished}>
              {playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => !finished && setCursor(c => Math.min(c + 1, allData.length))} disabled={finished}>
              <SkipForward size={14} /> Next
            </button>
            <button className="btn btn-ghost btn-sm" onClick={resetAll}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {/* ── Signal Banner ── */}
        {recentSignal ? (
          <div style={{
            marginBottom: "0.75rem",
            padding: "0.9rem 1.25rem",
            borderRadius: "12px",
            display: "flex", alignItems: "center", gap: "1rem",
            background: recentSignal.type === "BUY"
              ? "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(59,130,246,0.12))"
              : "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(245,158,11,0.12))",
            border: `2px solid ${recentSignal.type === "BUY" ? "#10b981" : "#ef4444"}`,
            boxShadow: `0 0 20px ${recentSignal.type === "BUY" ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
          }}>
            {recentSignal.type === "BUY"
              ? <ArrowUpCircle size={40} style={{ color: "#10b981", flexShrink: 0 }} />
              : <ArrowDownCircle size={40} style={{ color: "#ef4444", flexShrink: 0 }} />
            }
            <div>
              <div style={{
                fontSize: "1.35rem", fontWeight: 900, letterSpacing: "0.04em",
                color: recentSignal.type === "BUY" ? "#10b981" : "#ef4444",
              }}>
                {recentSignal.type === "BUY" ? "SYSTEM SIGNAL: BUY" : "SYSTEM SIGNAL: SELL"}
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                <Zap size={12} style={{ display: "inline", marginRight: 4 }} />
                Pattern: <strong style={{ color: "var(--text-primary)" }}>{recentSignal.pattern}</strong>
                &nbsp;&bull;&nbsp;
                <span style={{ color: recentSignal.strength === "STRONG" ? "#f59e0b" : "var(--text-muted)", fontWeight: 600 }}>
                  {recentSignal.strength}
                </span>
                &nbsp;&bull;&nbsp; Seen on candle: {visibleData.slice(-5).find(d => signals.find(s => s.date === d.date && s.type === recentSignal.type))?.date}
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            marginBottom: "0.75rem", padding: "0.5rem 0.9rem", borderRadius: "8px",
            background: "rgba(148,163,184,0.06)", border: "1px solid var(--border-color)",
            fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", gap: "0.5rem", alignItems: "center",
          }}>
            <Activity size={13} /> Watching for patterns&hellip; Blue arrows = System BUY &bull; Orange arrows = System SELL
          </div>
        )}

        {/* Portfolio bar */}
        <div className="portfolio-bar" style={{ marginBottom: "0.75rem" }}>
          {[
            { label: "Portfolio",  val: `₹${portfolioValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, color: "var(--text-primary)" },
            { label: "Cash",       val: `₹${cash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,           color: "var(--text-primary)" },
            { label: "P&L",        val: `${totalPnL >= 0 ? "+" : ""}₹${totalPnL.toFixed(0)}`,                       color: totalPnL >= 0 ? "var(--success)" : "var(--danger)" },
            { label: "Return",     val: `${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(2)}%`,                  color: totalReturn >= 0 ? "var(--success)" : "var(--danger)" },
            { label: "Holding",    val: position ? `${position.shares} sh @ ₹${position.avgPrice.toFixed(0)}` : "None", color: "var(--text-secondary)" },
            { label: "Price",      val: `₹${currentPrice.toFixed(2)}`,                                               color: "var(--accent)" },
          ].map(item => (
            <div key={item.label} className="portfolio-item">
              <span className="portfolio-label">{item.label}</span>
              <span className="portfolio-val" style={{ color: item.color, fontSize: "0.88rem" }}>{item.val}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "1rem", alignItems: "start" }}>
          {/* Chart */}
          <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border-color)", background: "#0f172a" }}>
            <div ref={chartContainerRef} style={{ width: "100%", height: 420 }} />
            {/* Slider */}
            <div style={{ padding: "0.6rem 1rem 0.4rem", background: "#0f172a", borderTop: "1px solid #1e293b" }}>
              <input type="range" min={50} max={allData.length} value={cursor}
                onChange={e => { setPlaying(false); setCursor(Number(e.target.value)); }}
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#475569", marginTop: "0.1rem" }}>
                <span>{allData[50]?.date}</span>
                <span>{allData[allData.length - 1]?.date}</span>
              </div>
            </div>
            {/* Legend */}
            <div style={{ padding: "0.5rem 1rem 0.7rem", background: "#0f172a", display: "flex", gap: "1.25rem", fontSize: "0.72rem", flexWrap: "wrap" }}>
              <span style={{ color: "#60a5fa", fontWeight: 600 }}>▲ System BUY</span>
              <span style={{ color: "#fb923c", fontWeight: 600 }}>▼ System SELL</span>
              <span style={{ color: "#10b981" }}>● Your BUY</span>
              <span style={{ color: "#ef4444" }}>● Your SELL</span>
              <span style={{ color: "#475569" }}>Scroll/pinch to zoom &bull; Drag to pan</span>
            </div>
          </div>

          {/* Side panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div className="sim-panel">
              <div style={{ marginBottom: "0.7rem" }}>
                <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Current Price</div>
                <div className="sim-price">₹{currentPrice.toFixed(2)}</div>
              </div>
              <div className="form-group" style={{ marginBottom: "0.7rem" }}>
                <label className="form-label">Shares</label>
                <input className="form-input" type="number" min={1} value={shares}
                  onChange={e => setShares(Math.max(1, Number(e.target.value)))} />
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  Cost: ₹{(shares * currentPrice).toFixed(0)}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                <button className="btn btn-success" onClick={handleBuy}
                  disabled={!currentPrice || shares * currentPrice > cash || finished}
                  style={{ fontSize: "0.85rem", justifyContent: "center" }}>
                  <TrendingUp size={14} /> BUY
                </button>
                <button className="btn btn-danger" onClick={handleSell}
                  disabled={!position || finished}
                  style={{ fontSize: "0.85rem", justifyContent: "center" }}>
                  <TrendingDown size={14} /> SELL
                </button>
              </div>
            </div>

            <div className="sim-panel">
              <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.65rem" }}>Trade History ({trades.length})</div>
              <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {trades.length === 0 && (
                  <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center", padding: "1rem 0" }}>
                    No trades yet.
                  </div>
                )}
                {[...trades].reverse().map((tr, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.35rem 0.5rem", background: "var(--bg-tertiary)", borderRadius: 6, fontSize: "0.77rem" }}>
                    <div>
                      <span className={`badge ${tr.type === "BUY" ? "badge-success" : "badge-danger"}`} style={{ padding: "0.08rem 0.35rem" }}>{tr.type}</span>
                      <span style={{ color: "var(--text-muted)", marginLeft: 5 }}>{tr.date.slice(5)}</span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 600 }}>₹{tr.price.toFixed(0)} × {tr.shares}</div>
                      {tr.pnl !== undefined && (
                        <div style={{ color: tr.pnl >= 0 ? "var(--success)" : "var(--danger)", fontSize: "0.7rem" }}>
                          {tr.pnl >= 0 ? "+" : ""}₹{tr.pnl.toFixed(0)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {finished && (
          <div className="alert" style={{
            marginTop: "1rem",
            background: totalPnL >= 0 ? "var(--success-light)" : "var(--danger-light)",
            borderColor: totalPnL >= 0 ? "var(--success)" : "var(--danger)",
            color: totalPnL >= 0 ? "var(--success)" : "var(--danger)",
            justifyContent: "space-between", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {totalPnL >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              <div>
                <strong>Simulation Complete!</strong>
                <span style={{ marginLeft: 10 }}>
                  Return: {totalReturn >= 0 ? "+" : ""}{totalReturn.toFixed(2)}% &bull;{" "}
                  {trades.filter(t => t.type === "SELL" && (t.pnl ?? 0) > 0).length} winning trades
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <Web3Connect
                finalPnL={totalPnL}
                winRate={trades.filter(t => t.type === "SELL").length
                  ? (trades.filter(t => t.type === "SELL" && (t.pnl ?? 0) > 0).length / trades.filter(t => t.type === "SELL").length) * 100
                  : 0}
              />
              <button className="btn btn-ghost btn-sm" onClick={resetAll}><RotateCcw size={14} /> Try Again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
