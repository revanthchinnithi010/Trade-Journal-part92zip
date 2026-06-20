import { useState, useEffect, useRef, useCallback } from "react";
import {
  getAssetClass, getAssetClassLabel, getProviderLabel, getRoutingReason,
  updateSymbolProviderRouting,
  type AssetClass, type DataProvider,
} from "@/lib/assetClass";
import { useTickStore } from "@/store/tickStore";
import { useCtraderSpotStore } from "@/store/ctraderSpotStore";
import { Activity, Wifi, WifiOff, ChevronDown, ChevronUp } from "lucide-react";
import { useMarketSession } from "@/lib/marketSession";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ProviderStat {
  name:          string;
  displayName?:  string;
  status:        string;
  tickCount:     number;
  lastTickAt:    number | null;
  subscriptions: string[];
}

interface SymbolDiag {
  provider:      string | undefined;
  assetClass:    string | undefined;
  routingReason: string | undefined;
  subscribed:    boolean;
  lastTickAt:    number | null;
  lastPrice:     number | null;
  lastTickAgo:   number | null;
  symbolId:      string | undefined;
}

interface DiagData {
  providers:     ProviderStat[];
  perSymbol:     Record<string, SymbolDiag>;
  subscriptions: string[];
  symbolRouting: Record<string, string>;
  totalTicks:    number;
  ts:            number;
}

interface Props { symbol: string }

const CLASS_COLOR: Record<AssetClass, string> = {
  crypto:    "#8B5CF6",
  forex:     "#3B82F6",
  metal:     "#F59E0B",
  index:     "#10B981",
  commodity: "#EF4444",
  unknown:   "rgba(255,255,255,0.35)",
};

const PROVIDER_COLOR: Record<string, string> = {
  delta:   "#8B5CF6",
  ctrader: "#F59E0B",
  unknown: "rgba(255,255,255,0.35)",
};

function Row({
  label, value, color = "rgba(255,255,255,0.8)", dimValue = false,
}: {
  label: string; value: string; color?: string; dimValue?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
      <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 10, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: dimValue ? "rgba(255,255,255,0.45)" : color,
        fontSize: 11, fontWeight: 600,
        textAlign: "right", wordBreak: "break-word", maxWidth: 160,
      }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "7px 0" }} />;
}

