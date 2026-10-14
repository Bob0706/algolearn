// lib/server/auth.ts — verifies Firebase ID tokens without the Admin SDK.
//
// Ledger records are attributed to a pseudonymous subject = sha256(salt + uid),
// so the public ledger never contains e-mail addresses or raw user ids.

import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { sha256Hex, ZERO_HASH } from "../ledger/canonical";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export interface Caller {
  uid: string | null;
  subject: string; // bytes32 hex; ZERO_HASH for anonymous callers
  name?: string;
}

export class AuthError extends Error {}

export const ANONYMOUS: Caller = { uid: null, subject: ZERO_HASH };

export function subjectFor(uid: string): string {
  return sha256Hex(`${process.env.LEDGER_SUBJECT_SALT || "algolearn-dev-salt"}:${uid}`);
}

/** Anonymous if no token is sent; throws AuthError if a token is sent but invalid. */
export async function getCaller(req: NextRequest): Promise<Caller> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || !PROJECT_ID) return ANONYMOUS;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    if (!payload.sub) throw new AuthError("token has no subject");
    return { uid: payload.sub, subject: subjectFor(payload.sub), name: (payload as any).name };
  } catch {
    throw new AuthError("Your sign-in session is invalid or expired. Please sign in again.");
  }
}
