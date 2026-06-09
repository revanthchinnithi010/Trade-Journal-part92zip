import {
  memo, useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import { X, Search, Star } from "lucide-react";
import { fmtPrice } from "@/contexts/LiveMarketContext";
import { useTickStore } from "@/store/tickStore";
import { useMarketStore, type BrokerName, type SymbolInfo } from "@/store/marketStore";

const FAV_KEY = "bwl_favs_v1";

function loadFavs(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}
function saveFavs(s: Set<string>) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}

const BROKER_CONFIG: Record<BrokerName, { label: string; shortLabel: string; color: string; badgeBg: string }> = {
  delta: {
    label:      "Delta Exchange",
    shortLabel: "Delta",
    color:      "#00BFFF",
    badgeBg:    "rgba(0,191,255,0.12)",
  },
  ctrader: {
    label:      "cTrader",
    shortLabel: "cTrader",
    color:      "#B7FF5A",
    badgeBg:    "rgba(183,255,90,0.10)",
  },
};

function getBadge(sym: SymbolInfo): string {
  if (sym.underlying && sym.underlying.length > 0) return sym.underlying.slice(0, 5);
  return sym.symbol.slice(0, 5);
}

function getLabel(sym: SymbolInfo): string {
  if (sym.underlying && sym.quoteAsset) return `${sym.underlying}/${sym.quoteAsset}`;
  return sym.name || sym.symbol;
}

function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(loadFavs);
  const toggle = useCallback((symbol: string) => {
    setFavs(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      saveFavs(next);
      return next;
    });
  }, []);
  return { favs, toggle };
}

interface SymbolRowProps {
  sym:       SymbolInfo;
  active:    boolean;
  isFav:     boolean;
  price:     number | null;
  changePct: number | null;
  flashDir:  "up" | "down" | null;
  flashKey:  number;
  broker:    BrokerName;
  onSelect:  () => void;
  onFav:     () => void;
}

const SymbolRow = memo(function SymbolRow({
  sym, active, isFav, price, changePct, flashDir, flashKey,
  broker, onSelect, onFav,
}: SymbolRowProps) {
  const cfg       = BROKER_CONFIG[broker];
  const badge     = getBadge(sym);
  const label     = getLabel(sym);
  const isPos     = (changePct ?? 0) >= 0;
  const priceStr  = price !== null ? fmtPrice(price, sym.symbol) : "—";
  const pctStr    = changePct !== null ? `${isPos ? "+" : ""}${changePct.toFixed(2)}%` : "";

  const rowRef  = useRef<HTMLDivElement>(null);
  const prevKey = useRef(flashKey);

  useEffect(() => {
    if (flashKey === prevKey.current || !flashDir || !rowRef.current) return;
    prevKey.current = flashKey;
    const el  = rowRef.current;
    const clr = flashDir === "up" ? "rgba(183,255,90,0.14)" : "rgba(239,68,68,0.14)";
    el.style.background   = clr;
    el.style.transition   = "none";
    const raf = requestAnimationFrame(() => {
      el.style.transition = "background 0.6s ease";
      el.style.background = active ? "rgba(183,255,90,0.06)" : "transparent";
    });
    return () => cancelAnimationFrame(raf);
  }, [flashKey, flashDir, active]);

  return (
    <div
      ref={rowRef}
      onClick={onSelect}
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        8,
        padding:    "6px 10px 6px 12px",
        cursor:     "pointer",
        background: active ? "rgba(183,255,90,0.06)" : "transparent",
        borderLeft: active ? `2px solid ${cfg.color}` : "2px solid transparent",
        transition: "background 0.12s",
        minHeight:  44,
        userSelect: "none",
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.04)";
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* Badge */}
      <div style={{
        width:          34, height: 34, borderRadius: 9, flexShrink: 0,
        background:     cfg.badgeBg,
        border:         `1px solid ${cfg.color}22`,
        display:        "flex", alignItems: "center", justifyContent: "center",
        fontSize:       9, fontWeight: 900, color: cfg.color,
        letterSpacing:  "0.02em",
        textTransform:  "uppercase",
      }}>
        {badge.slice(0, 4)}
      </div>

      {/* Name column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin:        0, fontSize: 12, fontWeight: 700,
          color:         "#F3FFF3",
          overflow:      "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          lineHeight:    1.2,
        }}>
          {label}
        </p>
        <p style={{
          margin:       0, fontSize: 9.5,
          color:        "rgba(167,184,169,0.45)",
          lineHeight:   1.3, marginTop: 1,
          overflow:     "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
        }}>
          {sym.symbol}
        </p>
      </div>

      {/* Price + % column */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <p style={{
          margin:             0, fontSize: 11.5, fontWeight: 700,
          color:              price !== null ? "#F3FFF3" : "rgba(167,184,169,0.3)",
          fontVariantNumeric: "tabular-nums",
          lineHeight:         1.2,
        }}>
          {priceStr}
        </p>
        {pctStr && (
          <p style={{
            margin:             0, fontSize: 9.5, fontWeight: 600,
            color:              isPos ? "#B7FF5A" : "#EF4444",
            lineHeight:         1.3, marginTop: 1,
            fontVariantNumeric: "tabular-nums",
          }}>
            {pctStr}
          </p>
        )}
      </div>

      {/* Favorite star */}
      <button
        onClick={e => { e.stopPropagation(); onFav(); }}
        title={isFav ? "Remove from favorites" : "Add to favorites"}
        style={{
          width:   24, height: 24, border: "none", background: "transparent",
          cursor:  "pointer", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, marginLeft: 2,
        }}
      >
        <Star
          style={{
            width:  12, height: 12,
            color:  isFav ? "#F59E0B" : "rgba(167,184,169,0.2)",
            fill:   isFav ? "#F59E0B" : "none",
            transition: "color 0.15s, fill 0.15s",
          }}
        />
      </button>
    </div>
  );
});

