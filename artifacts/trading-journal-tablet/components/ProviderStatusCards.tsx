/**
 * ProviderStatusCards — React Native port
 *
 * Web source: artifacts/trading-journal/src/components/ProviderStatusCards.tsx
 *
 * Web → RN replacements:
 *   div / span           → View / Text
 *   CSS radial-gradient  → solid tinted background (RN has no gradient without expo-linear-gradient)
 *   Lucide icons         → Ionicons (@expo/vector-icons, already installed)
 *   animate-spin (CSS)   → Animated.loop / Animated.timing (Animated API)
 *   animate-ping (CSS)   → Animated pulse via Animated.loop
 *   grid-cols-1/2        → View flexbox with flexWrap / FlatList
 *   setInterval polling  → removed; component is fully prop-driven (no fetch)
 *   AbortController      → removed; no internal fetch
 *
 * Architecture change:
 *   The web version polls /api/market/providers internally.
 *   This RN version is fully prop-driven: the parent (dashboard screen) owns
 *   data fetching and passes `providers` as a prop. This follows the
 *   "no mock backend / no placeholder business logic" rule and makes the
 *   component reusable and independently testable.
 *
 * Providers supported:
 *   delta, ctrader, telegram, finnhub — via PROVIDER_DISPLAY config map.
 *   Unknown providers render with a generic fallback.
 *
 * Exported types (preserved from web for caller compatibility):
 *   ProviderStatus, ProviderCardData, ProviderStatusCardsProps
 *
 * Also exported (web parity):
 *   ProviderBadge — inline provider pill label
 */

import { Ionicons } from "@expo/vector-icons";
import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { Skeleton } from "@/components/ui/skeleton";

// ─────────────────────────────────────────────────────────────────────────────
// Types  (exported for caller type-safety)
// ─────────────────────────────────────────────────────────────────────────────

export type ProviderStatus =
  | "connected"
  | "reconnecting"
  | "connecting"
  | "disconnected"
  | "error";

export interface ProviderCardData {
  /** Unique key — matches PROVIDER_DISPLAY keys for built-in label/icon lookup. */
  id: string;
  /** Display name (fallback if id is not in PROVIDER_DISPLAY). */
  displayName: string;
  /** Feed category label, e.g. "crypto", "forex", "alerts". */
  badge?: string;
  /** Current connection state. */
  status: ProviderStatus;
  /** Last successful sync timestamp (ms since epoch) or null. */
  lastSyncAt?: number | null;
  /** Number of active symbol subscriptions. */
  subscriptionCount?: number;
  /** Latency of last response in ms, or null if unknown. */
  latencyMs?: number | null;
  /** Cumulative tick events received. */
  tickCount?: number;
  /** Number of automatic reconnect attempts made. */
  reconnectCount?: number;
  /** Timestamp of first successful connect for this session. */
  connectedAt?: number | null;
  /** Optional action button label (e.g. "Reconnect", "Configure"). */
  actionLabel?: string;
  /** Called when the action button is pressed. */
  onAction?: () => void;
  /** Brand accent colour used for the icon background tint. */
  color?: string;
}

