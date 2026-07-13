import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AlertTriangle } from "lucide-react";
import { useSelectedPositionStore } from "@/store/selectedPositionStore";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { useCurrencyStore } from "@/store/currencyStore";

// ─── Design tokens (matched to Figma) ────────────────────────────────────────
const BG      = "#0E0E0E";
const SURFACE = "#1A1A1A";
const BORDER  = "#2D2D2D";
const MUTED   = "#777777";
const PRIMARY = "#FFFFFF";
const GREEN   = "#4ADE80";
const RED     = "#EF4444";
const ORANGE  = "#F97316";

const USD_TO_INR_FALLBACK = 85;

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmt(v: number, decimals = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

function fmtCompact(v: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const time = d.toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
    return isToday ? `Today ${time}` : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
  } catch { return "—"; }
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

  const [tpValue,  setTpValue]  = useState("");
  const [slValue,  setSlValue]  = useState("");
  const [closing,  setClosing]  = useState(false);
  const [updating, setUpdating] = useState(false);

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
        <p className="text-[14px] font-semibold" style={{ color: MUTED }}>
          No position selected
        </p>
        <button
          onClick={() => navigate("/portfolio?tab=positions")}
          className="text-[13px] font-bold px-4 py-2.5 rounded-xl active:scale-95 transition-transform"
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

  const isProfit  = pnlUsd >= 0;
  const pnlColor  = isProfit ? GREEN : RED;
  const sideColor = position.side === "Long" ? GREEN : RED;
  const sideBg    = position.side === "Long" ? "rgba(74,222,128,0.15)" : "rgba(239,68,68,0.15)";

  const raw        = position.raw as Record<string, unknown> | null;
  const liqPrice   = raw?.liquidation_price ? Number(raw.liquidation_price) : null;
  const marginUsed = raw?.margin            ? Number(raw.margin)            : null;
  const openedAt   = raw?.created_at ?? raw?.updated_at ?? null;
  const posValue   = position.size * position.entryPrice;
  const positionId = raw?.id ?? raw?.order_id ?? raw?.position_id ?? null;

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

  // ─── Trade detail rows ───────────────────────────────────────────────────────
  type Row = { label: string; value: string; valueColor?: string; bold?: boolean };
  const tradeRows: Row[] = [
    { label: "Entry Price",      value: fmtCompact(position.entryPrice) },
    { label: "Mark Price",       value: fmtCompact(livePrice) },
    { label: "Liquidation Price",value: liqPrice   !== null ? fmtCompact(liqPrice)   : "—", valueColor: liqPrice !== null ? ORANGE : undefined },
    { label: "Position Size",    value: `${position.size} ${position.symbol.replace(/USDT$|USD$|PERP$/, "")}` },
    { label: "Position Value",   value: fUSD(posValue) },
    { label: "Margin Used",      value: marginUsed !== null ? fUSD(marginUsed) : "—" },
    { label: "Leverage",         value: position.leverage ? `${position.leverage}x` : "—" },
    { label: "Opened",           value: formatDate(openedAt as string | number | undefined), bold: true },
    ...(positionId ? [{ label: "Position ID", value: `#${String(positionId).slice(0, 12)}` }] : []),
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
        style={{ height: 56, background: BG }}
      >
        {/* Back button */}
        <button
          onClick={() => { setPosition(null); navigate("/portfolio?tab=positions"); }}
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 40, height: 40, background: SURFACE, border: `1px solid ${BORDER}` }}
          aria-label="Back"
        >
          <span style={{ color: PRIMARY, fontSize: 18, lineHeight: 1 }}>←</span>
        </button>

        <span
          className="text-[15px] font-semibold"
          style={{ color: PRIMARY }}
        >
          Position Details
        </span>

        {/* Refresh button */}
        <button
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 40, height: 40, background: SURFACE, border: `1px solid ${BORDER}` }}
          aria-label="Refresh"
        >
          <span style={{ color: MUTED, fontSize: 16, lineHeight: 1 }}>↻</span>
        </button>
      </div>

      {/* ══════════ SCROLLABLE BODY ═════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
        <div className="px-4 pb-8 flex flex-col gap-3 pt-2">

          {/* ──────────────────── HERO CARD ──────────────────────────────── */}
          <div
            className="rounded-2xl px-4 pt-4 pb-4"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            {/* Symbol row */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span
                className="text-[26px] font-black tracking-tight"
                style={{ color: PRIMARY }}
              >
                {position.symbol}
              </span>

              {/* Long/Short pill */}
              <span
                className="text-[11px] font-bold px-3 py-1 rounded-full"
                style={{
                  background: sideBg,
                  color: sideColor,
                  border: `1px solid ${sideColor}33`,
                }}
              >
                {position.side === "Long" ? "LONG" : "SHORT"}
              </span>

              {/* Leverage chip */}
              {position.leverage && (
                <span
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.07)",
                    color: PRIMARY,
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  {position.leverage}x
                </span>
              )}

              {/* Exchange badge */}
              <span
                className="text-[10px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: MUTED,
                  border: `1px solid ${BORDER}`,
                }}
              >
                {brokerLabel}
              </span>
            </div>

            {/* Unrealized P&L label */}
            <p
              className="text-[10px] font-semibold uppercase tracking-widest mb-1"
              style={{ color: MUTED }}
            >
              Unrealized P&amp;L
            </p>

            {/* Large P&L number */}
            <p
              className="font-black leading-none tracking-tight mb-2"
              style={{ color: pnlColor, fontSize: 52 }}
            >
              {fUSD(pnlUsd, true)}
            </p>

            {/* INR + pct row */}
            <p
              className="text-[14px] font-semibold mb-4"
              style={{ color: pnlColor }}
            >
              {fINR(pnlInr, true)}
              {"  "}
              <span style={{ opacity: 0.7 }}>
                {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
              </span>
            </p>

            {/* Divider */}
            <div style={{ height: 1, background: BORDER, marginBottom: 14 }} />

            {/* Mark Price + Status row */}
            <div className="flex items-end justify-between">
              <div>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
                  style={{ color: MUTED }}
                >
                  Mark Price
                </p>
                <p
                  className="text-[22px] font-bold"
                  style={{ color: PRIMARY }}
                >
                  {fmtCompact(livePrice)}
                </p>
              </div>

              <div className="text-right">
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: MUTED }}
                >
                  Status
                </p>
                <div className="flex items-center justify-end gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: GREEN }}
                  />
                  <span
                    className="text-[15px] font-semibold"
                    style={{ color: GREEN }}
                  >
                    Live
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ──────────────────── TRADE DETAILS CARD ─────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            {/* Section header */}
            <div className="px-4 pt-3.5 pb-3">
              <p
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: MUTED }}
              >
                Position Details
              </p>
            </div>

            {/* Rows */}
            {tradeRows.map((row, i) => (
              <div key={i}>
                {/* Divider */}
                <div style={{ height: 1, background: BORDER, marginLeft: 16 }} />

                <div
                  className="flex items-center justify-between px-4 py-[13px]"
                >
                  <span
                    className="text-[14px]"
                    style={{ color: MUTED, fontWeight: 400 }}
                  >
                    {row.label}
                  </span>
                  <span
                    className="text-[14px]"
                    style={{
                      color: row.valueColor ?? PRIMARY,
                      fontWeight: row.bold ? 700 : 500,
                    }}
                  >
                    {row.value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ──────────────────── RISK MANAGEMENT CARD ───────────────────── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
          >
            {/* Section header */}
            <div className="px-4 pt-3.5 pb-3">
              <p
                className="text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: MUTED }}
              >
                Risk Management
              </p>
            </div>

            {/* TP + SL cards */}
            <div className="px-4 flex gap-3 mb-3">

              {/* Take Profit card */}
              <div
                className="flex-1 rounded-xl p-3 relative"
                style={{
                  background: "rgba(74,222,128,0.07)",
                  border: `1px solid rgba(74,222,128,0.22)`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: GREEN }}
                  >
                    Take Profit
                  </p>
                  {/* Pencil icon */}
                  <span style={{ color: `${GREEN}88`, fontSize: 14 }}>✎</span>
                </div>
                <input
                  type="number"
                  step="any"
                  value={tpValue}
                  onChange={e => setTpValue(e.target.value)}
                  placeholder="Not set"
                  className="w-full bg-transparent outline-none text-[18px] font-bold"
                  style={{
                    color: tpValue ? PRIMARY : `${PRIMARY}55`,
                    caretColor: GREEN,
                  }}
                />
              </div>

              {/* Stop Loss card */}
              <div
                className="flex-1 rounded-xl p-3 relative"
                style={{
                  background: "rgba(239,68,68,0.07)",
                  border: `1px solid rgba(239,68,68,0.22)`,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: RED }}
                  >
                    Stop Loss
                  </p>
                  {/* Pencil icon */}
                  <span style={{ color: `${RED}88`, fontSize: 14 }}>✎</span>
                </div>
                <input
                  type="number"
                  step="any"
                  value={slValue}
                  onChange={e => setSlValue(e.target.value)}
                  placeholder="Not set"
                  className="w-full bg-transparent outline-none text-[18px] font-bold"
                  style={{
                    color: slValue ? PRIMARY : `${PRIMARY}55`,
                    caretColor: RED,
                  }}
                />
              </div>
            </div>

            {/* Update TP/SL button */}
            <div className="px-4 pb-4">
              <button
                onClick={handleUpdateTpSl}
                disabled={!canUpdate}
                className="w-full py-[14px] rounded-xl text-[14px] font-semibold active:scale-[0.98] transition-transform"
                style={{
                  background: canUpdate ? "#2A2A2A" : "#1F1F1F",
                  color:      canUpdate ? PRIMARY   : `${PRIMARY}33`,
                  border:     `1px solid ${BORDER}`,
                  cursor: canUpdate ? "pointer" : "not-allowed",
                }}
              >
                {updating ? "Updating…" : "Update TP / SL"}
              </button>
            </div>
          </div>

          {/* ──────────────────── CLOSE POSITION BUTTON ──────────────────── */}
          <button
            onClick={handleClose}
            disabled={!canClose}
            className="w-full py-[15px] rounded-2xl text-[15px] font-bold active:scale-[0.98] transition-transform"
            style={{
              background: canClose ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.05)",
              color:      canClose ? RED                    : `${RED}44`,
              border:     `1px solid ${canClose ? "rgba(239,68,68,0.30)" : "rgba(239,68,68,0.10)"}`,
              cursor: canClose ? "pointer" : "not-allowed",
            }}
          >
            {closing ? "Closing Position…" : "Close Position"}
          </button>

          {/* Safe-area spacer */}
          <div style={{ height: 16 }} />
        </div>
      </div>
    </div>
  );
}
