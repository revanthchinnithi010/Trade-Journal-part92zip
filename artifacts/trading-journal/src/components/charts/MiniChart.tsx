import { useEffect, useRef, useState, useCallback, memo } from "react";
import {
  createChart, CandlestickSeries, HistogramSeries,
  CrosshairMode, type IChartApi, type ISeriesApi, type Time,
} from "lightweight-charts";
import { ChevronDown, Search, Link2, Unlink2 } from "lucide-react";
import { useLiveMarketContext, fmtPrice } from "@/contexts/LiveMarketContext";
import { useTickStore, useSymbolTick } from "@/store/tickStore";
import { useWatchlist, SYMBOL_CATALOG } from "@/contexts/WatchlistContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TIMEFRAMES = [
  { label: "1m", value: "1" }, { label: "5m", value: "5" },
  { label: "15m", value: "15" }, { label: "1H", value: "60" },
  { label: "4H", value: "240" }, { label: "1D", value: "D" },
];

interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number; }

// ── Symbol picker ─────────────────────────────────────────────────────────────
function MiniSymbolPicker({ onSelect, onClose }: { onSelect: (s: string) => void; onClose: () => void }) {
  const { items } = useWatchlist();
  const ticks = useTickStore(s => s.ticks);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 20);
    const h = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const id = setTimeout(() => document.addEventListener("pointerdown", h), 80);
    return () => { clearTimeout(id); document.removeEventListener("pointerdown", h); };
  }, [onClose]);

  const allSymbols = items.length > 0 ? items : Object.keys(SYMBOL_CATALOG).map(sym => ({
    symbol: sym, badge: SYMBOL_CATALOG[sym]?.badge ?? sym, market: SYMBOL_CATALOG[sym]?.market ?? "",
    label: sym, position: 0, isFavorite: false, id: 0,
  }));

  const filtered = query.trim()
    ? allSymbols.filter(i => i.symbol.toLowerCase().includes(query.toLowerCase()) || i.badge.toLowerCase().includes(query.toLowerCase()))
    : allSymbols;

  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 120,
      width: 220, maxHeight: 280, background: "rgba(7,11,9,0.99)",
      backdropFilter: "blur(24px)", border: "1px solid rgba(57,91,67,0.4)",
      borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ padding: "8px 8px 6px" }}>
        <div style={{ position: "relative" }}>
          <Search style={{ position: "absolute", left: 6, top: 7, width: 11, height: 11, color: "rgba(167,184,169,0.4)" }} />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            style={{ width: "100%", height: 26, paddingLeft: 22, paddingRight: 6, borderRadius: 6, background: "rgba(13,28,22,0.8)", border: "1px solid rgba(57,91,67,0.3)", color: "#F3FFF3", fontSize: 11, outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>
      <div style={{ overflowY: "auto", flex: 1, scrollbarWidth: "none" }}>
        {filtered.map(entry => {
          const tick = ticks[entry.symbol];
          const isPos = (tick?.changePct ?? 0) >= 0;
          return (
            <button key={entry.symbol} onClick={() => { onSelect(entry.symbol); onClose(); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", transition: "background 0.08s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(57,91,67,0.15)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(13,28,22,0.9)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 900, color: "#A7B8A9", flexShrink: 0 }}>
                {entry.badge.slice(0, 4)}
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#F3FFF3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.badge}</p>
                <p style={{ margin: 0, fontSize: 8.5, color: "rgba(167,184,169,0.45)" }}>{entry.market}</p>
              </div>
              {tick && tick.price > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, color: isPos ? "#B7FF5A" : "#ef4444", flexShrink: 0 }}>
                  {isPos ? "+" : ""}{tick.changePct.toFixed(2)}%
                </span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 12, textAlign: "center", fontSize: 10, color: "rgba(167,184,169,0.35)" }}>No results</div>
        )}
      </div>
    </div>
  );
}

// ── MiniChart ─────────────────────────────────────────────────────────────────
export interface MiniChartProps {
  defaultSymbol:     string;
  defaultInterval:   string;
  /** When provided, overrides internal interval (timeframe sync mode) */
  syncedInterval?:   string;
  /** When true, hides the symbol/TF header — parent controls symbol via controlledSymbol */
  headerless?:       boolean;
  /** When provided, parent controls the displayed symbol (e.g. from the shared mini control bar) */
  controlledSymbol?: string;
}

