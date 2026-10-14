// lib/strategyTemplates.ts — parametrised strategy templates.
//
// Each template produces (a) beginner-friendly Python for the sandboxed engine and
// (b) a native TypeScript twin with identical signal semantics. The native twin is
// only used when the Python engine is offline AND the submitted code is a
// byte-for-byte unmodified template (checked via its marker line), so a backtest
// never silently runs different logic from the code the user is looking at.

import { OHLCVBar, StrategyTemplate } from "./types";
import { atr, ema, priorHigh, priorLow, rollingStd, rsi, sma } from "./indicators";

type Params = Record<string, number>;

interface TemplateDef {
  name: string;
  description: (p: Params) => string;
  defaults: Params;
  limits: Record<string, [number, number]>;
  python: (p: Params) => string;
  native: (bars: OHLCVBar[], p: Params) => { buy: boolean[]; sell: boolean[] };
}

const crossUp = (a: (number | null)[], b: (number | null)[], i: number) =>
  i > 0 && a[i] !== null && b[i] !== null && a[i - 1] !== null && b[i - 1] !== null &&
  a[i]! > b[i]! && a[i - 1]! <= b[i - 1]!;
const crossDown = (a: (number | null)[], b: (number | null)[], i: number) =>
  i > 0 && a[i] !== null && b[i] !== null && a[i - 1] !== null && b[i - 1] !== null &&
  a[i]! < b[i]! && a[i - 1]! >= b[i - 1]!;

const closesOf = (bars: OHLCVBar[]) => bars.map(b => b.close);

