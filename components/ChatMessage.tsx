"use client";
// components/ChatMessage.tsx — one chat bubble: safe mini-markdown + optional charges breakdown.

import { Fragment, ReactNode } from "react";
import { ChargeBreakdown, inr } from "@/lib/charges";

/** **bold** and *italic*, rendered as React nodes (never as HTML). */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter(l => l.trim());
        const nodes: ReactNode[] = [];
        let list: string[] = [];
        const flush = () => {
          if (list.length) nodes.push(<ul key={`u${nodes.length}`}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
          list = [];
        };
        for (const line of lines) {
          const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
          if (bullet) list.push(bullet[1]);
          else { flush(); nodes.push(<p key={`p${nodes.length}`}>{inline(line.replace(/^#+\s*/, ""))}</p>); }
        }
        flush();
        return <Fragment key={bi}>{nodes}</Fragment>;
      })}
    </>
  );
}

export function BreakdownTable({ calc }: { calc: ChargeBreakdown }) {
  return (
    <div className="chat-calc">
      <table className="table">
        <tbody>
          {calc.lines.map(l => (
            <tr key={l.key}>
              <td>
                {l.label}
                {l.note && <div className="small muted">{l.note}</div>}
              </td>
              <td style={{ textAlign: "right" }}>{inr(l.amount)}</td>
            </tr>
          ))}
          <tr className="chat-calc-total">
            <td>Total charges</td>
            <td style={{ textAlign: "right" }}>{inr(calc.total)}</td>
          </tr>
          {calc.netPnl !== undefined && calc.input.buyPrice !== calc.input.sellPrice && (
            <tr>
              <td>Net P&amp;L</td>
              <td style={{ textAlign: "right" }} className={calc.netPnl >= 0 ? "positive" : "negative"}>{inr(calc.netPnl)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
