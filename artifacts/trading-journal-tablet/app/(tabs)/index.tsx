/**
 * app/(tabs)/index.tsx — Dashboard Screen
 *
 * Migration of: artifacts/trading-journal/src/pages/dashboard.tsx
 *
 * Web → RN replacements:
 *   <div> / <span>          → <View> / <Text>
 *   CSS grid grid-cols-7    → View + onLayout-measured cells (see CalendarGrid)
 *   CSS aspect-square       → computed square via measured width
 *   Drawer (vaul)           → Sheet side="bottom" (tablet UI lib)
 *   window.addEventListener → removed (no window in RN)
 *   onMouseEnter/Leave      → removed (no hover in RN)
 *   PageTransition          → plain View (no Framer Motion)
 *   lucide-react icons      → Ionicons (@expo/vector-icons)
 *   wouter Link / navigate  → router.push() (Expo Router)
 *   DashboardSegmentedCtrl  → controlled (value + options + onValueChange)
 *   useBrokerStore          → not yet migrated; openPositions/Orders default 0
 *   useChartStore           → not yet migrated; setDashboardSheetOpen removed
 *   performance.now()       → Date.now() (Hermes supports both; Date.now is safer)
 *   overflow-y-auto         → ScrollView
 *   shimmer-loading         → Skeleton component
 *
 * API hooks used (from @workspace/api-client-react):
 *   useListTrades({ limit: 1 })            — loading gate
 *   useListTrades({ date, limit: 100 })    — day detail trades
 *   useGetCalendarHeatmap({ year, month }) — calendar data
 *
 * Stores used:
 *   useCombinedPortfolio — account value + PnL
 *   useCurrencyFormatter — currency-aware number formatting
 *   useCurrencyAxisFormatter — compact axis tick format
 */

import { Ionicons } from "@expo/vector-icons";
import {
  useGetCalendarHeatmap,
  useListTrades,
  getListTradesQueryKey,
  type Trade,
} from "@workspace/api-client-react";
import { router } from "expo-router";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AccountValueWidget from "@/components/AccountValueWidget";
import DashboardSegmentedControl from "@/components/DashboardSegmentedControl";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCurrencyAxisFormatter,
  useCurrencyFormatter,
} from "@/store/currencyStore";
import { useCombinedPortfolio } from "@/store/combinedPortfolioStore";
import { useBrokerStore } from "@/store/brokerStore";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DASHBOARD_TIMEOUT_MS = 2_000;

const SEGMENT_OPTIONS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "reports",   label: "Reports"   },
] as const;

const CALENDAR_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const CELL_GAP      = 4;   // px between calendar cells
const CAL_H_PAD     = 12;  // horizontal padding inside the calendar container

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function padDate(n: number): string {
  return String(n).padStart(2, "0");
}

function buildDateKey(y: number, m: number, d: number): string {
  return `${y}-${padDate(m)}-${padDate(d)}`;
}

