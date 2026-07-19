/**
 * SharedMarketSelector — single source of truth for browsing and selecting symbols.
 *
 * React Native port of src/components/SharedMarketSelector.tsx
 * ─────────────────────────────────────────────────────────────
 * Mode "page"  → renders as an inline fill-height layout (Markets tab).
 * Mode "sheet" → renders as a BottomSheetModal with snap points,
 *                backdrop, drag gestures, and Android back button support.
 *
 * Data sources (identical to web):
 *   • brokerWatchlistStore  — watchlist / favorites
 *   • /api/symbols?broker=delta    — Delta Exchange catalog
 *   • /api/symbols?broker=ctrader — cTrader catalog (gated: connStatus === "streaming")
 *
 * Symbol selection always calls props.onSelect(symbol).
 * In sheet mode it also calls props.onClose() automatically after dismiss.
 *
 * Performance architecture (RN equivalent of web's architecture):
 *   • PriceCell memo isolates tick re-renders — SymbolRowItem layout never re-renders on price ticks
 *   • FlashList virtualization replaces content-visibility:auto — only visible rows are rendered
 *   • useDeferredValue + 150ms debounce on search — TextInput stays responsive while filter defers
 *   • useTransition for category expand — non-blocking state updates
 *   • startTransition wraps tab change and search clear
 *   • Per-symbol callback caches (Map) prevent full re-render on watchlist update
 *   • extraData prop on FlashList drives isActive re-renders without rebuilding listItems
 *   • All StyleSheet.create() objects hoisted to module level — zero GC pressure per render
 *
 * RN replacements vs web:
 *   div/span/button/input → View/Text/Pressable/TextInput
 *   createPortal          → BottomSheetModal (internal portal via BottomSheetModalProvider)
 *   ScrollView            → FlashList / BottomSheetFlashList (true virtualization)
 *   CSS transitions       → Reanimated (via @gorhom/bottom-sheet) + Animated pulse
 *   hover                 → Pressable pressed state
 *   touch/pointer events  → BottomSheetModal native gesture handling
 *   window/document       → not needed (BottomSheetModal handles it)
 *   localStorage          → not needed (no state persisted in this component)
 *   import.meta.env.BASE_URL → getApiBase()
 *   import.meta.env.DEV      → __DEV__
 *   content-visibility:auto  → FlashList estimatedItemSize virtualization
 *   CSS mktPulse animation   → Animated.loop with useNativeDriver:true
 */

import {
  memo, useState, useCallback, useEffect, useMemo, useRef,
  useDeferredValue, useTransition, startTransition, type ReactNode,
} from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet,
  Animated, ActivityIndicator,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  BottomSheetModal,
  BottomSheetFlashList,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";

import { useWatchlist }         from "@/contexts/WatchlistContext";
import { useSymbolTick }        from "@/store/tickStore";
import { useCtraderSpot, useCtraderConnStatus } from "@/store/ctraderSpotStore";
import { getApiBase }           from "@/lib/apiBase";

// ── No-op performance diagnostics (web-specific star/UI tracing) ──────────
const tapStart  = (_sym: string): number => Date.now();
const recordUi  = (_tapAt: number): void => {};

// ── Types ─────────────────────────────────────────────────────────────────

type DeltaCategory   = "perpetual" | "future" | "forex" | "index" | "commodity" | "other";
type CtraderCategory = "forex" | "index" | "commodity" | "stock" | "crypto" | "other";
type Category        = DeltaCategory | CtraderCategory;
type Tab             = "Watchlist" | "Markets";
type Broker          = "delta" | "ctrader";

const TABS: Tab[] = ["Watchlist", "Markets"];

const UNIFIED_CATEGORY_ORDER: Category[] = [
  "forex", "index", "commodity", "perpetual", "future", "crypto", "stock", "other",
];

interface SymbolInfo {
  symbol:    string;
  name:      string;
  category:  Category;
  broker:    Broker;
  symUpper:  string;
  nameUpper: string;
}

const CATEGORY_META: Record<Category, { label: string; badge: string; color: string }> = {
  perpetual: { label: "Perpetuals",  badge: "PERP",  color: "#f59e0b" },
  future:    { label: "Futures",     badge: "FUT",   color: "#a78bfa" },
  forex:     { label: "Forex",       badge: "FX",    color: "#60a5fa" },
  index:     { label: "Indices",     badge: "IDX",   color: "#34d399" },
  commodity: { label: "Commodities", badge: "CMDTY", color: "#fb923c" },
  stock:     { label: "Stocks",      badge: "STK",   color: "#38bdf8" },
  crypto:    { label: "Crypto",      badge: "DeFi",  color: "#818cf8" },
  other:     { label: "Other",       badge: "OTH",   color: "#94a3b8" },
};

const MARKET_TO_DELTA_CAT: Record<string, DeltaCategory> = {
  Crypto:      "perpetual",
  Forex:       "forex",
  Indices:     "index",
  Commodities: "commodity",
};

const INITIAL_SHOW = 50;

// ── Flat list item types ──────────────────────────────────────────────────
// FlashList receives a flat array; section headers, rows, and special states
// are all typed items so renderItem can switch on _t.

type WatchEntry = { isFavorite: boolean; id: number };

