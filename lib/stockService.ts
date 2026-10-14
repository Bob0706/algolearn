// lib/stockService.ts — server-side market data from Yahoo Finance.
//
// If Yahoo is unreachable a deterministic synthetic series can be generated so
// the app still works offline, but it is ALWAYS labelled source: "synthetic"
// and the UI shows that these are not real prices. Set ALLOW_SYNTHETIC_DATA=false
// in production to fail instead.

import { MarketData, OHLCVBar } from "./types";
import { hashJson } from "./ledger/canonical";

export const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y", "5y"] as const;
export type Period = (typeof PERIODS)[number];

const SYMBOL_RE = /^\^?[A-Z0-9&\-]{1,20}(\.(NS|BO))?$/;

export class InputError extends Error {}

export function validateSymbol(raw: unknown): string {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!SYMBOL_RE.test(s)) throw new InputError("Invalid symbol. Use an NSE/BSE ticker like RELIANCE.NS or ^NSEI.");
  return s;
}

export function validatePeriod(raw: unknown): Period {
  const p = String(raw ?? "1y");
  if (!(PERIODS as readonly string[]).includes(p)) throw new InputError(`Invalid period. Use one of ${PERIODS.join(", ")}.`);
  return p as Period;
}

const BASE_PRICES: Record<string, number> = {
  "RELIANCE.NS": 2850, "TCS.NS": 4120, "INFY.NS": 1820, "HDFCBANK.NS": 1640, "ICICIBANK.NS": 1210,
  "HINDUNILVR.NS": 2720, "BAJFINANCE.NS": 7350, "WIPRO.NS": 540, "LT.NS": 3680, "SBIN.NS": 810,
  "AXISBANK.NS": 1180, "MARUTI.NS": 12400, "TITAN.NS": 3450, "SUNPHARMA.NS": 1780, "ASIANPAINT.NS": 2980,
  "KOTAKBANK.NS": 1820, "ITC.NS": 490, "HCLTECH.NS": 1740, "M&M.NS": 2960, "BHARTIARTL.NS": 1540,
  "^NSEI": 25200, "^BSESN": 82600,
};

const allowSynthetic = () => (process.env.ALLOW_SYNTHETIC_DATA ?? "true").toLowerCase() !== "false";

async function fetchYahoo(symbol: string, period: Period): Promise<OHLCVBar[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${period}&interval=1d&includePrePost=false`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (AlgoLearn educational backtester)", Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const ts: number[] | undefined = result?.timestamp;
    const q = result?.indicators?.quote?.[0];
    if (!ts || !q) return null;
    // Yahoo timestamps are the session open in exchange time; use the exchange's offset for the date.
    const gmtOffset: number = result?.meta?.gmtoffset ?? 19800;
    const bars: OHLCVBar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const [o, h, l, c] = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i]];
      if ([o, h, l, c].some(v => v == null || Number.isNaN(v))) continue;
      const date = new Date((ts[i] + gmtOffset) * 1000).toISOString().slice(0, 10);
      if (bars.length && bars[bars.length - 1].date === date) bars.pop(); // intraday duplicate of today
      bars.push({
        date,
        open: Math.round(o * 100) / 100,
        high: Math.round(h * 100) / 100,
        low: Math.round(l * 100) / 100,
        close: Math.round(c * 100) / 100,
        volume: Math.round(q.volume?.[i] ?? 0),
      });
    }
    return bars.length >= 20 ? bars : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getMarketData(symbolRaw: unknown, periodRaw: unknown): Promise<MarketData> {
  const symbol = validateSymbol(symbolRaw);
  const period = validatePeriod(periodRaw);

  const real = await fetchYahoo(symbol, period);
  if (real) return { symbol, period, source: "yahoo", bars: real, dataHash: hashJson(real) };

  if (!allowSynthetic()) {
    throw new Error(`Could not fetch market data for ${symbol} from Yahoo Finance. Please try again later.`);
  }
  console.warn(`[stockService] Yahoo Finance unavailable for ${symbol}; serving SYNTHETIC data`);
  const bars = generateSyntheticBars(symbol, period);
  return { symbol, period, source: "synthetic", bars, dataHash: hashJson(bars) };
}

/** Deterministic random-walk prices. NOT real market data. Dates are fixed so results are reproducible. */
function generateSyntheticBars(symbol: string, period: Period): OHLCVBar[] {
  const counts: Record<Period, number> = { "1mo": 22, "3mo": 65, "6mo": 125, "1y": 250, "2y": 500, "5y": 1250 };
  const numDays = counts[period];
  const base = BASE_PRICES[symbol] || 1500;

  let seed = 0;
  for (let i = 0; i < symbol.length; i++) seed = (seed * 31 + symbol.charCodeAt(i)) % 233280;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const dates: string[] = [];
  const d = new Date(Date.UTC(2020, 0, 1));
  while (dates.length < numDays) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  const bars: OHLCVBar[] = [];
  let close = base * 0.85;
  for (const date of dates) {
    const open = Math.round(close * (1 + (rand() - 0.5) * 0.01) * 100) / 100;
    close = Math.round(open * (1 + (rand() - 0.485) * 0.035) * 100) / 100;
    const high = Math.round(Math.max(open, close) * (1 + rand() * 0.015) * 100) / 100;
    const low = Math.round(Math.min(open, close) * (1 - rand() * 0.015) * 100) / 100;
    bars.push({ date, open, high, low, close, volume: Math.round(500000 + rand() * 1500000) });
  }
  return bars;
}
