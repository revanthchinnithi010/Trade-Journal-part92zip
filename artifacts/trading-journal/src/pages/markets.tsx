import {
  useState, useCallback, useEffect, useMemo, useRef, memo,
  useSyncExternalStore,
} from "react";
import { Star, TrendingUp, RefreshCw, Search, X, ChevronDown } from "lucide-react";
import { useWatchlist, SYMBOL_CATALOG } from "@/contexts/WatchlistContext";
import { useSymbolTick } from "@/store/tickStore";
import { useLocation } from "wouter";
import { useChartStore } from "@/store/chartStore";
import { tapStart, recordUi, getEvents, subscribe as diagSubscribe } from "@/lib/starDiag";
import {
  REGISTRY_FOREX, REGISTRY_METALS, REGISTRY_COMMODITIES, REGISTRY_INDICES,
} from "@/lib/symbolRegistry";

type Tab = "Watchlist" | "Crypto" | "Forex" | "Metals" | "Indices" | "Commodities";
const TABS: Tab[] = ["Watchlist", "Crypto", "Forex", "Metals", "Indices", "Commodities"];

interface SymbolInfo {
  symbol:       string;
  name:         string;
  contractType: string;
  broker:       string;
  underlying:   string;
  quoteAsset:   string;
  active:       boolean;
}

function formatPrice(price: number | undefined): string {
  if (!price) return "—";
  if (price >= 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (price >= 100)   return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)     return price.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return price.toLocaleString("en-US", { minimumFractionDigits: 5, maximumFractionDigits: 5 });
}

const CONTRACT_LABELS: Record<string, string> = {
  perpetual_futures: "Perp",
  forex:             "FX",
  index:             "Index",
  commodity:         "Cmdty",
  metal:             "Metal",
  crypto:            "Perp",
  indices:           "Index",
  commodities:       "Cmdty",
};

// ── Per-row render counter (diagnostics) ───────────────────────────────────
let totalRowRenders = 0;

// ── SymbolRow — fully isolated, memoized ──────────────────────────────────
const SymbolRow = memo(function SymbolRow({
  symbol, name, contractType, isFavorite, inWatchlist, onStarPress, onTap,
}: {
  symbol: string; name: string; contractType: string;
  isFavorite: boolean; inWatchlist: boolean;
  onStarPress: (tapAt: number) => void;
  onTap?: () => void;
}) {
  totalRowRenders++;

  const tick       = useSymbolTick(symbol);
  const price      = tick?.price;
  const changePct  = tick?.changePct ?? 0;
  const changeDollar = tick?.change ?? 0;
  const isUp       = changePct >= 0;
  const tag        = CONTRACT_LABELS[contractType] ?? contractType;

  // ── Optimistic star visual — fills at pointer-down, zero latency ──────────
  const [visualFav, setVisualFav] = useState(isFavorite);
  // Sync from parent when context state changes (confirms or rolls back)
  useEffect(() => { setVisualFav(isFavorite); }, [isFavorite]);

  const tapAtRef = useRef<number>(0);

  const handleStarDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const tapAt = tapStart(symbol);
    tapAtRef.current = tapAt;
    setVisualFav(v => !v);
    // Measure time to first painted frame
    requestAnimationFrame(() => recordUi(tapAt));
    onStarPress(tapAt);
  }, [symbol, onStarPress]);

  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "11px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
      gap: 10, minHeight: 62,
      cursor: onTap ? "pointer" : "default",
    }}
      onClick={onTap ? (e) => { if ((e.target as HTMLElement).closest("button")) return; onTap(); } : undefined}
    >
      {/* Star — fires on pointer-down for zero tap delay */}
      <button
        onPointerDown={handleStarDown}
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "6px 4px", flexShrink: 0, lineHeight: 0,
          // Eliminates 300ms double-tap delay on touch without any JS tricks
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

      {/* Symbol + name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13.5, letterSpacing: "0.01em" }}>
            {symbol}
          </span>
          <span style={{
            fontSize: 9.5, fontWeight: 600, color: "#94a3b8",
            background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.18)",
            borderRadius: 4, padding: "1px 5px", letterSpacing: "0.03em", flexShrink: 0,
          }}>
            {tag}
          </span>
        </div>
        <div style={{
          color: "rgba(148,163,184,0.5)", fontSize: 11, marginTop: 2,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {name}
        </div>
      </div>

      {/* Price */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 76 }}>
        <div style={{
          color: price ? "#fff" : "rgba(148,163,184,0.3)",
          fontWeight: 600, fontSize: 13.5, fontVariantNumeric: "tabular-nums",
        }}>
          {price ? `$${formatPrice(price)}` : "—"}
        </div>
      </div>

      {/* Change badge — % on top, $ below */}
      <div style={{
        minWidth: 66, padding: "5px 7px", borderRadius: 6,
        textAlign: "center", flexShrink: 0,
        background: tick
          ? isUp ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)"
          : "rgba(148,163,184,0.07)",
        color: tick
          ? isUp ? "#10b981" : "#ef4444"
          : "rgba(148,163,184,0.3)",
        border: tick
          ? isUp ? "1px solid rgba(16,185,129,0.22)" : "1px solid rgba(239,68,68,0.22)"
          : "1px solid rgba(148,163,184,0.1)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {tick ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
        </div>
        {tick && (
          <div style={{ fontSize: 10, fontWeight: 600, fontVariantNumeric: "tabular-nums", opacity: 0.8, marginTop: 1 }}>
            {isUp ? "+" : ""}{formatPrice(Math.abs(changeDollar))}
          </div>
        )}
      </div>
    </div>
  );
});

