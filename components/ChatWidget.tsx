"use client";
// components/ChatWidget.tsx — floating launcher for the charges assistant on every page.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import ChargesChat from "./ChargesChat";

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  if (pathname?.startsWith("/assistant")) return null; // the full page already shows the chat

  return (
    <>
      {open && (
        <div className="chat-widget-panel" role="dialog" aria-label="Charges assistant">
          <ChargesChat compact />
        </div>
      )}
      <button className="chat-launcher" onClick={() => setOpen(o => !o)} aria-label={open ? "Close charges assistant" : "Open charges assistant"} aria-expanded={open}>
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>
    </>
  );
}
