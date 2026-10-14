"use client";
// contexts/ThemeContext.tsx — light/dark theme with OS preference fallback

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: "dark", toggle: () => {} });
const KEY = "algolearn_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    let initial: Theme = "dark";
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "light" || saved === "dark") initial = saved;
      else if (window.matchMedia("(prefers-color-scheme: light)").matches) initial = "light";
    } catch { /* storage blocked */ }
    setTheme(initial);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(t => {
      const next = t === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