const TEMPLATES: Record<string, TemplateDef> = {
  sma_crossover: {
    name: "Moving Average Crossover",
    description: p => `Buy when the ${p.fast}-day SMA crosses above the ${p.slow}-day SMA (golden cross); sell when it crosses below (death cross).`,
    defaults: { fast: 20, slow: 50 },
    limits: { fast: [2, 250], slow: [3, 400] },
    python: p => `import pandas as pd

def run_strategy(df):
    """
    Moving Average Crossover
    Buy  when the ${p.fast}-day average crosses ABOVE the ${p.slow}-day average (golden cross).
    Sell when it crosses BELOW (death cross).
    """
    df = df.copy()
    # Average closing price over the last N days (needs N days of history first)
    fast = df['Close'].rolling(window=${p.fast}).mean()
    slow = df['Close'].rolling(window=${p.slow}).mean()
    df['SMA_fast'] = fast
    df['SMA_slow'] = slow

    # A "cross" means: today fast > slow, but yesterday it was not
    df['Buy'] = (fast > slow) & (fast.shift(1) <= slow.shift(1))
    df['Sell'] = (fast < slow) & (fast.shift(1) >= slow.shift(1))
    return df
`,
    native: (bars, p) => {
      const c = closesOf(bars), f = sma(c, p.fast), s = sma(c, p.slow);
      return { buy: c.map((_, i) => crossUp(f, s, i)), sell: c.map((_, i) => crossDown(f, s, i)) };
    },
  },

  ema_crossover: {
    name: "EMA Crossover",
    description: p => `Buy when the ${p.fast}-day EMA crosses above the ${p.slow}-day EMA; sell when it crosses below.`,
    defaults: { fast: 12, slow: 26 },
    limits: { fast: [2, 250], slow: [3, 400] },
    python: p => `import pandas as pd

def run_strategy(df):
    """
    Exponential Moving Average (EMA) Crossover
    EMAs weight recent prices more, so they react faster than simple averages.
    Buy when the ${p.fast}-day EMA crosses above the ${p.slow}-day EMA; sell on the opposite cross.
    """
    df = df.copy()
    fast = df['Close'].ewm(span=${p.fast}, adjust=False).mean()
    slow = df['Close'].ewm(span=${p.slow}, adjust=False).mean()
    df['EMA_fast'] = fast
    df['EMA_slow'] = slow

    df['Buy'] = (fast > slow) & (fast.shift(1) <= slow.shift(1))
    df['Sell'] = (fast < slow) & (fast.shift(1) >= slow.shift(1))
    return df
`,
    native: (bars, p) => {
      const c = closesOf(bars), f = ema(c, p.fast), s = ema(c, p.slow);
      return { buy: c.map((_, i) => crossUp(f, s, i)), sell: c.map((_, i) => crossDown(f, s, i)) };
    },
  },

  rsi_mean_reversion: {
    name: "RSI Mean Reversion",
    description: p => `Buy when the ${p.period}-day RSI drops below ${p.lower} (oversold); sell when it rises above ${p.upper} (overbought).`,
    defaults: { period: 14, lower: 30, upper: 70 },
    limits: { period: [2, 100], lower: [1, 50], upper: [50, 99] },
    python: p => `import pandas as pd

def run_strategy(df):
    """
    RSI Mean Reversion (Wilder's RSI, ${p.period} days)
    RSI measures recent gains vs losses on a 0-100 scale.
    Buy  when RSI < ${p.lower} (oversold: price fell a lot, may bounce)
    Sell when RSI > ${p.upper} (overbought: price rose a lot, may pull back)
    """
    df = df.copy()
    delta = df['Close'].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    # Wilder's smoothing = exponential average with alpha = 1/period
    avg_gain = gain.ewm(alpha=1/${p.period}, adjust=False, min_periods=${p.period}).mean()
    avg_loss = loss.ewm(alpha=1/${p.period}, adjust=False, min_periods=${p.period}).mean()
    rs = avg_gain / avg_loss
    df['RSI'] = 100 - (100 / (1 + rs))

    df['Buy'] = df['RSI'] < ${p.lower}
    df['Sell'] = df['RSI'] > ${p.upper}
    return df
`,
    native: (bars, p) => {
      const r = rsi(closesOf(bars), p.period);
      return { buy: r.map(v => v !== null && v < p.lower), sell: r.map(v => v !== null && v > p.upper) };
    },
  },

  macd_strategy: {
    name: "MACD Crossover",
    description: p => `Buy when the MACD (${p.fast},${p.slow}) line crosses above its ${p.signal}-day signal line; sell on the opposite cross.`,
    defaults: { fast: 12, slow: 26, signal: 9 },
    limits: { fast: [2, 100], slow: [3, 200], signal: [2, 50] },
    python: p => `import pandas as pd

def run_strategy(df):
    """
    MACD (Moving Average Convergence Divergence)
    MACD line   = ${p.fast}-day EMA - ${p.slow}-day EMA  (momentum)
    Signal line = ${p.signal}-day EMA of the MACD line
    Buy when MACD crosses above the signal line, sell when it crosses below.
    """
    df = df.copy()
    ema_fast = df['Close'].ewm(span=${p.fast}, adjust=False).mean()
    ema_slow = df['Close'].ewm(span=${p.slow}, adjust=False).mean()
    macd = ema_fast - ema_slow
    signal = macd.ewm(span=${p.signal}, adjust=False).mean()
    df['MACD'] = macd
    df['Signal_Line'] = signal

    df['Buy'] = (macd > signal) & (macd.shift(1) <= signal.shift(1))
    df['Sell'] = (macd < signal) & (macd.shift(1) >= signal.shift(1))
    return df
`,
    native: (bars, p) => {
      const c = closesOf(bars);
      const ef = ema(c, p.fast), es = ema(c, p.slow);
      const macd = c.map((_, i) => ef[i] - es[i]);
      const sig = ema(macd, p.signal);
      return { buy: c.map((_, i) => crossUp(macd, sig, i)), sell: c.map((_, i) => crossDown(macd, sig, i)) };
    },
  },

  bollinger_bands: {
    name: "Bollinger Bands",
    description: p => `Buy when the close touches the lower band (${p.period}-day SMA − ${p.std}σ); sell when it touches the upper band.`,
    defaults: { period: 20, std: 2 },
    limits: { period: [5, 200], std: [0.5, 4] },
    python: p => `import pandas as pd

def run_strategy(df):
    """
    Bollinger Bands (${p.period} days, ${p.std} standard deviations)
    The bands widen when the market is volatile and narrow when it is calm.
    Buy  when the close is at or below the lower band (unusually cheap)
    Sell when the close is at or above the upper band (unusually expensive)
    """
    df = df.copy()
    mid = df['Close'].rolling(window=${p.period}).mean()
    std = df['Close'].rolling(window=${p.period}).std()
    df['Upper_Band'] = mid + ${p.std} * std
    df['Lower_Band'] = mid - ${p.std} * std

    df['Buy'] = df['Close'] <= df['Lower_Band']
    df['Sell'] = df['Close'] >= df['Upper_Band']
    return df
`,
    native: (bars, p) => {
      const c = closesOf(bars), m = sma(c, p.period), s = rollingStd(c, p.period);
      return {
        buy: c.map((v, i) => m[i] !== null && s[i] !== null && v <= m[i]! - p.std * s[i]!),
        sell: c.map((v, i) => m[i] !== null && s[i] !== null && v >= m[i]! + p.std * s[i]!),
      };
    },
  },

  breakout: {
    name: "Donchian Breakout",
    description: p => `Buy when the close breaks above the highest high of the previous ${p.lookback} days; sell when it breaks below the lowest low.`,
    defaults: { lookback: 20 },
    limits: { lookback: [5, 250] },
    python: p => `import pandas as pd

def run_strategy(df):
    """
    Donchian Channel Breakout (${p.lookback} days)
    Buy  when today's close is above the highest high of the PREVIOUS ${p.lookback} days.
    Sell when today's close is below the lowest low of the PREVIOUS ${p.lookback} days.
    .shift(1) makes sure today's own bar is not part of the channel.
    """
    df = df.copy()
    df['Channel_High'] = df['High'].rolling(window=${p.lookback}).max().shift(1)
    df['Channel_Low'] = df['Low'].rolling(window=${p.lookback}).min().shift(1)

    df['Buy'] = df['Close'] > df['Channel_High']
    df['Sell'] = df['Close'] < df['Channel_Low']
    return df
`,
    native: (bars, p) => {
      const hi = priorHigh(bars.map(b => b.high), p.lookback);
      const lo = priorLow(bars.map(b => b.low), p.lookback);
      return {
        buy: bars.map((b, i) => hi[i] !== null && b.close > hi[i]!),
        sell: bars.map((b, i) => lo[i] !== null && b.close < lo[i]!),
      };
    },
  },

  supertrend: {
    name: "Supertrend",
    description: p => `Follow the trend with an ATR(${p.period}) × ${p.multiplier} Supertrend: buy when it flips up, sell when it flips down.`,
    defaults: { period: 10, multiplier: 3 },
    limits: { period: [2, 100], multiplier: [0.5, 10] },
    python: p => `import pandas as pd
import numpy as np

def run_strategy(df):
    """
    Supertrend (ATR ${p.period}, multiplier ${p.multiplier})
    A trailing line under the price in an uptrend and above it in a downtrend.
    Buy when the trend flips UP, sell when it flips DOWN.
    """
    df = df.copy()
    prev_close = df['Close'].shift(1)
    true_range = pd.concat([
        df['High'] - df['Low'],
        (df['High'] - prev_close).abs(),
        (df['Low'] - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr = true_range.rolling(window=${p.period}).mean()
    mid = (df['High'] + df['Low']) / 2
    basic_upper = (mid + ${p.multiplier} * atr).to_numpy()
    basic_lower = (mid - ${p.multiplier} * atr).to_numpy()
    close = df['Close'].to_numpy()

    n = len(df)
    upper = np.full(n, np.nan)
    lower = np.full(n, np.nan)
    trend = np.zeros(n)          # 1 = uptrend, -1 = downtrend, 0 = not enough data
    for i in range(n):
        if np.isnan(basic_upper[i]):
            continue
        if i == 0 or np.isnan(upper[i - 1]):
            upper[i], lower[i], trend[i] = basic_upper[i], basic_lower[i], 1
            continue
        # Bands only move in the trend's favour (they "ratchet")
        upper[i] = basic_upper[i] if (basic_upper[i] < upper[i - 1] or close[i - 1] > upper[i - 1]) else upper[i - 1]
        lower[i] = basic_lower[i] if (basic_lower[i] > lower[i - 1] or close[i - 1] < lower[i - 1]) else lower[i - 1]
        if trend[i - 1] == 1 and close[i] < lower[i]:
            trend[i] = -1
        elif trend[i - 1] == -1 and close[i] > upper[i]:
            trend[i] = 1
        else:
            trend[i] = trend[i - 1]

    prev_trend = np.concatenate(([0.0], trend[:-1]))
    df['Supertrend_Dir'] = trend
    df['Buy'] = (trend == 1) & (prev_trend == -1)
    df['Sell'] = (trend == -1) & (prev_trend == 1)
    return df
`,
    native: (bars, p) => {
      const n = bars.length;
      const a = atr(bars.map(b => b.high), bars.map(b => b.low), closesOf(bars), p.period);
      const bu = bars.map((b, i) => (a[i] === null ? null : (b.high + b.low) / 2 + p.multiplier * a[i]!));
      const bl = bars.map((b, i) => (a[i] === null ? null : (b.high + b.low) / 2 - p.multiplier * a[i]!));
      const up: (number | null)[] = new Array(n).fill(null);
      const lo: (number | null)[] = new Array(n).fill(null);
      const trend: number[] = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        if (bu[i] === null) continue;
        if (i === 0 || up[i - 1] === null) { up[i] = bu[i]; lo[i] = bl[i]; trend[i] = 1; continue; }
        const pc = bars[i - 1].close, c = bars[i].close;
        up[i] = bu[i]! < up[i - 1]! || pc > up[i - 1]! ? bu[i] : up[i - 1];
        lo[i] = bl[i]! > lo[i - 1]! || pc < lo[i - 1]! ? bl[i] : lo[i - 1];
        if (trend[i - 1] === 1 && c < lo[i]!) trend[i] = -1;
        else if (trend[i - 1] === -1 && c > up[i]!) trend[i] = 1;
        else trend[i] = trend[i - 1];
      }
      return {
        buy: trend.map((t, i) => t === 1 && (i === 0 ? 0 : trend[i - 1]) === -1),
        sell: trend.map((t, i) => t === -1 && (i === 0 ? 0 : trend[i - 1]) === 1),
      };
    },
  },
};

