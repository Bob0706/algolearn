// lib/api.ts — browser-side client for the AlgoLearn API routes

import { getIdToken } from "./firebase";
import type {
  BacktestResult, CandleSignal, DataSource, Instrument, IntradayBar, LedgerKind, LedgerReceipt, OHLCVBar, Quote, StrategyTemplate,
} from "./types";

export type * from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export class ApiError extends Error {
  constructor(message: string, public status: number, public errors: string[] = [], public logs: string[] = []) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const token = await getIdToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Network error: could not reach the AlgoLearn server.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.detail || `Request failed (${res.status})`, res.status, data.errors, data.logs);
  return data as T;
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

// ─── market data & templates ──────────────────────────────────────────────
export interface SymbolSearch {
  results: Instrument[];
  total: number;
  counts: { nse: number; nseSme: number; bse: number };
  complete: boolean;
  updatedAt: string | null;
  note?: string;
}

/** Search every NSE / BSE listing by ticker, BSE code, company name or ISIN. */
export const searchSymbols = (q: string, exchange = "ALL", limit = 20) =>
  request<SymbolSearch>(`/api/symbols?q=${encodeURIComponent(q)}&exchange=${exchange}&limit=${limit}`);

export const fetchQuote = (symbol: string) => request<Quote>(`/api/quote?symbol=${encodeURIComponent(symbol)}`);

export const fetchIntraday = (symbol: string, interval: "1m" | "5m" | "15m", days: 1 | 5) =>
  request<{ symbol: string; interval: string; days: number; source: DataSource; bars: IntradayBar[] }>(
    `/api/intraday?symbol=${encodeURIComponent(symbol)}&interval=${interval}&days=${days}`,
  );

export async function fetchStrategyTemplates(): Promise<StrategyTemplate[]> {
  return (await request<{ templates: StrategyTemplate[] }>("/api/strategy-templates")).templates;
}

// ─── strategy generation & backtest ───────────────────────────────────────
export interface GeneratedStrategy {
  code: string;
  source: "gemini" | "template";
  model?: string;
  template_id?: string;
  understood?: string;
  confident?: boolean;
  note?: string;
  warnings?: string[];
}

export const generateStrategy = (description: string) => post<GeneratedStrategy>("/api/generate-strategy", { description });

export const runBacktest = (p: { symbol: string; period: string; strategy_code: string; initial_capital: number; include_costs: boolean }) =>
  post<BacktestResult>("/api/backtest", p);

export const recordStrategy = (code: string) => post<{ receipt: LedgerReceipt | null }>("/api/ledger/strategy", { code });

// ─── simulator ─────────────────────────────────────────────────────────────
export interface SimTrade {
  date: string; type: "BUY" | "SELL"; price: number; shares: number; costs: number; pnl?: number; followedSignal: boolean;
}
export interface SimView {
  sessionId: string;
  symbol: string;
  period: string;
  dataSource: DataSource;
  totalBars: number;
  cursor: number;
  bars: OHLCVBar[];
  signals: CandleSignal[];
  portfolio: { cash: number; shares: number; avgPrice: number; price: number; value: number };
  trades: SimTrade[];
  finished: boolean;
  result?: {
    finalValue: number; returnPct: number; buyHoldReturnPct: number; closedTrades: number; wins: number; losses: number;
    totalCosts: number; completedFullSession: boolean; ledger: LedgerReceipt | null;
  };
  signalBatch: LedgerReceipt | null;
  error?: string;
}

export const startSimulation = (symbol: string, period: string) => post<SimView>("/api/simulator/session", { symbol, period });

export const stepSimulation = (sessionId: string, opts: { advance?: number; action?: { type: "BUY" | "SELL"; shares: number }; end?: boolean }) =>
  post<SimView>("/api/simulator/step", { sessionId, ...opts });

export interface LiveSignal {
  symbol: string; dataSource: DataSource; asOf: string; close: number;
  signal: CandleSignal | null; previousSignal: CandleSignal | null; ledger: LedgerReceipt | null; note?: string;
}
export const fetchLiveSignal = (symbol: string) => request<LiveSignal>(`/api/signals/live?symbol=${encodeURIComponent(symbol)}`);

// ─── ledger ───────────────────────────────────────────────────────────────
export interface Health {
  engine: { ok: boolean; detail: string };
  ledger: { mode: "besu" | "local" | "off"; ok: boolean; detail: string; chainId?: number; blockNumber?: number; recordCount?: number; contract?: string };
  ai: { configured: boolean };
  storage: { backend: "redis" | "files"; persistent: boolean; warning?: string };
}
export const fetchHealth = () => request<Health>("/api/health");

export interface VerifyResult {
  id: string; found: boolean; kind?: LedgerKind; mode: string; status?: string;
  storedContentHash?: string; recomputedContentHash?: string; contentIntact?: boolean; matchesChain?: boolean;
  onChain?: { exists: boolean; contentHash?: string; subject?: string; parent?: string; timestamp?: string; blockNumber?: number; writer?: string; txHash?: string; chainIntact?: boolean; contract?: string };
  verdict: "VERIFIED" | "TAMPERED" | "PENDING" | "NOT_FOUND" | "UNAVAILABLE";
  explanation: string;
}
export const verifyRecord = (id: string) => request<VerifyResult>(`/api/ledger/verify?id=${encodeURIComponent(id)}`);
export const verifyContent = (id: string, content: unknown) => post<VerifyResult>("/api/ledger/verify", { id, content });

export interface LedgerRecordView {
  id: string; kind: LedgerKind; subject: string; parentId: string | null; contentHash: string; createdAt: string;
  receipt: LedgerReceipt; content: any; isOwner: boolean; proofAvailable: boolean;
}
export const fetchRecord = (id: string) => request<LedgerRecordView>(`/api/ledger/records/${encodeURIComponent(id)}`);
export const fetchRecords = (opts: { kind?: LedgerKind; mine?: boolean; limit?: number } = {}) => {
  const q = new URLSearchParams();
  if (opts.kind) q.set("kind", opts.kind);
  if (opts.mine) q.set("mine", "1");
  if (opts.limit) q.set("limit", String(opts.limit));
  return request<{ records: LedgerRecordView[]; note?: string }>(`/api/ledger/records?${q}`);
};

export async function downloadProof(id: string) {
  const headers = new Headers();
  const token = await getIdToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}/api/ledger/records/${id}?proof=1`, { headers });
  if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).detail || "Could not download proof", res.status);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `algolearn-proof-${id.slice(2, 12)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface LeaderboardRow {
  id: string; trader: string; symbol: string; period: string; returnPct: number; buyHoldReturnPct: number;
  closedTrades: number; endDate: string; recordedAt: string;
}
export const fetchLeaderboard = () => request<{ rows: LeaderboardRow[]; rules: string }>("/api/ledger/leaderboard");
