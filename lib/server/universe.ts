// lib/server/universe.ts — every listed equity on NSE (main board + SME) and BSE.
//
// Sources are the exchanges' own published lists:
//   NSE  https://archives.nseindia.com/content/equities/EQUITY_L.csv
//   NSE  https://archives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv
//   BSE  https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?…&segment=Equity&status=Active
// The merged list is cached in MARKET_DATA_DIR/universe.json and refreshed every 24 h in
// the background. If the exchanges cannot be reached and no cache exists, a small built-in
// list of large caps is used and the API says so (`complete: false`).
//
// Offline import: download the files manually and run
//   npm run symbols:sync -- --nse EQUITY_L.csv --sme SME_EQUITY_L.csv --bse bse.json

import fs from "node:fs";
import path from "node:path";
import { POPULAR_SYMBOLS } from "../marketData";
import type { Instrument } from "../types";
import { redis, redisEnabled } from "./redis";

const NSE_URL = process.env.NSE_EQUITY_LIST_URL || "https://archives.nseindia.com/content/equities/EQUITY_L.csv";
const NSE_SME_URL = process.env.NSE_SME_LIST_URL || "https://archives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv";
const BSE_URL = process.env.BSE_SCRIP_LIST_URL ||
  "https://api.bseindia.com/BseIndiaAPI/api/ListofScripData/w?Group=&Scripcode=&industry=&segment=Equity&status=Active";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  Accept: "*/*",
};

export const INDICES: Instrument[] = [
  { symbol: "^NSEI", exchange: "INDEX", code: "NIFTY 50", name: "Nifty 50" },
  { symbol: "^NSEBANK", exchange: "INDEX", code: "NIFTY BANK", name: "Nifty Bank" },
  { symbol: "^CNXIT", exchange: "INDEX", code: "NIFTY IT", name: "Nifty IT" },
  { symbol: "^NSMIDCP", exchange: "INDEX", code: "NIFTY NEXT 50", name: "Nifty Next 50" },
  { symbol: "^BSESN", exchange: "INDEX", code: "SENSEX", name: "BSE Sensex" },
];

export interface Universe {
  instruments: Instrument[];
  updatedAt: string | null;
  complete: boolean;      // false = built-in fallback list only
  counts: { nse: number; nseSme: number; bse: number };
  errors: string[];
}

// ─── parsers (exported for tests) ─────────────────────────────────────────

/** Minimal RFC-4180 CSV parser (handles quoted fields with commas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(f => f.trim())) rows.push(row);
  return rows;
}

const titleCase = (s: string) => s.replace(/\s+/g, " ").trim();

/** NSE EQUITY_L.csv / SME_EQUITY_L.csv → instruments. */
export function parseNseList(csv: string, sme = false): Instrument[] {
  const [header, ...rows] = parseCsv(csv.replace(/^﻿/, ""));
  if (!header) return [];
  const col = (name: string) => header.findIndex(h => h.trim().toUpperCase().replace(/_/g, " ") === name);
  const iSym = col("SYMBOL"), iName = col("NAME OF COMPANY"), iSeries = col("SERIES"), iIsin = col("ISIN NUMBER");
  if (iSym < 0 || iName < 0) throw new Error("NSE list: unexpected columns " + header.join(","));
  const out: Instrument[] = [];
  for (const r of rows) {
    const code = (r[iSym] ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9&\-]{1,20}$/.test(code)) continue;
    out.push({
      symbol: `${code}.NS`,
      exchange: "NSE",
      code,
      name: titleCase(r[iName] ?? code),
      isin: iIsin >= 0 ? r[iIsin]?.trim() || undefined : undefined,
      series: iSeries >= 0 ? r[iSeries]?.trim() || undefined : undefined,
      sme: sme || undefined,
    });
  }
  return out;
}

