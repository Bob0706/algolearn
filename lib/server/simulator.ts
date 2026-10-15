// lib/server/simulator.ts — server-authoritative paper-trading sessions.
//
// The browser never receives future candles: the server reveals bars one step at a
// time, fills trades at the latest revealed close, and computes P&L itself. The
// full signal list is hashed onto the ledger when the session starts (before any of
// it is shown), and the final result is recorded when the session ends, so the
// system's signals and the user's score are both independently verifiable.
//
// Sessions live in memory (single Node instance). Use Redis for multi-instance.

import { randomBytes } from "node:crypto";
import { analyzeCandlePatterns, SIGNAL_ENGINE_VERSION } from "../signalEngine";
import { getMarketData } from "../stockService";
import { INDIA_DELIVERY, orderCharges } from "../portfolio";
import { CandleSignal, DataSource, LedgerReceipt, OHLCVBar } from "../types";
import { hashJson } from "../ledger/canonical";
import { recordOnLedger } from "../ledger";
import { Caller } from "./auth";
import { InputError } from "../stockService";
import { redis, redisEnabled } from "./redis";
import { recordSimulatorTotals } from "./userData";

export const INITIAL_CAPITAL = 100_000;
const WARMUP_BARS = 50;
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SESSIONS = 5000;

export interface SimTrade {
  date: string;
  type: "BUY" | "SELL";
  price: number;
  shares: number;
  costs: number;
  pnl?: number;
  followedSignal: boolean;
}

interface Session {
  id: string;
  subject: string;
  userId: string | null;
  loginSession: string | null; // the login that started this game; no other login can see or play it
  symbol: string;
  period: string;
  source: DataSource;
  note?: string;
  dataHash: string;
  bars: OHLCVBar[];
  signals: CandleSignal[];
  signalsHash: string;
  signalBatch: LedgerReceipt | null;
  cursor: number; // index of the last revealed bar
  cash: number;
  shares: number;
  entryCost: number;
  trades: SimTrade[];
  finished: boolean;
  result?: SimResult;
  expiresAt: number;
}

export interface SimResult {
  finalValue: number;
  returnPct: number;
  buyHoldReturnPct: number;
  closedTrades: number;
  wins: number;
  losses: number;
  totalCosts: number;
  completedFullSession: boolean;
  ledger: LedgerReceipt | null;
}

// Sessions live in memory on a single server, or in Redis when it is configured (required on
// serverless hosts, where consecutive requests can reach different instances).
const sessions: Map<string, Session> = ((globalThis as any).__algolearnSim ??= new Map());

async function saveSession(s: Session): Promise<void> {
  if (redisEnabled()) await redis(["SET", `sim:${s.id}`, JSON.stringify(s), "EX", Math.ceil(TTL_MS / 1000)]);
  else sessions.set(s.id, s);
}

async function loadSession(id: string): Promise<Session | undefined> {
  if (!/^[0-9a-f]{32}$/.test(id)) return undefined;
  if (!redisEnabled()) return sessions.get(id);
  const raw = await redis<string | null>(["GET", `sim:${id}`]);
  return raw ? (JSON.parse(raw) as Session) : undefined;
}

function prune() {
  const now = Date.now();
  for (const [id, s] of sessions) if (s.expiresAt < now) sessions.delete(id);
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.values()].sort((a, b) => a.expiresAt - b.expiresAt).slice(0, sessions.size - MAX_SESSIONS);
    oldest.forEach(s => sessions.delete(s.id));
  }
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** What the browser is allowed to see: only revealed bars and signals. */
function view(s: Session, fromIndex = 0) {
  const visible = s.bars.slice(fromIndex, s.cursor + 1);
  const lastDate = s.bars[s.cursor].date;
  const price = s.bars[s.cursor].close;
  return {
    sessionId: s.id,
    symbol: s.symbol,
    period: s.period,
    dataSource: s.source,
    note: s.note,
    totalBars: s.bars.length,
    cursor: s.cursor,
    bars: visible,
    signals: s.signals.filter(x => x.date <= lastDate && (fromIndex === 0 || x.date >= visible[0]?.date)),
    portfolio: {
      cash: r2(s.cash),
      shares: s.shares,
      avgPrice: s.shares ? r2(s.entryCost / s.shares) : 0,
      price,
      value: r2(s.cash + s.shares * price),
    },
    trades: s.trades,
    finished: s.finished,
    result: s.result,
    signalBatch: s.signalBatch,
  };
}

export type SessionView = ReturnType<typeof view>;

export async function startSession(caller: Caller, symbol: unknown, period: unknown): Promise<SessionView> {
  prune();
  const market = await getMarketData(symbol, period);
  if (market.bars.length < WARMUP_BARS + 10) throw new InputError("Not enough historical data for a simulation. Pick a longer period.");

  const signals = analyzeCandlePatterns(market.bars);
  const signalsHash = hashJson(signals);
  // Commit to every signal BEFORE the user sees any of them.
  const signalBatch = await recordOnLedger("SIGNAL_BATCH", {
    schema: "algolearn.signal-batch.v1",
    engine: SIGNAL_ENGINE_VERSION,
    symbol: market.symbol,
    period: market.period,
    dataSource: market.source,
    dataHash: market.dataHash,
    firstBar: market.bars[0].date,
    lastBar: market.bars[market.bars.length - 1].date,
    signalCount: signals.length,
    signalsHash,
    signals,
  });

  const s: Session = {
    id: randomBytes(16).toString("hex"),
    subject: caller.subject,
    userId: caller.uid,
    loginSession: caller.sessionId,
    symbol: market.symbol,
    period: market.period,
    source: market.source,
    note: market.note,
    dataHash: market.dataHash,
    bars: market.bars,
    signals,
    signalsHash,
    signalBatch,
    cursor: WARMUP_BARS - 1,
    cash: INITIAL_CAPITAL,
    shares: 0,
    entryCost: 0,
    trades: [],
    finished: false,
    expiresAt: Date.now() + TTL_MS,
  };
  await saveSession(s);
  return view(s);
}