export interface ProviderStatusCardsProps {
  /** List of provider data objects to render. */
  providers: ProviderCardData[];
  /** Shows skeleton placeholder cards while data is loading. */
  loading?: boolean;
  /** Number of skeleton placeholders shown when loading=true. Defaults to 2. */
  loadingCount?: number;
  /** Container style override. */
  style?: ViewStyle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider display config
// ─────────────────────────────────────────────────────────────────────────────

interface ProviderDisplay {
  label:      string;
  badge:      string;
  color:      string;
  iconName:   React.ComponentProps<typeof Ionicons>["name"];
}

const PROVIDER_DISPLAY: Record<string, ProviderDisplay> = {
  delta: {
    label:    "Delta Exchange",
    badge:    "crypto",
    color:    "#8B5CF6",
    iconName: "trending-up-outline",
  },
  ctrader: {
    label:    "cTrader",
    badge:    "forex",
    color:    "#F59E0B",
    iconName: "bar-chart-outline",
  },
  telegram: {
    label:    "Telegram",
    badge:    "alerts",
    color:    "#2AABEE",
    iconName: "paper-plane-outline",
  },
  finnhub: {
    label:    "Finnhub",
    badge:    "market data",
    color:    "#10B981",
    iconName: "pulse-outline",
  },
};

const FALLBACK_DISPLAY: ProviderDisplay = {
  label:    "Unknown Provider",
  badge:    "data",
  color:    "#64748B",
  iconName: "radio-outline",
};

// ─────────────────────────────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────────────────────────────

interface StatusConfig {
  label:       string;
  pillBg:      string;
  pillBorder:  string;
  textColor:   string;
  dotColor:    string;
  showPing:    boolean;
  showSpin:    boolean;
}

const STATUS_CONFIG: Record<ProviderStatus, StatusConfig> = {
  connected: {
    label:      "Connected",
    pillBg:     "rgba(59,130,246,0.10)",
    pillBorder: "rgba(59,130,246,0.20)",
    textColor:  "#60A5FA",
    dotColor:   "#60A5FA",
    showPing:   true,
    showSpin:   false,
  },
  reconnecting: {
    label:      "Reconnecting",
    pillBg:     "rgba(245,158,11,0.10)",
    pillBorder: "rgba(245,158,11,0.20)",
    textColor:  "#FBBF24",
    dotColor:   "#FBBF24",
    showPing:   false,
    showSpin:   true,
  },
  connecting: {
    label:      "Connecting",
    pillBg:     "rgba(245,158,11,0.08)",
    pillBorder: "rgba(245,158,11,0.18)",
    textColor:  "#FBBF24",
    dotColor:   "#FBBF24",
    showPing:   false,
    showSpin:   true,
  },
  disconnected: {
    label:      "Offline",
    pillBg:     "rgba(239,68,68,0.10)",
    pillBorder: "rgba(239,68,68,0.20)",
    textColor:  "#F87171",
    dotColor:   "#F87171",
    showPing:   false,
    showSpin:   false,
  },
  error: {
    label:      "Error",
    pillBg:     "rgba(239,68,68,0.10)",
    pillBorder: "rgba(239,68,68,0.20)",
    textColor:  "#F87171",
    dotColor:   "#F87171",
    showPing:   false,
    showSpin:   false,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtUptime(connectedAt: number | null | undefined): string {
  if (!connectedAt) return "—";
  const s = Math.floor((Date.now() - connectedAt) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function fmtLastSync(lastSyncAt: number | null | undefined): string {
  if (!lastSyncAt) return "Never";
  const s = Math.round((Date.now() - lastSyncAt) / 1000);
  if (s < 5)    return "Just now";
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function fmtTicks(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n > 999) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Ping dot (animated pulse for connected status)
// ─────────────────────────────────────────────────────────────────────────────

const PingDot = memo(function PingDot({ color }: { color: string }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.8, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(scale,   { toValue: 1.0, duration: 0,   useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,   duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.7, duration: 0,   useNativeDriver: true }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, scale]);

  return (
    <View style={styles.pingWrapper}>
      {/* Expanding ring */}
      <Animated.View
        style={[
          styles.pingRing,
          { backgroundColor: color, transform: [{ scale }], opacity },
        ]}
      />
      {/* Solid core */}
      <View style={[styles.pingCore, { backgroundColor: color }]} />
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Spin icon (for reconnecting / connecting)
// ─────────────────────────────────────────────────────────────────────────────

const SpinIcon = memo(function SpinIcon({ color }: { color: string }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(rotation, {
        toValue:         1,
        duration:        1500,
        easing:          Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange:  [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Ionicons name="refresh-outline" size={14} color={color} />
    </Animated.View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// StatusPill
// ─────────────────────────────────────────────────────────────────────────────

const StatusPill = memo(function StatusPill({ status }: { status: ProviderStatus }) {
  const cfg = STATUS_CONFIG[status];

  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: cfg.pillBg, borderColor: cfg.pillBorder },
      ]}
    >
      {cfg.showPing && <PingDot color={cfg.dotColor} />}
      {cfg.showSpin && <SpinIcon color={cfg.textColor} />}
      <Text style={[styles.statusPillText, { color: cfg.textColor }]}>
        {cfg.label}
      </Text>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ProviderCard
// ─────────────────────────────────────────────────────────────────────────────

const ProviderCard = memo(function ProviderCard({ data }: { data: ProviderCardData }) {
  const display = PROVIDER_DISPLAY[data.id.toLowerCase()] ?? FALLBACK_DISPLAY;
  const accentColor = data.color ?? display.color;
  const badge       = data.badge ?? display.badge;
  const label       = data.displayName || display.label;

  const iconBg     = `${accentColor}1A`; // ~10% opacity
  const iconBorder = `${accentColor}30`; // ~19% opacity

  const isOnline = data.status === "connected";
  const cfg      = STATUS_CONFIG[data.status];

  return (
    <View style={styles.card}>
      {/* Tinted accent overlay (approximates radial-gradient from web) */}
      <View
        style={[styles.cardAccent, { backgroundColor: `${accentColor}07` }]}
        pointerEvents="none"
      />

      <View style={styles.cardBody}>

        {/* ── Top row: icon + name + status pill ── */}
        <View style={styles.topRow}>
          <View style={styles.topLeft}>
            {/* Provider icon */}
            <View style={[styles.iconBox, { backgroundColor: iconBg, borderColor: iconBorder }]}>
              {isOnline ? (
                <Ionicons name="wifi-outline"     size={14} color={accentColor} />
              ) : data.status === "reconnecting" || data.status === "connecting" ? (
                <SpinIcon color={cfg.textColor} />
              ) : (
                <Ionicons name="wifi-outline"     size={14} color={cfg.dotColor} />
              )}
            </View>
            {/* Name + badge */}
            <View>
              <Text style={styles.providerLabel} numberOfLines={1}>{label}</Text>
              <Text style={styles.providerBadge} numberOfLines={1}>
                {badge} feed
              </Text>
            </View>
          </View>
          <StatusPill status={data.status} />
        </View>

        {/* ── Stats row ── */}
        <View style={styles.statsRow}>
          <StatCell label="Latency" value={data.latencyMs != null ? `${data.latencyMs}ms` : "—"} />
          <StatCell label="Ticks"   value={fmtTicks(data.tickCount)} />
          <StatCell
            label="Reconnects"
            value={data.reconnectCount !== undefined ? String(data.reconnectCount) : "—"}
            valueColor={(data.reconnectCount ?? 0) > 0 ? "#FBBF24" : undefined}
          />
          <StatCell label="Uptime"  value={fmtUptime(data.connectedAt)} />
        </View>

        {/* ── Footer: last sync + subs + optional action ── */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerText}>
              Last sync:{" "}
              <Text style={styles.footerAccent}>
                {fmtLastSync(data.lastSyncAt)}
              </Text>
            </Text>
            {data.subscriptionCount !== undefined && (
              <View style={styles.subsBadge}>
                <Ionicons name="trending-up-outline" size={10} color="rgba(148,163,184,0.40)" />
                <Text style={styles.footerText}>
                  {data.subscriptionCount} symbol{data.subscriptionCount !== 1 ? "s" : ""}
                </Text>
              </View>
            )}
          </View>

          {/* Action button */}
          {data.actionLabel && data.onAction && (
            <Pressable
              onPress={data.onAction}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={data.actionLabel}
            >
              <Text style={styles.actionBtnText}>{data.actionLabel}</Text>
            </Pressable>
          )}
        </View>

      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// StatCell — small metric inside the stats row
// ─────────────────────────────────────────────────────────────────────────────

interface StatCellProps {
  label:       string;
  value:       string;
  valueColor?: string;
}

const StatCell = memo(function StatCell({ label, value, valueColor }: StatCellProps) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      <Text
        style={[styles.statValue, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ProviderStatusCards — main export
// ─────────────────────────────────────────────────────────────────────────────

function ProviderStatusCards({
  providers,
  loading      = false,
  loadingCount = 2,
  style,
}: ProviderStatusCardsProps) {

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading && providers.length === 0) {
    return (
      <View style={[styles.grid, style]}>
        {Array.from({ length: loadingCount }).map((_, i) => (
          <Skeleton key={i} style={styles.skeletonCard} />
        ))}
      </View>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!loading && providers.length === 0) {
    return (
      <View style={[styles.emptyContainer, style]}>
        <Ionicons name="radio-outline" size={24} color="rgba(148,163,184,0.40)" />
        <Text style={styles.emptyText}>No providers configured</Text>
      </View>
    );
  }

  // ── Provider cards ────────────────────────────────────────────────────────
  return (
    <View style={[styles.grid, style]}>
      {providers.map((p) => (
        <View key={p.id} style={styles.gridItem}>
          <ProviderCard data={p} />
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProviderBadge — exported for web API parity
// ─────────────────────────────────────────────────────────────────────────────

export interface ProviderBadgeProps {
  provider: string;
  small?:   boolean;
}

export const ProviderBadge = memo(function ProviderBadge({
  provider,
  small = false,
}: ProviderBadgeProps) {
  const display = PROVIDER_DISPLAY[provider.toLowerCase()];
  const color   = display?.color   ?? "#64748B";
  const label   = display?.label   ?? provider.toUpperCase();

  // Prefix Delta with Δ to mirror web parity
  const displayLabel = provider.toLowerCase() === "delta" ? `Δ ${label}` : label;

  return (
    <View
      style={[
        styles.providerBadgeOuter,
        small ? styles.providerBadgeSmall : styles.providerBadgeDefault,
        { backgroundColor: `${color}18`, borderColor: `${color}30` },
      ]}
    >
      <Text
        style={[
          styles.providerBadgeText,
          small ? styles.providerBadgeTextSmall : styles.providerBadgeTextDefault,
          { color },
        ]}
      >
        {displayLabel}
      </Text>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const CARD_BG     = "#0A0E18";
const CARD_BORDER = "rgba(255,255,255,0.07)";
const DIVIDER     = "rgba(255,255,255,0.05)";
const TEXT_MUTED  = "rgba(148,163,184,0.50)";
const TEXT_DIM    = "rgba(148,163,184,0.35)";

const styles = StyleSheet.create({
  // ── Grid layout (2 columns on tablet, wraps to 1 on narrow screens) ──────
  grid: {
    flexDirection:  "row",
    flexWrap:       "wrap",
    gap:            12,
  },
  gridItem: {
    // ≥2 providers → ~half width (minus gap); 1 provider → full width
    // minWidth ensures wrapping at small sizes
    flex:    1,
    minWidth: 260,
  },
  skeletonCard: {
    flex:    1,
    minWidth: 260,
    height:  148,
    borderRadius: 16,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: CARD_BG,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     CARD_BORDER,
    overflow:        "hidden",
  },
  cardAccent: {
    ...StyleSheet.absoluteFillObject,
  },
  cardBody: {
    padding: 14,
    gap:     12,
  },

  // ── Top row ───────────────────────────────────────────────────────────────
  topRow: {
    flexDirection:  "row",
    alignItems:     "flex-start",
    justifyContent: "space-between",
    gap:            8,
  },
  topLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           10,
    flex:          1,
  },
  iconBox: {
    width:          34,
    height:         34,
    borderRadius:   10,
    borderWidth:    1,
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },
  providerLabel: {
    color:      "#FFFFFF",
    fontSize:   13,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    lineHeight: 17,
  },
  providerBadge: {
    color:      TEXT_DIM,
    fontSize:   10,
    fontFamily: "Inter_400Regular",
    marginTop:  1,
    textTransform: "capitalize",
  },

  // ── Status pill ───────────────────────────────────────────────────────────
  statusPill: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             5,
    paddingHorizontal: 8,
    paddingVertical:   5,
    borderRadius:    8,
    borderWidth:     1,
    flexShrink:      0,
  },
  statusPillText: {
    fontSize:   10,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },

  // ── Ping dot ──────────────────────────────────────────────────────────────
  pingWrapper: {
    width:          8,
    height:         8,
    alignItems:     "center",
    justifyContent: "center",
  },
  pingRing: {
    position:     "absolute",
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  pingCore: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },

  // ── Stats row ─────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection:    "row",
    paddingTop:       10,
    borderTopWidth:   1,
    borderTopColor:   DIVIDER,
    gap:              4,
  },
  statCell: {
    flex: 1,
  },
  statLabel: {
    color:          TEXT_DIM,
    fontSize:       9,
    fontFamily:     "Inter_600SemiBold",
    fontWeight:     "600",
    textTransform:  "uppercase",
    letterSpacing:  0.5,
    marginBottom:   3,
  },
  statValue: {
    color:      "#FFFFFF",
    fontSize:   12,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
  },
  footerLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           10,
    flex:          1,
  },
  footerText: {
    color:      TEXT_DIM,
    fontSize:   10,
    fontFamily: "Inter_400Regular",
  },
  footerAccent: {
    color:      TEXT_MUTED,
  },
  subsBadge: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           3,
  },

  // ── Action button ─────────────────────────────────────────────────────────
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRadius:      8,
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.10)",
    backgroundColor:   "rgba(255,255,255,0.05)",
  },
  actionBtnText: {
    color:      "#EDF0F6",
    fontSize:   11,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyContainer: {
    alignItems:     "center",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    color:      TEXT_MUTED,
    fontSize:   13,
    fontFamily: "Inter_400Regular",
  },

  // ── ProviderBadge (inline pill) ───────────────────────────────────────────
  providerBadgeOuter: {
    flexDirection: "row",
    borderRadius:  6,
    borderWidth:   1,
  },
  providerBadgeSmall: {
    paddingHorizontal: 5,
    paddingVertical:   2,
  },
  providerBadgeDefault: {
    paddingHorizontal: 6,
    paddingVertical:   2,
  },
  providerBadgeText: {
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  providerBadgeTextSmall: {
    fontSize: 9,
  },
  providerBadgeTextDefault: {
    fontSize: 10,
  },

  // ── Press feedback ────────────────────────────────────────────────────────
  pressed: {
    opacity: 0.75,
  },
});

export { ProviderStatusCards };
export default memo(ProviderStatusCards);
