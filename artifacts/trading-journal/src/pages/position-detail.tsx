import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ChevronLeft, RotateCw, Pencil } from "lucide-react";
import { useSelectedPositionStore } from "@/store/selectedPositionStore";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { useCurrencyStore } from "@/store/currencyStore";

// ─── Design tokens (premium/compact) ─────────────────────────────────────────
const BG      = "#0B0B0C";
const CARD    = "#141414";
const BORDER  = "#252525";
const MUTED   = "#8A8A8E";
const PRIMARY = "#FFFFFF";
const GREEN   = "#30A46C";
const RED     = "#E5484D";
const ORANGE  = "#D9822B";
const RADIUS  = 18;

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

// ─── Small shared bits ────────────────────────────────────────────────────────
function Badge({ children, color, subtle }: { children: React.ReactNode; color?: string; subtle?: boolean }) {
  return (
    <span
      className="text-[11px] font-semibold px-2 py-[3px] rounded-md leading-none"
      style={{
        background: "rgba(255,255,255,0.05)",
        color: color ?? MUTED,
        border: `1px solid ${color ? color + "40" : BORDER}`,
      }}
    >
      {children}
    </span>
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
          style={{ background: CARD, border: `1px solid ${BORDER}`, color: PRIMARY }}
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
  type Row = { label: string; value: string; valueColor?: string };
  const tradeRows: Row[] = [
    { label: "Entry Price",       value: fmtCompact(position.entryPrice) },
    { label: "Mark Price",        value: fmtCompact(livePrice) },
    { label: "Liquidation Price", value: liqPrice   !== null ? fmtCompact(liqPrice)   : "—", valueColor: liqPrice !== null ? ORANGE : undefined },
    { label: "Position Size",     value: `${position.size} ${position.symbol.replace(/USDT$|USD$|PERP$/, "")}` },
    { label: "Position Value",    value: fUSD(posValue) },
    { label: "Margin Used",       value: marginUsed !== null ? fUSD(marginUsed) : "—" },
    { label: "Leverage",          value: position.leverage ? `${position.leverage}x` : "—" },
    { label: "Opened",            value: formatDate(openedAt as string | number | undefined) },
    ...(positionId ? [{ label: "Position ID", value: `#${String(positionId).slice(0, 12)}` }] : []),
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: BG, overflowY: "hidden" }}
    >

      {/* ══════════ HEADER (56px) ═══════════════════════════════════════════ */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5"
        style={{ height: 56, background: BG, borderBottom: `1px solid ${BORDER}` }}
      >
        <button
          onClick={() => { setPosition(null); navigate("/portfolio?tab=positions"); }}
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 32, height: 32, background: "transparent" }}
          aria-label="Back"
        >
          <ChevronLeft size={20} style={{ color: PRIMARY }} />
        </button>

        <span
          className="text-[14px] font-semibold"
          style={{ color: PRIMARY }}
        >
          Position Details
        </span>

        <button
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 32, height: 32, background: "transparent" }}
          aria-label="Refresh"
        >
          <RotateCw size={16} style={{ color: MUTED }} />
        </button>
      </div>

      {/* ══════════ SCROLLABLE BODY ═════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
        <div className="flex flex-col gap-4" style={{ padding: 20 }}>

          {/* ──────────────────── TOP CARD ───────────────────────────────── */}
          <div
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: "14px 16px" }}
          >
            {/* Row 1: symbol + badges */}
            <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
              <span className="text-[16px] font-bold tracking-tight" style={{ color: PRIMARY }}>
                {position.symbol}
              </span>
              <Badge color={sideColor}>{position.side === "Long" ? "LONG" : "SHORT"}</Badge>
              {position.leverage && <Badge>{position.leverage}x</Badge>}
              <Badge>{brokerLabel}</Badge>
            </div>

            {/* Row 2: label */}
            <p className="text-[11px] font-medium uppercase tracking-wide mb-0.5" style={{ color: MUTED }}>
              Unrealized P&amp;L
            </p>

            {/* Row 3: P&L value */}
            <p className="font-bold leading-none tracking-tight" style={{ color: pnlColor, fontSize: 50 }}>
              {fUSD(pnlUsd, true)}
            </p>

            {/* INR + pct row */}
            <p className="text-[13px] font-medium mt-1.5 mb-3" style={{ color: pnlColor }}>
              {fINR(pnlInr, true)}
              <span style={{ color: MUTED, fontWeight: 500 }}> · {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
            </p>

            <div style={{ height: 1, background: BORDER, marginBottom: 12 }} />

            {/* Bottom row: Mark price / Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>
                  Mark Price
                </span>
                <span className="text-[13px] font-semibold" style={{ color: PRIMARY }}>
                  {fmtCompact(livePrice)}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="inline-block w-[6px] h-[6px] rounded-full" style={{ background: GREEN }} />
                <span className="text-[12px] font-medium" style={{ color: GREEN }}>
                  Live
                </span>
              </div>
            </div>
          </div>

          {/* ──────────────────── POSITION DETAILS CARD ──────────────────── */}
          <div
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: RADIUS, overflow: "hidden" }}
          >
            <div style={{ padding: "12px 16px 8px" }}>
              <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: MUTED }}>
                Position Details
              </p>
            </div>

            {tradeRows.map((row, i) => (
              <div key={i} style={{ borderTop: `1px solid ${BORDER}` }}>
                <div
                  className="flex items-center justify-between px-4"
                  style={{ height: 48 }}
                >
                  <span className="text-[14px]" style={{ color: MUTED, fontWeight: 400 }}>
                    {row.label}
                  </span>
                  <span
                    className="text-[18px]"
                    style={{ color: row.valueColor ?? PRIMARY, fontWeight: 600 }}
                  >
                    {row.value}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ──────────────────── RISK MANAGEMENT CARD ───────────────────── */}
          <div
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: 16 }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide mb-3" style={{ color: MUTED }}>
              Risk Management
            </p>

            {/* TP + SL cards */}
            <div className="flex gap-4 mb-4">
              {/* Take Profit card */}
              <div
                className="flex-1 flex flex-col justify-between"
                style={{ height: 80, borderRadius: 12, border: `1px solid ${BORDER}`, background: "#191919", padding: "10px 12px" }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-medium" style={{ color: MUTED }}>Take Profit</p>
                  <Pencil size={12} style={{ color: MUTED }} />
                </div>
                <input
                  type="number"
                  step="any"
                  value={tpValue}
                  onChange={e => setTpValue(e.target.value)}
                  placeholder="Not set"
                  className="w-full bg-transparent outline-none text-[22px] font-semibold"
                  style={{ color: tpValue ? GREEN : MUTED }}
                />
              </div>

              {/* Stop Loss card */}
              <div
                className="flex-1 flex flex-col justify-between"
                style={{ height: 80, borderRadius: 12, border: `1px solid ${BORDER}`, background: "#191919", padding: "10px 12px" }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-medium" style={{ color: MUTED }}>Stop Loss</p>
                  <Pencil size={12} style={{ color: MUTED }} />
                </div>
                <input
                  type="number"
                  step="any"
                  value={slValue}
                  onChange={e => setSlValue(e.target.value)}
                  placeholder="Not set"
                  className="w-full bg-transparent outline-none text-[22px] font-semibold"
                  style={{ color: slValue ? RED : MUTED }}
                />
              </div>
            </div>

            {/* Update TP/SL button */}
            <button
              onClick={handleUpdateTpSl}
              disabled={!canUpdate}
              className="w-full rounded-xl text-[14px] font-semibold active:scale-[0.98] transition-transform"
              style={{
                height: 50,
                background: canUpdate ? "#1F1F1F" : "#161616",
                color:      canUpdate ? PRIMARY   : MUTED,
                border:     `1px solid ${BORDER}`,
                cursor: canUpdate ? "pointer" : "not-allowed",
              }}
            >
              {updating ? "Updating…" : "Update TP / SL"}
            </button>
          </div>

          {/* ──────────────────── CLOSE POSITION BUTTON ──────────────────── */}
          <button
            onClick={handleClose}
            disabled={!canClose}
            className="w-full rounded-xl text-[15px] font-semibold active:scale-[0.98] transition-transform"
            style={{
              height: 52,
              background: canClose ? "#3A1416" : "#221012",
              color:      canClose ? "#FF7A7A" : MUTED,
              border:     `1px solid ${canClose ? "#4A1A1D" : BORDER}`,
              cursor: canClose ? "pointer" : "not-allowed",
            }}
          >
            {closing ? "Closing Position…" : "Close Position"}
          </button>

          {/* Safe-area spacer */}
          <div style={{ height: 8 }} />
        </div>
      </div>
    </div>
  );
}
