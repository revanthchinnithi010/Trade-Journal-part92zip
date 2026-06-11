import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Star, TrendingUp, RefreshCw, Search, X } from "lucide-react";
import { useWatchlist, SYMBOL_CATALOG } from "@/contexts/WatchlistContext";
import { useSymbolTick } from "@/store/tickStore";
import { useLocation } from "wouter";
import { useChartStore } from "@/store/chartStore";

type Tab = "Watchlist" | "Crypto" | "Forex" | "Indices" | "Commodities";
const TABS: Tab[] = ["Watchlist", "Crypto", "Forex", "Indices", "Commodities"];

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

function SymbolRow({
  symbol, name, contractType, isFavorite, inWatchlist, onStarPress, onTap,
}: {
  symbol: string; name: string; contractType: string;
  isFavorite: boolean; inWatchlist: boolean;
  onStarPress: () => void; onTap?: () => void;
}) {
  const tick      = useSymbolTick(symbol);
  const price     = tick?.price;
  const changePct = tick?.changePct ?? 0;
  const isUp      = changePct >= 0;
  const tag       = CONTRACT_LABELS[contractType] ?? contractType;

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
      {/* Star */}
      <button
        onClick={onStarPress}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 2px", flexShrink: 0, lineHeight: 0 }}
      >
        <Star
          size={17}
          fill={isFavorite ? "#f59e0b" : inWatchlist ? "rgba(148,163,184,0.2)" : "none"}
          color={isFavorite ? "#f59e0b" : "rgba(148,163,184,0.38)"}
          strokeWidth={1.8}
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

      {/* Change badge */}
      <div style={{
        minWidth: 60, padding: "5px 7px", borderRadius: 6,
        textAlign: "center", fontSize: 12, fontWeight: 700,
        fontVariantNumeric: "tabular-nums", flexShrink: 0,
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
        {tick ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
      </div>
    </div>
  );
}

export default function Markets() {
  const [, navigate]              = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("Watchlist");
  const [search,    setSearch]    = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const [deltaSymbols,   setDeltaSymbols]   = useState<SymbolInfo[]>([]);
  const [ctraderSymbols, setCtraderSymbols] = useState<SymbolInfo[]>([]);
  const [loading,        setLoading]        = useState(false);
  const [loadError,      setLoadError]      = useState<string | null>(null);

  const { items, addSymbol, toggleFavorite } = useWatchlist();

  const handleSymbolTap = useCallback((symbol: string) => {
    localStorage.setItem("tv_symbol", symbol);
    useChartStore.getState().setSymbol(symbol);
    navigate("/charts");
  }, [navigate]);

  const watchMap = useMemo(() => {
    const m = new Map<string, typeof items[0]>();
    items.forEach(i => m.set(i.symbol, i));
    return m;
  }, [items]);

  // Load broker symbol catalogs once
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/symbols?broker=delta").then(r => r.json()),
      fetch("/api/symbols?broker=ctrader").then(r => r.json()),
    ])
      .then(([d, c]) => {
        setDeltaSymbols((d as { symbols: SymbolInfo[] }).symbols ?? []);
        setCtraderSymbols((c as { symbols: SymbolInfo[] }).symbols ?? []);
        setLoadError(null);
      })
      .catch(err => setLoadError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const handleStarPress = useCallback((symbol: string) => {
    const item = watchMap.get(symbol);
    if (item) {
      toggleFavorite(item.id, item.isFavorite);
    } else {
      addSymbol(symbol, true);
    }
  }, [watchMap, addSymbol, toggleFavorite]);

  function getRows(): Array<{ symbol: string; name: string; contractType: string }> {
    let rows: Array<{ symbol: string; name: string; contractType: string }>;

    if (activeTab === "Watchlist") {
      // Only show explicitly favourited symbols
      rows = items
        .filter(i => i.isFavorite)
        .map(i => ({
          symbol:       i.symbol,
          name:         i.label,
          contractType: SYMBOL_CATALOG[i.symbol]?.market?.toLowerCase() ?? "other",
        }));
    } else if (activeTab === "Crypto") {
      rows = deltaSymbols.map(s => ({ symbol: s.symbol, name: s.name, contractType: s.contractType }));
    } else if (activeTab === "Forex") {
      rows = ctraderSymbols
        .filter(s => s.contractType === "forex" || s.contractType === "metal")
        .map(s => ({ symbol: s.symbol, name: s.name, contractType: s.contractType }));
    } else if (activeTab === "Indices") {
      rows = ctraderSymbols
        .filter(s => s.contractType === "index")
        .map(s => ({ symbol: s.symbol, name: s.name, contractType: s.contractType }));
    } else {
      rows = ctraderSymbols
        .filter(s => s.contractType === "commodity")
        .map(s => ({ symbol: s.symbol, name: s.name, contractType: s.contractType }));
    }

    if (search.trim()) {
      const q = search.trim().toUpperCase();
      rows = rows.filter(r =>
        r.symbol.toUpperCase().includes(q) ||
        r.name.toUpperCase().includes(q)
      );
    }
    return rows;
  }

  const rows = getRows();

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100%", background: "rgb(10,12,16)", color: "#fff",
      overflow: "hidden",
    }}>
      {/* ── Tab bar only — no extra header ── */}
      <div style={{
        flexShrink: 0,
        background: "rgba(10,12,16,0.98)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        {/* Tabs */}
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", padding: "4px 6px 0" }}>
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
        </div>

        {/* Search bar — hidden on Watchlist tab */}
        {activeTab !== "Watchlist" && <div style={{ padding: "8px 12px 6px" }}>
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
        </div>}

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
                Tap ★ on any symbol in Crypto, Forex,{"\n"}Indices or Commodities to add it here
              </p>
            )}
          </div>
        )}

        {!loading && rows.map(row => {
          const wItem     = watchMap.get(row.symbol);
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
              onStarPress={() => handleStarPress(row.symbol)}
              onTap={() => handleSymbolTap(row.symbol)}
            />
          );
        })}

        <div style={{ height: 20 }} />
      </div>
    </div>
  );
}
