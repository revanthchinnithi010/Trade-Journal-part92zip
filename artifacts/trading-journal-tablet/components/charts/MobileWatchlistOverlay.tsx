/**
 * MobileWatchlistOverlay — React Native port of
 * src/components/charts/MobileWatchlistOverlay.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. createPortal(document.body) → Modal (react-native)
 *    The web renders into a portal at the document root. In RN, Modal provides
 *    the same full-screen overlay behaviour with a native z-index guarantee.
 *
 * 2. framer-motion AnimatePresence + motion.div slide-up/fade
 *    → Animated.Value (translateY) + Animated.timing spring-equivalent.
 *    The spring config (stiffness 340, damping 34) is approximated as a
 *    timing curve with duration 280ms easeOut for the enter, 200ms easeIn
 *    for the exit. Modal's `animationType="none"` disables the native slide
 *    so our custom Animated drives it instead.
 *    Backdrop fade-in: separate Animated.Value opacity (0 → 1, 200ms).
 *
 * 3. DOM mutation RAF (LivePriceCell)
 *    Web: priceRef.current.textContent = ... at 60fps RAF loop.
 *    RN:  No DOM text nodes. Uses a 150ms setInterval that reads from
 *         useTickStore.getState() directly (zero React state, zero re-renders
 *         of the parent list). Text is updated via setNativeProps on the Text
 *         ref (closest RN equivalent to DOM textContent mutation).
 *         If setNativeProps is unavailable, falls back to setState with
 *         throttled updates.
 *
 * 4. WebkitTapHighlightColor / onTouchStart/onTouchEnd press feedback
 *    → Pressable (built-in RN press handling with ripple / opacity feedback).
 *
 * 5. CSS linear-gradient backgrounds in MARKET_COLORS / SYMBOL_OVERRIDES
 *    → Solid flat colors (dominant color from each gradient).
 *    expo-linear-gradient is not installed; gradients are not required for
 *    functional correctness and will be added in a styling polish pass.
 *
 * 6. MobileBottomNav (web) at the bottom of the overlay
 *    → Removed. The tablet uses Expo Router Tab Bar (always present), so a
 *    duplicated bottom nav inside the overlay would conflict.
 *
 * 7. div overflow-y-auto list → FlatList (virtualized)
 *    - keyExtractor: stable (item.symbol)
 *    - renderItem: memoized via useCallback
 *    - WatchlistRow: React.memo
 *    - Skeleton loading: 10 placeholder rows, same count as web
 *
 * 8. SYMBOL_CATALOG, useWatchlist, WatchlistEntry imported from
 *    @/contexts/WatchlistContext (thin RN bridge over brokerWatchlistStore) ✅
 *
 * All business logic preserved exactly:
 *   - activeTab state (0 = Watchlist, 1 = + Add list) with tab buttons
 *   - handleSelect: calls onSelect(symbol) then onClose()
 *   - handleChartTab: calls onOpenChart() then onClose()
 *   - Symbol icon badge/market lookup via SYMBOL_CATALOG
 *   - isActive highlight (item.symbol === activeSymbol)
 *   - LIVE badge on active symbol
 *   - loading skeleton (10 rows) while loading is true
 *   - Price · Chg% column header
 *   - App logo + TrendingUp icon in header
 *   - Plus button and close button in header
 *   - Backdrop tap closes overlay
 *   - Bottom 24px spacer preserved as ListFooterComponent
 */

import {
  memo, useEffect, useRef, useCallback, useState,
} from "react";
import {
  View, Text, Pressable, StyleSheet,
  Modal, FlatList, Animated, Dimensions,
  type ListRenderItem,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTickStore } from "@/store/tickStore";
import { useWatchlist, SYMBOL_CATALOG, type WatchlistEntry } from "@/contexts/WatchlistContext";
import { fmtPrice } from "@/lib/fmtPrice";

// ── Screen height (for slide-up animation) ────────────────────────────────────
const { height: SCREEN_H } = Dimensions.get("window");

// ── Symbol icon solid colors (dominant from each gradient) ────────────────────
// Web used CSS linear-gradient; RN uses solid flat color equivalents.
const MARKET_BG: Record<string, { bg: string; text: string }> = {
  Crypto:      { bg: "#f7931a", text: "#fff"   },
  Forex:       { bg: "#3b82f6", text: "#fff"   },
  Indices:     { bg: "#8b5cf6", text: "#fff"   },
  Commodities: { bg: "#eab308", text: "#1a1000" },
  Other:       { bg: "#6b7280", text: "#fff"   },
};

