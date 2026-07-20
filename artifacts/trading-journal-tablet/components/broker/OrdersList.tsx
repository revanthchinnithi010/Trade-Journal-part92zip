/**
 * OrdersList — React Native port of src/components/broker/OrdersList.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. div/span/button → View/Text/Pressable + StyleSheet
 * 2. Inline map() list → FlatList (fully virtualized)
 *    - keyExtractor: stable (item.id)
 *    - renderItem:   memoized via useCallback
 *    - OrderRow:     wrapped in React.memo to prevent unnecessary re-renders
 *    - onRefresh / refreshing: pull-to-refresh via RefreshControl
 *    - ListEmptyComponent: loading + empty states
 * 3. Lucide icons → Ionicons (@expo/vector-icons)
 *    BarChart2      → bar-chart-outline
 *    Loader2        → ActivityIndicator (built-in)
 *    AlertTriangle  → warning-outline
 *    X              → close
 * 4. className/Tailwind → StyleSheet (values preserved exactly)
 * 5. overflow-y-auto scroll → FlatList handles scrolling natively
 *
 * All business logic preserved exactly:
 *   - cancelOrder() two-tap confirm flow (confirm state → confirm → execute)
 *   - cancelling loading state
 *   - setConfirm(false) after completion
 *   - ord.createdAt date parsing (Number() || direct) + toLocaleTimeString
 *   - price display: > 0 → toFixed(2), else "Market"
 *   - side/orderType/status badges
 *   - refreshOrders() on header Refresh button
 *   - setShowOrders(false) on X button
 *   - connectionStatus === "connecting" loading state
 *   - empty state (orders.length === 0)
 *   - BROKERS lookup for broker badge
 *   - all brokerStore interactions preserved identically
 */

import { useState, useCallback, memo } from "react";
import {
  View, Text, Pressable, StyleSheet,
  FlatList, ActivityIndicator, RefreshControl,
  type ListRenderItem,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useBrokerStore } from "@/store/brokerStore";
import { BROKERS } from "@/types/broker";
import type { BrokerOrder } from "@/types/broker";

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
const ERR_CLR    = "#ef4444";

// ── OrderRow ──────────────────────────────────────────────────────────────────

interface OrderRowProps {
  ord: BrokerOrder;
}

