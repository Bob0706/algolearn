// lib/api.ts — browser-side client for the AlgoLearn API routes

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

// The login this tab believes it is using ("guest" when signed out). Sent with every request so
// the server can refuse to act if another tab has since switched the cookie to a different login.
let sessionKey: string | null = null;
export const setSessionKey = (key: string | null) => { sessionKey = key; };
export const SESSION_CHANGED_EVENT = "algolearn:session-changed";

function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (sessionKey) headers.set("x-al-session", sessionKey);
  return headers;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = authHeaders(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError("Network error: could not reach the AlgoLearn server.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.code === "SESSION_CHANGED" && typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
  }
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
  note?: string;
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
  const res = await fetch(`${API_URL}/api/ledger/records/${id}?proof=1`, { headers: authHeaders(), credentials: "same-origin" });
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

// ─── accounts & sessions ────────────────────────────────────────────────
export interface AccountUser { id: string; name: string; email: string }
export interface MeResponse { user: AccountUser | null; session?: { id: string; createdAt: string; expiresAt?: string } }
export interface ActiveSession { id: string; device: string; createdAt: string; expiresAt: string; current: boolean }

export const fetchMe = () => request<MeResponse>("/api/auth/me");
export const signUp = (body: { name: string; email: string; password: string }) => post<MeResponse>("/api/auth/signup", body);
export const logIn = (body: { email: string; password: string }) => post<MeResponse>("/api/auth/login", body);
export const logOut = () => post<{ ok: true }>("/api/auth/logout", {});
export const fetchSessions = () => request<{ sessions: ActiveSession[] }>("/api/auth/sessions");
export const endSessionById = (id: string) => request<{ ended: number }>(`/api/auth/sessions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
export const endOtherSessions = () => request<{ ended: number }>("/api/auth/sessions?others=1", { method: "DELETE" });

// ─── the signed-in user's own data (stored server-side, never in the browser) ──
export interface SavedStrategy {
  id: string; name: string; description: string; code: string; symbol?: string;
  backtestResult?: Record<string, number>; ledgerId?: string; createdAt: string;
}
export interface SimulatorStats { sessions: number; totalTrades: number; wins: number; losses: number; totalPnL: number }
export interface Progress { lessonsCompleted: string[]; simulatorStats: SimulatorStats }

export const fetchMyStrategies = () => request<{ strategies: SavedStrategy[] }>("/api/me/strategies");
export const saveMyStrategy = (s: Omit<SavedStrategy, "id" | "createdAt">) => post<{ strategy: SavedStrategy }>("/api/me/strategies", s);
export const deleteMyStrategy = (id: string) => request<{ ok: true }>(`/api/me/strategies/${encodeURIComponent(id)}`, { method: "DELETE" });
export const fetchProgress = () => request<Progress>("/api/me/progress");
export const completeLesson = (lessonId: string) => post<Progress>("/api/me/progress", { lessonId });
