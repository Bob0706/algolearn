"use client";
// components/Navbar.tsx

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, LogIn, LogOut, Menu, Moon, Sun, TrendingUp, UserPlus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fetchHealth, Health } from "@/lib/api";

const LINKS = [
  { href: "/live", label: "Live Market" },
  { href: "/learn", label: "Learn" },
  { href: "/builder", label: "Strategy Builder" },
  { href: "/backtest", label: "Backtest" },
  { href: "/simulator", label: "Simulator" },
  { href: "/ledger", label: "Ledger" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => setHealth(null));
  }, []);

  useEffect(() => { setOpen(false); setMenu(false); }, [pathname]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const doSignOut = async () => {
    setMenu(false);
    await signOut();
    router.push("/");
  };

  const ledgerColor = !health ? "var(--text-muted)" : !health.ledger.ok ? "var(--danger)" : health.ledger.mode === "besu" ? "var(--success)" : "var(--warning)";
  const ledgerTitle = health ? `Ledger: ${health.ledger.detail}${health.ledger.blockNumber ? ` (block ${health.ledger.blockNumber})` : ""}` : "Ledger status unknown";

  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <Link href="/" className="navbar-brand">
          <TrendingUp size={20} style={{ color: "var(--accent)" }} /> AlgoLearn
        </Link>
        <div className={`navbar-links ${open ? "open" : ""}`}>
          {LINKS.map(l => (
            <Link key={l.href} href={l.href} className={`nav-link ${pathname?.startsWith(l.href) ? "active" : ""}`}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="navbar-right">
          <Link href="/ledger" className="btn btn-ghost btn-sm" title={ledgerTitle} aria-label={ledgerTitle}>
            <span className="status-dot" style={{ background: ledgerColor }} />
            <span className="small hide-sm">{health?.ledger.mode === "besu" ? "Besu" : health?.ledger.mode === "local" ? "Local ledger" : "Ledger"}</span>
          </Link>
          <button className="btn-icon" onClick={toggle} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {user ? (
            <div className="user-menu" ref={menuRef}>
              <button className="btn btn-secondary btn-sm" onClick={() => setMenu(m => !m)} aria-haspopup="menu" aria-expanded={menu} title={user.email}>
                <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                <span className="hide-sm">{user.name.split(" ")[0]}</span>
              </button>
              {menu && (
                <div className="user-menu-pop" role="menu">
                  <div style={{ padding: "0.35rem 0.6rem 0.5rem", borderBottom: "1px solid var(--border-subtle)", marginBottom: "0.25rem" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{user.name}</div>
                    <div className="small muted" style={{ wordBreak: "break-all" }}>{user.email}</div>
                  </div>
                  <Link href="/dashboard" className="btn btn-ghost btn-sm" role="menuitem"><LayoutDashboard size={14} /> Dashboard & sessions</Link>
                  <button className="btn btn-ghost btn-sm" role="menuitem" onClick={doSignOut}><LogOut size={14} /> Log out</button>
                </div>
              )}
            </div>
          ) : !loading && (
            <>
              <Link href={`/login?next=${encodeURIComponent(pathname || "/dashboard")}`} className="btn btn-ghost btn-sm"><LogIn size={14} /> <span className="hide-sm">Log in</span></Link>
              <Link href="/login?mode=signup" className="btn btn-primary btn-sm"><UserPlus size={14} /> <span className="hide-sm">Sign up</span></Link>
            </>
          )}
          <button className="btn-icon nav-toggle" onClick={() => setOpen(o => !o)} aria-label="Menu">
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>
    </nav>
  );
}
