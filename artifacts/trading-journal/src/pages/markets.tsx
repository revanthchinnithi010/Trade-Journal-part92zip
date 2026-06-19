import {
  useState, useCallback, useEffect, useMemo, useRef, memo,
  useSyncExternalStore,
} from "react";
import {
  Star, TrendingUp, Search, X, ChevronDown, ChevronRight,
  RefreshCw, Wifi, WifiOff, AlertCircle, Zap,
} from "lucide-react";
import { useWatchlist, SYMBOL_CATALOG } from "@/contexts/WatchlistContext";
import { useSymbolTick } from "@/store/tickStore";
import { useCtraderSpot, useCtraderConnStatus } from "@/store/ctraderSpotStore";
import { useLocation } from "wouter";
import { useChartStore } from "@/store/chartStore";
import { tapStart, recordUi, getEvents, subscribe as diagSubscribe } from "@/lib/starDiag";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────

type DeltaCategory   = "perpetual" | "future" | "forex" | "index" | "commodity" | "other";
type CtraderCategory = "forex" | "index" | "commodity" | "stock" | "crypto" | "other";
type Category        = DeltaCategory | CtraderCategory;
type Tab             = "Watchlist" | "Markets";
type Broker          = "delta" | "ctrader";

interface SymbolInfo {
  symbol:   string;
  name:     string;
  category: Category;
  broker:   Broker;
}

// ── Category metadata ─────────────────────────────────────────────────────

const DELTA_CATEGORY_ORDER:   DeltaCategory[]   = ["perpetual", "future", "forex", "index", "commodity", "other"];
const CTRADER_CATEGORY_ORDER: CtraderCategory[] = ["forex", "index", "commodity", "stock", "crypto", "other"];

const CATEGORY_META: Record<Category, { label: string; badge: string; color: string }> = {
  perpetual: { label: "Perpetuals",   badge: "PERP",   color: "#f59e0b" },
  future:    { label: "Futures",      badge: "FUT",    color: "#a78bfa" },
  forex:     { label: "Forex",        badge: "FX",     color: "#60a5fa" },
  index:     { label: "Indices",      badge: "IDX",    color: "#34d399" },
  commodity: { label: "Commodities",  badge: "CMDTY",  color: "#fb923c" },
  stock:     { label: "Stocks",       badge: "STK",    color: "#38bdf8" },
  crypto:    { label: "Crypto",       badge: "DeFi",   color: "#818cf8" },
  other:     { label: "Other",        badge: "OTH",    color: "#94a3b8" },
};

const MARKET_TO_DELTA_CAT: Record<string, DeltaCategory> = {
  Crypto:      "perpetual",
  Forex:       "forex",
  Indices:     "index",
  Commodities: "commodity",
};

// ── Price helpers ─────────────────────────────────────────────────────────

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

// ── Diagnostics panel ─────────────────────────────────────────────────────

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
      {events.length === 0
        ? <p style={{ fontSize: 11, color: "rgba(148,163,184,0.4)", margin: "6px 0 0" }}>Tap ★ on any symbol to measure.</p>
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
    </div>
  );
}

// ── SymbolRow ─────────────────────────────────────────────────────────────

