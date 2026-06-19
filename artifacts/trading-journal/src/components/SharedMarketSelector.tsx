/**
 * SharedMarketSelector — single source of truth for browsing and selecting symbols.
 *
 * Mode "page"  → renders as an inline fill-height layout (used by markets.tsx).
 * Mode "sheet" → renders as a portal bottom sheet with backdrop (used by Charts picker).
 *
 * Data sources (identical in both modes):
 *   • brokerWatchlistStore  — watchlist / favorites
 *   • /api/symbols?broker=delta  — Delta Exchange catalog
 *   • /api/symbols?broker=ctrader — cTrader catalog (gated: only when connStatus === "streaming")
 *
 * Symbol selection always calls props.onSelect(symbol).
 * In sheet mode it also calls props.onClose() automatically.
 *
 * Performance architecture:
 *   • PriceCell component isolates tick re-renders — SymbolRow layout never re-renders on price ticks
 *   • content-visibility:auto on every row — browser skips layout/paint for off-screen items
 *   • useDeferredValue + 150ms debounce on search — input stays 60fps while filter defers
 *   • useTransition for category expand and tab change — non-blocking DOM mounting
 *   • Lazy content mount in sheet mode — sheet slides in as lightweight shell (2-frame delay)
 *   • CSS tween replaces Framer spring — GPU compositor thread animation
 *   • overscroll-behavior:contain + -webkit-overflow-scrolling:touch — smooth mobile scroll
 *   • All static style objects hoisted to module level — zero GC pressure per render
 */

import {
  memo, useState, useCallback, useEffect, useMemo, useRef,
  useDeferredValue, useTransition, startTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  Star, TrendingUp, Search, X,
  ChevronDown, ChevronRight, RefreshCw,
  ArrowUp, ArrowDown,
} from "lucide-react";
import { useWatchlist } from "@/contexts/WatchlistContext";
import { useSymbolTick } from "@/store/tickStore";
import { useCtraderSpot, useCtraderConnStatus } from "@/store/ctraderSpotStore";
import { tapStart, recordUi } from "@/lib/starDiag";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────

type DeltaCategory   = "perpetual" | "future" | "forex" | "index" | "commodity" | "other";
type CtraderCategory = "forex" | "index" | "commodity" | "stock" | "crypto" | "other";
type Category        = DeltaCategory | CtraderCategory;
type Tab             = "Watchlist" | "Markets";
type Broker          = "delta" | "ctrader";

// Hoisted to module level — never re-created on render
const TABS: Tab[] = ["Watchlist", "Markets"];

const UNIFIED_CATEGORY_ORDER: Category[] = [
  "forex", "index", "commodity", "perpetual", "future", "crypto", "stock", "other",
];

interface SymbolInfo {
  symbol:   string;
  name:     string;
  category: Category;
  broker:   Broker;
}

const CATEGORY_META: Record<Category, { label: string; badge: string; color: string }> = {
  perpetual: { label: "Perpetuals",   badge: "PERP",  color: "#f59e0b" },
  future:    { label: "Futures",      badge: "FUT",   color: "#a78bfa" },
  forex:     { label: "Forex",        badge: "FX",    color: "#60a5fa" },
  index:     { label: "Indices",      badge: "IDX",   color: "#34d399" },
  commodity: { label: "Commodities",  badge: "CMDTY", color: "#fb923c" },
  stock:     { label: "Stocks",       badge: "STK",   color: "#38bdf8" },
  crypto:    { label: "Crypto",       badge: "DeFi",  color: "#818cf8" },
  other:     { label: "Other",        badge: "OTH",   color: "#94a3b8" },
};

const MARKET_TO_DELTA_CAT: Record<string, DeltaCategory> = {
  Crypto:      "perpetual",
  Forex:       "forex",
  Indices:     "index",
  Commodities: "commodity",
};

// ── Hoisted static styles ─────────────────────────────────────────────────
// Created once at module load — React never needs to diff these objects.

const SCROLL_STYLE: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  // Smooth momentum scrolling on iOS
  WebkitOverflowScrolling: "touch",
  // Prevent scroll from propagating to the page behind the sheet
  overscrollBehavior: "contain",
};

const HEADER_STYLE: React.CSSProperties = {
  flexShrink: 0,
  background: "rgba(9,11,14,0.98)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const SHEET_CONTAINER_STYLE: React.CSSProperties = {
  display: "flex", flexDirection: "column", height: "100%",
  background: "#090b0e", color: "#e2e8f0",
  overflow: "hidden",
};

const BACKDROP_STYLE: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 220,
  background: "rgba(0,0,0,0.65)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
};

const STAR_BTN_STYLE: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  padding: "8px 10px 8px 12px", flexShrink: 0, lineHeight: 0,
  touchAction: "manipulation",
};

