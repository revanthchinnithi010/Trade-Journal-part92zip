import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { X, ShoppingCart, Loader2, CheckCircle2, XCircle, Plus, Minus, RefreshCw } from "lucide-react";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import {
  type LotSpec,
  computeLotPrecision,
  snapToStep,
  incrementLots,
  decrementLots,
  isValidLots,
  calcUnits,
  calcMargin,
  calcPositionValue,
  calcPipValue,
  formatLots,
  formatUnits,
  formatCurrency,
  validateVolumeSanity,
} from "@/lib/lotMath";

// ── Types ────────────────────────────────────────────────────────────────────

interface BrokerContractSpec {
  broker:            "delta" | "ctrader";
  symbol:            string;
  fetchedAt:         number;
  description:       string;
  maxLeverageNum:    number;
  lotSizeNum:        number;
  settlementCurrency: string;
  partial?:          boolean;
  fields:            Array<{ label: string; value: string; highlight?: boolean }>;
  minVolumeLots:     number | null;
  maxVolumeLots:     number | null;
  stepVolumeLots:    number | null;
  leverage:          number | null;
  pipPosition:       number | null;
  digits:            number | null;
}

interface Props {
  symbol: string;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BG          = "#0D1C16";
const BORDER_CLR  = "rgba(57,91,67,0.30)";
const BORDER_DIM  = "rgba(57,91,67,0.15)";
const TEXT_DIM    = "rgba(167,184,169,0.60)";
const TEXT_HI     = "#F3FFF3";
const ACCENT      = "#B7FF5A";
const ACCENT_BG   = "rgba(183,255,90,0.10)";
const ACCENT_BORD = "rgba(183,255,90,0.25)";
const INPUT_CLS: React.CSSProperties = {
  background: BG,
  border: `1px solid ${BORDER_CLR}`,
  borderRadius: 8,
  color: TEXT_HI,
  fontSize: 12,
  padding: "0 10px",
  height: 34,
  width: "100%",
  outline: "none",
};
const LABEL_CLS: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 600,
  marginBottom: 4,
  color: TEXT_DIM,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveLotSpec(spec: BrokerContractSpec | null): LotSpec | null {
  if (!spec) return null;

  const minLots  = spec.minVolumeLots  ?? null;
  const maxLots  = spec.maxVolumeLots  ?? null;
  const stepLots = spec.stepVolumeLots ?? null;
  const lotSize  = spec.lotSizeNum > 0 ? spec.lotSizeNum : null;
  const leverage = spec.leverage ?? (spec.maxLeverageNum > 0 ? spec.maxLeverageNum : null);
  const pipPos   = spec.pipPosition ?? 4;
  const digits   = spec.digits ?? 5;

  if (!minLots || !maxLots || !stepLots || !lotSize || !leverage) {
    console.warn("[PlaceOrderPanel] Incomplete LotSpec — missing fields:", {
      minLots, maxLots, stepLots, lotSize, leverage,
      symbol: spec.symbol,
    });
    return null;
  }

  // Sanity check — log a warning if values look wrong
  const sanity = validateVolumeSanity(minLots, maxLots, stepLots, spec.symbol);
  if (!sanity.ok) {
    console.warn("[PlaceOrderPanel] Volume sanity FAILED:", sanity.warning, {
      minVolumeLots: minLots, maxVolumeLots: maxLots, stepVolumeLots: stepLots,
      symbol: spec.symbol,
    });
    return null;
  }

  return { minLots, maxLots, stepLots, lotSize, leverage, pipPosition: pipPos, digits };
}

function calcAll(lots: number, price: number | null, spec: LotSpec) {
  if (!price || price <= 0) return { margin: null, posValue: null, pipVal: null, units: 0 };
  return {
    margin:   calcMargin(lots, price, spec),
    posValue: calcPositionValue(lots, price, spec.lotSize),
    pipVal:   calcPipValue(lots, spec),
    units:    calcUnits(lots, spec.lotSize),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlaceOrderPanel({ symbol }: Props) {
  const { setShowPlaceOrder, placeOrder, activeAccount } = useBrokerStore();
  const ticks = useTickStore(s => s.ticks);

  // ── Live price ──────────────────────────────────────────────────────────────
  const symKey   = symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const tick     = ticks[symKey] ?? ticks[symbol];
  const livePrice = tick?.price ?? null;

  const broker = activeAccount?.broker_id ?? "ctrader";

  // ── Contract spec ─────────────────────────────────────────────────────────
  const [spec,        setSpec]        = useState<BrokerContractSpec | null>(null);
  const [specLoading, setSpecLoading] = useState(false);
  const [specError,   setSpecError]   = useState<string | null>(null);
  const prevSymbolRef = useRef("");

  const fetchSpec = useCallback((sym: string) => {
    if (!sym) return;
    setSpecLoading(true);
    setSpecError(null);
    const base = (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL.replace(/\/$/, "");
    const brokerQ = broker === "ctrader" ? "ctrader" : "delta";
    fetch(`${base}/api/contract-spec/${encodeURIComponent(sym)}?broker=${brokerQ}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: BrokerContractSpec) => {
        setSpec(d);
        setSpecLoading(false);
        console.info("[PlaceOrderPanel] spec loaded:", {
          symbol: sym, minVolumeLots: d.minVolumeLots, maxVolumeLots: d.maxVolumeLots,
          stepVolumeLots: d.stepVolumeLots, lotSize: d.lotSizeNum,
          leverage: d.leverage, pipPosition: d.pipPosition, digits: d.digits,
        });
      })
      .catch((e: Error) => {
        setSpecError(e.message);
        setSpecLoading(false);
        console.error("[PlaceOrderPanel] spec fetch error:", e.message);
      });
  }, [broker]);

  // Fetch on mount + when symbol changes
  useEffect(() => {
    if (symbol === prevSymbolRef.current) return;
    prevSymbolRef.current = symbol;
    setSpec(null);
    fetchSpec(symbol);
  }, [symbol, fetchSpec]);

  // Re-fetch when broker reconnects (cTrader reconnect may change leverage)
  const connectionKey = activeAccount?.broker_id ?? "";
  const prevConnRef   = useRef("");
  useEffect(() => {
    if (!connectionKey || connectionKey === prevConnRef.current) return;
    prevConnRef.current = connectionKey;
    if (spec) fetchSpec(symbol); // Only refresh if we already had one
  }, [connectionKey, spec, symbol, fetchSpec]);

  // ── Derive LotSpec ──────────────────────────────────────────────────────────
  const lotSpec = useMemo(() => deriveLotSpec(spec), [spec]);
  const prec    = useMemo(() => lotSpec ? computeLotPrecision(lotSpec.stepLots) : 2, [lotSpec]);

  // ── Quantity state ──────────────────────────────────────────────────────────
  // String state for the input so the user can type freely; we snap on blur/submit.
  const [qtyStr,   setQtyStr]   = useState("");
  const [qtyError, setQtyError] = useState<string | null>(null);

  // When spec first loads (or changes), reset qty to the broker's minimum
  const prevSpecRef = useRef<LotSpec | null>(null);
  useEffect(() => {
    if (!lotSpec) return;
    if (prevSpecRef.current?.minLots === lotSpec.minLots && qtyStr !== "") return;
    prevSpecRef.current = lotSpec;
    setQtyStr(formatLots(lotSpec.minLots, prec));
    setQtyError(null);
    console.info("[PlaceOrderPanel] qty reset to broker minimum:", {
      minLots: lotSpec.minLots, precision: prec,
      stepLots: lotSpec.stepLots, maxLots: lotSpec.maxLots,
      lotSize: lotSpec.lotSize, leverage: lotSpec.leverage,
    });
  }, [lotSpec, prec, qtyStr]);

  // Parsed lot quantity (number) — used for all calculations
  const currentLots = useMemo(() => {
    const v = parseFloat(qtyStr);
    return isNaN(v) || v <= 0 ? (lotSpec?.minLots ?? 0.01) : v;
  }, [qtyStr, lotSpec]);

  // Snap and validate the current qty
  const validateQty = useCallback((lots: number): string | null => {
    if (!lotSpec) return null;
    if (lots < lotSpec.minLots) {
      return `Minimum is ${formatLots(lotSpec.minLots, prec)} lots`;
    }
    if (lots > lotSpec.maxLots) {
      return `Maximum is ${formatLots(lotSpec.maxLots, prec)} lots`;
    }
    if (!isValidLots(lots, lotSpec)) {
      const snapped = snapToStep(lots, lotSpec);
      return `Must be a multiple of ${formatLots(lotSpec.stepLots, prec)} — nearest valid: ${formatLots(snapped, prec)}`;
    }
    return null;
  }, [lotSpec, prec]);

  const handleQtyBlur = useCallback(() => {
    if (!lotSpec) return;
    const raw = parseFloat(qtyStr);
    if (isNaN(raw) || raw <= 0) {
      setQtyStr(formatLots(lotSpec.minLots, prec));
      setQtyError(null);
      return;
    }
    const snapped = snapToStep(raw, lotSpec);
    setQtyStr(formatLots(snapped, prec));
    setQtyError(validateQty(snapped));
  }, [qtyStr, lotSpec, prec, validateQty]);

  const handleDecrement = useCallback(() => {
    if (!lotSpec) return;
    const next = decrementLots(currentLots, lotSpec);
    setQtyStr(formatLots(next, prec));
    setQtyError(null);
  }, [currentLots, lotSpec, prec]);

  const handleIncrement = useCallback(() => {
    if (!lotSpec) return;
    const next = incrementLots(currentLots, lotSpec);
    setQtyStr(formatLots(next, prec));
    setQtyError(null);
  }, [currentLots, lotSpec, prec]);

  // ── Derived financial values ───────────────────────────────────────────────
  const calcs = useMemo(() => {
    if (!lotSpec) return null;
    return calcAll(currentLots, livePrice, lotSpec);
  }, [currentLots, livePrice, lotSpec]);

  // ── Order form state ──────────────────────────────────────────────────────
  const [side,        setSide]       = useState<"Buy" | "Sell">("Buy");
  const [orderType,   setOrderType]  = useState<"Market" | "Limit">("Market");
  const [price,       setPrice]      = useState("");
  const [stopLoss,    setStopLoss]   = useState("");
  const [takeProfit,  setTakeProfit] = useState("");
  const [status,      setStatus]     = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg,         setMsg]        = useState("");

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotSpec) return;
    const lots = snapToStep(currentLots, lotSpec);
    const err  = validateQty(lots);
    if (err) { setQtyError(err); return; }

    setStatus("loading");
    setMsg("");
    const result = await placeOrder({
      symbol,
      side,
      orderType,
      qty:        formatLots(lots, prec),
      price:      orderType === "Limit" && price ? price : undefined,
      stopLoss:   stopLoss    || undefined,
      takeProfit: takeProfit  || undefined,
      category:   "linear",
    });
    if (result.ok) {
      setStatus("success");
      setMsg("Order placed successfully!");
      setQtyStr(formatLots(lotSpec.minLots, prec));
      setPrice(""); setStopLoss(""); setTakeProfit("");
      setTimeout(() => setStatus("idle"), 2500);
    } else {
      setStatus("error");
      setMsg(result.error ?? "Order failed");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const buyColor  = "#4ade80";
  const sellColor = "#f87171";
  const sideColor = side === "Buy" ? buyColor : sellColor;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        background: "rgba(5,14,10,0.98)",
        border: `1px solid ${BORDER_DIM}`,
        borderRadius: 16,
        width: 300,
        minWidth: 300,
        maxHeight: "calc(100vh - 140px)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${BORDER_DIM}` }}>
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-3.5 h-3.5" style={{ color: ACCENT }} />
          <span className="text-[12px] font-bold" style={{ color: TEXT_HI }}>Place Order</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
            style={{ background: ACCENT_BG, color: ACCENT }}>
            {symbol}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Refresh spec */}
          <button
            onClick={() => { setSpec(null); fetchSpec(symbol); }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.06]"
            style={{ color: TEXT_DIM }}
            title="Refresh symbol spec"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setShowPlaceOrder(false)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.06]"
            style={{ color: TEXT_DIM }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 p-4 overflow-y-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {/* Live price */}
        {livePrice && (
          <div className="text-center py-1">
            <span className="text-[11px]" style={{ color: TEXT_DIM }}>Live: </span>
            <span className="text-[13px] font-bold" style={{ color: ACCENT }}>
              {livePrice.toLocaleString("en-US", {
                minimumFractionDigits: spec?.digits ?? 2,
                maximumFractionDigits: spec?.digits ?? 5,
              })}
            </span>
          </div>
        )}

        {/* Side toggle */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER_CLR}` }}>
          {(["Buy", "Sell"] as const).map(s => (
            <button key={s} type="button" onClick={() => setSide(s)}
              className="flex-1 h-8 text-[12px] font-bold transition-all"
              style={{
                background: side === s
                  ? s === "Buy" ? "rgba(74,222,128,0.20)" : "rgba(248,113,113,0.20)"
                  : "transparent",
                color: side === s
                  ? s === "Buy" ? buyColor : sellColor
                  : TEXT_DIM,
              }}
            >{s}</button>
          ))}
        </div>

        {/* Order type */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${BORDER_CLR}` }}>
          {(["Market", "Limit"] as const).map(t => (
            <button key={t} type="button" onClick={() => setOrderType(t)}
              className="flex-1 h-7 text-[11px] font-semibold transition-all"
              style={{
                background: orderType === t ? ACCENT_BG : "transparent",
                color: orderType === t ? ACCENT : TEXT_DIM,
              }}
            >{t}</button>
          ))}
        </div>

        {/* ── Quantity ──────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span style={LABEL_CLS}>Quantity (Lots)</span>
            {specLoading && (
              <span style={{ fontSize: 10, color: TEXT_DIM, display: "flex", alignItems: "center", gap: 3 }}>
                <Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} />
                Loading spec…
              </span>
            )}
            {specError && (
              <span style={{ fontSize: 10, color: "#f87171" }}>Spec unavailable</span>
            )}
          </div>

          {/* [−] input [+] */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDecrement}
              disabled={!lotSpec || currentLots <= (lotSpec?.minLots ?? 0)}
              style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: BG, border: `1px solid ${BORDER_CLR}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: TEXT_HI, cursor: "pointer",
                opacity: !lotSpec || currentLots <= (lotSpec?.minLots ?? 0) ? 0.35 : 1,
              }}
            >
              <Minus style={{ width: 14, height: 14 }} />
            </button>

            <input
              type="number"
              inputMode="decimal"
              value={qtyStr}
              onChange={e => { setQtyStr(e.target.value); setQtyError(null); }}
              onBlur={handleQtyBlur}
              step={lotSpec ? String(lotSpec.stepLots) : "0.01"}
              min={lotSpec ? String(lotSpec.minLots) : "0.01"}
              max={lotSpec ? String(lotSpec.maxLots) : undefined}
              required
              style={{
                ...INPUT_CLS,
                height: 34, textAlign: "center",
                fontWeight: 700, fontSize: 14,
                border: qtyError ? "1px solid rgba(239,68,68,0.6)" : `1px solid ${BORDER_CLR}`,
              }}
            />

            <button
              type="button"
              onClick={handleIncrement}
              disabled={!lotSpec || currentLots >= (lotSpec?.maxLots ?? Infinity)}
              style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: BG, border: `1px solid ${BORDER_CLR}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: TEXT_HI, cursor: "pointer",
                opacity: !lotSpec || currentLots >= (lotSpec?.maxLots ?? Infinity) ? 0.35 : 1,
              }}
            >
              <Plus style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* Validation error */}
          {qtyError && (
            <p style={{ fontSize: 10, color: "#f87171", marginTop: 3 }}>{qtyError}</p>
          )}

          {/* Units display */}
          {lotSpec && (
            <p style={{ fontSize: 10, color: TEXT_DIM, marginTop: 3 }}>
              {formatLots(currentLots, prec)} Lot
              {" ≈ "}
              {formatUnits(calcUnits(currentLots, lotSpec.lotSize))} Units
            </p>
          )}

          {/* Spec hints */}
          {lotSpec && (
            <p style={{ fontSize: 9, color: "rgba(167,184,169,0.35)", marginTop: 2 }}>
              Min {formatLots(lotSpec.minLots, prec)} · Max {lotSpec.maxLots} · Step {formatLots(lotSpec.stepLots, prec)}
            </p>
          )}
        </div>

        {/* ── Margin / Position calculations ────────────────────────────────── */}
        {lotSpec && calcs && (
          <div style={{
            borderRadius: 8,
            background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)",
            padding: "8px 10px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "5px 10px",
          }}>
            {calcs.margin !== null && (
              <CalcRow label="Req. Margin"
                value={formatCurrency(calcs.margin)}
                note={`@ 1:${lotSpec.leverage}`} />
            )}
            {calcs.posValue !== null && (
              <CalcRow label="Position Value"
                value={formatCurrency(calcs.posValue)} />
            )}
            {calcs.pipVal !== null && (
              <CalcRow label="Pip Value"
                value={`${calcs.pipVal.toFixed(2)} USD`}
                note="per pip" />
            )}
            {calcs.units > 0 && (
              <CalcRow label="Units"
                value={formatUnits(calcs.units)} />
            )}
          </div>
        )}
        {specLoading && !lotSpec && (
          <div style={{
            borderRadius: 8, background: "rgba(255,255,255,0.025)",
            border: "1px solid rgba(255,255,255,0.06)", padding: "8px 10px",
            fontSize: 10, color: TEXT_DIM, textAlign: "center",
          }}>
            Loading margin data…
          </div>
        )}

        {/* Limit price */}
        {orderType === "Limit" && (
          <div>
            <label style={LABEL_CLS}>Limit Price</label>
            <input value={price} onChange={e => setPrice(e.target.value)}
              placeholder={livePrice ? livePrice.toFixed(spec?.digits ?? 2) : "0"}
              type="number" min="0" step="any" style={INPUT_CLS} />
          </div>
        )}

        {/* SL / TP */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label style={LABEL_CLS}>Stop Loss</label>
            <input value={stopLoss} onChange={e => setStopLoss(e.target.value)}
              placeholder="Optional" type="number" min="0" step="any" style={INPUT_CLS} />
          </div>
          <div>
            <label style={LABEL_CLS}>Take Profit</label>
            <input value={takeProfit} onChange={e => setTakeProfit(e.target.value)}
              placeholder="Optional" type="number" min="0" step="any" style={INPUT_CLS} />
          </div>
        </div>

        {/* Status */}
        {status === "success" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_BORD}` }}>
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: ACCENT }} />
            <p className="text-[11px]" style={{ color: ACCENT }}>{msg}</p>
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            <XCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "#ef4444" }} />
            <p className="text-[11px]" style={{ color: "#f87171" }}>{msg}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={status === "loading" || !lotSpec || !!qtyError}
          className="h-9 rounded-xl text-[12px] font-bold transition-all flex items-center justify-center gap-2"
          style={{
            background: side === "Buy" ? "rgba(74,222,128,0.20)" : "rgba(248,113,113,0.20)",
            color: sideColor,
            border: `1px solid ${side === "Buy" ? "rgba(74,222,128,0.30)" : "rgba(248,113,113,0.30)"}`,
            opacity: (!lotSpec || !!qtyError) ? 0.45 : 1,
            cursor: (!lotSpec || !!qtyError) ? "not-allowed" : "pointer",
          }}
        >
          {status === "loading"
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Placing…</>
            : `${side} ${orderType}`}
        </button>

        {/* Spec source tag */}
        {spec && !specLoading && (
          <p style={{ fontSize: 9, color: "rgba(167,184,169,0.25)", textAlign: "center" }}>
            Spec via {spec.broker === "ctrader" ? "cTrader ProtoOA" : "Delta REST"}
            {" · "}Updated {new Date(spec.fetchedAt).toLocaleTimeString()}
          </p>
        )}
      </form>
    </div>
  );
}

// ── CalcRow sub-component ──────────────────────────────────────────────────

function CalcRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "rgba(167,184,169,0.45)", marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#F3FFF3" }}>{value}</div>
      {note && <div style={{ fontSize: 9, color: "rgba(167,184,169,0.35)" }}>{note}</div>}
    </div>
  );
}
