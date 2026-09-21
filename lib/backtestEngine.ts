// lib/backtestEngine.ts — Pure TypeScript algorithmic trading backtest engine

import { OHLCVBar } from "./stockService";

export interface SignalPoint {
  date: string;
  price: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
}

export interface TradeRecord {
  date: string;
  type: "BUY" | "SELL";
  price: number;
  shares: number;
  value: number;
  pnl?: number;
}

export interface BacktestSummary {
  initial_capital: number;
  final_value: number;
  total_return_pct: number;
  realized_pnl: number;
  open_pnl: number;
  max_drawdown_pct: number;
  win_rate_pct: number;
  total_trades: number;
  winning_trades: number;
}

export interface BacktestResult {
  summary: BacktestSummary;
  ohlcv: OHLCVBar[];
  buy_signals: SignalPoint[];
  sell_signals: SignalPoint[];
  equity_curve: EquityPoint[];
  trades: TradeRecord[];
}

// ── Technical Indicator Helpers ─────────────────────────────────────────────

function calculateSMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) {
      sum -= data[i - period];
    }
    if (i >= period - 1) {
      result.push(sum / period);
    } else {
      result.push(null);
    }
  }
  return result;
}

function calculateEMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let prevEMA: number | null = null;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      const initialSlice = data.slice(0, period);
      const sma = initialSlice.reduce((a, b) => a + b, 0) / period;
      prevEMA = sma;
      result.push(sma);
    } else {
      const currentEMA: number = data[i] * k + (prevEMA ?? 0) * (1 - k);
      prevEMA = currentEMA;
      result.push(currentEMA);
    }
  }
  return result;
}

function calculateRSI(closes: number[], period: number = 14): (number | null)[] {
  const rsi: (number | null)[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      rsi.push(null);
      continue;
    }

    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    if (i <= period) {
      gains += gain;
      losses += loss;
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push(100 - 100 / (1 + rs));
      } else {
        rsi.push(null);
      }
    } else {
      const prevRSIIndex = i - 1;
      const prevGain = gains / period;
      const prevLoss = losses / period;
      const currentGain = (prevGain * (period - 1) + gain) / period;
      const currentLoss = (prevLoss * (period - 1) + loss) / period;
      gains = currentGain * period;
      losses = currentLoss * period;

      const rs = currentLoss === 0 ? 100 : currentGain / currentLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }
  return rsi;
}

function calculateMACD(closes: number[]) {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      macdLine.push((ema12[i] as number) - (ema26[i] as number));
    } else {
      macdLine.push(null);
    }
  }

  // Calculate signal line as 9-EMA of MACD line
  const validIndices: number[] = [];
  const validMACD: number[] = [];
  macdLine.forEach((val, idx) => {
    if (val !== null) {
      validIndices.push(idx);
      validMACD.push(val);
    }
  });

  const signalLineValid = calculateEMA(validMACD, 9);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  validIndices.forEach((idx, i) => {
    signalLine[idx] = signalLineValid[i];
  });

  return { macdLine, signalLine };
}

function calculateBollingerBands(closes: number[], period: number = 20, multiplier: number = 2) {
  const sma = calculateSMA(closes, period);
  const upperBand: (number | null)[] = [];
  const lowerBand: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (sma[i] === null) {
      upperBand.push(null);
      lowerBand.push(null);
      continue;
    }

    const slice = closes.slice(i - period + 1, i + 1);
    const mean = sma[i] as number;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    upperBand.push(mean + stdDev * multiplier);
    lowerBand.push(mean - stdDev * multiplier);
  }

  return { sma, upperBand, lowerBand };
}

// ── Execute Strategy on Data ────────────────────────────────────────────────

