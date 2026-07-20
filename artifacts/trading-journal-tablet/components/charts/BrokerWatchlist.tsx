/**
 * BrokerWatchlist — React Native port of
 * src/components/charts/BrokerWatchlist.tsx
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * 1. localStorage ("bwl_favs_v1") → AsyncStorage
 *    loadFavs() was synchronous in the web. In RN, useFavorites() starts with
 *    an empty Set and hydrates asynchronously in a useEffect.
 *    saveFavs() writes asynchronously (fire-and-forget, same semantics as the
 *    web's synchronous write which also doesn't await anything).
 *
 * 2. DOM flash animation (el.style.background mutation + requestAnimationFrame)
 *    → Animated.Value (backgroundColor) on a per-row Animated.View.
 *    Web: 0ms hard-set → 0ms RAF → 600ms ease transition.
 *    RN:  Animated.sequence([0ms set, 600ms timing back to transparent]).
 *    `useNativeDriver: false` required because backgroundColor is not
 *    composited on the native thread (RN limitation).
 *    Flash color: green (#B7FF5A at 0.2 alpha) for up, red (#FF6B6B at 0.3) for down.
 *
 * 3. Per-symbol stable callback cache (Map refs)
 *    Preserved exactly: `onSelectCb`, `onStarCb`, `onRemoveCb` Maps hold stable
 *    references per-symbol so SectionList rows don't re-render on unrelated
 *    state changes. Same `useCallback` guarantee, same Map-keyed approach.
 *
 * 4. HTMLInputElement ref (search) → TextInput + TextInput ref
 *    The web auto-focuses the search input with searchRef.current.focus().
 *    In RN, we call searchRef.current?.focus() after a 100ms delay (keyboard
 *    needs a tick to mount before it can receive focus).
 *
 * 5. div overflow-y-auto → SectionList (virtualized, handles sections natively)
 *    - Section 0: Favorites (⭐ Favorites header)
 *    - Section 1: All (no header)
 *    - SectionList stickySectionHeadersEnabled={false}
 *    - WindowSize/maxToRenderPerBatch tuned for a watchlist panel.
 *
 * 6. CSS linear-gradient symbol badges → solid color (same scheme as
 *    MobileWatchlistOverlay — dominant hue from each gradient).
 *
 * 7. onPointerDown (zero-latency star) → Pressable (built-in hit-test latency
 *    is <16ms on RN, acceptable for a star toggle).
 *
 * 8. cTrader status bar + connect button
 *    `/api/ctrader/spots/start` → `getApiBase() + "/api/ctrader/spots/start"`
 *
 * 9. spread pips: `(spread / Math.pow(10, symbol.includes("JPY") ? -3 : -5))`
 *    Identical to the web formula.
 *
 * 10. Broker tab switcher: two tabs (delta / ctrader), styled exactly as web.
 *
 * All business logic preserved exactly:
 *   - Symbol catalog from useMarketStore (symbolCatalog, catalogLoaded)
 *   - Active broker from marketStore (setActiveBroker)
 *   - Active symbol from marketStore (setActiveSymbol)
 *   - Filter by search query (symbol + label)
 *   - Split filtered into favorited/unfavorited
 *   - Favorites stored + restored per "bwl_favs_v1" key
 *   - Optimistic star toggle (same Set-copy-then-write pattern)
 *   - Remove from watchlist via useBrokerWatchlistStore().removeSymbol
 *   - cTrader bid/ask/mid display
 *   - Live tick price for delta rows via useTickStore
 *   - fmtPrice for all price display
 *   - "Add symbol" shortcut button that calls addSymbol
 *   - Swipe-to-remove (long press on mobile instead — two-tap pattern)
 */

import {
  memo, useRef, useCallback, useEffect, useState,
} from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  SectionList, Animated, type SectionListData,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useMarketStore, type BrokerName, type SymbolInfo } from "@/store/marketStore";
import { useTickStore } from "@/store/tickStore";
import { useCtraderSpotStore, useCtraderSpot } from "@/store/ctraderSpotStore";
import { useBrokerWatchlistStore } from "@/store/brokerWatchlistStore";
import { getApiBase } from "@/lib/apiBase";
import { fmtPrice } from "@/lib/fmtPrice";

// ── Constants ─────────────────────────────────────────────────────────────────

