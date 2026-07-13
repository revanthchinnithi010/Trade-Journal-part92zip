import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, RefreshCw, AlertTriangle, Pencil } from "lucide-react";
import { useSelectedPositionStore } from "@/store/selectedPositionStore";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { useCurrencyStore } from "@/store/currencyStore";

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG      = "#050505";
const SURFACE = "#101113";
const BORDER  = "#232323";
const MUTED   = "#4b4b54";
const DIM     = "#707078";
const PRIMARY = "#e2e2e8";

const USD_TO_INR_FALLBACK = 85;

// ─── Formatters ───────────────────────────────────────────────────────────────
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

function formatDate(ts: string | number | undefined): string {
  if (!ts) return "—";
  try {
    const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
    const mo = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const ti = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${mo}, ${ti}`;
  } catch { return "—"; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Section header inside a card */
function CardHeader({ label }: { label: string }) {
  return (
    <div className="px-4 pt-4 pb-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.10em]"
        style={{ color: MUTED }}
      >
        {label}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PositionDetail() {
  const [, navigate] = useLocation();

  const position    = useSelectedPositionStore(s => s.position);
  const setPosition = useSelectedPositionStore(s => s.setPosition);

  const closePosition    = useBrokerStore(s => s.closePosition);
  const placeOrder       = useBrokerStore(s => s.placeOrder);
  const connectionStatus = useBrokerStore(s => s.connectionStatus);
  const activeBrokerId   = useBrokerStore(s => s.activeAccount?.brokerId ?? "");

  const ticks = useTickStore(s => s.ticks);
  const xr    = useCurrencyStore(s => s.exchangeRate) || USD_TO_INR_FALLBACK;

  const [tpValue,    setTpValue]    = useState("");
  const [slValue,    setSlValue]    = useState("");
  const [closing,    setClosing]    = useState(false);
  const [updating,   setUpdating]   = useState(false);
  const [tpFocused,  setTpFocused]  = useState(false);
  const [slFocused,  setSlFocused]  = useState(false);

  useEffect(() => {
    if (!position) return;
    const raw = position.raw as Record<string, unknown> | null;
    setTpValue(raw?.take_profit ? String(raw.take_profit) : "");
    setSlValue(raw?.stop_loss   ? String(raw.stop_loss)   : "");
  }, [position?.id]);

  // ─── Empty state ────────────────────────────────────────────────────────────
  if (!position) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-4"
        style={{ background: BG }}
      >
        <AlertTriangle className="w-8 h-8" style={{ color: MUTED }} />
        <p className="text-[14px] font-semibold" style={{ color: DIM }}>
          No position selected
        </p>
        <button
          onClick={() => navigate("/portfolio?tab=positions")}
          className="text-[13px] font-bold px-4 py-2 rounded-xl active:scale-95 transition-transform"
          style={{ background: SURFACE, border: `1px solid ${BORDER}`, color: PRIMARY }}
        >
          ← Back to Portfolio
        </button>
      </div>
    );
  }

  // ─── Derived values ─────────────────────────────────────────────────────────
  const symKey    = position.symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const livePrice = ticks[symKey]?.price ?? position.markPrice;

  const pnlUsd = position.side === "Long"
    ? (livePrice - position.entryPrice) * position.size
    : (position.entryPrice - livePrice) * position.size;
  const pnlInr = pnlUsd * xr;
  const pnlPct = position.entryPrice > 0
    ? (Math.abs(pnlUsd) / (position.entryPrice * position.size)) * 100 * (pnlUsd >= 0 ? 1 : -1)
    : 0;

  const isProfit   = pnlUsd >= 0;
  const pnlColor   = isProfit ? "#22c55e" : "#ef4444";
  const sideColor  = position.side === "Long" ? "#22c55e" : "#ef4444";
  const sideBg     = position.side === "Long" ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)";
  const sideBorder = position.side === "Long" ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)";

  const raw        = position.raw as Record<string, unknown> | null;
  const liqPrice   = raw?.liquidation_price ? Number(raw.liquidation_price) : null;
  const marginUsed = raw?.margin            ? Number(raw.margin)            : null;
  const openedAt   = raw?.created_at ?? raw?.updated_at ?? null;
  const posValue   = position.size * position.entryPrice;

  const brokerLabel =
    activeBrokerId === "delta"   ? "Delta Exchange" :
    activeBrokerId === "ctrader" ? "cTrader"        :
    activeBrokerId === "mt5"     ? "MetaTrader 5"   : "Exchange";

  const canUpdate = (!!tpValue || !!slValue) && !updating;
  const canClose  = !closing && connectionStatus === "connected";

  // ─── Handlers ───────────────────────────────────────────────────────────────
  async function handleClose() {
    if (closing || connectionStatus !== "connected") return;
    setClosing(true);
    try {
      await closePosition(position);
      setPosition(null);
      navigate("/portfolio?tab=positions");
    } catch { /* toast handled by broker service */ }
    finally { setClosing(false); }
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
    } catch { /* toast handled by broker service */ }
    finally { setUpdating(false); }
  }

  // ─── Stat grid rows ─────────────────────────────────────────────────────────
  type StatCell = { label: string; value: string; color?: string };
  const statRows: [StatCell, StatCell][] = [
    [
      { label: "Entry Price",    value: fmt(position.entryPrice) },
      { label: "Mark Price",     value: fmt(livePrice) },
    ],
    [
      { label: "Liquidation",    value: liqPrice   !== null ? fmt(liqPrice)         : "—", color: liqPrice !== null ? "#f97316" : undefined },
      { label: "Position Size",  value: String(position.size) },
    ],
    [
      { label: "Position Value", value: fUSD(posValue) },
      { label: "Margin Used",    value: marginUsed !== null ? fUSD(marginUsed) : "—" },
    ],
    [
      { label: "Leverage",       value: position.leverage ? `${position.leverage}×` : "—" },
      { label: "Opened",         value: formatDate(openedAt as string | number | undefined) },
    ],
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: BG, overflowY: "hidden" }}
    >

      {/* ══════════ HEADER ══════════════════════════════════════════════════ */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4"
        style={{ height: 56, borderBottom: `1px solid ${BORDER}`, background: BG }}
      >
        <button
          onClick={() => { setPosition(null); navigate("/portfolio?tab=positions"); }}
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 36, height: 36, border: `1px solid ${BORDER}`, background: SURFACE, color: PRIMARY }}
          aria-label="Back"
        >
          <ArrowLeft className="w-[17px] h-[17px]" />
        </button>

        <span
          className="text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{ color: DIM }}
        >
          Position Details
        </span>

        <button
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 36, height: 36, border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED }}
          aria-label="Refresh"
        >
          <RefreshCw className="w-[13px] h-[13px]" />
        </button>
      </div>

      {/* ══════════ SCROLLABLE BODY ═════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>

        {/* ────────────────── HERO CARD ──────────────────────────────────── */}
        <div className="px-4 pt-4">
          <div
            className="rounded-[18px] p-5"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >

            {/* Symbol + pills */}
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <span
                className="text-[20px] font-black tracking-tight"
                style={{ color: PRIMARY }}
              >
                {position.symbol}
              </span>

              {/* Long/Short */}
              <span
                className="text-[9px] font-black px-2 py-0.5 rounded-md tracking-[0.08em]"
                style={{ background: sideBg, color: sideColor, border: `1px solid ${sideBorder}` }}
              >
                {position.side === "Long" ? "LONG" : "SHORT"}
              </span>

              {/* Leverage */}
              {position.leverage && (
                <span
                  className="text-[9px] font-bold px-2 py-0.5 rounded-md tracking-[0.06em]"
                  style={{ background: "rgba(255,255,255,0.05)", color: DIM, border: `1px solid ${BORDER}` }}
                >
                  {position.leverage}×
                </span>
              )}

              {/* Exchange badge — pushed right */}
              <span
                className="ml-auto text-[9px] font-semibold px-2.5 py-1 rounded-md tracking-[0.06em] uppercase"
                style={{ background: "rgba(255,255,255,0.04)", color: MUTED, border: `1px solid ${BORDER}` }}
              >
                {brokerLabel}
              </span>
            </div>

            {/* Unrealized P&L */}
            <p
              className="text-[9px] font-semibold uppercase tracking-[0.12em] mb-1.5"
              style={{ color: MUTED }}
            >
              Unrealized P&amp;L
            </p>
            <p
              className="text-[38px] font-black leading-none tracking-tight"
              style={{ color: pnlColor }}
            >
              {fUSD(pnlUsd, true)}
            </p>

            {/* INR + ROI row */}
            <div className="flex items-center gap-2.5 mt-2 mb-5">
              <span
                className="text-[13px] font-semibold"
                style={{ color: `${pnlColor}99` }}
              >
                {fINR(pnlInr, true)}
              </span>
              <span
                className="text-[10px] font-black px-1.5 py-0.5 rounded-[5px]"
                style={{
                  background: isProfit ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                  color: pnlColor,
                }}
              >
                {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
              </span>
            </div>

            {/* Thin divider */}
            <div style={{ height: 1, background: BORDER }} />

            {/* Mark Price + Status */}
            <div className="flex items-center justify-between mt-4">
              <div>
                <p
                  className="text-[9px] font-semibold uppercase tracking-[0.12em] mb-1.5"
                  style={{ color: MUTED }}
                >
                  Mark Price
                </p>
                <p className="text-[19px] font-bold" style={{ color: PRIMARY }}>
                  {fmt(livePrice)}
                </p>
              </div>

              <div className="text-right">
                <p
                  className="text-[9px] font-semibold uppercase tracking-[0.12em] mb-1.5"
                  style={{ color: MUTED }}
                >
                  Status
                </p>
                <div className="flex items-center justify-end gap-1.5">
                  {/* Pulsing dot via CSS animation */}
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: "#22c55e", boxShadow: "0 0 0 0 #22c55e40",
                      animation: "pulse-dot 2s ease-in-out infinite" }}
                  />
                  <span className="text-[13px] font-semibold" style={{ color: "#22c55e" }}>
                    Live
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ────────────────── STATISTICS CARD ───────────────────────────── */}
        <div className="px-4 pt-3">
          <div
            className="rounded-[18px] overflow-hidden"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <CardHeader label="Position Details" />

            {statRows.map(([left, right], ri) => (
              <div
                key={ri}
                className="flex"
                style={{
                  borderBottom: ri < statRows.length - 1 ? `1px solid ${BORDER}` : undefined,
                }}
              >
                {/* Left cell */}
                <div
                  className="flex-1 px-4 py-3.5"
                  style={{ borderRight: `1px solid ${BORDER}` }}
                >
                  <p
                    className="text-[9px] font-semibold uppercase tracking-[0.10em] mb-1.5"
                    style={{ color: MUTED }}
                  >
                    {left.label}
                  </p>
                  <p
                    className="text-[14px] font-bold"
                    style={{ color: left.color ?? PRIMARY }}
                  >
                    {left.value}
                  </p>
                </div>

                {/* Right cell */}
                <div className="flex-1 px-4 py-3.5">
                  <p
                    className="text-[9px] font-semibold uppercase tracking-[0.10em] mb-1.5"
                    style={{ color: MUTED }}
                  >
                    {right.label}
                  </p>
                  <p
                    className="text-[14px] font-bold"
                    style={{ color: right.color ?? PRIMARY }}
                  >
                    {right.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ────────────────── RISK MANAGEMENT ───────────────────────────── */}
        <div className="px-4 pt-3">
          <div
            className="rounded-[18px] overflow-hidden"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <CardHeader label="Risk Management" />

            {/* TP + SL inputs side by side */}
            <div
              className="flex"
              style={{ borderBottom: `1px solid ${BORDER}` }}
            >
              {/* Take Profit */}
              <div
                className="flex-1 px-4 py-4 transition-colors"
                style={{
                  borderRight:    `1px solid ${BORDER}`,
                  background: tpFocused ? "rgba(34,197,94,0.04)" : "transparent",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p
                    className="text-[9px] font-semibold uppercase tracking-[0.10em]"
                    style={{ color: tpFocused ? "#22c55e" : MUTED }}
                  >
                    Take Profit
                  </p>
                  <Pencil
                    className="w-[11px] h-[11px]"
                    style={{ color: tpFocused ? "#22c55e" : MUTED }}
                  />
                </div>
                <input
                  type="number"
                  step="any"
                  value={tpValue}
                  onChange={e => setTpValue(e.target.value)}
                  onFocus={() => setTpFocused(true)}
                  onBlur={() => setTpFocused(false)}
                  placeholder="Not set"
                  className="w-full bg-transparent outline-none text-[17px] font-bold"
                  style={{
                    color:       tpValue ? "#22c55e" : DIM,
                    caretColor:  "#22c55e",
                  }}
                />
              </div>

              {/* Stop Loss */}
              <div
                className="flex-1 px-4 py-4 transition-colors"
                style={{
                  background: slFocused ? "rgba(239,68,68,0.04)" : "transparent",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p
                    className="text-[9px] font-semibold uppercase tracking-[0.10em]"
                    style={{ color: slFocused ? "#ef4444" : MUTED }}
                  >
                    Stop Loss
                  </p>
                  <Pencil
                    className="w-[11px] h-[11px]"
                    style={{ color: slFocused ? "#ef4444" : MUTED }}
                  />
                </div>
                <input
                  type="number"
                  step="any"
                  value={slValue}
                  onChange={e => setSlValue(e.target.value)}
                  onFocus={() => setSlFocused(true)}
                  onBlur={() => setSlFocused(false)}
                  placeholder="Not set"
                  className="w-full bg-transparent outline-none text-[17px] font-bold"
                  style={{
                    color:      slValue ? "#ef4444" : DIM,
                    caretColor: "#ef4444",
                  }}
                />
              </div>
            </div>

            {/* Update TP/SL button */}
            <div className="px-4 py-4">
              <button
                onClick={handleUpdateTpSl}
                disabled={!canUpdate}
                className="w-full py-[14px] rounded-[12px] text-[13px] font-bold active:scale-[0.98] transition-transform"
                style={{
                  background: canUpdate
                    ? "rgba(255,255,255,0.07)"
                    : "rgba(255,255,255,0.03)",
                  color:  canUpdate ? PRIMARY : MUTED,
                  border: `1px solid ${canUpdate ? "rgba(255,255,255,0.14)" : BORDER}`,
                  cursor: canUpdate ? "pointer" : "not-allowed",
                }}
              >
                {updating ? "Updating…" : "Update TP / SL"}
              </button>
            </div>
          </div>
        </div>

        {/* ────────────────── CLOSE POSITION ────────────────────────────── */}
        <div className="px-4 pt-3 pb-4">
          <button
            onClick={handleClose}
            disabled={!canClose}
            className="w-full py-[15px] rounded-[18px] text-[14px] font-black active:scale-[0.98] transition-transform"
            style={{
              background: canClose
                ? "rgba(239,68,68,0.10)"
                : "rgba(239,68,68,0.04)",
              color:  canClose ? "#ef4444" : "rgba(239,68,68,0.30)",
              border: `1px solid ${canClose ? "rgba(239,68,68,0.22)" : "rgba(239,68,68,0.08)"}`,
              cursor: canClose ? "pointer" : "not-allowed",
            }}
          >
            {closing ? "Closing Position…" : "Close Position"}
          </button>
        </div>

        {/* Safe-area bottom spacer */}
        <div style={{ height: 32 }} />
      </div>

      {/* Pulse dot keyframe — injected once */}
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
