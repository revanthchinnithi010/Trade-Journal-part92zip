import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, ChevronLeft, RotateCw, Trash2, ChevronDown } from "lucide-react";
import { useSelectedPositionStore } from "@/store/selectedPositionStore";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { useCurrencyStore } from "@/store/currencyStore";

// ─── Design tokens (premium institutional / grayscale-first) ────────────────
const BG        = "#000000";
const CARD      = "#151515";
const BORDER    = "#252525";
const DIVIDER   = "#262626";
const MUTED     = "#8A8A8A";   // labels
const VALUE     = "#E8E8E8";   // values (never pure white)
const PRIMARY   = "#E8E8E8";
const TITLE     = "#F3F3F3";   // screen title
const GREEN     = "#35C37A";
const RED       = "#E0524F";
const ORANGE    = "#C6862F";
const RADIUS    = 20;
const CARD_SHADOW = "0 1px 2px rgba(0,0,0,0.3)";
const FONT      = "'Inter', system-ui, -apple-system, sans-serif";

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
function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="text-[12px] font-semibold leading-none inline-flex items-center"
      style={{
        height: 32,
        borderRadius: 16,
        padding: "0 14px",
        background: "rgba(255,255,255,0.04)",
        color: color ?? MUTED,
        border: `1px solid ${color ? color + "35" : BORDER}`,
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

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
    finally { setClosing(false); setShowCloseConfirm(false); }
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
      style={{ background: BG, overflowY: "hidden", fontFamily: FONT }}
    >

      {/* ══════════ HEADER ═══════════════════════════════════════════ */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5"
        style={{ height: 56, background: BG, borderBottom: `1px solid ${DIVIDER}` }}
      >
        <button
          onClick={() => { setPosition(null); navigate("/portfolio?tab=positions"); }}
          className="flex items-center justify-center rounded-full active:scale-95 transition-transform"
          style={{ width: 32, height: 32, background: "transparent" }}
          aria-label="Back"
        >
          <ChevronLeft size={20} style={{ color: VALUE }} />
        </button>

        <span
          className="font-semibold"
          style={{ color: TITLE, fontSize: 17 }}
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
      <div className="flex-1 overflow-y-auto pd-scroll-hide" style={{ overscrollBehavior: "contain" }}>
        <div className="flex flex-col gap-4" style={{ padding: 20 }}>

          {/* ──────────────────── TOP CARD ───────────────────────────────── */}
          <div
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: "18px 20px", boxShadow: CARD_SHADOW }}
          >
            {/* Row 1: symbol + pills */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="font-bold" style={{ color: VALUE, fontSize: 22, letterSpacing: "-0.3px" }}>
                {position.symbol}
              </span>
              <Badge color={sideColor}>{position.side === "Long" ? "LONG" : "SHORT"}</Badge>
              {position.leverage && <Badge>{position.leverage}x</Badge>}
            </div>

            {/* Row 2: label */}
            <p className="font-medium uppercase tracking-wide mb-1" style={{ color: MUTED, fontSize: 12 }}>
              Unrealized P&amp;L
            </p>

            {/* Row 3: P&L value */}
            <p className="font-bold leading-none" style={{ color: pnlColor, fontSize: 26 }}>
              {fUSD(pnlUsd, true)}
            </p>

            {/* INR + pct row */}
            <p className="font-medium mt-2 mb-3" style={{ color: pnlColor, fontSize: 13 }}>
              {fINR(pnlInr, true)}
              <span style={{ color: MUTED, fontWeight: 500 }}> · {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%</span>
            </p>

            <div style={{ height: 1, background: DIVIDER, marginTop: 10, marginBottom: 10 }} />

            {/* Bottom row: Mark price / Status — stacked label-over-value blocks */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium uppercase tracking-wide mb-1" style={{ color: MUTED, fontSize: 11 }}>
                  Mark Price
                </p>
                <p className="font-semibold" style={{ color: VALUE, fontSize: 15 }}>
                  {fmtCompact(livePrice)}
                </p>
              </div>

              <div className="text-right">
                <p className="font-medium uppercase tracking-wide mb-1" style={{ color: MUTED, fontSize: 11 }}>
                  Status
                </p>
                <div className="flex items-center justify-end gap-1.5">
                  <span className="inline-block w-[6px] h-[6px] rounded-full" style={{ background: GREEN }} />
                  <span className="font-semibold" style={{ color: GREEN, fontSize: 14 }}>
                    Live
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ──────────────────── POSITION DETAILS CARD (collapsible) ─────── */}
          <div
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: RADIUS, overflow: "hidden", boxShadow: CARD_SHADOW }}
          >
            <button
              onClick={() => setDetailsOpen(o => !o)}
              className="w-full flex items-center justify-between"
              style={{ padding: "14px 20px", background: "transparent" }}
              aria-expanded={detailsOpen}
            >
              <span className="font-medium uppercase tracking-wide" style={{ color: MUTED, fontSize: 11 }}>
                Position Details
              </span>
              <ChevronDown
                size={16}
                style={{
                  color: MUTED,
                  transform: detailsOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>

            {detailsOpen && (
              <div>
                {tradeRows.map((row, i) => (
                  <div key={i} style={{ borderTop: `1px solid ${DIVIDER}` }}>
                    <div
                      className="flex items-center justify-between px-5"
                      style={{ height: 54 }}
                    >
                      <span className="font-normal" style={{ color: "#797979", fontSize: 13 }}>
                        {row.label}
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: row.valueColor ?? "#D6D6D6", fontSize: 15 }}
                      >
                        {row.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ──────────────────── CLOSE POSITION BUTTON ──────────────────── */}
          <button
            onClick={() => setShowCloseConfirm(true)}
            disabled={!canClose}
            className="w-full rounded-xl font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
            style={{
              height: 54,
              fontSize: 15,
              background: canClose ? "#3B1114" : "#221012",
              color:      canClose ? "#FF6767" : MUTED,
              border:     `1px solid ${canClose ? "#6C2A30" : BORDER}`,
              cursor: canClose ? "pointer" : "not-allowed",
            }}
          >
            <Trash2 size={15} />
            {closing ? "Closing Position…" : "Close Position"}
          </button>

          {/* Safe-area spacer */}
          <div style={{ height: 8 }} />
        </div>
      </div>

      {/* ══════════ CLOSE CONFIRMATION MODAL ═══════════════════════════════ */}
      {showCloseConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.6)", padding: 20 }}
          onClick={() => !closing && setShowCloseConfirm(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full"
            style={{ maxWidth: 340, background: CARD, border: `1px solid ${BORDER}`, borderRadius: RADIUS, padding: 20, boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
          >
            <p className="font-semibold" style={{ color: TITLE, fontSize: 16, marginBottom: 6 }}>
              Close Position?
            </p>
            <p className="font-normal" style={{ color: MUTED, fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
              You're about to close <span style={{ color: VALUE, fontWeight: 600 }}>{position.symbol}</span> at market price.
              Current P&amp;L:{" "}
              <span style={{ color: pnlColor, fontWeight: 600 }}>{fUSD(pnlUsd, true)}</span>. This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseConfirm(false)}
                disabled={closing}
                className="flex-1 rounded-xl font-semibold active:scale-[0.98] transition-transform"
                style={{ height: 48, fontSize: 14, background: "#1D1D1D", color: "#F2F2F2", border: `1px solid ${BORDER}` }}
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                disabled={closing}
                className="flex-1 rounded-xl font-semibold active:scale-[0.98] transition-transform"
                style={{
                  height: 48,
                  fontSize: 14,
                  background: "#3B1114",
                  color: "#FF6767",
                  border: "1px solid #6C2A30",
                  cursor: closing ? "not-allowed" : "pointer",
                }}
              >
                {closing ? "Closing…" : "Confirm Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
