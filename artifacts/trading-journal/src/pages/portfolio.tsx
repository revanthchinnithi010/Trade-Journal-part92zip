import { useState, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import {
  TrendingUp, ArrowLeft,
  RefreshCw, ChevronRight, Wallet, Loader2,
  Clock, CheckCircle, XCircle, AlertCircle,
  ArrowUp, ArrowDown, ArrowRight,
} from "lucide-react";
import { useCurrencyStore } from "@/store/currencyStore";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { useListTrades } from "@workspace/api-client-react";
import type { BrokerPosition, BrokerOrder } from "@/types/broker";
import { useDeltaAccount } from "@/store/deltaAccountStore";
import { useCtraderAccount } from "@/store/ctraderAccountStore";
import { useSelectedPositionStore } from "@/store/selectedPositionStore";

const USD_TO_INR_FALLBACK = 85;

function fINR(v: number) {
  const abs = Math.abs(v);
  const s = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  return v < 0 ? `-${s}` : s;
}
function fUSD(v: number) {
  const abs = Math.abs(v);
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  return v < 0 ? `-${s}` : s;
}

function Dots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {Array.from({ length: 8 }).map((_, i) => (
        <span key={i} className="inline-block w-[6px] h-[6px] rounded-full bg-white/25" />
      ))}
    </span>
  );
}

