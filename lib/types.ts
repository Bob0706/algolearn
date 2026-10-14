// lib/types.ts — types shared by the browser and the API routes

export interface OHLCVBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** "yahoo" = real exchange data; "synthetic" = generated fallback, never real prices. */
export type DataSource = "yahoo" | "synthetic";

export interface MarketData {
  symbol: string;
  period: string;
  source: DataSource;
  bars: OHLCVBar[];
  dataHash: string;
}

export interface SignalPoint { date: string; price: number }
export interface EquityPoint { date: string; equity: number; benchmark: number }

export interface Trade {
  date: string;
  type: "BUY" | "SELL";
  price: number;
  shares: number;
  value: number;
  costs: number;
  pnl?: number;
}

export interface BacktestSummary {
  initial_capital: number;
  final_value: number;
  total_return_pct: number;
  buy_hold_return_pct: number;
  cagr_pct: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  win_rate_pct: number;
  total_trades: number;
  closed_trades: number;
  winning_trades: number;
  exposure_pct: number;
  total_costs: number;
  realized_pnl: number;
  open_pnl: number;
}

export type EngineKind = "python-sandbox" | "native-template";

export interface LookaheadReport {
  checked: boolean;
  uses_future_data?: boolean;
  mismatched_bars?: number;
  first_mismatch_date?: string | null;
}

export interface BacktestResult {
  summary: BacktestSummary;
  ohlcv: OHLCVBar[];
  buy_signals: SignalPoint[];
  sell_signals: SignalPoint[];
  equity_curve: EquityPoint[];
  trades: Trade[];
  meta: {
    symbol: string;
    period: string;
    data_source: DataSource;
    data_hash: string;
    code_hash: string;
    engine: EngineKind;
    template_id?: string;
    assumptions: string[];
    warnings: string[];
    logs: string[];
    lookahead: LookaheadReport;
  };
  ledger?: LedgerReceipt[];
}

export interface StockSymbol { symbol: string; name: string; sector: string }

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
  params: Record<string, number>;
}

export type CandlePattern =
  | "Bullish Engulfing" | "Hammer" | "Morning Star" | "Piercing Line" | "Three White Soldiers"
  | "Bearish Engulfing" | "Shooting Star" | "Evening Star" | "Dark Cloud Cover" | "Three Black Crows"
  | "Doji Reversal";

export interface CandleSignal {
  date: string;
  type: "BUY" | "SELL";
  pattern: CandlePattern;
  strength: "STRONG" | "MODERATE";
}

// ─── Ledger ────────────────────────────────────────────────────────────────
export type LedgerKind = "STRATEGY" | "BACKTEST" | "SIGNAL_BATCH" | "SIMULATION_RESULT" | "LIVE_SIGNAL";

export type LedgerMode = "besu" | "local" | "off";

export type LedgerStatus = "pending" | "confirmed" | "failed";

export interface LedgerReceipt {
  id: string;
  kind: LedgerKind;
  contentHash: string;
  status: LedgerStatus;
  mode: LedgerMode;
  txHash?: string;
  blockNumber?: number;
  error?: string;
}
