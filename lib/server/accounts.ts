// lib/server/accounts.ts — email/password accounts and per-login sessions.
//
// Passwords are never stored: only a salted scrypt hash ("scrypt$N$r$p$salt$hash").
// Every login creates a NEW random session token (256 bits). The browser keeps it in an
// HttpOnly cookie; the database keeps only its SHA-256, so a database leak exposes no
// usable tokens. Sessions are listed per user and can be revoked one by one.
//
// Keys:
//   user:<id>                 account JSON (no password)
//   user:<id>:auth            password hash
//   user:email:<email>        → user id
//   user:<id>:sessions        set of session ids (sha256 of the token)
//   sess:<sessionId>          session JSON, expires with the session
//   user:<id>:strategies      hash: strategyId → JSON
//   user:<id>:lessons         set of completed lesson ids
//   user:<id>:stats           hash: simulator totals

import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { kv } from "./kv";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

export const SESSION_TTL_SEC = 7 * 24 * 3600;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export class AccountError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface Account { id: string; email: string; name: string; createdAt: string }
export interface Session { id: string; userId: string; createdAt: string; expiresAt: string; device: string }

// ─── passwords ──────────────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, N, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// computed once so unknown-email logins cost the same time as wrong passwords
let dummyHash: Promise<string> | null = null;

// ─── validation ─────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export function normaliseEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new AccountError("Please enter a valid email address.");
  return email;
}

function checkPassword(raw: unknown): string {
  const pw = String(raw ?? "");
  if (pw.length < 8) throw new AccountError("Password must be at least 8 characters.");
  if (pw.length > 200) throw new AccountError("Password is too long.");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new AccountError("Password must contain at least one letter and one number.");
  return pw;
}

// ─── accounts ───────────────────────────────────────────────────────────
export async function createAccount(nameRaw: unknown, emailRaw: unknown, passwordRaw: unknown): Promise<Account> {
  const name = String(nameRaw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 60) throw new AccountError("Please enter your name (up to 60 characters).");
  const email = normaliseEmail(emailRaw);
  const password = checkPassword(passwordRaw);
  const id = randomUUID();
  // claim the email atomically so two simultaneous sign-ups cannot both succeed
  if (!(await kv().setNX(`user:email:${email}`, id))) {
    throw new AccountError("An account with this email already exists. Please log in instead.", 409);
  }
  const account: Account = { id, email, name, createdAt: new Date().toISOString() };
  await kv().set(`user:${id}:auth`, await hashPassword(password));
  await kv().set(`user:${id}`, JSON.stringify(account));
  return account;
}

export async function getAccount(id: string): Promise<Account | null> {
  const raw = await kv().get(`user:${id}`);
  return raw ? JSON.parse(raw) : null;
}

/** Checks credentials. Rate-limited per email and per IP; the error never says which part was wrong. */
export async function authenticate(emailRaw: unknown, passwordRaw: unknown, ip: string): Promise<Account> {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  const password = String(passwordRaw ?? "");
  const window = 15 * 60;
  const [byEmail, byIp] = await Promise.all([
    kv().incr(`rl:login:email:${email}`, window),
    kv().incr(`rl:login:ip:${ip}`, window),
  ]);
  if (byEmail > 10 || byIp > 50) throw new AccountError("Too many login attempts. Please wait 15 minutes and try again.", 429);

  const id = EMAIL_RE.test(email) ? await kv().get(`user:email:${email}`) : null;
  const stored = id ? await kv().get(`user:${id}:auth`) : null;
  if (!stored) {
    await verifyPassword(password, await (dummyHash ??= hashPassword("dummy-password-1")));
    throw new AccountError("Email or password is incorrect.", 401);
  }
  if (!(await verifyPassword(password, stored))) throw new AccountError("Email or password is incorrect.", 401);
  await kv().del(`rl:login:email:${email}`);
  const account = await getAccount(id!);
  if (!account) throw new AccountError("Email or password is incorrect.", 401);
  return account;
}

// ─── sessions ───────────────────────────────────────────────────────────
const sessionIdOf = (token: string) => createHash("sha256").update(token).digest("hex");

export function describeDevice(userAgent: string | null): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "device";
  return `${browser} on ${os}`;
}

/** A brand-new session for every login; returns the secret token for the cookie. */
export async function createSession(userId: string, userAgent: string | null): Promise<{ token: string; session: Session }> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const session: Session = {
    id: sessionIdOf(token),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_SEC * 1000).toISOString(),
    device: describeDevice(userAgent),
  };
  await kv().set(`sess:${session.id}`, JSON.stringify(session), SESSION_TTL_SEC);
  await kv().sadd(`user:${userId}:sessions`, session.id);
  return { token, session };
}

export async function sessionFromToken(token: string | undefined): Promise<Session | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const raw = await kv().get(`sess:${sessionIdOf(token)}`);
  if (!raw) return null;
  const s = JSON.parse(raw) as Session;
  return Date.parse(s.expiresAt) > Date.now() ? s : null;
}

export async function endSession(sessionId: string, userId: string): Promise<void> {
  await kv().del(`sess:${sessionId}`);
  await kv().srem(`user:${userId}:sessions`, sessionId);
}

export async function listSessions(userId: string): Promise<Session[]> {
  const ids = await kv().smembers(`user:${userId}:sessions`);
  const out: Session[] = [];
  for (const id of ids) {
    const raw = await kv().get(`sess:${id}`);
    if (raw) out.push(JSON.parse(raw));
    else await kv().srem(`user:${userId}:sessions`, id); // expired
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function endOtherSessions(userId: string, keepSessionId: string): Promise<number> {
  const sessions = await listSessions(userId);
  const others = sessions.filter(s => s.id !== keepSessionId);
  for (const s of others) await endSession(s.id, userId);
  return others.length;
}