const SymbolRow = memo(function SymbolRow({
  symbol, name, category, broker, isFavorite, inWatchlist, isActive, onStarPress, onTap,
}: {
  symbol: string; name: string; category: Category; broker: Broker;
  isFavorite: boolean; inWatchlist: boolean; isActive?: boolean;
  onStarPress: (tapAt: number) => void;
  onTap?: () => void;
}) {
  const tick      = useSymbolTick(symbol);
  const cSpot     = useCtraderSpot(symbol);

  // Unified price display: tickStore has price for both Delta+cTrader (after our handleTick fix)
  const price     = tick?.price;
  const changePct = tick?.changePct ?? 0;
  const isUp      = changePct >= 0;

  // Bid/ask: tickStore has them from both Delta v2/ticker and ctrader_tick
  const bid    = tick?.bid    ?? (broker === "ctrader" ? cSpot?.bid    : undefined);
  const ask    = tick?.ask    ?? (broker === "ctrader" ? cSpot?.ask    : undefined);
  const spread = tick?.spread ?? (broker === "ctrader" ? cSpot?.spread : undefined);

  const hasBidAsk = !!bid && !!ask;
  const meta = CATEGORY_META[category];

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
        padding: "9px 14px 9px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.035)",
        gap: 8, minHeight: hasBidAsk ? 64 : 56,
        cursor: onTap ? "pointer" : "default",
        borderLeft: isActive ? "2.5px solid #f59e0b" : "2.5px solid transparent",
        background: isActive ? "rgba(245,158,11,0.04)" : undefined,
        transition: "border-left-color 0.15s, background 0.15s",
      }}
      onClick={onTap ? (e) => { if ((e.target as HTMLElement).closest("button")) return; onTap(); } : undefined}
    >
      <button
        onPointerDown={handleStarDown}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 4px", flexShrink: 0, lineHeight: 0, touchAction: "manipulation" }}
      >
        <Star
          size={16}
          fill={visualFav ? "#f59e0b" : inWatchlist ? "rgba(148,163,184,0.2)" : "none"}
          color={visualFav ? "#f59e0b" : "rgba(148,163,184,0.38)"}
          strokeWidth={1.8}
          style={{ transition: "fill 0.08s" }}
        />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: "0.01em" }}>
            {symbol}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600, color: meta.color,
            background: `${meta.color}18`,
            border: `1px solid ${meta.color}30`,
            borderRadius: 3, padding: "1px 4px", letterSpacing: "0.04em", flexShrink: 0,
          }}>
            {meta.badge}
          </span>
        </div>
        <div style={{ color: "rgba(148,163,184,0.4)", fontSize: 10.5, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </div>
        {hasBidAsk && (
          <div style={{ display: "flex", gap: 6, marginTop: 2.5 }}>
            <span style={{ fontSize: 9.5, color: "rgba(52,211,153,0.75)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              B {formatPrice(bid!)}
            </span>
            <span style={{ fontSize: 9.5, color: "rgba(239,68,68,0.75)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              A {formatPrice(ask!)}
            </span>
            {!!spread && spread > 0 && !!price && (
              <span style={{ fontSize: 9.5, color: "rgba(148,163,184,0.35)", fontVariantNumeric: "tabular-nums" }}>
                {formatSpread(spread, price)}
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 70 }}>
        <div style={{ color: price ? "#fff" : "rgba(148,163,184,0.25)", fontWeight: 600, fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
          {price ? formatPrice(price) : "—"}
        </div>
      </div>

      <div style={{
        minWidth: 60, padding: "3px 5px", borderRadius: 6, textAlign: "center", flexShrink: 0,
        background: tick ? (isUp ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)") : "rgba(148,163,184,0.05)",
        color: tick ? (isUp ? "#10b981" : "#ef4444") : "rgba(148,163,184,0.25)",
        border: tick ? (isUp ? "1px solid rgba(16,185,129,0.18)" : "1px solid rgba(239,68,68,0.18)") : "1px solid rgba(148,163,184,0.08)",
      }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {tick ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
        </div>
      </div>
    </div>
  );
});

// ── CategorySection ───────────────────────────────────────────────────────

const INITIAL_SHOW = 50;

function CategorySection({
  category, symbols, broker, watchMap, getStarCb, getTapCb, defaultOpen, searchActive, activeSymbol,
}: {
  category: Category; symbols: SymbolInfo[]; broker: Broker;
  watchMap: Map<string, { isFavorite: boolean; id: number }>;
  getStarCb: (s: string) => (tapAt: number) => void;
  getTapCb:  (s: string) => () => void;
  defaultOpen: boolean; searchActive: boolean; activeSymbol?: string;
}) {
  const [open,    setOpen]    = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { if (searchActive) setOpen(true); }, [searchActive]);

  const meta = CATEGORY_META[category];
  if (symbols.length === 0) return null;

  const visible = showAll ? symbols : symbols.slice(0, INITIAL_SHOW);

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", padding: "9px 14px", gap: 10,
          background: "rgba(255,255,255,0.018)", border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.055)", cursor: "pointer", touchAction: "manipulation",
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: meta.color, boxShadow: `0 0 5px ${meta.color}66` }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.72)", textAlign: "left" }}>{meta.label}</span>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(148,163,184,0.4)", background: "rgba(148,163,184,0.07)", borderRadius: 4, padding: "1px 6px", marginRight: 3 }}>
          {symbols.length}
        </span>
        {open ? <ChevronDown size={13} color="rgba(148,163,184,0.4)" /> : <ChevronRight size={13} color="rgba(148,163,184,0.4)" />}
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
                broker={broker}
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
              onClick={() => setShowAll(true)}
              style={{
                width: "100%", padding: "10px 16px", border: "none",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                background: "rgba(255,255,255,0.025)", cursor: "pointer", touchAction: "manipulation",
                color: meta.color, fontSize: 12, fontWeight: 600,
              }}
            >
              Show {symbols.length - INITIAL_SHOW} more {meta.label.toLowerCase()}…
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── cTrader Connect Card ──────────────────────────────────────────────────

function CtraderConnectCard({
  onSetupComplete,
}: {
  onSetupComplete: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "oauth" | "setup" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [progressMsg, setProgressMsg] = useState("");
  const popupRef = useRef<Window | null>(null);

  const startOAuth = useCallback(async () => {
    setPhase("oauth");
    setErrorMsg("");
    try {
      const res  = await fetch(`${BASE}/api/ctrader/oauth/config`);
      const data = await res.json() as { configured?: boolean; authUrl?: string; error?: string };
      if (!data.configured || !data.authUrl) {
        setPhase("error");
        setErrorMsg(data.error ?? "cTrader OAuth not configured. Set CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET in Secrets.");
        return;
      }

      const popup = window.open(data.authUrl, "ctrader_oauth", "width=540,height=640,resizable,scrollbars");
      popupRef.current = popup;

      const listener = async (event: MessageEvent) => {
        const msg = event.data as { type?: string; status?: string };
        if (msg.type !== "ctrader_oauth_result") return;
        window.removeEventListener("message", listener);

        if (msg.status !== "success") {
          setPhase("error");
          setErrorMsg("OAuth authorization failed. Please try again.");
          return;
        }

        // OAuth succeeded — run auto-setup
        setPhase("setup");
        setProgressMsg("Fetching account & symbols…");
        try {
          const setupRes = await fetch(`${BASE}/api/ctrader/auto-setup`, { method: "POST" });
          const setup = await setupRes.json() as { ok: boolean; symbolCount?: number; error?: string };
          if (setup.ok) {
            setProgressMsg(`${setup.symbolCount ?? 0} symbols loaded`);
            setPhase("done");
            setTimeout(onSetupComplete, 800);
          } else {
            setPhase("error");
            setErrorMsg(setup.error ?? "Auto-setup failed");
          }
        } catch (e) {
          setPhase("error");
          setErrorMsg(String(e));
        }
      };
      window.addEventListener("message", listener);
    } catch (e) {
      setPhase("error");
      setErrorMsg(String(e));
    }
  }, [onSetupComplete]);

  return (
    <div style={{
      margin: "28px 16px", padding: "22px 18px", borderRadius: 14,
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      textAlign: "center",
    }}>
      <div style={{ marginBottom: 10, opacity: 0.4 }}>
        <Wifi size={32} color="#60a5fa" />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
        Connect cTrader
      </div>
      <div style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", marginBottom: 18, lineHeight: 1.5 }}>
        Connect your cTrader account to stream live Forex, Indices, Commodities, Stocks, and Crypto. Symbols subscribe automatically when added to watchlist.
      </div>

      {phase === "idle" && (
        <button
          onClick={startOAuth}
          style={{
            padding: "10px 22px", borderRadius: 9, border: "none",
            background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
            touchAction: "manipulation",
          }}
        >
          Connect cTrader
        </button>
      )}

      {phase === "oauth" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(148,163,184,0.6)", fontSize: 12 }}>
          <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
          Waiting for authorization…
        </div>
      )}

      {phase === "setup" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "rgba(148,163,184,0.6)", fontSize: 12 }}>
          <RefreshCw size={13} style={{ animation: "spin 1s linear infinite" }} />
          {progressMsg}
        </div>
      )}

      {phase === "done" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#10b981", fontSize: 13, fontWeight: 600 }}>
          ✓ {progressMsg}
        </div>
      )}

      {phase === "error" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#ef4444", fontSize: 12, marginBottom: 10 }}>
            <AlertCircle size={13} />
            {errorMsg}
          </div>
          <button
            onClick={() => { setPhase("idle"); setErrorMsg(""); }}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.08)", color: "#ef4444", fontSize: 12, cursor: "pointer" }}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

// ── cTrader Status Bar ────────────────────────────────────────────────────

function CtraderStatusBar() {
  const connStatus = useCtraderConnStatus();
  const isStreaming = connStatus === "streaming";
  const color = isStreaming ? "#10b981" : connStatus === "connecting" || connStatus === "app_auth" || connStatus === "acct_auth" ? "#f59e0b" : "rgba(148,163,184,0.3)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 14px 6px" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: isStreaming ? `0 0 4px ${color}` : "none" }} />
      <span style={{ fontSize: 10, color: "rgba(148,163,184,0.4)", fontWeight: 500 }}>
        cTrader: {connStatus === "streaming" ? "live" : connStatus === "connecting" ? "connecting…" : connStatus === "app_auth" || connStatus === "acct_auth" ? "authenticating…" : connStatus === "reconnecting" ? "reconnecting…" : connStatus}
      </span>
    </div>
  );
}

