// lib/server/marketFeed.ts — live quotes, intraday and daily candles for any NSE/BSE listing.
//
// Providers (MARKET_DATA_PROVIDER):
//   yahoo   (default) Yahoo Finance chart API. Covers every NSE (.NS) and BSE (.BO) listing and
//           the main indices. Free, no key; quotes can lag the exchange by a few minutes.
//   upstox  Upstox broker API — exchange-licensed NSE/BSE feed. Candles work without login;
//           live quotes need UPSTOX_ACCESS_TOKEN (Upstox tokens expire daily). Falls back to
//           Yahoo for anything it cannot serve.
// NSE/BSE themselves offer no free real-time API, and their websites forbid automated access,
// so the app does not scrape them.

import type { DataSource, Exchange, IntradayBar, OHLCVBar, Quote } from "../types";
import { findInstrument, getUniverse } from "./universe";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const IST_OFFSET = 19800;

export class MarketDataError extends Error {}

const provider = () => ((process.env.MARKET_DATA_PROVIDER || "yahoo").toLowerCase() === "upstox" ? "upstox" : "yahoo");

// ─── tiny TTL cache ─────────────────────────────────────────────────────
const cache: Map<string, { at: number; value: unknown }> = ((globalThis as any).__algolearnFeedCache ??= new Map());
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 5000) for (const [k, v] of cache) if (Date.now() - v.at > 10 * 60_000) cache.delete(k);
  return value;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

// ─── Yahoo ───────────────────────────────────────────────────────────────
export interface YahooChart {
  meta: any;
  timestamp: number[];
  quote: { open: (number | null)[]; high: (number | null)[]; low: (number | null)[]; close: (number | null)[]; volume: (number | null)[] };
}

export function parseYahooChart(json: any): YahooChart | null {
  const r = json?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r?.meta || !Array.isArray(r.timestamp) || !q) return null;
  return { meta: r.meta, timestamp: r.timestamp, quote: q };
}

async function yahooChart(symbol: string, range: string, interval: string): Promise<YahooChart | null> {
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
      if (res.status === 404) return null;
      if (!res.ok) continue;
      return parseYahooChart(await res.json());
    } catch {
      /* try next host */
    }
  }
  return null;
}

/** Daily bars dated in exchange time. */
export function yahooDailyBars(c: YahooChart): OHLCVBar[] {
  const off = c.meta?.gmtoffset ?? IST_OFFSET;
  const bars: OHLCVBar[] = [];
  c.timestamp.forEach((t, i) => {
    const [o, h, l, cl] = [c.quote.open[i], c.quote.high[i], c.quote.low[i], c.quote.close[i]];
    if ([o, h, l, cl].some(v => v == null || Number.isNaN(v))) return;
    const date = new Date((t + off) * 1000).toISOString().slice(0, 10);
    if (bars.length && bars[bars.length - 1].date === date) bars.pop(); // today's live bar duplicates
    bars.push({ date, open: r2(o!), high: r2(h!), low: r2(l!), close: r2(cl!), volume: Math.round(c.quote.volume[i] ?? 0) });
  });
  return bars;
}

export function yahooIntradayBars(c: YahooChart): IntradayBar[] {
  const out: IntradayBar[] = [];
  c.timestamp.forEach((t, i) => {
    const [o, h, l, cl] = [c.quote.open[i], c.quote.high[i], c.quote.low[i], c.quote.close[i]];
    if ([o, h, l, cl].some(v => v == null || Number.isNaN(v))) return;
    out.push({ time: t, open: r2(o!), high: r2(h!), low: r2(l!), close: r2(cl!), volume: Math.round(c.quote.volume[i] ?? 0) });
  });
  return out;
}

