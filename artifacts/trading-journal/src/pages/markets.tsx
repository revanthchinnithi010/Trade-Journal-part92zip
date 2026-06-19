import {
  useState, useCallback, useEffect, useMemo, useRef, memo,
  useSyncExternalStore,
} from "react";
import {
  Star, TrendingUp, Search, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { useWatchlist, SYMBOL_CATALOG } from "@/contexts/WatchlistContext";
import { useSymbolTick } from "@/store/tickStore";
import { useLocation } from "wouter";
import { useChartStore } from "@/store/chartStore";
import { tapStart, recordUi, getEvents, subscribe as diagSubscribe } from "@/lib/starDiag";

type Tab = "Watchlist" | "Markets";
const TABS: Tab[] = ["Watchlist", "Markets"];

// ── Category definitions ──────────────────────────────────────────────────
const CATEGORY_ORDER = ["crypto", "forex", "index", "commodity", "other"] as const;
type Category = typeof CATEGORY_ORDER[number];

const CATEGORY_LABELS: Record<Category, string> = {
  crypto:    "Crypto",
  forex:     "Forex",
  index:     "Indices",
  commodity: "Commodities",
  other:     "Stocks",
};

const CATEGORY_COLORS: Record<Category, string> = {
  crypto:    "#f59e0b",
  forex:     "#60a5fa",
  index:     "#34d399",
  commodity: "#fb923c",
  other:     "#94a3b8",
};

// Map SYMBOL_CATALOG market values → internal category keys
const MARKET_TO_CATEGORY: Record<string, Category> = {
  Crypto:      "crypto",
  Forex:       "forex",
  Indices:     "index",
  Commodities: "commodity",
};

// Badge label shown on each row
const CONTRACT_LABELS: Record<Category, string> = {
  crypto:    "Crypto",
  forex:     "FX",
  index:     "Index",
  commodity: "Cmdty",
  other:     "Stock",
};

// ── SymbolInfo — single shared type ──────────────────────────────────────
interface SymbolInfo {
  symbol:   string;
  name:     string;
  category: Category;
}

// ── Build symbol list from SYMBOL_CATALOG (same source as desktop) ────────
// Deduped by symbol key; catalog order is preserved.
function buildCatalogSymbols(): SymbolInfo[] {
  return Object.entries(SYMBOL_CATALOG).map(([sym, entry]) => ({
    symbol:   sym,
    name:     entry.label,
    category: MARKET_TO_CATEGORY[entry.market] ?? "other",
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────
function formatPrice(price: number | undefined): string {
  if (!price) return "—";
  if (price >= 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (price >= 100)   return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)     return price.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return price.toLocaleString("en-US", { minimumFractionDigits: 5, maximumFractionDigits: 5 });
}

// ── SymbolRow ─────────────────────────────────────────────────────────────
let totalRowRenders = 0;

const SymbolRow = memo(function SymbolRow({
  symbol, name, category, isFavorite, inWatchlist, onStarPress, onTap,
}: {
  symbol: string; name: string; category: Category;
  isFavorite: boolean; inWatchlist: boolean;
  onStarPress: (tapAt: number) => void;
  onTap?: () => void;
}) {
  totalRowRenders++;

  const tick      = useSymbolTick(symbol);
  const price     = tick?.price;
  const changePct = tick?.changePct ?? 0;
  const isUp      = changePct >= 0;
  const tag       = CONTRACT_LABELS[category];

  const [visualFav, setVisualFav] = useState(isFavorite);
  useEffect(() => { setVisualFav(isFavorite); }, [isFavorite]);

  const handleStarDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const tapAt = tapStart(symbol);
    setVisualFav(v => !v);
    requestAnimationFrame(() => recordUi(tapAt));
    onStarPress(tapAt);
  }, [symbol, onStarPress]);

  return (
    <div
      style={{
        display: "flex", alignItems: "center",
        padding: "10px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        gap: 10, minHeight: 58,
        cursor: onTap ? "pointer" : "default",
        transition: "background 0.1s",
      }}
      onClick={onTap ? (e) => { if ((e.target as HTMLElement).closest("button")) return; onTap(); } : undefined}
    >
      <button
        onPointerDown={handleStarDown}
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "6px 4px", flexShrink: 0, lineHeight: 0,
          touchAction: "manipulation",
        }}
      >
        <Star
          size={17}
          fill={visualFav ? "#f59e0b" : inWatchlist ? "rgba(148,163,184,0.2)" : "none"}
          color={visualFav ? "#f59e0b" : "rgba(148,163,184,0.38)"}
          strokeWidth={1.8}
          style={{ transition: "fill 0.08s, color 0.08s" }}
        />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13.5, letterSpacing: "0.01em" }}>
            {symbol}
          </span>
          <span style={{
            fontSize: 9.5, fontWeight: 600, color: "#94a3b8",
            background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.15)",
            borderRadius: 4, padding: "1px 5px", letterSpacing: "0.03em", flexShrink: 0,
          }}>
            {tag}
          </span>
        </div>
        <div style={{
          color: "rgba(148,163,184,0.45)", fontSize: 11, marginTop: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {name}
        </div>
      </div>

      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 72 }}>
        <div style={{
          color: price ? "#fff" : "rgba(148,163,184,0.3)",
          fontWeight: 600, fontSize: 13, fontVariantNumeric: "tabular-nums",
        }}>
          {price ? formatPrice(price) : "—"}
        </div>
      </div>

      <div style={{
        minWidth: 62, padding: "4px 6px", borderRadius: 6,
        textAlign: "center", flexShrink: 0,
        background: tick
          ? isUp ? "rgba(16,185,129,0.13)" : "rgba(239,68,68,0.13)"
          : "rgba(148,163,184,0.06)",
        color: tick
          ? isUp ? "#10b981" : "#ef4444"
          : "rgba(148,163,184,0.3)",
        border: tick
          ? isUp ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.2)"
          : "1px solid rgba(148,163,184,0.09)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {tick ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
        </div>
      </div>
    </div>
  );
});

