// lib/server/http.ts — consistent JSON errors for API routes.

import { NextRequest, NextResponse } from "next/server";
import { InputError } from "../stockService";
import { AuthError } from "./auth";
import { EngineUnavailableError, StrategyError } from "./engineClient";
import { rateLimit } from "./rateLimit";

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof InputError) return NextResponse.json({ detail: err.message }, { status: 400 });
  if (err instanceof AuthError) return NextResponse.json({ detail: err.message }, { status: 401 });
  if (err instanceof StrategyError)
    return NextResponse.json({ detail: err.message, errors: err.errors, logs: err.logs }, { status: 422 });
  if (err instanceof EngineUnavailableError)
    return NextResponse.json(
      { detail: `${err.message}. Start it with "npm run engine" (see README), or use an unmodified template.` },
      { status: 503 },
    );
  console.error("[api]", err);
  return NextResponse.json({ detail: "Internal error. Please try again." }, { status: 500 });
}

export function limited(req: NextRequest, name: string, limit: number, windowMs = 60_000): NextResponse | null {
  const wait = rateLimit(req, name, limit, windowMs);
  return wait
    ? NextResponse.json({ detail: `Too many requests. Try again in ${wait}s.` }, { status: 429, headers: { "Retry-After": String(wait) } })
    : null;
}

export async function readJson(req: NextRequest, maxBytes = 200_000): Promise<any> {
  const text = await req.text();
  if (text.length > maxBytes) throw new InputError("Request body too large.");
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new InputError("Request body must be JSON.");
  }
}