/** BSE ListofScripData JSON (array of objects; key casing varies) → instruments. */
export function parseBseList(json: unknown): Instrument[] {
  const arr: any[] = Array.isArray(json) ? json : Array.isArray((json as any)?.Table) ? (json as any).Table : [];
  const get = (o: any, ...keys: string[]) => {
    for (const k of Object.keys(o)) if (keys.includes(k.toLowerCase())) return String(o[k] ?? "").trim();
    return "";
  };
  const out: Instrument[] = [];
  for (const o of arr) {
    const code = get(o, "scrip_cd", "scripcode", "scrip_code");
    const status = get(o, "status");
    if (!/^\d{5,6}$/.test(code) || (status && status.toLowerCase() !== "active")) continue;
    const id = get(o, "scrip_id", "scripid");
    out.push({
      symbol: `${code}.BO`,
      exchange: "BSE",
      code,
      name: titleCase(get(o, "issuer_name", "scrip_name", "scripname") || id || code),
      isin: get(o, "isin_number", "isin") || undefined,
      series: get(o, "group") || undefined,
      industry: get(o, "industry") || undefined,
      alias: id || undefined,
    });
  }
  return out;
}

// ─── loading & caching ──────────────────────────────────────────────────

const dataDir = () => path.resolve(/*turbopackIgnore: true*/ process.env.MARKET_DATA_DIR || (process.env.VERCEL ? "/tmp/.market-data" : ".market-data"));
const cacheFile = () => path.join(dataDir(), "universe.json");

const g = globalThis as any;

function fallbackUniverse(errors: string[]): Universe {
  const instruments: Instrument[] = [
    ...INDICES,
    ...POPULAR_SYMBOLS.filter(s => !s.symbol.startsWith("^")).map(s => ({
      symbol: s.symbol, exchange: "NSE" as const, code: s.symbol.replace(/\.NS$/, ""), name: s.name, industry: s.sector,
    })),
  ];
  return { instruments, updatedAt: null, complete: false, counts: { nse: instruments.length - INDICES.length, nseSme: 0, bse: 0 }, errors };
}

export function buildUniverse(nse: Instrument[], sme: Instrument[], bse: Instrument[], errors: string[] = []): Universe {
  // carry NSE industry over from the BSE listing of the same ISIN
  const industryByIsin = new Map(bse.filter(b => b.isin && b.industry).map(b => [b.isin!, b.industry!]));
  for (const i of [...nse, ...sme]) if (i.isin && !i.industry) i.industry = industryByIsin.get(i.isin);
  return {
    instruments: [...INDICES, ...nse, ...sme, ...bse],
    updatedAt: new Date().toISOString(),
    complete: nse.length > 0 && bse.length > 0,
    counts: { nse: nse.length, nseSme: sme.length, bse: bse.length },
    errors,
  };
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: { ...BROWSER_HEADERS, ...headers }, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return res.text();
}

/** Downloads all three lists. Partial success is kept (e.g. NSE ok, BSE down). */
export async function downloadUniverse(): Promise<Universe> {
  const errors: string[] = [];
  const attempt = async <T>(label: string, fn: () => Promise<T[]>): Promise<T[]> => {
    try { return await fn(); } catch (e: any) { errors.push(`${label}: ${e?.message || e}`); return []; }
  };
  const [nse, sme, bse] = await Promise.all([
    attempt("NSE main board", async () => parseNseList(await fetchText(NSE_URL))),
    attempt("NSE SME", async () => parseNseList(await fetchText(NSE_SME_URL), true)),
    attempt("BSE", async () => parseBseList(JSON.parse(await fetchText(BSE_URL, { Referer: "https://www.bseindia.com/", Origin: "https://www.bseindia.com" })))),
  ]);
  return buildUniverse(nse, sme, bse, errors);
}

export function saveUniverse(u: Universe) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(cacheFile() + ".tmp", JSON.stringify(u));
  fs.renameSync(cacheFile() + ".tmp", cacheFile());
}

/** Shares the downloaded list between serverless instances. Best effort. */
async function saveShared(u: Universe) {
  if (!redisEnabled()) return;
  await redis(["SET", "universe:v1", JSON.stringify(u), "EX", 3 * 24 * 3600]).catch(e => console.warn("[universe] Redis save failed:", e?.message));
}

async function readCache(): Promise<Universe | null> {
  const valid = (u: Universe | null) => (u && Array.isArray(u.instruments) && u.instruments.length ? u : null);
  try {
    const local = valid(JSON.parse(fs.readFileSync(cacheFile(), "utf8")));
    if (local) return local;
  } catch { /* no local cache */ }
  if (redisEnabled()) {
    try {
      const raw = await redis<string | null>(["GET", "universe:v1"]);
      return raw ? valid(JSON.parse(raw)) : null;
    } catch { /* fall through to download */ }
  }
  return null;
}

