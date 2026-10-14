"use client";
// app/live/page.tsx — live NSE/BSE prices and intraday charts for any listed company

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart2, Gamepad2, LineChart, RefreshCw } from "lucide-react";
import { ApiError, fetchIntraday, fetchLiveSignal, LiveSignal } from "@/lib/api";
import type { DataSource, IntradayBar } from "@/lib/types";
import SymbolSearch from "@/components/SymbolSearch";
import LiveQuote, { useLiveQuote } from "@/components/LiveQuote";
import CandleChart from "@/components/CandleChart";
import LedgerReceipts from "@/components/LedgerReceipts";

const WATCH = [
  { symbol: "^NSEI", label: "Nifty 50" },
  { symbol: "^BSESN", label: "Sensex" },
  { symbol: "^NSEBANK", label: "Nifty Bank" },
];

function IndexTile({ symbol, label, onPick }: { symbol: string; label: string; onPick: (s: string) => void }) {
  const { quote: q } = useLiveQuote(symbol, 15_000, 120_000);
  return (
    <button className="stat-card card-interactive" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => onPick(symbol)}>
      <div className="stat-label">{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: 800 }}>{q ? q.price.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}</div>
      {q && <div className={`small ${q.change >= 0 ? "positive" : "negative"}`}>{q.change >= 0 ? "+" : ""}{q.changePct.toFixed(2)}%</div>}
    </button>
  );
}

export default function LivePage() {
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [interval, setInterval_] = useState<"1m" | "5m" | "15m">("5m");
  const [days, setDays] = useState<1 | 5>(1);
  const [bars, setBars] = useState<IntradayBar[]>([]);
  const [source, setSource] = useState<DataSource | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signal, setSignal] = useState<LiveSignal | null>(null);
  const [signalError, setSignalError] = useState("");

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("symbol");
    if (s) setSymbol(s.toUpperCase());
  }, []);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    setBars([]); setError(""); setSignal(null);
    const load = async (first: boolean) => {
      if (first) setLoading(true);
      try {
        const r = await fetchIntraday(symbol, interval, days);
        if (!stop) { setBars(r.bars); setSource(r.source); setError(""); }
      } catch (e) {
        if (!stop) setError(e instanceof ApiError ? e.message : "Intraday data unavailable.");
      } finally {
        if (!stop && first) setLoading(false);
      }
      if (!stop) timer = setTimeout(() => load(false), 30_000);
    };
    load(true);
    return () => { stop = true; clearTimeout(timer); };
  }, [symbol, interval, days]);

  useEffect(() => {
    setSignalError("");
    fetchLiveSignal(symbol).then(setSignal).catch(e => { setSignal(null); setSignalError(e instanceof ApiError ? e.message : "Signal unavailable."); });
  }, [symbol]);

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div className="page-header-inner" style={{ marginBottom: "1.25rem" }}>
          <div>
            <h1 className="page-title">Live Market</h1>
            <p className="page-subtitle">Real-time prices and intraday charts for every company listed on NSE and BSE.</p>
          </div>
        </div>

        <div className="grid-3" style={{ marginBottom: "1.25rem" }}>
          {WATCH.map(w => <IndexTile key={w.symbol} {...w} onPick={setSymbol} />)}
        </div>

        <div className="card" style={{ marginBottom: "1rem" }}>
          <div className="two-col" style={{ alignItems: "end" }}>
            <SymbolSearch value={symbol} onChange={setSymbol} label="Search any NSE / BSE company" />
            <LiveQuote symbol={symbol} large />
          </div>
        </div>

        <div className="chart-container" style={{ marginBottom: "1rem" }}>
          <div className="chart-header">
            <span style={{ fontWeight: 700, fontSize: "0.9rem", display: "flex", gap: 6, alignItems: "center" }}>
              <LineChart size={15} /> Intraday · {symbol}
              {source && <span className="badge badge-success">{source === "upstox" ? "Upstox exchange feed" : "Yahoo Finance"}</span>}
              <span className="small muted" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><RefreshCw size={11} /> every 30s</span>
            </span>
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              <div className="tabs">
                {(["1m", "5m", "15m"] as const).map(i => <button key={i} className={`tab-btn ${interval === i ? "active" : ""}`} onClick={() => setInterval_(i)}>{i}</button>)}
              </div>
              <div className="tabs">
                {([1, 5] as const).map(d => <button key={d} className={`tab-btn ${days === d ? "active" : ""}`} onClick={() => setDays(d)}>{d}D</button>)}
              </div>
            </div>
          </div>
          <div style={{ padding: "1rem" }}>
            {error ? <div className="alert alert-warning small">{error}</div>
              : loading && !bars.length ? <div style={{ height: 380, display: "grid", placeItems: "center" }}><span className="spinner spinner-lg" /></div>
              : <CandleChart key={`${symbol}-${interval}-${days}`} bars={bars} height={380} follow />}
          </div>
        </div>

        <div className="two-col">
          <div className="card">
            <h2 className="card-title" style={{ marginBottom: "0.6rem" }}>System signal on the latest daily candle</h2>
            {signalError ? <p className="small muted">{signalError}</p> : !signal ? <span className="spinner" /> : signal.signal ? (
              <div className={`verdict ${signal.signal.type === "BUY" ? "verdict-ok" : "verdict-bad"}`}>
                {signal.signal.type}: {signal.signal.pattern} ({signal.signal.strength}) · {signal.asOf}
              </div>
            ) : (
              <p className="small muted">No pattern on {signal.asOf}.{signal.previousSignal ? ` Last: ${signal.previousSignal.type} (${signal.previousSignal.pattern}) on ${signal.previousSignal.date}.` : ""}</p>
            )}
            {signal?.ledger && <div style={{ marginTop: "0.75rem" }}><LedgerReceipts receipts={[signal.ledger]} title="Signal time-stamped on the ledger" /></div>}
            <p className="small muted" style={{ marginTop: "0.6rem" }}>Educational pattern detection, not investment advice.</p>
          </div>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <h2 className="card-title">Practise on this stock</h2>
            <p className="small muted">Test a strategy on its full price history, or paper-trade its chart candle by candle.</p>
            <Link className="btn btn-primary" href={`/backtest?symbol=${encodeURIComponent(symbol)}`}><BarChart2 size={16} /> Backtest a strategy on {symbol}</Link>
            <Link className="btn btn-secondary" href={`/simulator?symbol=${encodeURIComponent(symbol)}`}><Gamepad2 size={16} /> Practise in the simulator</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
