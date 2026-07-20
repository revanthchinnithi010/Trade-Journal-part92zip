/**
 * BrokerStatusBar — React Native port of src/components/broker/BrokerStatusBar.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. div/span/button → View/Text/Pressable + StyleSheet.
 *
 * 2. CSS animations → react-native Animated API:
 *    • animate-ping (expanding ring) → Animated.loop (scale + opacity)
 *    • animate-spin (refresh icon)   → Animated.loop (rotation)
 *
 * 3. Lucide icons → Ionicons (@expo/vector-icons):
 *    BarChart2→bar-chart-outline, ShoppingCart→cart-outline, Power→power-outline,
 *    TrendingUp→trending-up-outline, TrendingDown→trending-down-outline,
 *    RefreshCw→refresh-outline, Wifi→wifi-outline, WifiOff→wifi-off-outline,
 *    Activity→pulse-outline, AlertTriangle→warning-outline.
 *
 * 4. className / Tailwind → StyleSheet (all values preserved exactly):
 *    hidden md:inline  → shown (tablet always has space)
 *    hidden xs:block   → shown
 *    hidden lg:block   → shown
 *    select-none       → omitted (not applicable in RN)
 *    tabular-nums      → fontVariant: ["tabular-nums"]
 *    flex-1            → flex: 1
 *    shrink-0          → flexShrink: 0
 *
 * 5. broker.image/<img> → BrokerLogo component (handles image + text fallback).
 *
 * 6. FeedBadge: Icon map uses Ionicons name strings instead of React components.
 *
 * 7. BrokerStatusBar returns null when !activeAccount or connectionStatus ===
 *    "disconnected" (identical to web).
 *
 * All business logic preserved exactly:
 *   - fmtMoney, fmtLatency helpers
 *   - LiveDot: color + pulse state
 *   - FeedBadge: idle→hidden, connecting/reconnecting→amber pulse, connected→green,
 *     failed→red
 *   - Error banner: reconnectAttempts, Retry button → reconnect()
 *   - Broker badge: logo + name + envLabel
 *   - Status text: Live / Connecting… / Reconnecting… / Error (retry N)
 *   - Latency display (only when connected + non-null)
 *   - Balance section: Equity, Avail, Unrealised PnL (live tick-driven vs fallback)
 *   - Action buttons: Positions, Orders, Trade, Disconnect
 *   - setShowPositions / setShowOrders / setShowPlaceOrder mutual exclusion
 */

import { useEffect, useRef, memo } from "react";
import {
  View, Text, Pressable, StyleSheet, Animated, Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BROKERS } from "@/types/broker";
import { useBrokerStore } from "@/store/brokerStore";
import type { PrivateWsStatus } from "@/store/brokerStore";
import { BrokerLogo } from "@/components/broker/BrokerLogos";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(val: string | number | undefined, dp = 2): string {
  const n = parseFloat(String(val ?? "0"));
  if (!isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function fmtLatency(ms: number | null): string {
  if (ms === null) return "";
  return `${ms}ms`;
}

// ── Live dot (pulse animation) ────────────────────────────────────────────────

interface LiveDotProps {
  color: string;
  pulse: boolean;
}

const LiveDot = memo(function LiveDot({ color, pulse }: LiveDotProps) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (pulse) {
      animRef.current = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 2, duration: 800,
              easing: Easing.out(Easing.ease), useNativeDriver: true,
            }),
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 0, duration: 800,
              easing: Easing.out(Easing.ease), useNativeDriver: true,
            }),
            Animated.timing(opacity, { toValue: 0.75, duration: 0, useNativeDriver: true }),
          ]),
        ]),
      );
      opacity.setValue(0.75);
      animRef.current.start();
    } else {
      animRef.current?.stop();
      animRef.current = null;
      scale.setValue(1);
      opacity.setValue(0);
    }
    return () => { animRef.current?.stop(); };
  }, [pulse, scale, opacity]);

  return (
    <View style={styles.liveDotWrapper}>
      {/* Expanding ring (only visible when pulse=true) */}
      <Animated.View
        style={[
          styles.liveDotRing,
          { backgroundColor: color, transform: [{ scale }], opacity },
        ]}
      />
      {/* Solid core */}
      <View style={[styles.liveDotCore, { backgroundColor: color }]} />
    </View>
  );
});

// ── Private WS feed badge ─────────────────────────────────────────────────────

type FeedBadgeCfg = {
  label:    string;
  color:    string;
  iconName: React.ComponentProps<typeof Ionicons>["name"];
};