export function yahooQuote(symbol: string, c: YahooChart, now = Date.now() / 1000): Quote {
  const m = c.meta;
  const price = Number(m.regularMarketPrice);
  const prev = Number(m.previousClose ?? m.chartPreviousClose ?? price);
  const period = m.currentTradingPeriod?.regular;
  const asOf = Number(m.regularMarketTime ?? c.timestamp[c.timestamp.length - 1] ?? now);
  const inSession = period ? now >= period.start && now <= period.end : false;
  const bars = yahooIntradayBars(c);
  const today = bars.filter(b => !period || b.time >= period.start);
  return {
    symbol,
    name: m.longName || m.shortName,
    exchange: m.fullExchangeName || m.exchangeName,
    currency: m.currency || "INR",
    price: r2(price),
    previousClose: r2(prev),
    change: r2(price - prev),
    changePct: prev ? r2(((price - prev) / prev) * 100) : 0,
    open: today[0]?.open,
    dayHigh: m.regularMarketDayHigh ?? (today.length ? Math.max(...today.map(b => b.high)) : undefined),
    dayLow: m.regularMarketDayLow ?? (today.length ? Math.min(...today.map(b => b.low)) : undefined),
    volume: m.regularMarketVolume ?? today.reduce((a, b) => a + b.volume, 0),
    asOf,
    marketOpen: inSession && now - asOf < 30 * 60,
    source: "yahoo",
    delayNote: "Yahoo Finance feed. NSE/BSE prices may lag the exchange by a few minutes.",
  };
}

// ─── Upstox ──────────────────────────────────────────────────────────────
const UPSTOX = "https://api.upstox.com/v2";
const UPSTOX_INDEX: Record<string, string> = {
  "^NSEI": "NSE_INDEX|Nifty 50",
  "^NSEBANK": "NSE_INDEX|Nifty Bank",
  "^CNXIT": "NSE_INDEX|Nifty IT",
  "^NSMIDCP": "NSE_INDEX|Nifty Next 50",
  "^BSESN": "BSE_INDEX|SENSEX",
};

async function upstoxKey(symbol: string): Promise<string | null> {
  if (UPSTOX_INDEX[symbol]) return UPSTOX_INDEX[symbol];
  const inst = findInstrument(await getUniverse(), symbol);
  if (!inst?.isin) return null;
  return `${inst.exchange === "BSE" ? "BSE_EQ" : "NSE_EQ"}|${inst.isin}`;
}