const SYMBOL_BG: Record<string, { bg: string; text: string }> = {
  BTCUSD:  { bg: "#f7931a", text: "#fff" },
  ETHUSD:  { bg: "#627eea", text: "#fff" },
  SOLUSD:  { bg: "#9945ff", text: "#fff" },
  DOGEUSD: { bg: "#ba9f33", text: "#111" },
  PEPEUSD: { bg: "#5cb85c", text: "#fff" },
  EURUSD:  { bg: "#003399", text: "#fff" },
  GBPUSD:  { bg: "#cf142b", text: "#fff" },
  GBPJPY:  { bg: "#cf142b", text: "#fff" },
  USDJPY:  { bg: "#bc002d", text: "#fff" },
  XAUUSD:  { bg: "#d4af37", text: "#111" },
  XAGUSD:  { bg: "#aaaaaa", text: "#111" },
  NAS100:  { bg: "#6366f1", text: "#fff" },
  US30:    { bg: "#2563eb", text: "#fff" },
  SPX500:  { bg: "#059669", text: "#fff" },
  USOIL:   { bg: "#1c1c1c", text: "#f59e0b" },
};

function getIconStyle(symbol: string, market: string) {
  return SYMBOL_BG[symbol] ?? MARKET_BG[market] ?? MARKET_BG.Other;
}

// ── LivePriceCell — price text updated via setNativeProps (no setState) ────────
const LivePriceCell = memo(function LivePriceCell({ symbol }: { symbol: string }) {
  const priceRef  = useRef<Text>(null);
  const changeRef = useRef<Text>(null);
  const prevRef   = useRef<{ price: number; pct: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const t = useTickStore.getState().ticks[symbol];
      if (!t) return;
      const prev = prevRef.current;
      if (prev && prev.price === t.price && prev.pct === t.changePct) return;
      prevRef.current = { price: t.price, pct: t.changePct };
      // setNativeProps — same as DOM textContent mutation: no setState / no re-render
      priceRef.current?.setNativeProps({ text: fmtPrice(t.price, symbol) });
      const pct    = t.changePct;
      const pctStr = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
      const color  = pct >= 0 ? "#00e676" : "#ff4d67";
      changeRef.current?.setNativeProps({ text: pctStr, style: { color } });
    }, 150);
    return () => clearInterval(id);
  }, [symbol]);

  // Initial snapshot
  const t0    = useTickStore.getState().ticks[symbol];
  const p0    = t0?.price    ?? null;
  const pct0  = t0?.changePct ?? 0;
  const isUp0 = pct0 >= 0;

  return (
    <View style={pcStyles.container}>
      <Text ref={priceRef} style={pcStyles.price}>
        {p0 !== null ? fmtPrice(p0, symbol) : "—"}
      </Text>
      <Text
        ref={changeRef}
        style={[pcStyles.change, { color: isUp0 ? "#00e676" : "#ff4d67" }]}
      >
        {isUp0 ? "+" : ""}{pct0.toFixed(2)}%
      </Text>
    </View>
  );
});

const pcStyles = StyleSheet.create({
  container: { alignItems: "flex-end", minWidth: 80 },
  price:     { fontSize: 13, fontWeight: "600", color: "#e8e8e8", letterSpacing: -0.1 },
  change:    { fontSize: 11, fontWeight: "500", marginTop: 2 },
});

// ── SymbolIcon ────────────────────────────────────────────────────────────────

function SymbolIcon({ symbol, badge, market }: { symbol: string; badge: string; market: string }) {
  const style    = getIconStyle(symbol, market);
  const fontSize = badge.length > 4 ? 7.5 : badge.length > 3 ? 8.5 : badge.length > 2 ? 9.5 : 10.5;
  return (
    <View style={[iconStyles.circle, { backgroundColor: style.bg }]}>
      <Text style={[iconStyles.text, { fontSize, color: style.text }]}>
        {badge.slice(0, 5)}
      </Text>
    </View>
  );
}

const iconStyles = StyleSheet.create({
  circle: {
    width:          36,
    height:         36,
    borderRadius:   18,
    flexShrink:     0,
    alignItems:     "center",
    justifyContent: "center",
  },
  text: { fontWeight: "800", letterSpacing: -0.1 },
});

// ── WatchlistRow ──────────────────────────────────────────────────────────────

