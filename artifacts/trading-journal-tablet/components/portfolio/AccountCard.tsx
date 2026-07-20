/**
 * AccountCard — React Native port of
 * src/components/portfolio/AccountCard.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. div/span/button → View/Text/Pressable + StyleSheet
 *    All CSS class names and inline styles converted to StyleSheet.create().
 *    VALUE_STYLE / TOTAL_VALUE_STYLE constants preserved as StyleSheet entries.
 *
 * 2. framer-motion AnimatePresence + motion.div (height: "auto" expand)
 *    → Animated.Value height animation.
 *    The expand/collapse chevron rotation animation is also Animated.Value.
 *    `useReducedMotion` not available in RN — hard-coded to false (no reduced-
 *    motion path needed; Expo Accessibility API can be wired in a future pass).
 *
 * 3. Lucide icons → Ionicons (@expo/vector-icons)
 *    Wifi        → wifi-outline / wifi (filled when connected)
 *    WifiOff     → wifi-off-outline
 *    Loader2     → ActivityIndicator (built-in RN animated spinner)
 *    ChevronDown → chevron-down-outline
 *
 * 4. CSS variable --balance-value-color / --border / --muted
 *    → concrete dark-theme color tokens extracted from the web CSS:
 *    balance-value-color: #E8E8E8 (dark), #1A1A1A (light)
 *    Hard-coded to dark theme values (theme-switching via ThemeContext is
 *    wired in a future phase).
 *
 * 5. formatAmount from currencyStore.ts is already RN-compatible (Intl is
 *    supported in Hermes).  useCurrencyStore selector unchanged.
 *
 * 6. DualAmount / MetricRow sub-components preserved with identical logic.
 *
 * All business logic preserved exactly:
 *   - isExpanded state (expand/collapse)
 *   - accent dot per brokerId (delta→orange, ctrader→blue)
 *   - connectionStatus → StatusIcon selection (connecting=spinner, connected=wifi, offline=wifi-off)
 *   - DualAmount: reads currency from store, shows native amount via toINR
 *   - MetricRow: Available Balance, Margin Used, Unrealized PNL, Realized PNL
 *   - PNL colouring: ≥0 → VALUE_POSITIVE (#35D39A), <0 → VALUE_NEGATIVE (#FF6B6B)
 *   - rateLabel displayed below total if present
 *   - AnimatePresence initial={false} → skipEnterAnimation=true equivalent
 *     (the collapsible height starts at 0 immediately, not animated open)
 */

import { useState, useRef, useCallback } from "react";
import {
  View, Text, Pressable, StyleSheet,
  Animated, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useCurrencyStore, formatAmount } from "@/store/currencyStore";
import type { AccountSnapshot } from "@/store/accountTypes";

// ── Color tokens (extracted from web CSS, dark theme) ─────────────────────────
const VALUE_POSITIVE  = "#35D39A";
const VALUE_NEGATIVE  = "#FF6B6B";
const BALANCE_VALUE   = "#E8E8E8";   // --balance-value-color dark
const LABEL_COLOR     = "#8C8C8C";
const CARD_BG         = "rgba(255,255,255,0.04)";
const CARD_BORDER     = "rgba(255,255,255,0.08)";
const METRICS_BG      = "rgba(255,255,255,0.03)";
const METRICS_BORDER  = "rgba(255,255,255,0.06)";
const ROW_BORDER      = "rgba(255,255,255,0.06)";
const CONNECTED_CLR   = "#34d399";

const BROKER_ACCENT: Record<string, string> = {
  delta:   "#f97316",
  ctrader: "#3b82f6",
};

// ── DualAmount (reads currency selector, applies toINR) ────────────────────────

function DualAmount({
  usd, toINR, color, total,
}: { usd: number; toINR: (v: number) => number; color?: string; total?: boolean }) {
  const currency = useCurrencyStore(s => s.currency);
  const native   = currency === "INR" ? toINR(usd) : usd;
  return (
    <Text style={[
      total ? styles.totalValue : styles.metricValue,
      color ? { color } : {},
    ]}>
      {formatAmount(native, currency)}
    </Text>
  );
}

// ── MetricRow ──────────────────────────────────────────────────────────────────

function MetricRow({
  label, usd, toINR, color,
}: { label: string; usd: number; toINR: (v: number) => number; color?: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <DualAmount usd={usd} toINR={toINR} color={color} />
    </View>
  );
}

// ── AccountCard ────────────────────────────────────────────────────────────────

interface Props {
  account: AccountSnapshot;
  index?:  number;
}