// ── DiagnosticsPanel ──────────────────────────────────────────────────────
function DiagnosticsPanel({ onClose }: { onClose: () => void }) {
  const events = useSyncExternalStore(diagSubscribe, getEvents);
  return (
    <div style={{
      position: "fixed", bottom: 60, left: 8, right: 8, zIndex: 9999,
      background: "rgba(10,12,16,0.97)",
      border: "1px solid rgba(245,158,11,0.35)",
      borderRadius: 12, padding: "10px 12px",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
    }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#f59e0b", letterSpacing: "0.08em", textTransform: "uppercase", flex: 1 }}>
          ⏱ Star Diagnostics
        </span>
        <button onPointerDown={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(148,163,184,0.5)", lineHeight: 0, touchAction: "manipulation" }}>
          <X size={13} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "90px 54px 54px 54px 32px", gap: 4, marginBottom: 4 }}>
        {["Symbol","Tap→UI","Tap→DB","Status",""].map((h, i) => (
          <span key={i} style={{ fontSize: 9, fontWeight: 700, color: "rgba(148,163,184,0.4)", textTransform: "uppercase" }}>{h}</span>
        ))}
      </div>
      {events.length === 0
        ? <p style={{ fontSize: 11, color: "rgba(148,163,184,0.4)", margin: "6px 0 0" }}>Tap ★ on any symbol to measure performance.</p>
        : events.map(ev => (
            <div key={ev.id} style={{ display: "grid", gridTemplateColumns: "90px 54px 54px 54px 32px", gap: 4, marginBottom: 3, alignItems: "center" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.symbol}</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: ev.uiMs !== null ? (ev.uiMs < 20 ? "#10b981" : ev.uiMs < 50 ? "#f59e0b" : "#ef4444") : "rgba(148,163,184,0.4)" }}>
                {ev.uiMs !== null ? `${ev.uiMs}ms` : "…"}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: ev.dbMs !== null ? (ev.dbMs < 150 ? "#10b981" : ev.dbMs < 400 ? "#f59e0b" : "#ef4444") : "rgba(148,163,184,0.4)" }}>
                {ev.dbMs !== null ? `${ev.dbMs}ms` : "…"}
              </span>
              <span style={{ fontSize: 10, color: "rgba(148,163,184,0.5)" }}>
                {ev.success === null ? "pending" : ev.success ? "saved" : "failed"}
              </span>
              <span style={{ fontSize: 11 }}>{ev.success === true ? "✓" : ev.success === false ? "✗" : ""}</span>
            </div>
          ))
      }
      <div style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 5 }}>
        <span style={{ fontSize: 9, color: "rgba(148,163,184,0.35)", fontWeight: 600 }}>
          Green &lt;20ms · Yellow &lt;50ms · Red ≥50ms (UI) | DB: Green &lt;150ms
        </span>
      </div>
    </div>
  );
}