async function refresh(): Promise<void> {
  if (g.__algolearnUniverseRefreshing) return g.__algolearnUniverseRefreshing;
  g.__algolearnUniverseRefreshing = (async () => {
    try {
      const fresh = await downloadUniverse();
      const current: Universe | undefined = g.__algolearnUniverse;
      // never replace a good list with a worse one
      if (fresh.counts.nse + fresh.counts.bse > (current?.complete ? (current.counts.nse + current.counts.bse) * 0.5 : 0)) {
        g.__algolearnUniverse = fresh;
        g.__algolearnUniverseIndex = null;
        try { saveUniverse(fresh); } catch (e: any) { console.warn("[universe] file cache not writable:", e?.message); }
        await saveShared(fresh);
      } else if (current) {
        current.errors = fresh.errors;
      } else {
        g.__algolearnUniverse = fallbackUniverse(fresh.errors);
      }
    } finally {
      g.__algolearnUniverseRefreshing = null;
      g.__algolearnUniverseCheckedAt = Date.now();
    }
  })();
  return g.__algolearnUniverseRefreshing;
}

/** Returns the universe immediately when cached; downloads on first use; refreshes stale data in the background. */
export async function getUniverse(): Promise<Universe> {
  let u: Universe | undefined = g.__algolearnUniverse;
  if (!u) {
    const cached = await readCache();
    if (cached) u = g.__algolearnUniverse = cached;
  }
  const age = u?.updatedAt ? Date.now() - Date.parse(u.updatedAt) : Infinity;
  const recentlyChecked = Date.now() - (g.__algolearnUniverseCheckedAt ?? 0) < 10 * 60 * 1000;
  if (!u) {
    await refresh();
    return g.__algolearnUniverse;
  }
  if ((age > MAX_AGE_MS || !u.complete) && !recentlyChecked) void refresh();
  return u;
}

// ─── search ─────────────────────────────────────────────────────────────

interface Indexed { inst: Instrument; code: string; alias: string; name: string; words: string[] }

function index(u: Universe): Indexed[] {
  if (g.__algolearnUniverseIndex) return g.__algolearnUniverseIndex;
  g.__algolearnUniverseIndex = u.instruments.map(inst => {
    const name = inst.name.toLowerCase();
    return { inst, code: inst.code.toLowerCase(), alias: inst.alias?.toLowerCase() ?? "", name, words: name.split(/[^a-z0-9&]+/).filter(Boolean) };
  });
  return g.__algolearnUniverseIndex;
}

export function searchInstruments(u: Universe, query: string, opts: { exchange?: string; limit?: number } = {}): Instrument[] {
  const q = query.trim().toLowerCase().replace(/\.(ns|bo)$/, "");
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const ex = opts.exchange?.toUpperCase();
  const pool = index(u).filter(x => !ex || ex === "ALL" || x.inst.exchange === ex);
  if (!q) {
    return pool.filter(x => x.inst.exchange === "INDEX" || POPULAR_SYMBOLS.some(p => p.symbol === x.inst.symbol)).slice(0, limit).map(x => x.inst);
  }
  const terms = q.split(/\s+/);
  const scored: { inst: Instrument; score: number }[] = [];
  for (const x of pool) {
    let score = 0;
    if (x.code === q || x.alias === q || x.inst.symbol.toLowerCase() === q) score = 100;
    else if (x.code.startsWith(q) || (x.alias && x.alias.startsWith(q))) score = 80 - Math.min((x.alias.startsWith(q) ? x.alias : x.code).length - q.length, 15);
    else if (terms.every(t => x.words.some(w => w.startsWith(t)))) score = 60;
    else if (x.name.includes(q)) score = 40;
    else if (x.inst.isin?.toLowerCase() === q) score = 90;
    if (!score) continue;
    if (x.inst.exchange === "NSE") score += 3;                     // prefer the more liquid NSE listing
    if (x.inst.series && !["EQ", "A", "B"].includes(x.inst.series)) score -= 2;
    scored.push({ inst: x.inst, score });
  }
  scored.sort((a, b) => b.score - a.score || a.inst.name.localeCompare(b.inst.name));
  return scored.slice(0, limit).map(s => s.inst);
}

export function findInstrument(u: Universe, symbol: string): Instrument | undefined {
  const s = symbol.toUpperCase();
  return u.instruments.find(i => i.symbol.toUpperCase() === s);
}
