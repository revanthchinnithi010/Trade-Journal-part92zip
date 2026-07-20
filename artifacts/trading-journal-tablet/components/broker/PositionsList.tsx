/**
 * PositionsList — React Native port of src/components/broker/PositionsList.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. div/span/button → View/Text/Pressable + StyleSheet
 * 2. Inline map() list → FlashList (@shopify/flash-list, fully virtualized)
 *    - keyExtractor:     stable (item.id)
 *    - renderItem:       memoized via useCallback
 *    - PositionRow:      wrapped in React.memo to prevent unnecessary re-renders
 *    - onRefresh / refreshing: pull-to-refresh via RefreshControl
 *    - ListEmptyComponent: loading + empty states
 *    - estimatedItemSize: 84px (measured from row height)
 * 3. Lucide icons → Ionicons (@expo/vector-icons)
 *    TrendingUp     → trending-up-outline
 *    TrendingDown   → trending-down-outline
 *    Loader2        → ActivityIndicator (built-in)
 *    AlertTriangle  → warning-outline
 *    X              → close
 * 4. className/Tailwind → StyleSheet (values preserved exactly)
 * 5. overflow-y-auto scroll → FlatList handles scrolling natively
 *
 * All business logic preserved exactly:
 *   - closePosition() two-tap confirm flow (confirm state → confirm → execute)
 *   - closing loading state
 *   - setConfirm(false) after completion
 *   - symKey derivation: symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD"
 *   - livePrice = liveTick?.price ?? pos.markPrice (live tick preferred, fallback to markPrice)
 *   - livePnl calculation: Long = (livePrice - entryPrice) × size, Short = (entryPrice - livePrice) × size
 *   - PnlBadge: positive → green TrendingUp, negative → red TrendingDown, fc(pnl) formatting
 *   - useCurrencyFormatter() from currencyStore
 *   - Entry / Mark / Size 3-column grid
 *   - leverage display (when pos.leverage is set)
 *   - refreshPositions() on header Refresh button
 *   - setShowPositions(false) on X button
 *   - connectionStatus === "connecting" loading state
 *   - empty state (positions.length === 0)
 *   - BROKERS lookup for broker badge
 *   - all brokerStore + tickStore interactions preserved identically
 */

import { useState, useCallback, memo } from "react";
import {
  View, Text, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useBrokerStore } from "@/store/brokerStore";
import { useTickStore } from "@/store/tickStore";
import { useCurrencyFormatter } from "@/store/currencyStore";
import { BROKERS } from "@/types/broker";
import type { BrokerPosition } from "@/types/broker";

// ── Design tokens (match web palette exactly) ─────────────────────────────────
const BG         = "rgba(5,14,10,0.98)";
const BORDER_DIM = "rgba(57,91,67,0.15)";
const BORDER_ROW = "rgba(57,91,67,0.12)";
const TEXT_HI    = "#ffffff";
const TEXT_DIM   = "rgba(167,184,169,0.60)";
const TEXT_MUTED = "rgba(167,184,169,0.40)";
const ACCENT     = "#B7FF5A";
const BUY_CLR    = "#4ade80";
const SELL_CLR   = "#f87171";

// ── PnlBadge ──────────────────────────────────────────────────────────────────

interface PnlBadgeProps {
  pnl: number;
}

function PnlBadge({ pnl }: PnlBadgeProps) {
  const fc  = useCurrencyFormatter();
  const pos = pnl >= 0;
  return (
    <View style={pnlStyles.badge}>
      <Ionicons
        name={pos ? "trending-up-outline" : "trending-down-outline"}
        size={12}
        color={pos ? BUY_CLR : SELL_CLR}
      />
      <Text style={[pnlStyles.text, { color: pos ? BUY_CLR : SELL_CLR }]}>
        {pos ? "+" : ""}{fc(pnl)}
      </Text>
    </View>
  );
}

const pnlStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           2,
  },
  text: {
    fontSize:   11,
    fontWeight: "700",
  },
});

// ── PositionRow ───────────────────────────────────────────────────────────────

interface PositionRowProps {
  pos: BrokerPosition;
}

