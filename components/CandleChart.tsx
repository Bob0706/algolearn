"use client";
// components/CandleChart.tsx — TradingView lightweight-charts candlesticks with markers

import { useEffect, useRef } from "react";
import {
  CandlestickSeries, createChart, createSeriesMarkers, IChartApi, ISeriesApi, ISeriesMarkersPluginApi,
  LineSeries, SeriesMarker, Time, UTCTimestamp,
} from "lightweight-charts";
import type { IntradayBar, OHLCVBar } from "@/lib/types";

const IST = 19800;
/** Daily bars use their date; intraday bars are shifted to IST so the axis shows Indian market hours. */
const toTime = (b: OHLCVBar | IntradayBar): Time => ("time" in b ? ((b.time + IST) as UTCTimestamp) : (b.date as Time));

export interface ChartMarker {
  date: string;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
}

export interface ChartLine { data: { date: string; value: number }[]; color: string }

export default function CandleChart({ bars, markers = [], height = 340, follow = false, line }: {
  bars: (OHLCVBar | IntradayBar)[]; markers?: ChartMarker[]; height?: number; follow?: boolean; line?: ChartLine;
}) {
  const intraday = bars.length > 0 && "time" in bars[0];
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeries = useRef<ISeriesApi<"Line"> | null>(null);
  const markerApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!box.current) return;
    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue("--text-muted").trim() || "#94a3b8";
    const c = createChart(box.current, {
      layout: { background: { color: "transparent" }, textColor: text },
      grid: { vertLines: { color: "rgba(128,128,128,0.1)" }, horzLines: { color: "rgba(128,128,128,0.1)" } },
      width: box.current.clientWidth,
      height,
      timeScale: { borderColor: "rgba(128,128,128,0.25)", timeVisible: intraday, secondsVisible: false },
      rightPriceScale: { borderColor: "rgba(128,128,128,0.25)" },
    });
    const s = c.addSeries(CandlestickSeries, {
      upColor: "#10b981", downColor: "#ef4444", wickUpColor: "#10b981", wickDownColor: "#ef4444", borderVisible: false,
    });
    chart.current = c;
    series.current = s;
    markerApi.current = createSeriesMarkers(s, []);
    const ro = new ResizeObserver(() => box.current && c.applyOptions({ width: box.current.clientWidth }));
    ro.observe(box.current);
    return () => {
      ro.disconnect();
      c.remove();
      chart.current = null; series.current = null; markerApi.current = null; lineSeries.current = null; fitted.current = false;
    };
  }, [height, intraday]);

  useEffect(() => {
    if (!series.current) return;
    series.current.setData(bars.map(b => ({ time: toTime(b), open: b.open, high: b.high, low: b.low, close: b.close })));
    const ms: SeriesMarker<Time>[] = [...markers]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(m => ({ time: m.date as Time, position: m.position, color: m.color, shape: m.shape, text: m.text }));
    markerApi.current?.setMarkers(ms);
    if (line && chart.current) {
      if (!lineSeries.current) lineSeries.current = chart.current.addSeries(LineSeries, { color: line.color, lineWidth: 1, priceLineVisible: false });
      lineSeries.current.setData(line.data.map(p => ({ time: p.date as Time, value: p.value })));
    }
    // first load: show every bar edge to edge; afterwards keep the newest bar in view when following
    if (!fitted.current && bars.length) { chart.current?.timeScale().fitContent(); fitted.current = true; }
    else if (follow) chart.current?.timeScale().scrollToRealTime();
  }, [bars, markers, follow, line]);

  return <div ref={box} style={{ width: "100%", height }} />;
}
