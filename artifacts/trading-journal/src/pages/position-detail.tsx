import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { useSelectedPositionStore } from "@/store/selectedPositionStore";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { useCurrencyStore } from "@/store/currencyStore";

const USD_TO_INR_FALLBACK = 85;

function fmt(v: number, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

function fUSD(v: number, sign = false) {
  const abs = Math.abs(v);
  const str = "$" + fmt(abs);
  if (sign && v > 0) return "+" + str;
  if (v < 0) return "-" + str;
  return str;
}

function fINR(v: number, sign = false) {
  const abs = Math.abs(v);
  const str = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(abs);
  if (sign && v > 0) return "+" + str;
  if (v < 0) return "-" + str;
  return str;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-black uppercase tracking-[0.12em] mb-3"
      style={{ color: "rgba(255,255,255,0.25)" }}
    >
      {children}
    </p>
  );
}

function DetailRow({
  label, value, valueColor, sub,
}: {
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <div
      className="flex items-center justify-between py-3.5"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <span className="text-[13px] font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>
        {label}
      </span>
      <div className="text-right">
        <span
          className="text-[14px] font-bold"
          style={{ color: valueColor ?? "rgba(255,255,255,0.88)" }}
        >
          {value}
        </span>
        {sub && (
          <p className="text-[11px] font-medium mt-0.5" style={{ color: "rgba(255,255,255,0.28)" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function EditableField({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex-1">
      <p className="text-[10px] font-black uppercase tracking-[0.1em] mb-2" style={{ color: "rgba(255,255,255,0.28)" }}>
        {label}
      </p>
      <input
        type="number"
        step="any"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "—"}
        className="w-full bg-transparent outline-none text-[15px] font-bold"
        style={{
          color: "rgba(255,255,255,0.85)",
          borderBottom: "1.5px solid rgba(255,255,255,0.12)",
          paddingBottom: 6,
          caretColor: "#a78bfa",
        }}
      />
    </div>
  );
}

export default function PositionDetail() {
  const [, navigate] = useLocation();
  const position    = useSelectedPositionStore(s => s.position);
  const setPosition = useSelectedPositionStore(s => s.setPosition);

  const closePosition    = useBrokerStore(s => s.closePosition);
  const placeOrder       = useBrokerStore(s => s.placeOrder);
  const connectionStatus = useBrokerStore(s => s.connectionStatus);

  const ticks = useTickStore(s => s.ticks);
  const xr    = useCurrencyStore(s => s.exchangeRate) || USD_TO_INR_FALLBACK;

  const [tpValue, setTpValue] = useState("");
  const [slValue, setSlValue] = useState("");
  const [closing,  setClosing]  = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!position) return;
    const raw = position.raw as Record<string, unknown> | null;
    setTpValue(raw?.take_profit ? String(raw.take_profit) : "");
    setSlValue(raw?.stop_loss   ? String(raw.stop_loss)   : "");
  }, [position?.id]);

  if (!position) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-3"
        style={{ background: "#000000" }}
      >
        <AlertTriangle className="w-8 h-8" style={{ color: "rgba(255,255,255,0.18)" }} />
        <p className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.35)" }}>
          No position selected
        </p>
        <button
          onClick={() => navigate("/portfolio?tab=positions")}
          className="text-[13px] font-bold mt-1"
          style={{ color: "#a78bfa" }}
        >
          Back to Portfolio
        </button>
      </div>
    );
  }

  const symKey     = position.symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const livePrice  = ticks[symKey]?.price ?? position.markPrice;
  const pnlUsd     = position.side === "Long"
    ? (livePrice - position.entryPrice) * position.size
    : (position.entryPrice - livePrice) * position.size;
  const pnlInr     = pnlUsd * xr;
  const pnlPct     = position.entryPrice > 0
    ? (Math.abs(pnlUsd) / (position.entryPrice * position.size)) * 100 * (pnlUsd >= 0 ? 1 : -1)
    : 0;

  const isProfit   = pnlUsd >= 0;
  const pnlColor   = isProfit ? "#34d399" : "#f87171";
  const sideColor  = position.side === "Long" ? "#34d399" : "#f87171";

  const raw = position.raw as Record<string, unknown> | null;
  const liqPrice   = raw?.liquidation_price ? Number(raw.liquidation_price) : null;
  const marginUsed = raw?.margin            ? Number(raw.margin)            : null;

  async function handleClose() {
    if (closing || connectionStatus !== "connected") return;
    setClosing(true);
    try {
      await closePosition(position);
      setPosition(null);
      navigate("/portfolio?tab=positions");
    } catch {
      /* toast handled by broker service */
    } finally {
      setClosing(false);
    }
  }

  async function handleUpdateTpSl() {
    if (updating) return;
    const tp = tpValue ? parseFloat(tpValue) : undefined;
    const sl = slValue ? parseFloat(slValue) : undefined;
    if (tp === undefined && sl === undefined) return;
    setUpdating(true);
    try {
      await placeOrder({
        symbol:     position.symbol,
        side:       position.side === "Long" ? "Sell" : "Buy",
        orderType:  "Limit",
        qty:        position.size,
        price:      tp,
        stopPrice:  sl,
        reduceOnly: true,
      });
    } catch {
      /* toast handled by broker service */
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "#000000", overflowY: "hidden" }}
    >
      {/* ── Own header (hidden layout header) ── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4"
        style={{
          height:       56,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background:   "#000000",
        }}
      >
        <button
          onClick={() => { setPosition(null); navigate("/portfolio?tab=positions"); }}
          className="flex items-center justify-center rounded-full transition-all duration-150"
          style={{
            width:   38,
            height:  38,
            border:  "1.5px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)",
            color:   "rgba(255,255,255,0.75)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
          aria-label="Back"
        >
          <ArrowLeft className="w-[18px] h-[18px]" />
        </button>

        <span className="text-[14px] font-bold" style={{ color: "rgba(255,255,255,0.75)", letterSpacing: "0.01em" }}>
          Position Details
        </span>

        <button
          className="flex items-center justify-center rounded-full transition-all duration-150"
          style={{
            width:   38,
            height:  38,
            border:  "1.5px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            color:   "rgba(255,255,255,0.35)",
          }}
          aria-label="Refresh"
        >
          <RefreshCw className="w-[15px] h-[15px]" />
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>

        {/* Hero — Symbol + PnL ───────────────────────────────────────── */}
        <div
          className="px-5 pt-6 pb-7"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-2.5 mb-4">
            {position.side === "Long"
              ? <TrendingUp  className="w-4 h-4" style={{ color: sideColor }} />
              : <TrendingDown className="w-4 h-4" style={{ color: sideColor }} />
            }
            <span className="text-[22px] font-black tracking-tight" style={{ color: "#ffffff" }}>
              {position.symbol}
            </span>
            <span
              className="text-[10px] font-black px-2.5 py-1 rounded-full"
              style={{
                background: position.side === "Long" ? "rgba(52,211,153,0.10)" : "rgba(248,113,113,0.10)",
                color:      sideColor,
                border:     `1px solid ${sideColor}22`,
              }}
            >
              {position.side === "Long" ? "LONG" : "SHORT"}
            </span>
          </div>

          {/* PnL display */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>
                Unrealised P&amp;L
              </p>
              <p className="text-[32px] font-black leading-none" style={{ color: pnlColor }}>
                {fUSD(pnlUsd, true)}
              </p>
              <p className="text-[13px] font-semibold mt-1" style={{ color: `${pnlColor}aa` }}>
                {fINR(pnlInr, true)}
                <span className="ml-2 text-[12px]" style={{ color: `${pnlColor}80` }}>
                  {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                </span>
              </p>
            </div>

            {/* Live price pill */}
            <div
              className="flex flex-col items-end gap-1"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.1em]" style={{ color: "rgba(255,255,255,0.22)" }}>
                Live Price
              </p>
              <p className="text-[18px] font-black" style={{ color: "rgba(255,255,255,0.88)" }}>
                {fmt(livePrice)}
              </p>
            </div>
          </div>
        </div>

        {/* Position details ─────────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-2">
          <SectionLabel>Trade Details</SectionLabel>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <DetailRow label="Entry Price"   value={fmt(position.entryPrice)} />
            <DetailRow label="Mark Price"    value={fmt(livePrice)} valueColor="rgba(255,255,255,0.65)" />
            <DetailRow label="Size"          value={String(position.size)} />
            <DetailRow label="Leverage"      value={position.leverage ? `${position.leverage}×` : "—"} />
            {marginUsed !== null && (
              <DetailRow
                label="Margin Used"
                value={fUSD(marginUsed)}
                sub={fINR(marginUsed * xr)}
              />
            )}
            {liqPrice !== null && (
              <DetailRow
                label="Liquidation Price"
                value={fmt(liqPrice)}
                valueColor="#f97316"
              />
            )}
          </div>
        </div>

        {/* TP / SL ──────────────────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-6">
          <SectionLabel>Take Profit &amp; Stop Loss</SectionLabel>
          <div
            className="rounded-2xl p-4"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="flex gap-6">
              <EditableField
                label="Take Profit"
                value={tpValue}
                onChange={setTpValue}
                placeholder="Not set"
              />
              <div className="w-px" style={{ background: "rgba(255,255,255,0.07)" }} />
              <EditableField
                label="Stop Loss"
                value={slValue}
                onChange={setSlValue}
                placeholder="Not set"
              />
            </div>

            <button
              onClick={handleUpdateTpSl}
              disabled={updating || (!tpValue && !slValue)}
              className="w-full mt-4 py-3 rounded-xl text-[13px] font-bold transition-all duration-150"
              style={{
                background: (tpValue || slValue) && !updating
                  ? "rgba(167,139,250,0.12)"
                  : "rgba(255,255,255,0.04)",
                color: (tpValue || slValue) && !updating
                  ? "#a78bfa"
                  : "rgba(255,255,255,0.20)",
                border: (tpValue || slValue) && !updating
                  ? "1px solid rgba(167,139,250,0.25)"
                  : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {updating ? "Updating…" : "Update TP / SL"}
            </button>
          </div>
        </div>

        {/* Spacer for fixed bottom bar */}
        <div style={{ height: 96 }} />
      </div>

      {/* ── Fixed bottom actions ── */}
      <div
        className="flex-shrink-0 px-4 py-4 flex gap-3"
        style={{
          borderTop:  "1px solid rgba(255,255,255,0.07)",
          background: "rgba(0,0,0,0.95)",
          backdropFilter: "blur(20px)",
        }}
      >
        <button
          onClick={() => { setPosition(null); navigate("/portfolio?tab=positions"); }}
          className="flex-1 py-3.5 rounded-xl text-[13px] font-bold transition-all duration-150"
          style={{
            background: "rgba(255,255,255,0.05)",
            color:      "rgba(255,255,255,0.55)",
            border:     "1px solid rgba(255,255,255,0.08)",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
        >
          Back
        </button>
        <button
          onClick={handleClose}
          disabled={closing || connectionStatus !== "connected"}
          className="flex-1 py-3.5 rounded-xl text-[13px] font-black transition-all duration-150"
          style={{
            background: closing || connectionStatus !== "connected"
              ? "rgba(248,113,113,0.06)"
              : "rgba(248,113,113,0.14)",
            color: closing || connectionStatus !== "connected"
              ? "rgba(248,113,113,0.4)"
              : "#f87171",
            border: "1px solid rgba(248,113,113,0.22)",
          }}
          onMouseEnter={e => {
            if (!closing && connectionStatus === "connected")
              (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.22)";
          }}
          onMouseLeave={e => {
            if (!closing && connectionStatus === "connected")
              (e.currentTarget as HTMLElement).style.background = "rgba(248,113,113,0.14)";
          }}
        >
          {closing ? "Closing…" : "Close Position"}
        </button>
      </div>
    </div>
  );
}
