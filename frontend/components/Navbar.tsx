"use client";
// components/Navbar.tsx

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { signInWithGoogle, signOut } from "@/lib/firebase";
import {
  Sun, Moon, TrendingUp, BookOpen, Zap, BarChart2, Gamepad2,
  LayoutDashboard, LogOut, LogIn, Menu, X, User
} from "lucide-react";

const NAV_LINKS = [
  { href: "/learn",     label: "Learn",     icon: BookOpen },
  { href: "/builder",   label: "Builder",   icon: Zap },
  { href: "/backtest",  label: "Backtest",  icon: BarChart2 },
  { href: "/simulator", label: "Simulator", icon: Gamepad2 },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { user, loading }      = useAuth();
  const pathname               = usePathname();
  const router                 = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleSignIn = async () => {
    try { await signInWithGoogle(); }
    catch (e) { console.error(e); }
  };

  const handleSignOut = async () => {
    await signOut();
    setUserMenuOpen(false);
    router.push("/");
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          {/* Logo */}
          <Link href="/" className="navbar-logo" style={{ textDecoration: "none" }}>
            <TrendingUp size={22} style={{ color: "var(--accent)" }} />
            Algo<span>Learn</span>
            <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "var(--text-muted)", marginTop: 2 }}>INDIA</span>
          </Link>

          {/* Desktop Nav */}
          <div className="navbar-nav">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`navbar-link ${pathname?.startsWith(href) ? "active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
              >
                <Icon size={14} />
                {label}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div className="navbar-actions">
            {/* Theme Toggle */}
            <button
              className="btn-icon"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Auth */}
            {loading ? (
              <div className="spinner" style={{ width: 20, height: 20 }} />
            ) : user ? (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    background: "var(--bg-tertiary)", border: "1px solid var(--border-color)",
                    borderRadius: "10px", padding: "0.35rem 0.75rem", cursor: "pointer",
                    color: "var(--text-primary)", fontSize: "0.85rem", fontWeight: 600,
                  }}
                >
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" style={{ width: 22, height: 22, borderRadius: "50%" }} />
                  ) : (
                    <User size={16} />
                  )}
                  <span style={{ maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {user.displayName?.split(" ")[0] || "User"}
                  </span>
                </button>

                {userMenuOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 8px)", right: 0,
                    background: "var(--bg-card)", border: "1px solid var(--border-color)",
                    borderRadius: 12, boxShadow: "var(--shadow-lg)", minWidth: 180,
                    overflow: "hidden", zIndex: 200,
                  }}>
                    <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border-color)" }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{user.displayName}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 2 }}>{user.email}</div>
                    </div>
                    <button
                      onClick={handleSignOut}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.5rem",
                        width: "100%", padding: "0.7rem 1rem", background: "none",
                        border: "none", color: "var(--danger)", cursor: "pointer",
                        fontSize: "0.875rem", fontWeight: 600,
                      }}
                    >
                      <LogOut size={15} /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={handleSignIn}>
                <LogIn size={14} /> Sign In
              </button>
            )}

            {/* Mobile Menu Toggle */}
            <button
              className="btn-icon"
              onClick={() => setMobileOpen(!mobileOpen)}
              style={{ display: "none" }}
              aria-label="Toggle menu"
              id="mobile-menu-btn"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div style={{
          position: "fixed", top: 64, left: 0, right: 0,
          background: "var(--bg-card)", borderBottom: "1px solid var(--border-color)",
          zIndex: 99, padding: "1rem 1.5rem",
          display: "flex", flexDirection: "column", gap: "0.25rem",
        }}>
          {NAV_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`navbar-link ${pathname?.startsWith(href) ? "active" : ""}`}
              onClick={() => setMobileOpen(false)}
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </div>
      )}

      <style jsx>{`
        @media (max-width: 900px) {
          #mobile-menu-btn { display: flex !important; }
        }
      `}</style>
    </>
  );
}