const ROW_NAME_STYLE: React.CSSProperties = {
  color: "rgba(148,163,184,0.38)", fontSize: 10.5, lineHeight: 1,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  maxWidth: "calc(100% - 8px)",
};

const ROW_SYMBOL_STYLE: React.CSSProperties = {
  color: "#e8f0ed", fontWeight: 700, fontSize: 13.5,
  letterSpacing: "0.025em", lineHeight: 1,
};

const PRICE_COL_STYLE: React.CSSProperties = {
  flexShrink: 0, display: "flex", flexDirection: "column",
  alignItems: "flex-end", gap: 5,
};

// ── Price helpers ──────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (!isFinite(price) || price <= 0) return "—";
  if (price >= 10_000) return price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (price >= 100)    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)      return price.toFixed(4);
  if (price >= 0.001)  return price.toFixed(6);
  return price.toFixed(8);
}

function formatSpread(spread: number, price: number): string {
  if (!spread || !price) return "";
  const pct = (spread / price) * 100;
  return pct < 0.01 ? `${spread.toFixed(6)}` : `${pct.toFixed(3)}%`;
}

// ── PriceCell ──────────────────────────────────────────────────────────────
// Isolated component: only this subtree re-renders on price ticks.
// SymbolRow's layout (symbol name, badge, star) is completely unaffected.

const PriceCell = memo(function PriceCell({
  symbol,
  broker,
}: {
  symbol: string;
  broker: Broker;
}) {
  const tick  = useSymbolTick(symbol);
  const cSpot = useCtraderSpot(symbol);

  const price     = tick?.price;
  const changePct = tick?.changePct ?? 0;
  const isUp      = changePct >= 0;
  const isLive    = !!tick;

  const bid    = tick?.bid    ?? (broker === "ctrader" ? cSpot?.bid    : undefined);
  const ask    = tick?.ask    ?? (broker === "ctrader" ? cSpot?.ask    : undefined);
  const spread = tick?.spread ?? (broker === "ctrader" ? cSpot?.spread : undefined);

  const hasBidAsk = !!bid && !!ask;
  const changeColor = isLive ? (isUp ? "#10b981" : "#ef4444") : "rgba(148,163,184,0.22)";

  return (
    <>
      {hasBidAsk && (
        <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
          <span style={{
            fontSize: 9, color: "rgba(52,211,153,0.70)",
            fontVariantNumeric: "tabular-nums", fontWeight: 600,
            background: "rgba(52,211,153,0.07)", borderRadius: 3, padding: "1px 4px",
          }}>
            B {formatPrice(bid!)}
          </span>
          <span style={{
            fontSize: 9, color: "rgba(239,68,68,0.70)",
            fontVariantNumeric: "tabular-nums", fontWeight: 600,
            background: "rgba(239,68,68,0.07)", borderRadius: 3, padding: "1px 4px",
          }}>
            A {formatPrice(ask!)}
          </span>
          {!!spread && spread > 0 && !!price && (
            <span style={{ fontSize: 9, color: "rgba(148,163,184,0.28)", fontVariantNumeric: "tabular-nums" }}>
              {formatSpread(spread, price)}
            </span>
          )}
        </div>
      )}

      <div style={PRICE_COL_STYLE}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {isLive && (
            <div style={{
              width: 5, height: 5, borderRadius: "50%",
              background: "#10b981", boxShadow: "0 0 5px #10b981", flexShrink: 0,
              animation: "mktPulse 2.4s ease-in-out infinite",
            }} />
          )}
          <span style={{
            color: price ? "#ddeedd" : "rgba(148,163,184,0.2)",
            fontWeight: 600, fontSize: 13, fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.01em", minWidth: 64, textAlign: "right",
          }}>
            {price ? formatPrice(price) : "—"}
          </span>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 2,
          padding: "3px 6px", borderRadius: 6,
          background: isLive
            ? (isUp ? "rgba(16,185,129,0.11)" : "rgba(239,68,68,0.11)")
            : "rgba(148,163,184,0.05)",
          border: `1px solid ${isLive
            ? (isUp ? "rgba(16,185,129,0.20)" : "rgba(239,68,68,0.20)")
            : "rgba(148,163,184,0.08)"}`,
          minWidth: 58, justifyContent: "center",
        }}>
          {isLive && (
            isUp
              ? <ArrowUp size={9} color="#10b981" strokeWidth={2.5} />
              : <ArrowDown size={9} color="#ef4444" strokeWidth={2.5} />
          )}
          <span style={{
            fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
            color: changeColor, letterSpacing: "0.01em",
          }}>
            {isLive ? `${Math.abs(changePct).toFixed(2)}%` : "—"}
          </span>
        </div>
      </div>
    </>
  );
});

// ── SymbolRow ──────────────────────────────────────────────────────────────
// Pure layout component — NO tick subscriptions here.
// content-visibility:auto lets the browser skip paint for off-screen rows.

