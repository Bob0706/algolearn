"use client";
// app/simulator/page.tsx — paper trading on revealed-one-candle-at-a-time history.
// The server holds the future candles, fills orders and scores the session, so the
// result is genuine and can be verified on the ledger.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertCircle, ArrowDownCircle, ArrowUpCircle, Flag, Gamepad2, Pause, Play, Radio, RotateCcw,
  SkipForward, TrendingDown, TrendingUp, Zap,
} from "lucide-react";
import { ApiError, fetchLiveSignal, LiveSignal, SimView, startSimulation, stepSimulation } from "@/lib/api";
import type { CandleSignal, OHLCVBar } from "@/lib/types";
import { useAuth } from "@/contexts/AuthContext";
import { addSimulatorSession } from "@/lib/firebase";
import CandleChart, { ChartMarker } from "@/components/CandleChart";
import LedgerReceipts from "@/components/LedgerReceipts";
import DataSourceBanner from "@/components/DataSourceBanner";
import SymbolSearch from "@/components/SymbolSearch";
import LiveQuote from "@/components/LiveQuote";

const INITIAL_CAPITAL = 100000;
const inr = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default function SimulatorPage() {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [period, setPeriod] = useState("1y");
  const [view, setView] = useState<SimView | null>(null);
  const [bars, setBars] = useState<OHLCVBar[]>([]);
  const [signals, setSignals] = useState<CandleSignal[]>([]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(400);
  const [shares, setShares] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [live, setLive] = useState<LiveSignal | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const busy = useRef(false);
  const reported = useRef<string | null>(null);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("symbol");
    if (fromUrl) setSymbol(fromUrl.toUpperCase());
  }, []);

  const reset = useCallback(() => {
    setView(null); setBars([]); setSignals([]); setPlaying(false); setError(""); reported.current = null;
  }, []);

  // a different user must not continue someone else's session
  useEffect(() => { reset(); }, [user?.uid, reset]);

  const merge = (v: SimView) => {
    setView(v);
    setBars(prev => {
      const last = prev[prev.length - 1]?.date ?? "";
      const fresh = v.bars.filter(b => b.date > last);
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    setSignals(prev => {
      const seen = new Set(prev.map(s => s.date));
      const fresh = v.signals.filter(s => !seen.has(s.date));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
    if (v.error) setError(v.error);
    if (v.finished) setPlaying(false);
  };

  const start = async () => {
    setLoading(true); reset();
    try {
      const v = await startSimulation(symbol, period);
      setBars(v.bars); setSignals(v.signals); setView(v);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start the simulation.");
    } finally {
      setLoading(false);
    }
  };

  const step = useCallback(async (opts: Parameters<typeof stepSimulation>[1]) => {
    if (!view || busy.current) return;
    busy.current = true;
    setError("");
    try {
      merge(await stepSimulation(view.sessionId, opts));
    } catch (e) {
      setPlaying(false);
      setError(e instanceof ApiError ? e.message : "Connection problem; press Next to retry.");
    } finally {
      busy.current = false;
    }
  }, [view]);

  useEffect(() => {
    if (!playing || !view || view.finished) return;
    const id = setInterval(() => step({ advance: 1 }), speed);
    return () => clearInterval(id);
  }, [playing, speed, view, step]);

  // record the finished session in the user's running totals once
  useEffect(() => {
    const r = view?.result;
    if (!user || !view?.finished || !r || reported.current === view.sessionId) return;
    reported.current = view.sessionId;
    addSimulatorSession(user, { trades: view.trades.length, wins: r.wins, losses: r.losses, pnl: r.finalValue - INITIAL_CAPITAL }).catch(() => {});
  }, [view, user]);

  const markers = useMemo<ChartMarker[]>(() => [
    ...signals.map(s => ({
      date: s.date,
      position: (s.type === "BUY" ? "belowBar" : "aboveBar") as ChartMarker["position"],
      color: s.type === "BUY" ? "#60a5fa" : "#fb923c",
      shape: (s.type === "BUY" ? "arrowUp" : "arrowDown") as ChartMarker["shape"],
      text: `${s.type}: ${s.pattern}`,
    })),
    ...(view?.trades ?? []).map(t => ({
      date: t.date,
      position: (t.type === "BUY" ? "belowBar" : "aboveBar") as ChartMarker["position"],
      color: t.type === "BUY" ? "#10b981" : "#ef4444",
      shape: "circle" as const,
      text: `You: ${t.type}`,
    })),
  ], [signals, view?.trades]);

  // ── setup screen ────────────────────────────────────────────────────────
  if (!view) {
    return (
      <div className="page">
        <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
          <div className="page-header-inner" style={{ marginBottom: "1.5rem" }}>
            <div>
              <h1 className="page-title">Trade Simulator</h1>
              <p className="page-subtitle">Trade a real past chart one candle at a time while the system flags candlestick-pattern signals.</p>
            </div>
          </div>
          <div className="two-col">
            <div className="card">
              <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                <Gamepad2 size={34} style={{ color: "var(--accent)", margin: "0 auto 0.5rem" }} />
                <h2 style={{ fontWeight: 800 }}>Paper trading with ₹1,00,000</h2>
                <p className="small muted" style={{ marginTop: "0.3rem" }}>
                  The first 50 candles are shown as context. Future candles stay on the server until you move forward, so you can't peek or rewind.
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
                <SymbolSearch id="ssym" value={symbol} onChange={s => { setSymbol(s); setLive(null); }} label="Company / index (any NSE or BSE listing)" />
                <LiveQuote symbol={symbol} />
                <div className="form-group">
                  <label className="form-label" htmlFor="sper">Period</label>
                  <select id="sper" className="form-select" value={period} onChange={e => setPeriod(e.target.value)}>
                    <option value="6mo">6 months</option><option value="1y">1 year</option><option value="2y">2 years</option>
                  </select>
                </div>
              </div>
              <div className="alert alert-info small" style={{ marginTop: "1rem" }}>
                <Activity size={14} style={{ flexShrink: 0 }} />
                <span>The full list of system signals is fingerprinted on the ledger <strong>before</strong> you see the first one, so nobody can change them afterwards. Your final score is computed by the server and recorded too.</span>
              </div>
              {error && <div className="alert alert-danger small" style={{ marginTop: "0.75rem" }}><AlertCircle size={16} /> {error}</div>}
              <button className="btn btn-primary w-full" style={{ marginTop: "1.1rem" }} onClick={start} disabled={loading}>
                {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Preparing…</> : <><Play size={16} /> Start simulation</>}
              </button>
              {!user && <p className="small muted" style={{ marginTop: "0.6rem", textAlign: "center" }}>Sign in to appear on the verified leaderboard.</p>}
            </div>

            <div className="card">
              <h2 className="card-title" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}><Radio size={16} style={{ color: "var(--danger)" }} /> Today's live signal</h2>
              <p className="small muted" style={{ margin: "0.4rem 0 1rem" }}>
                Runs the same pattern engine on the latest real data for {symbol}. A signal is time-stamped on the ledger when it is issued, so its track record can be checked later.
              </p>
              <button className="btn btn-secondary btn-sm" onClick={async () => {
                setLiveLoading(true);
                try { setLive(await fetchLiveSignal(symbol)); } catch (e) { setLive(null); setError(e instanceof Error ? e.message : "Failed"); }
                finally { setLiveLoading(false); }
              }} disabled={liveLoading}>{liveLoading ? "Checking…" : `Check ${symbol}`}</button>
              {live && (
                <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  <DataSourceBanner source={live.dataSource} />
                  <div className="small">As of <strong>{live.asOf}</strong> close {inr(live.close)}</div>
                  {live.signal ? (
                    <div className={`verdict ${live.signal.type === "BUY" ? "verdict-ok" : "verdict-bad"}`}>
                      {live.signal.type === "BUY" ? <ArrowUpCircle size={22} /> : <ArrowDownCircle size={22} />}
                      {live.signal.type}: {live.signal.pattern} ({live.signal.strength})
                    </div>
                  ) : (
                    <div className="small muted">No new signal on the latest candle.{live.previousSignal ? ` Last signal: ${live.previousSignal.type} (${live.previousSignal.pattern}) on ${live.previousSignal.date}.` : ""}</div>
                  )}
                  {live.note && <div className="small muted">{live.note}</div>}
                  <LedgerReceipts receipts={[live.ledger]} title="Signal time-stamped" />
                  <p className="small muted">Educational pattern detection only, not investment advice.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── simulation screen ───────────────────────────────────────────────────
  const p = view.portfolio;
  const pnl = p.value - INITIAL_CAPITAL;
  const recent = [...signals].reverse().find(s => {
    const idx = bars.findIndex(b => b.date === s.date);
    return idx >= bars.length - 3 && ((s.type === "BUY" && p.shares === 0) || (s.type === "SELL" && p.shares > 0));
  });
  const cost = shares * p.price;

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "1.25rem", paddingBottom: "2rem", maxWidth: 1400 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <div>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 800 }}>Simulator: {view.symbol}</h1>
            <p className="small muted">Candle {view.cursor + 1} / {view.totalBars} · {bars[bars.length - 1]?.date} · {signals.length} signal{signals.length === 1 ? "" : "s"} so far</p>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setPlaying(x => !x)} disabled={view.finished}>
              {playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Play</>}
            </button>
            <select className="form-select" style={{ width: "auto", padding: "0.3rem 0.5rem", fontSize: "0.8rem" }} value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="Speed">
              <option value={800}>Slow</option><option value={400}>Normal</option><option value={200}>Fast</option>
            </select>
            <button className="btn btn-secondary btn-sm" onClick={() => step({ advance: 1 })} disabled={view.finished || playing}><SkipForward size={14} /> Next</button>
            <button className="btn btn-secondary btn-sm" onClick={() => step({ advance: 10 })} disabled={view.finished || playing}>+10</button>
            <button className="btn btn-ghost btn-sm" onClick={() => step({ end: true })} disabled={view.finished}><Flag size={14} /> End</button>
            <button className="btn btn-ghost btn-sm" onClick={reset}><RotateCcw size={14} /> New</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <DataSourceBanner source={view.dataSource} />

          {recent ? (
            <div className={`verdict ${recent.type === "BUY" ? "verdict-ok" : "verdict-bad"}`}>
              {recent.type === "BUY" ? <ArrowUpCircle size={30} /> : <ArrowDownCircle size={30} />}
              <div>
                <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>SYSTEM SIGNAL: {recent.type}</div>
                <div className="small" style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
                  <Zap size={12} style={{ display: "inline" }} /> {recent.pattern} · {recent.strength} · on {recent.date}
                </div>
              </div>
            </div>
          ) : (
            <div className="alert small muted"><Activity size={14} /> Watching for patterns… Blue arrows = system BUY, orange = system SELL.</div>
          )}

          <div className="portfolio-bar">
            {[
              ["Portfolio", inr(p.value), ""],
              ["Cash", inr(p.cash), ""],
              ["P&L", `${pnl >= 0 ? "+" : ""}${inr(pnl)}`, pnl >= 0 ? "positive" : "negative"],
              ["Return", `${pnl >= 0 ? "+" : ""}${((pnl / INITIAL_CAPITAL) * 100).toFixed(2)}%`, pnl >= 0 ? "positive" : "negative"],
              ["Holding", p.shares ? `${p.shares} @ ₹${p.avgPrice.toFixed(0)}` : "None", ""],
              ["Price", `₹${p.price.toFixed(2)}`, ""],
            ].map(([l, v, c]) => (
              <div key={l} className="portfolio-item"><span className="portfolio-label">{l}</span><span className={`portfolio-val ${c}`}>{v}</span></div>
            ))}
          </div>

          <div className="sim-layout">
            <div className="chart-container" style={{ padding: "0.75rem" }}>
              <CandleChart bars={bars} markers={markers} height={420} follow />
              <div className="small" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                <span style={{ color: "#60a5fa", fontWeight: 600 }}>▲ System BUY</span>
                <span style={{ color: "#fb923c", fontWeight: 600 }}>▼ System SELL</span>
                <span style={{ color: "#10b981" }}>● Your BUY</span>
                <span style={{ color: "#ef4444" }}>● Your SELL</span>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div className="sim-panel">
                <div className="portfolio-label">Current price</div>
                <div className="sim-price">₹{p.price.toFixed(2)}</div>
                <div className="form-group" style={{ margin: "0.7rem 0" }}>
                  <label className="form-label" htmlFor="qty">Shares</label>
                  <input id="qty" className="form-input" type="number" min={1} value={shares} onChange={e => setShares(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
                  <span className="small muted">≈ {inr(cost)} + charges · max {Math.floor(p.cash / (p.price * 1.0015))}</span>
                </div>
                <div className="grid-2" style={{ gap: "0.5rem" }}>
                  <button className="btn btn-success" onClick={() => step({ action: { type: "BUY", shares } })} disabled={view.finished || cost > p.cash}>
                    <TrendingUp size={14} /> Buy
                  </button>
                  <button className="btn btn-danger" onClick={() => step({ action: { type: "SELL", shares } })} disabled={view.finished || !p.shares}>
                    <TrendingDown size={14} /> Sell
                  </button>
                </div>
                {error && <div className="alert alert-danger small" style={{ marginTop: "0.6rem" }}><AlertCircle size={14} /> {error}</div>}
              </div>

              <div className="sim-panel">
                <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.5rem" }}>Your trades ({view.trades.length})</div>
                <div style={{ maxHeight: 230, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {!view.trades.length && <div className="small muted" style={{ textAlign: "center", padding: "0.75rem 0" }}>No trades yet.</div>}
                  {[...view.trades].reverse().map((t, i) => (
                    <div key={i} className="small" style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0.5rem", background: "var(--bg-tertiary)", borderRadius: 6 }}>
                      <span><span className={`badge ${t.type === "BUY" ? "badge-success" : "badge-danger"}`}>{t.type}</span> {t.date.slice(5)}{t.followedSignal ? " ✦" : ""}</span>
                      <span style={{ textAlign: "right" }}>
                        ₹{t.price.toFixed(0)} × {t.shares}
                        {t.pnl !== undefined && <div className={t.pnl >= 0 ? "positive" : "negative"}>{t.pnl >= 0 ? "+" : ""}{inr(t.pnl)}</div>}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="small muted" style={{ marginTop: "0.4rem" }}>✦ = trade followed a system signal. Charges (STT, stamp duty, brokerage) are included.</p>
              </div>
            </div>
          </div>

          {view.finished && view.result && (
            <div className={`card`} style={{ borderColor: view.result.returnPct >= 0 ? "var(--success)" : "var(--danger)" }}>
              <h2 className="card-title" style={{ marginBottom: "0.75rem" }}>Simulation complete</h2>
              <div className="stats-grid">
                <div className="stat-card"><div className="stat-label">Your return</div><div className={`stat-value ${view.result.returnPct >= 0 ? "positive" : "negative"}`}>{view.result.returnPct >= 0 ? "+" : ""}{view.result.returnPct.toFixed(2)}%</div></div>
                <div className="stat-card"><div className="stat-label">Buy & hold</div><div className="stat-value">{view.result.buyHoldReturnPct >= 0 ? "+" : ""}{view.result.buyHoldReturnPct.toFixed(2)}%</div></div>
                <div className="stat-card"><div className="stat-label">Closed trades</div><div className="stat-value">{view.result.closedTrades}</div><div className="stat-change">{view.result.wins} wins · {view.result.losses} losses</div></div>
                <div className="stat-card"><div className="stat-label">Charges paid</div><div className="stat-value">{inr(view.result.totalCosts)}</div></div>
              </div>
              <div style={{ marginTop: "1rem" }}>
                <LedgerReceipts receipts={[view.signalBatch, view.result.ledger]} title="Verifiable on the ledger" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