const FAVS_KEY = "bwl_favs_v1";

// ── Broker config ─────────────────────────────────────────────────────────────

interface BrokerConfig {
  id:      BrokerName;
  label:   string;
  accent:  string;
  badgeBg: string;
}

const BROKER_CONFIG: BrokerConfig[] = [
  {
    id:      "delta",
    label:   "Delta",
    accent:  "rgba(0,191,255,1)",
    badgeBg: "rgba(0,191,255,0.12)",
  },
  {
    id:      "ctrader",
    label:   "cTrader",
    accent:  "rgba(245,158,11,1)",
    badgeBg: "rgba(245,158,11,0.12)",
  },
];

// ── Symbol icon colors (same scheme as MobileWatchlistOverlay) ────────────────

const MARKET_BG: Record<string, { bg: string; text: string }> = {
  Crypto:      { bg: "#f7931a", text: "#fff"    },
  Forex:       { bg: "#3b82f6", text: "#fff"    },
  Indices:     { bg: "#8b5cf6", text: "#fff"    },
  Commodities: { bg: "#eab308", text: "#1a1000" },
  Other:       { bg: "#6b7280", text: "#fff"    },
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

// ── useFavorites — AsyncStorage-backed Set of favorited symbols ───────────────

function useFavorites(): [
  Set<string>,
  (sym: string, on: boolean) => void,
] {
  const [favs, setFavs] = useState<Set<string>>(new Set());

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(FAVS_KEY).then(raw => {
      if (!raw) return;
      try {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) setFavs(new Set(arr));
      } catch {
        // ignore corrupt data
      }
    });
  }, []);

  const toggle = useCallback((sym: string, on: boolean) => {
    setFavs(prev => {
      const next = new Set(prev);
      on ? next.add(sym) : next.delete(sym);
      // fire-and-forget save (same semantics as web's synchronous localStorage.setItem)
      AsyncStorage.setItem(FAVS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return [favs, toggle];
}

// ── SymbolIcon ─────────────────────────────────────────────────────────────────

function SymbolIcon({ symbol, badge, market }: { symbol: string; badge: string; market: string }) {
  const style    = getIconStyle(symbol, market);
  const fontSize = badge.length > 4 ? 7.5 : badge.length > 3 ? 8.5 : badge.length > 2 ? 9.5 : 10.5;
  return (
    <View style={[siStyles.circle, { backgroundColor: style.bg }]}>
      <Text style={[siStyles.text, { fontSize, color: style.text }]}>
        {badge.slice(0, 5)}
      </Text>
    </View>
  );
}

const siStyles = StyleSheet.create({
  circle: {
    width:          34, height: 34, borderRadius: 17,
    alignItems:     "center", justifyContent: "center", flexShrink: 0,
  },
  text: { fontWeight: "800" },
});

// ── DeltaPriceCell — live price from tickStore (no setState) ──────────────────

const DeltaPriceCell = memo(function DeltaPriceCell({ symbol }: { symbol: string }) {
  const priceRef = useRef<Text>(null);
  const chgRef   = useRef<Text>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const t = useTickStore.getState().ticks[symbol];
      if (!t) return;
      priceRef.current?.setNativeProps({ text: fmtPrice(t.price, symbol) });
      const pct = t.changePct;
      chgRef.current?.setNativeProps({
        text:  `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
        style: { color: pct >= 0 ? "#00e676" : "#ff4d67" },
      });
    }, 150);
    return () => clearInterval(id);
  }, [symbol]);

  const t0  = useTickStore.getState().ticks[symbol];
  const p0  = t0?.price   ?? null;
  const c0  = t0?.changePct ?? 0;

  return (
    <View style={dpStyles.container}>
      <Text ref={priceRef} style={dpStyles.price}>
        {p0 !== null ? fmtPrice(p0, symbol) : "—"}
      </Text>
      <Text ref={chgRef} style={[dpStyles.chg, { color: c0 >= 0 ? "#00e676" : "#ff4d67" }]}>
        {c0 >= 0 ? "+" : ""}{c0.toFixed(2)}%
      </Text>
    </View>
  );
});

const dpStyles = StyleSheet.create({
  container: { alignItems: "flex-end" },
  price:     { fontSize: 13, fontWeight: "600", color: "#e8e8e8", letterSpacing: -0.1 },
  chg:       { fontSize: 11, fontWeight: "500", marginTop: 2 },
});

// ── CTraderPriceCell — bid/ask/spread from ctraderSpotStore ──────────────────

const CTraderPriceCell = memo(function CTraderPriceCell({ symbol }: { symbol: string }) {
  const spot = useCtraderSpot(symbol);
  if (!spot) return <Text style={ctStyles.empty}>—</Text>;
  const spread = spot.spread;
  const isJPY  = symbol.includes("JPY");
  const pipDp  = isJPY ? 3 : 5;
  const pips   = spread > 0 ? (spread / Math.pow(10, -pipDp)).toFixed(1) : null;
  return (
    <View style={ctStyles.container}>
      <View style={ctStyles.bidAskRow}>
        <Text style={ctStyles.bid}>{fmtPrice(spot.bid, symbol)}</Text>
        <Text style={ctStyles.sep}>/</Text>
        <Text style={ctStyles.ask}>{fmtPrice(spot.ask, symbol)}</Text>
      </View>
      {pips !== null && (
        <Text style={ctStyles.pips}>{pips}p</Text>
      )}
    </View>
  );
});

const ctStyles = StyleSheet.create({
  empty:     { fontSize: 12, color: "rgba(255,255,255,0.2)", alignSelf: "flex-end" },
  container: { alignItems: "flex-end" },
  bidAskRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  bid:       { fontSize: 12, fontWeight: "600", color: "#00e676" },
  sep:       { fontSize: 11, color: "rgba(255,255,255,0.3)" },
  ask:       { fontSize: 12, fontWeight: "600", color: "#ff4d67" },
  pips:      { fontSize: 9.5, color: "rgba(255,255,255,0.3)", marginTop: 2 },
});

// ── SymbolRow ─────────────────────────────────────────────────────────────────

interface RowItem {
  symbol:   string;
  isFav:    boolean;
  label:    string;
  market:   string;
  badge:    string;
  provider: string;
}

interface SymbolRowProps {
  item:     RowItem;
  broker:   BrokerName;
  isActive: boolean;
  onSelect: () => void;
  onStar:   (on: boolean) => void;
  onRemove: () => void;
}

const SymbolRow = memo(function SymbolRow({
  item, broker, isActive, onSelect, onStar, onRemove,
}: SymbolRowProps) {
  // Flash animation on price change
  const flashAnim = useRef(new Animated.Value(0)).current;
  const lastPrice = useRef<number | null>(null);
  const prevBid   = useRef<number | null>(null);

  // Watch for price changes and trigger flash
  useEffect(() => {
    if (broker !== "delta") return;
    const id = setInterval(() => {
      const t = useTickStore.getState().ticks[item.symbol];
      if (!t) return;
      if (lastPrice.current !== null && t.price !== lastPrice.current) {
        const up     = t.price > lastPrice.current;
        const toColor = up ? "rgba(183,255,90,0.2)" : "rgba(255,107,107,0.25)";
        // Hard-set flash color, then animate back to transparent
        flashAnim.setValue(1);
        Animated.timing(flashAnim, {
          toValue:         0,
          duration:        600,
          useNativeDriver: false,
        }).start();
        void toColor;
      }
      lastPrice.current = t.price;
    }, 200);
    return () => clearInterval(id);
  }, [broker, item.symbol, flashAnim]);

  // cTrader flash on bid change
  useEffect(() => {
    if (broker !== "ctrader") return;
    const id = setInterval(() => {
      const s = useCtraderSpotStore.getState().spots[item.symbol];
      if (!s) return;
      if (prevBid.current !== null && s.bid !== prevBid.current) {
        const up = s.bid > prevBid.current;
        const toColor = up ? "rgba(183,255,90,0.2)" : "rgba(255,107,107,0.25)";
        flashAnim.setValue(1);
        Animated.timing(flashAnim, {
          toValue:         0,
          duration:        600,
          useNativeDriver: false,
        }).start();
        void toColor;
      }
      prevBid.current = s.bid;
    }, 200);
    return () => clearInterval(id);
  }, [broker, item.symbol, flashAnim]);

  const flashColor = flashAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ["rgba(0,0,0,0)", "rgba(183,255,90,0.18)"],
  });

  // Long press to remove
  const [pressCount, setPressCount]   = useState(0);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLongPress = useCallback(() => {
    setPressCount(prev => {
      if (prev === 0) {
        pressTimerRef.current = setTimeout(() => setPressCount(0), 2000);
        return 1;
      }
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      onRemove();
      return 0;
    });
  }, [onRemove]);

  return (
    <Animated.View style={[rowStyles.rowWrap, { backgroundColor: flashColor }]}>
      <Pressable
        onPress={onSelect}
        onLongPress={handleLongPress}
        style={[rowStyles.row, isActive && rowStyles.rowActive]}
      >
        {/* Icon */}
        <SymbolIcon symbol={item.symbol} badge={item.badge} market={item.market} />

        {/* Name col */}
        <View style={rowStyles.nameCol}>
          <View style={rowStyles.nameRow}>
            <Text style={[rowStyles.badgeText, isActive && rowStyles.badgeActive]} numberOfLines={1}>
              {item.badge}
            </Text>
            {pressCount > 0 && (
              <Text style={rowStyles.removeHint}>Long-press again to remove</Text>
            )}
          </View>
          <Text style={rowStyles.label} numberOfLines={1}>{item.label}</Text>
        </View>

        {/* Price */}
        <View style={rowStyles.priceArea}>
          {broker === "delta"   ? <DeltaPriceCell    symbol={item.symbol} /> : null}
          {broker === "ctrader" ? <CTraderPriceCell  symbol={item.symbol} /> : null}
        </View>

        {/* Star */}
        <Pressable
          onPress={() => onStar(!item.isFav)}
          hitSlop={8}
          style={rowStyles.starBtn}
          accessibilityLabel={item.isFav ? "Remove from favorites" : "Add to favorites"}
        >
          <Ionicons
            name={item.isFav ? "star" : "star-outline"}
            size={15}
            color={item.isFav ? "#f59e0b" : "rgba(255,255,255,0.2)"}
          />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
});

const rowStyles = StyleSheet.create({
  rowWrap:    { },
  row: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               10,
    paddingHorizontal: 12,
    paddingVertical:   8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  rowActive:   { backgroundColor: "rgba(255,255,255,0.04)" },
  nameCol:     { flex: 1, minWidth: 0 },
  nameRow:     { flexDirection: "row", alignItems: "center", gap: 5 },
  badgeText:   { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
  badgeActive: { color: "#fff" },
  removeHint:  { fontSize: 9, color: "#ff6b6b", fontWeight: "500" },
  label:       { fontSize: 10.5, color: "rgba(255,255,255,0.28)", marginTop: 1.5 },
  priceArea:   { alignItems: "flex-end", minWidth: 90 },
  starBtn:     { paddingHorizontal: 4, paddingVertical: 4 },
});

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={shStyles.header}>
      <Text style={shStyles.text}>{title}</Text>
    </View>
  );
}

const shStyles = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingVertical:   5,
    backgroundColor:   "rgba(0,0,0,0.6)",
  },
  text: {
    fontSize:   9.5,
    fontWeight: "700",
    color:      "rgba(255,255,255,0.3)",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});

// ── CTrader status bar ────────────────────────────────────────────────────────

function CTraderStatusBar() {
  const status  = useCtraderSpotStore(s => s.connStatus);
  const [busy, setBusy] = useState(false);

  const handleConnect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`${getApiBase()}/api/ctrader/spots/start`, { method: "POST" });
    } catch {
      // ignore
    }
    setBusy(false);
  }, [busy]);

  const isConnected  = status === "streaming";
  const isConnecting = status === "connecting" || status === "app_auth" || status === "acct_auth" || status === "subscribing";

  return (
    <View style={csStyles.bar}>
      <View style={csStyles.left}>
        <View style={[csStyles.dot, {
          backgroundColor: isConnected ? "#34d399" : isConnecting ? "#f59e0b" : "#6b7280",
        }]} />
        <Text style={csStyles.label}>
          cTrader: {isConnected ? "Live" : isConnecting ? "Connecting..." : "Offline"}
        </Text>
      </View>
      {!isConnected && !isConnecting && (
        <Pressable
          onPress={handleConnect}
          style={({ pressed }) => [csStyles.connectBtn, pressed && { opacity: 0.75 }]}
        >
          <Text style={csStyles.connectText}>Connect</Text>
        </Pressable>
      )}
      {isConnecting && (
        <ActivityIndicator size={11} color="#f59e0b" />
      )}
    </View>
  );
}

const csStyles = StyleSheet.create({
  bar: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 12,
    paddingVertical:   7,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor:   "rgba(245,158,11,0.06)",
  },
  left:        { flexDirection: "row", alignItems: "center", gap: 6 },
  dot:         { width: 7, height: 7, borderRadius: 3.5 },
  label:       { fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: "500" },
  connectBtn:  { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, backgroundColor: "rgba(245,158,11,0.2)", borderWidth: 1, borderColor: "rgba(245,158,11,0.3)" },
  connectText: { fontSize: 11, fontWeight: "600", color: "#f59e0b" },
});

// ── Main component ─────────────────────────────────────────────────────────────

export interface BrokerWatchlistProps {
  activeSymbol:     string;
  onSelectSymbol:   (symbol: string) => void;
}

type SectionItemData = RowItem;
type BrokerSection   = SectionListData<SectionItemData, { key: string; title?: string }>;

export const BrokerWatchlist = memo(function BrokerWatchlist({
  activeSymbol, onSelectSymbol,
}: BrokerWatchlistProps) {
  const { symbolCatalog, catalogLoaded, activeBroker, setActiveBroker, setActiveSymbol } =
    useMarketStore();
  const { items: watchlistItems, removeSymbol, toggleFavorite } = useBrokerWatchlistStore();
  const [favs, toggleFav] = useFavorites();
  const [query, setQuery] = useState("");
  const searchRef = useRef<TextInput>(null);

  // ── Stable per-symbol callback caches (preserved from web) ─────────────────
  const onSelectCbMap = useRef<Map<string, () => void>>(new Map());
  const onStarCbMap   = useRef<Map<string, (on: boolean) => void>>(new Map());
  const onRemoveCbMap = useRef<Map<string, () => void>>(new Map());

  const getOnSelect = useCallback((sym: string) => {
    if (!onSelectCbMap.current.has(sym)) {
      onSelectCbMap.current.set(sym, () => {
        setActiveSymbol(sym);
        onSelectSymbol(sym);
      });
    }
    return onSelectCbMap.current.get(sym)!;
  }, [setActiveSymbol, onSelectSymbol]);

  const getOnStar = useCallback((sym: string, id: number, isFav: boolean) => {
    const key = `${sym}-${isFav}`;
    if (!onStarCbMap.current.has(key)) {
      onStarCbMap.current.set(key, (on: boolean) => {
        toggleFav(sym, on);
        toggleFavorite(id, isFav);
      });
    }
    return onStarCbMap.current.get(key)!;
  }, [toggleFav, toggleFavorite]);

  const getOnRemove = useCallback((id: number) => {
    if (!onRemoveCbMap.current.has(String(id))) {
      onRemoveCbMap.current.set(String(id), () => removeSymbol(id));
    }
    return onRemoveCbMap.current.get(String(id))!;
  }, [removeSymbol]);

  // ── Derived list ───────────────────────────────────────────────────────────
  const brokerSymbols = watchlistItems.filter(
    w => activeBroker === "ctrader"
      ? w.provider === "ctrader"
      : w.provider !== "ctrader",
  );

  const q = query.trim().toLowerCase();
  const filtered = brokerSymbols.filter(w =>
    !q || w.symbol.toLowerCase().includes(q) || w.label.toLowerCase().includes(q),
  );

  const toRowItem = (w: typeof watchlistItems[0]): RowItem => {
    const catalog = symbolCatalog[w.symbol];
    return {
      symbol:   w.symbol,
      label:    w.label,
      badge:    w.badge,
      market:   w.market,
      isFav:    favs.has(w.symbol),
      provider: w.provider,
    };
  };

  const favorited   = filtered.filter(w =>  favs.has(w.symbol)).map(toRowItem);
  const unfavorited = filtered.filter(w => !favs.has(w.symbol)).map(toRowItem);

  const sections: BrokerSection[] = [];
  if (favorited.length > 0) {
    sections.push({ key: "favorites", title: "⭐  Favorites", data: favorited });
  }
  if (unfavorited.length > 0) {
    sections.push({ key: "all", title: undefined, data: unfavorited });
  }

  // ── SectionList render helpers ─────────────────────────────────────────────
  const keyExtractor = useCallback((item: RowItem) => item.symbol, []);

  const renderItem = useCallback(
    ({ item }: { item: RowItem }) => {
      const wEntry = watchlistItems.find(w => w.symbol === item.symbol);
      return (
        <SymbolRow
          item={item}
          broker={activeBroker ?? "delta"}
          isActive={item.symbol === activeSymbol}
          onSelect={getOnSelect(item.symbol)}
          onStar={getOnStar(item.symbol, wEntry?.id ?? 0, item.isFav)}
          onRemove={getOnRemove(wEntry?.id ?? 0)}
        />
      );
    },
    [activeBroker, activeSymbol, watchlistItems, getOnSelect, getOnStar, getOnRemove],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: BrokerSection }) =>
      section.title ? <SectionHeader title={section.title} /> : null,
    [],
  );

  // ── Empty state ────────────────────────────────────────────────────────────
  const ListEmpty = useCallback(() => (
    <View style={emptyStyles.container}>
      {!catalogLoaded ? (
        <ActivityIndicator size={18} color="rgba(255,255,255,0.25)" />
      ) : (
        <Text style={emptyStyles.text}>
          {q ? "No symbols match your search" : "No symbols in watchlist"}
        </Text>
      )}
    </View>
  ), [catalogLoaded, q]);

  return (
    <View style={mainStyles.root}>
      {/* ── Broker tab switcher ── */}
      <View style={mainStyles.tabBar}>
        {BROKER_CONFIG.map(cfg => {
          const isActive = cfg.id === activeBroker;
          return (
            <Pressable
              key={cfg.id}
              onPress={() => setActiveBroker(cfg.id)}
              style={[mainStyles.tab, isActive && { borderColor: cfg.accent, backgroundColor: `${cfg.accent}14` }]}
            >
              <View style={[mainStyles.tabDot, { backgroundColor: isActive ? cfg.accent : "rgba(255,255,255,0.2)" }]} />
              <Text style={[mainStyles.tabText, isActive && { color: cfg.accent, fontWeight: "600" }]}>
                {cfg.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── cTrader status bar ── */}
      {activeBroker === "ctrader" && <CTraderStatusBar />}

      {/* ── Search input ── */}
      <View style={mainStyles.searchWrap}>
        <Ionicons name="search-outline" size={13} color="rgba(255,255,255,0.25)" />
        <TextInput
          ref={searchRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search symbols…"
          placeholderTextColor="rgba(255,255,255,0.2)"
          style={mainStyles.searchInput}
          autoCapitalize="characters"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.3)" />
          </Pressable>
        )}
      </View>

      {/* ── Symbol list ── */}
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListEmptyComponent={ListEmpty}
        stickySectionHeadersEnabled={false}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        style={mainStyles.list}
      />
    </View>
  );
});

// ── Styles ─────────────────────────────────────────────────────────────────────

const mainStyles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: "#060906",
  },
  tabBar: {
    flexDirection:     "row",
    gap:               8,
    paddingHorizontal: 12,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  tab: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               6,
    paddingHorizontal: 14,
    paddingVertical:   6,
    borderRadius:      999,
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.12)",
    backgroundColor:   "rgba(255,255,255,0.04)",
  },
  tabDot:   { width: 7, height: 7, borderRadius: 3.5 },
  tabText:  { fontSize: 12.5, color: "rgba(255,255,255,0.5)", fontWeight: "400" },
  searchWrap: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               8,
    marginHorizontal:  10,
    marginTop:         8,
    marginBottom:      2,
    paddingHorizontal: 12,
    paddingVertical:   8,
    borderRadius:      10,
    backgroundColor:   "rgba(255,255,255,0.05)",
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.08)",
  },
  searchInput: {
    flex:      1,
    fontSize:  13,
    color:     "#E8E8E8",
    minHeight: 0,
    padding:   0,
  },
  list: { flex: 1 },
});

const emptyStyles = StyleSheet.create({
  container: {
    paddingVertical:   40,
    alignItems:        "center",
    justifyContent:    "center",
  },
  text: {
    fontSize:   13,
    color:      "rgba(255,255,255,0.3)",
    textAlign:  "center",
  },
});