function fmtPrice(v: number): string {
  return v < 1
    ? v.toFixed(4)
    : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// ─────────────────────────────────────────────────────────────────────────────
// DayDetailSheet — bottom modal showing trades for a tapped calendar day
// Replaces web's <Drawer> (vaul) component
// ─────────────────────────────────────────────────────────────────────────────

interface DayDetailSheetProps {
  date:    string;
  dayData: { pnl: number; trades: number } | null;
  open:    boolean;
  onClose: () => void;
}

const DayDetailSheet = memo(function DayDetailSheet({
  date, dayData: _dayData, open, onClose,
}: DayDetailSheetProps) {
  const fc = useCurrencyFormatter();

  const dayTradeParams = { date, limit: 100 };
  const { data, isLoading } = useListTrades(dayTradeParams, {
    query: {
      queryKey: getListTradesQueryKey(dayTradeParams),
      enabled:  open && !!date,
    },
  });

  const dayTrades: Trade[] = data?.trades ?? [];
  const wins      = dayTrades.filter((t) => (t.pnl ?? 0) > 0).length;
  const losses    = dayTrades.filter((t) => (t.pnl ?? 0) < 0).length;
  const dailyPnl  = dayTrades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  const label = useMemo(() => {
    if (!date) return "";
    return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }, [date]);

  const pnlPositive = dailyPnl >= 0;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.sheetBackdrop} onPress={onClose} />

      {/* Sheet panel — 85% height */}
      <View style={styles.sheetPanel}>

        {/* Drag handle */}
        <View style={styles.sheetHandle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.sheetHeaderLabel}>Daily Summary</Text>
            <Text style={styles.sheetHeaderDate}>{label}</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={styles.sheetCloseBtn}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={16} color="rgba(148,163,184,0.70)" />
          </Pressable>
        </View>

        {/* Summary row */}
        <View style={styles.sheetSummaryRow}>
          {/* PnL card */}
          <View style={styles.sheetSummaryCard}>
            <Text style={styles.sheetSummaryLabel}>Net P&amp;L</Text>
            <Text style={[
              styles.sheetSummaryPnl,
              { color: pnlPositive ? PROFIT : LOSS },
            ]}>
              {pnlPositive ? "+" : ""}{fc(dailyPnl)}
            </Text>
            {dailyPnl > 0 && (
              <Text style={styles.sheetSummaryNote}>
                Congrats, your day is profitable!
              </Text>
            )}
            {dailyPnl < 0 && (
              <Text style={styles.sheetSummaryNote}>
                Stay disciplined. Better trades ahead.
              </Text>
            )}
          </View>

          {/* Win/Loss counts */}
          <View style={styles.sheetSummaryStats}>
            <View style={styles.sheetStatRow}>
              <Text style={styles.sheetStatKey}>Total Trades:</Text>
              <View style={styles.sheetBadgeBlue}>
                <Text style={styles.sheetBadgeText}>{dayTrades.length}</Text>
              </View>
            </View>
            <View style={styles.sheetWLRow}>
              <View style={styles.sheetStatRow}>
                <Text style={styles.sheetStatKey}>Win:</Text>
                <View style={styles.sheetBadgeGreen}>
                  <Text style={[styles.sheetBadgeText, { color: "#34d399" }]}>{wins}</Text>
                </View>
              </View>
              <View style={styles.sheetStatRow}>
                <Text style={styles.sheetStatKey}>Loss:</Text>
                <View style={styles.sheetBadgeRed}>
                  <Text style={[styles.sheetBadgeText, { color: "#f87171" }]}>{losses}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Trades list header */}
        <View style={styles.sheetTradesHeader}>
          <Text style={styles.sheetTradesLabel}>Trades</Text>
          {!isLoading && dayTrades.length > 0 && (
            <Text style={styles.sheetTradesCount}>{dayTrades.length}</Text>
          )}
        </View>

        {/* Trades list */}
        <ScrollView
          style={styles.sheetTradesList}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheetTradesCard}>
            {isLoading && [0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.sheetTradeRow,
                  i < 2 && styles.sheetTradeRowBorder,
                ]}
              >
                <View style={styles.sheetTradeSkeletonRow}>
                  <Skeleton style={styles.sheetSkeletonSymbol} />
                  <Skeleton style={styles.sheetSkeletonPnl} />
                </View>
                <View style={[styles.sheetTradeSkeletonRow, { marginTop: 8 }]}>
                  <Skeleton style={styles.sheetSkeletonPrice} />
                  <Skeleton style={styles.sheetSkeletonDate} />
                </View>
              </View>
            ))}

            {!isLoading && dayTrades.length === 0 && (
              <View style={styles.sheetEmptyTrades}>
                <Text style={styles.sheetEmptyText}>No trades for this day.</Text>
              </View>
            )}

            {!isLoading && dayTrades.map((trade, idx) => {
              const isLast    = idx === dayTrades.length - 1;
              const pnl       = trade.pnl ?? 0;
              const isWin     = pnl >= 0;
              const pnlColor  = isWin ? "#35C37A" : "#E0524F";
              const sideColor = trade.side === "long" ? "#35C37A" : "#E0524F";
              const dateStr   = trade.entryDate
                ? new Date(trade.entryDate).toLocaleDateString(undefined, {
                    month: "short", day: "numeric",
                  })
                : "";

              return (
                <View
                  key={trade.id}
                  style={[
                    styles.sheetTradeRow,
                    !isLast && styles.sheetTradeRowBorder,
                  ]}
                >
                  {/* Row 1: Symbol + side | PnL */}
                  <View style={styles.sheetTradeMain}>
                    <View style={styles.sheetTradeLeft}>
                      <Text style={styles.sheetTradeSymbol}>{trade.symbol}</Text>
                      <Text style={[styles.sheetTradeSide, { color: sideColor }]}>
                        {trade.side === "long" ? "LONG" : "SHORT"}
                      </Text>
                    </View>
                    <Text style={[styles.sheetTradePnl, { color: pnlColor }]}>
                      {isWin ? "+" : ""}{fc(pnl)}
                    </Text>
                  </View>

                  {/* Row 2: Entry → Exit | Date */}
                  <View style={styles.sheetTradeSub}>
                    <View style={styles.sheetTradePrices}>
                      <Text style={styles.sheetTradePrice}>
                        {fmtPrice(trade.entryPrice ?? 0)}
                      </Text>
                      <Text style={styles.sheetTradeArrow}>→</Text>
                      <Text style={styles.sheetTradePrice}>
                        {trade.exitPrice != null ? fmtPrice(trade.exitPrice) : "—"}
                      </Text>
                    </View>
                    <Text style={styles.sheetTradeDate}>{dateStr}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Bottom spacer for safe area */}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// CalendarHeatmap
// ─────────────────────────────────────────────────────────────────────────────

interface CalendarHeatmapProps {
  data:          Array<{ date: string; pnl: number; trades: number }>;
  year:          number;
  month:         number;
  onPrev:        () => void;
  onNext:        () => void;
  onDateClick:   (date: string) => void;
}

const CalendarHeatmap = memo(function CalendarHeatmap({
  data, year, month, onPrev, onNext, onDateClick,
}: CalendarHeatmapProps) {
  const fc            = useCurrencyFormatter();
  const axisFormatter = useCurrencyAxisFormatter();

  // Measure the grid container to compute cell sizes
  const [gridWidth, setGridWidth] = useState(0);
  const handleGridLayout = useCallback((e: LayoutChangeEvent) => {
    setGridWidth(e.nativeEvent.layout.width);
  }, []);

  // Cell size: (available width − 6 gaps) ÷ 7 columns
  const cellSize = gridWidth > 0
    ? Math.floor((gridWidth - 6 * CELL_GAP) / 7)
    : 40;

  // Indexed by dateString for O(1) lookup
  const dayMap = useMemo(() => {
    const m: Record<string, { pnl: number; trades: number }> = {};
    data.forEach((d) => { m[d.date] = { pnl: d.pnl, trades: d.trades }; });
    return m;
  }, [data]);

  const maxAbs = useMemo(
    () => Math.max(...data.map((d) => Math.abs(d.pnl)), 1),
    [data],
  );

  const firstDay    = useMemo(() => new Date(year, month - 1, 1).getDay(), [year, month]);
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(),    [year, month]);
  const monthName   = useMemo(
    () => new Date(year, month - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    [year, month],
  );
  const monthlyPnl = useMemo(() => data.reduce((sum, d) => sum + d.pnl, 0), [data]);

  const remainingDays = useMemo(() => {
    const today = new Date();
    const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === month;
    if (!isCurrent) return 0;
    return daysInMonth - today.getDate();
  }, [year, month, daysInMonth]);

  // Pre-compute cell tint colours (mirrors web cellStyles logic)
  const cellColors = useMemo(() => {
    const out: Record<string, { bg: string; border: string }> = {};
    Object.entries(dayMap).forEach(([dateStr, d]) => {
      if (!d || d.trades === 0) return;
      const intensity = Math.min(Math.abs(d.pnl) / maxAbs, 1);
      if (d.pnl > 0) {
        out[dateStr] = {
          bg:     `rgba(52,211,153,${(0.12 + intensity * 0.55).toFixed(2)})`,
          border: `rgba(52,211,153,${(0.20 + intensity * 0.30).toFixed(2)})`,
        };
      } else if (d.pnl < 0) {
        out[dateStr] = {
          bg:     `rgba(248,113,113,${(0.12 + intensity * 0.55).toFixed(2)})`,
          border: `rgba(248,113,113,${(0.20 + intensity * 0.30).toFixed(2)})`,
        };
      } else {
        out[dateStr] = {
          bg:     "rgba(255,255,255,0.05)",
          border: "rgba(255,255,255,0.10)",
        };
      }
    });
    return out;
  }, [dayMap, maxAbs]);

  // Build ordered cell list: empty slots + day cells
  const cells = useMemo(() => {
    const list: Array<{ key: string; day: number | null; dateStr: string | null }> = [];
    for (let i = 0; i < firstDay; i++) {
      list.push({ key: `e${i}`, day: null, dateStr: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = buildDateKey(year, month, d);
      list.push({ key: dateStr, day: d, dateStr });
    }
    return list;
  }, [firstDay, daysInMonth, year, month]);

  return (
    <View>
      {/* ── Month navigator + monthly stats ── */}
      <View style={calStyles.navRow}>
        {/* Left: prev / month / next */}
        <View style={calStyles.navLeft}>
          <Pressable
            onPress={onPrev}
            style={calStyles.navBtn}
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={16} color="rgba(148,163,184,0.60)" />
          </Pressable>
          <Text style={calStyles.monthName}>{monthName}</Text>
          <Pressable
            onPress={onNext}
            style={calStyles.navBtn}
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={16} color="rgba(148,163,184,0.60)" />
          </Pressable>
        </View>

        {/* Right: monthly PnL badge + remaining days */}
        <View style={calStyles.navRight}>
          {data.length > 0 && (
            <View style={[
              calStyles.monthlyBadge,
              monthlyPnl >= 0 ? calStyles.monthlyBadgeProfit : calStyles.monthlyBadgeLoss,
            ]}>
              <Text style={[
                calStyles.monthlyBadgeText,
                { color: monthlyPnl >= 0 ? "#34d399" : "#f87171" },
              ]}>
                {monthlyPnl >= 0 ? "+" : ""}{axisFormatter(monthlyPnl)}
              </Text>
            </View>
          )}
          {remainingDays > 0 && (
            <View style={calStyles.remainingBadge}>
              <Text style={calStyles.remainingText}>{remainingDays} days</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Day-of-week labels ── */}
      <View
        style={calStyles.grid}
        onLayout={handleGridLayout}
      >
        {CALENDAR_DAYS.map((d) => (
          <View
            key={d}
            style={[calStyles.dowCell, { width: cellSize }]}
          >
            <Text style={calStyles.dowText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* ── Calendar cells ── */}
      <View style={calStyles.grid}>
        {cells.map(({ key, day, dateStr }) => {
          if (day === null || dateStr === null) {
            // Empty spacer
            return <View key={key} style={{ width: cellSize, height: cellSize, margin: CELL_GAP / 2 }} />;
          }

          const entry      = dayMap[dateStr];
          const hasTrades  = !!(entry && entry.trades > 0);
          const colors     = cellColors[dateStr];

          return (
            <Pressable
              key={key}
              onPress={() => hasTrades && onDateClick(dateStr)}
              disabled={!hasTrades}
              style={({ pressed }) => [
                calStyles.cell,
                {
                  width:  cellSize,
                  height: cellSize,
                  margin: CELL_GAP / 2,
                  backgroundColor: colors?.bg   ?? "transparent",
                  borderColor:     colors?.border ?? "transparent",
                  borderWidth:     colors ? 1 : 0,
                },
                pressed && hasTrades && { opacity: 0.60 },
              ]}
              accessibilityLabel={
                hasTrades
                  ? `${dateStr}: ${entry.trades} trade${entry.trades > 1 ? "s" : ""}, PnL ${fc(entry.pnl)}`
                  : `${dateStr}: no trades`
              }
            >
              <Text style={calStyles.cellDay}>{day}</Text>
              {hasTrades && (
                <Text
                  style={[
                    calStyles.cellPnl,
                    { color: entry.pnl > 0 ? "#34d399" : "#f87171" },
                  ]}
                  numberOfLines={1}
                >
                  {entry.pnl > 0 ? "+" : ""}{axisFormatter(Math.abs(entry.pnl))}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard — main screen component
// ─────────────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

  // ── Loading timeout (mirrors web: 2 s max wait before rendering) ──────────
  const mountTimeRef   = useRef(Date.now());
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), DASHBOARD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { isLoading: tradesLoading, isError: tradesError } =
    useListTrades({ limit: 1 });

  const combined = useCombinedPortfolio();

  // Open positions and orders — summed across all connected brokers.
  const deltaPositions   = useBrokerStore(s => s.brokerPositions["delta"]   ?? []);
  const ctraderPositions = useBrokerStore(s => s.brokerPositions["ctrader"] ?? []);
  const deltaOrders      = useBrokerStore(s => s.brokerOrders["delta"]      ?? []);
  const ctraderOrders    = useBrokerStore(s => s.brokerOrders["ctrader"]    ?? []);
  const openPositionsCount = deltaPositions.length + ctraderPositions.length;
  const brokerOrdersCount  = deltaOrders.length + ctraderOrders.length;

  // Collapse loading state once data arrives or timeout fires
  useEffect(() => {
    if (!tradesLoading && !timedOut) {
      const elapsed = Math.round(Date.now() - mountTimeRef.current);
      console.log(`[Dashboard] loaded in ${elapsed}ms — trades:${!tradesError}`);
      setTimedOut(true);
    }
  }, [tradesLoading, timedOut, tradesError]);

  // ── Calendar state ─────────────────────────────────────────────────────────
  const now = useMemo(() => new Date(), []);
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);

  const handleCalPrev = useCallback(() => {
    setCalMonth((m) => {
      if (m === 1) { setCalYear((y) => y - 1); return 12; }
      return m - 1;
    });
  }, []);
  const handleCalNext = useCallback(() => {
    setCalMonth((m) => {
      if (m === 12) { setCalYear((y) => y + 1); return 1; }
      return m + 1;
    });
  }, []);

  const { data: calData } = useGetCalendarHeatmap(
    { year: calYear, month: calMonth },
  );

  // ── Day detail sheet ───────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState("");
  const [sheetOpen,    setSheetOpen]    = useState(false);

  const handleDateClick = useCallback((date: string) => {
    const calMap = (calData ?? []).reduce<Record<string, { pnl: number; trades: number }>>(
      (m: Record<string, { pnl: number; trades: number }>, d: { date: string; pnl: number; trades: number }) => {
        m[d.date] = { pnl: d.pnl, trades: d.trades }; return m;
      },
      {},
    );
    const entry = calMap[date];
    if (!entry || entry.trades === 0) return;
    setSelectedDate(date);
    setSheetOpen(true);
  }, [calData]);

  const selectedDayData = useMemo(() => {
    if (!selectedDate || !calData) return null;
    return calData.find((d: { date: string; pnl: number; trades: number }) => d.date === selectedDate) ?? null;
  }, [selectedDate, calData]);

  // ── Segmented control ──────────────────────────────────────────────────────
  // Always "dashboard" on this screen.  Tapping "Reports" navigates to the
  // reports tab (not yet migrated; will hit +not-found until that phase).
  const [activeSegment, setActiveSegment] = useState("dashboard");
  const handleSegmentChange = useCallback((value: string) => {
    setActiveSegment(value);
    if (value === "reports") {
      // TODO: replace with router.push("/(tabs)/reports") when reports screen is migrated
      setActiveSegment("dashboard"); // bounce back — screen not yet available
    }
  }, []);

  // ── Navigation callbacks for AccountValueWidget ────────────────────────────
  const handleShowPositions = useCallback(
    () => router.push("/(tabs)/trades" as never),
    [],
  );
  const handleShowPnl = useCallback(
    () => router.push("/(tabs)/trades" as never),
    [],
  );

  // ── Loading state ──────────────────────────────────────────────────────────
  const isStillLoading = !timedOut && tradesLoading;
  const apiOffline     = tradesError;

  if (isStillLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContent}>
          {/* Mirrors web: AccountValueWidget ≈176 px, calendar card ≈302 px */}
          <Skeleton style={styles.skeletonWidget} />
          <Skeleton style={styles.skeletonCalendar} />
        </View>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── API offline banner ── */}
        {apiOffline && (
          <View style={styles.offlineBanner}>
            <View style={styles.offlineDot} />
            <Text style={styles.offlineText}>
              API server offline — dashboard showing cached or empty data
            </Text>
          </View>
        )}

        {/* ── Segmented control: Dashboard / Reports ── */}
        <DashboardSegmentedControl
          value={activeSegment}
          options={SEGMENT_OPTIONS as unknown as Array<{ value: string; label: string }>}
          onValueChange={handleSegmentChange}
        />

        {/* ── Account Value Widget ── */}
        <View style={styles.widgetWrapper}>
          <AccountValueWidget
            accountValueUSD={combined.usd.accountValue}
            accountValueDisplay={combined.display.accountValue}
            upnlUSD={combined.usd.unrealizedPnl}
            upnlDisplay={combined.display.unrealizedPnl}
            realizedPnlUSD={combined.usd.realizedPnl}
            realizedPnlDisplay={combined.display.realizedPnl}
            netPnlUSD={combined.usd.netPnl}
            netPnlDisplay={combined.display.netPnl}
            openPositions={openPositionsCount}
            openOrders={brokerOrdersCount}
            onShowPositions={handleShowPositions}
            onShowPnl={handleShowPnl}
          />
        </View>

        {/* ── Trading Calendar ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trading Calendar</Text>
          <View style={styles.calendarCard}>
            <CalendarHeatmap
              data={calData ?? []}
              year={calYear}
              month={calMonth}
              onPrev={handleCalPrev}
              onNext={handleCalNext}
              onDateClick={handleDateClick}
            />
          </View>
        </View>

        {/* Bottom spacer */}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Day detail sheet ── */}
      <DayDetailSheet
        date={selectedDate}
        dayData={selectedDayData}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const PROFIT   = "#35C37A";
const LOSS     = "#E0524F";
const BG       = "#05070A";
const CARD_BG  = "#0A0E18";
const DIVIDER  = "rgba(255,255,255,0.08)";
const TEXT_PRI = "#EDF0F6";
const TEXT_MUT = "rgba(148,163,184,0.60)";
const TEXT_DIM = "rgba(148,163,184,0.40)";

// ─────────────────────────────────────────────────────────────────────────────
// Screen styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               16,
  },

  // ── Loading ────────────────────────────────────────────────────────────────
  loadingContent: {
    flex:              1,
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               16,
  },
  skeletonWidget: {
    height:       176,
    borderRadius: 16,
  },
  skeletonCalendar: {
    height:       302,
    borderRadius: 16,
  },

  // ── Offline banner ─────────────────────────────────────────────────────────
  offlineBanner: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     "rgba(245,158,11,0.20)",
    backgroundColor: "rgba(245,158,11,0.04)",
  },
  offlineDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: "#FBBF24",
    flexShrink:      0,
  },
  offlineText: {
    color:      "#FBBF24",
    fontSize:   12,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
    flex:       1,
  },

  // ── Widget wrapper (mirrors web -mt-2) ─────────────────────────────────────
  widgetWrapper: {
    marginTop: -4,
  },

  // ── Section ────────────────────────────────────────────────────────────────
  section: {
    gap: 8,
  },
  sectionTitle: {
    color:      TEXT_PRI,
    fontSize:   16,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },

  // ── Calendar card ──────────────────────────────────────────────────────────
  calendarCard: {
    backgroundColor: CARD_BG,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     DIVIDER,
    paddingTop:      14,
    paddingBottom:   16,
  },

  // ─── Day Detail Sheet ────────────────────────────────────────────────────
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.75)",
  },
  sheetPanel: {
    position:        "absolute",
    bottom:          0,
    left:            0,
    right:           0,
    height:          "85%",
    backgroundColor: "#0a0a0a",
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    borderWidth:     1,
    borderBottomWidth: 0,
    borderColor:     "rgba(255,255,255,0.10)",
  },
  sheetHandle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf:       "center",
    marginTop:       10,
    marginBottom:    8,
  },
  sheetHeader: {
    flexDirection:   "row",
    alignItems:      "flex-start",
    justifyContent:  "space-between",
    paddingHorizontal: 20,
    marginBottom:    16,
  },
  sheetHeaderLabel: {
    color:          TEXT_DIM,
    fontSize:       11,
    fontFamily:     "Inter_600SemiBold",
    letterSpacing:  1.2,
    textTransform:  "uppercase",
    marginBottom:   3,
  },
  sheetHeaderDate: {
    color:      TEXT_PRI,
    fontSize:   15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  sheetCloseBtn: {
    width:           28,
    height:          28,
    borderRadius:    14,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems:      "center",
    justifyContent:  "center",
    marginTop:       2,
  },

  // Sheet summary
  sheetSummaryRow: {
    flexDirection:     "row",
    gap:               8,
    paddingHorizontal: 20,
    marginBottom:      16,
  },
  sheetSummaryCard: {
    flex:              1,
    backgroundColor:   "rgba(255,255,255,0.04)",
    borderRadius:      12,
    borderWidth:       1,
    borderColor:       DIVIDER,
    padding:           12,
  },
  sheetSummaryLabel: {
    color:      TEXT_DIM,
    fontSize:   10,
    fontFamily: "Inter_400Regular",
    marginBottom: 4,
  },
  sheetSummaryPnl: {
    fontSize:   16,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  sheetSummaryNote: {
    color:      TEXT_DIM,
    fontSize:   10,
    fontFamily: "Inter_400Regular",
    marginTop:  4,
  },
  sheetSummaryStats: {
    flex:            1,
    paddingTop:      20,
    gap:             8,
  },
  sheetStatRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
  },
  sheetWLRow: {
    flexDirection: "row",
    gap:           12,
  },
  sheetStatKey: {
    color:      "rgba(255,255,255,0.50)",
    fontSize:   13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  sheetBadgeBlue: {
    height:            18,
    paddingHorizontal: 10,
    borderRadius:      9,
    backgroundColor:   "rgba(30,58,138,0.80)",
    alignItems:        "center",
    justifyContent:    "center",
  },
  sheetBadgeGreen: {
    height:            22,
    paddingHorizontal: 10,
    borderRadius:      6,
    backgroundColor:   "rgba(16,185,129,0.15)",
    borderWidth:       1,
    borderColor:       "rgba(52,211,153,0.20)",
    alignItems:        "center",
    justifyContent:    "center",
  },
  sheetBadgeRed: {
    height:            22,
    paddingHorizontal: 10,
    borderRadius:      6,
    backgroundColor:   "rgba(239,68,68,0.15)",
    borderWidth:       1,
    borderColor:       "rgba(248,113,113,0.20)",
    alignItems:        "center",
    justifyContent:    "center",
  },
  sheetBadgeText: {
    fontSize:   11,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    color:      "#ffffff",
    lineHeight: Platform.OS === "ios" ? 14 : 13,
  },

  // Trades list
  sheetTradesHeader: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 20,
    paddingBottom:     8,
  },
  sheetTradesLabel: {
    color:          TEXT_DIM,
    fontSize:       11,
    fontFamily:     "Inter_600SemiBold",
    letterSpacing:  1.2,
    textTransform:  "uppercase",
  },
  sheetTradesCount: {
    color:      TEXT_MUT,
    fontSize:   11,
    fontFamily: "Inter_600SemiBold",
  },
  sheetTradesList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sheetTradesCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.055)",
    overflow:        "hidden",
  },
  sheetTradeRow: {
    paddingHorizontal: 20,
    paddingVertical:   12,
  },
  sheetTradeRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  sheetTradeSkeletonRow: {
    flexDirection:  "row",
    justifyContent: "space-between",
  },
  sheetSkeletonSymbol: { width: 112, height: 16, borderRadius: 6 },
  sheetSkeletonPnl:    { width: 64,  height: 16, borderRadius: 6 },
  sheetSkeletonPrice:  { width: 80,  height: 12, borderRadius: 4 },
  sheetSkeletonDate:   { width: 56,  height: 12, borderRadius: 4 },
  sheetEmptyTrades: {
    paddingVertical: 40,
    alignItems:      "center",
  },
  sheetEmptyText: {
    color:      TEXT_MUT,
    fontSize:   14,
    fontFamily: "Inter_400Regular",
  },
  sheetTradeMain: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginBottom:   6,
  },
  sheetTradeLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  sheetTradeSymbol: {
    color:      "#F0F0F0",
    fontSize:   15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
  sheetTradeSide: {
    fontSize:      10,
    fontFamily:    "Inter_600SemiBold",
    fontWeight:    "600",
    letterSpacing: 0.8,
  },
  sheetTradePnl: {
    fontSize:   14,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  sheetTradeSub: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
  },
  sheetTradePrices: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           3,
  },
  sheetTradePrice: {
    color:      "#6B6B6B",
    fontSize:   12,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
  sheetTradeArrow: {
    color:    "rgba(255,255,255,0.25)",
    fontSize: 11,
    marginHorizontal: 1,
  },
  sheetTradeDate: {
    color:      "#6B6B6B",
    fontSize:   12,
    fontFamily: "Inter_500Medium",
    fontWeight: "500",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Calendar styles (separate StyleSheet for clarity)
// ─────────────────────────────────────────────────────────────────────────────

const calStyles = StyleSheet.create({
  navRow: {
    flexDirection:     "row",
    alignItems:        "center",
    justifyContent:    "space-between",
    paddingHorizontal: 16,
    marginBottom:      12,
  },
  navLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
  },
  navBtn: {
    width:           24,
    height:          24,
    borderRadius:    6,
    alignItems:      "center",
    justifyContent:  "center",
  },
  monthName: {
    color:         TEXT_MUT,
    fontSize:      12,
    fontFamily:    "Inter_600SemiBold",
    fontWeight:    "600",
    paddingHorizontal: 4,
  },
  navRight: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
  },
  monthlyBadge: {
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      9999,
  },
  monthlyBadgeProfit: {
    backgroundColor: "rgba(52,211,153,0.15)",
  },
  monthlyBadgeLoss: {
    backgroundColor: "rgba(248,113,113,0.15)",
  },
  monthlyBadgeText: {
    fontSize:   11,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  remainingBadge: {
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      9999,
    backgroundColor:   "rgba(30,58,138,0.70)",
  },
  remainingText: {
    color:      "#ffffff",
    fontSize:   11,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },

  // Shared flex-wrap row used for both dow headers and cells
  grid: {
    flexDirection:  "row",
    flexWrap:       "wrap",
    paddingHorizontal: CAL_H_PAD,
    marginBottom:   4,
  },

  // Day-of-week header cell
  dowCell: {
    alignItems:  "center",
    paddingVertical: 2,
    margin: CELL_GAP / 2,
  },
  dowText: {
    color:      TEXT_DIM,
    fontSize:   10,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    textAlign:  "center",
  },

  // Day cell
  cell: {
    borderRadius:   8,
    alignItems:     "center",
    justifyContent: "center",
    paddingVertical: 2,
  },
  cellDay: {
    color:      "rgba(237,240,246,0.90)",
    fontSize:   10,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
    lineHeight: 14,
  },
  cellPnl: {
    fontSize:   8,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    lineHeight: 11,
    marginTop:  1,
  },
});
