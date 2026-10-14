// components/DataSourceBanner.tsx
import { AlertTriangle } from "lucide-react";
import type { DataSource } from "@/lib/types";

export default function DataSourceBanner({ source }: { source: DataSource }) {
  if (source !== "synthetic") return null;
  return (
    <div className="alert alert-warning">
      <AlertTriangle size={16} style={{ flexShrink: 0, color: "var(--warning)" }} />
      <span>
        <strong>Synthetic prices.</strong> Real NSE/BSE data could not be fetched and the server allows a development fallback
        (ALLOW_SYNTHETIC_DATA=true), so these candles are a generated random walk. Use them to learn the tools, not to judge a strategy.
      </span>
    </div>
  );
}