// ── Broker Pill Filter ────────────────────────────────────────────────────

function BrokerFilter({ value, onChange, deltaCount, ctraderCount }: {
  value: Broker; onChange: (b: Broker) => void;
  deltaCount: number; ctraderCount: number;
}) {
  const items: [Broker, string, number][] = [
    ["delta",   "Delta Exchange", deltaCount],
    ["ctrader", "cTrader",        ctraderCount],
  ];

  return (
    <div style={{ display: "flex", gap: 6, padding: "6px 12px 2px", overflowX: "auto", scrollbarWidth: "none" }}>
      {items.map(([broker, label, count]) => {
        const active = value === broker;
        return (
          <button
            key={broker}
            onClick={() => onChange(broker)}
            style={{
              flexShrink: 0, padding: "5px 12px", borderRadius: 20,
              border: active ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(255,255,255,0.08)",
              background: active ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.04)",
              color: active ? "#f59e0b" : "rgba(148,163,184,0.5)",
              fontSize: 11.5, fontWeight: active ? 700 : 400,
              cursor: "pointer", touchAction: "manipulation",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            {broker === "delta" ? <Zap size={10} /> : <Wifi size={10} />}
            {label}
            {count > 0 && (
              <span style={{ fontSize: 9.5, fontWeight: 600, color: active ? "rgba(245,158,11,0.7)" : "rgba(148,163,184,0.35)" }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

const TABS: Tab[] = ["Watchlist", "Markets"];

export default function Markets() {
  const [, navigate]              = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("Watchlist");
  const [broker,    setBroker]    = useState<Broker>("delta");
  const [search,    setSearch]    = useState("");
  const [showDiag,  setShowDiag]  = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Active chart symbol — used to highlight the currently charting row ──
  const chartSymbol = useChartStore(s => s.symbol);

  // ── Delta catalog ──────────────────────────────────────────────────────
  const [deltaSymbols, setDeltaSymbols] = useState<SymbolInfo[]>([]);
  const [deltaLoading, setDeltaLoading] = useState(false);
  const [deltaError,   setDeltaError]   = useState<string | null>(null);
  const [deltaFetchAt, setDeltaFetchAt] = useState(0);

  const fetchDeltaSymbols = useCallback(async (force = false) => {
    if (deltaLoading) return;
    setDeltaLoading(true); setDeltaError(null);
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
    } catch (e) { setDeltaError(String(e)); }
    finally { setDeltaLoading(false); }
  }, [deltaLoading]);

  useEffect(() => { fetchDeltaSymbols(); }, []); // eslint-disable-line

  // ── cTrader catalog ────────────────────────────────────────────────────
  const [ctraderSymbols, setCtraderSymbols] = useState<SymbolInfo[]>([]);
  const [ctraderLoading, setCtraderLoading] = useState(false);
  const [ctraderFetchAt, setCtraderFetchAt] = useState(0);

  const fetchCtraderSymbols = useCallback(async () => {
    if (ctraderLoading) return;
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
    finally { setCtraderLoading(false); }
  }, [ctraderLoading]);

  useEffect(() => { fetchCtraderSymbols(); }, []); // eslint-disable-line

  // Fetch cTrader symbols when switching to ctrader broker
  useEffect(() => {
    if (broker === "ctrader" && ctraderSymbols.length === 0 && !ctraderLoading) {
      fetchCtraderSymbols();
    }
  }, [broker]); // eslint-disable-line

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

  // ── Navigation ─────────────────────────────────────────────────────────
  const handleSymbolTap = useCallback((symbol: string) => {
    localStorage.setItem("tv_symbol", symbol);
    useChartStore.getState().setSymbol(symbol);
    navigate("/charts");
  }, [navigate]);

  // ── Star callbacks ─────────────────────────────────────────────────────
  const handleStarPress = useCallback(async (symbol: string, tapAt: number) => {
    const item = watchMapRef.current.get(symbol);
    if (item) {
      await toggleFavorite(item.id, item.isFavorite, tapAt);
    } else {
      await addSymbol(symbol, true, tapAt);
    }
  }, [addSymbol, toggleFavorite]);

  const starCbCache = useRef(new Map<string, (tapAt: number) => void>());
  const tapCbCache  = useRef(new Map<string, () => void>());
  const prevStarCb  = useRef(handleStarPress);
  const prevNav     = useRef(navigate);
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

  // ── Delta symbol list (perpetuals + futures + catalog non-crypto) ──────
  const allDeltaSymbols = useMemo<SymbolInfo[]>(() => {
    const seen = new Set<string>();
    const result: SymbolInfo[] = [];
    for (const s of deltaSymbols) {
      if (!seen.has(s.symbol)) { seen.add(s.symbol); result.push(s); }
    }
    for (const [sym, entry] of Object.entries(SYMBOL_CATALOG)) {
      if (entry.market === "Crypto") continue;
      if (seen.has(sym)) continue;
      seen.add(sym);
      result.push({ symbol: sym, name: entry.label, category: MARKET_TO_DELTA_CAT[entry.market] ?? "other", broker: "delta" });
    }
    for (const item of items) {
      if (!seen.has(item.symbol)) {
        seen.add(item.symbol);
        result.push({ symbol: item.symbol, name: item.label, category: MARKET_TO_DELTA_CAT[item.market] ?? "other", broker: "delta" });
      }
    }
    return result;
  }, [deltaSymbols, items]);

  // ── Current broker symbol list ─────────────────────────────────────────
  const activeSymbols = broker === "delta" ? allDeltaSymbols : ctraderSymbols;

  // ── Group by category ──────────────────────────────────────────────────
  const categoryOrder = broker === "delta" ? DELTA_CATEGORY_ORDER : CTRADER_CATEGORY_ORDER;

  const grouped = useMemo(() => {
    const map = new Map<Category, SymbolInfo[]>();
    categoryOrder.forEach(c => map.set(c, []));
    for (const s of activeSymbols) {
      const arr = map.get(s.category as Category);
      if (arr) arr.push(s);
      else map.set(s.category as Category, [s]);
    }
    return map;
  }, [activeSymbols, categoryOrder]);

  // ── Search ─────────────────────────────────────────────────────────────
  const searchActive = search.trim().length > 0;
  const searchUpper  = search.trim().toUpperCase();

  const searchResults = useMemo(() => {
    if (!searchActive) return [];
    return activeSymbols.filter(s =>
      s.symbol.toUpperCase().includes(searchUpper) ||
      s.name.toUpperCase().includes(searchUpper)
    );
  }, [activeSymbols, searchActive, searchUpper]);

  // ── Watchlist tab items ────────────────────────────────────────────────
  const watchlistRows = useMemo(() => {
    const favs = items.filter(i => i.isFavorite);
    return favs.map(i => {
      const cSym = ctraderSymbols.find(c => c.symbol === i.symbol);
      const dSym = deltaSymbols.find(d => d.symbol === i.symbol);
      const detectedBroker: Broker = cSym ? "ctrader" : "delta";
      return {
        symbol:   i.symbol,
        name:     i.label,
        category: cSym?.category ?? dSym?.category ?? (MARKET_TO_DELTA_CAT[i.market] ?? "other") as Category,
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

  // ── Total counts ───────────────────────────────────────────────────────
  const totalMarkets = activeSymbols.length;

  const handleCtraderSetupComplete = useCallback(() => {
    fetchCtraderSymbols();
  }, [fetchCtraderSymbols]);

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "rgb(10,12,16)", color: "#fff", overflow: "hidden",
    }}>
      {/* ── Sticky header ── */}
      <div style={{
        flexShrink: 0,
        background: "rgba(10,12,16,0.98)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        {/* Tab bar */}
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
                  color: active ? "#f59e0b" : "rgba(148,163,184,0.5)",
                  position: "relative", transition: "color 0.15s", whiteSpace: "nowrap",
                }}
              >
                {tab}
                {tab === "Markets" && !active && totalMarkets > 0 && (
                  <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 600, color: "rgba(148,163,184,0.35)", background: "rgba(148,163,184,0.08)", borderRadius: 99, padding: "1px 5px" }}>
                    {totalMarkets}
                  </span>
                )}
                {active && (
                  <div style={{ position: "absolute", bottom: 0, left: "16%", right: "16%", height: 2, borderRadius: "2px 2px 0 0", background: "#f59e0b" }} />
                )}
              </button>
            );
          })}

          {/* Refresh + diag */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2, paddingRight: 4 }}>
            {activeTab === "Markets" && (
              <button
                onPointerDown={() => broker === "delta" ? fetchDeltaSymbols(true) : fetchCtraderSymbols()}
                disabled={broker === "delta" ? deltaLoading : ctraderLoading}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "9px 8px 10px", color: (deltaLoading || ctraderLoading) ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.35)", touchAction: "manipulation" }}
              >
                <RefreshCw size={13} style={{ animation: (deltaLoading || ctraderLoading) ? "spin 1s linear infinite" : "none" }} />
              </button>
            )}
            <button
              onPointerDown={() => setShowDiag(v => !v)}
              style={{ padding: "9px 8px 10px", border: "none", background: "transparent", cursor: "pointer", color: showDiag ? "#f59e0b" : "rgba(148,163,184,0.28)", touchAction: "manipulation" }}
            >
              <ChevronDown size={13} style={{ transform: showDiag ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </button>
          </div>
        </div>

        {/* Broker filter — only on Markets tab */}
        {activeTab === "Markets" && (
          <BrokerFilter
            value={broker}
            onChange={b => { setBroker(b); setSearch(""); }}
            deltaCount={allDeltaSymbols.length}
            ctraderCount={ctraderSymbols.length}
          />
        )}

        {/* cTrader status bar */}
        {activeTab === "Markets" && broker === "ctrader" && <CtraderStatusBar />}

        {/* Search bar */}
        <div style={{ padding: "6px 12px 6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 10, padding: "8px 12px" }}>
            <Search size={14} color="rgba(148,163,184,0.45)" style={{ flexShrink: 0 }} />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={activeTab === "Watchlist" ? "Search watchlist…" : `Search ${broker === "ctrader" ? "cTrader" : "Delta"} markets…`}
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#fff", fontSize: 13.5, caretColor: "#f59e0b", minWidth: 0 }}
            />
            {search && (
              <button onClick={() => { setSearch(""); searchRef.current?.focus(); }} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, color: "rgba(148,163,184,0.5)" }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Column headers */}
        <div style={{ display: "flex", alignItems: "center", padding: "3px 14px 5px", borderTop: "1px solid rgba(255,255,255,0.045)" }}>
          <div style={{ width: 28, flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 10, color: "rgba(148,163,184,0.32)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Symbol</div>
          <div style={{ minWidth: 72, textAlign: "right", fontSize: 10, color: "rgba(148,163,184,0.32)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Price</div>
          <div style={{ minWidth: 62, textAlign: "center", marginLeft: 8, fontSize: 10, color: "rgba(148,163,184,0.32)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>24h%</div>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── WATCHLIST TAB ── */}
        {activeTab === "Watchlist" && (
          <>
            {filteredWatchlist.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", color: "rgba(148,163,184,0.32)", gap: 10 }}>
                <TrendingUp size={32} strokeWidth={1} />
                <p style={{ fontSize: 14, margin: 0 }}>{searchActive ? "No results" : "No favourites yet"}</p>
                {!searchActive && (
                  <p style={{ fontSize: 12, margin: 0, color: "rgba(148,163,184,0.22)", textAlign: "center" }}>Tap ★ on any symbol in Markets to add it here</p>
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
                  broker={row.broker}
                  inWatchlist={!!wItem}
                  isFavorite={wItem?.isFavorite ?? false}
                  isActive={chartSymbol === row.symbol}
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
            {/* cTrader: no symbols yet → show connect card */}
            {broker === "ctrader" && ctraderSymbols.length === 0 && !ctraderLoading && (
              <CtraderConnectCard onSetupComplete={handleCtraderSetupComplete} />
            )}

            {/* Loading */}
            {((broker === "delta" && deltaLoading && deltaSymbols.length === 0) ||
              (broker === "ctrader" && ctraderLoading && ctraderSymbols.length === 0)) && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "50px 0", gap: 8, color: "rgba(148,163,184,0.4)" }}>
                <RefreshCw size={14} style={{ animation: "spin 1s linear infinite" }} />
                <span style={{ fontSize: 13 }}>Loading {broker === "ctrader" ? "cTrader" : "Delta"} catalog…</span>
              </div>
            )}

            {/* Delta error */}
            {broker === "delta" && !deltaLoading && deltaError && deltaSymbols.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <p style={{ margin: "0 0 6px", color: "rgba(239,68,68,0.6)", fontSize: 13 }}>Failed to load Delta catalog</p>
                <p style={{ margin: "0 0 14px", fontSize: 11, color: "rgba(148,163,184,0.35)" }}>{deltaError}</p>
                <button onClick={() => fetchDeltaSymbols(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "rgba(245,158,11,0.15)", color: "#f59e0b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Retry
                </button>
              </div>
            )}

            {/* Search results — flat list */}
            {searchActive && (
              <>
                {searchResults.length === 0 && (
                  <div style={{ display: "flex", justifyContent: "center", padding: "40px 0", color: "rgba(148,163,184,0.35)", fontSize: 13 }}>
                    No symbols match "{search}"
                  </div>
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
                      isActive={chartSymbol === s.symbol}
                      onStarPress={getStarCb(s.symbol)}
                      onTap={getTapCb(s.symbol)}
                    />
                  );
                })}
              </>
            )}

            {/* Category sections */}
            {!searchActive && activeSymbols.length > 0 && (categoryOrder as Category[]).map((cat, idx) => (
              <CategorySection
                key={`${broker}-${cat}`}
                category={cat}
                symbols={grouped.get(cat) ?? []}
                broker={broker}
                watchMap={watchMap}
                getStarCb={getStarCb}
                getTapCb={getTapCb}
                defaultOpen={idx === 0}
                searchActive={searchActive}
                activeSymbol={chartSymbol}
              />
            ))}

            {/* Footer timestamp */}
            {broker === "delta" && deltaFetchAt > 0 && !deltaLoading && (
              <div style={{ padding: "12px 14px 4px", textAlign: "center" }}>
                <span style={{ fontSize: 10, color: "rgba(148,163,184,0.22)", fontWeight: 500 }}>
                  Delta: {allDeltaSymbols.length} symbols · {Math.round((Date.now() - deltaFetchAt) / 1000)}s ago
                </span>
              </div>
            )}
            {broker === "ctrader" && ctraderFetchAt > 0 && !ctraderLoading && (
              <div style={{ padding: "12px 14px 4px", textAlign: "center" }}>
                <span style={{ fontSize: 10, color: "rgba(148,163,184,0.22)", fontWeight: 500 }}>
                  cTrader: {ctraderSymbols.length} symbols · {Math.round((Date.now() - ctraderFetchAt) / 1000)}s ago
                </span>
              </div>
            )}
          </>
        )}

        <div style={{ height: 28 }} />
      </div>

      {showDiag && <DiagnosticsPanel onClose={() => setShowDiag(false)} />}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