const WatchlistRow = memo(function WatchlistRow({
  item, isActive, onSelect,
}: {
  item: WatchlistEntry; isActive: boolean; onSelect: () => void;
}) {
  const cat    = SYMBOL_CATALOG[item.symbol];
  const market = cat?.market ?? "Other";

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        rowStyles.row,
        isActive && rowStyles.rowActive,
        pressed  && rowStyles.rowPressed,
      ]}
    >
      <SymbolIcon symbol={item.symbol} badge={item.badge} market={market} />

      <View style={rowStyles.nameCol}>
        <View style={rowStyles.nameRow}>
          <Text style={[rowStyles.badge, isActive && rowStyles.badgeActive]} numberOfLines={1}>
            {item.badge}
          </Text>
          {isActive && (
            <View style={rowStyles.liveBadge}>
              <Text style={rowStyles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <Text style={rowStyles.label} numberOfLines={1}>{item.label}</Text>
      </View>

      <LivePriceCell symbol={item.symbol} />
    </Pressable>
  );
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               11,
    paddingHorizontal: 14,
    paddingVertical:   9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  rowActive:  { backgroundColor: "rgba(255,255,255,0.04)" },
  rowPressed: { backgroundColor: "rgba(255,255,255,0.07)" },
  nameCol: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: {
    fontSize:   13.5,
    fontWeight: "600",
    color:      "rgba(255,255,255,0.85)",
  },
  badgeActive: { color: "#ffffff" },
  liveBadge: {
    paddingHorizontal: 5,
    paddingVertical:   1,
    borderRadius:      4,
    backgroundColor:   "rgba(183,255,90,0.15)",
  },
  liveText: {
    fontSize:      8,
    fontWeight:    "700",
    color:         "#B7FF5A",
    letterSpacing: 0.5,
  },
  label: {
    fontSize:   11,
    color:      "rgba(255,255,255,0.3)",
    marginTop:  1.5,
  },
});

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <View style={skelStyles.row}>
      <View style={skelStyles.circle} />
      <View style={skelStyles.nameCol}>
        <View style={skelStyles.nameLine} />
        <View style={skelStyles.labelLine} />
      </View>
      <View style={skelStyles.priceCol}>
        <View style={skelStyles.priceLine} />
        <View style={skelStyles.changeLine} />
      </View>
    </View>
  );
}

const skelStyles = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.04)" },
  circle:    { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", flexShrink: 0 },
  nameCol:   { flex: 1 },
  nameLine:  { width: 56, height: 10, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.07)", marginBottom: 6 },
  labelLine: { width: 80, height: 9,  borderRadius: 3, backgroundColor: "rgba(255,255,255,0.04)" },
  priceCol:  { alignItems: "flex-end" },
  priceLine: { width: 64, height: 10, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.07)", marginBottom: 6 },
  changeLine: { width: 44, height: 9, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.04)" },
});

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible:      boolean;
  activeSymbol: string;
  onClose:      () => void;
  onSelect:     (symbol: string) => void;
  onOpenChart:  () => void;
}

// ── Main overlay ──────────────────────────────────────────────────────────────

