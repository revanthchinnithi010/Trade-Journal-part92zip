import { useState, useCallback } from "react";
import { Star, Search, TrendingUp, TrendingDown } from "lucide-react";
import { useWatchlist, useWatchlistEntry, SYMBOL_CATALOG, type Market } from "@/contexts/WatchlistContext";
import { useSymbolTick } from "@/store/tickStore";
import { Link } from "wouter";

type Tab = "Watchlist" | Market;

const TABS: Tab[] = ["Watchlist", "Crypto", "Forex", "Indices", "Commodities"];

const LEVERAGE: Record<string, string> = {
  BTCUSD: "200x", ETHUSD: "200x", SOLUSD: "100x", DOGEUSD: "100x",
  PEPEUSD: "100x", EURUSD: "500x", GBPUSD: "500x", GBPJPY: "500x",
  USDJPY: "500x", AUDUSD: "500x", USDCAD: "500x",
  NAS100: "100x", US30: "100x", SPX500: "100x", DE40: "50x",
  XAUUSD: "100x", XAGUSD: "50x", USOIL: "25x", UKOIL: "25x",
};

const DESCRIPTIONS: Record<string, string> = {
  BTCUSD: "Bitcoin Perpetual", ETHUSD: "Ethereum Perpetual",
  SOLUSD: "Solana Perpetual", DOGEUSD: "Dogecoin Perpetual",
  PEPEUSD: "PEPE Perpetual", EURUSD: "Euro / US Dollar",
  GBPUSD: "British Pound / USD", GBPJPY: "British Pound / JPY",
  USDJPY: "US Dollar / Yen", AUDUSD: "Australian Dollar / USD",
  USDCAD: "US Dollar / CAD", NAS100: "NASDAQ 100 Index",
  US30: "Dow Jones Industrial", SPX500: "S&P 500 Index",
  DE40: "DAX 40 Index", XAUUSD: "Gold Spot / USD",
  XAGUSD: "Silver Spot / USD", USOIL: "WTI Crude Oil",
  UKOIL: "Brent Crude Oil",
};

function formatPrice(price: number | undefined): string {
  if (!price) return "—";
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (price >= 1) return price.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return price.toLocaleString("en-US", { minimumFractionDigits: 5, maximumFractionDigits: 5 });
}

function formatVolume(price: number | undefined, tickCount: number): string {
  if (!price || !tickCount) return "—";
  const vol = price * tickCount * 1200;
  if (vol >= 1_000_000_000) return `$${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(0)}`;
}

interface SymbolRowProps {
  symbol: string;
  isFavorite: boolean;
  onToggleFavorite: (symbol: string) => void;
}