export const SymbolRow = memo(function SymbolRow({
  symbol, name, category, broker, isFavorite, inWatchlist, isActive, onStarPress, onTap,
}: {
  symbol:      string;
  name:        string;
  category:    Category;
  broker:      Broker;
  isFavorite:  boolean;
  inWatchlist: boolean;
  isActive?:   boolean;
  onStarPress: (tapAt: number) => void;
  onTap?:      () => void;
}) {
  const meta = CATEGORY_META[category];

  // Optimistic star state — only local toggle, syncs via isFavorite prop
  const [visualFav, setVisualFav] = useState(isFavorite);

  // Sync only when prop changes from outside (after server confirm)
  const prevFavRef = useRef(isFavorite);
  if (prevFavRef.current !== isFavorite) {
    prevFavRef.current = isFavorite;
    // Direct mutation during render is safe here (no useEffect needed)
    // because we're simply syncing derived state
    setVisualFav(isFavorite);
  }

  const handleStarDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const tapAt = tapStart(symbol);
    setVisualFav(v => !v);
    requestAnimationFrame(() => recordUi(tapAt));
    onStarPress(tapAt);
  }, [symbol, onStarPress]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    onTap?.();
  }, [onTap]);

  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        padding: "11px 12px 11px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        gap: 0, minHeight: 58,
        cursor: onTap ? "pointer" : "default",
        borderLeft: isActive ? "2.5px solid #f59e0b" : "2.5px solid transparent",
        background: isActive
          ? "linear-gradient(90deg, rgba(245,158,11,0.06) 0%, transparent 60%)"
          : undefined,
        position: "relative",
        // Browser skips layout + paint for rows scrolled off-screen
        contentVisibility: "auto",
        containIntrinsicSize: "0 58px",
      }}
      onClick={onTap ? handleClick : undefined}
    >
      <button onPointerDown={handleStarDown} style={STAR_BTN_STYLE}>
        <Star
          size={15}
          fill={visualFav ? "#f59e0b" : inWatchlist ? "rgba(148,163,184,0.15)" : "none"}
          color={visualFav ? "#f59e0b" : "rgba(148,163,184,0.28)"}
          strokeWidth={1.8}
          style={{ transition: "fill 0.08s, color 0.08s" }}
        />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
          <span style={ROW_SYMBOL_STYLE}>{symbol}</span>
          <span style={{
            fontSize: 8.5, fontWeight: 700, color: meta.color,
            background: `${meta.color}16`, border: `1px solid ${meta.color}28`,
            borderRadius: 4, padding: "1.5px 4px",
            letterSpacing: "0.06em", flexShrink: 0, lineHeight: 1.4,
          }}>
            {meta.badge}
          </span>
        </div>
        <div style={ROW_NAME_STYLE}>{name}</div>

        {/* PriceCell — tick-isolated subtree */}
        <PriceCell symbol={symbol} broker={broker} />
      </div>
    </div>
  );
});

// ── CategorySection ────────────────────────────────────────────────────────

const INITIAL_SHOW = 50;

const CategorySection = memo(function CategorySection({
  category, symbols, watchMap, getStarCb, getTapCb,
  defaultOpen, searchActive, activeSymbol,
}: {
  category:     Category;
  symbols:      SymbolInfo[];
  watchMap:     Map<string, { isFavorite: boolean; id: number }>;
  getStarCb:    (s: string) => (tapAt: number) => void;
  getTapCb:     (s: string) => () => void;
  defaultOpen:  boolean;
  searchActive: boolean;
  activeSymbol?: string;
}) {
  const [open,    setOpen]    = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const [, transition]        = useTransition();

  // Force-open when searching; use transition so it doesn't block input
  useEffect(() => {
    if (searchActive) {
      transition(() => setOpen(true));
    }
  }, [searchActive]); // eslint-disable-line

  const meta = CATEGORY_META[category];
  if (symbols.length === 0) return null;

  const visible = showAll ? symbols : symbols.slice(0, INITIAL_SHOW);

  const handleToggle = () => {
    // startTransition: expanding a category is non-urgent — defer child mounting
    startTransition(() => setOpen(v => !v));
  };

  return (
    <div>
      <button
        onClick={handleToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          padding: "8px 12px 8px 14px", gap: 8,
          background: "rgba(255,255,255,0.015)",
          borderLeft: `2.5px solid ${meta.color}`,
          border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
          cursor: "pointer", touchAction: "manipulation",
        }}
      >
        <div style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: meta.color, boxShadow: `0 0 6px ${meta.color}88`,
        }} />
        <span style={{
          flex: 1, fontSize: 11, fontWeight: 700,
          color: "rgba(255,255,255,0.68)", textAlign: "left",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          {meta.label}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 600, color: meta.color,
          background: `${meta.color}18`, borderRadius: 99, padding: "1.5px 7px",
          letterSpacing: "0.02em",
        }}>
          {symbols.length}
        </span>
        {open
          ? <ChevronDown size={12} color="rgba(148,163,184,0.35)" strokeWidth={2.5} />
          : <ChevronRight size={12} color="rgba(148,163,184,0.35)" strokeWidth={2.5} />
        }
      </button>

      {open && (
        <>
          {visible.map(s => {
            const wItem = watchMap.get(s.symbol);
            return (
              <SymbolRow
                key={s.symbol}
                symbol={s.symbol}
                name={s.name}
                category={s.category}
                broker={s.broker}
                inWatchlist={!!wItem}
                isFavorite={wItem?.isFavorite ?? false}
                isActive={activeSymbol === s.symbol}
                onStarPress={getStarCb(s.symbol)}
                onTap={getTapCb(s.symbol)}
              />
            );
          })}
          {!showAll && symbols.length > INITIAL_SHOW && (
            <button
              onClick={() => startTransition(() => setShowAll(true))}
              style={{
                width: "100%", padding: "10px 16px", border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: "rgba(255,255,255,0.02)", cursor: "pointer",
                touchAction: "manipulation", color: meta.color,
                fontSize: 12, fontWeight: 600,
              }}
            >
              Show {symbols.length - INITIAL_SHOW} more {meta.label.toLowerCase()}…
            </button>
          )}
        </>
      )}
    </div>
  );
});

