"use client";
// components/LiveQuote.tsx — auto-refreshing last traded price for one symbol

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Radio } from "lucide-react";
import { ApiError, fetchQuote } from "@/lib/api";
import type { Quote } from "@/lib/types";

const fmt = (v: number | undefined, d = 2) => (v === undefined ? "—" : v.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d }));

export function useLiveQuote(symbol: string, openMs = 10_000, closedMs = 60_000) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    setQuote(null); setError("");
    const tick = async () => {
      let next = closedMs;
      if (document.visibilityState === "visible") {
        try {
          const q = await fetchQuote(symbol);
          if (stop) return;
          setQuote(q); setError("");
          next = q.marketOpen ? openMs : closedMs;
        } catch (e) {
          if (stop) return;
          setError(e instanceof ApiError ? e.message : "Live price unavailable");
        }
      }
      if (!stop) timer = setTimeout(tick, next);
    };
    tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [symbol, openMs, closedMs]);
  return { quote, error };
}

export default function LiveQuote({ symbol, large = false }: { symbol: string; large?: boolean }) {
  const { quote: q, error } = useLiveQuote(symbol);

  if (error) return <div className="alert alert-warning small">{error}</div>;
  if (!q) return <div className="small muted" style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="spinner" style={{ width: 14, height: 14 }} /> Fetching live price…</div>;

  const up = q.change >= 0;
  const time = new Date(q.asOf * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", flexWrap: "wrap" }}>
        <span style={{ fontSize: large ? "2.2rem" : "1.35rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>₹{fmt(q.price)}</span>
        <span className={up ? "positive" : "negative"} style={{ fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 2 }}>
          {up ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          {up ? "+" : ""}{fmt(q.change)} ({up ? "+" : ""}{q.changePct.toFixed(2)}%)
        </span>
        <span className={`badge ${q.marketOpen ? "badge-success" : "badge-muted"}`}>
          {q.marketOpen ? <><Radio size={11} /> Market open</> : "Market closed"}
        </span>
      </div>
      {large && (
        <div className="small" style={{ display: "flex", gap: "1rem", flexWrap: "wrap", color: "var(--text-secondary)" }}>
          <span>Open {fmt(q.open)}</span><span>High {fmt(q.dayHigh)}</span><span>Low {fmt(q.dayLow)}</span>
          <span>Prev close {fmt(q.previousClose)}</span><span>Volume {q.volume?.toLocaleString("en-IN") ?? "—"}</span>
        </div>
      )}
      <span className="small muted">Last trade {time} IST · {q.delayNote}</span>
    </div>
  );
}
