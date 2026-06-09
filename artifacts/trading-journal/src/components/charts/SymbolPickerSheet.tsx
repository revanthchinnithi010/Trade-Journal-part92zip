import { memo, useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Check } from "lucide-react";
import { fmtPrice } from "@/contexts/LiveMarketContext";
import { useTickStore } from "@/store/tickStore";
import { useWatchlist, SYMBOL_CATALOG, type WatchlistEntry } from "@/contexts/WatchlistContext";

// ── Icon colours (shared subset from MobileWatchlistOverlay) ─────────────
const MARKET_COLORS: Record<string, { bg: string; text: string }> = {
  Crypto:      { bg: "linear-gradient(135deg,#f7931a,#f4a022)", text: "#fff"    },
  Forex:       { bg: "linear-gradient(135deg,#3b82f6,#06b6d4)", text: "#fff"    },
  Indices:     { bg: "linear-gradient(135deg,#8b5cf6,#a78bfa)", text: "#fff"    },
  Commodities: { bg: "linear-gradient(135deg,#eab308,#f59e0b)", text: "#1a1000" },
  Other:       { bg: "linear-gradient(135deg,#6b7280,#9ca3af)", text: "#fff"    },
};
const SYMBOL_OVERRIDES: Record<string, { bg: string; text: string }> = {
  BTCUSD:  { bg:"linear-gradient(135deg,#f7931a,#e67e00)", text:"#fff" },
  ETHUSD:  { bg:"linear-gradient(135deg,#627eea,#8fa0f4)", text:"#fff" },
  SOLUSD:  { bg:"linear-gradient(135deg,#9945ff,#14f195)", text:"#fff" },
  DOGEUSD: { bg:"linear-gradient(135deg,#ba9f33,#e3c44b)", text:"#111" },
  PEPEUSD: { bg:"linear-gradient(135deg,#5cb85c,#3aaf3a)", text:"#fff" },
  EURUSD:  { bg:"linear-gradient(135deg,#003399,#0052cc)", text:"#fff" },
  GBPUSD:  { bg:"linear-gradient(135deg,#cf142b,#0044aa)", text:"#fff" },
  GBPJPY:  { bg:"linear-gradient(135deg,#cf142b,#bc002d)", text:"#fff" },
  USDJPY:  { bg:"linear-gradient(135deg,#bc002d,#e0002a)", text:"#fff" },
  XAUUSD:  { bg:"linear-gradient(135deg,#d4af37,#f5cc5a)", text:"#111" },
  XAGUSD:  { bg:"linear-gradient(135deg,#aaaaaa,#cccccc)", text:"#111" },
  NAS100:  { bg:"linear-gradient(135deg,#6366f1,#818cf8)", text:"#fff" },
  US30:    { bg:"linear-gradient(135deg,#2563eb,#3b82f6)", text:"#fff" },
  SPX500:  { bg:"linear-gradient(135deg,#059669,#10b981)", text:"#fff" },
  USOIL:   { bg:"linear-gradient(135deg,#1c1c1c,#333)",   text:"#f59e0b" },
};
function iconStyle(symbol: string, market: string) {
  return SYMBOL_OVERRIDES[symbol] ?? MARKET_COLORS[market] ?? MARKET_COLORS.Other;
}