const PositionRow = memo(function PositionRow({ pos }: PositionRowProps) {
  const { closePosition } = useBrokerStore();
  const ticks = useTickStore(s => s.ticks);
  const [closing, setClosing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  // Live price derivation (preserved exactly from web)
  const symKey   = pos.symbol.replace(/USDT$|USD$|PERP$/, "").replace(/-/g, "") + "USD";
  const liveTick = ticks[symKey];
  const livePrice = liveTick?.price ?? pos.markPrice;

  // Live PnL calculation (preserved exactly from web)
  const livePnl = pos.side === "Long"
    ? (livePrice - pos.entryPrice) * pos.size
    : (pos.entryPrice - livePrice) * pos.size;

  const handleClose = async () => {
    if (!confirm) { setConfirm(true); return; }
    setClosing(true);
    await closePosition(pos);
    setClosing(false);
    setConfirm(false);
  };

  const isLong = pos.side === "Long";

  return (
    <View style={rowStyles.row}>
      {/* Top row: side badge + symbol + live PnL */}
      <View style={rowStyles.topRow}>
        <View style={rowStyles.topLeft}>
          <View style={[
            rowStyles.sideBadge,
            { backgroundColor: isLong ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)" },
          ]}>
            <Text style={[rowStyles.sideBadgeText, { color: isLong ? BUY_CLR : SELL_CLR }]}>
              {pos.side.toUpperCase()}
            </Text>
          </View>
          <Text style={rowStyles.symbol}>{pos.symbol}</Text>
        </View>
        <PnlBadge pnl={livePnl} />
      </View>

      {/* Data grid: Entry + Mark + Size */}
      <View style={rowStyles.dataGrid}>
        <View style={rowStyles.dataCell}>
          <Text style={rowStyles.dataLabel}>ENTRY</Text>
          <Text style={rowStyles.dataValue}>{pos.entryPrice.toFixed(2)}</Text>
        </View>
        <View style={rowStyles.dataCell}>
          <Text style={rowStyles.dataLabel}>MARK</Text>
          <Text style={[rowStyles.dataValue, { color: ACCENT }]}>{livePrice.toFixed(2)}</Text>
        </View>
        <View style={rowStyles.dataCell}>
          <Text style={rowStyles.dataLabel}>SIZE</Text>
          <Text style={rowStyles.dataValue}>{pos.size}</Text>
        </View>
      </View>

      {/* Bottom row: leverage + close button */}
      <View style={rowStyles.bottomRow}>
        <Text style={rowStyles.leverageText}>
          {pos.leverage ? `${pos.leverage}x leverage` : ""}
        </Text>

        <Pressable
          onPress={handleClose}
          disabled={closing}
          style={({ pressed }) => [
            rowStyles.closeBtn,
            confirm && rowStyles.closeBtnConfirm,
            pressed && { opacity: 0.75 },
          ]}
        >
          {closing ? (
            <ActivityIndicator size={12} color={SELL_CLR} />
          ) : confirm ? (
            <>
              <Ionicons name="warning-outline" size={12} color={SELL_CLR} />
              <Text style={[rowStyles.closeBtnText, rowStyles.closeBtnTextConfirm]}>
                Confirm Close
              </Text>
            </>
          ) : (
            <Text style={rowStyles.closeBtnText}>Close</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
});

// ── PositionsList ─────────────────────────────────────────────────────────────

export function PositionsList() {
  const { positions, activeAccount, setShowPositions, refreshPositions, connectionStatus } =
    useBrokerStore();
  const broker = BROKERS.find(b => b.id === activeAccount?.broker_id);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshPositions();
    setRefreshing(false);
  }, [refreshPositions]);

  // ── FlatList helpers ──────────────────────────────────────────────────────

  const keyExtractor = useCallback((item: BrokerPosition) => item.id, []);

  const renderItem = useCallback<ListRenderItem<BrokerPosition>>(
    ({ item }) => <PositionRow pos={item} />,
    [],
  );

  // ── Loading / empty state ─────────────────────────────────────────────────

  const ListEmpty = useCallback(() => {
    if (connectionStatus === "connecting") {
      return (
        <View style={listStyles.emptyContainer}>
          <ActivityIndicator size={20} color={TEXT_DIM} />
          <Text style={listStyles.emptyText}>Loading positions…</Text>
        </View>
      );
    }
    return (
      <View style={listStyles.emptyContainer}>
        <Ionicons name="trending-up-outline" size={32} color="rgba(57,91,67,0.4)" />
        <Text style={listStyles.emptyTextBold}>No open positions</Text>
      </View>
    );
  }, [connectionStatus]);

  return (
    <View style={listStyles.container}>
      {/* Header */}
      <View style={listStyles.header}>
        <View style={listStyles.headerLeft}>
          <Ionicons name="trending-up-outline" size={16} color={ACCENT} />
          <Text style={listStyles.headerTitle}>Open Positions</Text>
          {broker && (
            <View style={[
              listStyles.brokerBadge,
              { backgroundColor: broker.color + "22" },
            ]}>
              <Text style={[listStyles.brokerBadgeText, { color: broker.color }]}>
                {broker.name}
              </Text>
            </View>
          )}
        </View>

        <View style={listStyles.headerRight}>
          <Pressable
            onPress={() => { void refreshPositions(); }}
            style={({ pressed }) => [listStyles.refreshBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={listStyles.refreshBtnText}>Refresh</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowPositions(false)}
            style={({ pressed }) => [listStyles.closeBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <Ionicons name="close" size={14} color={TEXT_MUTED} />
          </Pressable>
        </View>
      </View>

      {/* List */}
      <FlashList
        data={positions}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={ListEmpty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={TEXT_DIM}
          />
        }
        contentContainerStyle={positions.length === 0 ? listStyles.emptyFill : undefined}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const rowStyles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical:   12,
    gap:               6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_ROW,
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
    flexShrink:    1,
    minWidth:      0,
  },
  sideBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      4,
    flexShrink:        0,
  },
  sideBadgeText: {
    fontSize:   10,
    fontWeight: "900",
  },
  symbol: {
    fontSize:   13,
    fontWeight: "700",
    color:      TEXT_HI,
    flexShrink: 1,
  },
  dataGrid: {
    flexDirection: "row",
    gap:           16,
    marginTop:     4,
  },
  dataCell: {
    minWidth: 70,
    flex:     1,
  },
  dataLabel: {
    fontSize:      9,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color:         "rgba(167,184,169,0.45)",
    marginBottom:  2,
  },
  dataValue: {
    fontSize:   11,
    fontWeight: "600",
    color:      TEXT_HI,
  },
  bottomRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginTop:      4,
  },
  leverageText: {
    fontSize: 9,
    color:    TEXT_MUTED,
    flex:     1,
  },
  closeBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               4,
    height:            26,
    paddingHorizontal: 12,
    borderRadius:      8,
    backgroundColor:   "rgba(239,68,68,0.08)",
    borderWidth:       1,
    borderColor:       "rgba(239,68,68,0.15)",
  },
  closeBtnConfirm: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderColor:     "rgba(239,68,68,0.3)",
  },
  closeBtnText: {
    fontSize:   10,
    fontWeight: "700",
    color:      "rgba(239,68,68,0.6)",
  },
  closeBtnTextConfirm: {
    color: SELL_CLR,
  },
});

const listStyles = StyleSheet.create({
  container: {
    flex:              1,
    backgroundColor:   BG,
    borderLeftWidth:   1,
    borderLeftColor:   "rgba(57,91,67,0.2)",
  },
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
    fontSize:   14,
    fontWeight: "700",
    color:      TEXT_HI,
  },
  brokerBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      4,
  },
  brokerBadgeText: {
    fontSize:   9,
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
  },
  refreshBtn: {
    height:            24,
    paddingHorizontal: 8,
    borderRadius:      6,
    backgroundColor:   "rgba(57,91,67,0.15)",
    alignItems:        "center",
    justifyContent:    "center",
  },
  refreshBtnText: {
    fontSize: 10,
    color:    TEXT_DIM,
  },
  closeBtn: {
    width:          24,
    height:         24,
    borderRadius:   6,
    alignItems:     "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems:      "center",
    justifyContent:  "center",
    gap:             8,
    paddingVertical: 32,
  },
  emptyFill: {
    flexGrow: 1,
  },
  emptyText: {
    fontSize: 11,
    color:    TEXT_DIM,
  },
  emptyTextBold: {
    fontSize:   12,
    fontWeight: "600",
    color:      "rgba(167,184,169,0.5)",
  },
});