type ListItem =
  | { _t: "wl_row";     sym: SymbolInfo; isFav: boolean; inWl: boolean }
  | { _t: "wl_empty";   searchActive: boolean }
  | { _t: "sec_hdr";    cat: Category; count: number; open: boolean }
  | { _t: "mkt_row";    sym: SymbolInfo; isFav: boolean; inWl: boolean }
  | { _t: "show_more";  cat: Category; hidden: number }
  | { _t: "srch_row";   sym: SymbolInfo; isFav: boolean; inWl: boolean }
  | { _t: "srch_empty"; q: string }
  | { _t: "loading" }
  | { _t: "error";      msg: string; onRetry: () => void }
  | { _t: "footer";     total: number; delta: number; ctrader: number };

// ── Price helpers (identical to web) ─────────────────────────────────────

function formatPrice(price: number): string {
  if (!isFinite(price) || price <= 0) return "—";
  if (price >= 10_000) return price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (price >= 100)    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)      return price.toFixed(4);
  if (price >= 0.001)  return price.toFixed(6);
  return price.toFixed(8);
}

// ── PriceCell ─────────────────────────────────────────────────────────────
// Isolated component: only this subtree re-renders on price ticks.
// SymbolRowItem's layout (symbol name, badge, star) is completely unaffected.

const PriceCell = memo(function PriceCell({ symbol, broker }: { symbol: string; broker: Broker }) {
  const tick  = useSymbolTick(symbol);
  const cSpot = useCtraderSpot(symbol);

  const price     = tick?.price;
  const changePct = tick?.changePct ?? 0;
  const isUp      = changePct >= 0;
  const isLive    = !!tick;

  const bid    = tick?.bid    ?? (broker === "ctrader" ? cSpot?.bid    : undefined);
  const ask    = tick?.ask    ?? (broker === "ctrader" ? cSpot?.ask    : undefined);
  // bid/ask available for cTrader spread display (not yet rendered but preserved for parity)
  void bid; void ask;

  const spread = tick?.spread ?? (broker === "ctrader" ? cSpot?.spread : undefined);
  void spread;

  // Module-level pulse animation — one animation drives all live dots
  const pulseAnim = useRef(new Animated.Value(1));
  const loopRef   = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isLive) {
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim.current, { toValue: 0.2, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim.current, { toValue: 1.0, duration: 1200, useNativeDriver: true }),
        ])
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      loopRef.current = null;
      pulseAnim.current.setValue(1);
    }
    return () => { loopRef.current?.stop(); };
  }, [isLive]);

  const changeColor = isLive
    ? (isUp ? "#10b981" : "#ef4444")
    : "rgba(148,163,184,0.22)";

  return (
    <View style={styles.priceCol}>
      {/* Price row with live dot */}
      <View style={styles.priceRow}>
        {isLive && (
          <Animated.View style={[styles.liveDot, { opacity: pulseAnim.current }]} />
        )}
        <Text style={[styles.priceText, !price && styles.priceTextEmpty]}>
          {price ? formatPrice(price) : "—"}
        </Text>
      </View>

      {/* % change pill */}
      <View style={[
        styles.changePill,
        isLive
          ? (isUp ? styles.changePillUp : styles.changePillDown)
          : styles.changePillIdle,
      ]}>
        {isLive && (
          <Ionicons
            name={isUp ? "arrow-up" : "arrow-down"}
            size={8}
            color={isUp ? "#10b981" : "#ef4444"}
          />
        )}
        <Text style={[styles.changeText, { color: changeColor }]}>
          {isLive ? `${Math.abs(changePct).toFixed(2)}%` : "—"}
        </Text>
      </View>
    </View>
  );
});

// ── SymbolRowItem ─────────────────────────────────────────────────────────
// Pure layout component — no tick subscriptions here.
// Exported as SymbolRow for naming parity with web.

export const SymbolRow = memo(function SymbolRowItem({
  symbol, name, category, broker, isFavorite, inWatchlist, isActive, onStarPress, onTap,
}: {
  symbol:      string;
  name:        string;
  category:    Category;
  broker:      Broker;
  isFavorite:  boolean;
  inWatchlist: boolean;
  isActive?:   boolean;
  onStarPress: (tapAt: number) => void;
  onTap?:      () => void;
}) {
  const meta = CATEGORY_META[category];

  // Optimistic star state — local toggle, syncs via isFavorite prop
  const [visualFav, setVisualFav] = useState(isFavorite);
  const prevFavRef = useRef(isFavorite);
  if (prevFavRef.current !== isFavorite) {
    prevFavRef.current = isFavorite;
    setVisualFav(isFavorite);
  }

  const handleStarPress = useCallback(() => {
    const tapAt = tapStart(symbol);
    setVisualFav(v => !v);
    requestAnimationFrame(() => recordUi(tapAt));
    onStarPress(tapAt);
  }, [symbol, onStarPress]);

  return (
    <Pressable
      onPress={onTap}
      style={({ pressed }) => [
        styles.symbolRow,
        isActive && styles.symbolRowActive,
        pressed && !!onTap && styles.symbolRowPressed,
      ]}
    >
      {/* Star button */}
      <Pressable onPress={handleStarPress} hitSlop={8} style={styles.starBtn}>
        <Ionicons
          name={visualFav ? "star" : (inWatchlist ? "star-half" : "star-outline")}
          size={14}
          color={visualFav ? "#f59e0b" : "rgba(148,163,184,0.40)"}
        />
      </Pressable>

      {/* Left: symbol + subtitle */}
      <View style={styles.symbolLeft}>
        <View style={styles.symbolTopRow}>
          <Text style={styles.symbolText}>{symbol}</Text>
          <View style={[styles.badge, { backgroundColor: `${meta.color}16`, borderColor: `${meta.color}28` }]}>
            <Text style={[styles.badgeText, { color: meta.color }]}>{meta.badge}</Text>
          </View>
        </View>
        <Text style={styles.nameText} numberOfLines={1}>{name}</Text>
      </View>

      {/* Right: price + % change — tick-isolated subtree */}
      <PriceCell symbol={symbol} broker={broker} />
    </Pressable>
  );
});

