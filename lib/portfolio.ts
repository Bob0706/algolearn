// lib/portfolio.ts — the single accounting engine for every backtest.
//
// Rules (shown to users as "assumptions"):
//  • Long-only, one position at a time, invests all available cash.
//  • A signal on bar i's close is FILLED AT BAR i+1's OPEN — you cannot trade
//    on a close you have only just seen. Signals on the last bar are not filled.
//  • Slippage and Indian equity-delivery charges are deducted on every fill.

import { BacktestSummary, EquityPoint, OHLCVBar, SignalPoint, Trade } from "./types";

export interface CostModel {
  brokeragePct: number;      // of turnover
  brokerageCap: number;      // ₹ per order
  sttPct: number;            // securities transaction tax, buy + sell (delivery)
  exchangePct: number;       // NSE transaction charge
  sebiPct: number;           // SEBI turnover fee
  stampBuyPct: number;       // stamp duty, buy side only
  gstPct: number;            // on brokerage + exchange + SEBI fees
  slippageBps: number;       // adverse price move per fill, basis points
}

// Approximate NSE equity-delivery charges (2025–26). Brokers differ; these are
// conservative defaults for learning, not a quote.
export const INDIA_DELIVERY: CostModel = {
  brokeragePct: 0.1,
  brokerageCap: 20,
  sttPct: 0.1,
  exchangePct: 0.00297,
  sebiPct: 0.0001,
  stampBuyPct: 0.015,
  gstPct: 18,
  slippageBps: 5,
};

export const ZERO_COST: CostModel = {
  brokeragePct: 0, brokerageCap: 0, sttPct: 0, exchangePct: 0, sebiPct: 0, stampBuyPct: 0, gstPct: 0, slippageBps: 0,
};

