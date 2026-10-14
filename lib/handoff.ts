// lib/handoff.ts — passes a strategy between pages (builder/dashboard → backtester) via sessionStorage

const KEY = "algolearn_handoff_strategy";

export interface Handoff { code: string; description?: string; name?: string }

export function setHandoff(h: Handoff) {
  try { sessionStorage.setItem(KEY, JSON.stringify(h)); } catch { /* storage blocked */ }
}

export function takeHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const h = JSON.parse(raw);
    return typeof h?.code === "string" ? h : null;
  } catch {
    return null;
  }
}
