"use client";
// contexts/AuthContext.tsx — the signed-in account for this tab.
//
// The session lives in an HttpOnly cookie that page scripts cannot read; this context only
// mirrors who the server says we are (GET /api/auth/me). Isolation between logins:
//   • every login creates a brand-new server session;
//   • every API call carries this tab's session key, and the server refuses (409) if the
//     cookie has since switched to another login;
//   • when any tab signs in or out, the others reload so no state from the previous
//     user survives on screen.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AccountUser, fetchMe, logIn, logOut, SESSION_CHANGED_EVENT, setSessionKey, signUp } from "@/lib/api";

interface AuthState {
  user: AccountUser | null;
  sessionId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, sessionId: null, loading: true,
  signIn: async () => {}, register: async () => {}, signOut: async () => {},
});

const CHANNEL = "algolearn-auth";

/** Drops anything this tab kept for the previous user. */
function clearTabState() {
  try { sessionStorage.clear(); } catch { /* storage blocked */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const current = useRef<string | null>(null); // session key this tab is showing
  const channel = useRef<BroadcastChannel | null>(null);

  const apply = useCallback((u: AccountUser | null, sid: string | null) => {
    current.current = u && sid ? sid : "guest";
    setSessionKey(current.current);
    setUser(u);
    setSessionId(u ? sid : null);
  }, []);

  /** Re-asks the server; if the login behind the cookie differs from what this tab shows, start clean. */
  const resync = useCallback(async () => {
    try {
      setSessionKey(null);
      const me = await fetchMe();
      const actual = me.user && me.session ? me.session.id : "guest";
      if (current.current !== null && current.current !== actual) {
        clearTabState();
        window.location.reload();
        return;
      }
      apply(me.user, me.session?.id ?? null);
    } catch {
      setSessionKey(current.current);
    }
  }, [apply]);

  useEffect(() => {
    fetchMe()
      .then(me => apply(me.user, me.session?.id ?? null))
      .catch(() => apply(null, null))
      .finally(() => setLoading(false));

    const onChanged = () => { void resync(); };
    const onVisible = () => { if (document.visibilityState === "visible") void resync(); };
    window.addEventListener(SESSION_CHANGED_EVENT, onChanged);
    document.addEventListener("visibilitychange", onVisible);
    if ("BroadcastChannel" in window) {
      channel.current = new BroadcastChannel(CHANNEL);
      channel.current.onmessage = onChanged;
    }
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, onChanged);
      document.removeEventListener("visibilitychange", onVisible);
      channel.current?.close();
    };
  }, [apply, resync]);

  const announce = () => channel.current?.postMessage("changed");

  const signIn = useCallback(async (email: string, password: string) => {
    const me = await logIn({ email, password });
    clearTabState();
    apply(me.user, me.session?.id ?? null);
    announce();
  }, [apply]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const me = await signUp({ name, email, password });
    clearTabState();
    apply(me.user, me.session?.id ?? null);
    announce();
  }, [apply]);

  const signOut = useCallback(async () => {
    try { await logOut(); } finally {
      clearTabState();
      apply(null, null);
      announce();
    }
  }, [apply]);

  return (
    <AuthContext.Provider value={{ user, sessionId, loading, signIn, register, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