// ── Diagnostics panel ──────────────────────────────────────────────────────
function DiagnosticsPanel({ onClose }: { onClose: () => void }) {
  const events = useSyncExternalStore(diagSubscribe, getEvents);

  return (
    <div style={{
      position: "fixed", bottom: 60, left: 8, right: 8, zIndex: 9999,
      background: "rgba(10,12,16,0.97)",
      border: "1px solid rgba(245,158,11,0.35)",
      borderRadius: 12, padding: "10px 12px",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "#f59e0b", letterSpacing: "0.08em", textTransform: "uppercase", flex: 1 }}>
          ⏱ Star Diagnostics
        </span>
        <button
          onPointerDown={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(148,163,184,0.5)", lineHeight: 0, touchAction: "manipulation" }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Column labels */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "90px 54px 54px 54px 32px",
        gap: 4, marginBottom: 4,
      }}>
        {["Symbol", "Tap→UI", "Tap→DB", "Status", ""].map((h, i) => (
          <span key={i} style={{ fontSize: 9, fontWeight: 700, color: "rgba(148,163,184,0.4)", textTransform: "uppercase" }}>{h}</span>
        ))}
      </div>

      {/* Events */}
      {events.length === 0 ? (
        <p style={{ fontSize: 11, color: "rgba(148,163,184,0.4)", margin: "6px 0 0" }}>
          Tap ★ on any symbol to measure performance.
        </p>
      ) : (
        events.map(ev => (
          <div key={ev.id} style={{
            display: "grid",
            gridTemplateColumns: "90px 54px 54px 54px 32px",
            gap: 4, marginBottom: 3, alignItems: "center",
          }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {ev.symbol}
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: ev.uiMs !== null
                ? ev.uiMs < 20 ? "#10b981" : ev.uiMs < 50 ? "#f59e0b" : "#ef4444"
                : "rgba(148,163,184,0.4)",
            }}>
              {ev.uiMs !== null ? `${ev.uiMs}ms` : "…"}
            </span>
            <span style={{
              fontSize: 10.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: ev.dbMs !== null
                ? ev.dbMs < 150 ? "#10b981" : ev.dbMs < 400 ? "#f59e0b" : "#ef4444"
                : "rgba(148,163,184,0.4)",
            }}>
              {ev.dbMs !== null ? `${ev.dbMs}ms` : "…"}
            </span>
            <span style={{ fontSize: 10, color: "rgba(148,163,184,0.5)", fontVariantNumeric: "tabular-nums" }}>
              {ev.success === null ? "pending" : ev.success ? "saved" : "failed"}
            </span>
            <span style={{ fontSize: 11 }}>
              {ev.success === true ? "✓" : ev.success === false ? "✗" : ""}
            </span>
          </div>
        ))
      )}

      <div style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 5 }}>
        <span style={{ fontSize: 9, color: "rgba(148,163,184,0.35)", fontWeight: 600 }}>
          Green &lt;20ms · Yellow &lt;50ms · Red ≥50ms (UI) &nbsp;|&nbsp; DB: Green &lt;150ms
        </span>
      </div>
    </div>
  );
}

