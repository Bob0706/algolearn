"use client";
// contexts/AuthContext.tsx — current user (Firebase or local demo account)

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppUser, isFirebaseConfigured, onAuthChange, signInWithGoogle, signOut } from "@/lib/firebase";

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  error: string;
  demoMode: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null, loading: true, error: "", demoMode: !isFirebaseConfigured,
  signIn: async () => {}, signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => onAuthChange(u => { setUser(u); setLoading(false); }), []);

  const signIn = useCallback(async () => {
    setError("");
    try {
      await signInWithGoogle();
    } catch (e: any) {
      if (e?.code !== "auth/popup-closed-by-user" && e?.code !== "auth/cancelled-popup-request") {
        setError(e?.message || "Sign-in failed. Please try again.");
      }
    }
  }, []);

  const doSignOut = useCallback(async () => {
    await signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, demoMode: !isFirebaseConfigured, signIn, signOut: doSignOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
