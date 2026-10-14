import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildUniverse, parseBseList, parseCsv, parseNseList, searchInstruments } from "@/lib/server/universe";
import { parseUpstoxCandles, parseUpstoxQuote, parseYahooChart, yahooDailyBars, yahooIntradayBars, yahooQuote } from "@/lib/server/marketFeed";
import { validateSymbol } from "@/lib/stockService";

const fx = (f: string) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");
const nse = parseNseList(fx("EQUITY_L.csv"));
const sme = parseNseList(fx("SME_EQUITY_L.csv"), true);
const bse = parseBseList(JSON.parse(fx("bse.json")));
const u = buildUniverse(nse, sme, bse);

describe("exchange company lists", () => {
  it("parses NSE EQUITY_L.csv incl. quoted names and skips bad rows", () => {
    expect(parseCsv('a,"b, c",d\n')).toEqual([["a", "b, c", "d"]]);
    expect(nse.map(i => i.symbol)).toEqual(["20MICRONS.NS", "RELIANCE.NS", "TATAMOTORS.NS", "M&M.NS", "HUDCO.NS"]);
    expect(nse[4].name).toBe("Housing & Urban Development Corporation, Limited");
    expect(nse[1]).toMatchObject({ isin: "INE002A01018", series: "EQ", exchange: "NSE" });
  });

  it("parses the NSE SME list (underscore headers)", () => {
    expect(sme).toEqual([expect.objectContaining({ symbol: "SIGMA.NS", sme: true, series: "SM", isin: "INE0LLO01016" })]);
  });

  it("parses BSE scrips, keeps only active ones, uses the scrip code ticker", () => {
    expect(bse.map(i => i.symbol)).toEqual(["500325.BO", "500570.BO", "543287.BO"]);
    expect(bse[0]).toMatchObject({ alias: "RELIANCE", series: "A", industry: "Refineries & Marketing" });
  });

  it("merges into one universe with indices and shares industry by ISIN", () => {
    expect(u.complete).toBe(true);
    expect(u.counts).toEqual({ nse: 5, nseSme: 1, bse: 3 });
    expect(u.instruments.find(i => i.symbol === "RELIANCE.NS")?.industry).toBe("Refineries & Marketing");
    expect(u.instruments.some(i => i.symbol === "^NSEI")).toBe(true);
  });
});

describe("symbol search", () => {
  const syms = (q: string, ex?: string) => searchInstruments(u, q, { exchange: ex }).map(i => i.symbol);
  it("ranks exact ticker first and prefers NSE", () => expect(syms("reliance").slice(0, 2)).toEqual(["RELIANCE.NS", "500325.BO"]));
  it("finds by BSE scrip code", () => expect(syms("500570")[0]).toBe("500570.BO"));
  it("finds by words of the company name", () => expect(syms("tata mot")[0]).toBe("TATAMOTORS.NS"));
  it("finds by ISIN", () => expect(syms("INE002A01018")).toContain("RELIANCE.NS"));
  it("finds BSE-only and SME companies", () => {
    expect(syms("small bse")).toEqual(["543287.BO"]);
    expect(syms("sigma")).toEqual(["SIGMA.NS"]);
  });
  it("filters by exchange", () => expect(syms("reliance", "BSE")).toEqual(["500325.BO"]));
});

describe("symbol validation", () => {
  it.each(["RELIANCE.NS", "M&M.NS", "BAJAJ-AUTO.NS", "500325.BO", "^NSEI", "^BSESN"])("accepts %s", s => expect(validateSymbol(s)).toBe(s));
  it.each(["RELIANCE", "../etc", "A.XX", "^", ""])("rejects %s", s => expect(() => validateSymbol(s)).toThrow());
});

// Shape of https://query1.finance.yahoo.com/v8/finance/chart/RELIANCE.NS?range=1d&interval=1m
const start = 1760413500; // 2025-10-14 09:15 IST
const yahoo = {
  chart: {
    result: [{
      meta: {
        currency: "INR", symbol: "RELIANCE.NS", exchangeName: "NSI", fullExchangeName: "NSE", regularMarketPrice: 1390.5,
        regularMarketTime: start + 600, regularMarketDayHigh: 1395, regularMarketDayLow: 1380, regularMarketVolume: 1234567,
        chartPreviousClose: 1375, previousClose: 1375, gmtoffset: 19800, longName: "Reliance Industries Limited",
        currentTradingPeriod: { regular: { start, end: start + 22500 } },
      },
      timestamp: [start, start + 60, start + 120],
      indicators: { quote: [{ open: [1380, 1385, null], high: [1386, 1391, null], low: [1379, 1384, null], close: [1385, 1390, null], volume: [1000, 2000, null] }] },
    }],
  },
};

describe("Yahoo feed parsing", () => {
  const c = parseYahooChart(yahoo)!;
  it("builds intraday bars and skips empty minutes", () => {
    expect(yahooIntradayBars(c)).toEqual([
      { time: start, open: 1380, high: 1386, low: 1379, close: 1385, volume: 1000 },
      { time: start + 60, open: 1385, high: 1391, low: 1384, close: 1390, volume: 2000 },
    ]);
  });
  it("dates daily bars in IST", () => expect(yahooDailyBars(c)[0].date).toBe("2025-10-14"));
  it("computes the live quote and market status", () => {
    const q = yahooQuote("RELIANCE.NS", c, start + 700);
    expect(q).toMatchObject({ price: 1390.5, previousClose: 1375, change: 15.5, changePct: 1.13, dayHigh: 1395, marketOpen: true, source: "yahoo", exchange: "NSE" });
    expect(yahooQuote("RELIANCE.NS", c, start + 30000).marketOpen).toBe(false);
  });
});

describe("Upstox feed parsing", () => {
  it("reverses newest-first candles", () => {
    const rows = parseUpstoxCandles({ candles: [["2025-10-14T09:16:00+05:30", 2, 3, 1, 2.5, 10, 0], ["2025-10-14T09:15:00+05:30", 1, 2, 1, 2, 5, 0]] });
    expect(rows.map(r => r.t)).toEqual(["2025-10-14T09:15:00+05:30", "2025-10-14T09:16:00+05:30"]);
  });
  it("parses a market quote", () => {
    const q = parseUpstoxQuote("RELIANCE.NS", { "NSE_EQ:RELIANCE": { last_price: 1390.5, net_change: 15.5, volume: 99, ohlc: { open: 1380, high: 1395, low: 1379, close: 1390.5 }, last_trade_time: String((start + 600) * 1000) } }, start + 700)!;
    expect(q).toMatchObject({ price: 1390.5, previousClose: 1375, changePct: 1.13, dayLow: 1379, marketOpen: true, source: "upstox" });
  });
});

describe("npm run symbols:sync (offline import)", () => {
  it("imports downloaded exchange files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "algolearn-mkt-"));
    const out = execFileSync("npx", ["tsx", "scripts/sync-symbols.ts", "--nse", "tests/fixtures/EQUITY_L.csv", "--sme", "tests/fixtures/SME_EQUITY_L.csv", "--bse", "tests/fixtures/bse.json"],
      { env: { ...process.env, MARKET_DATA_DIR: dir }, encoding: "utf8" });
    expect(out).toMatch(/Saved 9 listings: NSE 5, NSE SME 1, BSE 3/);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "universe.json"), "utf8")).instruments).toHaveLength(14);
  });
});