const FEED_BADGE_MAP: Record<PrivateWsStatus, FeedBadgeCfg> = {
  idle:         { label: "",                    color: "transparent",  iconName: "wifi-outline"    },
  connecting:   { label: "WS…",                color: "#f59e0b",      iconName: "pulse-outline"   },
  connected:    { label: "WS Live",             color: "#4ade80",      iconName: "wifi-outline"    },
  reconnecting: { label: "WS reconnecting",     color: "#f59e0b",      iconName: "pulse-outline"   },
  failed:       { label: "WS failed",           color: "#ef4444",      iconName: "alert-circle-outline" },
};

interface FeedBadgeProps {
  status: PrivateWsStatus;
}

const FeedBadge = memo(function FeedBadge({ status }: FeedBadgeProps) {
  if (status === "idle") return null;

  const cfg = FEED_BADGE_MAP[status];

  return (
    <View
      style={[
        styles.feedBadge,
        { backgroundColor: cfg.color + "18", borderColor: cfg.color + "30" },
      ]}
    >
      <Ionicons name={cfg.iconName} size={10} color={cfg.color} />
      <Text style={[styles.feedBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export function BrokerStatusBar() {
  const {
    activeAccount,
    balance,
    positions,
    orders,
    connectionStatus,
    connectionLatency,
    reconnectAttempts,
    reconnectingState,
    privateWsStatus,
    livePnl,
    disconnect,
    reconnect,
    setShowPositions,
    setShowOrders,
    setShowPlaceOrder,
    showPositions,
    showOrders,
    showPlaceOrder,
  } = useBrokerStore();

  if (!activeAccount || connectionStatus === "disconnected") return null;

  const broker = BROKERS.find(b => b.id === activeAccount.broker_id);

  // ── Status classification ──────────────────────────────────────────────────
  const isConnected  = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";
  const isError      = connectionStatus === "error";

  const dotColor = isError ? "#ef4444" : isConnecting ? "#f59e0b" : "#4ade80";
  const dotPulse = isConnecting || reconnectingState;

  const statusText = isError
    ? reconnectAttempts > 0 ? `Error (retry ${reconnectAttempts})` : "Error"
    : isConnecting
    ? reconnectingState ? "Reconnecting…" : "Connecting…"
    : "Live";

  // ── PnL — prefer live tick-driven values, fall back to broker balance ───────
  const livePnlTotal = Object.values(livePnl).reduce((a, b) => a + b, 0);
  const hasFeedPnl   = Object.keys(livePnl).length > 0;
  const pnlValue     = hasFeedPnl
    ? livePnlTotal
    : parseFloat(balance?.unrealisedPnl ?? "0");
  const pnlPositive  = pnlValue >= 0;
  const pnlColor     = pnlPositive ? "#4ade80" : "#f87171";

  const equity    = parseFloat(balance?.equity ?? "0");
  const avail     = parseFloat(balance?.availableToWithdraw ?? "0");
  const hasBalance = !!balance;

  // ── Broker env hint (India / International) ────────────────────────────────
  const envLabel = activeAccount.env_name
    ? activeAccount.env_name === "india" ? "India" : activeAccount.env_name
    : null;

  return (
    <View style={styles.container}>
      {/* Error banner */}
      {isError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={12} color="#f87171" style={{ flexShrink: 0 }} />
          <Text style={styles.errorBannerText}>
            Broker connection error
            {reconnectAttempts > 0 ? ` — attempt ${reconnectAttempts}` : ""}
          </Text>
          <Pressable
            onPress={() => reconnect()}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="refresh-outline" size={10} color="#f87171" />
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Main bar */}
      <View style={styles.mainBar}>

        {/* Broker badge */}
        <View style={styles.brokerBadge}>
          <View style={styles.brokerLogoSmall}>
            <BrokerLogo brokerId={activeAccount.broker_id} size={20} />
          </View>
          <Text style={styles.brokerName}>{broker?.name}</Text>
          {envLabel && (
            <View style={styles.envBadge}>
              <Text style={styles.envBadgeText}>{envLabel}</Text>
            </View>
          )}
        </View>

        {/* Separator */}
        <View style={styles.separator} />

        {/* Status indicator */}
        <View style={styles.statusSection}>
          <LiveDot color={dotColor} pulse={dotPulse} />
          <Text style={[styles.statusText, { color: dotColor }]}>{statusText}</Text>
          {connectionLatency !== null && isConnected && (
            <Text style={styles.latencyText}>{fmtLatency(connectionLatency)}</Text>
          )}
        </View>

        {/* Private WS feed badge */}
        <FeedBadge status={privateWsStatus} />

        {/* Separator */}
        <View style={styles.separator} />

        {/* Account data */}
        {hasBalance && (
          <View style={styles.balanceSection}>
            {/* Equity */}
            <View style={styles.balanceCell}>
              <Text style={styles.balanceCellLabel}>Equity</Text>
              <Text style={styles.balanceCellValue}>${fmtMoney(equity)}</Text>
            </View>

            {/* Available */}
            <View style={styles.balanceCell}>
              <Text style={styles.balanceCellLabel}>Avail</Text>
              <Text style={[styles.balanceCellValue, styles.balanceCellValueMuted]}>
                ${fmtMoney(avail)}
              </Text>
            </View>

            {/* Unrealised PnL */}
            <View style={styles.balanceCell}>
              <Text style={styles.balanceCellLabel}>
                {hasFeedPnl ? "Live PnL" : "Unr. PnL"}
              </Text>
              <View style={styles.pnlRow}>
                <Ionicons
                  name={pnlPositive ? "trending-up-outline" : "trending-down-outline"}
                  size={12}
                  color={pnlColor}
                />
                <Text style={[styles.pnlValue, { color: pnlColor }]}>
                  {pnlPositive ? "+" : ""}{fmtMoney(pnlValue)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Action buttons */}
        <View style={styles.actionButtons}>

          {/* Positions */}
          <Pressable
            onPress={() => {
              setShowPositions(!showPositions);
              setShowOrders(false);
              setShowPlaceOrder(false);
            }}
            style={[
              styles.actionBtn,
              showPositions ? styles.actionBtnActive : styles.actionBtnIdle,
            ]}
          >
            <Ionicons
              name="trending-up-outline"
              size={12}
              color={showPositions ? "#B7FF5A" : "rgba(167,184,169,0.75)"}
            />
            <Text style={[styles.actionBtnText, showPositions && styles.actionBtnTextActive]}>
              Pos
            </Text>
            {positions.length > 0 && (
              <View style={[
                styles.countBadge,
                showPositions ? styles.countBadgeActive : styles.countBadgeIdle,
              ]}>
                <Text style={[
                  styles.countBadgeText,
                  showPositions ? styles.countBadgeTextActive : styles.countBadgeTextIdle,
                ]}>
                  {positions.length}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Orders */}
          <Pressable
            onPress={() => {
              setShowOrders(!showOrders);
              setShowPositions(false);
              setShowPlaceOrder(false);
            }}
            style={[
              styles.actionBtn,
              showOrders ? styles.actionBtnActive : styles.actionBtnIdle,
            ]}
          >
            <Ionicons
              name="bar-chart-outline"
              size={12}
              color={showOrders ? "#B7FF5A" : "rgba(167,184,169,0.75)"}
            />
            <Text style={[styles.actionBtnText, showOrders && styles.actionBtnTextActive]}>
              Orders
            </Text>
            {orders.length > 0 && (
              <View style={[
                styles.countBadge,
                showOrders ? styles.countBadgeActive : styles.countBadgeIdle,
              ]}>
                <Text style={[
                  styles.countBadgeText,
                  showOrders ? styles.countBadgeTextActive : styles.countBadgeTextIdle,
                ]}>
                  {orders.length}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Trade */}
          <Pressable
            onPress={() => {
              setShowPlaceOrder(!showPlaceOrder);
              setShowPositions(false);
              setShowOrders(false);
            }}
            style={[
              styles.tradeBtn,
              showPlaceOrder ? styles.tradeBtnActive : styles.tradeBtnIdle,
            ]}
          >
            <Ionicons
              name="cart-outline"
              size={12}
              color={showPlaceOrder ? "#07110D" : "#B7FF5A"}
            />
            <Text style={[styles.tradeBtnText, showPlaceOrder && styles.tradeBtnTextActive]}>
              Trade
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={styles.separator} />

          {/* Disconnect */}
          <Pressable
            onPress={disconnect}
            style={({ pressed }) => [styles.disconnectBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Disconnect broker"
          >
            <Ionicons name="power-outline" size={14} color="rgba(239,68,68,0.55)" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Outer container ────────────────────────────────────────────────────────
  container: {
    backgroundColor: "rgba(5,14,10,0.98)",
    borderTopWidth:  1,
    borderTopColor:  "rgba(57,91,67,0.2)",
    flexShrink:      0,
  },

  // ── Error banner ───────────────────────────────────────────────────────────
  errorBanner: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               8,
    paddingHorizontal: 12,
    paddingVertical:   4,
    backgroundColor:   "rgba(239,68,68,0.08)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(239,68,68,0.15)",
  },
  errorBannerText: {
    flex:     1,
    fontSize: 11,
    color:    "#f87171",
  },
  retryBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               4,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      5,
    borderWidth:       1,
    borderColor:       "rgba(239,68,68,0.3)",
    backgroundColor:   "rgba(239,68,68,0.1)",
  },
  retryBtnText: {
    fontSize:   10,
    fontWeight: "600",
    color:      "#f87171",
  },

  // ── Main bar ───────────────────────────────────────────────────────────────
  mainBar: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
    paddingHorizontal: 12,
    height:        44,
  },

  // ── Broker badge ───────────────────────────────────────────────────────────
  brokerBadge: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
    flexShrink:    0,
    minWidth:      0,
  },
  brokerLogoSmall: {
    width:          20,
    height:         20,
    borderRadius:   4,
    overflow:       "hidden",
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },
  brokerName: {
    fontSize:   11,
    fontWeight: "700",
    color:      "#fff",
  },
  envBadge: {
    paddingHorizontal: 4,
    paddingVertical:   1,
    borderRadius:      4,
    backgroundColor:   "rgba(249,115,22,0.12)",
    borderWidth:       1,
    borderColor:       "rgba(249,115,22,0.2)",
  },
  envBadgeText: {
    fontSize:   9,
    fontWeight: "500",
    color:      "#f97316",
  },

  // ── Separator ──────────────────────────────────────────────────────────────
  separator: {
    width:           1,
    height:          16,
    flexShrink:      0,
    backgroundColor: "rgba(57,91,67,0.3)",
  },

  // ── Status ─────────────────────────────────────────────────────────────────
  statusSection: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
    flexShrink:    0,
  },
  statusText: {
    fontSize:   11,
    fontWeight: "600",
  },
  latencyText: {
    fontSize:    9,
    fontVariant: ["tabular-nums"],
    fontWeight:  "500",
    color:       "rgba(167,184,169,0.5)",
  },

  // ── Feed badge ─────────────────────────────────────────────────────────────
  feedBadge: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               3,
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      4,
    borderWidth:       1,
    flexShrink:        0,
  },
  feedBadgeText: {
    fontSize:   9,
    fontWeight: "500",
    letterSpacing: 0.3,
  },

  // ── Live dot ───────────────────────────────────────────────────────────────
  liveDotWrapper: {
    width:          8,
    height:         8,
    alignItems:     "center",
    justifyContent: "center",
  },
  liveDotRing: {
    position:     "absolute",
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  liveDotCore: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },

  // ── Balance section ────────────────────────────────────────────────────────
  balanceSection: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           12,
    flexShrink:    0,
    minWidth:      0,
  },
  balanceCell: {
    alignItems: "flex-start",
  },
  balanceCellLabel: {
    fontSize:      8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color:         "rgba(167,184,169,0.4)",
    marginBottom:  2,
  },
  balanceCellValue: {
    fontSize:    12,
    fontWeight:  "700",
    color:       "#fff",
    fontVariant: ["tabular-nums"],
  },
  balanceCellValueMuted: {
    fontWeight: "600",
    color:      "rgba(167,184,169,0.75)",
  },
  pnlRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           2,
  },
  pnlValue: {
    fontSize:    12,
    fontWeight:  "700",
    fontVariant: ["tabular-nums"],
  },

  // ── Action buttons ─────────────────────────────────────────────────────────
  actionButtons: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
    flexShrink:    0,
  },
  actionBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               4,
    height:            28,
    paddingHorizontal: 8,
    borderRadius:      6,
  },
  actionBtnIdle: {
    backgroundColor: "rgba(57,91,67,0.18)",
    borderWidth:     1,
    borderColor:     "transparent",
  },
  actionBtnActive: {
    backgroundColor: "rgba(183,255,90,0.12)",
    borderWidth:     1,
    borderColor:     "rgba(183,255,90,0.22)",
  },
  actionBtnText: {
    fontSize:   11,
    fontWeight: "600",
    color:      "rgba(167,184,169,0.75)",
  },
  actionBtnTextActive: {
    color: "#B7FF5A",
  },
  countBadge: {
    width:          16,
    height:         16,
    borderRadius:   8,
    alignItems:     "center",
    justifyContent: "center",
  },
  countBadgeActive: {
    backgroundColor: "rgba(183,255,90,0.25)",
  },
  countBadgeIdle: {
    backgroundColor: "rgba(57,91,67,0.4)",
  },
  countBadgeText: {
    fontSize:   9,
    fontWeight: "700",
  },
  countBadgeTextActive: {
    color: "#B7FF5A",
  },
  countBadgeTextIdle: {
    color: "rgba(167,184,169,0.9)",
  },
  tradeBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               6,
    height:            28,
    paddingHorizontal: 10,
    borderRadius:      6,
    borderWidth:       1,
    borderColor:       "rgba(183,255,90,0.28)",
  },
  tradeBtnIdle: {
    backgroundColor: "rgba(183,255,90,0.14)",
  },
  tradeBtnActive: {
    backgroundColor: "#B7FF5A",
  },
  tradeBtnText: {
    fontSize:   11,
    fontWeight: "700",
    color:      "#B7FF5A",
  },
  tradeBtnTextActive: {
    color: "#07110D",
  },
  disconnectBtn: {
    width:          28,
    height:         28,
    borderRadius:   6,
    alignItems:     "center",
    justifyContent: "center",
  },
});
