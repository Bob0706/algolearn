import { describe, expect, it } from "vitest";
import { INDIA_DELIVERY, orderCharges, simulatePortfolio, ZERO_COST } from "@/lib/portfolio";
import { OHLCVBar } from "@/lib/types";

const bar = (date: string, open: number, close: number): OHLCVBar => ({
  date, open, close, high: Math.max(open, close), low: Math.min(open, close), volume: 1000,
});

const bars = [
  bar("2024-01-01", 100, 100),
  bar("2024-01-02", 110, 120), // buy signal on day 1 fills here at 110, not at day-1 close 100
  bar("2024-01-03", 130, 140),
  bar("2024-01-04", 150, 160), // sell signal on day 3 fills here at 150
  bar("2024-01-05", 155, 150),
];

describe("simulatePortfolio", () => {
  it("fills signals at the next bar's open (no look-ahead)", () => {
    const r = simulatePortfolio(bars, [true, false, false, false, false], [false, false, true, false, false], 1100, ZERO_COST);
    expect(r.trades.map(t => [t.date, t.type, t.price, t.shares])).toEqual([
      ["2024-01-02", "BUY", 110, 10],
      ["2024-01-04", "SELL", 150, 10],
    ]);
    expect(r.summary.final_value).toBe(1500);
    expect(r.summary.realized_pnl).toBe(400);
    expect(r.summary.win_rate_pct).toBe(100);
    expect(r.summary.buy_hold_return_pct).toBe(50); // 100 open → 150 close
  });

  it("ignores a signal on the final bar (cannot be filled)", () => {
    const r = simulatePortfolio(bars, [false, false, false, false, true], [false, false, false, false, false], 1000, ZERO_COST);
    expect(r.trades).toHaveLength(0);
    expect(r.buy_signals).toHaveLength(0);
  });

  it("deducts Indian delivery charges and never overspends cash", () => {
    const r = simulatePortfolio(bars, [true, false, false, false, false], [false, false, true, false, false], 100_000, INDIA_DELIVERY);
    const buy = r.trades[0];
    expect(buy.value + buy.costs).toBeLessThanOrEqual(100_000);
    expect(r.summary.total_costs).toBeGreaterThan(0);
    // STT alone is 0.1% each side
    expect(orderCharges(100_000, "SELL", INDIA_DELIVERY)).toBeGreaterThan(100);
    expect(r.summary.realized_pnl).toBeLessThan((150 - 110) * buy.shares);
  });

  it("rejects mismatched signal arrays", () => {
    expect(() => simulatePortfolio(bars, [true], [false], 1000)).toThrow();
  });
});
