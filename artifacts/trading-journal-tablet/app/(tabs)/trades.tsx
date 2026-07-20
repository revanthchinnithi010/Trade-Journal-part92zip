/**
 * app/(tabs)/trades.tsx — Trades Screen
 *
 * React Native port of artifacts/trading-journal/src/pages/trades.tsx
 *
 * Web → RN replacements:
 *   div / span / button / input → View / Text / Pressable / TextInput
 *   CSS className               → StyleSheet.create()
 *   createPortal                → Modal (React Native)
 *   Sheet (shadcn)              → Modal with bottom-sheet positioning
 *   Framer Motion               → no animation library (tablet pattern)
 *   useIsMobile()               → always tablet — filter pills always shown
 *   lucide icons                → Ionicons (@expo/vector-icons)
 *   Select dropdown             → scrollable symbol-chip row
 *   window.open                 → Linking.openURL
 *   img                         → Image
 *   shimmer-loading             → Skeleton component
 *   react-hook-form + zod       → controlled useState + inline validation
 *
 * All business logic preserved exactly:
 *   - page / symbolFilter / outcomeFilter / sideFilter / brokerFilter state
 *   - activeFilterCount badge
 *   - useListTrades({ page, limit:20, symbol, outcome })
 *   - useCreateTrade / useDeleteTrade with queryClient.invalidateQueries
 *   - filteredTrades memo (BROKER_MAP lookup, exitPrice != null, side, broker)
 *   - TradeRow: symbol, side, pnl sign, entry→exit price, date display
 *   - Trade detail: metrics grid, TradingView link, screenshot, tags, notes
 *   - Log Trade form: symbol, side, broker preview, entry/exit/qty, SL/TP,
 *                     dates, tvLink, screenshot, setupTags, mistakeTags, notes
 *   - Two-tab form: "details" | "analysis"
 *   - Pagination: Previous / Next buttons, count display
 *   - FilterSheet: outcome / side / broker chips with draft+apply pattern
 */

import React, { useState, useMemo, useCallback, memo } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  Modal,
  ActivityIndicator,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTrades,
  useCreateTrade,
  useDeleteTrade,
  getListTradesQueryKey,
  type Trade,
} from "@workspace/api-client-react";
import { useCurrencyFormatter } from "@/store/currencyStore";
import {
  BROKER_MAP,
  ALL_SYMBOLS,
  SETUP_TAG_OPTIONS,
  MISTAKE_TAG_OPTIONS,
  TV_LINKS,
} from "@/data/sampleData";
import { Skeleton } from "@/components/ui/skeleton";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const BG         = "#000000";
const CARD       = "#111111";
const BORDER     = "rgba(255,255,255,0.09)";
const BORDER_ROW = "rgba(255,255,255,0.12)";
const MUTED      = "rgba(148,163,184,0.6)";
const MUTED_DIM  = "rgba(148,163,184,0.4)";
const TEXT       = "#F3F3F3";
const TEXT_DIM   = "#E0E0E0";
const GREEN      = "#35C37A";
const RED        = "#E0524F";
const RADIUS     = 12;

// ─────────────────────────────────────────────────────────────────────────────
// Constants (mirrors web exactly)
// ─────────────────────────────────────────────────────────────────────────────

type ModalTab = "details" | "analysis";