// ── CtraderStatusBar ──────────────────────────────────────────────────────

const CtraderStatusBar = memo(function CtraderStatusBar() {
  const connStatus  = useCtraderConnStatus();
  const isStreaming = connStatus === "streaming";
  const isPending   = ["connecting", "app_auth", "acct_auth"].includes(connStatus);
  const color = isStreaming ? "#10b981" : isPending ? "#f59e0b" : "rgba(148,163,184,0.28)";

  const statusLabel =
    connStatus === "streaming"                                  ? "live"
    : connStatus === "connecting"                               ? "connecting…"
    : connStatus === "app_auth" || connStatus === "acct_auth"  ? "authenticating…"
    : connStatus === "reconnecting"                             ? "reconnecting…"
    : connStatus;

  return (
    <View style={styles.ctraderBar}>
      <View style={[styles.ctraderDot, { backgroundColor: color, shadowColor: isStreaming ? color : "transparent" }]} />
      <Text style={styles.ctraderText}>cTrader:&nbsp;{statusLabel}</Text>
    </View>
  );
});

// ── EmptyState ────────────────────────────────────────────────────────────

function EmptyState({ iconName, title, subtitle }: {
  iconName: keyof typeof Ionicons.glyphMap;
  title:    string;
  subtitle?: string;
}) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconBox}>
        <Ionicons name={iconName} size={22} color="rgba(148,163,184,0.30)" />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle && <Text style={styles.emptySubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ── Retry error state (Markets tab load failure) ──────────────────────────

function ErrorState({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorTitle}>Failed to load market catalog</Text>
      <Text style={styles.errorMsg}>{msg}</Text>
      <Pressable onPress={onRetry} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.7 }]}>
        <Text style={styles.retryBtnText}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ── Public props interface (identical to web) ─────────────────────────────

export interface SharedMarketSelectorProps {
  /** "page" = inline fill-height content; "sheet" = bottom sheet */
  mode:           "page" | "sheet";
  /** For sheet mode — controls visibility */
  visible?:       boolean;
  /** Currently charted symbol (highlighted amber) */
  activeSymbol:   string;
  /** Called when user selects a symbol (always fires, both tabs) */
  onSelect:       (symbol: string) => void;
  /**
   * Optional: called only when a symbol row in the WATCHLIST tab is tapped.
   * Falls back to onSelect if not provided.
   */
  onWatchlistTap?: (symbol: string) => void;
  /** Called to close (sheet mode: required; page mode: ignored) */
  onClose?:       () => void;
  /**
   * Extra ReactNode rendered in the header action area.
   * Markets page uses this for the diagnostics toggle button.
   */
  headerActions?: ReactNode;
}

// ── SharedMarketSelector ──────────────────────────────────────────────────