// ── CategorySection ───────────────────────────────────────────────────────
function CategorySection({
  category, symbols, watchMap, getStarCb, getTapCb, defaultOpen, searchActive,
}: {
  category: Category;
  symbols: SymbolInfo[];
  watchMap: Map<string, { isFavorite: boolean; id: number }>;
  getStarCb: (s: string) => (tapAt: number) => void;
  getTapCb: (s: string) => () => void;
  defaultOpen: boolean;
  searchActive: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { if (searchActive) setOpen(true); }, [searchActive]);

  const label = CATEGORY_LABELS[category];
  const color = CATEGORY_COLORS[category];

  if (symbols.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          padding: "10px 16px", gap: 10,
          background: "rgba(255,255,255,0.02)",
          border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
          cursor: "pointer", touchAction: "manipulation",
        }}
      >
        <div style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: color, boxShadow: `0 0 6px ${color}66`,
        }} />
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.75)", textAlign: "left" }}>
          {label}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: "rgba(148,163,184,0.45)",
          background: "rgba(148,163,184,0.08)", borderRadius: 4,
          padding: "2px 7px", marginRight: 4,
        }}>
          {symbols.length}
        </span>
        {open
          ? <ChevronDown size={14} color="rgba(148,163,184,0.4)" />
          : <ChevronRight size={14} color="rgba(148,163,184,0.4)" />
        }
      </button>

      {open && symbols.map(s => {
        const wItem = watchMap.get(s.symbol);
        return (
          <SymbolRow
            key={s.symbol}
            symbol={s.symbol}
            name={s.name}
            category={s.category}
            inWatchlist={!!wItem}
            isFavorite={wItem?.isFavorite ?? false}
            onStarPress={getStarCb(s.symbol)}
            onTap={getTapCb(s.symbol)}
          />
        );
      })}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function Markets() {
  const [, navigate]              = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("Watchlist");
  const [search,    setSearch]    = useState("");
  const [showDiag,  setShowDiag]  = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { items, addSymbol, toggleFavorite } = useWatchlist();

  // ── Build the complete symbol list ──────────────────────────────────────
  // 1. SYMBOL_CATALOG is the primary source (same as desktop watchlist).
  // 2. Any watchlist items NOT in SYMBOL_CATALOG are appended under their
  //    auto-derived category (covers symbols the user manually added).
  const catalogSymbols = useMemo(() => buildCatalogSymbols(), []);

  const catalogKeys = useMemo(
    () => new Set(catalogSymbols.map(s => s.symbol)),
    [catalogSymbols],
  );

  const extraSymbols = useMemo<SymbolInfo[]>(() =>
    items
      .filter(i => !catalogKeys.has(i.symbol))
      .map(i => ({
        symbol:   i.symbol,
        name:     i.label,
        category: (MARKET_TO_CATEGORY[i.market] ?? "other") as Category,
      }))
  , [items, catalogKeys]);

  const allSymbols = useMemo(
    () => [...catalogSymbols, ...extraSymbols],
    [catalogSymbols, extraSymbols],
  );

  // ── Watchlist map (for star/favorite state) ──────────────────────────────
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

  // ── Navigation ──────────────────────────────────────────────────────────
  const handleSymbolTap = useCallback((symbol: string) => {
    localStorage.setItem("tv_symbol", symbol);
    useChartStore.getState().setSymbol(symbol);
    navigate("/charts");
  }, [navigate]);

  // ── Star/add to watchlist ────────────────────────────────────────────────
  const handleStarPress = useCallback(async (symbol: string, tapAt: number) => {
    const item = watchMapRef.current.get(symbol);
    if (item) {
      await toggleFavorite(item.id, item.isFavorite, tapAt);
    } else {
      await addSymbol(symbol, true, tapAt);
    }
  }, [addSymbol, toggleFavorite]);

  // Stable per-symbol callbacks (avoids re-creating stable memo'd rows)
  const starCbCache = useRef(new Map<string, (tapAt: number) => void>());
  const tapCbCache  = useRef(new Map<string, () => void>());

  const prevStarCb = useRef(handleStarPress);
  const prevNav    = useRef(navigate);
  if (prevStarCb.current !== handleStarPress || prevNav.current !== navigate) {
    prevStarCb.current = handleStarPress;
    prevNav.current    = navigate;
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

  // ── Search ───────────────────────────────────────────────────────────────
  const searchActive = search.trim().length > 0;
  const searchUpper  = search.trim().toUpperCase();

  // ── Group by category ─────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<Category, SymbolInfo[]>();
    CATEGORY_ORDER.forEach(c => map.set(c, []));
    for (const sym of allSymbols) {
      map.get(sym.category)!.push(sym);
    }
    return map;
  }, [allSymbols]);

  const filteredGrouped = useMemo(() => {
    if (!searchActive) return grouped;
    const filtered = new Map<Category, SymbolInfo[]>();
    for (const [cat, syms] of grouped) {
      filtered.set(cat, syms.filter(s =>
        s.symbol.toUpperCase().includes(searchUpper) ||
        s.name.toUpperCase().includes(searchUpper)
      ));
    }
    return filtered;
  }, [grouped, searchActive, searchUpper]);

  // ── Watchlist tab rows (favorites) ──────────────────────────────────────
  const watchlistRows = useMemo(() =>
    items.filter(i => i.isFavorite).map(i => ({
      symbol:   i.symbol,
      name:     i.label,
      category: (MARKET_TO_CATEGORY[i.market] ?? "other") as Category,
    }))
  , [items]);

  const filteredWatchlist = useMemo(() => {
    if (!searchActive) return watchlistRows;
    return watchlistRows.filter(r =>
      r.symbol.toUpperCase().includes(searchUpper) ||
      r.name.toUpperCase().includes(searchUpper)
    );
  }, [watchlistRows, searchActive, searchUpper]);

  const totalMarkets = allSymbols.length;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", background: "rgb(10,12,16)", color: "#fff",
      overflow: "hidden",
    }}>
      {/* ── Tab bar ── */}
      <div style={{
        flexShrink: 0,
        background: "rgba(10,12,16,0.98)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", padding: "4px 6px 0", alignItems: "flex-end" }}>
          {TABS.map(tab => {
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSearch(""); }}
                style={{
                  flexShrink: 0, padding: "9px 14px 10px", border: "none",
                  background: "transparent", cursor: "pointer",
                  fontSize: 13.5, fontWeight: active ? 700 : 400,
                  color: active ? "#f59e0b" : "rgba(148,163,184,0.50)",
                  position: "relative", transition: "color 0.15s", whiteSpace: "nowrap",
                }}
              >
                {tab}
                {tab === "Markets" && !active && totalMarkets > 0 && (
                  <span style={{
                    marginLeft: 5, fontSize: 10, fontWeight: 600,
                    color: "rgba(148,163,184,0.35)",
                    background: "rgba(148,163,184,0.08)",
                    borderRadius: 99, padding: "1px 5px",
                  }}>{totalMarkets}</span>
                )}
                {active && (
                  <div style={{
                    position: "absolute", bottom: 0,
                    left: "16%", right: "16%",
                    height: 2, borderRadius: "2px 2px 0 0", background: "#f59e0b",
                  }} />
                )}
              </button>
            );
          })}

          {/* Star diagnostics toggle */}
          <button
            onPointerDown={() => setShowDiag(v => !v)}
            title="Star tap diagnostics"
            style={{
              marginLeft: "auto", flexShrink: 0,
              padding: "9px 10px 10px",
              border: "none", background: "transparent", cursor: "pointer",
              color: showDiag ? "#f59e0b" : "rgba(148,163,184,0.28)",
              touchAction: "manipulation",
            }}
          >
            <ChevronDown size={14} style={{ transform: showDiag ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </button>
        </div>

        {/* Search bar */}
        <div style={{ padding: "8px 12px 6px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 10, padding: "8px 12px",
          }}>
            <Search size={14} color="rgba(148,163,184,0.45)" style={{ flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={activeTab === "Watchlist" ? "Search watchlist…" : "Search all markets…"}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                color: "#fff", fontSize: 13.5, caretColor: "#f59e0b", minWidth: 0,
              }}
            />
            {search && (
              <button
                onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, color: "rgba(148,163,184,0.5)", flexShrink: 0 }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: "4px 16px 6px",
          background: "rgba(255,255,255,0.015)",
          borderTop: "1px solid rgba(255,255,255,0.05)",
        }}>
          <div style={{ width: 26, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 10.5, color: "rgba(148,163,184,0.38)", fontWeight: 600 }}>Symbol</div>
          <div style={{ minWidth: 74, textAlign: "right", fontSize: 10.5, color: "rgba(148,163,184,0.38)", fontWeight: 600 }}>Price</div>
          <div style={{ minWidth: 64, textAlign: "center", marginLeft: 10, fontSize: 10.5, color: "rgba(148,163,184,0.38)", fontWeight: 600 }}>Change</div>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── WATCHLIST TAB ── */}
        {activeTab === "Watchlist" && (
          <>
            {filteredWatchlist.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", color: "rgba(148,163,184,0.35)", gap: 10 }}>
                <TrendingUp size={34} strokeWidth={1} />
                <p style={{ fontSize: 14, margin: 0 }}>
                  {searchActive ? "No results" : "No favourites yet"}
                </p>
                {!searchActive && (
                  <p style={{ fontSize: 12, margin: 0, color: "rgba(148,163,184,0.25)", textAlign: "center" }}>
                    Tap ★ on any symbol in Markets to add it here
                  </p>
                )}
              </div>
            )}
            {filteredWatchlist.map(row => {
              const wItem = watchMap.get(row.symbol);
              return (
                <SymbolRow
                  key={row.symbol}
                  symbol={row.symbol}
                  name={row.name}
                  category={row.category}
                  inWatchlist={!!wItem}
                  isFavorite={wItem?.isFavorite ?? false}
                  onStarPress={getStarCb(row.symbol)}
                  onTap={getTapCb(row.symbol)}
                />
              );
            })}
          </>
        )}

        {/* ── MARKETS TAB ── */}
        {activeTab === "Markets" && (
          <>
            {/* Search: flat list across all categories */}
            {searchActive && (
              <>
                {Array.from(filteredGrouped.values()).every(a => a.length === 0) && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "40px 0", color: "rgba(148,163,184,0.35)", fontSize: 13 }}>
                    No symbols match "{search}"
                  </div>
                )}
                {CATEGORY_ORDER.map(cat => {
                  const syms = filteredGrouped.get(cat) ?? [];
                  return syms.map(s => {
                    const wItem = watchMap.get(s.symbol);
                    return (
                      <SymbolRow
                        key={s.symbol}
                        symbol={s.symbol}
                        name={s.name}
                        category={s.category}
                        inWatchlist={!!wItem}
                        isFavorite={wItem?.isFavorite ?? false}
                        onStarPress={getStarCb(s.symbol)}
                        onTap={getTapCb(s.symbol)}
                      />
                    );
                  });
                })}
              </>
            )}

            {/* Normal: collapsible category sections */}
            {!searchActive && CATEGORY_ORDER.map((cat, idx) => (
              <CategorySection
                key={cat}
                category={cat}
                symbols={grouped.get(cat) ?? []}
                watchMap={watchMap}
                getStarCb={getStarCb}
                getTapCb={getTapCb}
                defaultOpen={idx === 0}
                searchActive={searchActive}
              />
            ))}
          </>
        )}

        <div style={{ height: 24 }} />
      </div>

      {showDiag && <DiagnosticsPanel onClose={() => setShowDiag(false)} />}
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