const MARKER = "# algolearn-template:";

function clampParams(def: TemplateDef, params: Params): Params {
  const out: Params = { ...def.defaults };
  for (const [k, [lo, hi]] of Object.entries(def.limits)) {
    const v = params[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.min(hi, Math.max(lo, v));
  }
  if ("fast" in out && "slow" in out && out.fast >= out.slow) {
    [out.fast, out.slow] = [Math.min(out.fast, out.slow), Math.max(out.fast, out.slow)];
    if (out.fast === out.slow) out.slow = out.fast + 1;
  }
  if ("lower" in out && "upper" in out && out.lower >= out.upper) {
    out.lower = def.defaults.lower;
    out.upper = def.defaults.upper;
  }
  return out;
}

export function buildTemplate(id: string, params: Params = {}): StrategyTemplate {
  const def = TEMPLATES[id];
  if (!def) throw new Error(`unknown template ${id}`);
  const p = clampParams(def, params);
  const code = `${MARKER} ${id} ${JSON.stringify(p)}\n${def.python(p)}`;
  return { id, name: def.name, description: def.description(p), code, params: p };
}

export function listTemplates(): StrategyTemplate[] {
  return Object.keys(TEMPLATES).map(id => buildTemplate(id));
}

const normalise = (code: string) => code.replace(/\r\n/g, "\n").split("\n").map(l => l.trimEnd()).join("\n").trim();

/** If `code` is an unmodified template, return its id/params so it can run natively. */
export function identifyTemplate(code: string): { id: string; params: Params } | null {
  const first = code.trimStart().split("\n", 1)[0];
  if (!first.startsWith(MARKER)) return null;
  const m = first.slice(MARKER.length).trim().match(/^(\w+)\s+(\{.*\})$/);
  if (!m || !TEMPLATES[m[1]]) return null;
  let params: Params;
  try { params = JSON.parse(m[2]); } catch { return null; }
  const rebuilt = buildTemplate(m[1], params);
  return normalise(rebuilt.code) === normalise(code) ? { id: m[1], params: rebuilt.params } : null;
}

export function runNativeTemplate(id: string, params: Params, bars: OHLCVBar[]) {
  return TEMPLATES[id].native(bars, clampParams(TEMPLATES[id], params));
}

// ─── Plain-English → template (offline fallback when no LLM is configured) ──

export interface ParsedDescription {
  templateId: string;
  params: Params;
  understood: string;
  confident: boolean;
}

const num = (s: string | undefined) => (s === undefined ? undefined : Number(s));

/** Numbers written as "20-day", "20 day", "20 period", "20d". */
function dayNumbers(text: string): number[] {
  return [...text.matchAll(/(\d+(?:\.\d+)?)\s*-?\s*(?:day|days|period|periods|d\b|bar|bars|session|sessions)/g)].map(m => Number(m[1]));
}

export function parseStrategyDescription(description: string): ParsedDescription {
  const t = description.toLowerCase();
  const days = dayNumbers(t);
  let id = "sma_crossover";
  const params: Params = {};
  let confident = true;

  if (/\brsi\b|relative strength|oversold|overbought/.test(t)) {
    id = "rsi_mean_reversion";
    const period = t.match(/rsi\s*\(?\s*(\d+)/)?.[1] ?? (days.length ? String(days[0]) : undefined);
    const lower = t.match(/(?:below|under|less than|<|drops? (?:below|under|to)|falls? (?:below|under|to))\s*(\d+)/)?.[1];
    const upper = t.match(/(?:above|over|more than|greater than|>|rises? (?:above|over|to)|crosses (?:above|over))\s*(\d+)/)?.[1];
    Object.assign(params, { period: num(period), lower: num(lower), upper: num(upper) });
  } else if (/macd|convergence|divergence/.test(t)) {
    id = "macd_strategy";
    const m = t.match(/(\d+)\s*[,/ ]\s*(\d+)\s*[,/ ]\s*(\d+)/);
    if (m) Object.assign(params, { fast: +m[1], slow: +m[2], signal: +m[3] });
  } else if (/bollinger|\bbands?\b|standard deviation/.test(t)) {
    id = "bollinger_bands";
    const std = t.match(/(\d+(?:\.\d+)?)\s*(?:std|standard dev|sigma|σ)/)?.[1];
    Object.assign(params, { period: days[0], std: num(std) });
  } else if (/supertrend|super trend|\batr\b|average true range/.test(t)) {
    id = "supertrend";
    const mult = t.match(/(?:multiplier|factor|x|×)\s*(\d+(?:\.\d+)?)/)?.[1] ?? t.match(/(\d+(?:\.\d+)?)\s*(?:x|×)\s*atr/)?.[1];
    Object.assign(params, { period: days[0], multiplier: num(mult) });
  } else if (/breakout|breaks? (?:above|out)|highest high|lowest low|donchian|channel|\d+\s*-?\s*day (?:high|low)/.test(t)) {
    id = "breakout";
    Object.assign(params, { lookback: days[0] });
  } else if (/\bema\b|exponential/.test(t)) {
    id = "ema_crossover";
    if (days.length >= 2) Object.assign(params, { fast: Math.min(days[0], days[1]), slow: Math.max(days[0], days[1]) });
  } else if (/moving average|\bsma\b|\bma\b|golden cross|death cross|crossover|crosses/.test(t)) {
    id = "sma_crossover";
    if (days.length >= 2) Object.assign(params, { fast: Math.min(days[0], days[1]), slow: Math.max(days[0], days[1]) });
  } else {
    confident = false;
  }

  for (const k of Object.keys(params)) if (params[k] === undefined || Number.isNaN(params[k])) delete params[k];
  const built = buildTemplate(id, params);
  return {
    templateId: id,
    params: built.params,
    understood: confident
      ? `Interpreted as: ${built.description}`
      : `Could not recognise an indicator in your description, so a default ${built.name} strategy was used. Mention RSI, MACD, moving averages, EMA, Bollinger Bands, Supertrend/ATR or breakouts, or configure GEMINI_API_KEY for free-form strategies.`,
    confident,
  };
}
