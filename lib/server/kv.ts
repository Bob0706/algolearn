// lib/server/kv.ts — tiny key-value API for accounts and sessions.
//
// Upstash Redis when configured (production, shared by every serverless instance);
// otherwise an in-process store so local development works without a database.

import { redis, redisEnabled } from "./redis";

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  /** Sets only if absent; returns true when this call created the key. */
  setNX(key: string, value: string): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  incr(key: string, ttlSec?: number): Promise<number>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  hset(key: string, field: string, value: string): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hdel(key: string, field: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hincrby(key: string, field: string, by: number): Promise<void>;
}

const upstash: KV = {
  get: k => redis<string | null>(["GET", k]),
  set: async (k, v, ttl) => { await redis(ttl ? ["SET", k, v, "EX", ttl] : ["SET", k, v]); },
  setNX: async (k, v) => (await redis(["SET", k, v, "NX"])) === "OK",
  del: async (...ks) => { if (ks.length) await redis(["DEL", ...ks]); },
  incr: async (k, ttl) => {
    const n = await redis<number>(["INCR", k]);
    if (ttl && n === 1) await redis(["EXPIRE", k, ttl]);
    return n;
  },
  sadd: async (k, m) => { await redis(["SADD", k, m]); },
  srem: async (k, m) => { await redis(["SREM", k, m]); },
  smembers: k => redis<string[]>(["SMEMBERS", k]),
  hset: async (k, f, v) => { await redis(["HSET", k, f, v]); },
  hget: (k, f) => redis<string | null>(["HGET", k, f]),
  hdel: async (k, f) => { await redis(["HDEL", k, f]); },
  hgetall: async k => {
    const flat = await redis<string[]>(["HGETALL", k]);
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = flat[i + 1];
    return out;
  },
  hincrby: async (k, f, by) => { await redis(["HINCRBYFLOAT", k, f, by]); },
};

// ─── in-process fallback (development only; not shared between servers) ──
interface Entry { v: unknown; exp?: number }
const mem: Map<string, Entry> = ((globalThis as any).__algolearnKV ??= new Map());
const live = (k: string): Entry | undefined => {
  const e = mem.get(k);
  if (e?.exp && e.exp < Date.now()) { mem.delete(k); return undefined; }
  return e;
};
const setOf = (k: string) => (live(k)?.v as Set<string>) ?? new Set<string>();
const hashOf = (k: string) => (live(k)?.v as Map<string, string>) ?? new Map<string, string>();

const memory: KV = {
  get: async k => (live(k)?.v as string) ?? null,
  set: async (k, v, ttl) => { mem.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : undefined }); },
  setNX: async (k, v) => { if (live(k)) return false; mem.set(k, { v }); return true; },
  del: async (...ks) => { ks.forEach(k => mem.delete(k)); },
  incr: async (k, ttl) => {
    const e = live(k);
    const n = Number(e?.v ?? 0) + 1;
    mem.set(k, { v: String(n), exp: e?.exp ?? (ttl ? Date.now() + ttl * 1000 : undefined) });
    return n;
  },
  sadd: async (k, m) => { const s = setOf(k); s.add(m); mem.set(k, { v: s }); },
  srem: async (k, m) => { const s = setOf(k); s.delete(m); mem.set(k, { v: s }); },
  smembers: async k => [...setOf(k)],
  hset: async (k, f, v) => { const h = hashOf(k); h.set(f, v); mem.set(k, { v: h }); },
  hget: async (k, f) => hashOf(k).get(f) ?? null,
  hdel: async (k, f) => { const h = hashOf(k); h.delete(f); mem.set(k, { v: h }); },
  hgetall: async k => Object.fromEntries(hashOf(k)),
  hincrby: async (k, f, by) => { const h = hashOf(k); h.set(f, String(Number(h.get(f) ?? 0) + by)); mem.set(k, { v: h }); },
};

export const kv = (): KV => (redisEnabled() ? upstash : memory);