interface BrokerWatchlistProps {
  activeSymbol: string;
  onSelect:     (symbol: string) => void;
  onClose:      () => void;
}

export const BrokerWatchlist = memo(function BrokerWatchlist({
  activeSymbol,
  onSelect,
  onClose,
}: BrokerWatchlistProps) {
  const ticks = useTickStore(s => s.ticks);
  const {
    activeBroker, setActiveBroker,
    symbolCatalog, catalogLoaded,
    fetchSymbolCatalog,
    setActiveSymbol,
  } = useMarketStore();

  const broker: BrokerName = activeBroker ?? "delta";
  const cfg                = BROKER_CONFIG[broker];

  const [search, setSearch] = useState("");
  const { favs, toggle: toggleFav } = useFavorites();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!catalogLoaded[broker]) {
      fetchSymbolCatalog(broker).catch(() => {});
    }
  }, [broker, catalogLoaded, fetchSymbolCatalog]);

  const symbols: SymbolInfo[] = symbolCatalog[broker] ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return symbols;
    return symbols.filter(s =>
      s.symbol.toLowerCase().includes(q) ||
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.underlying && s.underlying.toLowerCase().includes(q)),
    );
  }, [symbols, search]);

  const favorited = useMemo(() =>
    filtered.filter(s => favs.has(s.symbol)),
    [filtered, favs],
  );
  const unfavorited = useMemo(() =>
    filtered.filter(s => !favs.has(s.symbol)),
    [filtered, favs],
  );

  const handleSelect = useCallback((symbol: string) => {
    setActiveBroker(broker);
    setActiveSymbol(symbol);
    onSelect(symbol);
  }, [broker, setActiveBroker, setActiveSymbol, onSelect]);

  const switchBroker = useCallback((b: BrokerName) => {
    setActiveBroker(b);
    setSearch("");
    if (!catalogLoaded[b]) {
      fetchSymbolCatalog(b).catch(() => {});
    }
  }, [setActiveBroker, catalogLoaded, fetchSymbolCatalog]);

  const isLoading = symbols.length === 0 && !catalogLoaded[broker];

  return (
    <div style={{
      display:       "flex", flexDirection: "column",
      height:        "100%",
      background:    "#0a0a0a",
      overflow:      "hidden",
    }}>
      {/* ── Header ── */}
      <div style={{
        display:    "flex", alignItems: "center",
        padding:    "10px 12px 8px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0, gap: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#F3FFF3", flex: 1 }}>
          Watchlist
        </span>
        <button
          onClick={onClose}
          style={{
            width: 24, height: 24, border: "none", background: "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            borderRadius: 6, color: "rgba(167,184,169,0.45)",
          }}
        >
          <X style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* ── Broker tabs ── */}
      <div style={{
        display: "flex", gap: 3,
        padding: "8px 10px 0",
        flexShrink: 0,
      }}>
        {(["delta", "ctrader"] as BrokerName[]).map(b => {
          const bc  = BROKER_CONFIG[b];
          const act = b === broker;
          return (
            <button
              key={b}
              onClick={() => switchBroker(b)}
              style={{
                flex:        1, height: 28, borderRadius: 8, border: "none",
                background:  act ? `${bc.color}1A` : "rgba(255,255,255,0.04)",
                cursor:      "pointer", fontSize: 11, fontWeight: act ? 800 : 500,
                color:       act ? bc.color : "rgba(167,184,169,0.5)",
                transition:  "all 0.15s",
                boxShadow:   act ? `0 0 0 1px ${bc.color}44` : "0 0 0 1px rgba(255,255,255,0.06)",
              }}
            >
              {bc.label}
            </button>
          );
        })}
      </div>

      {/* ── Search ── */}
      <div style={{ padding: "8px 10px 4px", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <Search style={{
            position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
            width: 12, height: 12, color: "rgba(167,184,169,0.35)",
            pointerEvents: "none",
          }} />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${cfg.label}…`}
            style={{
              width:           "100%", height: 32,
              paddingLeft:     28, paddingRight: search ? 28 : 10,
              borderRadius:    8, border: "1px solid rgba(255,255,255,0.08)",
              background:      "rgba(255,255,255,0.04)",
              color:           "#F3FFF3", fontSize: 11.5,
              outline:         "none",
              fontFamily:      "inherit",
              boxSizing:       "border-box",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)",
                width: 16, height: 16, border: "none", background: "transparent",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                padding: 0,
              }}
            >
              <X style={{ width: 10, height: 10, color: "rgba(167,184,169,0.4)" }} />
            </button>
          )}
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "2px 12px 6px",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 9.5, color: "rgba(167,184,169,0.35)", fontWeight: 600 }}>
          {filtered.length} symbol{filtered.length !== 1 ? "s" : ""}
          {search && ` matching "${search}"`}
        </span>
      </div>

      {/* ── Symbol list ── */}
      <div style={{
        flex:           1,
        overflowY:      "auto",
        overflowX:      "hidden",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.08) transparent",
      }}>
        {isLoading ? (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%",
              border: `2px solid ${cfg.color}44`,
              borderTopColor: cfg.color,
              animation: "spin 0.7s linear infinite",
              margin: "0 auto 10px",
            }} />
            <p style={{ fontSize: 11, color: "rgba(167,184,169,0.45)", margin: 0 }}>
              Loading {cfg.label} symbols…
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 11, color: "rgba(167,184,169,0.4)", margin: 0 }}>
              {search ? "No symbols match your search" : `No ${cfg.label} symbols loaded`}
            </p>
          </div>
        ) : (
          <>
            {/* Favorites section */}
            {favorited.length > 0 && (
              <>
                <div style={{
                  padding: "5px 12px 2px",
                  fontSize: 9, fontWeight: 700, color: "#F59E0B",
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <Star style={{ width: 9, height: 9, fill: "#F59E0B" }} />
                  Favorites
                </div>
                {favorited.map(sym => {
                  const tick = ticks[sym.symbol];
                  return (
                    <SymbolRow
                      key={`fav-${sym.symbol}`}
                      sym={sym}
                      active={sym.symbol === activeSymbol}
                      isFav={true}
                      price={tick?.price ?? null}
                      changePct={tick?.changePct ?? null}
                      flashDir={tick?.flashDir ?? null}
                      flashKey={tick?.flashKey ?? 0}
                      broker={broker}
                      onSelect={() => handleSelect(sym.symbol)}
                      onFav={() => toggleFav(sym.symbol)}
                    />
                  );
                })}
                {unfavorited.length > 0 && (
                  <div style={{
                    height: 1, margin: "4px 12px",
                    background: "rgba(255,255,255,0.06)",
                  }} />
                )}
              </>
            )}

            {/* All symbols */}
            {unfavorited.map(sym => {
              const tick = ticks[sym.symbol];
              return (
                <SymbolRow
                  key={sym.symbol}
                  sym={sym}
                  active={sym.symbol === activeSymbol}
                  isFav={false}
                  price={tick?.price ?? null}
                  changePct={tick?.changePct ?? null}
                  flashDir={tick?.flashDir ?? null}
                  flashKey={tick?.flashKey ?? 0}
                  broker={broker}
                  onSelect={() => handleSelect(sym.symbol)}
                  onFav={() => toggleFav(sym.symbol)}
                />
              );
            })}
          </>
        )}

        <div style={{ height: 12 }} />
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
});

export default BrokerWatchlist;
