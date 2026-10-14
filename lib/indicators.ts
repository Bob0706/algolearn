// lib/indicators.ts — causal technical indicators (value at i uses bars ≤ i only).
// Semantics match pandas so native template backtests agree with the Python engine.

export type Series = (number | null)[];

/** pandas: s.rolling(period).mean() */
export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** pandas: s.rolling(period).std() (sample std, ddof=1) */
export function rollingStd(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let mean = 0;
    for (let j = i - period + 1; j <= i; j++) mean += values[j];
    mean /= period;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(sq / (period - 1));
  }
  return out;
}

/** pandas: s.ewm(span=span, adjust=False).mean() */
export function ema(values: number[], span: number): number[] {
  const alpha = 2 / (span + 1);
  const out: number[] = [];
  values.forEach((v, i) => out.push(i === 0 ? v : alpha * v + (1 - alpha) * out[i - 1]));
  return out;
}

/** pandas: s.ewm(alpha=alpha, adjust=False).mean() over a series whose first value may be NaN */
function ewmAlpha(values: Series, alpha: number): Series {
  const out: Series = [];
  let prev: number | null = null;
  for (const v of values) {
    if (v === null) { out.push(prev); continue; }
    prev = prev === null ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/** Wilder's RSI: gains/losses smoothed with ewm(alpha=1/period, adjust=False, min_periods=period). */
export function rsi(closes: number[], period = 14): Series {
  const gains: Series = [null];
  const losses: Series = [null];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const ag = ewmAlpha(gains, 1 / period);
  const al = ewmAlpha(losses, 1 / period);
  return closes.map((_, i) => {
    if (i < period || ag[i] === null || al[i] === null) return null;
    if (al[i] === 0) return 100;
    return 100 - 100 / (1 + ag[i]! / al[i]!);
  });
}

/** Highest value of the previous `period` bars, excluding bar i (pandas: s.rolling(p).max().shift(1)). */
export function priorHigh(values: number[], period: number): Series {
  return values.map((_, i) => (i < period ? null : Math.max(...values.slice(i - period, i))));
}

export function priorLow(values: number[], period: number): Series {
  return values.map((_, i) => (i < period ? null : Math.min(...values.slice(i - period, i))));
}

/** True range averaged with a simple rolling mean (pandas: tr.rolling(period).mean()). */
export function atr(high: number[], low: number[], close: number[], period: number): Series {
  const tr = high.map((h, i) =>
    i === 0 ? h - low[i] : Math.max(h - low[i], Math.abs(h - close[i - 1]), Math.abs(low[i] - close[i - 1])),
  );
  return sma(tr, period);
}