export default function Markets() {
  const [, navigate]              = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("Watchlist");
  const [search,    setSearch]    = useState("");
  const [showDiag,  setShowDiag]  = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const [deltaSymbols,   setDeltaSymbols]   = useState<SymbolInfo[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [loadError,      setLoadError]      = useState<string | null>(null);

  const { items, addSymbol, toggleFavorite } = useWatchlist();

  const handleSymbolTap = useCallback((symbol: string) => {
    localStorage.setItem("tv_symbol", symbol);
    useChartStore.getState().setSymbol(symbol);
    navigate("/charts");
  }, [navigate]);

  // ── watchMapRef: stable reference so handleStarPress never re-creates ─────
  const watchMapRef = useRef(new Map<string, typeof items[0]>());
  useEffect(() => {
    const m = new Map<string, typeof items[0]>();
    items.forEach(i => m.set(i.symbol, i));
    watchMapRef.current = m;
  }, [items]);

  // Also keep a useMemo version for passing isFavorite/inWatchlist to rows
  const watchMap = useMemo(() => {
    const m = new Map<string, typeof items[0]>();
    items.forEach(i => m.set(i.symbol, i));
    return m;
  }, [items]);

  // Load broker symbol catalogs once
  useEffect(() => {
    setLoading(true);
    fetch("/api/symbols?broker=delta").then(r => r.json())
      .then(d => {
        setDeltaSymbols((d as { symbols: SymbolInfo[] }).symbols ?? []);
        setLoadError(null);
      })
      .catch(err => setLoadError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  /**
   * Stable callback — uses watchMapRef so it never changes reference,
   * meaning the per-symbol callback cache below never needs to rebuild.
   */
  const handleStarPress = useCallback(async (symbol: string, tapAt: number) => {
    const item = watchMapRef.current.get(symbol);
    if (item) {
      await toggleFavorite(item.id, item.isFavorite, tapAt);
    } else {
      await addSymbol(symbol, true, tapAt);
    }
  }, [addSymbol, toggleFavorite]);   // both are stable

  // ── Stable per-symbol callback cache ─────────────────────────────────────
  // Same function reference for each symbol → SymbolRow.memo never re-renders
  // due to prop identity change.
  const starCbCache  = useRef(new Map<string, (tapAt: number) => void>());
  const tapCbCache   = useRef(new Map<string, () => void>());

  // Clear caches only when handleStarPress or navigate identity changes (rare)
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

  // ── Row computation — memoized ────────────────────────────────────────────
  const rows = useMemo(() => {
    let r: Array<{ symbol: string; name: string; contractType: string }>;

    if (activeTab === "Watchlist") {
      r = items
        .filter(i => i.isFavorite)
        .map(i => ({
          symbol:       i.symbol,
          name:         i.label,
          contractType: SYMBOL_CATALOG[i.symbol]?.market?.toLowerCase() ?? "other",
        }));
    } else if (activeTab === "Crypto") {
      r = deltaSymbols.map(s => ({ symbol: s.symbol, name: s.name, contractType: s.contractType }));
    } else if (activeTab === "Forex") {
      r = REGISTRY_FOREX;
    } else if (activeTab === "Metals") {
      r = REGISTRY_METALS;
    } else if (activeTab === "Indices") {
      r = REGISTRY_INDICES;
    } else {
      r = REGISTRY_COMMODITIES;
    }

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      r = r.filter(row =>
        row.symbol.toUpperCase().includes(q) || row.name.toUpperCase().includes(q)
      );
    }
    return r;
  }, [activeTab, search, items, deltaSymbols]);

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
        {/* Tabs + diag button */}
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", padding: "4px 6px 0", alignItems: "flex-end" }}>
          {TABS.map(tab => {
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSearch(""); }}
                style={{
                  flexShrink: 0, padding: "9px 13px 10px", border: "none",
                  background: "transparent", cursor: "pointer",
                  fontSize: 13.5, fontWeight: active ? 700 : 400,
                  color: active ? "#f59e0b" : "rgba(148,163,184,0.50)",
                  position: "relative", transition: "color 0.15s", whiteSpace: "nowrap",
                }}
              >
                {tab}
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

          {/* Diagnostics toggle */}
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

        {/* Search bar — hidden on Watchlist tab */}
        {activeTab !== "Watchlist" && (
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
                placeholder={`Search ${activeTab}…`}
                style={{
                  flex: 1, background: "none", border: "none", outline: "none",
                  color: "#fff", fontSize: 13.5, caretColor: "#f59e0b",
                  minWidth: 0,
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
        )}

        {/* Column headers */}
        <div style={{
          display: "flex", alignItems: "center",
          padding: "5px 16px 6px",
          background: "rgba(255,255,255,0.02)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ width: 26, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 11, color: "rgba(148,163,184,0.4)", fontWeight: 500 }}>Contract</div>
          <div style={{ minWidth: 80, textAlign: "right", fontSize: 11, color: "rgba(148,163,184,0.4)", fontWeight: 500 }}>Price</div>
          <div style={{ minWidth: 68, textAlign: "center", marginLeft: 10, fontSize: 11, color: "rgba(148,163,184,0.4)", fontWeight: 500 }}>24h Chg.</div>
        </div>
      </div>

      {/* ── List ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px 0", gap: 8, color: "rgba(148,163,184,0.45)" }}>
            <RefreshCw size={15} style={{ animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 13 }}>Loading…</span>
            <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
          </div>
        )}

        {!loading && loadError && activeTab !== "Watchlist" && (
          <div style={{ padding: "40px 24px", textAlign: "center", color: "rgba(239,68,68,0.65)", fontSize: 13 }}>
            Failed to load symbols.
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", color: "rgba(148,163,184,0.35)", gap: 10 }}>
            <TrendingUp size={34} strokeWidth={1} />
            <p style={{ fontSize: 14, margin: 0 }}>
              {activeTab === "Watchlist" ? "No favourites yet" : `No ${activeTab} symbols found`}
            </p>
            {activeTab === "Watchlist" && (
              <p style={{ fontSize: 12, margin: 0, color: "rgba(148,163,184,0.25)", textAlign: "center" }}>
                Tap ★ on any symbol in Crypto, Forex, Metals,{"\n"}Indices or Commodities to add it here
              </p>
            )}
          </div>
        )}

        {!loading && rows.map(row => {
          const wItem       = watchMap.get(row.symbol);
          const inWatchlist = !!wItem;
          const isFavorite  = wItem?.isFavorite ?? false;
          return (
            <SymbolRow
              key={row.symbol}
              symbol={row.symbol}
              name={row.name}
              contractType={row.contractType}
              inWatchlist={inWatchlist}
              isFavorite={isFavorite}
              onStarPress={getStarCb(row.symbol)}
              onTap={getTapCb(row.symbol)}
            />
          );
        })}

        <div style={{ height: 20 }} />
      </div>

      {/* ── Diagnostics overlay ── */}
      {showDiag && <DiagnosticsPanel onClose={() => setShowDiag(false)} />}
    </div>
  );
}