// ── CtraderStatusBar ───────────────────────────────────────────────────────

function CtraderStatusBar() {
  const connStatus  = useCtraderConnStatus();
  const isStreaming = connStatus === "streaming";
  const color = isStreaming ? "#10b981"
    : ["connecting", "app_auth", "acct_auth"].includes(connStatus) ? "#f59e0b"
    : "rgba(148,163,184,0.28)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 14px 5px" }}>
      <div style={{
        width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0,
        boxShadow: isStreaming ? `0 0 5px ${color}` : "none",
        animation: isStreaming ? "mktPulse 2.4s ease-in-out infinite" : "none",
      }} />
      <span style={{ fontSize: 10, color: "rgba(148,163,184,0.38)", fontWeight: 500 }}>
        cTrader:&nbsp;
        {connStatus === "streaming"                                   ? "live"
          : connStatus === "connecting"                               ? "connecting…"
          : connStatus === "app_auth" || connStatus === "acct_auth"  ? "authenticating…"
          : connStatus === "reconnecting"                             ? "reconnecting…"
          : connStatus}
      </span>
    </div>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────

function EmptyState({
  icon: Icon, title, subtitle,
}: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "64px 32px", gap: 12,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 16,
        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4,
      }}>
        <Icon size={22} color="rgba(148,163,184,0.30)" strokeWidth={1.5} />
      </div>
      <p style={{
        fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.40)", margin: 0, textAlign: "center",
      }}>
        {title}
      </p>
      {subtitle && (
        <p style={{
          fontSize: 12, color: "rgba(148,163,184,0.25)", margin: 0,
          textAlign: "center", lineHeight: 1.5, maxWidth: 220,
        }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

// ── SharedMarketSelector ───────────────────────────────────────────────────

export interface SharedMarketSelectorProps {
  /** "page" = inline fill-height content; "sheet" = portal bottom sheet */
  mode:          "page" | "sheet";
  /** For sheet mode — controls visibility */
  visible?:      boolean;
  /** Currently charted symbol (highlighted amber) */
  activeSymbol:  string;
  /** Called when user selects a symbol */
  onSelect:      (symbol: string) => void;
  /** Called to close (sheet mode: required; page mode: ignored) */
  onClose?:      () => void;
  /**
   * Extra ReactNode rendered in the header action area.
   * Markets page uses this for the diagnostics toggle button.
   */
  headerActions?: React.ReactNode;
}

export const SharedMarketSelector = memo(function SharedMarketSelector({
  mode,
  visible = true,
  activeSymbol,
  onSelect,
  onClose,
  headerActions,
}: SharedMarketSelectorProps) {

  const [activeTab, setActiveTab] = useState<Tab>("Watchlist");

  // ── Search: two-stage debounce → defer ─────────────────────────────────
  // rawSearch: immediate input value (always reflects keystrokes)
  // search:    debounced 150ms (avoids filtering on every keystroke)
  // deferredSearch: further deferred by React for non-urgent renders
  const [rawSearch, setRawSearch] = useState("");
  const [search,    setSearch]    = useState("");
  const searchRef  = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRawSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(() => setSearch(val));
    }, 150);
  }, []);

  const deferredSearch = useDeferredValue(search);
  const searchActive   = deferredSearch.trim().length > 0;
  const searchUpper    = deferredSearch.trim().toUpperCase();

  useEffect(() => {
    if (mode === "sheet" && visible) {
      setRawSearch("");
      setSearch("");
      setActiveTab("Watchlist");
      setTimeout(() => searchRef.current?.focus(), 280);
    }
  }, [mode, visible]);

  // ── Lazy content mount (sheet mode only) ───────────────────────────────
  // The sheet CSS transition plays immediately on a lightweight shell.
  // After 2 animation frames (~34ms) the full content mounts.
  // This eliminates the "lag before animation" caused by mounting 500+ nodes.
  const [contentReady, setContentReady] = useState(mode === "page");

  useEffect(() => {
    if (mode !== "sheet") return undefined;
    if (visible && !contentReady) {
      let raf1: number;
      let raf2: number;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setContentReady(true));
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
    return undefined;
  }, [visible, mode]); // eslint-disable-line

  // Sheet open/close tracking for CSS transition
  const [sheetMounted, setSheetMounted] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode !== "sheet") return;
    if (visible) {
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
      setSheetMounted(true);
      // One frame delay so the transition plays (mount → translateY(0))
      requestAnimationFrame(() => requestAnimationFrame(() => setSheetVisible(true)));
    } else {
      setSheetVisible(false);
      // Unmount after transition completes
      unmountTimerRef.current = setTimeout(() => setSheetMounted(false), 300);
    }
    return () => {
      if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
    };
  }, [visible, mode]);

  // ── Delta symbols ──────────────────────────────────────────────────────

  const [deltaSymbols, setDeltaSymbols] = useState<SymbolInfo[]>([]);
  const [deltaLoading, setDeltaLoading] = useState(false);
  const [deltaError,   setDeltaError]   = useState<string | null>(null);
  const [deltaFetchAt, setDeltaFetchAt] = useState(0);
  const deltaLoadingRef = useRef(false);

  const fetchDeltaSymbols = useCallback(async (force = false) => {
    if (deltaLoadingRef.current) return;
    deltaLoadingRef.current = true;
    setDeltaLoading(true);
    setDeltaError(null);
    try {
      const res  = await fetch(`${BASE}/api/symbols?broker=delta${force ? "&refresh=1" : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { symbols?: Array<{ symbol: string; name: string; category?: string }> };
      setDeltaSymbols((data.symbols ?? []).map(s => ({
        symbol:   s.symbol,
        name:     s.name,
        category: (s.category === "future" ? "future" : "perpetual") as DeltaCategory,
        broker:   "delta" as Broker,
      })));
      setDeltaFetchAt(Date.now());
    } catch (e) {
      setDeltaError(String(e));
    } finally {
      setDeltaLoading(false);
      deltaLoadingRef.current = false;
    }
  }, []);

  useEffect(() => { fetchDeltaSymbols(); }, []); // eslint-disable-line

  // ── cTrader symbols (gated on live streaming) ──────────────────────────

  const connStatus         = useCtraderConnStatus();
  const ctraderIsStreaming = connStatus === "streaming";
  const ctraderIsConnected = !["idle", "stopped", "error", "unknown"].includes(connStatus);

  const [ctraderSymbols, setCtraderSymbols] = useState<SymbolInfo[]>([]);
  const [ctraderLoading, setCtraderLoading] = useState(false);
  const [ctraderFetchAt, setCtraderFetchAt] = useState(0);
  const ctraderFetchingRef = useRef(false);

  const fetchCtraderSymbolsInternal = useCallback(async () => {
    if (ctraderFetchingRef.current) return;
    ctraderFetchingRef.current = true;
    setCtraderLoading(true);
    try {
      const res  = await fetch(`${BASE}/api/symbols?broker=ctrader`);
      if (!res.ok) return;
      const data = await res.json() as { symbols?: Array<{ symbol: string; name: string; category?: string }> };
      if (data.symbols && data.symbols.length > 0) {
        setCtraderSymbols(data.symbols.map(s => ({
          symbol:   s.symbol,
          name:     s.name,
          category: (s.category ?? "other") as CtraderCategory,
          broker:   "ctrader" as Broker,
        })));
        setCtraderFetchAt(Date.now());
      }
    } catch { /* non-fatal */ }
    finally { setCtraderLoading(false); ctraderFetchingRef.current = false; }
  }, []);

  useEffect(() => {
    if (ctraderIsStreaming) {
      fetchCtraderSymbolsInternal();
    } else if (!ctraderIsConnected) {
      setCtraderSymbols([]);
      setCtraderFetchAt(0);
    }
  }, [ctraderIsStreaming, ctraderIsConnected, fetchCtraderSymbolsInternal]);

  // ── Watchlist ──────────────────────────────────────────────────────────

  const { items, addSymbol, toggleFavorite } = useWatchlist();

  const watchMapRef = useRef(new Map<string, typeof items[0]>());
  useEffect(() => {
    const m = new Map<string, typeof items[0]>();
    items.forEach(i => m.set(i.symbol, i));
    watchMapRef.current = m;
  }, [items]);

  const watchMap = useMemo(() => {
    const m = new Map<string, { isFavorite: boolean; id: number }>();
    items.forEach(i => m.set(i.symbol, { isFavorite: i.isFavorite, id: i.id }));
    return m;
  }, [items]);

  // ── Callbacks ──────────────────────────────────────────────────────────

  const handleStarPress = useCallback(async (symbol: string, tapAt: number) => {
    const item = watchMapRef.current.get(symbol);
    if (item) {
      await toggleFavorite(item.id, item.isFavorite, tapAt);
    } else {
      await addSymbol(symbol, true, tapAt);
    }
  }, [addSymbol, toggleFavorite]);

  const handleSymbolTap = useCallback((symbol: string) => {
    onSelect(symbol);
    if (mode === "sheet") onClose?.();
  }, [onSelect, onClose, mode]);

  const starCbCache = useRef(new Map<string, (tapAt: number) => void>());
  const tapCbCache  = useRef(new Map<string, () => void>());
  const prevStar    = useRef(handleStarPress);
  const prevTap     = useRef(handleSymbolTap);

  if (prevStar.current !== handleStarPress || prevTap.current !== handleSymbolTap) {
    prevStar.current = handleStarPress;
    prevTap.current  = handleSymbolTap;
    starCbCache.current.clear();
    tapCbCache.current.clear();
  }

  const getStarCb = useCallback((symbol: string) => {
    if (!starCbCache.current.has(symbol)) {
      starCbCache.current.set(symbol, (tapAt: number) => handleStarPress(symbol, tapAt));
    }
    return starCbCache.current.get(symbol)!;
  }, [handleStarPress]);

  const getTapCb = useCallback((symbol: string) => {
    if (!tapCbCache.current.has(symbol)) {
      tapCbCache.current.set(symbol, () => handleSymbolTap(symbol));
    }
    return tapCbCache.current.get(symbol)!;
  }, [handleSymbolTap]);

  // ── Merged symbol list ─────────────────────────────────────────────────
  //
  // Markets tab shows ONLY symbols returned by broker API endpoints:
  //   • ctraderSymbols  — populated only when connStatus === "streaming"
  //   • deltaSymbols    — perpetuals / futures from Delta Exchange
  //
  // Watchlist items (items[]) are intentionally excluded here; they belong
  // exclusively to the Watchlist tab (watchlistRows below). Merging them
  // here was the source of Forex/Indices/Commodities appearing in the
  // Markets tab when cTrader is not connected.

  const allMergedSymbols = useMemo<SymbolInfo[]>(() => {
    const seen   = new Set<string>();
    const result: SymbolInfo[] = [];
    for (const s of ctraderSymbols) {
      if (!seen.has(s.symbol)) { seen.add(s.symbol); result.push(s); }
    }
    for (const s of deltaSymbols) {
      if (!seen.has(s.symbol)) { seen.add(s.symbol); result.push(s); }
    }
    return result;
  }, [ctraderSymbols, deltaSymbols]);

  const grouped = useMemo(() => {
    const map = new Map<Category, SymbolInfo[]>();
    UNIFIED_CATEGORY_ORDER.forEach(c => map.set(c, []));
    for (const s of allMergedSymbols) {
      const arr = map.get(s.category as Category);
      if (arr) arr.push(s);
      else map.set(s.category as Category, [s]);
    }
    return map;
  }, [allMergedSymbols]);

  // ── Console diagnostics ────────────────────────────────────────────────

  useEffect(() => {
    const forexCount       = grouped.get("forex")?.length      ?? 0;
    const indicesCount     = grouped.get("index")?.length      ?? 0;
    const commoditiesCount = grouped.get("commodity")?.length  ?? 0;
    console.log("[Markets] diagnostics", {
      connectionStatus:   connStatus,
      symbolsLoaded:      ctraderFetchAt > 0,
      symbolSource:       ctraderSymbols.length > 0
        ? "ctrader"
        : deltaSymbols.length > 0 ? "delta" : "none",
      forexCount,
      indicesCount,
      commoditiesCount,
      deltaTotal:         deltaSymbols.length,
      ctraderTotal:       ctraderSymbols.length,
    });
  }, [grouped, connStatus, ctraderFetchAt, ctraderSymbols.length, deltaSymbols.length]);

  // ── Search results ─────────────────────────────────────────────────────

  const searchResults = useMemo(() => {
    if (!searchActive) return [];
    return allMergedSymbols.filter(s =>
      s.symbol.toUpperCase().includes(searchUpper) ||
      s.name.toUpperCase().includes(searchUpper)
    );
  }, [allMergedSymbols, searchActive, searchUpper]);

  const watchlistRows = useMemo(() => {
    return items
      .filter(i => i.isFavorite)
      .map(i => {
        const cSym           = ctraderSymbols.find(c => c.symbol === i.symbol);
        const dSym           = deltaSymbols.find(d => d.symbol === i.symbol);
        const detectedBroker: Broker = cSym ? "ctrader" : "delta";
        return {
          symbol:   i.symbol,
          name:     i.label,
          category: (cSym?.category ?? dSym?.category ?? (MARKET_TO_DELTA_CAT[i.market] ?? "other")) as Category,
          broker:   detectedBroker,
        };
      });
  }, [items, ctraderSymbols, deltaSymbols]);

  const filteredWatchlist = useMemo(() => {
    if (!searchActive) return watchlistRows;
    return watchlistRows.filter(r =>
      r.symbol.toUpperCase().includes(searchUpper) ||
      r.name.toUpperCase().includes(searchUpper)
    );
  }, [watchlistRows, searchActive, searchUpper]);

  const totalMarkets = allMergedSymbols.length;
  const isLoading    = deltaLoading || ctraderLoading;

  // ── Render helpers ─────────────────────────────────────────────────────

  const handleTabChange = useCallback((tab: Tab) => {
    startTransition(() => {
      setActiveTab(tab);
      setRawSearch("");
      setSearch("");
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    setRawSearch("");
    setSearch("");
    searchRef.current?.focus();
  }, []);

  const body = (
    <div style={SHEET_CONTAINER_STYLE}>
      {/* Sticky header */}
      <div style={HEADER_STYLE}>
        {/* Sheet-mode drag handle */}
        {mode === "sheet" && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)" }} />
          </div>
        )}

        {/* Tab row + action buttons */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: mode === "sheet" ? "4px 12px 0" : "10px 12px 0",
          gap: 8,
        }}>
          <div style={{
            display: "flex", flex: 1,
            background: "rgba(255,255,255,0.055)", borderRadius: 10,
            padding: 3, border: "1px solid rgba(255,255,255,0.07)",
          }}>
            {TABS.map(tab => {
              const active = tab === activeTab;
              return (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  style={{
                    flex: 1, padding: "7px 10px",
                    border: "none", borderRadius: 7,
                    cursor: "pointer", touchAction: "manipulation",
                    fontSize: 12.5, fontWeight: active ? 700 : 500,
                    color: active ? "#fff" : "rgba(148,163,184,0.45)",
                    background: active ? "rgba(245,158,11,0.18)" : "transparent",
                    boxShadow: active ? "0 0 0 1px rgba(245,158,11,0.28)" : "none",
                    transition: "all 0.15s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab}
                  {tab === "Markets" && totalMarkets > 0 && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 600,
                      color: active ? "rgba(245,158,11,0.8)" : "rgba(148,163,184,0.30)",
                      background: active ? "rgba(245,158,11,0.12)" : "rgba(148,163,184,0.06)",
                      borderRadius: 99, padding: "1px 5px",
                    }}>
                      {totalMarkets}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            {activeTab === "Markets" && (
              <button
                onPointerDown={() => {
                  fetchDeltaSymbols(true);
                  if (ctraderIsStreaming) fetchCtraderSymbolsInternal();
                }}
                disabled={isLoading}
                style={{
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8, cursor: "pointer", padding: "7px 9px",
                  color: isLoading ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.5)",
                  touchAction: "manipulation", lineHeight: 0,
                }}
              >
                <RefreshCw size={13} style={{ animation: isLoading ? "spin 1s linear infinite" : "none" }} />
              </button>
            )}
            {headerActions}
            {mode === "sheet" && onClose && (
              <button
                onClick={onClose}
                style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8, cursor: "pointer", padding: "7px 9px",
                  color: "rgba(148,163,184,0.5)", touchAction: "manipulation", lineHeight: 0,
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div style={{ padding: "8px 12px 6px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10, padding: "9px 12px",
          }}>
            <Search size={13} color="rgba(148,163,184,0.38)" style={{ flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={rawSearch}
              onChange={handleSearchChange}
              placeholder={activeTab === "Watchlist" ? "Search watchlist…" : "Search all markets…"}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "#e2e8f0", fontSize: 13.5, caretColor: "#f59e0b", minWidth: 0,
              }}
            />
            {rawSearch && (
              <button
                onClick={handleClearSearch}
                style={{
                  background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer",
                  padding: 0, lineHeight: 0, color: "rgba(148,163,184,0.5)",
                  width: 18, height: 18, borderRadius: 50,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>

        <CtraderStatusBar />
      </div>

      {/* Scrollable content — only rendered once contentReady (lazy mount in sheet) */}
      <div style={SCROLL_STYLE}>
        {!contentReady ? null : (
          <>
            {/* ── Watchlist tab ── */}
            {activeTab === "Watchlist" && (
              <>
                {filteredWatchlist.length === 0 && (
                  <EmptyState
                    icon={TrendingUp}
                    title={searchActive ? "No results" : "Watchlist is empty"}
                    subtitle={!searchActive ? "Tap ★ on any symbol in Markets to add it here" : undefined}
                  />
                )}
                {filteredWatchlist.map(row => {
                  const wItem = watchMap.get(row.symbol);
                  return (
                    <SymbolRow
                      key={row.symbol}
                      symbol={row.symbol}
                      name={row.name}
                      category={row.category}
                      broker={row.broker}
                      inWatchlist={!!wItem}
                      isFavorite={wItem?.isFavorite ?? false}
                      isActive={activeSymbol === row.symbol}
                      onStarPress={getStarCb(row.symbol)}
                      onTap={getTapCb(row.symbol)}
                    />
                  );
                })}
              </>
            )}

            {/* ── Markets tab ── */}
            {activeTab === "Markets" && (
              <>
                {isLoading && allMergedSymbols.length === 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "56px 0", gap: 8, color: "rgba(148,163,184,0.35)",
                  }}>
                    <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: 12.5 }}>Loading markets…</span>
                  </div>
                )}

                {!isLoading && deltaError && allMergedSymbols.length === 0 && (
                  <div style={{ padding: "40px 20px", textAlign: "center" }}>
                    <p style={{ margin: "0 0 6px", color: "rgba(239,68,68,0.55)", fontSize: 13 }}>
                      Failed to load market catalog
                    </p>
                    <p style={{ margin: "0 0 16px", fontSize: 11, color: "rgba(148,163,184,0.30)" }}>
                      {deltaError}
                    </p>
                    <button
                      onClick={() => { fetchDeltaSymbols(true); if (ctraderIsStreaming) fetchCtraderSymbolsInternal(); }}
                      style={{
                        padding: "9px 18px", borderRadius: 9,
                        border: "1px solid rgba(245,158,11,0.22)",
                        background: "rgba(245,158,11,0.14)", color: "#f59e0b",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {searchActive && (
                  <>
                    {searchResults.length === 0 && (
                      <EmptyState icon={Search} title={`No symbols match "${deferredSearch}"`} />
                    )}
                    {searchResults.map(s => {
                      const wItem = watchMap.get(s.symbol);
                      return (
                        <SymbolRow
                          key={s.symbol}
                          symbol={s.symbol}
                          name={s.name}
                          category={s.category}
                          broker={s.broker}
                          inWatchlist={!!wItem}
                          isFavorite={wItem?.isFavorite ?? false}
                          isActive={activeSymbol === s.symbol}
                          onStarPress={getStarCb(s.symbol)}
                          onTap={getTapCb(s.symbol)}
                        />
                      );
                    })}
                  </>
                )}

                {!searchActive && allMergedSymbols.length > 0 && UNIFIED_CATEGORY_ORDER.map((cat, idx) => (
                  <CategorySection
                    key={cat}
                    category={cat}
                    symbols={grouped.get(cat) ?? []}
                    watchMap={watchMap}
                    getStarCb={getStarCb}
                    getTapCb={getTapCb}
                    defaultOpen={idx === 0}
                    searchActive={searchActive}
                    activeSymbol={activeSymbol}
                  />
                ))}

                {(deltaFetchAt > 0 || ctraderFetchAt > 0) && !isLoading && (
                  <div style={{ padding: "14px 14px 8px", textAlign: "center" }}>
                    <span style={{ fontSize: 10, color: "rgba(148,163,184,0.18)", fontWeight: 500 }}>
                      {allMergedSymbols.length} symbols
                      {deltaSymbols.length > 0 && ` · Delta ${deltaSymbols.length}`}
                      {ctraderSymbols.length > 0 && ` · cTrader ${ctraderSymbols.length}`}
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  // ── Page mode: render inline ───────────────────────────────────────────
  if (mode === "page") return body;

  // ── Sheet mode: CSS-transition bottom sheet via portal ─────────────────
  // CSS transform runs on the GPU compositor thread — no JS per frame.
  // Backdrop and sheet are two separate DOM nodes so each can animate
  // independently without causing layout in the other.
  if (!sheetMounted) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          ...BACKDROP_STYLE,
          opacity: sheetVisible ? 1 : 0,
          transition: "opacity 200ms ease",
          pointerEvents: sheetVisible ? "auto" : "none",
        }}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 221,
          height: "88%",
          borderRadius: "18px 18px 0 0",
          overflow: "hidden",
          boxShadow: "0 -8px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05)",
          // GPU compositor animation — no JS per frame
          transform: sheetVisible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 280ms cubic-bezier(0.32,0.72,0,1)",
          willChange: "transform",
        }}
      >
        {body}
      </div>
    </>,
    document.body,
  );
});
