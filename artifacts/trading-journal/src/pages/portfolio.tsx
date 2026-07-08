import { useState } from "react";
import {
  Eye, EyeOff, TrendingUp, TrendingDown,
  RefreshCw, ChevronRight, Wallet, Loader2,
  Clock, CheckCircle, XCircle, AlertCircle,
} from "lucide-react";
import { useCurrencyStore } from "@/store/currencyStore";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { useListTrades } from "@workspace/api-client-react";
import type { BrokerPosition, BrokerOrder } from "@/types/broker";
import { useDeltaAccount } from "@/store/deltaAccountStore";
import { useCtraderAccount } from "@/store/ctraderAccountStore";
import AccountCard from "@/components/portfolio/AccountCard";

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

function PositionRow({ pos }: { pos: BrokerPosition }) {
  const ticks = useTickStore(s => s.ticks);
  const xr    = useCurrencyStore(s => s.exchangeRate) || USD_TO_INR_FALLBACK;
  const symKey = pos.symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const livePrice = ticks[symKey]?.price ?? pos.markPrice;
  const pnl = pos.side === "Long"
    ? (livePrice - pos.entryPrice) * pos.size
    : (pos.entryPrice - livePrice) * pos.size;
  const pos_ = pnl >= 0;
  return (
    <div
      className="px-4 py-3.5"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-black px-2 py-0.5 rounded-md"
            style={{
              background: pos.side === "Long" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
              color: pos.side === "Long" ? "#34d399" : "#f87171",
            }}
          >
            {pos.side === "Long" ? "▲ LONG" : "▼ SHORT"}
          </span>
          <span className="text-[14px] font-black text-white">{pos.symbol}</span>
        </div>
        <span className={`text-[13px] font-black ${pos_ ? "text-emerald-400" : "text-red-400"}`}>
          {pos_ ? "+" : ""}{fUSD(pnl)}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Entry", val: pos.entryPrice.toFixed(2) },
          { label: "Mark", val: livePrice.toFixed(2), hi: true },
          { label: "Size", val: String(pos.size) },
          { label: "Lev", val: pos.leverage ? `${pos.leverage}x` : "—" },
        ].map(({ label, val, hi }) => (
          <div key={label}>
            <p className="text-[9px] font-semibold uppercase tracking-wider text-white/30 mb-0.5">{label}</p>
            <p className={`text-[12px] font-bold ${hi ? "text-emerald-300" : "text-white/75"}`}>{val}</p>
          </div>
        ))}
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

type Tab = "balances" | "positions" | "orders" | "stop-orders";