const MiniChart = memo(function MiniChart({ defaultSymbol, defaultInterval, syncedInterval, headerless, controlledSymbol }: MiniChartProps) {
  const [symbol,     setSymbol]     = useState(defaultSymbol);
  const [interval,   setInterval]   = useState(syncedInterval ?? defaultInterval);
  const [showPicker, setShowPicker] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [livePrice,  setLivePrice]  = useState<number | null>(null);

  const { subscribeToMessages } = useLiveMarketContext();
  const ticks = useTickStore(s => s.ticks);
  const { items } = useWatchlist();

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const mainRef      = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef       = useRef<ISeriesApi<"Histogram"> | null>(null);
  const barsRef      = useRef<Bar[]>([]);
  const symRef       = useRef(symbol);
  const ivRef        = useRef(interval);
  symRef.current = symbol;
  ivRef.current  = interval;

  // When syncedInterval changes from parent, override local interval
  useEffect(() => {
    if (syncedInterval && syncedInterval !== interval) {
      setInterval(syncedInterval);
    }
  }, [syncedInterval]); // eslint-disable-line

  // When controlledSymbol changes from parent (shared mini-bar selection), sync internal state
  useEffect(() => {
    if (controlledSymbol && controlledSymbol !== symRef.current) {
      setSymbol(controlledSymbol);
    }
  }, [controlledSymbol]); // eslint-disable-line

  // Entry from watchlist or catalog fallback
  const entry = items.find(i => i.symbol === symbol) ?? {
    badge:  SYMBOL_CATALOG[symbol]?.badge  ?? symbol.slice(0, 6),
    market: SYMBOL_CATALOG[symbol]?.market ?? "",
  };
  const tick  = ticks[symbol];
  const isPos = (tick?.changePct ?? 0) >= 0;
  const price = tick?.price ?? livePrice;

  // Create chart once on mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) { console.warn("[MiniChart] Chart mount skipped — containerRef null", defaultSymbol); return; }
    console.log("[MiniChart] Creating chart", defaultSymbol);

    const chart = createChart(container, {
      width:  container.clientWidth  || 400,
      height: container.clientHeight || 300,
      layout: { background: { color: "#07110D" }, textColor: "#A7B8A9", fontSize: 10, attributionLogo: false },
      grid: {
        vertLines: { color: "rgba(13,28,22,0.7)" },
        horzLines: { color: "rgba(13,28,22,0.7)" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(183,255,90,0.3)", labelBackgroundColor: "#0D2A1A" },
        horzLine: { color: "rgba(183,255,90,0.3)", labelBackgroundColor: "#0D2A1A" },
      },
      rightPriceScale: {
        borderColor:    "rgba(57,91,67,0.35)",
        scaleMargins:   { top: 0.06, bottom: 0.24 },
        autoScale:      true,
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: "rgba(57,91,67,0.35)",
        timeVisible: true, secondsVisible: false,
        rightOffset: 4, barSpacing: 6, minBarSpacing: 2,
      },
      handleScroll: {
        mouseWheel: true, pressedMouseMove: true,
        horzTouchDrag: true, vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true, pinch: true,
        axisPressedMouseMove: { price: false, time: true },
        axisDoubleClickReset: { price: false, time: true },
      },
    });

    const main = chart.addSeries(CandlestickSeries, {
      upColor: "#B7FF5A", downColor: "#ef4444",
      borderUpColor: "#B7FF5A", borderDownColor: "#ef4444",
      wickUpColor: "#7CBF4B", wickDownColor: "#dc2626",
    });
    const vol = chart.addSeries(HistogramSeries, {
      color: "#B7FF5A28",
      priceFormat: { type: "volume" as const },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    mainRef.current  = main;
    volRef.current   = vol;
    console.log("[MiniChart] Chart mounted", defaultSymbol);

    const ro = new ResizeObserver(entries => {
      const e = entries[0];
      if (e) chart.applyOptions({ width: e.contentRect.width, height: e.contentRect.height });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null; mainRef.current = null; volRef.current = null;
    };
  }, []); // eslint-disable-line

  // ── Custom price-scale drag (TradingView-style) ───────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const PRICE_SCALE_W   = 60;
    const DEFAULT_MARGINS = { top: 0.06, bottom: 0.24 };

    let dragging    = false;
    let startY      = 0;
    let startTop    = DEFAULT_MARGINS.top;
    let startBottom = DEFAULT_MARGINS.bottom;
    let capturedId  = -1;

    const inScale = (clientX: number) => {
      const r = container.getBoundingClientRect();
      return (r.right - clientX) <= PRICE_SCALE_W;
    };

    const onMouseMove  = (e: MouseEvent) => {
      if (!dragging) container.style.cursor = inScale(e.clientX) ? "ns-resize" : "";
    };
    const onMouseLeave = () => { if (!dragging) container.style.cursor = ""; };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !inScale(e.clientX)) return;
      const chart = chartRef.current;
      if (!chart) return;
      e.preventDefault();
      e.stopPropagation();
      dragging    = true;
      startY      = e.clientY;
      capturedId  = e.pointerId;
      const opts  = chart.priceScale("right").options() as { scaleMargins?: { top: number; bottom: number } };
      startTop    = opts.scaleMargins?.top    ?? DEFAULT_MARGINS.top;
      startBottom = opts.scaleMargins?.bottom ?? DEFAULT_MARGINS.bottom;
      container.setPointerCapture(e.pointerId);
      container.style.cursor = "ns-resize";
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== capturedId) return;
      const chart = chartRef.current;
      if (!chart) return;
      const dy          = e.clientY - startY;
      const sensitivity = 0.003;
      const clamp       = (v: number) => Math.max(0.01, Math.min(0.45, v));
      chart.priceScale("right").applyOptions({
        scaleMargins: {
          top:    clamp(startTop    + dy * sensitivity),
          bottom: clamp(startBottom + dy * sensitivity),
        },
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== capturedId) return;
      dragging = false;
      if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
      container.style.cursor = "";
    };

    const onDblClick = (e: MouseEvent) => {
      if (!inScale(e.clientX)) return;
      const chart = chartRef.current;
      if (!chart) return;
      chart.priceScale("right").applyOptions({ scaleMargins: DEFAULT_MARGINS });
    };

    container.addEventListener("mousemove",     onMouseMove);
    container.addEventListener("mouseleave",    onMouseLeave);
    container.addEventListener("pointerdown",   onPointerDown);
    container.addEventListener("pointermove",   onPointerMove);
    container.addEventListener("pointerup",     onPointerUp);
    container.addEventListener("pointercancel", onPointerUp);
    container.addEventListener("dblclick",      onDblClick);
    return () => {
      container.removeEventListener("mousemove",     onMouseMove);
      container.removeEventListener("mouseleave",    onMouseLeave);
      container.removeEventListener("pointerdown",   onPointerDown);
      container.removeEventListener("pointermove",   onPointerMove);
      container.removeEventListener("pointerup",     onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
      container.removeEventListener("dblclick",      onDblClick);
    };
  }, []); // eslint-disable-line

  // Load candle data
  const loadCandles = useCallback(async (sym: string, iv: string) => {
    const main = mainRef.current;
    const vol  = volRef.current;
    if (!main || !vol) { console.log("[MiniChart] loadCandles skipped — series not ready", sym); return; }
    console.log("[MiniChart] Creating chart / loading OHLC", sym, iv);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/candles/${sym}/${iv}`);
      if (!res.ok) {
        console.warn("[MiniChart] OHLC fetch failed", sym, iv, res.status, res.statusText);
        return;
      }
      const raw: Bar[] = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) {
        console.warn("[MiniChart] OHLC empty response", sym, iv);
        return;
      }
      const bars = [...new Map(raw.map(b => [b.time, b])).values()].sort((a, b) => a.time - b.time);
      barsRef.current = bars;
      main.setData(bars.map(b => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
      vol.setData(bars.map(b => ({ time: b.time as Time, value: b.volume, color: b.close >= b.open ? "#B7FF5A28" : "#ef444428" })));
      chartRef.current?.timeScale().fitContent();
      const last = bars[bars.length - 1];
      if (last) setLivePrice(last.close);
      console.log("[MiniChart] OHLC loaded", sym, iv, bars.length, "bars");
    } catch (err) {
      console.error("[MiniChart] OHLC load error", sym, iv, err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadCandles(symbol, interval); }, [symbol, interval, loadCandles]);

  // Live WS updates
  useEffect(() => {
    return subscribeToMessages((raw: unknown) => {
      const msg = raw as { type: string; symbol?: string; interval?: string; bar?: Bar };
      if (msg.type !== "candle_update" || msg.symbol !== symRef.current || msg.interval !== ivRef.current || !msg.bar) return;
      const b  = msg.bar;
      const cs = mainRef.current;
      const vs = volRef.current;
      if (!cs || !vs) return;
      const stored = barsRef.current;
      if (stored.length > 0 && stored[stored.length - 1].time === b.time) stored[stored.length - 1] = b;
      else stored.push(b);
      cs.update({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close });
      vs.update({ time: b.time as Time, value: b.volume, color: b.close >= b.open ? "#B7FF5A28" : "#ef444428" });
      setLivePrice(b.close);
    });
  }, [subscribeToMessages]);

  const isSynced = !!syncedInterval;

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", background: "#07110D", overflow: "hidden" }}>
      {/* Mini header — hidden when parent controls symbol via shared mini control bar */}
      {!headerless && (
      <div style={{
        height: 34, display: "flex", alignItems: "center", gap: 5, padding: "0 8px",
        background: "rgba(9,15,11,0.96)", borderBottom: "1px solid rgba(57,91,67,0.2)",
        flexShrink: 0, position: "relative",
      }}>
        {/* Symbol button */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowPicker(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 5, height: 24, padding: "0 7px",
              borderRadius: 7, cursor: "pointer", border: "none",
              background: showPicker ? "rgba(183,255,90,0.1)" : "rgba(13,22,17,0.85)",
              boxShadow: `0 0 0 1px ${showPicker ? "rgba(183,255,90,0.3)" : "rgba(57,91,67,0.3)"}`,
              transition: "all 0.1s",
            }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: "rgba(183,255,90,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 6, fontWeight: 900, color: "#B7FF5A" }}>
              {entry.badge.slice(0, 4)}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: "#F3FFF3" }}>{entry.badge}</span>
            <ChevronDown style={{ width: 9, height: 9, color: "rgba(167,184,169,0.4)" }} />
          </button>
          {showPicker && <MiniSymbolPicker onSelect={s => { setSymbol(s); setShowPicker(false); }} onClose={() => setShowPicker(false)} />}
        </div>

        {/* Timeframe pills */}
        <div style={{ display: "flex", gap: 1 }}>
          {TIMEFRAMES.map(tf => {
            const active = tf.value === interval;
            return (
              <button key={tf.value}
                onClick={() => { if (!isSynced) setInterval(tf.value); }}
                style={{
                  padding: "0 5px", height: 20, borderRadius: 5, border: "none",
                  cursor: isSynced ? "default" : "pointer",
                  fontSize: 9.5, fontWeight: active ? 800 : 600,
                  background: active ? (isSynced ? "rgba(183,255,90,0.08)" : "rgba(183,255,90,0.12)") : "transparent",
                  color: active ? "#B7FF5A" : "rgba(167,184,169,0.45)",
                  opacity: isSynced && !active ? 0.4 : 1,
                  transition: "all 0.1s",
                }}
              >{tf.label}</button>
            );
          })}
        </div>

        {/* Live price */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
          {isSynced && (
            <div style={{ width: 18, height: 18, borderRadius: 5, background: "rgba(183,255,90,0.1)", boxShadow: "0 0 0 1px rgba(183,255,90,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Link2 style={{ width: 10, height: 10, color: "#B7FF5A" }} />
            </div>
          )}
          {price !== null && price > 0 && (
            <>
              <span style={{ fontSize: 10.5, fontWeight: 800, fontFamily: "monospace", color: "#F3FFF3" }}>
                {fmtPrice(price, symbol)}
              </span>
              {tick && (
                <span style={{ fontSize: 9, fontWeight: 700, color: isPos ? "#B7FF5A" : "#ef4444" }}>
                  {isPos ? "+" : ""}{tick.changePct.toFixed(2)}%
                </span>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {/* Chart canvas */}
      <div ref={containerRef} style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5, background: "rgba(7,17,13,0.35)" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2.5px solid rgba(183,255,90,0.2)", borderTopColor: "#B7FF5A", animation: "spin 0.8s linear infinite" }} />
          </div>
        )}
      </div>
    </div>
  );
});

export default MiniChart;