export function orderCharges(turnover: number, side: "BUY" | "SELL", m: CostModel): number {
  const brokerage = Math.min((turnover * m.brokeragePct) / 100, m.brokerageCap);
  const stt = (turnover * m.sttPct) / 100;
  const exchange = (turnover * m.exchangePct) / 100;
  const sebi = (turnover * m.sebiPct) / 100;
  const stamp = side === "BUY" ? (turnover * m.stampBuyPct) / 100 : 0;
  const gst = ((brokerage + exchange + sebi) * m.gstPct) / 100;
  return brokerage + stt + exchange + sebi + stamp + gst;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export interface PortfolioOutput {
  summary: BacktestSummary;
  trades: Trade[];
  equity_curve: EquityPoint[];
  buy_signals: SignalPoint[];
  sell_signals: SignalPoint[];
  assumptions: string[];
}

export function simulatePortfolio(
  bars: OHLCVBar[],
  buy: boolean[],
  sell: boolean[],
  initialCapital: number,
  costs: CostModel = INDIA_DELIVERY,
): PortfolioOutput {
  const n = bars.length;
  if (buy.length !== n || sell.length !== n) throw new Error("signal arrays must match the number of bars");

  let cash = initialCapital;
  let shares = 0;
  let entryCost = 0; // cash spent on the open position, including charges
  let realized = 0;
  let totalCosts = 0;
  let barsInMarket = 0;
  let pending: "BUY" | "SELL" | null = null;

  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const buySignals: SignalPoint[] = [];
  const sellSignals: SignalPoint[] = [];
  const firstOpen = bars[0]?.open || bars[0]?.close || 1;

  for (let i = 0; i < n; i++) {
    const bar = bars[i];

    // 1) fill yesterday's signal at today's open
    if (pending === "BUY" && shares === 0) {
      const price = bar.open * (1 + costs.slippageBps / 10_000);
      // largest share count whose cost + charges fits in cash
      let qty = Math.floor(cash / price);
      while (qty > 0 && qty * price + orderCharges(qty * price, "BUY", costs) > cash) qty--;
      if (qty > 0) {
        const value = qty * price;
        const fee = orderCharges(value, "BUY", costs);
        cash -= value + fee;
        shares = qty;
        entryCost = value + fee;
        totalCosts += fee;
        trades.push({ date: bar.date, type: "BUY", price: r2(price), shares: qty, value: r2(value), costs: r2(fee) });
      }
    } else if (pending === "SELL" && shares > 0) {
      const price = bar.open * (1 - costs.slippageBps / 10_000);
      const value = shares * price;
      const fee = orderCharges(value, "SELL", costs);
      const pnl = value - fee - entryCost;
      cash += value - fee;
      realized += pnl;
      totalCosts += fee;
      trades.push({ date: bar.date, type: "SELL", price: r2(price), shares, value: r2(value), costs: r2(fee), pnl: r2(pnl) });
      shares = 0;
      entryCost = 0;
    }
    pending = null;

    // 2) mark to market at today's close
    if (shares > 0) barsInMarket++;
    equity.push({
      date: bar.date,
      equity: r2(cash + shares * bar.close),
      benchmark: r2((initialCapital * bar.close) / firstOpen),
    });

    // 3) read today's signal; it can only be acted on tomorrow
    if (i < n - 1) {
      if (buy[i] && shares === 0) {
        pending = "BUY";
        buySignals.push({ date: bar.date, price: r2(bar.close) });
      } else if (sell[i] && shares > 0) {
        pending = "SELL";
        sellSignals.push({ date: bar.date, price: r2(bar.close) });
      }
    }
  }

  const last = bars[n - 1];
  const finalValue = cash + shares * (last?.close ?? 0);
  const openPnl = shares > 0 ? shares * last.close - entryCost : 0;
  const totalReturn = ((finalValue - initialCapital) / initialCapital) * 100;
  const buyHold = last ? ((last.close - firstOpen) / firstOpen) * 100 : 0;

  // max drawdown
  let peak = initialCapital;
  let maxDD = 0;
  for (const p of equity) {
    peak = Math.max(peak, p.equity);
    maxDD = Math.max(maxDD, ((peak - p.equity) / peak) * 100);
  }

  // annualised Sharpe on daily equity returns (risk-free rate 0, 252 trading days)
  const rets: number[] = [];
  for (let i = 1; i < equity.length; i++) rets.push(equity[i].equity / equity[i - 1].equity - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(rets.length - 1, 1));
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(252) : 0;

  const years = n / 252;
  const cagr = years > 0 && finalValue > 0 ? (Math.pow(finalValue / initialCapital, 1 / years) - 1) * 100 : 0;

  const sells = trades.filter(t => t.type === "SELL");
  const wins = sells.filter(t => (t.pnl ?? 0) > 0).length;

  return {
    summary: {
      initial_capital: r2(initialCapital),
      final_value: r2(finalValue),
      total_return_pct: r2(totalReturn),
      buy_hold_return_pct: r2(buyHold),
      cagr_pct: r2(cagr),
      sharpe_ratio: r2(sharpe),
      max_drawdown_pct: r2(maxDD),
      win_rate_pct: sells.length ? r2((wins / sells.length) * 100) : 0,
      total_trades: trades.length,
      closed_trades: sells.length,
      winning_trades: wins,
      exposure_pct: n ? r2((barsInMarket / n) * 100) : 0,
      total_costs: r2(totalCosts),
      realized_pnl: r2(realized),
      open_pnl: r2(openPnl),
    },
    trades,
    equity_curve: equity,
    buy_signals: buySignals,
    sell_signals: sellSignals,
    assumptions: [
      "Long-only; one position at a time using all available cash.",
      "Signals are generated on a bar's close and filled at the NEXT bar's open (no look-ahead).",
      `Slippage ${costs.slippageBps} bps per fill plus approximate NSE delivery charges (brokerage ≤ ₹${costs.brokerageCap}, STT ${costs.sttPct}%, stamp duty, exchange & SEBI fees, GST).`,
      "Benchmark = buy & hold from the first bar's open. Sharpe uses daily returns with a 0% risk-free rate.",
      "Past performance does not predict future results.",
    ],
  };
}