const BROKER_OPTS = [
  { value: "all",            label: "All",           color: undefined },
  { value: "Delta Exchange", label: "Delta",         color: "#f97316" },
  { value: "FusionMarkets",  label: "Fusion Markets",color: "#3b82f6" },
  { value: "cTrader",        label: "cTrader",       color: "#a78bfa" },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// MultiSelectChipsRN
// Mirrors web MultiSelectChips: comma-separated value string, toggle logic
// ─────────────────────────────────────────────────────────────────────────────

interface MultiSelectChipsProps {
  options:      string[];
  value:        string;
  onChange:     (val: string) => void;
  activeColor?: string;
}

const MultiSelectChipsRN = memo(function MultiSelectChipsRN({
  options,
  value,
  onChange,
  activeColor = "#818cf8",
}: MultiSelectChipsProps) {
  const selected = value ? value.split(",").filter(Boolean) : [];

  const toggle = useCallback(
    (opt: string) => {
      if (selected.includes(opt)) {
        onChange(selected.filter(s => s !== opt).join(","));
      } else {
        onChange([...selected, opt].join(","));
      }
    },
    [selected, onChange],
  );

  return (
    <View style={chipStyles.wrap}>
      {options.map(opt => {
        const isActive = selected.includes(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => toggle(opt)}
            style={[
              chipStyles.chip,
              isActive && {
                backgroundColor: activeColor + "22",
                borderColor:     activeColor + "55",
              },
            ]}
          >
            <Text style={[chipStyles.chipText, isActive && { color: activeColor }]}>
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

const chipStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:       8,
    borderWidth:        1,
    borderColor:        "rgba(255,255,255,0.09)",
    backgroundColor:    "rgba(255,255,255,0.04)",
  },
  chipText: {
    fontSize:   11,
    fontWeight: "600",
    color:      MUTED,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FilterModal
// Mirrors web FilterBottomSheet: draft state, apply, reset.
// Always-mounted pattern replaced with controlled visibility via isOpen prop.
// ─────────────────────────────────────────────────────────────────────────────

interface FilterModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  outcomeFilter: string;
  sideFilter:    string;
  brokerFilter:  string;
  onApply:       (outcome: string, side: string, broker: string) => void;
}

const FilterModal = memo(function FilterModal({
  isOpen,
  onClose,
  outcomeFilter,
  sideFilter,
  brokerFilter,
  onApply,
}: FilterModalProps) {
  const [draftOutcome, setDraftOutcome] = useState(outcomeFilter);
  const [draftSide,    setDraftSide]    = useState(sideFilter);
  const [draftBroker,  setDraftBroker]  = useState(brokerFilter);

  // Sync drafts to applied values whenever the modal opens
  React.useEffect(() => {
    if (isOpen) {
      setDraftOutcome(outcomeFilter);
      setDraftSide(sideFilter);
      setDraftBroker(brokerFilter);
    }
  }, [isOpen, outcomeFilter, sideFilter, brokerFilter]);

  const handleReset = useCallback(() => {
    setDraftOutcome("all");
    setDraftSide("all");
    setDraftBroker("all");
  }, []);

  const handleApply = useCallback(() => {
    onApply(draftOutcome, draftSide, draftBroker);
    onClose();
  }, [onApply, onClose, draftOutcome, draftSide, draftBroker]);

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={filterStyles.backdrop} onPress={onClose} />

      {/* Sheet panel */}
      <View style={filterStyles.sheet}>
        {/* Handle pill */}
        <View style={filterStyles.handle} />

        {/* Title row */}
        <View style={filterStyles.titleRow}>
          <Text style={filterStyles.titleText}>Filters</Text>
          <Pressable onPress={onClose} style={filterStyles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={14} color={MUTED} />
          </Pressable>
        </View>

        {/* Filter groups */}
        <ScrollView style={filterStyles.body} showsVerticalScrollIndicator={false}>
          {/* Trade Result */}
          <View style={filterStyles.group}>
            <Text style={filterStyles.sectionLabel}>TRADE RESULT</Text>
            <View style={filterStyles.chipRow}>
              {[
                { v: "all",       label: "All",       color: undefined },
                { v: "win",       label: "Win",       color: "#10b981" },
                { v: "loss",      label: "Loss",      color: "#ef4444" },
                { v: "breakeven", label: "Breakeven", color: "#f59e0b" },
              ].map(({ v, label, color }) => (
                <Pressable
                  key={v}
                  onPress={() => setDraftOutcome(v)}
                  style={[
                    filterStyles.filterChip,
                    draftOutcome === v && {
                      backgroundColor: color ? color + "18" : "rgba(255,255,255,0.12)",
                      borderColor:     color ? color + "55" : "rgba(255,255,255,0.40)",
                    },
                  ]}
                >
                  <Text style={[
                    filterStyles.filterChipText,
                    draftOutcome === v && { color: color ?? "#ffffff" },
                  ]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Trade Side */}
          <View style={filterStyles.group}>
            <Text style={filterStyles.sectionLabel}>TRADE SIDE</Text>
            <View style={filterStyles.chipRow}>
              {[
                { v: "all",   label: "All Sides", color: undefined },
                { v: "long",  label: "Long",      color: "#60a5fa" },
                { v: "short", label: "Short",     color: "#f97316" },
              ].map(({ v, label, color }) => (
                <Pressable
                  key={v}
                  onPress={() => setDraftSide(v)}
                  style={[
                    filterStyles.filterChip,
                    draftSide === v && {
                      backgroundColor: color ? color + "18" : "rgba(255,255,255,0.12)",
                      borderColor:     color ? color + "55" : "rgba(255,255,255,0.40)",
                    },
                  ]}
                >
                  <Text style={[
                    filterStyles.filterChipText,
                    draftSide === v && { color: color ?? "#ffffff" },
                  ]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Broker */}
          <View style={filterStyles.group}>
            <Text style={filterStyles.sectionLabel}>BROKER</Text>
            <View style={filterStyles.chipRow}>
              {BROKER_OPTS.map(({ value, label, color }) => (
                <Pressable
                  key={value}
                  onPress={() => setDraftBroker(value)}
                  style={[
                    filterStyles.filterChip,
                    draftBroker === value && {
                      backgroundColor: color ? color + "18" : "rgba(255,255,255,0.12)",
                      borderColor:     color ? color + "55" : "rgba(255,255,255,0.40)",
                    },
                  ]}
                >
                  <Text style={[
                    filterStyles.filterChipText,
                    draftBroker === value && { color: color ?? "#ffffff" },
                  ]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Footer actions */}
        <View style={filterStyles.footer}>
          <Pressable
            onPress={handleReset}
            style={({ pressed }) => [filterStyles.resetBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={filterStyles.resetBtnText}>Reset Filters</Text>
          </Pressable>
          <Pressable
            onPress={handleApply}
            style={({ pressed }) => [filterStyles.applyBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={filterStyles.applyBtnText}>Apply</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
});

const filterStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  sheet: {
    backgroundColor: "#0d0f13",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    paddingBottom: 24,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  titleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#f1f5f9",
    fontFamily: "Inter_700Bold",
  },
  closeBtn: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 8,
    padding: 6,
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  group: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(148,163,184,0.5)",
    letterSpacing: 1,
    marginBottom: 8,
    fontFamily: "Inter_700Bold",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  filterChipText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Inter_600SemiBold",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    marginTop: 4,
  },
  resetBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  resetBtnText: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "rgba(148,163,184,0.8)",
    fontFamily: "Inter_600SemiBold",
  },
  applyBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  applyBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#0a0a0f",
    fontFamily: "Inter_700Bold",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// TradeRow — memoized, preserves all display logic from web exactly
// ─────────────────────────────────────────────────────────────────────────────

interface TradeRowProps {
  trade:    Trade;
  onSelect: (id: number) => void;
  fc:       (v: number) => string;
}

const TradeRow = memo(function TradeRow({ trade, onSelect, fc }: TradeRowProps) {
  const isWin  = (trade.pnl ?? 0) >= 0;
  const dateStr = new Date(trade.entryDate).toLocaleDateString(undefined, {
    month: "short", day: "numeric",
  });
  const fPrice = (v: number) =>
    v < 1 ? v.toFixed(4) : v.toLocaleString(undefined, { maximumFractionDigits: 1 });

  return (
    <Pressable
      onPress={() => onSelect(trade.id)}
      style={({ pressed }) => [rowStyles.row, pressed && { backgroundColor: "rgba(255,255,255,0.025)" }]}
    >
      {/* Row 1 — Symbol + side | PnL */}
      <View style={rowStyles.topRow}>
        <View style={rowStyles.topLeft}>
          <Text style={rowStyles.symbol}>{trade.symbol}</Text>
          <Text style={[rowStyles.side, { color: trade.side === "long" ? GREEN : RED }]}>
            {trade.side === "long" ? "LONG" : "SHORT"}
          </Text>
        </View>
        <Text style={[rowStyles.pnl, { color: isWin ? GREEN : RED }]}>
          {isWin ? "+" : ""}{fc(trade.pnl ?? 0)}
        </Text>
      </View>

      {/* Row 2 — Entry→Exit | Date */}
      <View style={rowStyles.bottomRow}>
        <View style={rowStyles.priceRow}>
          <Text style={rowStyles.price}>{fPrice(trade.entryPrice)}</Text>
          <Text style={rowStyles.arrow}>→</Text>
          <Text style={rowStyles.price}>
            {trade.exitPrice != null ? fPrice(trade.exitPrice) : "—"}
          </Text>
        </View>
        <Text style={rowStyles.date}>{dateStr}</Text>
      </View>
    </Pressable>
  );
});

const rowStyles = StyleSheet.create({
  row: {
    paddingHorizontal: 8,
    paddingVertical:   12,
  },
  topRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
  },
  topLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  symbol: {
    fontSize:   15,
    fontWeight: "600",
    color:      "#F0F0F0",
    fontFamily: "Inter_600SemiBold",
  },
  side: {
    fontSize:      10,
    fontWeight:    "600",
    letterSpacing: 1,
    fontFamily:    "Inter_600SemiBold",
  },
  pnl: {
    fontSize:   15,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.55)",
    fontFamily: "Inter_600SemiBold",
  },
  bottomRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginTop:      6,
  },
  priceRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           2,
  },
  price: {
    fontSize:   12,
    fontWeight: "500",
    color:      "#6B6B6B",
    fontFamily: "Inter_500Medium",
  },
  arrow: {
    fontSize: 11,
    color:    "rgba(255,255,255,0.25)",
    marginHorizontal: 2,
  },
  date: {
    fontSize:   12,
    fontWeight: "500",
    color:      "#6B6B6B",
    fontFamily: "Inter_500Medium",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// TradeDetailModal
// Mirrors the web's Sheet drawer showing selected trade details.
// Renders: summary card, metrics grid, TradingView link, screenshot, tags, notes.
// ─────────────────────────────────────────────────────────────────────────────

interface TradeDetailModalProps {
  trade:   Trade | undefined;
  isOpen:  boolean;
  onClose: () => void;
  fc:      (v: number) => string;
}

const TradeDetailModal = memo(function TradeDetailModal({
  trade,
  isOpen,
  onClose,
  fc,
}: TradeDetailModalProps) {
  if (!trade) return null;

  const isProfit = (trade.pnl ?? 0) >= 0;
  const tvUrl    = trade.tvLink || TV_LINKS[trade.symbol];

  const metricRows = [
    { label: "Entry",         value: fc(trade.entryPrice), mono: true },
    { label: "Exit",          value: trade.exitPrice == null ? "—" : fc(trade.exitPrice), mono: true },
    { label: "Risk / Reward", value: trade.riskRewardRatio ? `${trade.riskRewardRatio.toFixed(2)}R` : "—", mono: true },
    { label: "Quantity",      value: String(trade.quantity), mono: true },
    { label: "Stop Loss",     value: trade.stopLoss ? fc(trade.stopLoss) : "—", mono: true },
    { label: "Take Profit",   value: trade.takeProfit ? fc(trade.takeProfit) : "—", mono: true },
  ];

  const setupTags    = trade.setupTags    ? trade.setupTags.split(",").filter(Boolean)    : [];
  const mistakeTags  = trade.mistakeTags  ? trade.mistakeTags.split(",").filter(Boolean)  : [];

  return (
    <Modal
      visible={isOpen}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={detailStyles.root}>
        {/* Nav header */}
        <View style={detailStyles.header}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [detailStyles.backBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.7)" />
          </Pressable>
          <Text style={detailStyles.headerTitle}>Trade Details</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={detailStyles.scroll} showsVerticalScrollIndicator={false}>
          {/* Summary card */}
          <View style={detailStyles.summaryCard}>
            <View style={detailStyles.summaryTop}>
              <View>
                <Text style={detailStyles.symbolLabel}>SYMBOL</Text>
                <Text style={detailStyles.symbolText}>{trade.symbol}</Text>
              </View>
              <View style={[
                detailStyles.sideBadge,
                trade.side === "long"
                  ? { backgroundColor: "rgba(59,130,246,0.15)", borderColor: "rgba(59,130,246,0.20)" }
                  : { backgroundColor: "rgba(249,115,22,0.15)",  borderColor: "rgba(249,115,22,0.20)" },
              ]}>
                <Text style={[
                  detailStyles.sideBadgeText,
                  { color: trade.side === "long" ? "#60a5fa" : "#f97316" },
                ]}>
                  {trade.side === "long" ? "LONG" : "SHORT"}
                </Text>
              </View>
            </View>

            <View style={detailStyles.divider} />

            <View style={detailStyles.summaryBottom}>
              <View>
                <Text style={detailStyles.symbolLabel}>
                  {isProfit ? "PROFIT" : "LOSS"}
                </Text>
                <Text style={[detailStyles.pnlText, { color: isProfit ? GREEN : RED }]}>
                  {isProfit ? "+" : ""}{fc(trade.pnl ?? 0)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={detailStyles.symbolLabel}>DATE</Text>
                <Text style={detailStyles.dateText}>
                  {new Date(trade.entryDate).toLocaleDateString(undefined, {
                    day: "2-digit", month: "short", year: "numeric",
                  })}
                </Text>
              </View>
            </View>
          </View>

          {/* Metrics grid */}
          <View style={detailStyles.metricsGrid}>
            {metricRows.map(({ label, value }) => (
              <View key={label} style={detailStyles.metricCell}>
                <Text style={detailStyles.metricLabel}>{label.toUpperCase()}</Text>
                <Text style={detailStyles.metricValue}>{value}</Text>
              </View>
            ))}
          </View>

          {/* Analysis section */}
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>ANALYSIS</Text>

            {/* TradingView link */}
            {tvUrl ? (
              <Pressable
                onPress={() => { void Linking.openURL(tvUrl); }}
                style={({ pressed }) => [detailStyles.tvBtn, pressed && { opacity: 0.75 }]}
              >
                <View style={detailStyles.tvBtnLeft}>
                  <Ionicons name="trending-up-outline" size={16} color="#818cf8" />
                  <Text style={detailStyles.tvBtnText}>Open TradingView Chart</Text>
                </View>
                <Ionicons name="open-outline" size={14} color="rgba(255,255,255,0.5)" />
              </Pressable>
            ) : (
              <View style={detailStyles.emptyBox}>
                <Text style={detailStyles.emptyText}>No chart linked for this trade</Text>
              </View>
            )}

            {/* Screenshot */}
            {trade.screenshot ? (
              <Pressable
                style={detailStyles.screenshotWrap}
                onPress={() => { void Linking.openURL(trade.screenshot!); }}
              >
                <Image
                  source={{ uri: trade.screenshot }}
                  style={detailStyles.screenshot}
                  resizeMode="cover"
                />
              </Pressable>
            ) : (
              <View style={detailStyles.screenshotEmpty}>
                <Ionicons name="image-outline" size={16} color="rgba(148,163,184,0.4)" />
                <Text style={detailStyles.emptyText}>No screenshot attached</Text>
              </View>
            )}
          </View>

          {/* Tags */}
          <View style={detailStyles.section}>
            <Text style={detailStyles.sectionTitle}>TAGS</Text>

            {setupTags.length > 0 && (
              <View style={detailStyles.tagGroup}>
                <View style={detailStyles.tagGroupHeader}>
                  <Ionicons name="pricetag-outline" size={12} color={MUTED} />
                  <Text style={detailStyles.tagGroupLabel}>Setup</Text>
                </View>
                <View style={detailStyles.tagWrap}>
                  {setupTags.map(tag => (
                    <View key={tag} style={detailStyles.setupTag}>
                      <Text style={detailStyles.setupTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {mistakeTags.length > 0 && (
              <View style={detailStyles.tagGroup}>
                <View style={detailStyles.tagGroupHeader}>
                  <Ionicons name="warning-outline" size={12} color="rgba(248,113,113,0.7)" />
                  <Text style={detailStyles.tagGroupLabel}>Mistakes</Text>
                </View>
                <View style={detailStyles.tagWrap}>
                  {mistakeTags.map(tag => (
                    <View key={tag} style={detailStyles.mistakeTag}>
                      <Text style={detailStyles.mistakeTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {setupTags.length === 0 && mistakeTags.length === 0 && (
              <Text style={detailStyles.noTagsText}>No tags recorded</Text>
            )}
          </View>

          {/* Notes */}
          <View style={[detailStyles.section, { paddingBottom: 32 }]}>
            <View style={detailStyles.tagGroupHeader}>
              <Ionicons name="document-text-outline" size={12} color={MUTED} />
              <Text style={detailStyles.sectionTitle}>JOURNAL NOTES</Text>
            </View>
            {trade.notes ? (
              <View style={detailStyles.notesBox}>
                <Text style={detailStyles.notesText}>{trade.notes}</Text>
              </View>
            ) : (
              <Text style={detailStyles.noTagsText}>No notes recorded for this trade.</Text>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
});

const detailStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
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
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
    fontFamily: "Inter_600SemiBold",
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 16,
  },
  summaryCard: {
    marginTop: 16,
    marginBottom: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "#0f0f0f",
    overflow: "hidden",
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  symbolLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.4)",
    letterSpacing: 1.5,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  symbolText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
  },
  sideBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  sideBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 16,
  },
  summaryBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  pnlText: {
    fontSize: 20,
    fontWeight: "900",
    fontFamily: "Inter_700Bold",
  },
  dateText: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Inter_600SemiBold",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
    marginBottom: 4,
  },
  metricCell: {
    width: "47%",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "#111111",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(148,163,184,0.6)",
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: "Inter_600SemiBold",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
  },
  section: {
    marginTop: 20,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(148,163,184,0.6)",
    letterSpacing: 1.5,
    fontFamily: "Inter_700Bold",
  },
  tvBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(129,140,248,0.08)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.15)",
  },
  tvBtnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tvBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#818cf8",
    fontFamily: "Inter_600SemiBold",
  },
  emptyBox: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderStyle: "dashed",
  },
  emptyText: {
    fontSize: 12,
    color: "rgba(148,163,184,0.5)",
    fontStyle: "italic",
    fontFamily: "Inter_400Regular",
  },
  screenshotWrap: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  screenshot: {
    width: "100%",
    height: 176,
  },
  screenshotEmpty: {
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderStyle: "dashed",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  tagGroup: {
    gap: 6,
  },
  tagGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tagGroupLabel: {
    fontSize: 11,
    color: MUTED,
    fontFamily: "Inter_400Regular",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  setupTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(129,140,248,0.12)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.20)",
  },
  setupTagText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#818cf8",
    fontFamily: "Inter_500Medium",
  },
  mistakeTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(239,68,68,0.10)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.20)",
  },
  mistakeTagText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#f87171",
    fontFamily: "Inter_500Medium",
  },
  noTagsText: {
    fontSize: 12,
    color: "rgba(148,163,184,0.5)",
    fontStyle: "italic",
    fontFamily: "Inter_400Regular",
  },
  notesBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "#111111",
  },
  notesText: {
    fontSize: 13,
    lineHeight: 20,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_400Regular",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// LogTradeModal
// Mirrors the web's Log Trade modal with two tabs: "details" | "analysis".
// Form state is controlled (no react-hook-form); same defaultValues as web.
// createTrade.mutate({ data }) shape preserved exactly.
// ─────────────────────────────────────────────────────────────────────────────

interface LogTradeModalProps {
  isOpen:  boolean;
  onClose: () => void;
  onCreate: (data: {
    symbol:      string;
    side:        "long" | "short";
    entryPrice:  number;
    exitPrice:   number;
    quantity:    number;
    stopLoss?:   number | null;
    takeProfit?: number | null;
    entryDate:   string;
    exitDate:    string;
    tvLink?:     string | null;
    screenshot?: string | null;
    setupTags?:  string | null;
    mistakeTags?:string | null;
    notes?:      string | null;
  }) => void;
  isSaving: boolean;
}

const LogTradeModal = memo(function LogTradeModal({
  isOpen,
  onClose,
  onCreate,
  isSaving,
}: LogTradeModalProps) {
  const now = new Date().toISOString().slice(0, 16);

  const [modalTab,       setModalTab]       = useState<ModalTab>("details");
  const [formSymbol,     setFormSymbol]     = useState("NAS100");
  const [formSide,       setFormSide]       = useState<"long" | "short">("long");
  const [formEntryPrice, setFormEntryPrice] = useState("0");
  const [formExitPrice,  setFormExitPrice]  = useState("0");
  const [formQty,        setFormQty]        = useState("1");
  const [formStopLoss,   setFormStopLoss]   = useState("");
  const [formTakeProfit, setFormTakeProfit] = useState("");
  const [formEntryDate,  setFormEntryDate]  = useState(now);
  const [formExitDate,   setFormExitDate]   = useState(now);
  const [formTvLink,     setFormTvLink]     = useState("");
  const [formScreenshot, setFormScreenshot] = useState("");
  const [formSetupTags,  setFormSetupTags]  = useState("");
  const [formMistakeTags,setFormMistakeTags]= useState("");
  const [formNotes,      setFormNotes]      = useState("");

  // Reset on close
  React.useEffect(() => {
    if (!isOpen) {
      const ts = new Date().toISOString().slice(0, 16);
      setModalTab("details");
      setFormSymbol("NAS100");
      setFormSide("long");
      setFormEntryPrice("0");
      setFormExitPrice("0");
      setFormQty("1");
      setFormStopLoss("");
      setFormTakeProfit("");
      setFormEntryDate(ts);
      setFormExitDate(ts);
      setFormTvLink("");
      setFormScreenshot("");
      setFormSetupTags("");
      setFormMistakeTags("");
      setFormNotes("");
    }
  }, [isOpen]);

  const handleSubmit = useCallback(() => {
    if (!formSymbol || !formEntryDate || !formExitDate) return;
    onCreate({
      symbol:      formSymbol,
      side:        formSide,
      entryPrice:  parseFloat(formEntryPrice) || 0,
      exitPrice:   parseFloat(formExitPrice)  || 0,
      quantity:    parseFloat(formQty)        || 1,
      stopLoss:    formStopLoss   ? parseFloat(formStopLoss)   : null,
      takeProfit:  formTakeProfit ? parseFloat(formTakeProfit) : null,
      entryDate:   formEntryDate,
      exitDate:    formExitDate,
      tvLink:      formTvLink     || null,
      screenshot:  formScreenshot || null,
      setupTags:   formSetupTags  || null,
      mistakeTags: formMistakeTags|| null,
      notes:       formNotes      || null,
    });
  }, [
    formSymbol, formSide, formEntryPrice, formExitPrice, formQty,
    formStopLoss, formTakeProfit, formEntryDate, formExitDate,
    formTvLink, formScreenshot, formSetupTags, formMistakeTags, formNotes,
    onCreate,
  ]);

  const brokerName = BROKER_MAP[formSymbol] || "Auto-detected";

  const setupCount   = formSetupTags.split(",").filter(Boolean).length;
  const mistakeCount = formMistakeTags.split(",").filter(Boolean).length;

  return (
    <Modal
      visible={isOpen}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: BG }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Modal header */}
        <View style={logStyles.header}>
          <View>
            <Text style={logStyles.headerTitle}>Log New Trade</Text>
            <Text style={logStyles.headerSub}>Record your trade details and analysis</Text>
          </View>
          <Pressable onPress={onClose} style={logStyles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={16} color={MUTED} />
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={logStyles.tabs}>
          {(["details", "analysis"] as ModalTab[]).map(tab => (
            <Pressable
              key={tab}
              onPress={() => setModalTab(tab)}
              style={[logStyles.tab, modalTab === tab && logStyles.tabActive]}
            >
              <Text style={[logStyles.tabText, modalTab === tab && logStyles.tabTextActive]}>
                {tab === "details" ? "Trade Details" : "Analysis & Tags"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Form body */}
        <ScrollView style={logStyles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {modalTab === "details" && (
            <View style={logStyles.formSection}>
              {/* Symbol chips */}
              <View style={logStyles.fieldGroup}>
                <Text style={logStyles.fieldLabel}>ASSET</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 6, paddingVertical: 2 }}>
                    {ALL_SYMBOLS.map(sym => (
                      <Pressable
                        key={sym}
                        onPress={() => setFormSymbol(sym)}
                        style={[
                          logStyles.symbolChip,
                          formSymbol === sym && logStyles.symbolChipActive,
                        ]}
                      >
                        <Text style={[
                          logStyles.symbolChipText,
                          formSymbol === sym && logStyles.symbolChipTextActive,
                        ]}>
                          {sym}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Side + Broker preview */}
              <View style={logStyles.row2}>
                <View style={[logStyles.fieldGroup, { flex: 1 }]}>
                  <Text style={logStyles.fieldLabel}>DIRECTION</Text>
                  <View style={logStyles.segmented}>
                    {(["long", "short"] as const).map(s => (
                      <Pressable
                        key={s}
                        onPress={() => setFormSide(s)}
                        style={[logStyles.segBtn, formSide === s && logStyles.segBtnActive]}
                      >
                        <Text style={[logStyles.segBtnText, formSide === s && { color: "#ffffff" }]}>
                          {s === "long" ? "Long" : "Short"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={[logStyles.fieldGroup, { flex: 1 }]}>
                  <Text style={logStyles.fieldLabel}>BROKER</Text>
                  <View style={logStyles.brokerPreview}>
                    <View style={[
                      logStyles.brokerDot,
                      {
                        backgroundColor:
                          brokerName === "Delta Exchange" ? "#f97316" :
                          brokerName === "FusionMarkets"  ? "#3b82f6" : "#6b7280",
                      },
                    ]} />
                    <Text style={logStyles.brokerText} numberOfLines={1}>{brokerName}</Text>
                  </View>
                </View>
              </View>

              {/* Source badge */}
              <View style={logStyles.sourceBadge}>
                <Text style={logStyles.sourceLabel}>Source:</Text>
                <View style={logStyles.sourcePill}>
                  <Ionicons name="document-text-outline" size={12} color={MUTED} />
                  <Text style={logStyles.sourcePillText}>Manual Entry</Text>
                </View>
                <Text style={logStyles.sourceSub}>Sync source: Manual</Text>
              </View>

              {/* Entry / Exit / Qty */}
              <View style={logStyles.row3}>
                <View style={[logStyles.fieldGroup, { flex: 1 }]}>
                  <Text style={logStyles.fieldLabel}>ENTRY PRICE</Text>
                  <TextInput
                    style={logStyles.input}
                    value={formEntryPrice}
                    onChangeText={setFormEntryPrice}
                    keyboardType="numeric"
                    placeholderTextColor={MUTED_DIM}
                  />
                </View>
                <View style={[logStyles.fieldGroup, { flex: 1 }]}>
                  <Text style={logStyles.fieldLabel}>EXIT PRICE</Text>
                  <TextInput
                    style={logStyles.input}
                    value={formExitPrice}
                    onChangeText={setFormExitPrice}
                    keyboardType="numeric"
                    placeholderTextColor={MUTED_DIM}
                  />
                </View>
                <View style={[logStyles.fieldGroup, { flex: 1 }]}>
                  <Text style={logStyles.fieldLabel}>QTY / LOTS</Text>
                  <TextInput
                    style={logStyles.input}
                    value={formQty}
                    onChangeText={setFormQty}
                    keyboardType="numeric"
                    placeholderTextColor={MUTED_DIM}
                  />
                </View>
              </View>

              {/* SL / TP */}
              <View style={logStyles.row2}>
                <View style={[logStyles.fieldGroup, { flex: 1 }]}>
                  <Text style={logStyles.fieldLabel}>STOP LOSS</Text>
                  <TextInput
                    style={logStyles.input}
                    value={formStopLoss}
                    onChangeText={setFormStopLoss}
                    keyboardType="numeric"
                    placeholder="Optional"
                    placeholderTextColor={MUTED_DIM}
                  />
                </View>
                <View style={[logStyles.fieldGroup, { flex: 1 }]}>
                  <Text style={logStyles.fieldLabel}>TAKE PROFIT</Text>
                  <TextInput
                    style={logStyles.input}
                    value={formTakeProfit}
                    onChangeText={setFormTakeProfit}
                    keyboardType="numeric"
                    placeholder="Optional"
                    placeholderTextColor={MUTED_DIM}
                  />
                </View>
              </View>

              {/* Dates */}
              <View style={logStyles.row2}>
                <View style={[logStyles.fieldGroup, { flex: 1 }]}>
                  <Text style={logStyles.fieldLabel}>ENTRY DATE & TIME</Text>
                  <TextInput
                    style={logStyles.input}
                    value={formEntryDate}
                    onChangeText={setFormEntryDate}
                    placeholder="YYYY-MM-DDTHH:MM"
                    placeholderTextColor={MUTED_DIM}
                  />
                </View>
                <View style={[logStyles.fieldGroup, { flex: 1 }]}>
                  <Text style={logStyles.fieldLabel}>EXIT DATE & TIME</Text>
                  <TextInput
                    style={logStyles.input}
                    value={formExitDate}
                    onChangeText={setFormExitDate}
                    placeholder="YYYY-MM-DDTHH:MM"
                    placeholderTextColor={MUTED_DIM}
                  />
                </View>
              </View>
            </View>
          )}

          {modalTab === "analysis" && (
            <View style={logStyles.formSection}>
              {/* TradingView Link */}
              <View style={logStyles.fieldGroup}>
                <View style={logStyles.fieldLabelRow}>
                  <Ionicons name="trending-up-outline" size={12} color={MUTED} />
                  <Text style={logStyles.fieldLabel}>TRADINGVIEW CHART LINK</Text>
                </View>
                <TextInput
                  style={logStyles.input}
                  value={formTvLink}
                  onChangeText={setFormTvLink}
                  placeholder="https://www.tradingview.com/chart/..."
                  placeholderTextColor={MUTED_DIM}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              </View>

              {/* Screenshot */}
              <View style={logStyles.fieldGroup}>
                <View style={logStyles.fieldLabelRow}>
                  <Ionicons name="image-outline" size={12} color={MUTED} />
                  <Text style={logStyles.fieldLabel}>SCREENSHOT URL</Text>
                </View>
                <TextInput
                  style={logStyles.input}
                  value={formScreenshot}
                  onChangeText={setFormScreenshot}
                  placeholder="https://..."
                  placeholderTextColor={MUTED_DIM}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                {!!formScreenshot && (
                  <Image
                    source={{ uri: formScreenshot }}
                    style={logStyles.screenshotPreview}
                    resizeMode="cover"
                  />
                )}
              </View>

              {/* Setup Tags */}
              <View style={logStyles.fieldGroup}>
                <View style={logStyles.fieldLabelRow}>
                  <Ionicons name="pricetag-outline" size={12} color={MUTED} />
                  <Text style={logStyles.fieldLabel}>SETUP TAGS</Text>
                </View>
                <MultiSelectChipsRN
                  options={SETUP_TAG_OPTIONS}
                  value={formSetupTags}
                  onChange={setFormSetupTags}
                  activeColor="#818cf8"
                />
              </View>

              {/* Mistake Tags */}
              <View style={logStyles.fieldGroup}>
                <View style={logStyles.fieldLabelRow}>
                  <Ionicons name="warning-outline" size={12} color="rgba(248,113,113,0.7)" />
                  <Text style={logStyles.fieldLabel}>MISTAKE TAGS</Text>
                </View>
                <MultiSelectChipsRN
                  options={MISTAKE_TAG_OPTIONS}
                  value={formMistakeTags}
                  onChange={setFormMistakeTags}
                  activeColor="#f87171"
                />
              </View>

              {/* Notes */}
              <View style={logStyles.fieldGroup}>
                <View style={logStyles.fieldLabelRow}>
                  <Ionicons name="document-text-outline" size={12} color={MUTED} />
                  <Text style={logStyles.fieldLabel}>JOURNAL NOTES</Text>
                </View>
                <TextInput
                  style={[logStyles.input, logStyles.textarea]}
                  value={formNotes}
                  onChangeText={setFormNotes}
                  placeholder="What was your thesis? How did the trade go?"
                  placeholderTextColor={MUTED_DIM}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            </View>
          )}

          {/* Spacer for footer */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Modal footer */}
        <View style={logStyles.footer}>
          <View style={logStyles.footerLeft}>
            <View style={[
              logStyles.sidePill,
              formSide === "long"
                ? { backgroundColor: "rgba(59,130,246,0.10)" }
                : { backgroundColor: "rgba(249,115,22,0.10)" },
            ]}>
              <Text style={[
                logStyles.sidePillText,
                { color: formSide === "long" ? "#60a5fa" : "#f97316" },
              ]}>
                {formSide.toUpperCase()}
              </Text>
            </View>
            <Text style={logStyles.footerSymbol}>{formSymbol}</Text>
            {modalTab === "analysis" && (setupCount + mistakeCount) > 0 && (
              <Text style={logStyles.footerTagCount}>
                · {setupCount + mistakeCount} tag{setupCount + mistakeCount !== 1 ? "s" : ""}
              </Text>
            )}
          </View>
          <View style={logStyles.footerRight}>
            {modalTab === "details" ? (
              <Pressable
                onPress={() => setModalTab("analysis")}
                style={logStyles.secondaryBtn}
              >
                <Text style={logStyles.secondaryBtnText}>Next: Analysis</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setModalTab("details")}
                style={logStyles.secondaryBtn}
              >
                <Text style={logStyles.secondaryBtnText}>Back</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleSubmit}
              disabled={isSaving}
              style={({ pressed }) => [logStyles.submitBtn, (pressed || isSaving) && { opacity: 0.65 }]}
            >
              <Text style={logStyles.submitBtnText}>
                {isSaving ? "Saving…" : "Save Trade"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
});

const logStyles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
  },
  headerSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
    fontFamily: "Inter_400Regular",
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabs: {
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 4,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  tabActive: {
    backgroundColor: "rgba(129,140,248,0.15)",
    borderWidth: 1,
    borderColor: "rgba(129,140,248,0.25)",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
    fontFamily: "Inter_600SemiBold",
  },
  tabTextActive: {
    color: "#818cf8",
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
  },
  formSection: {
    paddingTop: 20,
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED_DIM,
    letterSpacing: 0.8,
    fontFamily: "Inter_600SemiBold",
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  input: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    fontSize: 13,
    color: TEXT,
    fontFamily: "Inter_400Regular",
  },
  textarea: {
    height: 100,
    paddingTop: 10,
    paddingBottom: 10,
  },
  row2: {
    flexDirection: "row",
    gap: 12,
  },
  row3: {
    flexDirection: "row",
    gap: 8,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 2,
    height: 40,
  },
  segBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  segBtnActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  segBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
    fontFamily: "Inter_600SemiBold",
  },
  brokerPreview: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
  },
  brokerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  brokerText: {
    fontSize: 13,
    color: MUTED,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  sourceLabel: {
    fontSize: 11,
    color: MUTED,
    fontFamily: "Inter_400Regular",
  },
  sourcePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  sourcePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Inter_700Bold",
  },
  sourceSub: {
    fontSize: 10,
    color: "rgba(148,163,184,0.4)",
    marginLeft: "auto",
    fontFamily: "Inter_400Regular",
  },
  symbolChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  symbolChipActive: {
    backgroundColor: "rgba(129,140,248,0.15)",
    borderColor: "rgba(129,140,248,0.30)",
  },
  symbolChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
    fontFamily: "Inter_600SemiBold",
  },
  symbolChipTextActive: {
    color: "#818cf8",
  },
  screenshotPreview: {
    width: "100%",
    height: 144,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: BG,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sidePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sidePillText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  footerSymbol: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
  },
  footerTagCount: {
    fontSize: 11,
    color: MUTED,
    fontFamily: "Inter_400Regular",
  },
  footerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  secondaryBtn: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: MUTED,
    fontFamily: "Inter_600SemiBold",
  },
  submitBtn: {
    paddingHorizontal: 20,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#818cf8",
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
    fontFamily: "Inter_700Bold",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// TradesScreen — main screen component
// ─────────────────────────────────────────────────────────────────────────────

export default function TradesScreen() {
  const insets = useSafeAreaInsets();

  // ── Filter state (preserved exactly from web) ──────────────────────────────
  const [page,          setPage]          = useState(1);
  const [symbolFilter,  setSymbolFilter]  = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [sideFilter,    setSideFilter]    = useState<string>("all");
  const [brokerFilter,  setBrokerFilter]  = useState<string>("all");

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isFilterOpen,    setIsFilterOpen]    = useState(false);
  const [isLogModalOpen,  setIsLogModalOpen]  = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);

  const fc = useCurrencyFormatter();

  // ── Active filter count (mirrors web exactly) ──────────────────────────────
  const activeFilterCount =
    (outcomeFilter !== "all" ? 1 : 0) +
    (sideFilter    !== "all" ? 1 : 0) +
    (brokerFilter  !== "all" ? 1 : 0);

  const queryClient = useQueryClient();

  // ── API hooks (mirrors web exactly) ───────────────────────────────────────
  const { data: tradesResponse } = useListTrades({
    page,
    limit: 20,
    symbol:  symbolFilter || undefined,
    outcome: outcomeFilter !== "all"
      ? (outcomeFilter as "win" | "loss" | "breakeven")
      : undefined,
  });

  const createTrade = useCreateTrade({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        setIsLogModalOpen(false);
      },
    },
  });

  // Defined to preserve hook usage parity with web (never called from UI)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const deleteTrade = useDeleteTrade({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListTradesQueryKey() });
        setSelectedTradeId(null);
      },
    },
  });

  // ── Apply filters from filter modal (mirrors web handleApplyFilters) ───────
  const handleApplyFilters = useCallback(
    (outcome: string, side: string, broker: string) => {
      setOutcomeFilter(outcome);
      setSideFilter(side);
      setBrokerFilter(broker);
      setPage(1);
    },
    [],
  );

  // ── filteredTrades memo (preserved exactly from web) ──────────────────────
  const filteredTrades = useMemo(() => {
    if (!tradesResponse) return [];
    return tradesResponse.trades.filter(t => {
      const broker = BROKER_MAP[t.symbol] || "";
      return t.exitPrice != null &&
             (sideFilter    === "all" || t.side   === sideFilter) &&
             (brokerFilter  === "all" || broker    === brokerFilter);
    });
  }, [tradesResponse, sideFilter, brokerFilter]);

  const selectedTrade = tradesResponse?.trades.find(t => t.id === selectedTradeId);

  // ── FlashList helpers ──────────────────────────────────────────────────────
  const keyExtractor = useCallback((item: Trade) => String(item.id), []);

  const renderItem = useCallback<ListRenderItem<Trade>>(
    ({ item }) => (
      <TradeRow
        trade={item}
        onSelect={setSelectedTradeId}
        fc={fc}
      />
    ),
    [fc],
  );

  const ItemSeparator = useCallback(
    () => <View style={{ height: 1, backgroundColor: BORDER_ROW, marginHorizontal: 8 }} />,
    [],
  );

  const ListEmpty = useCallback(() => {
    if (!tradesResponse) {
      // Loading skeletons
      return (
        <View>
          {[...Array(6)].map((_, i) => (
            <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                <Skeleton style={{ width: 112, height: 16, borderRadius: 8 }} />
                <Skeleton style={{ width: 64, height: 16, borderRadius: 8 }} />
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Skeleton style={{ width: 80, height: 12, borderRadius: 6 }} />
                <Skeleton style={{ width: 56, height: 12, borderRadius: 6 }} />
              </View>
            </View>
          ))}
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No trades match your filters.</Text>
      </View>
    );
  }, [tradesResponse]);

  // ── Log trade submit handler ───────────────────────────────────────────────
  const handleCreate = useCallback(
    (data: Parameters<typeof createTrade.mutate>[0]["data"]) => {
      createTrade.mutate({ data });
    },
    [createTrade],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Secondary header ───────────────────────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Trades</Text>
        <View style={styles.headerRight}>
          {/* Filter icon with active-count badge */}
          <Pressable
            onPress={() => setIsFilterOpen(true)}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="options-outline" size={16} color={MUTED} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
          {/* Log Trade button */}
          <Pressable
            onPress={() => setIsLogModalOpen(true)}
            style={({ pressed }) => [styles.logBtn, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.logBtnIcon}>
              <Ionicons name="add" size={10} color="#ffffff" />
            </View>
            <Text style={styles.logBtnText}>Log</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        {/* ── Search bar ───────────────────────────────────────────────────── */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={14} color={MUTED_DIM} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search symbol…"
            placeholderTextColor={MUTED_DIM}
            value={symbolFilter}
            onChangeText={text => { setSymbolFilter(text); setPage(1); }}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* ── Filter pills (always shown — tablet = desktop) ────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillsScroll}
          contentContainerStyle={styles.pillsContainer}
        >
          {/* Outcome pills */}
          {["all", "win", "loss", "breakeven"].map(v => (
            <Pressable
              key={v}
              onPress={() => { setOutcomeFilter(v); setPage(1); }}
              style={[styles.pill, outcomeFilter === v && styles.pillActive]}
            >
              <Text style={[styles.pillText, outcomeFilter === v && styles.pillTextActive]}>
                {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
              </Text>
            </Pressable>
          ))}
          <View style={styles.pillDivider} />
          {/* Side pills */}
          {["all", "long", "short"].map(v => (
            <Pressable
              key={v}
              onPress={() => setSideFilter(v)}
              style={[styles.pill, sideFilter === v && styles.pillActive]}
            >
              <Text style={[styles.pillText, sideFilter === v && styles.pillTextActive]}>
                {v === "all" ? "All Sides" : v.charAt(0).toUpperCase() + v.slice(1)}
              </Text>
            </Pressable>
          ))}
          <View style={styles.pillDivider} />
          {/* Broker pills */}
          <Text style={styles.pillSectionLabel}>Broker:</Text>
          {[
            { value: "all",            label: "All"    },
            { value: "Delta Exchange", label: "Delta"  },
            { value: "FusionMarkets",  label: "Fusion" },
          ].map(({ value, label }) => (
            <Pressable
              key={value}
              onPress={() => setBrokerFilter(value)}
              style={[
                styles.pill,
                brokerFilter === value && (
                  value === "Delta Exchange" ? styles.pillDelta :
                  value === "FusionMarkets"  ? styles.pillFusion :
                  styles.pillActive
                ),
              ]}
            >
              <Text style={[
                styles.pillText,
                brokerFilter === value && (
                  value === "Delta Exchange" ? styles.pillTextDelta :
                  value === "FusionMarkets"  ? styles.pillTextFusion :
                  styles.pillTextActive
                ),
              ]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Trade list ───────────────────────────────────────────────────── */}
        <View style={styles.listContainer}>
          {!tradesResponse ? (
            <ListEmpty />
          ) : filteredTrades.length === 0 ? (
            <ListEmpty />
          ) : (
            <FlashList
              data={filteredTrades}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              ItemSeparatorComponent={ItemSeparator}
              scrollEnabled={false}
            />
          )}
        </View>

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {tradesResponse && tradesResponse.total > 20 && (
          <View style={styles.pagination}>
            <Text style={styles.paginationText}>
              {(page - 1) * 20 + 1}–{Math.min(page * 20, tradesResponse.total)} of {tradesResponse.total}
            </Text>
            <View style={styles.paginationBtns}>
              <Pressable
                onPress={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={({ pressed }) => [
                  styles.pageBtn,
                  page === 1 && { opacity: 0.4 },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.pageBtnText}>Previous</Text>
              </Pressable>
              <Pressable
                onPress={() => setPage(p => p + 1)}
                disabled={page * 20 >= tradesResponse.total}
                style={({ pressed }) => [
                  styles.pageBtn,
                  page * 20 >= tradesResponse.total && { opacity: 0.4 },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.pageBtnText}>Next</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Filter bottom sheet modal ─────────────────────────────────────── */}
      <FilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        outcomeFilter={outcomeFilter}
        sideFilter={sideFilter}
        brokerFilter={brokerFilter}
        onApply={handleApplyFilters}
      />

      {/* ── Log Trade modal ───────────────────────────────────────────────── */}
      <LogTradeModal
        isOpen={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        onCreate={handleCreate}
        isSaving={createTrade.isPending}
      />

      {/* ── Trade Detail modal ────────────────────────────────────────────── */}
      <TradeDetailModal
        trade={selectedTrade}
        isOpen={!!selectedTradeId}
        onClose={() => setSelectedTradeId(null)}
        fc={fc}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#262626",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: TEXT,
    fontFamily: "Inter_600SemiBold",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  filterBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#000000",
    fontFamily: "Inter_700Bold",
  },
  logBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: "#ffffff",
  },
  logBtnIcon: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  logBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#000000",
    fontFamily: "Inter_600SemiBold",
  },
  content: {
    flex: 1,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: TEXT,
    fontFamily: "Inter_400Regular",
  },
  pillsScroll: {
    marginBottom: 4,
  },
  pillsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  pillActive: {
    backgroundColor: "rgba(129,140,248,0.15)",
    borderColor: "rgba(129,140,248,0.30)",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
    fontFamily: "Inter_600SemiBold",
  },
  pillTextActive: {
    color: "#818cf8",
  },
  pillDelta: {
    backgroundColor: "rgba(249,115,22,0.15)",
    borderColor: "rgba(249,115,22,0.30)",
  },
  pillTextDelta: {
    color: "#f97316",
  },
  pillFusion: {
    backgroundColor: "rgba(59,130,246,0.15)",
    borderColor: "rgba(59,130,246,0.30)",
  },
  pillTextFusion: {
    color: "#60a5fa",
  },
  pillDivider: {
    width: 4,
  },
  pillSectionLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(148,163,184,0.5)",
    letterSpacing: 1,
    fontFamily: "Inter_600SemiBold",
  },
  listContainer: {
    marginHorizontal: 8,
    borderRadius: 12,
    overflow: "hidden",
  },
  emptyState: {
    paddingVertical: 64,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: MUTED,
    fontFamily: "Inter_400Regular",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.055)",
    marginTop: 4,
  },
  paginationText: {
    fontSize: 12,
    color: MUTED,
    fontFamily: "Inter_400Regular",
  },
  paginationBtns: {
    flexDirection: "row",
    gap: 8,
  },
  pageBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
  },
  pageBtnText: {
    fontSize: 12,
    color: MUTED,
    fontFamily: "Inter_400Regular",
  },
});
