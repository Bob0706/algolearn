// lib/api.ts — calls to the Python FastAPI backend

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface OHLCVBar {
  date:   string;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface SignalPoint { date: string; price: number }
export interface EquityPoint { date: string; equity: number }
export interface Trade {
  date: string; type: "BUY" | "SELL";
  price: number; shares: number; value: number;
}

export interface BacktestSummary {
  initial_capital:  number;
  final_value:      number;
  total_return_pct: number;
  max_drawdown_pct: number;
  win_rate_pct:     number;
  total_trades:     number;
  winning_trades:   number;
}

export interface BacktestResult {
  summary:       BacktestSummary;
  ohlcv:         OHLCVBar[];
  buy_signals:   SignalPoint[];
  sell_signals:  SignalPoint[];
  equity_curve:  EquityPoint[];
  trades:        Trade[];
}

export interface StockSymbol { symbol: string; name: string; sector: string }

export interface StrategyTemplate {
  id: string; name: string; description: string; code: string;
}

// ─── Stock Data ───────────────────────────────────────────────────────────────
export async function fetchStockData(symbol: string, period = "1y"): Promise<OHLCVBar[]> {
  const res = await fetch(`${API_URL}/api/stock-data?symbol=${encodeURIComponent(symbol)}&period=${period}`);
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to fetch stock data");
  const data = await res.json();
  return data.data;
}

// ─── Symbols ──────────────────────────────────────────────────────────────────
export async function fetchSymbols(): Promise<StockSymbol[]> {
  const res = await fetch(`${API_URL}/api/symbols`);
  if (!res.ok) throw new Error("Failed to fetch symbols");
  const data = await res.json();
  return data.symbols;
}

// ─── Strategy Templates ───────────────────────────────────────────────────────
export async function fetchStrategyTemplates(): Promise<StrategyTemplate[]> {
  const res = await fetch(`${API_URL}/api/strategy-templates`);
  if (!res.ok) throw new Error("Failed to fetch templates");
  const data = await res.json();
  return data.templates;
}

// ─── Generate Strategy ────────────────────────────────────────────────────────
export async function generateStrategy(description: string): Promise<{ code: string; source: string; note?: string }> {
  const res = await fetch(`${API_URL}/api/generate-strategy`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Failed to generate strategy");
  return res.json();
}

// ─── Backtest ─────────────────────────────────────────────────────────────────
export async function runBacktest(
  symbol: string,
  period: string,
  strategy_code: string,
  initial_capital = 100000,
): Promise<BacktestResult> {
  const res = await fetch(`${API_URL}/api/backtest`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ symbol, period, strategy_code, initial_capital }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Backtest failed");
  return res.json();
}

// ─── Health check ────────────────────────────────────────────────────────────
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
