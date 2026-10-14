// components/DataSourceBanner.tsx
import { AlertTriangle } from "lucide-react";
import type { DataSource } from "@/lib/types";

export default function DataSourceBanner({ source }: { source: DataSource }) {
  if (source !== "synthetic") return null;
  return (
    <div className="alert alert-warning">
      <AlertTriangle size={16} style={{ flexShrink: 0, color: "var(--warning)" }} />
      <span>
        <strong>Synthetic prices.</strong> Yahoo Finance could not be reached, so these candles are a generated random walk,
        not real NSE/BSE data. Use them to learn the tools, not to judge a strategy.
      </span>
    </div>
  );
}