export default function Portfolio() {
  const [tab, setTab] = useState<Tab>("balances");
  const [masked, setMasked] = useState(false);

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
    { id: "balances",     label: "Balances" },
    { id: "positions",    label: "Positions",   count: positions.length },
    { id: "orders",       label: "Orders",      count: openOrders.length },
    { id: "stop-orders",  label: "Stop Orders" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 pb-4 mx-auto w-full max-w-[1400px] px-4 md:px-6">
      {/* ── Tabs ──
          Back navigation + page title now live in the persistent global header
          (Layout.tsx) so they never disappear during the Dashboard↔Portfolio
          transition. Tabs sit directly below the header now that the
          Main/Isolated toggle has been removed. */}
      <div
        className="flex gap-0 mt-3 mb-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="relative flex items-center gap-1.5 px-3 pb-2.5 text-[12px] font-semibold transition-colors"
            style={{ color: tab === t.id ? "#ffffff" : "rgba(255,255,255,0.35)" }}
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
            {tab === t.id && (
              <span
                className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                style={{ background: "#f97316" }}
              />
            )}
          </button>
        ))}
        {/* history icon */}
        <button className="ml-auto pb-2.5 pr-1">
          <Clock className="w-4 h-4 text-white/25" />
        </button>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto space-y-3" style={{ scrollbarWidth: "none" }}>

        {/* ══ BALANCES ══ */}
        {tab === "balances" && (
          <>
            {/* Mask toggle */}
            <div className="flex items-center justify-end px-1">
              <button
                onClick={() => setMasked(m => !m)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-white/40 hover:text-white/65 transition-colors"
              >
                {masked ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {masked ? "Show balances" : "Hide balances"}
              </button>
            </div>

            {/* Two broker account cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AccountCard account={deltaAccount} masked={masked} index={0} />
              <AccountCard account={ctraderAccount} masked={masked} index={1} />
            </div>
          </>
        )}

        {/* ══ POSITIONS ══ */}
        {tab === "positions" && (
          <>
            {/* UPNL summary */}
            <div className="glass-card px-4 py-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-1">Unrealized PnL</p>
                <DualValue inr={upnlINR} usd={upnlUSD} masked={masked} color={upPos ? "#34d399" : "#f87171"} size="md" />
              </div>
              <button
                onClick={() => refreshPositions()}
                className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-white/[0.07]"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <RefreshCw className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>

            {/* Broker positions */}
            {connectionStatus === "connecting" ? (
              <div className="glass-card flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-white/30" />
                <p className="text-[12px] text-white/35">Loading positions…</p>
              </div>
            ) : positions.length > 0 ? (
              <div className="glass-card overflow-hidden">
                {positions.map(pos => <PositionRow key={pos.id} pos={pos} />)}
              </div>
            ) : openTrades.length > 0 ? (
              <div className="glass-card overflow-hidden">
                {openTrades.map((t, i) => {
                  const sym    = (t as { symbol?: string }).symbol ?? "—";
                  const side   = (t as { side?: string }).side ?? "";
                  const ep     = (t as { entryPrice?: number }).entryPrice ?? 0;
                  const isLong = side === "long";
                  return (
                    <div key={i} className="px-4 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-black px-2 py-0.5 rounded-md"
                            style={{
                              background: isLong ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                              color: isLong ? "#34d399" : "#f87171",
                            }}
                          >
                            {isLong ? "▲ LONG" : "▼ SHORT"}
                          </span>
                          <span className="text-[14px] font-black text-white">{sym}</span>
                        </div>
                        <span className="text-[12px] font-bold text-white/40">Entry: {ep.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="glass-card flex flex-col items-center justify-center py-12 gap-2">
                <TrendingUp className="w-8 h-8 text-white/15" />
                <p className="text-[13px] font-semibold text-white/30">No open positions</p>
                <p className="text-[11px] text-white/20">Connect a broker to see live positions</p>
              </div>
            )}
          </>
        )}

        {/* ══ ORDERS ══ */}
        {tab === "orders" && (
          <>
            <div className="glass-card px-4 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold mb-0.5">Open</p>
                  <p className="text-[18px] font-black text-white">{openOrders.length}</p>
                </div>
                <div className="w-px h-8 bg-white/[0.07]" />
                <div>
                  <p className="text-[10px] text-white/35 uppercase tracking-widest font-semibold mb-0.5">History</p>
                  <p className="text-[18px] font-black text-white/55">{histOrders.length}</p>
                </div>
              </div>
              <button
                onClick={() => refreshOrders()}
                className="w-8 h-8 flex items-center justify-center rounded-xl"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <RefreshCw className="w-3.5 h-3.5 text-white/40" />
              </button>
            </div>

            {orders.length > 0 ? (
              <div className="glass-card overflow-hidden">
                {orders.map(ord => <OrderRow key={ord.id} ord={ord} />)}
              </div>
            ) : (
              <div className="glass-card flex flex-col items-center justify-center py-12 gap-2">
                <Wallet className="w-8 h-8 text-white/15" />
                <p className="text-[13px] font-semibold text-white/30">No orders</p>
                <p className="text-[11px] text-white/20">Active and recent orders will appear here</p>
              </div>
            )}
          </>
        )}

        {/* ══ STOP ORDERS ══ */}
        {tab === "stop-orders" && (
          <div className="glass-card flex flex-col items-center justify-center py-14 gap-2">
            <AlertCircle className="w-8 h-8 text-white/15" />
            <p className="text-[13px] font-semibold text-white/30">No stop orders</p>
            <p className="text-[11px] text-white/20">Stop loss & take profit orders will appear here</p>
          </div>
        )}

      </div>
    </div>
  );
}