const OrderRow = memo(function OrderRow({ ord }: OrderRowProps) {
  const { cancelOrder } = useBrokerStore();
  const [cancelling, setCancelling] = useState(false);
  const [confirm,    setConfirm]    = useState(false);

  const handleCancel = async () => {
    if (!confirm) { setConfirm(true); return; }
    setCancelling(true);
    await cancelOrder(ord);
    setCancelling(false);
    setConfirm(false);
  };

  const isBuy = ord.side === "Buy";
  const d = ord.createdAt ? new Date(Number(ord.createdAt) || ord.createdAt) : null;
  const timeStr = d && !isNaN(d.getTime())
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <View style={rowStyles.row}>
      {/* Top row: side badge + symbol + order type + time */}
      <View style={rowStyles.topRow}>
        <View style={rowStyles.topLeft}>
          {/* Side badge */}
          <View style={[
            rowStyles.sideBadge,
            { backgroundColor: isBuy ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)" },
          ]}>
            <Text style={[rowStyles.sideBadgeText, { color: isBuy ? BUY_CLR : SELL_CLR }]}>
              {ord.side.toUpperCase()}
            </Text>
          </View>
          {/* Symbol */}
          <Text style={rowStyles.symbol}>{ord.symbol}</Text>
          {/* Order type badge */}
          <View style={rowStyles.typeBadge}>
            <Text style={rowStyles.typeBadgeText}>{ord.orderType}</Text>
          </View>
        </View>
        {/* Time */}
        <Text style={rowStyles.time}>{timeStr}</Text>
      </View>

      {/* Data grid: Price + Qty */}
      <View style={rowStyles.dataGrid}>
        <View style={rowStyles.dataCell}>
          <Text style={rowStyles.dataLabel}>PRICE</Text>
          <Text style={rowStyles.dataValue}>
            {ord.price > 0 ? ord.price.toFixed(2) : "Market"}
          </Text>
        </View>
        <View style={rowStyles.dataCell}>
          <Text style={rowStyles.dataLabel}>QTY</Text>
          <Text style={rowStyles.dataValue}>{ord.qty}</Text>
        </View>
      </View>

      {/* Bottom row: status + cancel button */}
      <View style={rowStyles.bottomRow}>
        <View style={rowStyles.statusBadge}>
          <Text style={rowStyles.statusText}>{ord.status}</Text>
        </View>

        <Pressable
          onPress={handleCancel}
          disabled={cancelling}
          style={({ pressed }) => [
            rowStyles.cancelBtn,
            confirm && rowStyles.cancelBtnConfirm,
            pressed && { opacity: 0.75 },
          ]}
        >
          {cancelling ? (
            <ActivityIndicator size={12} color={SELL_CLR} />
          ) : confirm ? (
            <>
              <Ionicons name="warning-outline" size={12} color={SELL_CLR} />
              <Text style={[rowStyles.cancelBtnText, rowStyles.cancelBtnTextConfirm]}>
                Confirm Cancel
              </Text>
            </>
          ) : (
            <Text style={rowStyles.cancelBtnText}>Cancel</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
});

// ── OrdersList ────────────────────────────────────────────────────────────────

export function OrdersList() {
  const { orders, activeAccount, setShowOrders, refreshOrders, connectionStatus } =
    useBrokerStore();
  const broker = BROKERS.find(b => b.id === activeAccount?.broker_id);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshOrders();
    setRefreshing(false);
  }, [refreshOrders]);

  // ── FlatList helpers ──────────────────────────────────────────────────────

  const keyExtractor = useCallback((item: BrokerOrder) => item.id, []);

  const renderItem = useCallback<ListRenderItem<BrokerOrder>>(
    ({ item }) => <OrderRow ord={item} />,
    [],
  );

  // ── Loading / empty state ────────────────────────────────────────────────

  const ListEmpty = useCallback(() => {
    if (connectionStatus === "connecting") {
      return (
        <View style={listStyles.emptyContainer}>
          <ActivityIndicator size={20} color={TEXT_DIM} />
          <Text style={listStyles.emptyText}>Loading orders…</Text>
        </View>
      );
    }
    return (
      <View style={listStyles.emptyContainer}>
        <Ionicons name="bar-chart-outline" size={32} color="rgba(57,91,67,0.4)" />
        <Text style={listStyles.emptyTextBold}>No open orders</Text>
      </View>
    );
  }, [connectionStatus]);

  return (
    <View style={listStyles.container}>
      {/* Header */}
      <View style={listStyles.header}>
        <View style={listStyles.headerLeft}>
          <Ionicons name="bar-chart-outline" size={16} color={ACCENT} />
          <Text style={listStyles.headerTitle}>Open Orders</Text>
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
            onPress={() => { void refreshOrders(); }}
            style={({ pressed }) => [listStyles.refreshBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={listStyles.refreshBtnText}>Refresh</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowOrders(false)}
            style={({ pressed }) => [listStyles.closeBtn, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <Ionicons name="close" size={14} color={TEXT_MUTED} />
          </Pressable>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={orders}
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
        contentContainerStyle={orders.length === 0 ? listStyles.emptyFill : undefined}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        windowSize={10}
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
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      4,
    backgroundColor:   "rgba(57,91,67,0.2)",
    flexShrink:        0,
  },
  typeBadgeText: {
    fontSize: 9,
    color:    TEXT_DIM,
  },
  time: {
    fontSize: 10,
    color:    TEXT_MUTED,
    flexShrink: 0,
  },
  dataGrid: {
    flexDirection: "row",
    gap:           16,
    marginTop:     4,
  },
  dataCell: {
    minWidth: 60,
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
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical:   2,
    borderRadius:      4,
    backgroundColor:   "rgba(57,91,67,0.15)",
  },
  statusText: {
    fontSize: 9,
    color:    "rgba(167,184,169,0.5)",
  },
  cancelBtn: {
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
  cancelBtnConfirm: {
    backgroundColor: "rgba(239,68,68,0.15)",
    borderColor:     "rgba(239,68,68,0.3)",
  },
  cancelBtnText: {
    fontSize:   10,
    fontWeight: "700",
    color:      "rgba(239,68,68,0.6)",
  },
  cancelBtnTextConfirm: {
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
    alignItems:     "center",
    justifyContent: "center",
    gap:            8,
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
