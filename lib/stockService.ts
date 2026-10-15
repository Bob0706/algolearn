// lib/stockService.ts — validated daily history for backtests and the simulator.
//
// Real NSE/BSE data comes from lib/server/marketFeed.ts (Yahoo or Upstox). Synthetic
// prices are OFF by default; ALLOW_SYNTHETIC_DATA=true enables a clearly labelled
// random-walk fallback for offline development only.

import { MarketData, OHLCVBar } from "./types";
import { hashJson } from "./ledger/canonical";
import { getDailyBars, MarketDataError } from "./server/marketFeed";
import { findInstrument, getUniverse } from "./server/universe";

export const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y", "5y"] as const;
export type Period = (typeof PERIODS)[number];

const SYMBOL_RE = /^(\^[A-Z0-9]{2,15}|[A-Z0-9&\-]{1,20}\.(NS|BO))$/;

export class InputError extends Error {}

export function validateSymbol(raw: unknown): string {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!SYMBOL_RE.test(s)) throw new InputError("Invalid symbol. Use an NSE ticker like RELIANCE.NS, a BSE ticker like RELIANCE.BO, or an index like ^NSEI.");
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

const allowSynthetic = () => (process.env.ALLOW_SYNTHETIC_DATA ?? "false").toLowerCase() === "true";

export async function getMarketData(symbolRaw: unknown, periodRaw: unknown): Promise<MarketData> {
  const symbol = validateSymbol(symbolRaw);
  const period = validatePeriod(periodRaw);

  const real = await getDailyBars(symbol, period);
  if (real) return { symbol, period, source: real.source, bars: real.bars, dataHash: hashJson(real.bars) };

  // The price feed lacks daily history for some BSE listings. The same share also trades on NSE at
  // nearly the same price, so fall back to the NSE listing (matched by ISIN) and say so.
  if (symbol.endsWith(".BO")) {
    const u = await getUniverse();
    const isin = findInstrument(u, symbol)?.isin;
    const twin = isin ? u.instruments.find(i => i.exchange === "NSE" && i.isin === isin) : undefined;
    const alt = twin ? await getDailyBars(twin.symbol, period) : null;
    if (twin && alt) {
      return {
        symbol, period, source: alt.source, bars: alt.bars, dataHash: hashJson(alt.bars),
        note: `Daily history for ${symbol} on BSE isn't available from the data provider, so this uses the same company's NSE listing (${twin.symbol}). Prices on the two exchanges stay within a few paise of each other.`,
      };
    }
  }

  if (!allowSynthetic()) {
    throw new MarketDataError(`Price history for ${symbol} is unavailable right now: the data provider could not be reached or has no daily history for this listing. Try again shortly${symbol.endsWith(".BO") ? ", or pick the company's NSE listing" : ""}.`);
  }
  console.warn(`[stockService] real market data unavailable for ${symbol}; serving SYNTHETIC data (ALLOW_SYNTHETIC_DATA=true)`);
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
