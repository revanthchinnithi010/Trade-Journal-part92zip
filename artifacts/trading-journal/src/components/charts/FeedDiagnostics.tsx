import { useState, useEffect, useRef, useCallback } from "react";
import {
  getAssetClass, getDataProvider,
  getAssetClassLabel, getProviderLabel,
  type AssetClass, type DataProvider,
} from "@/lib/assetClass";
import { useTickStore } from "@/store/tickStore";
import { Activity, Wifi, WifiOff, ChevronDown, ChevronUp } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface ProviderStat {
  name:        string;
  displayName: string;
  status:      string;
  tickCount:   number;
  lastTickAt:  number | null;
  subscriptions: string[];
}

interface SymbolDiag {
  provider:    string | undefined;
  subscribed:  boolean;
  lastTickAt:  number | null;
  lastPrice:   number | null;
  lastTickAgo: number | null;
}

interface DiagData {
  providers:    ProviderStat[];
  perSymbol:    Record<string, SymbolDiag>;
  subscriptions: string[];
  totalTicks:   number;
  ts:           number;
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

const PROVIDER_COLOR: Record<DataProvider, string> = {
  delta:   "#8B5CF6",
  ctrader: "#F59E0B",
  unknown: "rgba(255,255,255,0.35)",
};

function Row({ label, value, color = "rgba(255,255,255,0.8)" }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 4 }}>
      <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 10, flexShrink: 0 }}>{label}</span>
      <span style={{ color, fontSize: 11, fontWeight: 600, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

export function FeedDiagnostics({ symbol }: Props) {
  const [open, setOpen]   = useState(false);
  const [diag, setDiag]   = useState<DiagData | null>(null);
  const [tps,  setTps]    = useState<number>(0);

  const tickCountRef   = useRef(0);
  const lastTpsRef     = useRef(Date.now());
  const prevCountRef   = useRef(0);
  const prevTickTsRef  = useRef(0);

  const assetClass     = getAssetClass(symbol);
  const provider       = getDataProvider(symbol);
  const symData        = diag?.perSymbol[symbol];
  const providerStat   = diag?.providers.find(p => p.name === provider);
  const provOk         = providerStat?.status === "connected";

  // Poll /api/feed/diagnostics every 3 s
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`${BASE}/api/feed/diagnostics`);
        if (r.ok && !cancelled) setDiag(await r.json() as DiagData);
      } catch { /* ignore network errors */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Count live ticks for the active symbol → derive tps
  // tickStore uses plain Zustand (no subscribeWithSelector), so we subscribe
  // to the whole state and check if the symbol's ts changed.
  useEffect(() => {
    tickCountRef.current = 0;
    prevTickTsRef.current = 0;
    const unsub = useTickStore.subscribe((state) => {
      const ts = state.ticks[symbol]?.ts ?? 0;
      if (ts !== prevTickTsRef.current) {
        prevTickTsRef.current = ts;
        tickCountRef.current++;
      }
    });
    return unsub;
  }, [symbol]);

  // Recalculate tps every 5 s
  const calcTps = useCallback(() => {
    const now     = Date.now();
    const elapsed = (now - lastTpsRef.current) / 1000;
    if (elapsed < 1) return;
    const delta   = tickCountRef.current - prevCountRef.current;
    const rate    = Math.round((delta / elapsed) * 10) / 10;
    setTps(rate);
    prevCountRef.current = tickCountRef.current;
    lastTpsRef.current   = now;
  }, []);

  useEffect(() => {
    const id = setInterval(calcTps, 5000);
    return () => clearInterval(id);
  }, [calcTps]);

  // Format last-tick age
  const lastTickAt  = symData?.lastTickAt ?? null;
  const tickAgeMs   = lastTickAt ? Date.now() - lastTickAt : null;
  const tickAgeStr  = tickAgeMs !== null
    ? tickAgeMs < 60_000
      ? `${Math.round(tickAgeMs / 1000)}s ago`
      : `${Math.round(tickAgeMs / 60_000)}m ago`
    : "—";

  const subStatus  = symData?.subscribed ? "Subscribed ✓" : "Not subscribed";
  const provStatus = providerStat?.status ?? "unknown";
  const statusStr  = `${provStatus}  ·  ${subStatus}`;
  const statusColor = symData?.subscribed && provOk ? "#00FFB4" : "#FF9F43";

  return (
    <div
      style={{
        position: "absolute",
        bottom: 10,
        left: 10,
        zIndex: 25,
        fontFamily: "monospace",
        userSelect: "none",
        pointerEvents: "auto",
      }}
    >
      {/* Toggle pill */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "3px 9px",
          borderRadius: 20,
          background:  "rgba(0,0,0,0.65)",
          border:      `1px solid ${provOk ? "rgba(0,255,140,0.25)" : "rgba(255,100,100,0.25)"}`,
          color:       provOk ? "#00FFB4" : "#ff6b6b",
          cursor:      "pointer",
          fontSize:    10,
          fontFamily:  "monospace",
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
            marginTop: 5,
            padding: "10px 12px",
            background: "rgba(5,10,8,0.88)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 9,
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            minWidth: 240,
            boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, marginBottom: 8, letterSpacing: "0.08em" }}>
            FEED DIAGNOSTICS
          </div>

          <Row label="Selected Symbol" value={symbol}                         color="#F3FFF3" />
          <Row label="Asset Class"     value={getAssetClassLabel(assetClass)} color={CLASS_COLOR[assetClass]} />
          <Row label="Data Provider"   value={getProviderLabel(provider)}     color={PROVIDER_COLOR[provider]} />
          <Row label="Status"          value={statusStr}                      color={statusColor} />

          <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "7px 0" }} />

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
            <Row label="Last Price" value={String(symData.lastPrice)} color="rgba(255,255,255,0.7)" />
          )}

          {!symData?.subscribed && (
            <div style={{ marginTop: 7, fontSize: 10, color: "#FF9F43", lineHeight: 1.4 }}>
              Symbol not yet subscribed — select it in the watchlist to start receiving ticks.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