export function executeBacktest(
  bars: OHLCVBar[],
  strategyCode: string,
  initialCapital: number = 100000
): BacktestResult {
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const n = bars.length;

  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);

  const codeLower = strategyCode.toLowerCase();

  if (codeLower.includes("rsi") || codeLower.includes("oversold")) {
    // RSI Strategy
    const rsi = calculateRSI(closes, 14);
    for (let i = 1; i < n; i++) {
      if (rsi[i] !== null && rsi[i]! < 32 && (rsi[i - 1] === null || rsi[i - 1]! >= 30)) {
        buyFlags[i] = true;
      } else if (rsi[i] !== null && rsi[i]! > 68 && (rsi[i - 1] === null || rsi[i - 1]! <= 70)) {
        sellFlags[i] = true;
      }
    }
  } else if (codeLower.includes("macd") || codeLower.includes("signal_line")) {
    // MACD Strategy
    const { macdLine, signalLine } = calculateMACD(closes);
    for (let i = 1; i < n; i++) {
      if (macdLine[i] !== null && signalLine[i] !== null && macdLine[i - 1] !== null && signalLine[i - 1] !== null) {
        if (macdLine[i]! > signalLine[i]! && macdLine[i - 1]! <= signalLine[i - 1]!) {
          buyFlags[i] = true;
        } else if (macdLine[i]! < signalLine[i]! && macdLine[i - 1]! >= signalLine[i - 1]!) {
          sellFlags[i] = true;
        }
      }
    }
  } else if (codeLower.includes("bollinger") || codeLower.includes("upper_band")) {
    // Bollinger Bands Strategy
    const { upperBand, lowerBand } = calculateBollingerBands(closes, 20, 2);
    for (let i = 1; i < n; i++) {
      if (lowerBand[i] !== null && upperBand[i] !== null) {
        if (closes[i] <= lowerBand[i]!) {
          buyFlags[i] = true;
        } else if (closes[i] >= upperBand[i]!) {
          sellFlags[i] = true;
        }
      }
    }
  } else if (codeLower.includes("supertrend") || codeLower.includes("atr")) {
    // ATR / Supertrend-style
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    for (let i = 1; i < n; i++) {
      if (sma20[i] !== null && sma50[i] !== null && sma20[i - 1] !== null && sma50[i - 1] !== null) {
        if (sma20[i]! > sma50[i]! && sma20[i - 1]! <= sma50[i - 1]!) {
          buyFlags[i] = true;
        } else if (sma20[i]! < sma50[i]! && sma20[i - 1]! >= sma50[i - 1]!) {
          sellFlags[i] = true;
        }
      }
    }
  } else {
    // Default: Moving Average Crossover (Fast vs Slow)
    // Extract numbers if present, else 20 and 50
    let fastPeriod = 20;
    let slowPeriod = 50;
    const smaMatches = strategyCode.match(/rolling\(window=(\d+)\)/g);
    if (smaMatches && smaMatches.length >= 2) {
      const p1 = parseInt(smaMatches[0].replace(/\D/g, ""), 10);
      const p2 = parseInt(smaMatches[1].replace(/\D/g, ""), 10);
      if (p1 && p2) {
        fastPeriod = Math.min(p1, p2);
        slowPeriod = Math.max(p1, p2);
      }
    }

    const fastSMA = calculateSMA(closes, fastPeriod);
    const slowSMA = calculateSMA(closes, slowPeriod);

    for (let i = 1; i < n; i++) {
      if (fastSMA[i] !== null && slowSMA[i] !== null && fastSMA[i - 1] !== null && slowSMA[i - 1] !== null) {
        if (fastSMA[i]! > slowSMA[i]! && fastSMA[i - 1]! <= slowSMA[i - 1]!) {
          buyFlags[i] = true;
        } else if (fastSMA[i]! < slowSMA[i]! && fastSMA[i - 1]! >= slowSMA[i - 1]!) {
          sellFlags[i] = true;
        }
      }
    }
  }

  // ── Portfolio Simulation ──────────────────────────────────────────────────
  let capital = initialCapital;
  let shares = 0;
  let avgBuyPrice = 0;
  let realizedPnL = 0;

  const trades: TradeRecord[] = [];
  const equityCurve: EquityPoint[] = [];
  const buySignals: SignalPoint[] = [];
  const sellSignals: SignalPoint[] = [];

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const price = bar.close;
    const date = bar.date;

    equityCurve.push({
      date,
      equity: Math.round((capital + shares * price) * 100) / 100,
    });

    // Buy logic
    if (buyFlags[i] && shares === 0 && capital > price) {
      shares = Math.floor(capital / price);
      const cost = shares * price;
      avgBuyPrice = price;
      capital -= cost;

      trades.push({
        date,
        type: "BUY",
        price: Math.round(price * 100) / 100,
        shares,
        value: Math.round(cost * 100) / 100,
      });
      buySignals.push({
        date,
        price: Math.round(price * 100) / 100,
      });
    }
    // Sell logic
    else if (sellFlags[i] && shares > 0) {
      const proceeds = shares * price;
      const tradePnL = (price - avgBuyPrice) * shares;
      realizedPnL += tradePnL;
      capital += proceeds;

      trades.push({
        date,
        type: "SELL",
        price: Math.round(price * 100) / 100,
        shares,
        value: Math.round(proceeds * 100) / 100,
        pnl: Math.round(tradePnL * 100) / 100,
      });
      sellSignals.push({
        date,
        price: Math.round(price * 100) / 100,
      });

      shares = 0;
      avgBuyPrice = 0;
    }
  }

  const lastPrice = bars[bars.length - 1]?.close || 0;
  const openPnL = shares > 0 ? (lastPrice - avgBuyPrice) * shares : 0;
  const finalValue = capital + shares * lastPrice;
  const totalReturnPct = ((finalValue - initialCapital) / initialCapital) * 100;

  const sellTrades = trades.filter(t => t.type === "SELL");
  const winningTrades = sellTrades.filter(t => (t.pnl || 0) > 0).length;
  const winRatePct = sellTrades.length > 0 ? (winningTrades / sellTrades.length) * 100 : 0;

  // Max Drawdown calculation
  let peak = initialCapital;
  let maxDD = 0;
  for (const pt of equityCurve) {
    if (pt.equity > peak) {
      peak = pt.equity;
    }
    const dd = ((peak - pt.equity) / peak) * 100;
    if (dd > maxDD) {
      maxDD = dd;
    }
  }

  return {
    summary: {
      initial_capital: Math.round(initialCapital * 100) / 100,
      final_value: Math.round(finalValue * 100) / 100,
      total_return_pct: Math.round(totalReturnPct * 100) / 100,
      realized_pnl: Math.round(realizedPnL * 100) / 100,
      open_pnl: Math.round(openPnL * 100) / 100,
      max_drawdown_pct: Math.round(maxDD * 100) / 100,
      win_rate_pct: Math.round(winRatePct * 100) / 100,
      total_trades: trades.length,
      winning_trades: winningTrades,
    },
    ohlcv: bars,
    buy_signals: buySignals,
    sell_signals: sellSignals,
    equity_curve: equityCurve,
    trades,
  };
}
