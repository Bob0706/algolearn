"use client";
// components/SymbolSearch.tsx — search any NSE / BSE listed company (ticker, BSE code, name or ISIN)

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { searchSymbols, SymbolSearch as SearchResult } from "@/lib/api";
import type { Instrument } from "@/lib/types";

const EXCHANGES = ["ALL", "NSE", "BSE", "INDEX"] as const;

export function displaySymbol(i: Pick<Instrument, "exchange" | "code" | "alias">) {
  if (i.exchange === "BSE") return `BSE ${i.code}${i.alias ? ` · ${i.alias}` : ""}`;
  if (i.exchange === "INDEX") return i.code;
  return `NSE ${i.code}`;
}

export default function SymbolSearch({ value, onChange, label = "Company / index", id }: {
  value: string;
  onChange: (symbol: string, inst?: Instrument) => void;
  label?: string;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? `sym-${autoId}`;
  const listId = `${inputId}-list`;
  const [query, setQuery] = useState("");
  const [exchange, setExchange] = useState<(typeof EXCHANGES)[number]>("ALL");
  const [data, setData] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);

  // resolve the current value to a name (e.g. when it came from a ?symbol= link)
  useEffect(() => {
    if (selected?.symbol === value) return;
    searchSymbols(value.replace(/\.(NS|BO)$/, ""), "ALL", 10)
      .then(r => setSelected(r.results.find(i => i.symbol === value) ?? { symbol: value, exchange: value.endsWith(".BO") ? "BSE" : value.startsWith("^") ? "INDEX" : "NSE", code: value.replace(/\.(NS|BO)$/, ""), name: value }))
      .catch(() => {});
  }, [value, selected?.symbol]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      searchSymbols(query, exchange, 25)
        .then(r => { setData(r); setActive(0); setError(""); })
        .catch(e => setError(e.message));
    }, 180);
    return () => clearTimeout(t);
  }, [query, exchange, open]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (i: Instrument) => {
    setSelected(i);
    setOpen(false);
    setQuery("");
    onChange(i.symbol, i);
  };

  const results = data?.results ?? [];

  return (
    <div className="form-group" ref={box} style={{ position: "relative" }}>
      <label className="form-label" htmlFor={inputId}>{label}</label>
      <div style={{ position: "relative" }}>
        <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
        <input
          id={inputId}
          className="form-input"
          style={{ paddingLeft: 32 }}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={selected ? `${selected.name} (${displaySymbol(selected)})` : "Search any NSE / BSE company…"}
          value={open ? query : selected ? `${selected.name} (${displaySymbol(selected)})` : value}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
        />
      </div>

      {open && (
        <div className="card" style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 40, marginTop: 4, padding: "0.4rem", maxHeight: 380, overflowY: "auto" }}>
          <div style={{ display: "flex", gap: "0.25rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
            {EXCHANGES.map(x => (
              <button key={x} type="button" className={`btn btn-sm ${exchange === x ? "btn-primary" : "btn-ghost"}`} style={{ padding: "0.2rem 0.55rem" }} onClick={() => setExchange(x)}>
                {x === "ALL" ? "All" : x === "INDEX" ? "Indices" : x}
              </button>
            ))}
            {data && <span className="small muted" style={{ marginLeft: "auto", alignSelf: "center" }}>{data.total.toLocaleString("en-IN")} listings</span>}
          </div>
          {data?.note && <div className="alert alert-warning small" style={{ marginBottom: "0.35rem" }}>{data.note}</div>}
          {error && <div className="small negative" style={{ padding: "0.4rem" }}>{error}</div>}
          <ul id={listId} role="listbox" style={{ listStyle: "none" }}>
            {results.map((i, idx) => (
              <li key={i.symbol} role="option" aria-selected={idx === active}>
                <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(i)} onMouseEnter={() => setActive(idx)}
                  className="btn btn-ghost w-full" style={{ justifyContent: "space-between", whiteSpace: "normal", textAlign: "left", background: idx === active ? "var(--accent-light)" : undefined, padding: "0.45rem 0.55rem" }}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{i.name}</span>
                    <span className="small muted" style={{ display: "block" }}>{displaySymbol(i)}{i.industry ? ` · ${i.industry}` : ""}</span>
                  </span>
                  <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {i.sme && <span className="badge badge-warning">SME</span>}
                    <span className={`badge ${i.exchange === "NSE" ? "badge-accent" : i.exchange === "BSE" ? "badge-info" : "badge-muted"}`}>{i.exchange}</span>
                  </span>
                </button>
              </li>
            ))}
            {data && !results.length && <li className="small muted" style={{ padding: "0.6rem" }}>No company matches “{query}”.</li>}
            {!data && !error && <li style={{ padding: "0.6rem" }}><span className="spinner" /></li>}
          </ul>
        </div>
      )}
    </div>
  );
}
