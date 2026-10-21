"use client";
// components/ChargesChat.tsx — the trading-charges chatbot (used by the floating widget and /assistant).

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, Maximize2, RotateCcw, Send, Sparkles, User } from "lucide-react";
import { askChargesAssistant, ChatTurn } from "@/lib/api";
import { ChargeBreakdown, ChargeInput } from "@/lib/charges";
import { STARTER_QUESTIONS } from "@/lib/chargesKnowledge";
import { BreakdownTable, RichText } from "./ChatMessage";

interface Message extends ChatTurn {
  id: number;
  calc?: ChargeBreakdown;
  source?: "ai" | "rules";
  error?: boolean;
}

interface Saved { messages: Message[]; context?: ChargeInput; suggestions: string[] }

const STORAGE_KEY = "algolearn:charges-chat";
const WELCOME: Message = {
  id: 0,
  role: "assistant",
  text: "Hi! I'm the **charges assistant**. Ask me about brokerage, STT, stamp duty, DP charges, GST or tax on trading profits, or describe a trade and I'll calculate the exact charges, net P&L and breakeven.",
};

function load(): Saved | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const s = raw ? (JSON.parse(raw) as Saved) : null;
    return s && Array.isArray(s.messages) && s.messages.length ? s : null;
  } catch {
    return null;
  }
}

export default function ChargesChat({ compact = false, onCalc }: { compact?: boolean; onCalc?: (input: ChargeInput) => void }) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [context, setContext] = useState<ChargeInput | undefined>();
  const [suggestions, setSuggestions] = useState<string[]>(STARTER_QUESTIONS.slice(0, compact ? 3 : 5));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const s = load();
    if (s) { setMessages(s.messages); setContext(s.context); setSuggestions(s.suggestions ?? []); }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-40), context, suggestions })); } catch { /* storage unavailable */ }
  }, [messages, context, suggestions, loaded]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history: ChatTurn[] = messages.filter(m => m.id !== 0 && !m.error).map(({ role, text }) => ({ role, text }));
    setMessages(m => [...m, { id: Date.now(), role: "user", text: q }]);
    setInput("");
    setSuggestions([]);
    setBusy(true);
    try {
      const r = await askChargesAssistant(q, history, context);
      setMessages(m => [...m, { id: Date.now() + 1, role: "assistant", text: r.reply, calc: r.calc, source: r.source }]);
      setContext(r.context);
      setSuggestions(r.suggestions ?? []);
      if (r.calc && onCalc) onCalc(r.calc.input);
    } catch (e) {
      setMessages(m => [...m, { id: Date.now() + 1, role: "assistant", text: e instanceof Error ? e.message : "Something went wrong. Please try again.", error: true }]);
      setSuggestions(STARTER_QUESTIONS.slice(0, 2));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); send(input); };

  const reset = () => {
    setMessages([WELCOME]);
    setContext(undefined);
    setSuggestions(STARTER_QUESTIONS.slice(0, compact ? 3 : 5));
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  return (
    <div className={`chat ${compact ? "chat-compact" : ""}`}>
      <div className="chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
          <span className="chat-avatar chat-avatar-bot"><Bot size={16} /></span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>Charges Assistant</div>
            <div className="small muted">Brokerage · STT · taxes · calculator</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.35rem" }}>
          {compact && <Link href="/assistant" className="btn-icon" title="Open full page with calculator" aria-label="Open full page with calculator"><Maximize2 size={14} /></Link>}
          <button className="btn-icon" onClick={reset} title="New conversation" aria-label="New conversation"><RotateCcw size={14} /></button>
        </div>
      </div>

      <div className="chat-messages" ref={listRef} aria-live="polite">
        {messages.map(m => (
          <div key={m.id} className={`chat-row chat-row-${m.role}`}>
            <span className={`chat-avatar ${m.role === "user" ? "chat-avatar-user" : "chat-avatar-bot"}`}>
              {m.role === "user" ? <User size={14} /> : <Bot size={14} />}
            </span>
            <div className={`chat-bubble ${m.error ? "chat-bubble-error" : ""}`}>
              {m.role === "user" ? <p>{m.text}</p> : <RichText text={m.text} />}
              {m.calc && <BreakdownTable calc={m.calc} />}
              {m.source === "ai" && <div className="chat-source"><Sparkles size={10} /> AI answer, figures from the platform calculator</div>}
            </div>
          </div>
        ))}
        {busy && (
          <div className="chat-row chat-row-assistant">
            <span className="chat-avatar chat-avatar-bot"><Bot size={14} /></span>
            <div className="chat-bubble"><span className="chat-typing"><i /><i /><i /></span></div>
          </div>
        )}
      </div>

      {suggestions.length > 0 && !busy && (
        <div className="chat-suggestions">
          {suggestions.map(s => <button key={s} className="chat-chip" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}

      <form className="chat-input" onSubmit={submit}>
        <textarea
          ref={inputRef}
          className="form-textarea"
          rows={1}
          value={input}
          maxLength={1000}
          placeholder="e.g. Buy 100 at 500, sell at 520 intraday"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          aria-label="Ask about trading charges"
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !input.trim()} aria-label="Send"><Send size={15} /></button>
      </form>
      <p className="chat-disclaimer">Typical rates as of April 2026; your broker&apos;s tariff may differ. Not investment or tax advice.</p>
    </div>
  );
}
