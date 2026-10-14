// lib/server/engineClient.ts — calls the sandboxed Python strategy engine (backend/).

import { LookaheadReport, OHLCVBar } from "../types";

const ENGINE_URL = (process.env.STRATEGY_ENGINE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export class EngineUnavailableError extends Error {}

/** The strategy itself is invalid or crashed; message is safe to show the user. */
export class StrategyError extends Error {
  constructor(message: string, public errors: string[] = [], public logs: string[] = []) {
    super(message);
  }
}

export interface EngineSignals {
  buy: boolean[];
  sell: boolean[];
  logs: string[];
  warnings: string[];
  lookahead: LookaheadReport;
  runtime_ms: number;
}

async function call(path: string, body: unknown, timeoutMs: number): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Engine-Key": process.env.ENGINE_API_KEY || "" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch {
    throw new EngineUnavailableError(`Python strategy engine is not reachable at ${ENGINE_URL}`);
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 422) {
    const d = json.detail ?? {};
    throw new StrategyError(d.message ?? "Strategy failed", d.errors ?? [], d.logs ?? []);
  }
  if (!res.ok) throw new EngineUnavailableError(`Strategy engine error (${res.status})`);
  return json;
}

export function runStrategyInEngine(code: string, bars: OHLCVBar[]): Promise<EngineSignals> {
  return call("/signals", { code, bars, lookahead_check: true }, 45_000);
}

export async function validateInEngine(code: string): Promise<{ ok: boolean; errors: string[]; warnings: string[] } | null> {
  try {
    return await call("/validate", { code }, 5_000);
  } catch (e) {
    if (e instanceof EngineUnavailableError) return null;
    throw e;
  }
}

export async function engineHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${ENGINE_URL}/health`, { signal: AbortSignal.timeout(2000), cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