export default function AccountCard({ account }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const accent = BROKER_ACCENT[account.brokerId] ?? "#f97316";

  // ── Expand/collapse animation ─────────────────────────────────────────────
  const heightAnim   = useRef(new Animated.Value(0)).current;
  const rotateAnim   = useRef(new Animated.Value(-90)).current;   // −90 = collapsed
  const measuredRef  = useRef<number | null>(null);               // measured expanded height

  const toggle = useCallback(() => {
    const toHeight  = isExpanded ? 0 : (measuredRef.current ?? 180);
    const toRotate  = isExpanded ? -90 : 0;
    setIsExpanded(e => !e);
    Animated.parallel([
      Animated.timing(heightAnim, {
        toValue:        toHeight,
        duration:       270,
        useNativeDriver: false,
      }),
      Animated.timing(rotateAnim, {
        toValue:        toRotate,
        duration:       270,
        useNativeDriver: false,   // transform on non-native animated view
      }),
    ]).start();
  }, [isExpanded, heightAnim, rotateAnim]);

  const chevronRotate = rotateAnim.interpolate({
    inputRange:  [-90, 0],
    outputRange: ["-90deg", "0deg"],
  });

  // ── Status icon ──────────────────────────────────────────────────────────
  const isConnecting = account.connectionStatus === "connecting";
  const isConnected  = account.isConnected;

  return (
    <View style={styles.card}>
      {/* Accent glow strip at top */}
      <View style={[styles.accentStrip, { backgroundColor: accent }]} />

      {/* Header */}
      <View style={styles.header}>
        {/* Left: accent dot + broker name */}
        <View style={styles.headerLeft}>
          <View style={[styles.accentDot, {
            backgroundColor: accent,
            shadowColor:     accent,
          }]} />
          <Text style={styles.brokerName}>{account.label}</Text>
        </View>

        {/* Right: connection status + chevron */}
        <View style={styles.headerRight}>
          <View style={styles.statusRow}>
            {isConnecting ? (
              <ActivityIndicator size={12} color={CONNECTED_CLR} />
            ) : (
              <Ionicons
                name={isConnected ? "wifi" : "wifi-off-outline"}
                size={14}
                color={isConnected ? CONNECTED_CLR : "#6b7280"}
              />
            )}
            <Text style={[styles.statusText, isConnected && styles.statusTextConnected]}>
              {isConnected
                ? "Connected"
                : isConnecting
                ? "Connecting"
                : "Offline"}
            </Text>
          </View>

          <Pressable
            onPress={toggle}
            style={({ pressed }) => [styles.chevronBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={isExpanded ? "Collapse card" : "Expand card"}
          >
            <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
              <Ionicons name="chevron-down-outline" size={16} color="rgba(255,255,255,0.4)" />
            </Animated.View>
          </Pressable>
        </View>
      </View>

      {/* Total balance — always visible */}
      <View style={styles.totalSection}>
        <DualAmount usd={account.accountValueUSD} toINR={account.toINR} total />
        {account.rateLabel && (
          <Text style={styles.rateLabel}>{account.rateLabel}</Text>
        )}
      </View>

      {/* Collapsible metrics */}
      <Animated.View
        style={[styles.metricsOuter, { height: heightAnim, overflow: "hidden" }]}
      >
        {/* Inner View is measured to get its natural height */}
        <View
          style={styles.metricsInner}
          onLayout={e => {
            const h = e.nativeEvent.layout.height;
            if (measuredRef.current === null && h > 0) {
              measuredRef.current = h;
            }
          }}
        >
          <MetricRow
            label="Available Balance"
            usd={account.availableBalanceUSD}
            toINR={account.toINR}
          />
          <MetricRow
            label="Margin Used"
            usd={account.marginUsedUSD}
            toINR={account.toINR}
          />
          <MetricRow
            label="Unrealized PNL"
            usd={account.unrealizedPnlUSD}
            toINR={account.toINR}
            color={account.unrealizedPnlUSD >= 0 ? VALUE_POSITIVE : VALUE_NEGATIVE}
          />
          <MetricRow
            label="Realized PNL"
            usd={account.realizedPnlUSD}
            toINR={account.toINR}
            color={account.realizedPnlUSD >= 0 ? VALUE_POSITIVE : VALUE_NEGATIVE}
          />
        </View>
      </Animated.View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderWidth:     1,
    borderColor:     CARD_BORDER,
    borderRadius:    16,
    overflow:        "hidden",
  },
  accentStrip: {
    height:  2,
    opacity: 0.6,
  },
  header: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop:      14,
    paddingBottom:   8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  accentDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.9,
    elevation:    4,
  },
  brokerName: {
    fontSize:   13.5,
    fontWeight: "700",
    color:      "#F3F3F3",
  },
  headerRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
  },
  statusText: {
    fontSize:      10,
    fontWeight:    "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color:         "#6b7280",
  },
  statusTextConnected: {
    color: "#10b981",
  },
  chevronBtn: {
    padding:      4,
    borderRadius: 8,
  },
  totalSection: {
    paddingHorizontal: 16,
    paddingBottom:     12,
  },
  totalValue: {
    fontSize:      18,
    fontWeight:    "700",
    color:         BALANCE_VALUE,
    letterSpacing: -0.2,
  },
  rateLabel: {
    fontSize:   10,
    color:      "rgba(255,255,255,0.25)",
    marginTop:  2,
  },
  metricsOuter: {
    overflow: "hidden",
  },
  metricsInner: {
    marginHorizontal: 12,
    marginBottom:     12,
    borderRadius:     12,
    overflow:         "hidden",
    backgroundColor:  METRICS_BG,
    borderWidth:      1,
    borderColor:      METRICS_BORDER,
  },
  metricRow: {
    flexDirection:    "row",
    alignItems:       "center",
    justifyContent:   "space-between",
    paddingHorizontal: 16,
    paddingVertical:   7,
    borderBottomWidth: 1,
    borderBottomColor: ROW_BORDER,
  },
  metricLabel: {
    fontSize:   13,
    fontWeight: "500",
    color:      LABEL_COLOR,
  },
  metricValue: {
    fontSize:      16,
    fontWeight:    "600",
    letterSpacing: -0.2,
    color:         BALANCE_VALUE,
  },
});