export const SharedMarketSelector = memo(function SharedMarketSelector({
  mode,
  visible = true,
  activeSymbol,
  onSelect,
  onWatchlistTap,
  onClose,
  headerActions,
}: SharedMarketSelectorProps) {

  // ── Tabs ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("Watchlist");

  // ── Search: two-stage debounce → defer ───────────────────────────────
  const [rawSearch, setRawSearch] = useState("");
  const [search,    setSearch]    = useState("");
  const searchInputRef = useRef<TextInput>(null);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setRawSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(() => setSearch(val));
    }, 150);
  }, []);

  const deferredSearch = useDeferredValue(search);
  const searchActive   = deferredSearch.trim().length > 0;
  const searchUpper    = deferredSearch.trim().toUpperCase();

  // Reset on sheet open
  useEffect(() => {
    if (mode === "sheet" && visible) {
      setRawSearch("");
      setSearch("");
      setActiveTab("Watchlist");
    }
  }, [mode, visible]);

  // ── Bottom sheet ref (sheet mode) ────────────────────────────────────
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints     = useMemo(() => ["50%", "95%"], []);

  const onSelectRef       = useRef(onSelect);
  const onWatchlistTapRef = useRef(onWatchlistTap);
  const onCloseRef        = useRef(onClose);
  useEffect(() => { onSelectRef.current       = onSelect;       }, [onSelect]);
  useEffect(() => { onWatchlistTapRef.current = onWatchlistTap; }, [onWatchlistTap]);
  useEffect(() => { onCloseRef.current        = onClose;        }, [onClose]);

  // Bridge visible prop → imperative present()/dismiss()
  useEffect(() => {
    if (mode !== "sheet") return;
    if (visible) {
      // Open at 95% snap — index prop on BottomSheetModal sets initial snap; present() takes no arg in v5
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible, mode]);

  const handleSheetDismiss = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  const renderBackdrop = useCallback((props: BottomSheetBackdropProps) => (
    <BottomSheetBackdrop
      {...props}
      disappearsOnIndex={-1}
      appearsOnIndex={0}
      opacity={0.72}
      pressBehavior="close"
    />
  ), []);

  // ── Category open/close state ─────────────────────────────────────────
  // Map: undefined = use default (first non-empty = open, rest = closed)
  const [catOpenState, setCatOpenState] = useState<Map<Category, boolean>>(new Map());
  const [showAllCats,  setShowAllCats]  = useState<Set<Category>>(new Set());
  const [, transition]                  = useTransition();

  const toggleCat = useCallback((cat: Category) => {
    transition(() => {
      setCatOpenState(prev => {
        const next = new Map(prev);
        const cur  = next.get(cat);
        next.set(cat, cur === undefined ? false : !cur);
        return next;
      });
    });
  }, [transition]);

  const showMoreCat = useCallback((cat: Category) => {
    startTransition(() => {
      setShowAllCats(prev => { const n = new Set(prev); n.add(cat); return n; });
    });
  }, []);

  // ── Delta symbols ─────────────────────────────────────────────────────
  const [deltaSymbols, setDeltaSymbols] = useState<SymbolInfo[]>([]);
  const [deltaLoading, setDeltaLoading] = useState(false);
  const [deltaError,   setDeltaError]   = useState<string | null>(null);
  const [deltaFetchAt, setDeltaFetchAt] = useState(0);
  const deltaLoadingRef = useRef(false);

  const fetchDeltaSymbols = useCallback(async (force = false) => {
    if (deltaLoadingRef.current) return;
    deltaLoadingRef.current = true;
    setDeltaLoading(true);
    setDeltaError(null);
    try {
      const base = getApiBase();
      const res  = await fetch(`${base}/api/symbols?broker=delta${force ? "&refresh=1" : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { symbols?: Array<{ symbol: string; name: string; category?: string }> };
      setDeltaSymbols((data.symbols ?? []).map(s => ({
        symbol:    s.symbol,
        name:      s.name,
        category:  (s.category === "future" ? "future" : "perpetual") as DeltaCategory,
        broker:    "delta" as Broker,
        symUpper:  s.symbol.toUpperCase(),
        nameUpper: s.name.toUpperCase(),
      })));
      setDeltaFetchAt(Date.now());
    } catch (e) {
      setDeltaError(String(e));
    } finally {
      setDeltaLoading(false);
      deltaLoadingRef.current = false;
    }
  }, []);

  useEffect(() => { fetchDeltaSymbols(); }, []); // eslint-disable-line

  // ── cTrader symbols (gated on live streaming) ─────────────────────────
  const connStatus         = useCtraderConnStatus();
  const ctraderIsStreaming = connStatus === "streaming";
  const ctraderIsConnected = !["idle", "stopped", "error", "unknown"].includes(connStatus);

  const [ctraderSymbols, setCtraderSymbols] = useState<SymbolInfo[]>([]);
  const [ctraderLoading, setCtraderLoading] = useState(false);
  const [ctraderFetchAt, setCtraderFetchAt] = useState(0);
  const ctraderFetchingRef = useRef(false);

  const fetchCtraderSymbols = useCallback(async () => {
    if (ctraderFetchingRef.current) return;
    ctraderFetchingRef.current = true;
    setCtraderLoading(true);
    try {
      const base = getApiBase();
      const res  = await fetch(`${base}/api/symbols?broker=ctrader`);
      if (!res.ok) return;
      const data = await res.json() as { symbols?: Array<{ symbol: string; name: string; category?: string }> };
      if (data.symbols && data.symbols.length > 0) {
        setCtraderSymbols(data.symbols.map(s => ({
          symbol:    s.symbol,
          name:      s.name,
          category:  (s.category ?? "other") as CtraderCategory,
          broker:    "ctrader" as Broker,
          symUpper:  s.symbol.toUpperCase(),
          nameUpper: s.name.toUpperCase(),
        })));
        setCtraderFetchAt(Date.now());
      }
    } catch { /* non-fatal */ }
    finally { setCtraderLoading(false); ctraderFetchingRef.current = false; }
  }, []);

  useEffect(() => {
    if (ctraderIsStreaming) {
      fetchCtraderSymbols();
    } else if (!ctraderIsConnected) {
      setCtraderSymbols([]);
      setCtraderFetchAt(0);
    }
  }, [ctraderIsStreaming, ctraderIsConnected, fetchCtraderSymbols]);

  // ── Watchlist ─────────────────────────────────────────────────────────
  const { items, addSymbol, toggleFavorite } = useWatchlist();

  const watchMap = useMemo(() => {
    const m = new Map<string, WatchEntry>();
    items.forEach(i => m.set(i.symbol, { isFavorite: i.isFavorite, id: i.id }));
    return m;
  }, [items]);
  const watchMapRef = useRef(watchMap);
  watchMapRef.current = watchMap;

  const addSymbolRef      = useRef(addSymbol);
  const toggleFavoriteRef = useRef(toggleFavorite);
  useEffect(() => { addSymbolRef.current      = addSymbol;      }, [addSymbol]);
  useEffect(() => { toggleFavoriteRef.current = toggleFavorite; }, [toggleFavorite]);

  // ── Stable callbacks ──────────────────────────────────────────────────
  const handleStarPress = useCallback(async (symbol: string, tapAt: number) => {
    const item = watchMapRef.current.get(symbol);
    if (item) {
      await toggleFavoriteRef.current(item.id, item.isFavorite, tapAt);
    } else {
      await addSymbolRef.current(symbol, true, tapAt);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSymbolTap = useCallback((symbol: string) => {
    onSelectRef.current(symbol);
    if (mode === "sheet") bottomSheetRef.current?.dismiss();
  }, [mode]);

  const starCbCache = useRef(new Map<string, (tapAt: number) => void>());
  const tapCbCache  = useRef(new Map<string, () => void>());
  const prevStar    = useRef(handleStarPress);
  const prevTap     = useRef(handleSymbolTap);

  if (prevStar.current !== handleStarPress || prevTap.current !== handleSymbolTap) {
    prevStar.current = handleStarPress;
    prevTap.current  = handleSymbolTap;
    starCbCache.current.clear();
    tapCbCache.current.clear();
  }

  const getStarCb = useCallback((symbol: string) => {
    if (!starCbCache.current.has(symbol)) {
      starCbCache.current.set(symbol, (tapAt: number) => handleStarPress(symbol, tapAt));
    }
    return starCbCache.current.get(symbol)!;
  }, [handleStarPress]);

  const getTapCb = useCallback((symbol: string) => {
    if (!tapCbCache.current.has(symbol)) {
      tapCbCache.current.set(symbol, () => handleSymbolTap(symbol));
    }
    return tapCbCache.current.get(symbol)!;
  }, [handleSymbolTap]);

  // Watchlist-specific tap handler
  const handleWatchlistSymbolTap = useCallback((symbol: string) => {
    (onWatchlistTapRef.current ?? onSelectRef.current)(symbol);
    if (mode === "sheet") bottomSheetRef.current?.dismiss();
  }, [mode]);

  const watchlistTapCbCache = useRef(new Map<string, () => void>());
  const prevWatchlistTap    = useRef(handleWatchlistSymbolTap);

  if (prevWatchlistTap.current !== handleWatchlistSymbolTap) {
    prevWatchlistTap.current = handleWatchlistSymbolTap;
    watchlistTapCbCache.current.clear();
  }

  const getWatchlistTapCb = useCallback((symbol: string) => {
    if (!watchlistTapCbCache.current.has(symbol)) {
      watchlistTapCbCache.current.set(symbol, () => handleWatchlistSymbolTap(symbol));
    }
    return watchlistTapCbCache.current.get(symbol)!;
  }, [handleWatchlistSymbolTap]);

  // ── Per-broker lookup Maps — O(1) resolution ──────────────────────────
  const ctraderSymbolMap = useMemo(() => {
    const m = new Map<string, SymbolInfo>();
    ctraderSymbols.forEach(s => m.set(s.symbol, s));
    return m;
  }, [ctraderSymbols]);

  const deltaSymbolMap = useMemo(() => {
    const m = new Map<string, SymbolInfo>();
    deltaSymbols.forEach(s => m.set(s.symbol, s));
    return m;
  }, [deltaSymbols]);

  // ── Merged symbol list ─────────────────────────────────────────────────
  const allMergedSymbols = useMemo<SymbolInfo[]>(() => {
    const seen   = new Set<string>();
    const result: SymbolInfo[] = [];
    for (const s of ctraderSymbols) {
      if (!seen.has(s.symbol)) { seen.add(s.symbol); result.push(s); }
    }
    for (const s of deltaSymbols) {
      if (!seen.has(s.symbol)) { seen.add(s.symbol); result.push(s); }
    }
    return result;
  }, [ctraderSymbols, deltaSymbols]);

  const grouped = useMemo(() => {
    const map = new Map<Category, SymbolInfo[]>();
    UNIFIED_CATEGORY_ORDER.forEach(c => map.set(c, []));
    for (const s of allMergedSymbols) {
      const arr = map.get(s.category as Category);
      if (arr) arr.push(s);
      else map.set(s.category as Category, [s]);
    }
    return map;
  }, [allMergedSymbols]);

  // ── Search results ────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchActive) return [];
    return allMergedSymbols.filter(s =>
      s.symUpper.includes(searchUpper) || s.nameUpper.includes(searchUpper)
    );
  }, [allMergedSymbols, searchActive, searchUpper]);

  // watchlistRows uses O(1) Map lookups
  const watchlistRows = useMemo<SymbolInfo[]>(() => {
    return items
      .filter(i => i.isFavorite)
      .map(i => {
        const cSym = ctraderSymbolMap.get(i.symbol);
        const dSym = deltaSymbolMap.get(i.symbol);
        const detectedBroker: Broker = cSym ? "ctrader" : "delta";
        const name = i.label;
        return {
          symbol:    i.symbol,
          name,
          category:  (cSym?.category ?? dSym?.category ?? (MARKET_TO_DELTA_CAT[i.market] ?? "other")) as Category,
          broker:    detectedBroker,
          symUpper:  i.symbol.toUpperCase(),
          nameUpper: name.toUpperCase(),
        };
      });
  }, [items, ctraderSymbolMap, deltaSymbolMap]);

  const filteredWatchlist = useMemo<SymbolInfo[]>(() => {
    if (!searchActive) return watchlistRows;
    return watchlistRows.filter(r =>
      r.symUpper.includes(searchUpper) || r.nameUpper.includes(searchUpper)
    );
  }, [watchlistRows, searchActive, searchUpper]);

  const totalMarkets = allMergedSymbols.length;
  const isLoading    = deltaLoading || ctraderLoading;

  // ── Dev diagnostics ───────────────────────────────────────────────────
  useEffect(() => {
    if (!__DEV__) return;
    console.log("[Markets] diagnostics", {
      connectionStatus: connStatus,
      symbolsLoaded:    ctraderFetchAt > 0,
      symbolSource:     ctraderSymbols.length > 0 ? "ctrader" : deltaSymbols.length > 0 ? "delta" : "none",
      forexCount:       grouped.get("forex")?.length     ?? 0,
      indicesCount:     grouped.get("index")?.length     ?? 0,
      commoditiesCount: grouped.get("commodity")?.length ?? 0,
      deltaTotal:       deltaSymbols.length,
      ctraderTotal:     ctraderSymbols.length,
    });
  }, [grouped, connStatus, ctraderFetchAt, ctraderSymbols.length, deltaSymbols.length]);

  // ── Flat list items ───────────────────────────────────────────────────
  // Built from current state without including activeSymbol — instead,
  // activeSymbol is passed via FlashList extraData and read via ref in
  // renderItem. This prevents full list rebuilds on every symbol tap.
  const activeSymbolRef = useRef(activeSymbol);
  useEffect(() => { activeSymbolRef.current = activeSymbol; }, [activeSymbol]);

  const onRetry = useCallback(() => {
    fetchDeltaSymbols(true);
    if (ctraderIsStreaming) fetchCtraderSymbols();
  }, [fetchDeltaSymbols, fetchCtraderSymbols, ctraderIsStreaming]);

  const listItems = useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];

    if (activeTab === "Watchlist") {
      if (filteredWatchlist.length === 0) {
        out.push({ _t: "wl_empty", searchActive });
      } else {
        for (const row of filteredWatchlist) {
          const wItem = watchMap.get(row.symbol);
          out.push({ _t: "wl_row", sym: row, isFav: wItem?.isFavorite ?? false, inWl: !!wItem });
        }
      }
    } else {
      // Markets tab
      if (isLoading && allMergedSymbols.length === 0) {
        out.push({ _t: "loading" });
      } else if (!isLoading && deltaError && allMergedSymbols.length === 0) {
        out.push({ _t: "error", msg: deltaError, onRetry });
      } else if (searchActive) {
        if (searchResults.length === 0) {
          out.push({ _t: "srch_empty", q: deferredSearch });
        } else {
          for (const s of searchResults) {
            const wItem = watchMap.get(s.symbol);
            out.push({ _t: "srch_row", sym: s, isFav: wItem?.isFavorite ?? false, inWl: !!wItem });
          }
        }
      } else {
        let firstWithSymbols = true;
        for (const cat of UNIFIED_CATEGORY_ORDER) {
          const syms = grouped.get(cat) ?? [];
          if (syms.length === 0) continue;

          const isFirst  = firstWithSymbols;
          firstWithSymbols = false;
          const explicit = catOpenState.get(cat);
          const open     = explicit !== undefined ? explicit : isFirst;

          out.push({ _t: "sec_hdr", cat, count: syms.length, open });

          if (open) {
            const showAll = showAllCats.has(cat);
            const visible = showAll ? syms : syms.slice(0, INITIAL_SHOW);
            for (const s of visible) {
              const wItem = watchMap.get(s.symbol);
              out.push({ _t: "mkt_row", sym: s, isFav: wItem?.isFavorite ?? false, inWl: !!wItem });
            }
            if (!showAll && syms.length > INITIAL_SHOW) {
              out.push({ _t: "show_more", cat, hidden: syms.length - INITIAL_SHOW });
            }
          }
        }
        if ((deltaFetchAt > 0 || ctraderFetchAt > 0) && !isLoading) {
          out.push({ _t: "footer", total: allMergedSymbols.length, delta: deltaSymbols.length, ctrader: ctraderSymbols.length });
        }
      }
    }

    return out;
  }, [
    activeTab, filteredWatchlist, searchActive, watchMap, isLoading,
    allMergedSymbols, deltaError, onRetry, searchResults, deferredSearch,
    grouped, catOpenState, showAllCats, deltaFetchAt, ctraderFetchAt,
    deltaSymbols.length, ctraderSymbols.length,
  ]);

  // ── keyExtractor (stable) ─────────────────────────────────────────────
  const keyExtractor = useCallback((item: ListItem, index: number): string => {
    switch (item._t) {
      case "wl_row":    return `wl_${item.sym.symbol}`;
      case "wl_empty":  return "wl_empty";
      case "sec_hdr":   return `hdr_${item.cat}`;
      case "mkt_row":   return `mkt_${item.sym.symbol}`;
      case "show_more": return `more_${item.cat}`;
      case "srch_row":  return `srch_${item.sym.symbol}`;
      case "srch_empty": return "srch_empty";
      case "loading":   return "loading";
      case "error":     return "error";
      case "footer":    return "footer";
    }
  }, []);

  // ── renderItem (memoized) ─────────────────────────────────────────────
  // Does NOT depend on activeSymbol — reads via ref + extraData triggers
  // re-render of visible rows when activeSymbol changes.
  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    const activeSym = activeSymbolRef.current;

    switch (item._t) {
      case "wl_row":
        return (
          <SymbolRow
            symbol={item.sym.symbol}
            name={item.sym.name}
            category={item.sym.category}
            broker={item.sym.broker}
            isFavorite={item.isFav}
            inWatchlist={item.inWl}
            isActive={activeSym === item.sym.symbol}
            onStarPress={getStarCb(item.sym.symbol)}
            onTap={getWatchlistTapCb(item.sym.symbol)}
          />
        );

      case "wl_empty":
        return (
          <EmptyState
            iconName="trending-up-outline"
            title={item.searchActive ? "No results" : "No favorite markets yet"}
            subtitle={!item.searchActive ? "Tap the star icon in Markets to add your favorite symbols." : undefined}
          />
        );

      case "sec_hdr": {
        const meta = CATEGORY_META[item.cat];
        return (
          <Pressable
            onPress={() => toggleCat(item.cat)}
            style={[styles.sectionHeader, { borderLeftColor: meta.color }]}
          >
            <View style={[styles.sectionDot, { backgroundColor: meta.color }]} />
            <Text style={styles.sectionLabel}>{meta.label}</Text>
            <View style={[styles.sectionCount, { backgroundColor: `${meta.color}18` }]}>
              <Text style={[styles.sectionCountText, { color: meta.color }]}>{item.count}</Text>
            </View>
            <Ionicons
              name={item.open ? "chevron-down" : "chevron-forward"}
              size={12}
              color="rgba(148,163,184,0.35)"
            />
          </Pressable>
        );
      }

      case "mkt_row":
        return (
          <SymbolRow
            symbol={item.sym.symbol}
            name={item.sym.name}
            category={item.sym.category}
            broker={item.sym.broker}
            isFavorite={item.isFav}
            inWatchlist={item.inWl}
            isActive={activeSym === item.sym.symbol}
            onStarPress={getStarCb(item.sym.symbol)}
            onTap={getTapCb(item.sym.symbol)}
          />
        );

      case "show_more": {
        const meta = CATEGORY_META[item.cat];
        return (
          <Pressable
            onPress={() => showMoreCat(item.cat)}
            style={({ pressed }) => [styles.showMoreBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={[styles.showMoreText, { color: meta.color }]}>
              Show {item.hidden} more {meta.label.toLowerCase()}…
            </Text>
          </Pressable>
        );
      }

      case "srch_row":
        return (
          <SymbolRow
            symbol={item.sym.symbol}
            name={item.sym.name}
            category={item.sym.category}
            broker={item.sym.broker}
            isFavorite={item.isFav}
            inWatchlist={item.inWl}
            isActive={activeSym === item.sym.symbol}
            onStarPress={getStarCb(item.sym.symbol)}
            onTap={getTapCb(item.sym.symbol)}
          />
        );

      case "srch_empty":
        return <EmptyState iconName="search" title={`No symbols match "${item.q}"`} />;

      case "loading":
        return (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="rgba(148,163,184,0.35)" />
            <Text style={styles.loadingText}>Loading markets…</Text>
          </View>
        );

      case "error":
        return <ErrorState msg={item.msg} onRetry={item.onRetry} />;

      case "footer":
        return (
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              {item.total} symbols
              {item.delta > 0 ? ` · Delta ${item.delta}` : ""}
              {item.ctrader > 0 ? ` · cTrader ${item.ctrader}` : ""}
            </Text>
          </View>
        );
    }
  }, [getStarCb, getTapCb, getWatchlistTapCb, toggleCat, showMoreCat]);

  // ── Tab change handler ────────────────────────────────────────────────
  const handleTabChange = useCallback((tab: Tab) => {
    startTransition(() => {
      setActiveTab(tab);
      setRawSearch("");
      setSearch("");
    });
  }, []);

  const handleClearSearch = useCallback(() => {
    setRawSearch("");
    setSearch("");
    searchInputRef.current?.focus();
  }, []);

  // ── Header (shared between page and sheet modes) ──────────────────────
  const header = (
    <View style={styles.header}>
      {/* Tab row + action buttons */}
      <View style={styles.tabRow}>
        <View style={styles.segmentBar}>
          {TABS.map(tab => {
            const active = tab === activeTab;
            return (
              <Pressable
                key={tab}
                onPress={() => handleTabChange(tab)}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
              >
                <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
                  {tab}
                </Text>
                {tab === "Markets" && totalMarkets > 0 && (
                  <View style={[styles.tabCountBadge, active && styles.tabCountBadgeActive]}>
                    <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>
                      {totalMarkets}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.headerActions}>
          {headerActions}
          {mode === "sheet" && onClose && (
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="close" size={14} color="rgba(148,163,184,0.5)" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Search bar — page mode only, Markets tab only */}
      {mode === "page" && activeTab !== "Watchlist" && (
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={13} color="rgba(148,163,184,0.38)" />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={rawSearch}
              onChangeText={handleSearchChange}
              placeholder="Search all markets…"
              placeholderTextColor="rgba(148,163,184,0.35)"
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {rawSearch.length > 0 && (
              <Pressable onPress={handleClearSearch} hitSlop={8} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={14} color="rgba(148,163,184,0.5)" />
              </Pressable>
            )}
          </View>
        </View>
      )}

      <CtraderStatusBar />
    </View>
  );

  // ── Page mode ─────────────────────────────────────────────────────────
  if (mode === "page") {
    return (
      <View style={styles.pageContainer}>
        {header}
        <FlashList
          data={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          extraData={activeSymbol}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      </View>
    );
  }

  // ── Sheet mode ────────────────────────────────────────────────────────
  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      index={1}
      backdropComponent={renderBackdrop}
      onDismiss={handleSheetDismiss}
      enablePanDownToClose
      handleIndicatorStyle={styles.sheetHandle}
      backgroundStyle={styles.sheetBackground}
    >
      {header}
      <BottomSheetFlashList
        data={listItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimatedItemSize={56}
        extraData={activeSymbol}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </BottomSheetModal>
  );
});

// ── Styles ────────────────────────────────────────────────────────────────
// Hoisted to module level — created once at load time, never re-allocated.

const styles = StyleSheet.create({
  // ── Page container ──
  pageContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },

  // ── Header ──
  header: {
    flexShrink: 0,
    backgroundColor: "#000000",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },

  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },

  segmentBar: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 4,
  },

  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 7,
    gap: 5,
    borderWidth: 1,
    borderColor: "transparent",
  },

  tabBtnActive: {
    backgroundColor: "#2A2D31",
    borderColor: "rgba(255,255,255,0.10)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },

  tabBtnText: {
    fontSize: 12.5,
    fontWeight: "500",
    color: "#6E7578",
    fontFamily: "Inter_500Medium",
  },

  tabBtnTextActive: {
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
  },

  tabCountBadge: {
    backgroundColor: "rgba(148,163,184,0.06)",
    borderRadius: 99,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
  },

  tabCountBadgeActive: {
    backgroundColor: "rgba(245,158,11,0.12)",
  },

  tabCountText: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "rgba(148,163,184,0.30)",
    fontFamily: "Inter_600SemiBold",
  },

  tabCountTextActive: {
    color: "rgba(245,158,11,0.8)",
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },

  closeBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 7,
  },

  // ── Search ──
  searchRow: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },

  searchInput: {
    flex: 1,
    fontSize: 13.5,
    color: "#e2e8f0",
    fontFamily: "Inter_400Regular",
    padding: 0,
    margin: 0,
  },

  clearBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── cTrader status bar ──
  ctraderBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 5,
    gap: 5,
  },

  ctraderDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 3,
    elevation: 2,
  },

  ctraderText: {
    fontSize: 10,
    color: "rgba(148,163,184,0.38)",
    fontWeight: "500",
    fontFamily: "Inter_500Medium",
  },

  // ── Symbol row ──
  symbolRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.035)",
    minHeight: 52,
    borderLeftWidth: 2.5,
    borderLeftColor: "transparent",
  },

  symbolRowActive: {
    borderLeftColor: "#f59e0b",
    backgroundColor: "rgba(245,158,11,0.06)",
  },

  symbolRowPressed: {
    backgroundColor: "rgba(255,255,255,0.03)",
  },

  starBtn: {
    paddingHorizontal: 8,
    paddingLeft: 10,
    paddingVertical: 8,
    flexShrink: 0,
  },

  symbolLeft: {
    flex: 1,
    minWidth: 0,
  },

  symbolTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 1,
  },

  symbolText: {
    color: "#e8f0ed",
    fontWeight: "700",
    fontSize: 13.5,
    letterSpacing: 0.025 * 13.5,
    lineHeight: 16,
    fontFamily: "Inter_700Bold",
  },

  badge: {
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderWidth: 1,
    flexShrink: 0,
  },

  badgeText: {
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.06 * 8,
    lineHeight: 11.2,
    fontFamily: "Inter_700Bold",
  },

  nameText: {
    color: "rgba(148,163,184,0.38)",
    fontSize: 10.5,
    lineHeight: 12.6,
    fontFamily: "Inter_400Regular",
  },

  // ── Price cell ──
  priceCol: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: 3,
    paddingRight: 12,
  },

  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#10b981",
    flexShrink: 0,
  },

  priceText: {
    color: "#ddeedd",
    fontWeight: "600",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.01 * 13,
    minWidth: 60,
    textAlign: "right",
    fontFamily: "Inter_600SemiBold",
  },

  priceTextEmpty: {
    color: "rgba(148,163,184,0.2)",
  },

  changePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    minWidth: 52,
    justifyContent: "center",
  },

  changePillUp: {
    backgroundColor: "rgba(16,185,129,0.11)",
    borderColor: "rgba(16,185,129,0.20)",
  },

  changePillDown: {
    backgroundColor: "rgba(239,68,68,0.11)",
    borderColor: "rgba(239,68,68,0.20)",
  },

  changePillIdle: {
    backgroundColor: "rgba(148,163,184,0.05)",
    borderColor: "rgba(148,163,184,0.08)",
  },

  changeText: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.01 * 11,
    fontFamily: "Inter_700Bold",
  },

  // ── Section header ──
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.015)",
    borderLeftWidth: 2.5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.04)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.04)",
  },

  sectionDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },

  sectionLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.68)",
    letterSpacing: 0.06 * 11,
    textTransform: "uppercase",
    fontFamily: "Inter_700Bold",
  },

  sectionCount: {
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },

  sectionCountText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.02 * 10,
    fontFamily: "Inter_600SemiBold",
  },

  // ── Show more button ──
  showMoreBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.04)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },

  showMoreText: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },

  // ── Empty state ──
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
    paddingHorizontal: 32,
    gap: 12,
  },

  emptyIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },

  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.40)",
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
  },

  emptySubtitle: {
    fontSize: 12,
    color: "rgba(148,163,184,0.25)",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 220,
    fontFamily: "Inter_400Regular",
  },

  // ── Loading ──
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 56,
    gap: 8,
  },

  loadingText: {
    fontSize: 12.5,
    color: "rgba(148,163,184,0.35)",
    fontFamily: "Inter_400Regular",
  },

  // ── Error ──
  errorContainer: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: "center",
  },

  errorTitle: {
    fontSize: 13,
    color: "rgba(239,68,68,0.55)",
    marginBottom: 6,
    fontFamily: "Inter_500Medium",
  },

  errorMsg: {
    fontSize: 11,
    color: "rgba(148,163,184,0.30)",
    marginBottom: 16,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
  },

  retryBtn: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.22)",
    backgroundColor: "rgba(245,158,11,0.14)",
  },

  retryBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#f59e0b",
    fontFamily: "Inter_600SemiBold",
  },

  // ── Footer ──
  footerRow: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: "center",
  },

  footerText: {
    fontSize: 10,
    color: "rgba(148,163,184,0.18)",
    fontWeight: "500",
    fontFamily: "Inter_500Medium",
  },

  // ── List ──
  listContent: {
    paddingBottom: 80,
  },

  // ── Sheet ──
  sheetHandle: {
    backgroundColor: "rgba(255,255,255,0.25)",
    width: 36,
  },

  sheetBackground: {
    backgroundColor: "#090b0e",
  },
});
