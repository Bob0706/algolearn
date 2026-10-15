// lib/server/userData.ts — everything a user saves, keyed by their account id.
// Nothing is kept in the browser, so people sharing a computer never see each other's data.

import { randomUUID } from "node:crypto";
import { kv } from "./kv";
import { InputError } from "../stockService";

export interface SavedStrategy {
  id: string;
  name: string;
  description: string;
  code: string;
  symbol?: string;
  backtestResult?: Record<string, unknown>;
  ledgerId?: string;
  createdAt: string;
}

export interface SimulatorStats { sessions: number; totalTrades: number; wins: number; losses: number; totalPnL: number }

const MAX_STRATEGIES = 200;
const LESSON_RE = /^l\d{1,2}$/;

export async function listStrategies(userId: string): Promise<SavedStrategy[]> {
  const all = await kv().hgetall(`user:${userId}:strategies`);
  return Object.values(all).map(v => JSON.parse(v) as SavedStrategy).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveStrategy(userId: string, body: any): Promise<SavedStrategy> {
  const code = String(body?.code ?? "");
  if (!code.trim() || code.length > 20_000) throw new InputError("Strategy code is required (max 20,000 characters).");
  if ((await listStrategies(userId)).length >= MAX_STRATEGIES) throw new InputError(`You can save up to ${MAX_STRATEGIES} strategies. Delete some first.`);
  const ledgerId = typeof body?.ledgerId === "string" && /^0x[0-9a-f]{64}$/.test(body.ledgerId) ? body.ledgerId : undefined;
  const symbol = typeof body?.symbol === "string" && body.symbol.length <= 25 ? body.symbol : undefined;
  const result = body?.backtestResult && typeof body.backtestResult === "object" ? Object.fromEntries(
    Object.entries(body.backtestResult).filter(([, v]) => typeof v === "number").slice(0, 30),
  ) : undefined;
  const s: SavedStrategy = {
    id: randomUUID(),
    name: String(body?.name ?? "My strategy").slice(0, 80) || "My strategy",
    description: String(body?.description ?? "").slice(0, 2000),
    code, symbol, backtestResult: result, ledgerId,
    createdAt: new Date().toISOString(),
  };
  await kv().hset(`user:${userId}:strategies`, s.id, JSON.stringify(s));
  return s;
}

export async function deleteStrategy(userId: string, id: string): Promise<void> {
  // only ever touches this user's own hash, so one user cannot delete another's strategy
  await kv().hdel(`user:${userId}:strategies`, id);
}

export async function completeLesson(userId: string, lessonId: unknown): Promise<string[]> {
  const id = String(lessonId ?? "");
  if (!LESSON_RE.test(id)) throw new InputError("Unknown lesson.");
  await kv().sadd(`user:${userId}:lessons`, id);
  return kv().smembers(`user:${userId}:lessons`);
}

export async function getProgress(userId: string): Promise<{ lessonsCompleted: string[]; simulatorStats: SimulatorStats }> {
  const [lessons, raw] = await Promise.all([kv().smembers(`user:${userId}:lessons`), kv().hgetall(`user:${userId}:stats`)]);
  const n = (k: string) => Number(raw[k] ?? 0);
  return {
    lessonsCompleted: lessons.sort(),
    simulatorStats: { sessions: n("sessions"), totalTrades: n("totalTrades"), wins: n("wins"), losses: n("losses"), totalPnL: Math.round(n("totalPnL") * 100) / 100 },
  };
}

/** Called by the server when a simulation ends: totals can't be inflated from the browser. */
export async function recordSimulatorTotals(userId: string, s: { trades: number; wins: number; losses: number; pnl: number }) {
  const k = `user:${userId}:stats`;
  await Promise.all([
    kv().hincrby(k, "sessions", 1),
    kv().hincrby(k, "totalTrades", s.trades),
    kv().hincrby(k, "wins", s.wins),
    kv().hincrby(k, "losses", s.losses),
    kv().hincrby(k, "totalPnL", Math.round(s.pnl * 100) / 100),
  ]);
}
