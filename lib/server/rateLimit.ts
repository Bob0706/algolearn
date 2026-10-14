// lib/server/rateLimit.ts — small in-memory fixed-window limiter per client IP.
// Good enough for a single Node instance; use Redis or the platform's limiter when scaling out.

import { NextRequest } from "next/server";

const buckets: Map<string, { count: number; resetAt: number }> =
  ((globalThis as any).__algolearnRate ??= new Map());

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns seconds to wait, or 0 if the request is allowed. */
export function rateLimit(req: NextRequest, name: string, limit: number, windowMs: number): number {
  const key = `${name}:${clientIp(req)}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return 0;
  }
  b.count++;
  return b.count > limit ? Math.ceil((b.resetAt - now) / 1000) : 0;
}
