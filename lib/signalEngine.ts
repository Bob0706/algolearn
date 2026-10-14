// lib/signalEngine.ts — candlestick-pattern BUY/SELL signals (server side).
//
// Every signal on bar i uses only bars i-2..i (plus a 20-bar average for trend
// context), so the system can never "see the future". Signals are computed on
// the server and their hash is written to the ledger BEFORE the user sees them.

import { CandlePattern, CandleSignal, OHLCVBar } from "./types";
import { sma } from "./indicators";

export const SIGNAL_ENGINE_VERSION = "candlestick-v2";

export function analyzeCandlePatterns(data: OHLCVBar[]): CandleSignal[] {
  const signals: CandleSignal[] = [];
  if (data.length < 3) return signals;
  const trend = sma(data.map(d => d.close), 20);
  let last: "BUY" | "SELL" | null = null;

  for (let i = 2; i < data.length; i++) {
    const c = data[i], p = data[i - 1], pp = data[i - 2];
    const body = (b: OHLCVBar) => Math.abs(b.close - b.open);
    const range = (b: OHLCVBar) => b.high - b.low || 0.001;
    const bull = (b: OHLCVBar) => b.close > b.open;
    const bear = (b: OHLCVBar) => b.close < b.open;
    const bodyC = body(c), bodyP = body(p), bodyPP = body(pp);
    const upperShadow = c.high - Math.max(c.open, c.close);
    const lowerShadow = Math.min(c.open, c.close) - c.low;

    // Reversal patterns only mean something after a move in the other direction.
    const t = trend[i - 1];
    const downtrend = t === null || p.close < t;
    const uptrend = t === null || p.close > t;

    let type: "BUY" | "SELL" | null = null;
    let pattern: CandlePattern | "" = "";
    let strength: "STRONG" | "MODERATE" = "MODERATE";
    const hit = (ty: "BUY" | "SELL", pat: CandlePattern, st: "STRONG" | "MODERATE" = "MODERATE") => {
      type = ty; pattern = pat; strength = st;
    };

    // ── bullish ──
    if (downtrend) {
      if (bear(p) && bull(c) && c.open <= p.close && c.close >= p.open && bodyC > bodyP * 1.05) hit("BUY", "Bullish Engulfing", "STRONG");
      else if (bear(pp) && bodyPP > range(pp) * 0.5 && bodyP < bodyPP * 0.3 && bull(c) && c.close > (pp.open + pp.close) / 2) hit("BUY", "Morning Star", "STRONG");
      else if (bodyC > 0 && lowerShadow >= bodyC * 2 && upperShadow <= bodyC * 0.5 && bear(p)) hit("BUY", "Hammer");
      else if (bear(p) && bull(c) && c.open < p.close && c.close > (p.open + p.close) / 2 && c.close < p.open) hit("BUY", "Piercing Line");
      else if (bear(p) && bodyP > range(p) * 0.4 && bodyC < range(c) * 0.1) hit("BUY", "Doji Reversal");
    }
    if (!type && bull(c) && bull(p) && bull(pp) && p.close > pp.close && c.close > p.close &&
      bodyC > range(c) * 0.55 && bodyP > range(p) * 0.55 && bodyPP > range(pp) * 0.55) hit("BUY", "Three White Soldiers", "STRONG");

    // ── bearish ──
    if (!type && uptrend) {
      if (bull(p) && bear(c) && c.open >= p.close && c.close <= p.open && bodyC > bodyP * 1.05) hit("SELL", "Bearish Engulfing", "STRONG");
      else if (bull(pp) && bodyPP > range(pp) * 0.5 && bodyP < bodyPP * 0.3 && bear(c) && c.close < (pp.open + pp.close) / 2) hit("SELL", "Evening Star", "STRONG");
      else if (bodyC > 0 && upperShadow >= bodyC * 2 && lowerShadow <= bodyC * 0.5 && bull(p)) hit("SELL", "Shooting Star");
      else if (bull(p) && bear(c) && c.open > p.close && c.close < (p.open + p.close) / 2 && c.close > p.open) hit("SELL", "Dark Cloud Cover");
      else if (bull(p) && bodyP > range(p) * 0.4 && bodyC < range(c) * 0.1) hit("SELL", "Doji Reversal");
    }
    if (!type && bear(c) && bear(p) && bear(pp) && p.close < pp.close && c.close < p.close &&
      bodyC > range(c) * 0.55 && bodyP > range(p) * 0.55 && bodyPP > range(pp) * 0.55) hit("SELL", "Three Black Crows", "STRONG");

    // Long-only alternation: BUY when flat, SELL only after a BUY.
    if (type && ((type === "BUY" && last !== "BUY") || (type === "SELL" && last === "BUY"))) {
      signals.push({ date: c.date, type, pattern: pattern as CandlePattern, strength });
      last = type;
    }
  }
  return signals;
}