function DualValue({ inr, usd, masked, color, size = "md" }: {
  inr: number; usd: number; masked: boolean; color?: string; size?: "sm" | "md" | "lg";
}) {
  const szMain = size === "lg" ? "text-[26px]" : size === "md" ? "text-[18px]" : "text-[15px]";
  const szSub  = size === "lg" ? "text-[14px]" : size === "md" ? "text-[12px]" : "text-[11px]";
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-black leading-none ${szMain}`} style={{ color: color ?? "rgba(255,255,255,0.92)" }}>
        {masked ? <Dots /> : fINR(inr)}
      </span>
      <span className={`font-semibold text-white/25 ${szSub}`}>
        {masked ? <Dots /> : fUSD(usd)}
      </span>
    </div>
  );
}

function WalletRow({ label, inr, usd, masked, badge, arrow }: {
  label: string; inr: number; usd: number; masked: boolean; badge?: string; arrow?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 py-3.5"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-white/65">{label}</span>
        {badge && (
          <span
            className="text-[9px] font-black px-2 py-0.5 rounded-full"
            style={{ background: "rgba(249,115,22,0.18)", color: "#f97316", border: "1px solid rgba(249,115,22,0.25)" }}
          >
            {badge}
          </span>
        )}
        {arrow && <ChevronRight className="w-3.5 h-3.5 text-white/30" />}
      </div>
      <div className="text-right">
        <p className="text-[14px] font-bold text-white/85">{masked ? <Dots /> : fINR(inr)}</p>
        <p className="text-[11px] text-white/25">{masked ? <Dots /> : fUSD(usd)}</p>
      </div>
    </div>
  );
}

function baseCurrency(symbol: string): string {
  // Strip common quote currencies to get the base (BTC from BTCUSDT, ETH from ETHUSD, etc.)
  const base = symbol.replace(/USDT$|USD$|PERP$|\.P$/, "").replace(/-/g, "");
  // If nothing was stripped (e.g. NAS100, XAUUSD already stripped), return empty
  return base === symbol ? "" : base;
}

function fPrice(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PositionRow({ pos, onTap, isLast }: { pos: BrokerPosition; onTap: () => void; isLast: boolean }) {
  const ticks     = useTickStore(s => s.ticks);
  const symKey    = pos.symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const livePrice = ticks[symKey]?.price ?? pos.markPrice;
  // Prefer server-computed unrealisedPnl; fall back to live-price calculation
  const serverPnl = pos.unrealisedPnl;
  const calcPnl   = pos.side === "Long"
    ? (livePrice - pos.entryPrice) * pos.size
    : (pos.entryPrice - livePrice) * pos.size;
  const pnl      = (typeof serverPnl === "number" && isFinite(serverPnl) && serverPnl !== 0)
    ? serverPnl
    : calcPnl;
  const isPos    = pnl >= 0;
  const pnlColor = "#F0F0F0";
  const unit     = baseCurrency(pos.symbol);

  return (
    <div
      onClick={onTap}
      className="cursor-pointer"
      style={{
        padding: "18px",
        borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.055)",
        WebkitTapHighlightColor: "transparent",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {/* Row 1 — Symbol | direction icon | PNL */}
      <div className="flex items-center justify-between">
        {/* Left: symbol */}
        <span
          className="font-semibold leading-none tracking-tight"
          style={{ fontSize: 15, color: "#F0F0F0", letterSpacing: "0.02em" }}
        >
          {pos.symbol}
        </span>

        {/* Center: direction arrow */}
        <div className="flex-1 flex justify-center">
          {pos.side === "Long"
            ? <ArrowUp  className="w-[18px] h-[18px]" style={{ color: "#35C37A" }} strokeWidth={2.5} />
            : <ArrowDown className="w-[18px] h-[18px]" style={{ color: "#E0524F" }} strokeWidth={2.5} />
          }
        </div>

        {/* Right: live PNL */}
        <span
          className="font-semibold leading-none tabular-nums"
          style={{ fontSize: 15, color: pnlColor }}
        >
          {isPos ? "+" : ""}{fUSD(pnl)}
        </span>
      </div>

      {/* Row 2 — Entry price | size + unit */}
      <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
        <span
          className="font-medium tabular-nums"
          style={{ fontSize: 12, color: "#6B6B6B" }}
        >
          {fPrice(pos.entryPrice)}
        </span>
        <span
          className="font-medium tabular-nums"
          style={{ fontSize: 12, color: "#6B6B6B" }}
        >
          {pos.size}{unit ? ` ${unit}` : ""}
        </span>
      </div>
    </div>
  );
}

function OrderRow({ ord }: { ord: BrokerOrder }) {
  const isBuy = ord.side === "Buy";
  const st = ord.status?.toLowerCase() ?? "";
  const statusColor =
    st.includes("fill") || st.includes("complet") ? "#34d399" :
    st.includes("cancel") ? "#f87171" :
    st.includes("partial") ? "#f97316" : "rgba(255,255,255,0.4)";
  const StatusIcon = st.includes("fill") || st.includes("complet") ? CheckCircle
    : st.includes("cancel") ? XCircle
    : st.includes("partial") ? AlertCircle
    : Clock;

  return (
    <div
      className="px-4 py-3.5 flex items-center justify-between"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[10px] font-black px-1.5 py-0.5 rounded"
            style={{
              background: isBuy ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
              color: isBuy ? "#34d399" : "#f87171",
            }}
          >
            {ord.side.toUpperCase()}
          </span>
          <span className="text-[13px] font-bold text-white">{ord.symbol}</span>
          <span className="text-[10px] text-white/35 font-medium">{ord.orderType}</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-white/40">
          <span>Qty: <span className="text-white/65 font-semibold">{ord.qty}</span></span>
          <span>Price: <span className="text-white/65 font-semibold">{ord.price ? fUSD(ord.price) : "Market"}</span></span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 ml-2">
        <StatusIcon className="w-3.5 h-3.5" style={{ color: statusColor }} />
        <span className="text-[11px] font-semibold capitalize" style={{ color: statusColor }}>{ord.status}</span>
      </div>
    </div>
  );
}

type Tab = "positions" | "orders" | "stop-orders";
const VALID_TABS: Tab[] = ["positions", "orders", "stop-orders"];

// iOS-style segmented control matching the Dashboard header's
// DashboardSegmentedControl (same colors, sizing and CSS-only sliding pill —
// see that component for why the pill is a plain `transform` transition
// rather than a Motion.dev/layoutId animation).
function SegmentedControl({ tabs, active, onChange }: {
  tabs: { id: Tab; label: string; count?: number }[];
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const activeIndex = Math.max(0, tabs.findIndex(t => t.id === active));
  const n = tabs.length;

  return (
    <div
      role="tablist"
      aria-label="Portfolio sections"
      className="relative w-full grid"
      style={{
        gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
        height: 46,
        borderRadius: 12,
        background: "#2A2A2F",
        padding: 4,
        contain: "layout paint",
      }}
    >
      <div
        className="absolute top-1 left-1"
        style={{
          width: `calc(${100 / n}% - 4px)`,
          height: "calc(100% - 8px)",
          borderRadius: 9,
          background: "#050505",
          transform: `translate3d(calc(${activeIndex} * (100% + ${4 / n}px)), 0, 0)`,
          transition: "transform 200ms cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      />

      {tabs.map(t => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.id)}
            className="relative z-10 flex items-center justify-center gap-1.5 text-[14px] font-semibold transition-[color,transform] duration-150 ease-out active:scale-[0.96]"
            style={{ color: selected ? "#FFFFFF" : "#B5B5B5", willChange: "transform" }}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(249,115,22,0.2)", color: "#f97316" }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function Portfolio() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const setPosition  = useSelectedPositionStore(s => s.setPosition);
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(search).get("tab") as Tab | null;
    return t && VALID_TABS.includes(t) ? t : "positions";
  });

  // React to URL changes (e.g. navigating from Dashboard "Show Positions"
  // while the page is already mounted in the background).
  useEffect(() => {
    const t = new URLSearchParams(search).get("tab") as Tab | null;
    if (t && VALID_TABS.includes(t)) setTab(t);
  }, [search]);

  const { data: tradeRes } = useListTrades({ limit: 200 });

  const { positions, orders, connectionStatus, refreshPositions, refreshOrders } = useBrokerStore();

  const deltaAccount   = useDeltaAccount();
  const ctraderAccount = useCtraderAccount();

  const upnlUSD = deltaAccount.unrealizedPnlUSD + ctraderAccount.unrealizedPnlUSD;
  const upnlINR = deltaAccount.toINR(deltaAccount.unrealizedPnlUSD) + ctraderAccount.toINR(ctraderAccount.unrealizedPnlUSD);
  const upPos   = upnlUSD >= 0;

  const openTrades = (tradeRes?.trades ?? []).filter(
    (t) => (t as { exitPrice?: number | null }).exitPrice == null
  );

  const openOrders = orders.filter(o => {
    const s = o.status?.toLowerCase() ?? "";
    return !s.includes("fill") && !s.includes("complet") && !s.includes("cancel");
  });
  const histOrders = orders.filter(o => {
    const s = o.status?.toLowerCase() ?? "";
    return s.includes("fill") || s.includes("complet") || s.includes("cancel");
  });

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: "positions",    label: "Positions",   count: positions.length },
    { id: "orders",       label: "Orders",      count: openOrders.length },
    { id: "stop-orders",  label: "Stop Orders" },
  ];

  return (
    <div className="flex flex-col h-full" style={{ background: "#000000" }}>

      {/* ── Secondary header — back-arrow left, title centred, spacer right ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5"
        style={{ height: 56, borderBottom: "1px solid #262626" }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 32, height: 32, background: "transparent" }}
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: "#E8E8E8" }} />
        </button>
        <span className="font-semibold" style={{ color: "#F3F3F3", fontSize: 17 }}>
          Portfolio
        </span>
        <div style={{ width: 32 }} />
      </div>

      {/* ── Scroll area ── */}
      <div
        className="flex-1 overflow-y-auto space-y-3 pb-4 mx-auto w-full max-w-[1400px] px-4 md:px-6 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >

        {/* ══ Segmented control — sticky while scrolling ══ */}
        <div className="sticky top-0 z-10 pt-3 pb-2 -mx-4 px-4 md:-mx-6 md:px-6" style={{ background: "#000000" }}>
          <SegmentedControl tabs={TABS} active={tab} onChange={setTab} />
        </div>

        {/* ══ POSITIONS ══ */}
        {tab === "positions" && (
          <>
            {/* UPNL summary */}
            <div className="px-4 py-3.5" style={{ background: "#151515", border: "1px solid #252525", borderRadius: 20 }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "#6B6B6B" }}>Unrealized PnL</p>
              <DualValue inr={upnlINR} usd={upnlUSD} masked={false} color={upPos ? "#35C37A" : "#E0524F"} size="md" />
            </div>

            {/* Broker positions */}
            {connectionStatus === "connecting" ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2" style={{ background: "#151515", border: "1px solid #252525", borderRadius: 20 }}>
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#6B6B6B" }} />
                <p className="text-[12px]" style={{ color: "#6B6B6B" }}>Loading positions…</p>
              </div>
            ) : positions.length > 0 ? (
              <div>
                {positions.map((pos, i) => (
                  <PositionRow key={pos.id} pos={pos} isLast={i === positions.length - 1} onTap={() => { setPosition(pos); navigate("/position-detail"); }} />
                ))}
              </div>
            ) : openTrades.length > 0 ? (
              <div className="overflow-hidden" style={{ background: "#151515", border: "1px solid #252525", borderRadius: 20 }}>
                {openTrades.map((t, i) => {
                  const sym    = (t as { symbol?: string }).symbol ?? "—";
                  const side   = (t as { side?: string }).side ?? "";
                  const ep     = (t as { entryPrice?: number }).entryPrice ?? 0;
                  const isLong = side === "long";
                  return (
                    <div key={i} className="px-4 py-3.5" style={{ borderBottom: "1px solid #252525" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-black px-2 py-0.5 rounded-md"
                            style={{
                              background: isLong ? "rgba(53,195,122,0.12)" : "rgba(224,82,79,0.12)",
                              color: isLong ? "#35C37A" : "#E0524F",
                            }}
                          >
                            {isLong ? "▲ LONG" : "▼ SHORT"}
                          </span>
                          <span className="text-[14px] font-black" style={{ color: "#E8E8E8" }}>{sym}</span>
                        </div>
                        <span className="text-[12px] font-bold" style={{ color: "#5A5A5A" }}>Entry: {ep.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 gap-1.5" style={{ background: "#151515", border: "1px solid #252525", borderRadius: 20 }}>
                <TrendingUp className="w-8 h-8 mb-1" style={{ color: "#2A2A2A" }} />
                <p className="text-[13px] font-semibold" style={{ color: "#5A5A5A" }}>No Open Positions</p>
                <p className="text-[11px]" style={{ color: "#3A3A3A" }}>Your active trades will appear here.</p>
              </div>
            )}
          </>
        )}

        {/* ══ ORDERS ══ */}
        {tab === "orders" && (
          <>
            <div className="px-4 py-3.5 flex items-center justify-between" style={{ background: "#151515", border: "1px solid #252525", borderRadius: 20 }}>
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: "#6B6B6B" }}>Open</p>
                  <p className="text-[18px] font-black" style={{ color: "#E8E8E8" }}>{openOrders.length}</p>
                </div>
                <div className="w-px h-8" style={{ background: "#252525" }} />
                <div>
                  <p className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: "#6B6B6B" }}>History</p>
                  <p className="text-[18px] font-black" style={{ color: "#5A5A5A" }}>{histOrders.length}</p>
                </div>
              </div>
              <button
                onClick={() => refreshOrders()}
                className="w-8 h-8 flex items-center justify-center rounded-xl"
                style={{ background: "#1E1E1E", border: "1px solid #2E2E2E" }}
              >
                <RefreshCw className="w-3.5 h-3.5" style={{ color: "#5A5A5A" }} />
              </button>
            </div>

            {orders.length > 0 ? (
              <div className="overflow-hidden" style={{ background: "#151515", border: "1px solid #252525", borderRadius: 20 }}>
                {orders.map(ord => <OrderRow key={ord.id} ord={ord} />)}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-2" style={{ background: "#151515", border: "1px solid #252525", borderRadius: 20 }}>
                <Wallet className="w-8 h-8" style={{ color: "#2A2A2A" }} />
                <p className="text-[13px] font-semibold" style={{ color: "#5A5A5A" }}>No orders</p>
                <p className="text-[11px]" style={{ color: "#3A3A3A" }}>Active and recent orders will appear here</p>
              </div>
            )}
          </>
        )}

        {/* ══ STOP ORDERS ══ */}
        {tab === "stop-orders" && (
          <div className="flex flex-col items-center justify-center py-14 gap-2" style={{ background: "#151515", border: "1px solid #252525", borderRadius: 20 }}>
            <AlertCircle className="w-8 h-8" style={{ color: "#2A2A2A" }} />
            <p className="text-[13px] font-semibold" style={{ color: "#5A5A5A" }}>No stop orders</p>
            <p className="text-[11px]" style={{ color: "#3A3A3A" }}>Stop loss & take profit orders will appear here</p>
          </div>
        )}

      </div>

    </div>
  );
}