async function getOwned(id: unknown, caller: Caller): Promise<Session> {
  const s = await loadSession(String(id ?? ""));
  if (!s) throw new InputError("Simulation session not found or expired. Please start a new one.");
  // isolation: a game is only visible to the login session that started it
  if (s.subject !== caller.subject || (s.loginSession ?? null) !== (caller.sessionId ?? null)) {
    throw new InputError("Simulation session not found or expired. Please start a new one.");
  }
  return s;
}

export interface StepInput {
  sessionId: unknown;
  action?: { type?: unknown; shares?: unknown } | null;
  advance?: unknown;
  end?: unknown;
}

export async function stepSession(caller: Caller, input: StepInput): Promise<SessionView & { error?: string }> {
  const s = await getOwned(input.sessionId, caller);
  if (s.finished) return view(s);
  s.expiresAt = Date.now() + TTL_MS;
  let error: string | undefined;

  // 1) trade at the latest revealed close
  if (input.action) {
    const type = input.action.type;
    const qty = Math.floor(Number(input.action.shares));
    const bar = s.bars[s.cursor];
    const signalToday = s.signals.find(x => x.date === bar.date)?.type;
    if ((type !== "BUY" && type !== "SELL") || !Number.isFinite(qty) || qty <= 0 || qty > 1e7) {
      error = "Invalid order.";
    } else if (type === "BUY") {
      const value = qty * bar.close;
      const fee = orderCharges(value, "BUY", INDIA_DELIVERY);
      if (value + fee > s.cash + 1e-9) error = "Not enough cash for this order (including charges).";
      else {
        s.cash -= value + fee;
        s.shares += qty;
        s.entryCost += value + fee;
        s.trades.push({ date: bar.date, type, price: bar.close, shares: qty, costs: r2(fee), followedSignal: signalToday === "BUY" });
      }
    } else {
      const q = Math.min(qty, s.shares);
      if (q <= 0) error = "You have no shares to sell.";
      else {
        const value = q * bar.close;
        const fee = orderCharges(value, "SELL", INDIA_DELIVERY);
        const costBasis = (s.entryCost * q) / s.shares;
        s.cash += value - fee;
        s.entryCost -= costBasis;
        s.shares -= q;
        s.trades.push({ date: bar.date, type, price: bar.close, shares: q, costs: r2(fee), pnl: r2(value - fee - costBasis), followedSignal: signalToday === "SELL" });
      }
    }
  }

  // 2) reveal more bars (forward only: there is no way to go back in time)
  const from = s.cursor + 1;
  const advance = Math.max(0, Math.min(20, Math.floor(Number(input.advance ?? 0)) || 0));
  s.cursor = Math.min(s.bars.length - 1, s.cursor + advance);

  if (s.cursor >= s.bars.length - 1 || input.end === true) await finish(s);
  await saveSession(s);
  return { ...view(s, input.action && !advance ? s.cursor : from), error };
}

async function finish(s: Session) {
  s.finished = true;
  const last = s.bars[s.cursor];
  const finalValue = s.cash + s.shares * last.close;
  const sells = s.trades.filter(t => t.type === "SELL");
  const start = s.bars[WARMUP_BARS - 1].close;
  const result: Omit<SimResult, "ledger"> = {
    finalValue: r2(finalValue),
    returnPct: r2(((finalValue - INITIAL_CAPITAL) / INITIAL_CAPITAL) * 100),
    buyHoldReturnPct: r2(((last.close - start) / start) * 100),
    closedTrades: sells.length,
    wins: sells.filter(t => (t.pnl ?? 0) > 0).length,
    losses: sells.filter(t => (t.pnl ?? 0) < 0).length,
    totalCosts: r2(s.trades.reduce((a, t) => a + t.costs, 0)),
    completedFullSession: s.cursor >= s.bars.length - 1,
  };
  const ledger = await recordOnLedger("SIMULATION_RESULT", {
    schema: "algolearn.simulation.v1",
    sessionId: s.id,
    symbol: s.symbol,
    period: s.period,
    dataSource: s.source,
    dataHash: s.dataHash,
    signalBatchId: s.signalBatch?.id ?? null,
    signalsHash: s.signalsHash,
    startDate: s.bars[WARMUP_BARS - 1].date,
    endDate: last.date,
    initialCapital: INITIAL_CAPITAL,
    trades: s.trades,
    ...result,
  }, { subject: s.subject, parentId: s.signalBatch?.id, id: hashJson({ kind: "SIMULATION_RESULT", session: s.id }) });
  s.result = { ...result, ledger };
  if (s.userId) {
    await recordSimulatorTotals(s.userId, {
      trades: s.trades.length, wins: result.wins, losses: result.losses, pnl: result.finalValue - INITIAL_CAPITAL,
    }).catch(e => console.warn("[simulator] could not update user totals:", e?.message));
  }
}