export function FeedDiagnostics({ symbol }: Props) {
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<DiagData | null>(null);
  const [tps,  setTps]  = useState<number>(0);

  const tickCountRef  = useRef(0);
  const lastTpsRef    = useRef(Date.now());
  const prevCountRef  = useRef(0);
  const prevTickTsRef = useRef(0);

  const { isOpen: sessionOpen, type: sessionType } = useMarketSession(symbol);

  // Live cTrader spot data — real-time bid/ask/spread/tickCount (no 3s poll delay)
  const ctraderSpot      = useCtraderSpotStore(s => s.spots[symbol] ?? null);
  const ctraderTickCount = useCtraderSpotStore(s => s.tickCounts[symbol] ?? 0);
  const ctraderConnStatus = useCtraderSpotStore(s => s.connStatus);
  const isCtrader = ctraderConnStatus === "streaming" && ctraderSpot !== null;

  const symData      = diag?.perSymbol[symbol];
  // Asset class: prefer server-classified value, fall back to client pattern
  const assetClass   = (symData?.assetClass as AssetClass | undefined) ?? getAssetClass(symbol);
  // Provider: prefer server routing (definitive), fall back to client priority rule
  const liveProvider = isCtrader ? "ctrader" : (symData?.provider ?? diag?.symbolRouting?.[symbol]);
  const providerKey  = (liveProvider ?? "unknown") as DataProvider;
  const providerStat = diag?.providers.find(p => p.name === liveProvider);
  const provOk       = isCtrader ? true : (providerStat?.status === "connected");
  // Routing reason: prefer server-generated, fall back to client derivation
  const reason       = isCtrader
    ? "cTrader ProtoOA real-time spot subscription"
    : (symData?.routingReason ?? getRoutingReason(symbol));

  // Poll /api/feed/diagnostics every 3 s
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`${BASE}/api/feed/diagnostics`);
        if (r.ok && !cancelled) {
          const data = await r.json() as DiagData;
          setDiag(data);
          // Build per-symbol class + reason maps from perSymbol
          const classes: Record<string, string> = {};
          const reasons: Record<string, string> = {};
          for (const [sym, info] of Object.entries(data.perSymbol)) {
            if (info.assetClass)    classes[sym] = info.assetClass;
            if (info.routingReason) reasons[sym] = info.routingReason;
          }
          updateSymbolProviderRouting(data.symbolRouting, classes, reasons);
        }
      } catch { /* ignore network errors */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Count live ticks for the active symbol → tps
  useEffect(() => {
    tickCountRef.current  = 0;
    prevTickTsRef.current = 0;
    const unsub = useTickStore.subscribe((state) => {
      const ts = state.ticks[symbol]?.lastTick ?? 0;
      if (ts !== prevTickTsRef.current) {
        prevTickTsRef.current = ts;
        tickCountRef.current++;
      }
    });
    return unsub;
  }, [symbol]);

  const calcTps = useCallback(() => {
    const now     = Date.now();
    const elapsed = (now - lastTpsRef.current) / 1000;
    if (elapsed < 1) return;
    const delta   = tickCountRef.current - prevCountRef.current;
    setTps(Math.round((delta / elapsed) * 10) / 10);
    prevCountRef.current = tickCountRef.current;
    lastTpsRef.current   = now;
  }, []);

  useEffect(() => {
    const id = setInterval(calcTps, 5000);
    return () => clearInterval(id);
  }, [calcTps]);

  // Last tick time: for cTrader use live receivedAt (no poll lag); others use server data
  const lastTickAt  = isCtrader ? (ctraderSpot?.receivedAt ?? null) : (symData?.lastTickAt ?? null);
  const tickAgeMs   = lastTickAt ? Date.now() - lastTickAt : null;
  const tickAgeStr  = tickAgeMs !== null
    ? tickAgeMs < 60_000  ? `${Math.round(tickAgeMs / 1000)}s ago`
    : tickAgeMs < 3600_000 ? `${Math.round(tickAgeMs / 60_000)}m ago`
    : `${Math.round(tickAgeMs / 3600_000)}h ago`
    : "—";

  const subStatus   = isCtrader ? "Streaming ✓" : (symData?.subscribed ? "Subscribed ✓" : "Not subscribed");
  const provStatus  = isCtrader ? "streaming" : (providerStat?.status ?? "unknown");
  const statusStr   = `${provStatus}  ·  ${subStatus}`;
  const statusColor = (isCtrader || (symData?.subscribed && provOk)) ? "#00FFB4" : "#FF9F43";

  const classColor    = CLASS_COLOR[assetClass]             ?? CLASS_COLOR.unknown;
  const providerColor = PROVIDER_COLOR[providerKey]          ?? PROVIDER_COLOR.unknown;

  return (
    <div
      style={{
        position: "absolute", bottom: 10, left: 10, zIndex: 25,
        fontFamily: "monospace", userSelect: "none", pointerEvents: "auto",
      }}
    >
      {/* Toggle pill */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 9px", borderRadius: 20,
          background: "rgba(0,0,0,0.65)",
          border: `1px solid ${provOk ? "rgba(0,255,140,0.25)" : "rgba(255,100,100,0.25)"}`,
          color: provOk ? "#00FFB4" : "#ff6b6b",
          cursor: "pointer", fontSize: 10, fontFamily: "monospace",
        }}
        title="Feed Diagnostics"
      >
        {provOk ? <Wifi size={9} /> : <WifiOff size={9} />}
        <span style={{ color: "rgba(255,255,255,0.5)" }}>Feed</span>
        <Activity size={9} style={{ opacity: 0.5 }} />
        {open ? <ChevronDown size={9} /> : <ChevronUp size={9} />}
      </button>

      {/* Expanded panel */}
      {open && (
        <div
          style={{
            marginTop: 5, padding: "10px 12px",
            background: "rgba(5,10,8,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 9, backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            minWidth: 256,
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header */}
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, marginBottom: 9, letterSpacing: "0.08em" }}>
            FEED DIAGNOSTICS
          </div>

          {/* Symbol identity */}
          <Row label="Symbol"      value={symbol}                        color="#F3FFF3" />
          <Row label="Asset Class" value={getAssetClassLabel(assetClass)} color={classColor} />
          <Row
            label="Market"
            value={sessionOpen ? "Open ✓" : "Closed ✗"}
            color={sessionOpen ? "#00FFB4" : "#ef4444"}
          />
          {!sessionOpen && (
            <div style={{
              marginTop: 4, padding: "4px 8px", borderRadius: 4,
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
              fontSize: 10, color: "rgba(239,68,68,0.85)", lineHeight: 1.4,
            }}>
              {sessionType === "forex" || sessionType === "commodity"
                ? "Forex/commodity session closed (Sun 22:00–Fri 22:00 UTC)"
                : sessionType === "index"
                ? "Index session closed (Mon–Fri 00:00–22:00 UTC)"
                : "Market session closed"}
            </div>
          )}

          <Divider />

          {/* Provider selection */}
          <Row
            label="Provider"
            value={liveProvider ? getProviderLabel(providerKey) : "—"}
            color={providerColor}
          />
          <Row label="Status" value={statusStr} color={statusColor} />
          {symData?.symbolId && (
            <Row label="Symbol ID" value={symData.symbolId} dimValue />
          )}

          {/* Routing reason */}
          {reason && (
            <div
              style={{
                marginTop: 6, padding: "5px 8px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 5,
              }}
            >
              <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 9, marginBottom: 3, letterSpacing: "0.06em" }}>
                ROUTING REASON
              </div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, lineHeight: 1.5 }}>
                {reason}
              </div>
            </div>
          )}

          <Divider />

          {/* Live tick metrics */}
          <Row
            label="Last Tick"
            value={tickAgeStr}
            color={tickAgeMs !== null && tickAgeMs < 5_000 ? "#00FFB4" : tickAgeMs !== null ? "#FF9F43" : "rgba(255,255,255,0.35)"}
          />
          <Row
            label="Ticks / sec"
            value={tps > 0 ? String(tps) : "—"}
            color={tps > 0 ? "#00FFB4" : "rgba(255,255,255,0.35)"}
          />
          {symData?.lastPrice != null && (
            <Row label="Last Price" value={String(symData.lastPrice)} dimValue />
          )}

          {/* cTrader live bid/ask/spread + cumulative tick counter */}
          {isCtrader && ctraderSpot && (
            <>
              <Divider />
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, marginBottom: 5, letterSpacing: "0.06em" }}>
                CTRADER LIVE FEED
              </div>
              <Row label="Bid"    value={ctraderSpot.bid.toFixed(5)}    color="#4ADE80" />
              <Row label="Ask"    value={ctraderSpot.ask.toFixed(5)}    color="#F87171" />
              <Row label="Spread" value={ctraderSpot.spread.toFixed(5)} dimValue />
              <Row
                label="Tick Count"
                value={ctraderTickCount > 0 ? ctraderTickCount.toLocaleString() : "0"}
                color={ctraderTickCount > 0 ? "#00FFB4" : "rgba(255,255,255,0.35)"}
              />
              <Row
                label="Last Tick At"
                value={ctraderSpot.receivedAt
                  ? new Date(ctraderSpot.receivedAt).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 })
                  : "—"}
                color={tickAgeMs !== null && tickAgeMs < 2_000 ? "#00FFB4" : "#FF9F43"}
              />
            </>
          )}

          {!isCtrader && !symData?.subscribed && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#FF9F43", lineHeight: 1.4 }}>
              Not subscribed — select this symbol in the watchlist to start receiving ticks.
            </div>
          )}

          {/* Provider catalog summary */}
          {diag && (
            <>
              <Divider />
              <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 9, marginBottom: 5, letterSpacing: "0.06em" }}>
                PROVIDER CATALOG
              </div>
              {diag.providers.map(p => {
                const routedCount = Object.values(diag.symbolRouting).filter(v => v === p.name).length;
                const isActive    = p.name === liveProvider;
                return (
                  <div
                    key={p.name}
                    style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", marginBottom: 3,
                      padding: isActive ? "2px 5px" : "2px 0",
                      borderRadius: 4,
                      background: isActive ? "rgba(255,255,255,0.05)" : "transparent",
                    }}
                  >
                    <span style={{ color: isActive ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)", fontSize: 9 }}>
                      {isActive ? "▶ " : ""}{p.displayName ?? p.name}
                    </span>
                    <span style={{
                      color: p.status === "connected" ? "#00FFB4" : "rgba(255,80,80,0.8)",
                      fontSize: 9, fontWeight: 600,
                    }}>
                      {routedCount} syms · {p.status}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