function SymbolRow({ symbol, isFavorite, onToggleFavorite }: SymbolRowProps) {
  const tick = useSymbolTick(symbol);
  const cat  = SYMBOL_CATALOG[symbol];
  if (!cat) return null;

  const price    = tick?.price;
  const changePct = tick?.changePct ?? 0;
  const isUp     = changePct >= 0;
  const leverage = LEVERAGE[symbol] ?? "";
  const desc     = DESCRIPTIONS[symbol] ?? cat.label;

  return (
    <Link
      href={`/charts?symbol=${symbol}`}
      style={{ display: "block", textDecoration: "none" }}
    >
      <div
        style={{
          display:       "flex",
          alignItems:    "center",
          padding:       "12px 16px",
          borderBottom:  "1px solid rgba(255,255,255,0.05)",
          gap:           10,
          cursor:        "pointer",
          transition:    "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        {/* Star */}
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(symbol); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0 }}
        >
          <Star
            size={16}
            fill={isFavorite ? "#f59e0b" : "none"}
            color={isFavorite ? "#f59e0b" : "rgba(148,163,184,0.4)"}
          />
        </button>

        {/* Symbol info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#ffffff", fontWeight: 600, fontSize: 14, letterSpacing: "0.01em" }}>
              {symbol}
            </span>
            {leverage && (
              <span style={{
                fontSize:        10,
                fontWeight:      600,
                color:           "#f59e0b",
                background:      "rgba(245,158,11,0.12)",
                border:          "1px solid rgba(245,158,11,0.25)",
                borderRadius:    4,
                padding:         "1px 5px",
                letterSpacing:   "0.02em",
                flexShrink:      0,
              }}>
                {leverage}
              </span>
            )}
          </div>
          <div style={{ color: "rgba(148,163,184,0.55)", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {desc}
          </div>
        </div>

        {/* Price + volume */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            color:      price ? "#ffffff" : "rgba(148,163,184,0.4)",
            fontWeight: 600,
            fontSize:   14,
            fontVariantNumeric: "tabular-nums",
          }}>
            {price ? `$${formatPrice(price)}` : "—"}
          </div>
          <div style={{ color: "rgba(148,163,184,0.40)", fontSize: 11, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {formatVolume(price, tick?.tickCount ?? 0)}
          </div>
        </div>

        {/* Change badge */}
        <div style={{
          minWidth:     58,
          padding:      "5px 8px",
          borderRadius: 6,
          textAlign:    "center",
          fontSize:     12,
          fontWeight:   700,
          fontVariantNumeric: "tabular-nums",
          flexShrink:   0,
          background:   tick
            ? isUp ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)"
            : "rgba(148,163,184,0.08)",
          color: tick
            ? isUp ? "#10b981" : "#ef4444"
            : "rgba(148,163,184,0.4)",
          border: tick
            ? isUp ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(239,68,68,0.25)"
            : "1px solid rgba(148,163,184,0.1)",
        }}>
          {tick ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
        </div>
      </div>
    </Link>
  );
}

export default function Markets() {
  const [activeTab,  setActiveTab]  = useState<Tab>("Watchlist");
  const [search,     setSearch]     = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const { items, toggleFavorite } = useWatchlist();

  const favSet = new Set(items.filter(i => i.isFavorite).map(i => i.symbol));
  const watchSymbols = items.map(i => i.symbol);

  const handleToggleFavorite = useCallback((symbol: string) => {
    const item = items.find(i => i.symbol === symbol);
    if (item) toggleFavorite(item.id, item.isFavorite);
  }, [items, toggleFavorite]);

  const allCatalogSymbols = Object.keys(SYMBOL_CATALOG);

  function getSymbols(): string[] {
    let syms: string[];
    if (activeTab === "Watchlist") {
      syms = watchSymbols;
    } else {
      syms = allCatalogSymbols.filter(s => SYMBOL_CATALOG[s].market === activeTab);
    }
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      syms = syms.filter(s =>
        s.includes(q) ||
        (DESCRIPTIONS[s] ?? "").toUpperCase().includes(q) ||
        SYMBOL_CATALOG[s]?.label.toUpperCase().includes(q)
      );
    }
    return syms;
  }

  const symbols = getSymbols();

  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      height:         "100%",
      background:     "rgb(10,12,16)",
      color:          "#ffffff",
      overflowY:      "hidden",
    }}>
      {/* ── Top bar ── */}
      <div style={{
        flexShrink:   0,
        padding:      "14px 16px 0",
        background:   "rgba(10,12,16,0.98)",
        backdropFilter: "blur(20px)",
        position:     "sticky",
        top:          0,
        zIndex:       10,
      }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
            Markets
          </h1>
          <button
            onClick={() => setShowSearch(s => !s)}
            style={{
              background:   showSearch ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.07)",
              border:       showSearch ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              padding:      "7px 9px",
              cursor:       "pointer",
              color:        showSearch ? "#818cf8" : "rgba(148,163,184,0.8)",
              transition:   "all 0.18s",
              display:      "flex",
              alignItems:   "center",
            }}
          >
            <Search size={17} />
          </button>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div style={{
            marginBottom:  10,
            padding:       "8px 12px",
            borderRadius:  10,
            background:    "rgba(255,255,255,0.06)",
            border:        "1px solid rgba(255,255,255,0.1)",
            display:       "flex",
            alignItems:    "center",
            gap:           8,
          }}>
            <Search size={14} color="rgba(148,163,184,0.5)" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search symbol or name…"
              style={{
                flex:        1,
                background:  "none",
                border:      "none",
                outline:     "none",
                color:       "#ffffff",
                fontSize:    14,
                caretColor:  "#818cf8",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(148,163,184,0.5)", padding: 0 }}>✕</button>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div style={{
          display:        "flex",
          overflowX:      "auto",
          scrollbarWidth: "none",
          gap:            2,
          marginBottom:   0,
          paddingBottom:  0,
        }}>
          {TABS.map(tab => {
            const active = tab === activeTab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flexShrink:    0,
                  padding:       "8px 14px",
                  borderRadius:  "8px 8px 0 0",
                  border:        "none",
                  background:    "transparent",
                  cursor:        "pointer",
                  fontSize:      13,
                  fontWeight:    active ? 700 : 400,
                  color:         active ? "#f59e0b" : "rgba(148,163,184,0.55)",
                  position:      "relative",
                  transition:    "color 0.18s",
                  whiteSpace:    "nowrap",
                }}
              >
                {tab}
                {active && (
                  <div style={{
                    position:     "absolute",
                    bottom:       0,
                    left:         "20%",
                    right:        "20%",
                    height:       2,
                    borderRadius: "2px 2px 0 0",
                    background:   "#f59e0b",
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "0 -16px" }} />

        {/* Column headers */}
        <div style={{
          display:    "flex",
          alignItems: "center",
          padding:    "8px 16px",
          margin:     "0 -16px",
          background: "rgba(255,255,255,0.02)",
        }}>
          <div style={{ width: 26, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 11, color: "rgba(148,163,184,0.45)", fontWeight: 500 }}>Contract</div>
          <div style={{ width: 90, textAlign: "right", fontSize: 11, color: "rgba(148,163,184,0.45)", fontWeight: 500 }}>
            Price ↕ | Vol ↕
          </div>
          <div style={{ width: 66, textAlign: "center", fontSize: 11, color: "rgba(148,163,184,0.45)", fontWeight: 500, marginLeft: 8 }}>
            24h Chg. ↕
          </div>
        </div>
      </div>

      {/* ── Rows ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {symbols.length === 0 ? (
          <div style={{
            display:       "flex",
            flexDirection: "column",
            alignItems:    "center",
            justifyContent: "center",
            padding:       "60px 24px",
            color:         "rgba(148,163,184,0.4)",
            gap:           12,
          }}>
            <TrendingUp size={36} strokeWidth={1} color="rgba(148,163,184,0.2)" />
            <p style={{ fontSize: 14, margin: 0 }}>
              {activeTab === "Watchlist"
                ? "Your watchlist is empty"
                : `No ${activeTab} symbols found`}
            </p>
            {search && (
              <p style={{ fontSize: 12, margin: 0 }}>Try a different search term</p>
            )}
          </div>
        ) : (
          symbols.map(symbol => (
            <SymbolRow
              key={symbol}
              symbol={symbol}
              isFavorite={favSet.has(symbol)}
              onToggleFavorite={handleToggleFavorite}
            />
          ))
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
