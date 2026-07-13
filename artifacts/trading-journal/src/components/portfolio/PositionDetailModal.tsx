import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, TrendingUp, TrendingDown, Zap, Shield, AlertTriangle,
  Target, Edit3, Check, Loader2, ChevronDown,
} from "lucide-react";
import { useTickStore } from "@/store/tickStore";
import { useBrokerStore } from "@/store/brokerStore";
import type { BrokerPosition } from "@/types/broker";

const USD_TO_INR = 85;

function fmt(v: number, dp = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(v);
}
function fUSD(v: number, dp = 2) {
  const s = new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(Math.abs(v));
  return v < 0 ? `-${s}` : s;
}
function fPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function fDate(v: unknown): string {
  if (!v) return "—";
  try {
    const d = new Date(v as string | number);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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

interface Props {
  pos: BrokerPosition | null;
  onClose: () => void;
}

type ConfirmState = "idle" | "confirming" | "closing" | "done";
type EditField = "tp" | "sl" | null;

export default function PositionDetailModal({ pos, onClose }: Props) {
  const ticks = useTickStore(s => s.ticks);
  const { closePosition } = useBrokerStore();

  /* ── live price & pnl ── */
  const symKey = pos
    ? pos.symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD"
    : "";
  const livePrice = pos ? (ticks[symKey]?.price ?? pos.markPrice) : 0;
  const pnl = pos
    ? pos.side === "Long"
      ? (livePrice - pos.entryPrice) * pos.size
      : (pos.entryPrice - livePrice) * pos.size
    : 0;
  const pnlPos = pnl >= 0;

  /* ── derived raw fields ── */
  const raw = pos?.raw ?? {};
  const liquidationPrice = rawGet(raw, "liquidation_price", "liqPrice", "liquidationPrice");
  const margin           = rawGet(raw, "margin", "initialMargin", "initial_margin");
  const openTime         = rawGet(raw, "created_at", "entry_time", "openedAt", "createdAt");
  const rawTp            = rawGet(raw, "take_profit", "takeProfit", "tp");
  const rawSl            = rawGet(raw, "stop_loss", "stopLoss", "sl");

  const marginNum    = margin    ? parseFloat(String(margin))           : null;
  const roi          = marginNum && marginNum > 0 ? (pnl / marginNum) * 100 : null;
  const positionValue = pos ? livePrice * pos.size : 0;

  /* ── editing state ── */
  const [editField, setEditField] = useState<EditField>(null);
  const [tpValue, setTpValue]     = useState(rawTp ? String(rawTp) : "");
  const [slValue, setSlValue]     = useState(rawSl ? String(rawSl) : "");
  const [saving, setSaving]       = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editField && inputRef.current) inputRef.current.focus();
  }, [editField]);

  /* sync TP/SL from raw if position changes */
  useEffect(() => {
    setTpValue(rawTp ? String(rawTp) : "");
    setSlValue(rawSl ? String(rawSl) : "");
    setEditField(null);
    setConfirmState("idle");
  }, [pos?.id]);

  /* ── save TP/SL (places bracket order) ── */
  const saveField = useCallback(async (field: EditField) => {
    if (!pos || !field) return;
    setSaving(true);
    try {
      const { placeOrder } = useBrokerStore.getState();
      const req = {
        symbol:     pos.symbol,
        side:       (pos.side === "Long" ? "Sell" : "Buy") as "Buy" | "Sell",
        orderType:  "Market" as const,
        qty:        String(pos.size),
        ...(field === "tp" && tpValue ? { takeProfit: tpValue } : {}),
        ...(field === "sl" && slValue ? { stopLoss: slValue }  : {}),
      };
      await placeOrder(req);
    } catch { /* silent */ }
    setSaving(false);
    setEditField(null);
  }, [pos, tpValue, slValue]);

  /* ── close position ── */
  const handleClose = useCallback(async () => {
    if (!pos) return;
    if (confirmState === "idle") { setConfirmState("confirming"); return; }
    if (confirmState !== "confirming") return;
    setConfirmState("closing");
    try {
      await closePosition(pos);
      setConfirmState("done");
      setTimeout(onClose, 900);
    } catch {
      setConfirmState("idle");
    }
  }, [pos, confirmState, closePosition, onClose]);

  /* ── backdrop click ── */
  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* ── lock body scroll ── */
  useEffect(() => {
    if (pos) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [!!pos]);

  const isLong = pos?.side === "Long";

  const content = (
    <AnimatePresence>
      {pos && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={handleBackdrop}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
            background: "rgba(4,5,9,0.82)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.90, y: 16 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{   opacity: 0, scale: 0.94,  y: 8  }}
            transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 520,
              maxHeight: "calc(100dvh - 32px)",
              overflowY: "auto",
              scrollbarWidth: "none",
              background: "rgba(10,12,18,0.97)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 20,
              boxShadow: [
                "0 0 0 1px rgba(255,255,255,0.04)",
                "0 32px 80px rgba(0,0,0,0.85)",
                "0 8px 32px rgba(0,0,0,0.60)",
                isLong
                  ? "0 0 60px rgba(52,211,153,0.06)"
                  : "0 0 60px rgba(248,113,113,0.06)",
              ].join(","),
            }}
          >
            {/* ══ HEADER ══ */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "18px 20px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              position: "sticky", top: 0, zIndex: 10,
              background: "rgba(10,12,18,0.98)",
              borderRadius: "20px 20px 0 0",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isLong ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                border: `1px solid ${isLong ? "rgba(52,211,153,0.22)" : "rgba(248,113,113,0.22)"}`,
                flexShrink: 0,
              }}>
                {isLong
                  ? <TrendingUp  style={{ width: 18, height: 18, color: "#34d399" }} />
                  : <TrendingDown style={{ width: 18, height: 18, color: "#f87171" }} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 17, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em" }}>
                    {pos.symbol}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6,
                    background: isLong ? "rgba(52,211,153,0.14)" : "rgba(248,113,113,0.14)",
                    color: isLong ? "#34d399" : "#f87171",
                    letterSpacing: "0.06em",
                  }}>
                    {isLong ? "▲ LONG" : "▼ SHORT"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>
                    Perpetual Futures
                  </span>
                  {pos.leverage && (
                    <>
                      <span style={{ color: "rgba(255,255,255,0.15)" }}>·</span>
                      <span style={{ fontSize: 11, color: "rgba(249,115,22,0.75)", fontWeight: 700 }}>
                        {pos.leverage}x
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* PnL pill */}
              <div style={{
                padding: "5px 12px", borderRadius: 10, textAlign: "right",
                background: pnlPos ? "rgba(52,211,153,0.10)" : "rgba(248,113,113,0.10)",
                border: `1px solid ${pnlPos ? "rgba(52,211,153,0.22)" : "rgba(248,113,113,0.22)"}`,
              }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: pnlPos ? "#34d399" : "#f87171", lineHeight: 1 }}>
                  {pnlPos ? "+" : ""}{fUSD(pnl)}
                </div>
                {roi !== null && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: pnlPos ? "rgba(52,211,153,0.65)" : "rgba(248,113,113,0.65)", marginTop: 2, lineHeight: 1 }}>
                    {fPct(roi)}
                  </div>
                )}
              </div>

              <button
                onClick={onClose}
                style={{
                  width: 32, height: 32, borderRadius: 9, border: "1px solid rgba(255,255,255,0.09)",
                  background: "rgba(255,255,255,0.05)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0, transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
              >
                <X style={{ width: 14, height: 14, color: "rgba(255,255,255,0.55)" }} />
              </button>
            </div>

            <div style={{ padding: "0 20px 20px" }}>

              {/* ══ TRADE DETAILS ══ */}
              <SectionHeading icon={<Zap style={{ width: 12, height: 12 }} />} label="Trade Details" />

              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr",
                gap: "1px",
                background: "rgba(255,255,255,0.05)",
                borderRadius: 14, overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                {[
                  { label: "Position Status", value: "Open",
                    valueStyle: { color: "#34d399", fontWeight: 800 } },
                  { label: "Position ID",
                    value: pos.id ? `#${String(pos.id).slice(-8)}` : "—",
                    valueStyle: { color: "rgba(255,255,255,0.4)", fontSize: 11 } },
                  { label: "Entry Price",    value: fUSD(pos.entryPrice, 4) },
                  { label: "Mark Price",     value: fUSD(pos.markPrice, 4),
                    valueStyle: { color: isLong ? "#34d399" : "#f87171" } },
                  { label: "Current Price",  value: fUSD(livePrice, 4),
                    valueStyle: { color: "rgba(165,180,252,0.9)" } },
                  { label: "Quantity / Size", value: fmt(pos.size, 4) },
                  { label: "Leverage",
                    value: pos.leverage ? `${pos.leverage}×` : "—",
                    valueStyle: { color: "#f97316", fontWeight: 800 } },
                  { label: "Margin Used",
                    value: marginNum ? fUSD(marginNum) : "—" },
                  { label: "Unrealized PNL",
                    value: `${pnlPos ? "+" : ""}${fUSD(pnl)}`,
                    valueStyle: { color: pnlPos ? "#34d399" : "#f87171", fontWeight: 800 } },
                  { label: "ROI %",
                    value: roi !== null ? fPct(roi) : "—",
                    valueStyle: { color: pnlPos ? "#34d399" : "#f87171", fontWeight: 800 } },
                  { label: "Liq. Price",
                    value: liquidationPrice ? fUSD(parseFloat(String(liquidationPrice)), 4) : "—",
                    valueStyle: { color: "rgba(248,113,113,0.75)" } },
                  { label: "Position Value", value: fUSD(positionValue) },
                  { label: "Open Time",
                    value: fDate(openTime),
                    fullWidth: true },
                ].map(({ label, value, valueStyle, fullWidth }, i) => (
                  <DetailCell
                    key={label}
                    label={label}
                    value={value}
                    valueStyle={valueStyle}
                    fullWidth={fullWidth}
                    last={i === 12}
                  />
                ))}
              </div>

              {/* ══ RISK MANAGEMENT ══ */}
              <SectionHeading icon={<Shield style={{ width: 12, height: 12 }} />} label="Risk Management" style={{ marginTop: 16 }} />

              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}>
                {/* Take Profit */}
                <RiskField
                  label="Take Profit"
                  color="#34d399"
                  bgColor="rgba(52,211,153,0.08)"
                  borderColor="rgba(52,211,153,0.18)"
                  value={tpValue}
                  isEditing={editField === "tp"}
                  isSaving={saving && editField === "tp"}
                  inputRef={editField === "tp" ? inputRef : undefined}
                  onChange={v => setTpValue(v)}
                  onEdit={() => setEditField("tp")}
                  onSave={() => saveField("tp")}
                  onCancel={() => setEditField(null)}
                />
                {/* Stop Loss */}
                <RiskField
                  label="Stop Loss"
                  color="#f87171"
                  bgColor="rgba(248,113,113,0.08)"
                  borderColor="rgba(248,113,113,0.18)"
                  value={slValue}
                  isEditing={editField === "sl"}
                  isSaving={saving && editField === "sl"}
                  inputRef={editField === "sl" ? inputRef : undefined}
                  onChange={v => setSlValue(v)}
                  onEdit={() => setEditField("sl")}
                  onSave={() => saveField("sl")}
                  onCancel={() => setEditField(null)}
                />
              </div>

              {/* ══ ACTIONS ══ */}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                {/* Edit TP */}
                <button
                  onClick={() => setEditField(editField === "tp" ? null : "tp")}
                  style={{
                    flex: 1, height: 40, borderRadius: 11, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
                    background: editField === "tp" ? "rgba(52,211,153,0.14)" : "rgba(52,211,153,0.08)",
                    border: `1px solid ${editField === "tp" ? "rgba(52,211,153,0.35)" : "rgba(52,211,153,0.15)"}`,
                    color: "#34d399", transition: "all 0.15s",
                  }}
                >
                  <Target style={{ width: 13, height: 13 }} />
                  Edit TP
                </button>

                {/* Edit SL */}
                <button
                  onClick={() => setEditField(editField === "sl" ? null : "sl")}
                  style={{
                    flex: 1, height: 40, borderRadius: 11, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.02em",
                    background: editField === "sl" ? "rgba(248,113,113,0.14)" : "rgba(248,113,113,0.08)",
                    border: `1px solid ${editField === "sl" ? "rgba(248,113,113,0.35)" : "rgba(248,113,113,0.15)"}`,
                    color: "#f87171", transition: "all 0.15s",
                  }}
                >
                  <Shield style={{ width: 13, height: 13 }} />
                  Edit SL
                </button>
              </div>

              {/* Close Position */}
              <AnimatePresence mode="wait">
                {confirmState === "confirming" ? (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    style={{
                      marginTop: 10,
                      background: "rgba(248,113,113,0.08)",
                      border: "1px solid rgba(248,113,113,0.22)",
                      borderRadius: 13,
                      padding: "14px 16px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <AlertTriangle style={{ width: 15, height: 15, color: "#f87171", flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>
                        Close {pos.symbol} at market?
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", lineHeight: 1.5, marginBottom: 12 }}>
                      This will close your entire {isLong ? "long" : "short"} position
                      of {fmt(pos.size, 4)} {pos.symbol} at the current market price.
                      This action cannot be undone.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setConfirmState("idle")}
                        style={{
                          flex: 1, height: 36, borderRadius: 9, cursor: "pointer",
                          fontSize: 12, fontWeight: 700, border: "1px solid rgba(255,255,255,0.10)",
                          background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.55)",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleClose}
                        style={{
                          flex: 1, height: 36, borderRadius: 9, cursor: "pointer",
                          fontSize: 12, fontWeight: 800, border: "1px solid rgba(248,113,113,0.35)",
                          background: "rgba(248,113,113,0.18)", color: "#f87171",
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
                      width: "100%", marginTop: 10, height: 44, borderRadius: 13,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      fontSize: 13, fontWeight: 800,
                      background: "rgba(248,113,113,0.14)",
                      border: "1px solid rgba(248,113,113,0.25)",
                      color: "#f87171", cursor: "not-allowed",
                    }}
                  >
                    <Loader2 style={{ width: 15, height: 15, animation: "spin 1s linear infinite" }} />
                    Closing Position…
                  </motion.button>
                ) : confirmState === "done" ? (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{
                      width: "100%", marginTop: 10, height: 44, borderRadius: 13,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      fontSize: 13, fontWeight: 800,
                      background: "rgba(52,211,153,0.12)",
                      border: "1px solid rgba(52,211,153,0.22)",
                      color: "#34d399",
                    }}
                  >
                    <Check style={{ width: 15, height: 15 }} />
                    Position Closed
                  </motion.div>
                ) : (
                  <motion.button
                    key="idle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={handleClose}
                    style={{
                      width: "100%", marginTop: 10, height: 44, borderRadius: 13,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      fontSize: 13, fontWeight: 800, letterSpacing: "0.02em",
                      background: "rgba(239,68,68,0.14)",
                      border: "1px solid rgba(239,68,68,0.28)",
                      color: "#ef4444", cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.22)";
                      e.currentTarget.style.borderColor = "rgba(239,68,68,0.42)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "rgba(239,68,68,0.14)";
                      e.currentTarget.style.borderColor = "rgba(239,68,68,0.28)";
                    }}
                  >
                    <ChevronDown style={{ width: 15, height: 15 }} />
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

  return createPortal(content, document.body);
}

/* ── Sub-components ─────────────────────────────────────────────── */

function SectionHeading({ icon, label, style }: {
  icon: React.ReactNode;
  label: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      marginTop: 18, marginBottom: 10, ...style,
    }}>
      <span style={{ color: "rgba(255,255,255,0.30)" }}>{icon}</span>
      <span style={{
        fontSize: 10, fontWeight: 800, letterSpacing: "0.12em",
        textTransform: "uppercase", color: "rgba(255,255,255,0.30)",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)", marginLeft: 4 }} />
    </div>
  );
}

function DetailCell({ label, value, valueStyle, fullWidth, last }: {
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
  fullWidth?: boolean;
  last?: boolean;
}) {
  return (
    <div style={{
      gridColumn: fullWidth ? "span 2" : undefined,
      padding: "10px 14px",
      background: "rgba(10,12,18,0.97)",
      borderBottom: last ? "none" : "1px solid rgba(255,255,255,0.05)",
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.80)", lineHeight: 1, ...valueStyle }}>
        {value}
      </div>
    </div>
  );
}

function RiskField({ label, color, bgColor, borderColor, value, isEditing, isSaving, inputRef, onChange, onEdit, onSave, onCancel }: {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  value: string;
  isEditing: boolean;
  isSaving: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onChange: (v: string) => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      borderRadius: 12, padding: "12px 14px",
      background: bgColor, border: `1px solid ${borderColor}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {label}
        </span>
        {isEditing ? (
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={onCancel} style={{
              fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 5, cursor: "pointer",
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.45)",
            }}>
              ×
            </button>
            <button onClick={onSave} disabled={isSaving} style={{
              fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 5, cursor: "pointer",
              background: bgColor, border: `1px solid ${borderColor}`, color,
              display: "flex", alignItems: "center", gap: 3,
            }}>
              {isSaving
                ? <Loader2 style={{ width: 9, height: 9, animation: "spin 1s linear infinite" }} />
                : <Check style={{ width: 9, height: 9 }} />
              }
              Save
            </button>
          </div>
        ) : (
          <button onClick={onEdit} style={{
            background: "none", border: "none", cursor: "pointer", padding: 2, color: "rgba(255,255,255,0.25)",
          }}>
            <Edit3 style={{ width: 11, height: 11 }} />
          </button>
        )}
      </div>
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
          placeholder="0.00"
          style={{
            width: "100%", background: "rgba(0,0,0,0.25)", border: `1px solid ${borderColor}`,
            borderRadius: 7, padding: "6px 8px",
            fontSize: 14, fontWeight: 700, color, outline: "none",
            boxSizing: "border-box",
          }}
        />
      ) : (
        <div style={{ fontSize: 15, fontWeight: 800, color: value ? color : "rgba(255,255,255,0.20)", lineHeight: 1 }}>
          {value ? fUSD(parseFloat(value), 2) : "Not set"}
        </div>
      )}
    </div>
  );
}
