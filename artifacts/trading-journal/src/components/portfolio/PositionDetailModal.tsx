import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Loader2, AlertTriangle } from "lucide-react";
import { useTickStore } from "@/store/tickStore";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerPosition } from "@/types/broker";

/* ── Formatters ─────────────────────────────────────────────────── */
function fUSD(v: number, dp = 2) {
  const s = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  }).format(Math.abs(v));
  return v < 0 ? `-${s}` : s;
}
function fNum(v: number, dp = 4) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  }).format(v);
}
function fPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fDate(v: unknown): string {
  if (!v) return "—";
  try {
    const d = new Date(v as string | number);
    if (isNaN(d.getTime())) return "—";
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    return isToday
      ? `Today ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
      : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}
function rawGet(raw: unknown, ...keys: string[]): unknown {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  for (const k of keys) {
    if (r[k] !== undefined && r[k] !== null) return r[k];
  }
  return undefined;
}

/* ── Token palette ─────────────────────────────────────────────── */
const T = {
  bg:        "#000000",
  surface:   "#0A0A0A",
  card:      "#111111",
  border:    "rgba(255,255,255,0.06)",
  divider:   "rgba(255,255,255,0.05)",
  text:      "#FFFFFF",
  secondary: "#8E8E93",
  positive:  "#22C55E",
  negative:  "#EF4444",
  accent:    "#F59E0B",
};

/* ── Types ──────────────────────────────────────────────────────── */
interface Props {
  pos: BrokerPosition | null;
  onClose: () => void;
}
type ConfirmState = "idle" | "confirming" | "closing" | "done";

/* ═══════════════════════════════════════════════════════════════════
   Main component
═══════════════════════════════════════════════════════════════════ */
export default function PositionDetailModal({ pos, onClose }: Props) {
  const ticks = useTickStore(s => s.ticks);
  const { closePosition } = useBrokerStore();

  /* live price */
  const symKey    = pos ? pos.symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD" : "";
  const livePrice = pos ? (ticks[symKey]?.price ?? pos.markPrice) : 0;

  /* pnl */
  const pnl = pos
    ? pos.side === "Long"
      ? (livePrice - pos.entryPrice) * pos.size
      : (pos.entryPrice - livePrice) * pos.size
    : 0;
  const pnlPos = pnl >= 0;

  /* raw extras */
  const raw              = pos?.raw ?? {};
  const liquidationPrice = rawGet(raw, "liquidation_price", "liqPrice", "liquidationPrice");
  const margin           = rawGet(raw, "margin", "initialMargin", "initial_margin");
  const openTime         = rawGet(raw, "created_at", "entry_time", "openedAt", "createdAt");
  const rawTp            = rawGet(raw, "take_profit", "takeProfit", "tp");
  const rawSl            = rawGet(raw, "stop_loss", "stopLoss", "sl");

  const marginNum     = margin ? parseFloat(String(margin)) : null;
  const roi           = marginNum && marginNum > 0 ? (pnl / marginNum) * 100 : null;
  const positionValue = pos ? livePrice * pos.size : 0;
  const isLong        = pos?.side === "Long";

  /* TP / SL editing */
  const [tpValue, setTpValue] = useState(rawTp ? String(rawTp) : "");
  const [slValue, setSlValue] = useState(rawSl ? String(rawSl) : "");
  const [tpEdit, setTpEdit]   = useState(false);
  const [slEdit, setSlEdit]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const tpRef = useRef<HTMLInputElement>(null);
  const slRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (tpEdit) tpRef.current?.focus(); }, [tpEdit]);
  useEffect(() => { if (slEdit) slRef.current?.focus(); }, [slEdit]);

  /* reset on new position */
  useEffect(() => {
    setTpValue(rawTp ? String(rawTp) : "");
    setSlValue(rawSl ? String(rawSl) : "");
    setTpEdit(false);
    setSlEdit(false);
    setConfirmState("idle");
  }, [pos?.id]);

  const saveTPSL = useCallback(async () => {
    if (!pos) return;
    setSaving(true);
    try {
      const { placeOrder } = useBrokerStore.getState();
      await placeOrder({
        symbol: pos.symbol,
        side:   (pos.side === "Long" ? "Sell" : "Buy") as "Buy" | "Sell",
        orderType: "Market",
        qty:    String(pos.size),
        ...(tpValue ? { takeProfit: tpValue } : {}),
        ...(slValue ? { stopLoss: slValue } : {}),
      });
    } catch { /* silent */ }
    setSaving(false);
    setTpEdit(false);
    setSlEdit(false);
  }, [pos, tpValue, slValue]);

  /* close position flow */
  const [confirmState, setConfirmState] = useState<ConfirmState>("idle");
  const handleClosePosition = useCallback(async () => {
    if (!pos) return;
    if (confirmState === "idle") { setConfirmState("confirming"); return; }
    if (confirmState !== "confirming") return;
    setConfirmState("closing");
    try {
      await closePosition(pos);
      setConfirmState("done");
      setTimeout(onClose, 1000);
    } catch { setConfirmState("idle"); }
  }, [pos, confirmState, closePosition, onClose]);

  /* backdrop / keyboard */
  const onBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);
  useEffect(() => {
    if (pos) { document.body.style.overflow = "hidden"; }
    return () => { document.body.style.overflow = ""; };
  }, [!!pos]);

  /* ── detail rows ── */
  const rows = pos ? [
    { label: "Entry Price",     value: fUSD(pos.entryPrice, 2) },
    { label: "Mark Price",      value: fUSD(pos.markPrice,  2), accent: true },
    { label: "Current Price",   value: fUSD(livePrice,      2) },
    { label: "Quantity",        value: `${fNum(pos.size, 4)} ${pos.symbol.replace(/USDT?|PERP/, "")}` },
    ...(marginNum ? [{ label: "Margin Used",   value: fUSD(marginNum) }] : []),
    { label: "Position Value",  value: fUSD(positionValue) },
    ...(roi !== null ? [{ label: "ROI",   value: fPct(roi), color: roi >= 0 ? T.positive : T.negative }] : []),
    ...(liquidationPrice ? [{ label: "Liquidation", value: fUSD(parseFloat(String(liquidationPrice)), 2), color: T.negative }] : []),
    { label: "Opened",          value: fDate(openTime) },
  ] : [];

  /* ─────────────────────────────────────────────────────────────── */
  const modal = (
    <AnimatePresence>
      {pos && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.20 }}
          onClick={onBackdrop}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{   opacity: 0, scale: 0.96,  y: 8  }}
            transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.75 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 480,
              maxHeight: "calc(100dvh - 32px)",
              overflowY: "auto",
              scrollbarWidth: "none",
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 24,
              backdropFilter: "blur(40px)",
              WebkitBackdropFilter: "blur(40px)",
            }}
          >

            {/* ════════════ HEADER ════════════ */}
            <div style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between",
              padding: "24px 24px 0",
            }}>
              {/* Left — symbol + subtitle + badges */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
                    {pos.symbol}
                  </span>
                  {/* LONG/SHORT badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
                    background: isLong ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                    color:      isLong ? T.positive : T.negative,
                    letterSpacing: "0.05em",
                  }}>
                    {isLong ? "LONG" : "SHORT"}
                  </span>
                  {/* Leverage badge */}
                  {pos.leverage && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 20,
                      background: "rgba(255,255,255,0.06)",
                      color: T.secondary,
                      letterSpacing: "0.03em",
                    }}>
                      {pos.leverage}×
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 12, color: T.secondary, fontWeight: 400, letterSpacing: "0.01em" }}>
                  Perpetual Futures
                </span>
              </div>

              {/* Right — PnL pill + close */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexShrink: 0 }}>
                {/* PnL pill */}
                <div style={{
                  padding: "6px 12px", borderRadius: 12,
                  background: pnlPos ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
                  border: `1px solid ${pnlPos ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.16)"}`,
                  textAlign: "right",
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: pnlPos ? T.positive : T.negative, lineHeight: 1 }}>
                    {pnlPos ? "+" : ""}{fUSD(pnl)}
                  </div>
                  {roi !== null && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: pnlPos ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)", marginTop: 2 }}>
                      {fPct(roi)}
                    </div>
                  )}
                </div>

                {/* Close button */}
                <button
                  onClick={onClose}
                  style={{
                    width: 32, height: 32, borderRadius: 10, border: `1px solid ${T.border}`,
                    background: "rgba(255,255,255,0.04)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                >
                  <X style={{ width: 13, height: 13, color: T.secondary }} />
                </button>
              </div>
            </div>

            {/* ════════════ UNREALIZED PNL STRIP ════════════ */}
            <div style={{
              margin: "20px 24px 0",
              padding: "14px 16px",
              background: T.card,
              borderRadius: 14,
              border: `1px solid ${T.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 11, color: T.secondary, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                  Unrealized PNL
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: pnlPos ? T.positive : T.negative, letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {pnlPos ? "+" : ""}{fUSD(pnl)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: T.secondary, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                  Status
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#22C55E" }}>
                  ● Open
                </div>
              </div>
            </div>

            {/* ════════════ TRADE DETAILS ════════════ */}
            <div style={{ padding: "20px 24px 0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.secondary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                Trade Details
              </div>
              <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${T.border}`, background: T.card }}>
                {rows.map((row, i) => (
                  <div
                    key={row.label}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 16px",
                      borderBottom: i < rows.length - 1 ? `1px solid ${T.divider}` : "none",
                    }}
                  >
                    <span style={{ fontSize: 13, color: T.secondary, fontWeight: 400 }}>{row.label}</span>
                    <span style={{
                      fontSize: 13, fontWeight: 600,
                      color: (row as { color?: string }).color ?? T.text,
                    }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ════════════ RISK MANAGEMENT ════════════ */}
            <div style={{ padding: "20px 24px 0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.secondary, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
                Risk Management
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 14, overflow: "hidden", border: `1px solid ${T.border}`, background: T.card }}>

                {/* Take Profit row */}
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.divider}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: tpEdit ? 10 : 0 }}>
                    <div>
                      <div style={{ fontSize: 13, color: T.text, fontWeight: 500, marginBottom: 2 }}>Take Profit</div>
                      {!tpEdit && (
                        <div style={{ fontSize: 12, color: tpValue ? T.positive : T.secondary }}>
                          {tpValue ? fUSD(parseFloat(tpValue)) : "Not set"}
                        </div>
                      )}
                    </div>
                    {!tpEdit ? (
                      <button
                        onClick={() => { setTpEdit(true); setSlEdit(false); }}
                        style={{
                          fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 8,
                          background: "rgba(255,255,255,0.05)",
                          border: `1px solid ${T.border}`,
                          color: T.text, cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        onClick={() => setTpEdit(false)}
                        style={{
                          fontSize: 11, color: T.secondary, background: "none", border: "none", cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {tpEdit && (
                    <input
                      ref={tpRef}
                      type="number"
                      value={tpValue}
                      onChange={e => setTpValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Escape") setTpEdit(false); }}
                      placeholder="Enter take profit price"
                      style={{
                        width: "100%", background: "rgba(255,255,255,0.04)",
                        border: `1px solid rgba(34,197,94,0.30)`, borderRadius: 10,
                        padding: "10px 12px", fontSize: 15, fontWeight: 600,
                        color: T.text, outline: "none", boxSizing: "border-box",
                        caretColor: T.positive,
                      }}
                    />
                  )}
                </div>

                {/* Stop Loss row */}
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: slEdit ? 10 : 0 }}>
                    <div>
                      <div style={{ fontSize: 13, color: T.text, fontWeight: 500, marginBottom: 2 }}>Stop Loss</div>
                      {!slEdit && (
                        <div style={{ fontSize: 12, color: slValue ? T.negative : T.secondary }}>
                          {slValue ? fUSD(parseFloat(slValue)) : "Not set"}
                        </div>
                      )}
                    </div>
                    {!slEdit ? (
                      <button
                        onClick={() => { setSlEdit(true); setTpEdit(false); }}
                        style={{
                          fontSize: 12, fontWeight: 600, padding: "5px 14px", borderRadius: 8,
                          background: "rgba(255,255,255,0.05)",
                          border: `1px solid ${T.border}`,
                          color: T.text, cursor: "pointer",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        onClick={() => setSlEdit(false)}
                        style={{
                          fontSize: 11, color: T.secondary, background: "none", border: "none", cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {slEdit && (
                    <input
                      ref={slRef}
                      type="number"
                      value={slValue}
                      onChange={e => setSlValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Escape") setSlEdit(false); }}
                      placeholder="Enter stop loss price"
                      style={{
                        width: "100%", background: "rgba(255,255,255,0.04)",
                        border: `1px solid rgba(239,68,68,0.30)`, borderRadius: 10,
                        padding: "10px 12px", fontSize: 15, fontWeight: 600,
                        color: T.text, outline: "none", boxSizing: "border-box",
                        caretColor: T.negative,
                      }}
                    />
                  )}
                </div>

              </div>
            </div>

            {/* ════════════ ACTIONS ════════════ */}
            <div style={{ padding: "16px 24px 24px", display: "flex", flexDirection: "column", gap: 10 }}>

              {/* Update TP/SL */}
              <button
                onClick={saveTPSL}
                disabled={saving}
                style={{
                  width: "100%", height: 50, borderRadius: 14, cursor: saving ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  fontSize: 15, fontWeight: 700, letterSpacing: "0.01em",
                  background: "rgba(255,255,255,0.08)",
                  border: `1px solid rgba(255,255,255,0.10)`,
                  color: T.text,
                  transition: "background 0.15s",
                  opacity: saving ? 0.7 : 1,
                }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.background = "rgba(255,255,255,0.13)"; }}
                onMouseLeave={e => { if (!saving) e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              >
                {saving ? (
                  <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />Saving…</>
                ) : (
                  "Update TP / SL"
                )}
              </button>

              {/* Close Position — with confirmation */}
              <AnimatePresence mode="wait">
                {confirmState === "confirming" ? (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    style={{
                      background: "rgba(239,68,68,0.06)",
                      border: `1px solid rgba(239,68,68,0.18)`,
                      borderRadius: 14, padding: "16px",
                    }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 12 }}>
                      <AlertTriangle style={{ width: 14, height: 14, color: T.negative, flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 13, color: T.text, fontWeight: 600, lineHeight: 1.4 }}>
                        Close {pos.symbol} at market price?
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: T.secondary, lineHeight: 1.55, marginBottom: 14 }}>
                      This will market-close your full {isLong ? "long" : "short"} position of{" "}
                      {fNum(pos.size, 4)} {pos.symbol} immediately. This cannot be undone.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setConfirmState("idle")}
                        style={{
                          flex: 1, height: 40, borderRadius: 10, cursor: "pointer",
                          fontSize: 13, fontWeight: 600,
                          background: "rgba(255,255,255,0.05)",
                          border: `1px solid ${T.border}`,
                          color: T.secondary,
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleClosePosition}
                        style={{
                          flex: 1, height: 40, borderRadius: 10, cursor: "pointer",
                          fontSize: 13, fontWeight: 700,
                          background: "rgba(239,68,68,0.14)",
                          border: `1px solid rgba(239,68,68,0.28)`,
                          color: T.negative,
                        }}
                      >
                        Confirm Close
                      </button>
                    </div>
                  </motion.div>
                ) : confirmState === "closing" ? (
                  <motion.button
                    key="closing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{
                      width: "100%", height: 50, borderRadius: 14,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      fontSize: 15, fontWeight: 700,
                      background: "rgba(239,68,68,0.10)",
                      border: `1px solid rgba(239,68,68,0.18)`,
                      color: T.negative, cursor: "not-allowed",
                    }}
                  >
                    <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />
                    Closing…
                  </motion.button>
                ) : confirmState === "done" ? (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                      width: "100%", height: 50, borderRadius: 14,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      fontSize: 15, fontWeight: 700,
                      background: "rgba(34,197,94,0.10)",
                      border: `1px solid rgba(34,197,94,0.18)`,
                      color: T.positive,
                    }}
                  >
                    <Check style={{ width: 16, height: 16 }} />
                    Position Closed
                  </motion.div>
                ) : (
                  <motion.button
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={handleClosePosition}
                    style={{
                      width: "100%", height: 50, borderRadius: 14, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15, fontWeight: 700,
                      background: "rgba(239,68,68,0.10)",
                      border: `1px solid rgba(239,68,68,0.18)`,
                      color: T.negative,
                      transition: "background 0.15s, border-color 0.15s",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.17)";
                      e.currentTarget.style.borderColor = "rgba(239,68,68,0.32)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.10)";
                      e.currentTarget.style.borderColor = "rgba(239,68,68,0.18)";
                    }}
                  >
                    Close Position
                  </motion.button>
                )}
              </AnimatePresence>

            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}
