/**
 * app/position/[id].tsx — Position Detail Screen
 *
 * React Native port of artifacts/trading-journal/src/pages/position-detail.tsx
 *
 * Web → RN replacements:
 *   div / span / button / input  → View / Text / Pressable / TextInput
 *   CSS className / inline style → StyleSheet.create()
 *   dash-account-card class      → equivalent StyleSheet card style
 *   var(--stat-value)            → VALUE = "#E8E8E8"
 *   var(--stat-sub)              → MUTED = "#8A8A8A"
 *   useLocation / navigate()     → router.back()
 *   overflow-y-auto div          → ScrollView
 *   fixed overlay modals         → React Native Modal (transparent)
 *   lucide icons                 → Ionicons (@expo/vector-icons)
 *   ChevronDown rotate CSS       → inline transform style with state
 *   onMouseDown preventDefault   → removed (no hover/mouse in RN)
 *   overscrollBehavior: contain  → removed (handled natively by ScrollView)
 *   fontFamily CSS string        → Inter font family constants
 *
 * All business logic preserved exactly:
 *   - useSelectedPositionStore: position read + cleanup on unmount
 *   - useEffect to init tpValue / slValue from position.raw
 *   - symKey derivation: symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD"
 *   - livePrice: ticks[symKey]?.price ?? position.markPrice
 *   - pnlUsd / pnlInr / pnlPct calculation (Long/Short direction-aware)
 *   - pnlColor / sideColor
 *   - liqPrice: raw?.liquidation_price ?? raw?.liq_price
 *   - marginUsed: raw?.margin ?? raw?.usedMargin ?? ... leverage fallback
 *   - openedAt: multi-field raw probe
 *   - posValue / positionId / brokerLabel
 *   - canUpdate / canClose
 *   - pctChips: [0.25, 0.5, 1, 2]
 *   - pnlAtPrice / tpPriceForPct / slPriceForPct helpers
 *   - tpPnlPreview / slPnlPreview
 *   - handleClose: closePosition → router.back()
 *   - handleUpdateTpSl: placeOrder with TP and SL bracket orders
 *   - tradeRows array with all position detail fields
 *   - Position Details card: collapsible (detailsOpen state)
 *   - Bracket Order card: collapsible (bracketOpen state)
 *   - Close Confirmation Modal
 *   - TP/SL Confirmation Modal
 *   - Empty state when no position is selected
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelectedPositionStore } from "@/store/selectedPositionStore";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { useCurrencyStore } from "@/store/currencyStore";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (preserved exactly from web position-detail.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const BG         = "#000000";
const CARD       = "#151515";
const BORDER     = "#252525";
const MUTED      = "#8A8A8A";
const VALUE      = "#E8E8E8";
const TITLE      = "#F3F3F3";
const GREEN      = "#35C37A";
const RED        = "#E0524F";
const ORANGE     = "#C6862F";
const RADIUS     = 20;

const USD_TO_INR_FALLBACK = 85;

// ─────────────────────────────────────────────────────────────────────────────
// Formatters (preserved exactly from web)
// ─────────────────────────────────────────────────────────────────────────────

function fmt(v: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

function fmtCompact(v: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fUSD(v: number, sign = false): string {
  const abs = Math.abs(v);
  const str = "$" + fmt(abs);
  if (sign && v > 0) return "+" + str;
  if (v < 0) return "-" + str;
  return str;
}

function fINR(v: number, sign = false): string {
  const abs = Math.abs(v);
  const str = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  if (sign && v > 0) return "+" + str;
  if (v < 0) return "-" + str;
  return str;
}

function formatDate(ts: string | number | undefined): string {
  if (!ts) return "—";
  try {
    // Numeric timestamps: cTrader/MT5 time_msc = ms (> ~1e12), others = seconds
    const d = new Date(
      typeof ts === "number" ? (ts > 1e12 ? ts : ts * 1000) : ts,
    );
    const now = new Date();
    const isToday =
      d.getDate()     === now.getDate()     &&
      d.getMonth()    === now.getMonth()    &&
      d.getFullYear() === now.getFullYear();
    const time = d.toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
    return isToday
      ? `Today ${time}`
      : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
  } catch { return "—"; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge (RN equivalent of web's <Badge> span)
// ─────────────────────────────────────────────────────────────────────────────

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <View
      style={[
        badgeStyles.badge,
        {
          backgroundColor: color ? color + "0A" : "rgba(255,255,255,0.04)",
          borderColor:     color ? color + "35" : BORDER,
        },
      ]}
    >
      <Text style={[badgeStyles.text, { color: color ?? MUTED }]}>
        {children}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Segmented — Market / Limit order type selector
// ─────────────────────────────────────────────────────────────────────────────

function Segmented({
  value,
  onChange,
  accent,
}: {
  value:    "Market" | "Limit";
  onChange: (v: "Market" | "Limit") => void;
  accent:   string;
}) {
  return (
    <View style={segStyles.wrap}>
      {(["Market", "Limit"] as const).map(opt => (
        <Pressable
          key={opt}
          onPress={() => onChange(opt)}
          style={[
            segStyles.btn,
            value === opt && { backgroundColor: accent + "20" },
          ]}
        >
          <Text style={[
            segStyles.btnText,
            { color: value === opt ? accent : MUTED },
          ]}>
            {opt}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const segStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2B2B2B",
    padding: 2,
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  btnText: {
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PctChip — percentage preset button
// ─────────────────────────────────────────────────────────────────────────────

function PctChip({
  label,
  onPress,
}: {
  label:   string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pctStyles.chip, pressed && { opacity: 0.7 }]}
    >
      <Text style={pctStyles.chipText}>{label}</Text>
    </Pressable>
  );
}

const pctStyles = StyleSheet.create({
  chip: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#2B2B2B",
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#B8B8B8",
    fontFamily: "Inter_600SemiBold",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PositionDetailScreen — main component
// ─────────────────────────────────────────────────────────────────────────────

export default function PositionDetailScreen() {
  const insets = useSafeAreaInsets();

  const position = useSelectedPositionStore(s => s.position);

  const closePosition    = useBrokerStore(s => s.closePosition);
  const placeOrder       = useBrokerStore(s => s.placeOrder);
  const connectionStatus = useBrokerStore(s => s.connectionStatus);
  const activeBrokerId   = useBrokerStore(s => s.activeAccount?.broker_id ?? "");

  const ticks = useTickStore(s => s.ticks);
  const xr    = useCurrencyStore(s => s.exchangeRate) || USD_TO_INR_FALLBACK;

  const [tpValue,           setTpValue]           = useState("");
  const [slValue,           setSlValue]           = useState("");
  const [closing,           setClosing]           = useState(false);
  const [updating,          setUpdating]          = useState(false);
  const [detailsOpen,       setDetailsOpen]       = useState(false);
  const [showCloseConfirm,  setShowCloseConfirm]  = useState(false);
  const [tpOrderType,       setTpOrderType]       = useState<"Market" | "Limit">("Market");
  const [slOrderType,       setSlOrderType]       = useState<"Market" | "Limit">("Market");
  const [tpLimitPrice,      setTpLimitPrice]      = useState("");
  const [slLimitPrice,      setSlLimitPrice]      = useState("");
  const [showTpSlConfirm,   setShowTpSlConfirm]   = useState(false);
  const [bracketOpen,       setBracketOpen]       = useState(false);

  // Clear the selected position only when this page unmounts — clearing it
  // eagerly before unmount causes a visible flash to the empty state during
  // the transition animation. Matches web behaviour exactly.
  useEffect(() => {
    return () => { useSelectedPositionStore.getState().setPosition(null); };
  }, []);

  // Initialise TP / SL inputs from the position's raw broker payload
  useEffect(() => {
    if (!position) return;
    const raw = position.raw as Record<string, unknown> | null;
    setTpValue(raw?.take_profit ? String(raw.take_profit) : "");
    setSlValue(raw?.stop_loss   ? String(raw.stop_loss)   : "");
  }, [position?.id]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!position) {
    return (
      <View style={[emptyStyles.root, { paddingTop: insets.top }]}>
        <Ionicons name="warning-outline" size={32} color={MUTED} />
        <Text style={emptyStyles.label}>No position selected</Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [emptyStyles.btn, pressed && { opacity: 0.7 }]}
        >
          <Text style={emptyStyles.btnText}>← Back to Portfolio</Text>
        </Pressable>
      </View>
    );
  }

  // ── Derived values (preserved exactly from web) ───────────────────────────
  const symKey    = position.symbol
    .replace(/USDT$|USD$|PERP$/, "")
    .replace(/-/g, "") + "USD";
  const livePrice = ticks[symKey]?.price ?? position.markPrice;

  const pnlUsd = position.side === "Long"
    ? (livePrice - position.entryPrice) * position.size
    : (position.entryPrice - livePrice) * position.size;
  const pnlInr  = pnlUsd * xr;
  const pnlPct  = position.entryPrice > 0
    ? (Math.abs(pnlUsd) / (position.entryPrice * position.size)) * 100 *
      (pnlUsd >= 0 ? 1 : -1)
    : 0;

  const isProfit  = pnlUsd >= 0;
  const pnlColor  = isProfit ? GREEN : RED;
  const sideColor = position.side === "Long" ? GREEN : RED;

  const raw         = position.raw as Record<string, unknown> | null;

  // Field names differ per broker raw payload (Delta / cTrader / MT5)
  const liqPriceRaw = raw?.liquidation_price ?? raw?.liq_price ?? null;
  const liqPrice    = liqPriceRaw !== null && liqPriceRaw !== undefined
    ? Number(liqPriceRaw) : null;

  const marginRaw  = raw?.margin ?? raw?.usedMargin ?? raw?.used_margin ??
    raw?.maintenance_margin ?? null;
  const marginUsed = marginRaw !== null && marginRaw !== undefined && marginRaw !== ""
    ? Number(marginRaw)
    : (position.leverage && Number(position.leverage) > 0
        ? (position.size * position.entryPrice) / Number(position.leverage)
        : null);

  const openedAt = (raw?.created_at ?? raw?.updated_at ?? raw?.openTimestamp ??
    raw?.open_timestamp ?? raw?.time_msc ?? raw?.time ?? raw?.setupTime ?? null) as
    string | number | null;

  const posValue   = position.size * position.entryPrice;
  const positionId = raw?.id ?? raw?.order_id ?? raw?.position_id ??
    raw?.product_id ?? raw?.positionId ?? null;

  const brokerLabel =
    activeBrokerId === "delta"   ? "Delta Exchange" :
    activeBrokerId === "ctrader" ? "cTrader"        :
    activeBrokerId === "mt5"     ? "MetaTrader 5"   : "Exchange";

  const canUpdate = (!!tpValue || !!slValue) && !updating;
  const canClose  = !closing && connectionStatus === "connected";

  // ── Bracket order helpers (preserved exactly from web) ────────────────────
  const pctChips = [0.25, 0.5, 1, 2];

  function pnlAtPrice(price: number): number {
    return position!.side === "Long"
      ? (price - position!.entryPrice) * position!.size
      : (position!.entryPrice - price) * position!.size;
  }

  function tpPriceForPct(pct: number): number {
    return position!.side === "Long"
      ? position!.entryPrice * (1 + pct / 100)
      : position!.entryPrice * (1 - pct / 100);
  }

  function slPriceForPct(pct: number): number {
    return position!.side === "Long"
      ? position!.entryPrice * (1 - pct / 100)
      : position!.entryPrice * (1 + pct / 100);
  }

  const tpPnlPreview = tpValue ? pnlAtPrice(parseFloat(tpValue)) : null;
  const slPnlPreview = slValue ? pnlAtPrice(parseFloat(slValue)) : null;

  // ── Handlers (preserved exactly from web) ─────────────────────────────────
  async function handleClose(): Promise<void> {
    if (closing || connectionStatus !== "connected") return;
    setClosing(true);
    try {
      await closePosition(position!);
      router.back();
    } catch { /* toast handled by broker service */ }
    finally { setClosing(false); setShowCloseConfirm(false); }
  }

  async function handleUpdateTpSl(): Promise<void> {
    if (updating) return;
    if (!tpValue && !slValue) return;
    setUpdating(true);
    try {
      const exitSide = position!.side === "Long" ? "Sell" : "Buy";
      if (tpValue) {
        await placeOrder({
          symbol:     position!.symbol,
          side:       exitSide,
          orderType:  tpOrderType,
          qty:        String(position!.size),
          ...(tpOrderType === "Limit" ? { price: tpLimitPrice || tpValue } : {}),
          takeProfit: tpValue,
        });
      }
      if (slValue) {
        await placeOrder({
          symbol:     position!.symbol,
          side:       exitSide,
          orderType:  slOrderType,
          qty:        String(position!.size),
          ...(slOrderType === "Limit" ? { price: slLimitPrice || slValue } : {}),
          stopLoss:   slValue,
        });
      }
    } catch { /* toast handled by broker service */ }
    finally { setUpdating(false); setShowTpSlConfirm(false); }
  }

  // ── Trade detail rows (preserved exactly from web) ────────────────────────
  type Row = { label: string; value: string; valueColor?: string };
  const tradeRows: Row[] = [
    { label: "Entry Price",       value: fmtCompact(position.entryPrice) },
    { label: "Mark Price",        value: fmtCompact(livePrice) },
    {
      label:      "Liquidation Price",
      value:      liqPrice !== null ? fmtCompact(liqPrice) : "—",
      valueColor: liqPrice !== null ? ORANGE : undefined,
    },
    {
      label: "Position Size",
      value: `${position.size} ${position.symbol.replace(/USDT$|USD$|PERP$/, "")}`,
    },
    { label: "Position Value", value: fUSD(posValue) },
    { label: "Margin Used",    value: marginUsed !== null ? fUSD(marginUsed) : "—" },
    { label: "Leverage",       value: position.leverage ? `${position.leverage}x` : "—" },
    { label: "Opened",         value: formatDate(openedAt as string | number | undefined) },
    ...(positionId
      ? [{ label: "Position ID", value: `#${String(positionId).slice(0, 12)}` }]
      : []),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[pdStyles.root, { paddingTop: insets.top }]}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={pdStyles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [pdStyles.backBtn, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={20} color={VALUE} />
        </Pressable>
        <Text style={pdStyles.headerTitle}>Position Details</Text>
        <View style={{ width: 32, height: 32 }} />
      </View>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <ScrollView
        style={pdStyles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, gap: 16 }}
      >

        {/* ── Top card ──────────────────────────────────────────────────────── */}
        <View style={pdStyles.card}>
          {/* Row 1: symbol + pills */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Text style={pdStyles.symbolText}>{position.symbol}</Text>
            <Badge color={sideColor}>{position.side === "Long" ? "LONG" : "SHORT"}</Badge>
            {position.leverage ? <Badge>{position.leverage}x</Badge> : null}
          </View>

          {/* Unrealized P&L label */}
          <Text style={pdStyles.pnlLabel}>Unrealized P&L</Text>

          {/* P&L value */}
          <Text style={[pdStyles.pnlValue, { color: pnlColor }]}>
            {fUSD(pnlUsd, true)}
          </Text>

          {/* INR + pct row */}
          <Text style={[pdStyles.pnlSub, { color: pnlColor }]}>
            {fINR(pnlInr, true)}
            <Text style={{ color: MUTED, fontWeight: "500" }}>
              {" · "}{pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
            </Text>
          </Text>

          {/* Mark price / Status grid */}
          <View style={pdStyles.subGrid}>
            <View style={[pdStyles.subCell, pdStyles.subCellBorder]}>
              <Text style={pdStyles.subLabel}>MARK PRICE</Text>
              <Text style={pdStyles.subValue}>{fmtCompact(livePrice)}</Text>
            </View>
            <View style={pdStyles.subCell}>
              <Text style={pdStyles.subLabel}>STATUS</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
                <Text style={[pdStyles.subValue, { color: GREEN }]}>Live</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Position Details card (collapsible) ──────────────────────────── */}
        <View style={pdStyles.cardDim}>
          <Pressable
            onPress={() => setDetailsOpen(o => !o)}
            style={pdStyles.collapseBtn}
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
          >
            <Text style={pdStyles.collapseLabel}>POSITION DETAILS</Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={MUTED}
              style={{ transform: [{ rotate: detailsOpen ? "180deg" : "0deg" }] }}
            />
          </Pressable>

          {detailsOpen && (
            <View>
              {tradeRows.map((row, i) => (
                <View
                  key={i}
                  style={[pdStyles.detailRow, { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" }]}
                >
                  <Text style={pdStyles.detailLabel}>{row.label}</Text>
                  <Text style={[pdStyles.detailValue, row.valueColor ? { color: row.valueColor } : null]}>
                    {row.value}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── Bracket Order card (collapsible) ─────────────────────────────── */}
        <View style={pdStyles.cardDim}>
          <Pressable
            onPress={() => setBracketOpen(o => !o)}
            style={pdStyles.collapseBtn}
            accessibilityRole="button"
            accessibilityState={{ expanded: bracketOpen }}
          >
            <Text style={pdStyles.collapseLabel}>BRACKET ORDER</Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={MUTED}
              style={{ transform: [{ rotate: bracketOpen ? "180deg" : "0deg" }] }}
            />
          </Pressable>

          {bracketOpen && (
            <View style={{ padding: 20, paddingTop: 0 }}>

              {/* Take Profit ─────────────────────────────────────────────── */}
              <View style={{ marginBottom: 9 }}>
                <View style={pdStyles.bracketRow}>
                  <Text style={[pdStyles.bracketSideLabel, { color: GREEN }]}>Take Profit</Text>
                  <Segmented value={tpOrderType} onChange={setTpOrderType} accent={GREEN} />
                </View>

                <View style={pdStyles.priceInput}>
                  <TextInput
                    style={pdStyles.priceInputText}
                    value={tpValue}
                    onChangeText={setTpValue}
                    placeholder="Trigger Price"
                    placeholderTextColor="#6E6E6E"
                    keyboardType="numeric"
                  />
                  <Text style={pdStyles.priceInputCcy}>USD</Text>
                </View>

                {tpOrderType === "Limit" && (
                  <View style={[pdStyles.priceInput, { marginTop: 7 }]}>
                    <TextInput
                      style={pdStyles.priceInputText}
                      value={tpLimitPrice}
                      onChangeText={setTpLimitPrice}
                      placeholder="Limit Price (optional)"
                      placeholderTextColor="#6E6E6E"
                      keyboardType="numeric"
                    />
                    <Text style={pdStyles.priceInputCcy}>USD</Text>
                  </View>
                )}

                <View style={pdStyles.pctRow}>
                  {pctChips.map(p => (
                    <PctChip
                      key={p}
                      label={`${p}%`}
                      onPress={() => setTpValue(tpPriceForPct(p).toFixed(2))}
                    />
                  ))}
                </View>

                <View style={pdStyles.pnlPreviewRow}>
                  <Text style={pdStyles.pnlPreviewLabel}>Estimated Exit PnL</Text>
                  <Text style={[
                    pdStyles.pnlPreviewValue,
                    tpPnlPreview !== null
                      ? { color: tpPnlPreview >= 0 ? GREEN : RED }
                      : { color: MUTED },
                  ]}>
                    {tpPnlPreview === null ? "—" : fUSD(tpPnlPreview, true)}
                  </Text>
                </View>
              </View>

              <View style={pdStyles.divider} />

              {/* Stop Loss ───────────────────────────────────────────────── */}
              <View>
                <View style={pdStyles.bracketRow}>
                  <Text style={[pdStyles.bracketSideLabel, { color: RED }]}>Stop Loss</Text>
                  <Segmented value={slOrderType} onChange={setSlOrderType} accent={RED} />
                </View>

                <View style={pdStyles.priceInput}>
                  <TextInput
                    style={pdStyles.priceInputText}
                    value={slValue}
                    onChangeText={setSlValue}
                    placeholder="Trigger Price"
                    placeholderTextColor="#6E6E6E"
                    keyboardType="numeric"
                  />
                  <Text style={pdStyles.priceInputCcy}>USD</Text>
                </View>

                {slOrderType === "Limit" && (
                  <View style={[pdStyles.priceInput, { marginTop: 7 }]}>
                    <TextInput
                      style={pdStyles.priceInputText}
                      value={slLimitPrice}
                      onChangeText={setSlLimitPrice}
                      placeholder="Limit Price (optional)"
                      placeholderTextColor="#6E6E6E"
                      keyboardType="numeric"
                    />
                    <Text style={pdStyles.priceInputCcy}>USD</Text>
                  </View>
                )}

                <View style={pdStyles.pctRow}>
                  {pctChips.map(p => (
                    <PctChip
                      key={p}
                      label={`${p}%`}
                      onPress={() => setSlValue(slPriceForPct(p).toFixed(2))}
                    />
                  ))}
                </View>

                <View style={pdStyles.pnlPreviewRow}>
                  <Text style={pdStyles.pnlPreviewLabel}>Estimated Stop PnL</Text>
                  <Text style={[
                    pdStyles.pnlPreviewValue,
                    slPnlPreview !== null
                      ? { color: slPnlPreview >= 0 ? GREEN : RED }
                      : { color: MUTED },
                  ]}>
                    {slPnlPreview === null ? "—" : fUSD(slPnlPreview, true)}
                  </Text>
                </View>
              </View>

              {/* Update TP/SL button */}
              <Pressable
                onPress={() => setShowTpSlConfirm(true)}
                disabled={!canUpdate}
                style={({ pressed }) => [
                  pdStyles.updateBtn,
                  !canUpdate && { opacity: 0.45 },
                  pressed && canUpdate && { opacity: 0.8 },
                ]}
              >
                <Text style={pdStyles.updateBtnText}>
                  {updating ? "Updating…" : "Update TP / SL"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* ── Close Position button ─────────────────────────────────────────── */}
        <Pressable
          onPress={() => setShowCloseConfirm(true)}
          disabled={!canClose}
          style={({ pressed }) => [
            pdStyles.closeBtn,
            !canClose && { backgroundColor: "#201012", borderColor: BORDER },
            pressed && canClose && { opacity: 0.8 },
          ]}
        >
          <Ionicons name="trash-outline" size={15} color={canClose ? "#FF6A6A" : MUTED} />
          <Text style={[pdStyles.closeBtnText, !canClose && { color: MUTED }]}>
            {closing ? "Closing Position…" : "Close Position"}
          </Text>
        </Pressable>

        {/* Safe-area spacer */}
        <View style={{ height: 8 }} />
      </ScrollView>

      {/* ══ Close Confirmation Modal ════════════════════════════════════════════ */}
      <Modal
        visible={showCloseConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => !closing && setShowCloseConfirm(false)}
        statusBarTranslucent
      >
        <Pressable
          style={confirmStyles.backdrop}
          onPress={() => { if (!closing) setShowCloseConfirm(false); }}
        >
          <Pressable
            style={confirmStyles.card}
            onPress={e => e.stopPropagation()}
          >
            <Text style={confirmStyles.title}>Close Position?</Text>
            <Text style={confirmStyles.body}>
              You're about to close{" "}
              <Text style={{ color: VALUE, fontWeight: "600" }}>{position.symbol}</Text>
              {" "}at market price. Current P&L:{" "}
              <Text style={{ color: pnlColor, fontWeight: "600" }}>{fUSD(pnlUsd, true)}</Text>
              . This action cannot be undone.
            </Text>

            <View style={confirmStyles.actions}>
              <Pressable
                onPress={() => setShowCloseConfirm(false)}
                disabled={closing}
                style={({ pressed }) => [confirmStyles.cancelBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={confirmStyles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { void handleClose(); }}
                disabled={closing}
                style={({ pressed }) => [confirmStyles.confirmBtn, pressed && { opacity: 0.75 }]}
              >
                {closing
                  ? <ActivityIndicator size="small" color="#FF6767" />
                  : <Text style={confirmStyles.confirmBtnText}>Confirm Close</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ══ Update TP/SL Confirmation Modal ════════════════════════════════════ */}
      <Modal
        visible={showTpSlConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => !updating && setShowTpSlConfirm(false)}
        statusBarTranslucent
      >
        <Pressable
          style={confirmStyles.backdrop}
          onPress={() => { if (!updating) setShowTpSlConfirm(false); }}
        >
          <Pressable
            style={confirmStyles.card}
            onPress={e => e.stopPropagation()}
          >
            <Text style={confirmStyles.title}>Update TP / SL?</Text>
            <Text style={[confirmStyles.body, { marginBottom: 14 }]}>
              Apply the following bracket order for{" "}
              <Text style={{ color: VALUE, fontWeight: "600" }}>{position.symbol}</Text>:
            </Text>

            <View style={tpSlStyles.preview}>
              {tpValue && (
                <View style={tpSlStyles.previewRow}>
                  <Text style={[tpSlStyles.previewLabel, { color: GREEN }]}>
                    Take Profit ({tpOrderType})
                  </Text>
                  <Text style={tpSlStyles.previewValue}>
                    {fmtCompact(parseFloat(tpValue))} USD
                  </Text>
                </View>
              )}
              {slValue && (
                <View style={tpSlStyles.previewRow}>
                  <Text style={[tpSlStyles.previewLabel, { color: RED }]}>
                    Stop Loss ({slOrderType})
                  </Text>
                  <Text style={tpSlStyles.previewValue}>
                    {fmtCompact(parseFloat(slValue))} USD
                  </Text>
                </View>
              )}
            </View>

            <View style={confirmStyles.actions}>
              <Pressable
                onPress={() => setShowTpSlConfirm(false)}
                disabled={updating}
                style={({ pressed }) => [confirmStyles.cancelBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={confirmStyles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { void handleUpdateTpSl(); }}
                disabled={updating}
                style={({ pressed }) => [confirmStyles.updateConfirmBtn, pressed && { opacity: 0.75 }]}
              >
                {updating
                  ? <ActivityIndicator size="small" color={VALUE} />
                  : <Text style={confirmStyles.updateConfirmBtnText}>Confirm</Text>
                }
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const emptyStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: MUTED,
    fontFamily: "Inter_600SemiBold",
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  btnText: {
    fontSize: 13,
    fontWeight: "700",
    color: VALUE,
    fontFamily: "Inter_700Bold",
  },
});

const pdStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: TITLE,
    fontFamily: "Inter_600SemiBold",
  },
  scroll: {
    flex: 1,
  },
  // dash-account-card equivalent
  card: {
    padding: 18,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#111111",
  },
  // dash-account-card-dim equivalent
  cardDim: {
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "#0d0d0d",
    overflow: "hidden",
  },
  symbolText: {
    fontSize: 22,
    fontWeight: "700",
    color: VALUE,
    letterSpacing: -0.3,
    fontFamily: "Inter_700Bold",
  },
  pnlLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
    fontFamily: "Inter_600SemiBold",
  },
  pnlValue: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 32,
    fontFamily: "Inter_700Bold",
  },
  pnlSub: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: 8,
    marginBottom: 16,
    fontFamily: "Inter_500Medium",
  },
  subGrid: {
    flexDirection: "row",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  subCell: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  subCellBorder: {
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.08)",
  },
  subLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
    fontFamily: "Inter_600SemiBold",
  },
  subValue: {
    fontSize: 15,
    fontWeight: "900",
    color: VALUE,
    fontFamily: "Inter_700Bold",
  },
  collapseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  collapseLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: "Inter_600SemiBold",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    height: 54,
  },
  detailLabel: {
    fontSize: 13,
    color: MUTED,
    fontFamily: "Inter_400Regular",
  },
  detailValue: {
    fontSize: 15,
    fontWeight: "600",
    color: VALUE,
    fontFamily: "Inter_600SemiBold",
  },
  bracketRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  bracketSideLabel: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  priceInput: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2B2B2B",
    backgroundColor: "#1A1A1A",
    paddingHorizontal: 12,
  },
  priceInputText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: VALUE,
    fontFamily: "Inter_600SemiBold",
  },
  priceInputCcy: {
    fontSize: 11,
    fontWeight: "500",
    color: MUTED,
    fontFamily: "Inter_500Medium",
  },
  pctRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 9,
  },
  pnlPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 9,
  },
  pnlPreviewLabel: {
    fontSize: 12,
    color: MUTED,
    fontFamily: "Inter_400Regular",
  },
  pnlPreviewValue: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 3,
    marginBottom: 12,
  },
  updateBtn: {
    height: 54,
    borderRadius: 16,
    marginTop: 15,
    backgroundColor: "#202020",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  updateBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: VALUE,
    fontFamily: "Inter_600SemiBold",
  },
  closeBtn: {
    height: 54,
    borderRadius: 12,
    backgroundColor: "#3A1114",
    borderWidth: 1,
    borderColor: "#61242B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FF6A6A",
    fontFamily: "Inter_600SemiBold",
  },
});

const confirmStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: RADIUS,
    padding: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: TITLE,
    marginBottom: 6,
    fontFamily: "Inter_600SemiBold",
  },
  body: {
    fontSize: 13,
    lineHeight: 19.5,
    color: MUTED,
    marginBottom: 18,
    fontFamily: "Inter_400Regular",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#1D1D1D",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: VALUE,
    fontFamily: "Inter_600SemiBold",
  },
  confirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#3B1114",
    borderWidth: 1,
    borderColor: "#6C2A30",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FF6767",
    fontFamily: "Inter_600SemiBold",
  },
  updateConfirmBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#202020",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  updateConfirmBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: VALUE,
    fontFamily: "Inter_600SemiBold",
  },
});

const tpSlStyles = StyleSheet.create({
  preview: {
    backgroundColor: "#1A1A1A",
    borderWidth: 1,
    borderColor: "#2B2B2B",
    borderRadius: 12,
    padding: 12,
    marginBottom: 18,
    gap: 6,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Inter_500Medium",
  },
  previewValue: {
    fontSize: 13,
    fontWeight: "600",
    color: VALUE,
    fontFamily: "Inter_600SemiBold",
  },
});
