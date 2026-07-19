/**
 * AccountValueWidget — React Native port
 *
 * Web source: artifacts/trading-journal/src/components/AccountValueWidget.tsx
 *
 * Web → RN replacements:
 *   div / span             → View / Text
 *   framer-motion          → Pressable built-in press feedback (no dep needed)
 *   useLocation (wouter)   → onNavigate callback prop (caller owns routing)
 *   lucide-react icons     → Ionicons (@expo/vector-icons, already installed)
 *   CSS var(--stat-*)      → inline StyleSheet color tokens
 *   CSS grid               → View flexbox rows
 *
 * API preserved:
 *   accountValueUSD, upnlUSD, realizedPnlUSD?, netPnlUSD?
 *   accountValueDisplay, upnlDisplay, realizedPnlDisplay?, netPnlDisplay?
 *   openPositions, openOrders
 *
 * API additions (RN-only):
 *   loading         — shows skeleton placeholders while data loads
 *   empty           — shows "No account connected" state
 *   onShowPositions — navigation callback replacing useLocation → /portfolio
 *   onShowPnl       — navigation callback replacing useLocation → /pnl
 *   onShowBalances  — navigation callback replacing useLocation → /balances
 *
 * Design:
 *   Glass card — rgba(255,255,255,0.04) surface, rgba(255,255,255,0.08) border
 *   Profit = #00E5B0 (--profit token), Loss = #EF4444 (--loss token)
 */

