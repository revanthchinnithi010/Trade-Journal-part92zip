/**
 * PlaceOrderPanel — React Native port of src/components/broker/PlaceOrderPanel.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. div/span/button/input/form → View/Text/Pressable/TextInput + StyleSheet
 *
 * 2. import.meta.env.BASE_URL (Vite) → getApiBase()
 *    Web: fetchSpec uses `(import.meta as …).env.BASE_URL.replace(/\/$/, "")`.
 *    RN:  No Vite env. Use getApiBase() from @/lib/apiBase for all fetch calls.
 *
 * 3. form onSubmit (React.FormEvent + e.preventDefault())
 *    → plain async function handleSubmit() invoked from a Pressable onPress.
 *    No event object needed in RN.
 *
 * 4. HTML <input type="number"> → TextInput
 *    - keyboardType="decimal-pad" for quantity / price / SL / TP fields
 *    - onBlur preserved (handleQtyBlur)
 *    - onChange → onChangeText
 *
 * 5. CSS animation (Loader2 animate-spin) → ActivityIndicator (built-in)
 *
 * 6. Lucide icons → Ionicons (@expo/vector-icons)
 *    ShoppingCart  → cart-outline
 *    X             → close
 *    RefreshCw     → refresh-outline
 *    Loader2       → ActivityIndicator
 *    CheckCircle2  → checkmark-circle-outline
 *    XCircle       → close-circle-outline
 *    Minus         → remove-outline
 *    Plus          → add-outline
 *
 * 7. Mobile-first numeric-entry redesign (tablet optimized)
 *    - +/- stepper buttons enlarged to 48×48 (vs 34×34 on web) for touch safety
 *    - Quantity display font enlarged to 18px bold
 *    - TextInput keyboardType="decimal-pad" (avoids full keyboard for price/SL/TP)
 *    - Side toggle buttons: minimum 44px height
 *    - Submit button: minimum 48px height
 *    - The panel fills the available width allocated by the parent
 *      (no fixed 300px — the parent/sheet constrains width on tablet)
 *
 * 8. CSS scrollbar → ScrollView (native scroll, no scrollbar chrome)
 *
 * All business logic preserved exactly:
 *   - deriveLotSpec()        — same null-safety checks, validateVolumeSanity call
 *   - deriveDeltaSpec()      — same: reads ONLY spec.deltaQty, never cTrader fields
 *   - calcAll()              — margin, posValue, pipVal, units (cTrader path)
 *   - calcDeltaAll()         — margin, posValue (Delta path)
 *   - fetchSpec()            — GET /api/contract-spec/:sym?broker= via getApiBase()
 *   - Re-fetch on symbol change (prevSymbolRef guard)
 *   - Re-fetch on broker reconnect (connectionKey guard)
 *   - isDelta / lotSpec / deltaSpec completely independent branches
 *   - prec / unitLabel derived from active broker spec only
 *   - Quantity state: qtyStr string (typed freely), snapped on blur/submit
 *   - prevSpecKeyRef guard prevents qty reset on every re-render
 *   - currentQty memo (safe fallback to min)
 *   - validateQty() — Delta contract validation vs lotSpec validation
 *   - snapCurrentQty() — broker-appropriate snap
 *   - handleQtyBlur() — snap + format + re-validate on blur
 *   - handleDecrement() / handleIncrement() — broker-aware step
 *   - calcs memo — Delta contracts vs cTrader lots, per-broker calc path
 *   - Order form: side (Buy/Sell), orderType (Market/Limit), price, stopLoss, takeProfit
 *   - status state machine: idle → loading → success/error → idle (with timeouts)
 *   - handleSubmit() — snap + validate + placeOrder() with delta/ctrader qty format
 *   - Post-submit reset: qty reset to min, price/SL/TP cleared
 *   - Success: 2500ms auto-reset; Error: 3000ms auto-reset
 *   - Spec hints: Min/Max/Step display
 *   - Lot equivalent line: formatDeltaLotEquivalent / formatLotEquivalent
 *   - CalcRow sub-component for margin/position/pip/unit display
 *   - Spec source tag: broker name + fetchedAt time
 *   - refreshSpec button (setSpec(null) + re-fetch)
 *   - setShowPlaceOrder(false) close button
 *   - all brokerStore + tickStore interactions preserved identically
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet,
  ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { getApiBase } from "@/lib/apiBase";
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
  formatLotEquivalent,
  validateVolumeSanity,
} from "@/lib/lotMath";
import {
  type DeltaQtySpec,
  contractsToDisplayQty,
  displayQtyToContracts,
  formatDeltaQty,
  deltaUnitLabel,
  formatDeltaLotEquivalent,
  snapContracts,
  incrementContracts,
  decrementContracts,
  isValidContracts,
  calcDeltaMargin,
  calcDeltaPositionValue,
  formatDeltaCurrency,
} from "@/lib/deltaMath";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrokerContractSpec {
  broker:              "delta" | "ctrader";
  symbol:              string;
  fetchedAt:           number;
  description:         string;
  maxLeverageNum:      number;
  lotSizeNum:          number;
  settlementCurrency:  string;
  partial?:            boolean;
  fields:              Array<{ label: string; value: string; highlight?: boolean }>;
  minVolumeLots:       number | null;
  maxVolumeLots:       number | null;
  stepVolumeLots:      number | null;
  leverage:            number | null;
  pipPosition:         number | null;
  digits:              number | null;
  deltaQty:            DeltaQtySpec | null;
}

interface Props {
  symbol: string;
}

// ── Design tokens ─────────────────────────────────────────────────────────────

const BG          = "#0D1C16";
const BORDER_CLR  = "rgba(57,91,67,0.30)";
const BORDER_DIM  = "rgba(57,91,67,0.15)";
const TEXT_DIM    = "rgba(167,184,169,0.60)";
const TEXT_HI     = "#F3FFF3";
const ACCENT      = "#B7FF5A";
const ACCENT_BG   = "rgba(183,255,90,0.10)";
const ACCENT_BORD = "rgba(183,255,90,0.25)";
const BUY_CLR     = "#4ade80";
const SELL_CLR    = "#f87171";

// ── Pure helpers (preserved exactly from the web original) ────────────────────

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

/** Read ONLY Delta metadata — never cTrader lot fields. Returns null if Delta hasn't
 *  provided a valid contract spec yet (never fall back to cTrader lot defaults). */
