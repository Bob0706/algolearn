"use client";
// app/login/page.tsx — log in or create an account (email + password).

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn, ShieldCheck, TrendingUp, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

function safeNext(raw: string | null): string {
  // only same-site paths, never "//evil.com" or "https://…"
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { user, loading, signIn, register } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(params.get("mode") === "signup" ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setError(""); }, [mode]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      if (mode === "signup") await register(name, email, password);
      else await signIn(email, password);
      setPassword("");
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const signup = mode === "signup";

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "3.5rem", paddingBottom: "3rem", maxWidth: 440 }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <TrendingUp size={36} style={{ color: "var(--accent)", margin: "0 auto 0.6rem" }} />
          <h1 style={{ fontWeight: 800, fontSize: "1.6rem" }}>{signup ? "Create your account" : "Welcome back"}</h1>
          <p className="muted small" style={{ marginTop: "0.35rem" }}>
            {signup ? "Save strategies, track lessons and simulator results, and sign your ledger records." : "Log in to continue where you left off."}
          </p>
        </div>

        {user && !loading && (
          <div className="alert alert-info small" style={{ marginBottom: "1rem" }}>
            You are signed in as <b>{user.email}</b>. Logging in here ends that session in this browser and starts a new one.
          </div>
        )}

        <div className="card">
          <div className="auth-tabs" role="tablist">
            <button role="tab" aria-selected={!signup} className={!signup ? "active" : ""} onClick={() => setMode("login")}>Log in</button>
            <button role="tab" aria-selected={signup} className={signup ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
          </div>
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            {signup && (
              <div className="form-group">
                <label className="form-label" htmlFor="name">Name</label>
                <input id="name" className="form-input" autoComplete="name" required maxLength={60} value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input id="email" className="form-input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Password</label>
              <div style={{ position: "relative" }}>
                <input id="password" className="form-input" type={show ? "text" : "password"} required minLength={signup ? 8 : 1} maxLength={200}
                  autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)}
                  style={{ width: "100%", paddingRight: "2.5rem" }} />
                <button type="button" className="btn-icon" onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"}
                  style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)" }}>
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {signup && <span className="small muted">At least 8 characters, with a letter and a number.</span>}
            </div>
            {error && <div className="alert alert-danger small" role="alert">{error}</div>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : signup ? <UserPlus size={17} /> : <LogIn size={17} />}
              {signup ? "Create account" : "Log in"}
            </button>
          </form>
        </div>

        <p className="small muted" style={{ marginTop: "1rem", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
          <ShieldCheck size={15} style={{ flexShrink: 0, color: "var(--success)", marginTop: 2 }} />
          <span>Passwords are stored only as salted scrypt hashes. Each login gets its own private session; you can see and end your sessions from the <Link href="/dashboard">dashboard</Link>.</span>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="page" style={{ display: "grid", placeItems: "center" }}><span className="spinner spinner-lg" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