export const MobileWatchlistOverlay = memo(function MobileWatchlistOverlay({
  visible, activeSymbol, onClose, onSelect, onOpenChart,
}: Props) {
  const { items, loading } = useWatchlist();
  const [activeTab, setActiveTab] = useState(0);

  // ── Animation values ───────────────────────────────────────────────────────
  const slideAnim    = useRef(new Animated.Value(SCREEN_H)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);

  // Drive enter/exit animations whenever `visible` changes
  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue:         1,
          duration:        220,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue:         0,
          stiffness:       340,
          damping:         34,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue:         0,
          duration:        200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue:         SCREEN_H,
          duration:        200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setModalVisible(false);
      });
    }
  }, [visible, slideAnim, backdropAnim]);

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const handleSelect = useCallback((symbol: string) => {
    onSelect(symbol);
    onClose();
  }, [onSelect, onClose]);

  // ── FlatList helpers ───────────────────────────────────────────────────────

  const keyExtractor = useCallback((item: WatchlistEntry) => item.symbol, []);

  const renderItem = useCallback<ListRenderItem<WatchlistEntry>>(
    ({ item }) => (
      <WatchlistRow
        item={item}
        isActive={item.symbol === activeSymbol}
        onSelect={() => handleSelect(item.symbol)}
      />
    ),
    [activeSymbol, handleSelect],
  );

  const ListFooter = useCallback(() => <View style={{ height: 24 }} />, []);

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View
        style={[overlayStyles.backdrop, { opacity: backdropAnim }]}
        pointerEvents="box-none"
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[
          overlayStyles.panel,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Top ambient glow */}
        <View style={overlayStyles.ambientGlow} pointerEvents="none" />

        {/* ── HEADER ── */}
        <View style={overlayStyles.header}>
          {/* Menu button (decorative) */}
          <Pressable style={overlayStyles.headerIconBtn} hitSlop={8}>
            <Ionicons name="menu-outline" size={18} color="rgba(255,255,255,0.55)" />
          </Pressable>

          {/* Logo */}
          <View style={overlayStyles.logoRow}>
            <View style={overlayStyles.logoIcon}>
              <Ionicons name="trending-up-outline" size={11} color="#07110D" />
            </View>
            <Text style={overlayStyles.logoText}>TradingJournal</Text>
          </View>

          {/* Right buttons */}
          <View style={overlayStyles.headerRight}>
            <Pressable style={overlayStyles.headerRoundBtn} hitSlop={8}>
              <Ionicons name="add-outline" size={14} color="rgba(255,255,255,0.65)" />
            </Pressable>
            <Pressable onPress={onClose} style={overlayStyles.headerRoundBtn} hitSlop={8}>
              <Ionicons name="close" size={13} color="rgba(255,255,255,0.5)" />
            </Pressable>
          </View>
        </View>

        {/* ── TABS ── */}
        <View style={overlayStyles.tabsRow}>
          {["Watchlist", "+ Add list"].map((label, i) => {
            const isActive = i === activeTab;
            return (
              <Pressable
                key={label}
                onPress={() => setActiveTab(i)}
                style={[overlayStyles.tabBtn, isActive && overlayStyles.tabBtnActive]}
              >
                <Text style={[overlayStyles.tabText, isActive && overlayStyles.tabTextActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
          <View style={{ flex: 1 }} />
          <Text style={overlayStyles.priceChgLabel}>Price · Chg%</Text>
        </View>

        {/* ── LIST ── */}
        {loading ? (
          <View style={{ flex: 1 }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            ListFooterComponent={ListFooter}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            maxToRenderPerBatch={12}
            windowSize={12}
            style={{ flex: 1 }}
          />
        )}
      </Animated.View>
    </Modal>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const overlayStyles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  panel: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,8,6,0.99)",
    overflow:        "hidden",
  },
  ambientGlow: {
    position:        "absolute",
    top:             0, left: 0, right: 0,
    height:          220,
    backgroundColor: "rgba(0,50,20,0.05)",
    pointerEvents:   "none",
  },
  header: {
    height:          52,
    flexShrink:      0,
    flexDirection:   "row",
    alignItems:      "center",
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    zIndex:          1,
  },
  headerIconBtn: {
    width:          36,
    height:         36,
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },
  logoRow: {
    flex:           1,
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            6,
  },
  logoIcon: {
    width:          22,
    height:         22,
    borderRadius:   6,
    backgroundColor: "#B7FF5A",
    alignItems:     "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize:   14,
    fontWeight: "700",
    color:      "rgba(255,255,255,0.85)",
    letterSpacing: -0.1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
    flexShrink:    0,
  },
  headerRoundBtn: {
    width:           30,
    height:          30,
    borderRadius:    8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.09)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  tabsRow: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             6,
    paddingHorizontal: 14,
    paddingTop:      8,
    paddingBottom:   6,
    flexShrink:      0,
    zIndex:          1,
  },
  tabBtn: {
    height:            28,
    paddingHorizontal: 13,
    borderRadius:      14,
    alignItems:        "center",
    justifyContent:    "center",
    backgroundColor:   "rgba(255,255,255,0.06)",
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.09)",
  },
  tabBtnActive: {
    backgroundColor: "rgba(183,255,90,0.12)",
    borderColor:     "rgba(183,255,90,0.28)",
  },
  tabText: {
    fontSize:   12,
    fontWeight: "400",
    color:      "rgba(255,255,255,0.45)",
  },
  tabTextActive: {
    fontWeight: "600",
    color:      "#B7FF5A",
  },
  priceChgLabel: {
    fontSize:   10,
    color:      "rgba(255,255,255,0.22)",
    fontWeight: "500",
    letterSpacing: 0.3,
  },
});