function deriveDeltaSpec(spec: BrokerContractSpec | null): DeltaQtySpec | null {
  if (!spec || !spec.deltaQty) return null;
  return spec.deltaQty;
}

function calcDeltaAll(contracts: number, price: number | null, leverage: number, spec: DeltaQtySpec) {
  if (!price || price <= 0) return { margin: null, posValue: null };
  return {
    margin:   calcDeltaMargin(contracts, price, leverage, spec),
    posValue: calcDeltaPositionValue(contracts, price, spec),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlaceOrderPanel({ symbol }: Props) {
  const { setShowPlaceOrder, placeOrder, activeAccount } = useBrokerStore();
  const ticks = useTickStore(s => s.ticks);

  // ── Live price ─────────────────────────────────────────────────────────────
  const symKey    = symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const tick      = ticks[symKey] ?? ticks[symbol];
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
    // RN: use getApiBase() — no import.meta.env.BASE_URL in React Native
    const brokerQ = broker === "ctrader" ? "ctrader" : "delta";
    fetch(`${getApiBase()}/api/contract-spec/${encodeURIComponent(sym)}?broker=${brokerQ}`)
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
  const connectionKey  = activeAccount?.broker_id ?? "";
  const prevConnRef    = useRef("");
  useEffect(() => {
    if (!connectionKey || connectionKey === prevConnRef.current) return;
    prevConnRef.current = connectionKey;
    if (spec) fetchSpec(symbol); // Only refresh if we already had one
  }, [connectionKey, spec, symbol, fetchSpec]);

  // ── Broker-specific spec — completely independent, never mixed ─────────────
  const isDelta  = broker !== "ctrader";
  const lotSpec   = useMemo(() => !isDelta ? deriveLotSpec(spec)   : null, [spec, isDelta]);
  const deltaSpec = useMemo(() => isDelta  ? deriveDeltaSpec(spec) : null, [spec, isDelta]);
  const prec = useMemo(() => {
    if (isDelta)  return deltaSpec ? deltaSpec.quantityPrecision : 0;
    return lotSpec ? computeLotPrecision(lotSpec.stepLots) : 2;
  }, [isDelta, deltaSpec, lotSpec]);
  const unitLabel = isDelta
    ? (deltaSpec ? deltaUnitLabel(deltaSpec) : "Contracts")
    : "Lot";

  // ── Quantity state ─────────────────────────────────────────────────────────
  // String state for the input so the user can type freely; we snap on blur/submit.
  // For Delta this represents the DISPLAYED quantity (coin amount or contract count),
  // never lots. Whole contracts are derived from it only when submitting.
  const [qtyStr,   setQtyStr]   = useState("");
  const [qtyError, setQtyError] = useState<string | null>(null);

  // When spec first loads (or changes), reset qty to the broker's own minimum.
  // Clears any previous broker's cached quantity/precision/step entirely.
  const prevSpecKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (isDelta) {
      if (!deltaSpec) return;
      const key = `delta:${deltaSpec.minOrderSizeContracts}:${deltaSpec.contractValue}`;
      if (prevSpecKeyRef.current === key && qtyStr !== "") return;
      prevSpecKeyRef.current = key;
      const minDisplay = contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec);
      setQtyStr(formatDeltaQty(minDisplay, deltaSpec));
      setQtyError(null);
    } else {
      if (!lotSpec) return;
      const key = `ctrader:${lotSpec.minLots}`;
      if (prevSpecKeyRef.current === key && qtyStr !== "") return;
      prevSpecKeyRef.current = key;
      setQtyStr(formatLots(lotSpec.minLots, prec));
      setQtyError(null);
    }
  }, [isDelta, deltaSpec, lotSpec, prec, qtyStr]);

  // Parsed displayed quantity (number) — used for all calculations
  const currentQty = useMemo(() => {
    const v = parseFloat(qtyStr);
    if (isDelta) {
      const minDisplay = deltaSpec ? contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec) : 1;
      return isNaN(v) || v <= 0 ? minDisplay : v;
    }
    return isNaN(v) || v <= 0 ? (lotSpec?.minLots ?? 0.01) : v;
  }, [qtyStr, isDelta, deltaSpec, lotSpec]);

  // Snap and validate the current qty using ONLY the active broker's own rules
  const validateQty = useCallback((qty: number): string | null => {
    if (isDelta) {
      if (!deltaSpec) return null;
      const contracts = displayQtyToContracts(qty, deltaSpec);
      const minDisplay = contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec);
      const maxDisplay = contractsToDisplayQty(deltaSpec.maxOrderSizeContracts, deltaSpec);
      if (contracts < deltaSpec.minOrderSizeContracts) {
        return `Minimum is ${formatDeltaQty(minDisplay, deltaSpec)} ${deltaUnitLabel(deltaSpec)}`;
      }
      if (contracts > deltaSpec.maxOrderSizeContracts) {
        return `Maximum is ${formatDeltaQty(maxDisplay, deltaSpec)} ${deltaUnitLabel(deltaSpec)}`;
      }
      if (!isValidContracts(contracts, deltaSpec)) {
        return `Must be a whole number of contracts`;
      }
      return null;
    }
    if (!lotSpec) return null;
    if (qty < lotSpec.minLots) {
      return `Minimum is ${formatLots(lotSpec.minLots, prec)} lots`;
    }
    if (qty > lotSpec.maxLots) {
      return `Maximum is ${formatLots(lotSpec.maxLots, prec)} lots`;
    }
    if (!isValidLots(qty, lotSpec)) {
      const snapped = snapToStep(qty, lotSpec);
      return `Must be a multiple of ${formatLots(lotSpec.stepLots, prec)} — nearest valid: ${formatLots(snapped, prec)}`;
    }
    return null;
  }, [isDelta, deltaSpec, lotSpec, prec]);

  const snapCurrentQty = useCallback((raw: number): number => {
    if (isDelta) {
      if (!deltaSpec) return raw;
      const contracts = snapContracts(displayQtyToContracts(raw, deltaSpec), deltaSpec);
      return contractsToDisplayQty(contracts, deltaSpec);
    }
    return lotSpec ? snapToStep(raw, lotSpec) : raw;
  }, [isDelta, deltaSpec, lotSpec]);

  const handleQtyBlur = useCallback(() => {
    if (isDelta ? !deltaSpec : !lotSpec) return;
    const raw = parseFloat(qtyStr);
    if (isNaN(raw) || raw <= 0) {
      const fallback = isDelta && deltaSpec
        ? formatDeltaQty(contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec), deltaSpec)
        : lotSpec ? formatLots(lotSpec.minLots, prec) : "";
      setQtyStr(fallback);
      setQtyError(null);
      return;
    }
    const snapped   = snapCurrentQty(raw);
    const formatted = isDelta && deltaSpec ? formatDeltaQty(snapped, deltaSpec) : formatLots(snapped, prec);
    setQtyStr(formatted);
    setQtyError(validateQty(snapped));
  }, [qtyStr, isDelta, deltaSpec, lotSpec, prec, snapCurrentQty, validateQty]);

  const handleDecrement = useCallback(() => {
    if (isDelta) {
      if (!deltaSpec) return;
      const contracts = displayQtyToContracts(currentQty, deltaSpec);
      const next = decrementContracts(contracts, deltaSpec);
      setQtyStr(formatDeltaQty(contractsToDisplayQty(next, deltaSpec), deltaSpec));
      setQtyError(null);
      return;
    }
    if (!lotSpec) return;
    const next = decrementLots(currentQty, lotSpec);
    setQtyStr(formatLots(next, prec));
    setQtyError(null);
  }, [currentQty, isDelta, deltaSpec, lotSpec, prec]);

  const handleIncrement = useCallback(() => {
    if (isDelta) {
      if (!deltaSpec) return;
      const contracts = displayQtyToContracts(currentQty, deltaSpec);
      const next = incrementContracts(contracts, deltaSpec);
      setQtyStr(formatDeltaQty(contractsToDisplayQty(next, deltaSpec), deltaSpec));
      setQtyError(null);
      return;
    }
    if (!lotSpec) return;
    const next = incrementLots(currentQty, lotSpec);
    setQtyStr(formatLots(next, prec));
    setQtyError(null);
  }, [currentQty, isDelta, deltaSpec, lotSpec, prec]);

  // ── Derived financial values ───────────────────────────────────────────────
  const accountLeverage = spec?.leverage ?? (spec?.maxLeverageNum && spec.maxLeverageNum > 0 ? spec.maxLeverageNum : 1);
  const calcs = useMemo(() => {
    if (isDelta) {
      if (!deltaSpec) return null;
      const contracts = displayQtyToContracts(currentQty, deltaSpec);
      const r = calcDeltaAll(contracts, livePrice, accountLeverage, deltaSpec);
      return { margin: r.margin, posValue: r.posValue, pipVal: null, units: contracts };
    }
    if (!lotSpec) return null;
    return calcAll(currentQty, livePrice, lotSpec);
  }, [isDelta, deltaSpec, lotSpec, currentQty, livePrice, accountLeverage]);

  // ── Order form state ──────────────────────────────────────────────────────
  const [side,       setSide]      = useState<"Buy" | "Sell">("Buy");
  const [orderType,  setOrderType] = useState<"Market" | "Limit">("Market");
  const [price,      setPrice]     = useState("");
  const [stopLoss,   setStopLoss]  = useState("");
  const [takeProfit, setTakeProfit]= useState("");
  const [status,     setStatus]    = useState<"idle" | "loading" | "success" | "error">("idle");
  const [msg,        setMsg]       = useState("");

  // ── Submit ────────────────────────────────────────────────────────────────
  // RN: plain async function — no React.FormEvent / e.preventDefault() needed
  const handleSubmit = async () => {
    const activeSpecOk = isDelta ? !!deltaSpec : !!lotSpec;
    if (!activeSpecOk) return;
    const snapped = snapCurrentQty(currentQty);
    const err = validateQty(snapped);
    if (err) { setQtyError(err); return; }

    // Delta orders are submitted as an integer contract count; cTrader as lots.
    const qtyForOrder = isDelta && deltaSpec
      ? String(displayQtyToContracts(snapped, deltaSpec))
      : formatLots(snapped, prec);

    setStatus("loading");
    setMsg("");
    const result = await placeOrder({
      symbol,
      side,
      orderType,
      qty:        qtyForOrder,
      price:      orderType === "Limit" && price ? price : undefined,
      stopLoss:   stopLoss    || undefined,
      takeProfit: takeProfit  || undefined,
      category:   "linear",
    });
    if (result.ok) {
      setStatus("success");
      setMsg("Order placed successfully!");
      const resetQty = isDelta && deltaSpec
        ? formatDeltaQty(contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec), deltaSpec)
        : lotSpec ? formatLots(lotSpec.minLots, prec) : "";
      setQtyStr(resetQty);
      setPrice(""); setStopLoss(""); setTakeProfit("");
      setTimeout(() => setStatus("idle"), 2500);
    } else {
      setStatus("error");
      setMsg(result.error ?? "Order failed");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  // ── Derived display values ────────────────────────────────────────────────
  const sideColor   = side === "Buy" ? BUY_CLR : SELL_CLR;
  const specDisabled = isDelta ? !deltaSpec : !lotSpec;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="cart-outline" size={14} color={ACCENT} />
          <Text style={styles.headerTitle}>Place Order</Text>
          <View style={styles.symbolBadge}>
            <Text style={styles.symbolBadgeText}>{symbol}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {/* Refresh spec */}
          <Pressable
            onPress={() => { setSpec(null); fetchSpec(symbol); }}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            hitSlop={8}
            accessibilityLabel="Refresh symbol spec"
          >
            <Ionicons name="refresh-outline" size={12} color={TEXT_DIM} />
          </Pressable>
          <Pressable
            onPress={() => setShowPlaceOrder(false)}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
            hitSlop={8}
          >
            <Ionicons name="close" size={14} color={TEXT_DIM} />
          </Pressable>
        </View>
      </View>

      {/* Scrollable form body */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Live price */}
          {livePrice && (
            <View style={styles.livePriceRow}>
              <Text style={styles.livePriceLabel}>Live: </Text>
              <Text style={styles.livePriceValue}>
                {livePrice.toLocaleString("en-US", {
                  minimumFractionDigits: spec?.digits ?? 2,
                  maximumFractionDigits: spec?.digits ?? 5,
                })}
              </Text>
            </View>
          )}

          {/* Side toggle (Buy / Sell) */}
          <View style={styles.toggleRow}>
            {(["Buy", "Sell"] as const).map(s => (
              <Pressable
                key={s}
                onPress={() => setSide(s)}
                style={[
                  styles.toggleBtn,
                  side === s && (s === "Buy" ? styles.toggleBtnBuyActive : styles.toggleBtnSellActive),
                ]}
              >
                <Text style={[
                  styles.toggleBtnText,
                  side === s
                    ? { color: s === "Buy" ? BUY_CLR : SELL_CLR }
                    : { color: TEXT_DIM },
                ]}>
                  {s}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Order type toggle (Market / Limit) */}
          <View style={styles.typeToggleRow}>
            {(["Market", "Limit"] as const).map(t => (
              <Pressable
                key={t}
                onPress={() => setOrderType(t)}
                style={[
                  styles.typeToggleBtn,
                  orderType === t && styles.typeToggleBtnActive,
                ]}
              >
                <Text style={[
                  styles.typeToggleBtnText,
                  orderType === t ? { color: ACCENT } : { color: TEXT_DIM },
                ]}>
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Quantity ─────────────────────────────────────────────────── */}
          <View style={styles.section}>
            {/* Label row */}
            <View style={styles.labelRow}>
              <Text style={styles.label}>Quantity ({unitLabel})</Text>
              {specLoading && (
                <View style={styles.specLoadingRow}>
                  <ActivityIndicator size={10} color={TEXT_DIM} />
                  <Text style={styles.specLoadingText}>Loading spec…</Text>
                </View>
              )}
              {specError && !specLoading && (
                <Text style={styles.specErrorText}>Spec unavailable</Text>
              )}
            </View>

            {/* [−] qty [+] — tablet-optimized: 48×48 touch targets */}
            <View style={styles.qtyRow}>
              <Pressable
                onPress={handleDecrement}
                disabled={specDisabled}
                style={({ pressed }) => [
                  styles.stepperBtn,
                  specDisabled && styles.stepperBtnDisabled,
                  pressed && !specDisabled && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="remove-outline" size={18} color={TEXT_HI} />
              </Pressable>

              <TextInput
                value={qtyStr}
                onChangeText={t => { setQtyStr(t); setQtyError(null); }}
                onBlur={handleQtyBlur}
                keyboardType="decimal-pad"
                returnKeyType="done"
                style={[
                  styles.qtyInput,
                  qtyError ? styles.qtyInputError : styles.qtyInputNormal,
                ]}
                placeholderTextColor="rgba(167,184,169,0.3)"
              />

              <Pressable
                onPress={handleIncrement}
                disabled={specDisabled}
                style={({ pressed }) => [
                  styles.stepperBtn,
                  specDisabled && styles.stepperBtnDisabled,
                  pressed && !specDisabled && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="add-outline" size={18} color={TEXT_HI} />
              </Pressable>
            </View>

            {/* Validation error */}
            {qtyError && (
              <Text style={styles.errorText}>{qtyError}</Text>
            )}

            {/* Lot equivalent line */}
            {isDelta && deltaSpec && (
              <Text style={styles.hintLine}>
                {formatDeltaLotEquivalent(deltaSpec)}
              </Text>
            )}
            {!isDelta && lotSpec && (
              <Text style={styles.hintLine}>
                {formatLotEquivalent(lotSpec.lotSize)}
              </Text>
            )}

            {/* Spec hints: Min · Max · Step */}
            {isDelta && deltaSpec && (
              <Text style={styles.specHint}>
                Min {formatDeltaQty(contractsToDisplayQty(deltaSpec.minOrderSizeContracts, deltaSpec), deltaSpec)}
                {" · "}Max {formatDeltaQty(contractsToDisplayQty(deltaSpec.maxOrderSizeContracts, deltaSpec), deltaSpec)}
                {" · "}Step {formatDeltaQty(contractsToDisplayQty(deltaSpec.stepSizeContracts, deltaSpec), deltaSpec)}
              </Text>
            )}
            {!isDelta && lotSpec && (
              <Text style={styles.specHint}>
                Min {formatLots(lotSpec.minLots, prec)}
                {" · "}Max {lotSpec.maxLots}
                {" · "}Step {formatLots(lotSpec.stepLots, prec)}
              </Text>
            )}
          </View>

          {/* ── Margin / Position calculations ───────────────────────────── */}
          {isDelta && deltaSpec && calcs && (
            <View style={styles.calcGrid}>
              {calcs.margin !== null && (
                <CalcRow label="Req. Margin"
                  value={formatDeltaCurrency(calcs.margin)}
                  note={`@ 1:${accountLeverage}`} />
              )}
              {calcs.posValue !== null && (
                <CalcRow label="Position Value"
                  value={formatDeltaCurrency(calcs.posValue)} />
              )}
              <CalcRow label="Contracts"
                value={String(calcs.units)} />
            </View>
          )}
          {!isDelta && lotSpec && calcs && (
            <View style={styles.calcGrid}>
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
            </View>
          )}
          {specLoading && !lotSpec && !deltaSpec && (
            <View style={styles.calcLoadingBox}>
              <Text style={styles.calcLoadingText}>Loading margin data…</Text>
            </View>
          )}

          {/* Limit price */}
          {orderType === "Limit" && (
            <View style={styles.section}>
              <Text style={styles.label}>Limit Price</Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder={livePrice ? livePrice.toFixed(spec?.digits ?? 2) : "0"}
                placeholderTextColor="rgba(167,184,169,0.3)"
                keyboardType="decimal-pad"
                returnKeyType="done"
                style={styles.textInput}
              />
            </View>
          )}

          {/* SL / TP — 2-column grid */}
          <View style={styles.slTpRow}>
            <View style={styles.slTpCell}>
              <Text style={styles.label}>Stop Loss</Text>
              <TextInput
                value={stopLoss}
                onChangeText={setStopLoss}
                placeholder="Optional"
                placeholderTextColor="rgba(167,184,169,0.3)"
                keyboardType="decimal-pad"
                returnKeyType="done"
                style={styles.textInput}
              />
            </View>
            <View style={styles.slTpCell}>
              <Text style={styles.label}>Take Profit</Text>
              <TextInput
                value={takeProfit}
                onChangeText={setTakeProfit}
                placeholder="Optional"
                placeholderTextColor="rgba(167,184,169,0.3)"
                keyboardType="decimal-pad"
                returnKeyType="done"
                style={styles.textInput}
              />
            </View>
          </View>

          {/* Status messages */}
          {status === "success" && (
            <View style={styles.successMsg}>
              <Ionicons name="checkmark-circle-outline" size={14} color={ACCENT} style={{ flexShrink: 0 }} />
              <Text style={[styles.statusMsgText, { color: ACCENT }]}>{msg}</Text>
            </View>
          )}
          {status === "error" && (
            <View style={styles.errorMsg}>
              <Ionicons name="close-circle-outline" size={14} color="#ef4444" style={{ flexShrink: 0 }} />
              <Text style={[styles.statusMsgText, { color: SELL_CLR }]}>{msg}</Text>
            </View>
          )}

          {/* Submit button — minimum 48px height for touch safety */}
          <Pressable
            onPress={() => { void handleSubmit(); }}
            disabled={status === "loading" || specDisabled || !!qtyError}
            style={({ pressed }) => [
              styles.submitBtn,
              side === "Buy" ? styles.submitBtnBuy : styles.submitBtnSell,
              (specDisabled || !!qtyError) && styles.submitBtnDisabled,
              pressed && !(specDisabled || !!qtyError) && { opacity: 0.85 },
            ]}
          >
            {status === "loading" ? (
              <>
                <ActivityIndicator size={14} color={sideColor} />
                <Text style={[styles.submitBtnText, { color: sideColor }]}>Placing…</Text>
              </>
            ) : (
              <Text style={[
                styles.submitBtnText,
                { color: (specDisabled || !!qtyError) ? "rgba(167,184,169,0.35)" : sideColor },
              ]}>
                {side} {orderType}
              </Text>
            )}
          </Pressable>

          {/* Spec source tag */}
          {spec && !specLoading && (
            <Text style={styles.specSourceTag}>
              Spec via {spec.broker === "ctrader" ? "cTrader ProtoOA" : "Delta REST"}
              {" · "}Updated {new Date(spec.fetchedAt).toLocaleTimeString()}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── CalcRow sub-component ─────────────────────────────────────────────────────

function CalcRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={calcRowStyles.container}>
      <Text style={calcRowStyles.label}>{label}</Text>
      <Text style={calcRowStyles.value}>{value}</Text>
      {note && <Text style={calcRowStyles.note}>{note}</Text>}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Container ──────────────────────────────────────────────────────────────
  container: {
    flex:            1,
    backgroundColor: "rgba(5,14,10,0.98)",
    borderWidth:     1,
    borderColor:     BORDER_DIM,
    borderRadius:    16,
    overflow:        "hidden",
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_DIM,
    flexShrink:        0,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  headerTitle: {
    fontSize:   12,
    fontWeight: "700",
    color:      TEXT_HI,
  },
  symbolBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      5,
    backgroundColor:   ACCENT_BG,
  },
  symbolBadgeText: {
    fontSize:   10,
    fontWeight: "700",
    color:      ACCENT,
  },
  headerRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
  },
  iconBtn: {
    width:          24,
    height:         24,
    borderRadius:   6,
    alignItems:     "center",
    justifyContent: "center",
  },

  // ── Body ───────────────────────────────────────────────────────────────────
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:     24,
    gap:               12,
  },

  // ── Live price ─────────────────────────────────────────────────────────────
  livePriceRow: {
    flexDirection:  "row",
    alignItems:     "baseline",
    justifyContent: "center",
    paddingVertical: 4,
  },
  livePriceLabel: {
    fontSize: 11,
    color:    TEXT_DIM,
  },
  livePriceValue: {
    fontSize:   13,
    fontWeight: "700",
    color:      ACCENT,
  },

  // ── Side toggle ────────────────────────────────────────────────────────────
  toggleRow: {
    flexDirection: "row",
    borderRadius:  12,
    borderWidth:   1,
    borderColor:   BORDER_CLR,
    overflow:      "hidden",
  },
  toggleBtn: {
    flex:           1,
    minHeight:      44,
    alignItems:     "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  toggleBtnBuyActive: {
    backgroundColor: "rgba(74,222,128,0.20)",
  },
  toggleBtnSellActive: {
    backgroundColor: "rgba(248,113,113,0.20)",
  },
  toggleBtnText: {
    fontSize:   12,
    fontWeight: "700",
  },

  // ── Order type toggle ──────────────────────────────────────────────────────
  typeToggleRow: {
    flexDirection: "row",
    borderRadius:  12,
    borderWidth:   1,
    borderColor:   BORDER_CLR,
    overflow:      "hidden",
  },
  typeToggleBtn: {
    flex:           1,
    height:         36,
    alignItems:     "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  typeToggleBtnActive: {
    backgroundColor: ACCENT_BG,
  },
  typeToggleBtnText: {
    fontSize:   11,
    fontWeight: "600",
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    gap: 6,
  },

  // ── Label row ─────────────────────────────────────────────────────────────
  labelRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
  },
  label: {
    fontSize:   10,
    fontWeight: "600",
    color:      TEXT_DIM,
  },
  specLoadingRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
  },
  specLoadingText: {
    fontSize: 10,
    color:    TEXT_DIM,
  },
  specErrorText: {
    fontSize: 10,
    color:    SELL_CLR,
  },

  // ── Quantity row ───────────────────────────────────────────────────────────
  qtyRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           10,
  },
  stepperBtn: {
    width:          48,
    height:         48,
    borderRadius:   10,
    flexShrink:     0,
    backgroundColor: BG,
    borderWidth:    1,
    borderColor:    BORDER_CLR,
    alignItems:     "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  qtyInput: {
    flex:          1,
    height:        48,
    borderRadius:  10,
    borderWidth:   1,
    backgroundColor: BG,
    color:         TEXT_HI,
    fontSize:      18,
    fontWeight:    "700",
    textAlign:     "center",
    paddingHorizontal: 8,
  },
  qtyInputNormal: {
    borderColor: BORDER_CLR,
  },
  qtyInputError: {
    borderColor: "rgba(239,68,68,0.6)",
  },

  // ── Error / hint lines ─────────────────────────────────────────────────────
  errorText: {
    fontSize: 10,
    color:    SELL_CLR,
  },
  hintLine: {
    fontSize:   10,
    fontWeight: "600",
    color:      TEXT_DIM,
  },
  specHint: {
    fontSize: 9,
    color:    "rgba(167,184,169,0.35)",
  },

  // ── Calc grid ──────────────────────────────────────────────────────────────
  calcGrid: {
    borderRadius:    8,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.06)",
    padding:         10,
    flexDirection:   "row",
    flexWrap:        "wrap",
    gap:             10,
  },
  calcLoadingBox: {
    borderRadius:    8,
    backgroundColor: "rgba(255,255,255,0.025)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.06)",
    padding:         10,
    alignItems:      "center",
  },
  calcLoadingText: {
    fontSize: 10,
    color:    TEXT_DIM,
  },

  // ── Text inputs (limit price, SL, TP) ──────────────────────────────────────
  textInput: {
    height:          40,
    borderRadius:    8,
    borderWidth:     1,
    borderColor:     BORDER_CLR,
    backgroundColor: BG,
    color:           TEXT_HI,
    fontSize:        12,
    paddingHorizontal: 10,
  },

  // ── SL/TP row ──────────────────────────────────────────────────────────────
  slTpRow: {
    flexDirection: "row",
    gap:           8,
  },
  slTpCell: {
    flex: 1,
    gap:  4,
  },

  // ── Status messages ────────────────────────────────────────────────────────
  successMsg: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius:    10,
    backgroundColor: ACCENT_BG,
    borderWidth:     1,
    borderColor:     ACCENT_BORD,
  },
  errorMsg: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius:    10,
    backgroundColor: "rgba(239,68,68,0.08)",
    borderWidth:     1,
    borderColor:     "rgba(239,68,68,0.2)",
  },
  statusMsgText: {
    flex:     1,
    fontSize: 11,
  },

  // ── Submit button ──────────────────────────────────────────────────────────
  submitBtn: {
    minHeight:      48,
    borderRadius:   12,
    alignItems:     "center",
    justifyContent: "center",
    flexDirection:  "row",
    gap:            8,
    borderWidth:    1,
  },
  submitBtnBuy: {
    backgroundColor: "rgba(74,222,128,0.20)",
    borderColor:     "rgba(74,222,128,0.30)",
  },
  submitBtnSell: {
    backgroundColor: "rgba(248,113,113,0.20)",
    borderColor:     "rgba(248,113,113,0.30)",
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    fontSize:   13,
    fontWeight: "700",
  },

  // ── Spec source tag ────────────────────────────────────────────────────────
  specSourceTag: {
    fontSize:  9,
    color:     "rgba(167,184,169,0.25)",
    textAlign: "center",
  },
});

const calcRowStyles = StyleSheet.create({
  container: {
    minWidth: "40%",
  },
  label: {
    fontSize:     9,
    color:        "rgba(167,184,169,0.45)",
    marginBottom: 1,
  },
  value: {
    fontSize:   11,
    fontWeight: "700",
    color:      TEXT_HI,
  },
  note: {
    fontSize: 9,
    color:    "rgba(167,184,169,0.35)",
  },
});
