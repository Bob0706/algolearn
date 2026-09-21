// lib/stockService.ts — Yahoo Finance API fetcher with realistic fallback

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BASE_PRICES: Record<string, number> = {
  "RELIANCE.NS": 2850,
  "TCS.NS": 4120,
  "INFY.NS": 1820,
  "HDFCBANK.NS": 1640,
  "ICICIBANK.NS": 1210,
  "HINDUNILVR.NS": 2720,
  "BAJFINANCE.NS": 7350,
  "WIPRO.NS": 540,
  "LT.NS": 3680,
  "SBIN.NS": 810,
  "AXISBANK.NS": 1180,
  "MARUTI.NS": 12400,
  "TITAN.NS": 3450,
  "SUNPHARMA.NS": 1780,
  "ASIANPAINT.NS": 2980,
  "KOTAKBANK.NS": 1820,
  "ITC.NS": 490,
  "HCLTECH.NS": 1740,
  "M&M.NS": 2960,
  "BHARTIARTL.NS": 1540,
  "^NSEI": 25200,
  "^BSESN": 82600,
};

export async function fetchStockDataFromSource(symbol: string, period: string = "1y"): Promise<OHLCVBar[]> {
  const normalizedSymbol = symbol.trim().toUpperCase();

  // Try real Yahoo Finance API first
  try {
    const rangeMap: Record<string, string> = {
      "1mo": "1mo",
      "3mo": "3mo",
      "6mo": "6mo",
      "1y": "1y",
      "2y": "2y",
      "5y": "5y",
    };
    const validRange = rangeMap[period] || "1y";
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(normalizedSymbol)}?range=${validRange}&interval=1d&includePrePost=false`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
      next: { revalidate: 300 }, // cache for 5 minutes
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (result && result.timestamp && result.indicators?.quote?.[0]) {
        const timestamps: number[] = result.timestamp;
        const quotes = result.indicators.quote[0];
        const bars: OHLCVBar[] = [];

        for (let i = 0; i < timestamps.length; i++) {
          const open = quotes.open?.[i];
          const high = quotes.high?.[i];
          const low = quotes.low?.[i];
          const close = quotes.close?.[i];
          const volume = quotes.volume?.[i] ?? 100000;

          if (open != null && high != null && low != null && close != null && !isNaN(close)) {
            const dateObj = new Date(timestamps[i] * 1000);
            const dateStr = dateObj.toISOString().split("T")[0];
            bars.push({
              date: dateStr,
              open: Math.round(open * 100) / 100,
              high: Math.round(high * 100) / 100,
              low: Math.round(low * 100) / 100,
              close: Math.round(close * 100) / 100,
              volume: Math.round(volume),
            });
          }
        }

        if (bars.length >= 20) {
          return bars;
        }
      }
    }
  } catch (err) {
    console.warn(`[stockService] Yahoo Finance fetch failed for ${normalizedSymbol}, using fallback generator:`, err);
  }

  // Fallback: Generate realistic daily historical bars based on base price
  return generateDeterministicStockData(normalizedSymbol, period);
}

function generateDeterministicStockData(symbol: string, period: string): OHLCVBar[] {
  const daysCountMap: Record<string, number> = {
    "1mo": 22,
    "3mo": 65,
    "6mo": 125,
    "1y": 250,
    "2y": 500,
    "5y": 1250,
  };
  const numDays = daysCountMap[period] || 250;
  const basePrice = BASE_PRICES[symbol] || 1500;

  // Simple deterministic seed from symbol characters
  let seed = 0;
  for (let i = 0; i < symbol.length; i++) {
    seed = (seed << 5) - seed + symbol.charCodeAt(i);
  }
  const seededRandom = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const bars: OHLCVBar[] = [];
  const now = new Date();
  let currentClose = basePrice * 0.85;

  const dates: string[] = [];
  let d = new Date(now.getTime() - numDays * 24 * 60 * 60 * 1000 * 1.45);
  while (dates.length < numDays && d <= now) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      dates.push(d.toISOString().split("T")[0]);
    }
    d.setDate(d.getDate() + 1);
  }

  for (let i = 0; i < dates.length; i++) {
    const dailyReturn = (seededRandom() - 0.485) * 0.035;
    const prevClose = currentClose;
    const open = Math.round((prevClose * (1 + (seededRandom() - 0.5) * 0.01)) * 100) / 100;
    currentClose = Math.round((open * (1 + dailyReturn)) * 100) / 100;

    const highMultiplier = 1 + seededRandom() * 0.015;
    const lowMultiplier = 1 - seededRandom() * 0.015;
    const high = Math.round(Math.max(open, currentClose) * highMultiplier * 100) / 100;
    const low = Math.round(Math.min(open, currentClose) * lowMultiplier * 100) / 100;
    const volume = Math.round(500000 + seededRandom() * 1500000);

    bars.push({
      date: dates[i],
      open,
      high,
      low,
      close: currentClose,
      volume,
    });
  }

  return bars;
}