import { Ionicons } from "@expo/vector-icons";
import React, { memo, useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
import {
  formatAmount,
  useCurrencyStore,
  type Currency,
} from "@/store/currencyStore";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountValueWidgetProps {
  // ── Raw USD totals ───────────────────────────────────────────────────────
  /** Raw USD total account value — kept for API compatibility. */
  accountValueUSD: number;
  /** Raw USD unrealised PnL. */
  upnlUSD: number;
  /** Raw USD realised PnL. */
  realizedPnlUSD?: number;
  /** Raw USD net PnL (uPnL + realised). Computed if omitted. */
  netPnlUSD?: number;

  // ── Pre-converted display values ─────────────────────────────────────────
  /**
   * Account value already converted to the user's selected currency using
   * each broker's own conversion rule. Do NOT re-multiply by the global rate.
   */
  accountValueDisplay: number;
  /** uPnL in the user's selected currency. */
  upnlDisplay: number;
  /** Realised PnL in the user's selected currency. Defaults to 0. */
  realizedPnlDisplay?: number;
  /** Net PnL in the user's selected currency. Computed if omitted. */
  netPnlDisplay?: number;

  // ── Counts ───────────────────────────────────────────────────────────────
  openPositions: number;
  openOrders: number;

  // ── State flags ──────────────────────────────────────────────────────────
  /** Show skeleton loading placeholders. */
  loading?: boolean;
  /** Show empty / unconnected state. */
  empty?: boolean;

  // ── Navigation callbacks (replaces wouter useLocation) ───────────────────
  onShowPositions?: () => void;
  onShowPnl?:       () => void;
  onShowBalances?:  () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  profit:       "#00E5B0",   // --profit / chart-1
  loss:         "#EF4444",   // --loss
  cardBg:       "#0A0E18",   // --card
  subBg:        "rgba(255,255,255,0.04)",
  divider:      "rgba(255,255,255,0.08)",
  textPrimary:  "#EDF0F6",
  textSub:      "rgba(148,163,184,0.60)",
  textValue:    "#E6E6E6",   // --balance-value
  textIcon:     "rgba(148,163,184,0.40)",
  maskDot:      "rgba(255,255,255,0.20)",
  positionsBg:  "linear-gradient(135deg, #f97316 0%, #ea580c 100%)", // kept as comment only
  positionsBgColor: "#f97316",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Privacy mask dots
// ─────────────────────────────────────────────────────────────────────────────

const Dots = memo(function Dots({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.dot} />
      ))}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Format helper — mirrored from web fmt()
// ─────────────────────────────────────────────────────────────────────────────

function formatValue(v: number, currency: Currency, masked: boolean): string {
  if (masked) return ""; // parent renders <Dots> instead
  const prefix = v >= 0 ? "+" : "";
  return `${prefix}${formatAmount(v, currency)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-metric cell
// ─────────────────────────────────────────────────────────────────────────────

interface SubCellProps {
  label:       string;
  value:       number;
  currency:    Currency;
  masked:      boolean;
  isPositive?: boolean;
  useSignColor?: boolean;  // when false use textValue colour (positions cell)
  loading?:    boolean;
  onPress?:    () => void;
  borderRight?: boolean;
  borderBottom?: boolean;
}

const SubCell = memo(function SubCell({
  label,
  value,
  currency,
  masked,
  isPositive = true,
  useSignColor = true,
  loading = false,
  onPress,
  borderRight = false,
  borderBottom = false,
}: SubCellProps) {
  const valueColor = useSignColor
    ? (isPositive ? C.profit : C.loss)
    : C.textValue;

  const borderStyle = [
    borderRight  && styles.subCellBorderRight,
    borderBottom && styles.subCellBorderBottom,
  ];

  const content = (
    <View style={[styles.subCell, ...borderStyle]}>
      {/* Label row with optional chevron */}
      <View style={styles.subLabelRow}>
        <Text style={styles.subLabel} numberOfLines={1}>{label}</Text>
        {onPress && (
          <Ionicons name="chevron-forward" size={10} color={C.textIcon} />
        )}
      </View>

      {/* Value */}
      {loading ? (
        <Skeleton style={styles.subValueSkeleton} />
      ) : masked ? (
        <Dots count={5} />
      ) : (
        <Text style={[styles.subValue, { color: valueColor }]} numberOfLines={1}>
          {formatValue(value, currency, false)}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {content}
      </Pressable>
    );
  }
  return content;
});

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

function AccountValueWidget({
  accountValueDisplay,
  upnlDisplay,
  realizedPnlDisplay = 0,
  netPnlDisplay,
  openPositions,
  openOrders,
  loading = false,
  empty   = false,
  onShowPositions,
  onShowPnl,
  onShowBalances,
}: AccountValueWidgetProps) {
  const [masked, setMasked] = useState(false);
  const currency = useCurrencyStore((s) => s.currency);

  const resolvedNetPnlDisplay =
    netPnlDisplay ?? (upnlDisplay + realizedPnlDisplay);

  const upPos   = upnlDisplay >= 0;
  const realPos = realizedPnlDisplay >= 0;
  const netPos  = resolvedNetPnlDisplay >= 0;

  const toggleMask = useCallback(() => setMasked((m) => !m), []);

  // ── Empty / unconnected state ─────────────────────────────────────────────

  if (empty && !loading) {
    return (
      <View style={styles.card}>
        <View style={styles.emptyState}>
          <Ionicons name="wallet-outline" size={28} color={C.textSub} />
          <Text style={styles.emptyTitle}>No account connected</Text>
          <Text style={styles.emptySubtitle}>
            Connect Delta Exchange or cTrader to see your account value.
          </Text>
        </View>
      </View>
    );
  }

  // ── Main card ─────────────────────────────────────────────────────────────

  return (
    <View style={styles.card}>

      {/* ── Header section ── */}
      <View style={styles.headerSection}>

        {/* Title row */}
        <View style={styles.titleRow}>
          <View style={styles.titleLeft}>
            {/* Account Value label + link chevron */}
            <Pressable
              onPress={onShowBalances}
              style={styles.titleLinkBtn}
              accessibilityRole="button"
              accessibilityLabel="Account Value — view balances"
            >
              <Text style={styles.titleLabel}>Account Value</Text>
              {onShowBalances && (
                <Ionicons name="chevron-forward" size={12} color={C.textIcon} />
              )}
            </Pressable>

            {/* Privacy toggle */}
            <Pressable
              onPress={toggleMask}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={masked ? "Show values" : "Hide values"}
            >
              <Ionicons
                name={masked ? "eye-off-outline" : "eye-outline"}
                size={16}
                color={C.textIcon}
              />
            </Pressable>
          </View>

          {/* Show Positions chip */}
          <Pressable
            onPress={onShowPositions}
            style={({ pressed }) => [
              styles.positionsChip,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show positions"
          >
            <Ionicons name="layers-outline" size={12} color="#fff" />
            <Text style={styles.positionsChipText}>Show Positions</Text>
          </Pressable>
        </View>

        {/* Main value */}
        <View style={styles.mainValueRow}>
          {loading ? (
            <Skeleton style={styles.mainValueSkeleton} />
          ) : masked ? (
            <Dots count={9} />
          ) : (
            <Text style={styles.mainValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(accountValueDisplay, currency)}
            </Text>
          )}
        </View>
      </View>

      {/* ── Sub-metrics 2×2 grid ── */}
      <View style={styles.subGrid}>
        {/* Row 1 */}
        <View style={styles.subRow}>
          <SubCell
            label="UPNL"
            value={upnlDisplay}
            currency={currency}
            masked={masked}
            isPositive={upPos}
            loading={loading}
            onPress={onShowPositions}
            borderRight
            borderBottom
          />
          <SubCell
            label="Realized PNL"
            value={realizedPnlDisplay}
            currency={currency}
            masked={masked}
            isPositive={realPos}
            loading={loading}
            onPress={onShowPositions}
            borderBottom
          />
        </View>

        {/* Row 2 */}
        <View style={styles.subRow}>
          <SubCell
            label="Net PNL"
            value={resolvedNetPnlDisplay}
            currency={currency}
            masked={masked}
            isPositive={netPos}
            loading={loading}
            onPress={onShowPnl}
            borderRight
          />
          {/* Positions / Orders — uses raw counts, not currency */}
          <View style={styles.subCell}>
            <Pressable
              onPress={onShowPositions}
              style={[styles.subLabelRow, onShowPositions ? undefined : null]}
              accessibilityRole="button"
              accessibilityLabel="Positions and Orders"
            >
              <Text style={styles.subLabel} numberOfLines={1}>
                Positions / Orders
              </Text>
              {onShowPositions && (
                <Ionicons name="chevron-forward" size={10} color={C.textIcon} />
              )}
            </Pressable>
            {loading ? (
              <Skeleton style={styles.subValueSkeleton} />
            ) : (
              <View style={styles.positionCountRow}>
                <Text style={[styles.subValue, { color: C.textValue }]}>
                  {openPositions}
                </Text>
                <Text style={[styles.subValue, { color: C.textSub }]}>/</Text>
                <Text style={[styles.subValue, { color: C.textValue }]}>
                  {openOrders}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.cardBg,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     C.divider,
    overflow:        "hidden",
  },

  // ── Header ────────────────────────────────────────────────────────────────
  headerSection: {
    paddingHorizontal: 16,
    paddingTop:        16,
    paddingBottom:     12,
  },
  titleRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginBottom:   12,
  },
  titleLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
  },
  titleLinkBtn: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           2,
  },
  titleLabel: {
    color:       "rgba(148,163,184,0.80)",
    fontSize:    13,
    fontFamily:  "Inter_600SemiBold",
    fontWeight:  "600",
  },
  positionsChip: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             5,
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderRadius:    20,
    backgroundColor: "#f97316",
  },
  positionsChipText: {
    color:      "#fff",
    fontSize:   11,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },

  // ── Main value ─────────────────────────────────────────────────────────────
  mainValueRow: {
    minHeight: 36,
    justifyContent: "center",
  },
  mainValue: {
    color:      C.textValue,
    fontSize:   28,
    fontFamily: "Inter_700Bold",
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  mainValueSkeleton: {
    width: 160,
    height: 32,
    borderRadius: 6,
  },

  // ── Sub-metrics grid ───────────────────────────────────────────────────────
  subGrid: {
    marginHorizontal: 12,
    marginBottom:     12,
    borderRadius:     12,
    backgroundColor:  C.subBg,
    borderWidth:      1,
    borderColor:      C.divider,
    overflow:         "hidden",
  },
  subRow: {
    flexDirection: "row",
  },
  subCell: {
    flex:              1,
    paddingHorizontal: 14,
    paddingVertical:   12,
  },
  subCellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: C.divider,
  },
  subCellBorderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  subLabelRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           2,
    marginBottom:  6,
  },
  subLabel: {
    color:      "rgba(148,163,184,0.60)",
    fontSize:   10,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  subValue: {
    fontSize:   14,
    fontFamily: "Inter_700Bold",
    fontWeight: "900",
    lineHeight: 18,
  },
  subValueSkeleton: {
    width:        72,
    height:       16,
    borderRadius: 4,
  },

  // ── Positions count row ───────────────────────────────────────────────────
  positionCountRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
  },

  // ── Privacy dots ──────────────────────────────────────────────────────────
  dotsRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           3,
    paddingVertical: 2,
  },
  dot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: C.maskDot,
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems:     "center",
    justifyContent: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    color:      C.textPrimary,
    fontSize:   15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    marginTop:  4,
  },
  emptySubtitle: {
    color:      C.textSub,
    fontSize:   13,
    fontFamily: "Inter_400Regular",
    textAlign:  "center",
    lineHeight: 18,
  },

  // ── Press feedback ────────────────────────────────────────────────────────
  pressed: {
    opacity: 0.75,
  },
});

export default memo(AccountValueWidget);
