// lib/server/auth.ts — who is calling? Resolved from the HttpOnly session cookie.
//
// Ledger records are attributed to a pseudonymous subject = sha256(salt + userId), so the
// public ledger never contains e-mail addresses or raw user ids.

import { NextRequest, NextResponse } from "next/server";
import { sha256Hex, ZERO_HASH } from "../ledger/canonical";
import { getAccount, Session, SESSION_TTL_SEC, sessionFromToken } from "./accounts";

export const SESSION_COOKIE = "al_session";

export interface Caller {
  uid: string | null;
  subject: string;          // bytes32 hex; ZERO_HASH for guests
  name?: string;
  email?: string;
  sessionId: string | null; // the login session this request belongs to
  session?: Session;
}

export class AuthError extends Error {}
/** The tab was opened under a different login than the cookie now carries (signed in/out elsewhere). */
export class SessionChangedError extends Error {}

/** Public, non-secret handle for a session (prefix of sha256(token)). */
export const shortSessionId = (sessionId: string) => sessionId.slice(0, 16);
/** Header in which the browser says which login it believes it is using ("guest" when signed out). */
export const SESSION_HEADER = "x-al-session";

export const ANONYMOUS: Caller = { uid: null, subject: ZERO_HASH, sessionId: null };

export function subjectFor(uid: string): string {
  return sha256Hex(`${process.env.LEDGER_SUBJECT_SALT || "algolearn-dev-salt"}:${uid}`);
}

/** The signed-in user for this request, or ANONYMOUS. Never throws for guests. */
export async function getCaller(req: NextRequest): Promise<Caller> {
  const caller = await resolveCaller(req);
  // A tab that still shows user A must not act with user B's cookie (or as a guest after logout).
  const expected = req.headers.get(SESSION_HEADER);
  if (expected) {
    const actual = caller.sessionId ? shortSessionId(caller.sessionId) : "guest";
    if (expected !== actual) throw new SessionChangedError("You signed in or out in another tab. This page has been refreshed to your current login.");
  }
  return caller;
}

export async function resolveCaller(req: NextRequest): Promise<Caller> {
  const session = await sessionFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return ANONYMOUS;
  const account = await getAccount(session.userId);
  if (!account) return ANONYMOUS;
  return { uid: account.id, subject: subjectFor(account.id), name: account.name, email: account.email, sessionId: session.id, session };
}

/** Like getCaller, but signed-in users only. */
export async function requireUser(req: NextRequest): Promise<Caller & { uid: string; sessionId: string }> {
  const c = await getCaller(req);
  if (!c.uid || !c.sessionId) throw new AuthError("Please log in to continue.");
  return c as Caller & { uid: string; sessionId: string };
}

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,                                    // not readable by page scripts
    secure: process.env.NODE_ENV === "production",     // HTTPS only in production
    sameSite: "lax",                                   // not sent on cross-site POSTs (CSRF)
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}