// ── Single row ────────────────────────────────────────────────────────────
const PickerRow = memo(function PickerRow({
  item, active, onSelect,
}: { item: WatchlistEntry; active: boolean; onSelect: () => void }) {
  const cat    = SYMBOL_CATALOG[item.symbol];
  const market = cat?.market ?? "Other";
  const badge  = cat?.badge  ?? item.symbol.slice(0, 4);
  const style  = iconStyle(item.symbol, market);

  const priceRef  = useRef<HTMLSpanElement>(null);
  const changeRef = useRef<HTMLSpanElement>(null);
  const prevRef   = useRef<{ price: number; changePct: number } | null>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const t = useTickStore.getState().ticks[item.symbol];
      if (!t) return;
      const prev = prevRef.current;
      if (prev && prev.price === t.price && prev.changePct === t.changePct) return;
      prevRef.current = { price: t.price, changePct: t.changePct };
      if (priceRef.current)
        priceRef.current.textContent = fmtPrice(t.price, item.symbol);
      if (changeRef.current) {
        const pct = t.changePct;
        changeRef.current.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
        changeRef.current.style.color = pct >= 0 ? "#4ade80" : "#f87171";
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [item.symbol]);

  const tick = useTickStore.getState().ticks[item.symbol];

  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "center", gap: 11,
        padding: "10px 16px",
        background: active ? "rgba(183,255,90,0.05)" : "transparent",
        borderLeft: active ? "2px solid #B7FF5A" : "2px solid transparent",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: style.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: badge.length > 4 ? 6.5 : badge.length > 3 ? 7.5 : badge.length > 2 ? 8.5 : 9.5,
        fontWeight: 800, color: style.text,
      }}>
        {badge.slice(0, 5)}
      </div>

      {/* Name + market */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#B7FF5A" : "#e8e8e8", letterSpacing: "-0.01em" }}>
          {item.symbol}
        </div>
        <div style={{ fontSize: 10, color: "rgba(167,184,169,0.45)", marginTop: 1 }}>
          {market}
        </div>
      </div>

      {/* Live price + change */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "#e8e8e8", fontVariantNumeric: "tabular-nums" }}>
          <span ref={priceRef}>{tick ? fmtPrice(tick.price, item.symbol) : "—"}</span>
        </div>
        <div style={{ fontSize: 10.5, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>
          <span ref={changeRef} style={{ color: (tick?.changePct ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>
            {tick ? `${tick.changePct >= 0 ? "+" : ""}${tick.changePct.toFixed(2)}%` : "—"}
          </span>
        </div>
      </div>

      {/* Active check */}
      {active && (
        <Check style={{ width: 14, height: 14, color: "#B7FF5A", flexShrink: 0 }} />
      )}
    </div>
  );
});

// ── Main component ────────────────────────────────────────────────────────
interface SymbolPickerSheetProps {
  visible:       boolean;
  activeSymbol:  string;
  onClose:       () => void;
  onSelect:      (symbol: string) => void;
}

export const SymbolPickerSheet = memo(function SymbolPickerSheet({
  visible, activeSymbol, onClose, onSelect,
}: SymbolPickerSheetProps) {
  const { items, loading } = useWatchlist();
  const [query, setQuery]  = useState("");
  const inputRef           = useRef<HTMLInputElement>(null);

  // focus search when opened
  useEffect(() => {
    if (visible) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 220);
    }
  }, [visible]);

  const filtered = query.trim()
    ? items.filter(it =>
        it.symbol.toLowerCase().includes(query.toLowerCase()) ||
        (SYMBOL_CATALOG[it.symbol]?.badge ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : items;

  const handleSelect = useCallback((symbol: string) => {
    onSelect(symbol);
    onClose();
  }, [onSelect, onClose]);

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            key="spb"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 210,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          />

          {/* Sheet */}
          <motion.div
            key="spp"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 36 }}
            style={{
              position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 211,
              height: "60%",
              display: "flex", flexDirection: "column",
              background: "rgba(9,13,11,0.98)",
              borderTop: "1px solid rgba(183,255,90,0.12)",
              borderRadius: "16px 16px 0 0",
              overflow: "hidden",
              boxShadow: "0 -8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
            </div>

            {/* Header row */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 14px 10px",
              flexShrink: 0,
            }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
                Select Symbol
              </span>
              <button
                onClick={onClose}
                style={{
                  width: 28, height: 28, borderRadius: 8, border: "none",
                  background: "rgba(255,255,255,0.08)", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X style={{ width: 13, height: 13, color: "rgba(255,255,255,0.5)" }} />
              </button>
            </div>

            {/* Search */}
            <div style={{
              padding: "0 14px 10px",
              flexShrink: 0,
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 10, padding: "0 12px", height: 38,
              }}>
                <Search style={{ width: 14, height: 14, color: "rgba(167,184,169,0.5)", flexShrink: 0 }} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search symbol…"
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    fontSize: 13, color: "#e8e8e8",
                    caretColor: "#B7FF5A",
                  }}
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, lineHeight: 0 }}
                  >
                    <X style={{ width: 12, height: 12, color: "rgba(255,255,255,0.35)" }} />
                  </button>
                )}
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.05)", flexShrink: 0 }} />

            {/* List */}
            <div style={{
              flex: 1, overflowY: "auto",
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
              paddingBottom: "env(safe-area-inset-bottom, 8px)",
            }}>
              {loading ? (
                /* skeleton */
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 16px" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ width: 54, height: 9, borderRadius: 3, background: "rgba(255,255,255,0.07)", marginBottom: 5 }} />
                      <div style={{ width: 38, height: 8, borderRadius: 3, background: "rgba(255,255,255,0.04)" }} />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ width: 60, height: 9, borderRadius: 3, background: "rgba(255,255,255,0.07)", marginBottom: 5 }} />
                      <div style={{ width: 40, height: 8, borderRadius: 3, background: "rgba(255,255,255,0.04)", marginLeft: "auto" }} />
                    </div>
                  </div>
                ))
              ) : filtered.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "rgba(167,184,169,0.4)", fontSize: 13 }}>
                  No symbols match "{query}"
                </div>
              ) : (
                filtered.map(item => (
                  <PickerRow
                    key={item.symbol}
                    item={item}
                    active={item.symbol === activeSymbol}
                    onSelect={() => handleSelect(item.symbol)}
                  />
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
});