async function upstoxGet(path: string): Promise<any | null> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.UPSTOX_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.UPSTOX_ACCESS_TOKEN}`;
  try {
    const res = await fetch(`${UPSTOX}${path}`, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.status === "success" ? json.data : null;
  } catch {
    return null;
  }
}

/** Upstox candles are [isoTime, open, high, low, close, volume, oi], newest first. */
export function parseUpstoxCandles(data: any): { t: string; o: number; h: number; l: number; c: number; v: number }[] {
  const rows: any[] = Array.isArray(data?.candles) ? data.candles : [];
  return rows
    .filter(r => Array.isArray(r) && r.length >= 6)
    .map(r => ({ t: String(r[0]), o: +r[1], h: +r[2], l: +r[3], c: +r[4], v: +r[5] }))
    .reverse();
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const PERIOD_DAYS: Record<string, number> = { "1mo": 31, "3mo": 92, "6mo": 183, "1y": 366, "2y": 731, "5y": 1827 };

async function upstoxDaily(symbol: string, period: string): Promise<OHLCVBar[] | null> {
  const key = await upstoxKey(symbol);
  if (!key) return null;
  const to = new Date();
  const from = new Date(to.getTime() - (PERIOD_DAYS[period] ?? 366) * 86400_000);
  const data = await upstoxGet(`/historical-candle/${encodeURIComponent(key)}/day/${ymd(to)}/${ymd(from)}`);
  const today = await upstoxGet(`/historical-candle/intraday/${encodeURIComponent(key)}/30minute`);
  const rows = parseUpstoxCandles(data);
  if (!rows.length) return null;
  const bars: OHLCVBar[] = rows.map(r => ({ date: r.t.slice(0, 10), open: r2(r.o), high: r2(r.h), low: r2(r.l), close: r2(r.c), volume: Math.round(r.v) }));
  // append today's session (built from intraday candles) so daily data is current to the minute
  const intra = parseUpstoxCandles(today);
  if (intra.length) {
    const date = intra[0].t.slice(0, 10);
    if (bars[bars.length - 1]?.date !== date) {
      bars.push({
        date, open: r2(intra[0].o), close: r2(intra[intra.length - 1].c),
        high: r2(Math.max(...intra.map(x => x.h))), low: r2(Math.min(...intra.map(x => x.l))),
        volume: Math.round(intra.reduce((a, x) => a + x.v, 0)),
      });
    }
  }
  return bars;
}

async function upstoxIntraday(symbol: string): Promise<IntradayBar[] | null> {
  const key = await upstoxKey(symbol);
  if (!key) return null;
  const rows = parseUpstoxCandles(await upstoxGet(`/historical-candle/intraday/${encodeURIComponent(key)}/1minute`));
  return rows.length ? rows.map(r => ({ time: Math.floor(Date.parse(r.t) / 1000), open: r2(r.o), high: r2(r.h), low: r2(r.l), close: r2(r.c), volume: Math.round(r.v) })) : null;
}

/** Upstox full market quote → Quote. Response data is keyed like "NSE_EQ:RELIANCE". */
export function parseUpstoxQuote(symbol: string, data: any, now = Date.now() / 1000): Quote | null {
  const q: any = data && Object.values(data)[0];
  if (!q || typeof q.last_price !== "number") return null;
  const price = q.last_price;
  const change = typeof q.net_change === "number" ? q.net_change : 0;
  const prev = price - change;
  const asOf = q.last_trade_time ? Math.floor(Number(q.last_trade_time) / 1000) : q.timestamp ? Math.floor(Date.parse(q.timestamp) / 1000) : now;
  const ist = new Date((now + IST_OFFSET) * 1000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const weekday = ist.getUTCDay() >= 1 && ist.getUTCDay() <= 5;
  return {
    symbol,
    currency: "INR",
    price: r2(price),
    previousClose: r2(prev),
    change: r2(change),
    changePct: prev ? r2((change / prev) * 100) : 0,
    open: q.ohlc?.open,
    dayHigh: q.ohlc?.high,
    dayLow: q.ohlc?.low,
    volume: q.volume,
    asOf,
    marketOpen: weekday && minutes >= 555 && minutes <= 930 && now - asOf < 30 * 60,
    source: "upstox",
    delayNote: "Upstox exchange feed (NSE/BSE).",
  };
}

async function upstoxQuote(symbol: string): Promise<Quote | null> {
  if (!process.env.UPSTOX_ACCESS_TOKEN) return null;
  const key = await upstoxKey(symbol);
  if (!key) return null;
  return parseUpstoxQuote(symbol, await upstoxGet(`/market-quote/quotes?instrument_key=${encodeURIComponent(key)}`));
}

// ─── public API ──────────────────────────────────────────────────────────

export async function getQuote(symbol: string): Promise<Quote> {
  return cached(`q:${symbol}`, 5_000, async () => {
    if (provider() === "upstox") {
      const q = await upstoxQuote(symbol);
      if (q) return q;
    }
    const c = await yahooChart(symbol, "1d", "1m");
    if (!c || !Number.isFinite(c.meta?.regularMarketPrice)) throw new MarketDataError(`No live quote available for ${symbol}.`);
    const q = yahooQuote(symbol, c);
    const inst = findInstrument(await getUniverse(), symbol);
    if (inst) q.name = inst.name;
    return q;
  });
}

export type IntradayInterval = "1m" | "5m" | "15m";

export async function getIntraday(symbol: string, interval: IntradayInterval, days: 1 | 5): Promise<{ bars: IntradayBar[]; source: DataSource }> {
  return cached(`i:${symbol}:${interval}:${days}`, 20_000, async () => {
    if (provider() === "upstox" && interval === "1m" && days === 1) {
      const b = await upstoxIntraday(symbol);
      if (b?.length) return { bars: b, source: "upstox" as const };
    }
    const c = await yahooChart(symbol, `${days}d`, interval);
    const bars = c ? yahooIntradayBars(c) : [];
    if (!bars.length) throw new MarketDataError(`No intraday data available for ${symbol}.`);
    return { bars, source: "yahoo" as const };
  });
}

export async function getDailyBars(symbol: string, period: string): Promise<{ bars: OHLCVBar[]; source: DataSource } | null> {
  return cached(`d:${symbol}:${period}`, 60_000, async () => {
    if (provider() === "upstox") {
      const b = await upstoxDaily(symbol, period);
      if (b && b.length >= 20) return { bars: b, source: "upstox" as const };
    }
    const c = await yahooChart(symbol, period, "1d");
    const bars = c ? yahooDailyBars(c) : [];
    return bars.length >= 20 ? { bars, source: "yahoo" as const } : null;
  });
}

export function exchangeOf(symbol: string): Exchange {
  return symbol.startsWith("^") ? "INDEX" : symbol.endsWith(".BO") ? "BSE" : "NSE";
}
