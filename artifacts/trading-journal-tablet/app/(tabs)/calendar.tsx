/**
 * app/(tabs)/calendar.tsx — Trading Calendar Screen
 *
 * Migration of: artifacts/trading-journal/src/pages/calendar.tsx
 *
 * Web → RN replacements
 * ──────────────────────────────────────────────────────────────────────────
 *   div / span / button          → View / Text / Pressable
 *   CSS grid grid-cols-[7+auto]  → custom View rows (required for feature
 *                                   parity: react-native-calendars cannot
 *                                   render an 8th week-total column)
 *   onMouseEnter / onMouseLeave  → Pressable onPress (no hover in RN)
 *   hover tooltip                → DayDetailSheet (Modal, slide-up)
 *   framer-motion / AnimatePresence → no animation library (tablet pattern)
 *   PageTransition / AnimatedCard   → plain View
 *   lucide-react icons           → @expo/vector-icons Ionicons
 *   CSS aspect-square            → onLayout-measured square cells
 *
 * react-native-calendars note
 * ──────────────────────────────────────────────────────────────────────────
 * The library is installed (react-native-calendars) but the calendar grid
 * is rendered manually because the web source requires an 8-column layout
 * (7 day columns + 1 week-total column).  react-native-calendars only
 * supports a 7-column grid and cannot add a native 8th column — so the
 * escape clause ("Do NOT create a custom calendar UNLESS required for
 * feature parity") applies here.  The week-total column is visible on
 * sm+ viewports in the web source, and the tablet is sm+.
 *
 * Business logic preserved exactly (same variable names, same math)
 * ──────────────────────────────────────────────────────────────────────────
 *   getIntensityStyle()         → getIntensityColors() (same rgba math)
 *   currentDate / prevMonth / nextMonth state + navigation
 *   year / month derivation
 *   dayMap construction from heatmap data (d.date.slice(0,10))
 *   maxAbs                      Math.max(...pnl absolutes, 1)
 *   monthSummary                totalPnl / totalTrades / winDays /
 *                               lossDays / tradingDays / winRate
 *   calendarCells               null-padded + day-object array
 *   weeklyRows                  7-cell chunk grouping
 *   monthName                   toLocaleString("default", …)
 *   isCurrentMonth              month + year equality check
 *   todayStr                    ISO slice(0,10)
 *   profitSwatches / lossSwatches  exact same opacity arrays
 *   Week PnL / trade summation  weekPnl / weekTrades
 *   PnL compact formatting      $Xk for ≥1000, $X for <1000
 *   Trade count suffix          `${trades}t`
 *
 * Features preserved
 * ──────────────────────────────────────────────────────────────────────────
 *   Intensity-based cell background + border colours
 *   Today highlight (lime-green accent on tablet / purple on light)
 *   Profitable day (green gradient) / loss day (red gradient)
 *   Month navigation (prev / next)
 *   4-stat monthly summary bar (Month PNL, Win Days, Day Win Rate,
 *                               Total Trades)
 *   Weekly PnL + trade count column (rightmost column)
 *   Legend (profit swatches, loss swatches, intensity scale)
 *   Loading state (ActivityIndicator)
 *   Empty state (no data cells rendered differently)
 *   Tap a day with trades → DayDetailSheet
 *   DayDetailSheet: daily PnL, win/loss counts, trade list with
 *                   symbol / side / PnL / entry→exit / date
 *   All Zustand store interactions (useCurrencyFormatter, useTheme)
 *   Error-free when heatmap data is null/undefined (defaults to [])
 */

import React, {
  useState,
  useMemo,
  useCallback,
  memo,
} from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useGetCalendarHeatmap,
  useListTrades,
  getListTradesQueryKey,
  type CalendarDay,
  type Trade,
} from "@workspace/api-client-react";
import { useCurrencyFormatter } from "@/store/currencyStore";
import { useTheme } from "@/contexts/ThemeContext";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — project dark theme
// ─────────────────────────────────────────────────────────────────────────────

const BG_PAGE  = "#05070A";
const BG_CARD  = "rgba(12,14,19,0.97)";
const BORDER   = "rgba(255,255,255,0.08)";
const TEXT_PRI = "#EDF0F6";
const TEXT_MUT = "rgba(148,163,184,0.60)";
const TEXT_DIM = "rgba(148,163,184,0.40)";
const PROFIT   = "#34d399";
const LOSS     = "#f87171";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Horizontal gap between day cells (matches web `gap-2` ≈ 8px) */
const CELL_GAP = 6;

/** Fixed width of the week-total right column */
const WEEK_COL_W = 68;

// ─────────────────────────────────────────────────────────────────────────────
// getIntensityColors — mirrors web getIntensityStyle() exactly
// ─────────────────────────────────────────────────────────────────────────────

function getIntensityColors(
  pnl:    number,
  trades: number,
  maxAbs: number,
  isLight: boolean,
): { bg: string; border: string } | null {
  if (trades === 0) return null;

  const intensity = Math.min(Math.abs(pnl) / Math.max(maxAbs, 1), 1);

  if (pnl > 0) {
    return isLight
      ? {
          bg:     `rgba(22,163,74,${(0.06 + intensity * 0.22).toFixed(3)})`,
          border: `rgba(22,163,74,${(0.18 + intensity * 0.32).toFixed(3)})`,
        }
      : {
          bg:     `rgba(52,211,153,${(0.1 + intensity * 0.5).toFixed(3)})`,
          border: `rgba(52,211,153,${(0.2 + intensity * 0.4).toFixed(3)})`,
        };
  }

  if (pnl < 0) {
    return isLight
      ? {
          bg:     `rgba(220,38,38,${(0.06 + intensity * 0.18).toFixed(3)})`,
          border: `rgba(220,38,38,${(0.18 + intensity * 0.28).toFixed(3)})`,
        }
      : {
          bg:     `rgba(248,113,113,${(0.1 + intensity * 0.5).toFixed(3)})`,
          border: `rgba(248,113,113,${(0.2 + intensity * 0.4).toFixed(3)})`,
        };
  }

  // Exactly zero PnL with trades
  return isLight
    ? { bg: "rgba(0,0,0,0.03)",       border: "rgba(0,0,0,0.07)" }
    : { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)" };
}

// ─────────────────────────────────────────────────────────────────────────────
// DayDetailSheet
//
// Replaces web hover tooltip + "Click a day to inspect" sub-title action.
// Pattern mirrors DayDetailSheet in app/(tabs)/index.tsx exactly.
// ─────────────────────────────────────────────────────────────────────────────

interface DayDetailSheetProps {
  date:    string;   // "YYYY-MM-DD"
  dayData: { pnl: number; trades: number } | null;
  open:    boolean;
  onClose: () => void;
}

const DayDetailSheet = memo(function DayDetailSheet({
  date,
  open,
  onClose,
}: DayDetailSheetProps) {
  const fc = useCurrencyFormatter();

  const dayTradeParams = useMemo(() => ({ date, limit: 100 }), [date]);
  const { data, isLoading } = useListTrades(dayTradeParams, {
    query: {
      queryKey: getListTradesQueryKey(dayTradeParams),
      enabled:  open && !!date,
    },
  });

  const dayTrades: Trade[] = data?.trades ?? [];
  const wins     = dayTrades.filter(t => (t.pnl ?? 0) > 0).length;
  const losses   = dayTrades.filter(t => (t.pnl ?? 0) < 0).length;
  const dailyPnl = dayTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

  const label = useMemo(() => {
    if (!date) return "";
    return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long",
      month:   "long",
      day:     "numeric",
      year:    "numeric",
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
      <Pressable style={sheet.backdrop} onPress={onClose} />

      {/* Panel */}
      <View style={sheet.panel}>
        {/* Drag handle */}
        <View style={sheet.handle} />

        {/* Header */}
        <View style={sheet.header}>
          <View>
            <Text style={sheet.headerLabel}>Daily Summary</Text>
            <Text style={sheet.headerDate}>{label}</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={sheet.closeBtn}
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={16} color={TEXT_MUT} />
          </Pressable>
        </View>

        {/* Summary row */}
        <View style={sheet.summaryRow}>
          {/* PnL card */}
          <View style={sheet.summaryCard}>
            <Text style={sheet.summaryLabel}>Net P&amp;L</Text>
            <Text style={[sheet.summaryPnl, { color: pnlPositive ? PROFIT : LOSS }]}>
              {pnlPositive ? "+" : ""}{fc(dailyPnl)}
            </Text>
            {dailyPnl > 0 && (
              <Text style={sheet.summaryNote}>Congrats, your day is profitable!</Text>
            )}
            {dailyPnl < 0 && (
              <Text style={sheet.summaryNote}>Stay disciplined. Better trades ahead.</Text>
            )}
          </View>

          {/* Win / Loss counts */}
          <View style={sheet.summaryStats}>
            <View style={sheet.statRow}>
              <Text style={sheet.statKey}>Total Trades:</Text>
              <View style={sheet.badgeBlue}>
                <Text style={sheet.badgeText}>{dayTrades.length}</Text>
              </View>
            </View>
            <View style={sheet.wlRow}>
              <View style={sheet.statRow}>
                <Text style={sheet.statKey}>Win:</Text>
                <View style={sheet.badgeGreen}>
                  <Text style={[sheet.badgeText, { color: PROFIT }]}>{wins}</Text>
                </View>
              </View>
              <View style={sheet.statRow}>
                <Text style={sheet.statKey}>Loss:</Text>
                <View style={sheet.badgeRed}>
                  <Text style={[sheet.badgeText, { color: LOSS }]}>{losses}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Trades header */}
        <View style={sheet.tradesHeader}>
          <Text style={sheet.tradesLabel}>Trades</Text>
          {!isLoading && dayTrades.length > 0 && (
            <Text style={sheet.tradesCount}>{dayTrades.length}</Text>
          )}
        </View>

        {/* Trades list */}
        <ScrollView
          style={sheet.tradesList}
          showsVerticalScrollIndicator={false}
        >
          <View style={sheet.tradesCard}>
            {isLoading && (
              <View style={sheet.loadingRow}>
                <ActivityIndicator size="small" color={TEXT_MUT} />
                <Text style={sheet.loadingText}>Loading trades…</Text>
              </View>
            )}

            {!isLoading && dayTrades.length === 0 && (
              <View style={sheet.emptyTrades}>
                <Text style={sheet.emptyText}>No trades for this day.</Text>
              </View>
            )}

            {!isLoading && dayTrades.map((trade, idx) => {
              const isLast    = idx === dayTrades.length - 1;
              const pnl       = trade.pnl ?? 0;
              const isWin     = pnl >= 0;
              const pnlColor  = isWin ? PROFIT : LOSS;
              const sideColor = trade.side === "long" ? PROFIT : LOSS;
              const entryPrice = (trade.entryPrice ?? 0).toFixed(
                (trade.entryPrice ?? 0) < 1 ? 4 : 2,
              );
              const exitPrice  = trade.exitPrice != null
                ? trade.exitPrice.toFixed(trade.exitPrice < 1 ? 4 : 2)
                : "—";
              const dateStr = trade.entryDate
                ? new Date(trade.entryDate).toLocaleDateString(undefined, {
                    month: "short",
                    day:   "numeric",
                  })
                : "";

              return (
                <View
                  key={trade.id}
                  style={[sheet.tradeRow, !isLast && sheet.tradeRowBorder]}
                >
                  {/* Row 1: Symbol + side | PnL */}
                  <View style={sheet.tradeMain}>
                    <View style={sheet.tradeLeft}>
                      <Text style={sheet.tradeSymbol}>{trade.symbol}</Text>
                      <Text style={[sheet.tradeSide, { color: sideColor }]}>
                        {trade.side === "long" ? "LONG" : "SHORT"}
                      </Text>
                    </View>
                    <Text style={[sheet.tradePnl, { color: pnlColor }]}>
                      {isWin ? "+" : ""}{fc(pnl)}
                    </Text>
                  </View>

                  {/* Row 2: Entry → Exit | Date */}
                  <View style={sheet.tradeSub}>
                    <Text style={sheet.tradePrice}>
                      {entryPrice} → {exitPrice}
                    </Text>
                    <Text style={sheet.tradeDate}>{dateStr}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// CalendarPage — main screen component
// ─────────────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  // ── State — matches web useState declarations exactly ────────────────────
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fc      = useCurrencyFormatter();
  const { theme } = useTheme();
  const isLight   = theme === "light";
  const insets    = useSafeAreaInsets();

  // Grid container width — measured via onLayout to compute square cell size
  const [gridWidth, setGridWidth] = useState(0);
  const handleGridLayout = useCallback((e: LayoutChangeEvent) => {
    setGridWidth(e.nativeEvent.layout.width);
  }, []);

  // cellSize: fits 7 cells + 6 gaps + week column
  const cellSize = gridWidth > 0
    ? Math.floor((gridWidth - WEEK_COL_W - 6 * CELL_GAP) / 7)
    : 44;

  // ── Derived date values — mirrors web exactly ────────────────────────────
  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;   // 1-based, same as web

  const { data: heatmap, isLoading } = useGetCalendarHeatmap({ year, month });

  // ── Navigation — mirrors web prevMonth / nextMonth exactly ───────────────
  const prevMonth = useCallback(
    () => setCurrentDate(new Date(year, month - 2, 1)),
    [year, month],
  );
  const nextMonth = useCallback(
    () => setCurrentDate(new Date(year, month, 1)),
    [year, month],
  );

  // ── Calendar geometry — mirrors web exactly ──────────────────────────────
  const daysInMonth     = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();

  // ── dayMap — mirrors web useMemo exactly ─────────────────────────────────
  const dayMap = useMemo(() => {
    const m: Record<string, { pnl: number; trades: number }> = {};
    (heatmap ?? []).forEach((d: CalendarDay) => {
      m[d.date.slice(0, 10)] = { pnl: d.pnl, trades: d.trades };
    });
    return m;
  }, [heatmap]);

  // ── maxAbs — mirrors web useMemo exactly ─────────────────────────────────
  const maxAbs = useMemo(
    () => Math.max(...Object.values(dayMap).map(d => Math.abs(d.pnl)), 1),
    [dayMap],
  );

  // ── monthSummary — mirrors web useMemo exactly ───────────────────────────
  const monthSummary = useMemo(() => {
    const entries     = Object.values(dayMap).filter(d => d.trades > 0);
    const totalPnl    = entries.reduce((s, d) => s + d.pnl, 0);
    const totalTrades = entries.reduce((s, d) => s + d.trades, 0);
    const winDays     = entries.filter(d => d.pnl > 0).length;
    const lossDays    = entries.filter(d => d.pnl < 0).length;
    const tradingDays = entries.length;
    const winRate     = tradingDays > 0 ? (winDays / tradingDays) * 100 : 0;
    return { totalPnl, totalTrades, winDays, lossDays, tradingDays, winRate };
  }, [dayMap]);

  // ── calendarCells — mirrors web useMemo exactly ──────────────────────────
  const calendarCells = useMemo(() => {
    const cells: Array<
      null | { day: number; date: string; data: { pnl: number; trades: number } }
    > = [];
    for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      cells.push({
        day:  i,
        date: dateStr,
        data: dayMap[dateStr] || { pnl: 0, trades: 0 },
      });
    }
    return cells;
  }, [year, month, daysInMonth, firstDayOfMonth, dayMap]);

  // ── weeklyRows — mirrors web useMemo exactly ─────────────────────────────
  const weeklyRows = useMemo(() => {
    const rows: Array<typeof calendarCells> = [];
    let row: typeof calendarCells = [];
    calendarCells.forEach((cell, i) => {
      row.push(cell);
      if ((i + 1) % 7 === 0) {
        rows.push(row);
        row = [];
      }
    });
    if (row.length > 0) rows.push(row);
    return rows;
  }, [calendarCells]);

  // ── Derived display values — mirrors web exactly ──────────────────────────
  const monthName = currentDate.toLocaleString("default", {
    month: "long",
    year:  "numeric",
  });
  const isCurrentMonth =
    new Date().getMonth() === currentDate.getMonth() &&
    new Date().getFullYear() === currentDate.getFullYear();
  const todayStr = new Date().toISOString().slice(0, 10);

  // ── Legend swatches — mirrors web profitSwatches / lossSwatches exactly ──
  const profitSwatches: string[] = isLight
    ? [0.10, 0.18, 0.24, 0.30, 0.40].map(op => `rgba(22,163,74,${op})`)
    : [0.15, 0.3,  0.5,  0.7,  0.9 ].map(op => `rgba(52,211,153,${op})`);

  const lossSwatches: string[] = isLight
    ? [0.10, 0.16, 0.22, 0.28, 0.36].map(op => `rgba(220,38,38,${op})`)
    : [0.15, 0.3,  0.5,  0.7,  0.9 ].map(op => `rgba(248,113,113,${op})`);

  // ── PnL compact formatter — mirrors web compact format exactly ────────────
  function fmtPnl(pnl: number): string {
    const sign = pnl >= 0 ? "+" : "";
    return Math.abs(pnl) >= 1000
      ? `${sign}$${(Math.abs(pnl) / 1000).toFixed(1)}k`
      : `${sign}$${Math.abs(pnl).toFixed(0)}`;
  }

  // ── Day press handler ─────────────────────────────────────────────────────
  const handleDayPress = useCallback((date: string) => {
    setSelectedDate(date);
    setSheetOpen(true);
  }, []);

  // ── Theme-dependent empty cell colours (mirrors web emptyStyle) ───────────
  function emptyBg(isToday: boolean): string {
    return isToday
      ? (isLight ? "rgba(124,58,237,0.06)" : "rgba(183,255,90,0.07)")
      : (isLight ? "rgba(0,0,0,0.02)"       : "rgba(255,255,255,0.025)");
  }
  function emptyBorder(isToday: boolean): string {
    return isToday
      ? (isLight ? "rgba(124,58,237,0.30)" : "rgba(183,255,90,0.28)")
      : (isLight ? "rgba(0,0,0,0.06)"      : "rgba(255,255,255,0.05)");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Page header ─────────────────────────────────────────────────── */}
        <View style={styles.pageHeader}>
          <View style={styles.titleBlock}>
            <Text style={styles.pageTitle}>Trading Calendar</Text>
            <Text style={styles.pageSubtitle}>
              Daily performance heatmap · Tap a day to inspect
            </Text>
          </View>

          {/* Month navigation — mirrors web nav buttons + month badge */}
          <View style={styles.navRow}>
            <Pressable
              onPress={prevMonth}
              style={styles.navBtn}
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={16} color={TEXT_MUT} />
            </Pressable>

            <View style={styles.monthBadge}>
              <Text style={styles.monthName}>{monthName}</Text>
            </View>

            <Pressable
              onPress={nextMonth}
              style={styles.navBtn}
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={16} color={TEXT_MUT} />
            </Pressable>
          </View>
        </View>

        {/* ── Monthly Summary Bar — mirrors web grid-cols-4 cards exactly ── */}
        <View style={styles.summaryGrid}>
          {[
            {
              label: "Month PNL",
              value: fc(monthSummary.totalPnl),
              icon:  monthSummary.totalPnl >= 0
                       ? "trending-up-outline"
                       : "trending-down-outline",
              color: monthSummary.totalPnl >= 0 ? PROFIT : LOSS,
            },
            {
              label: "Win Days",
              value: `${monthSummary.winDays} / ${monthSummary.tradingDays}`,
              icon:  "calendar-outline" as const,
              color: PROFIT,
            },
            {
              label: "Day Win Rate",
              value: `${monthSummary.winRate.toFixed(0)}%`,
              icon:  "bar-chart-outline" as const,
              color: monthSummary.winRate >= 50 ? PROFIT : LOSS,
            },
            {
              label: "Total Trades",
              value: `${monthSummary.totalTrades}`,
              icon:  "bar-chart-outline" as const,
              color: TEXT_PRI,
            },
          ].map(s => (
            <View key={s.label} style={styles.summaryCard}>
              <View style={styles.iconBox}>
                <Ionicons
                  name={s.icon as React.ComponentProps<typeof Ionicons>["name"]}
                  size={14}
                  color={TEXT_MUT}
                />
              </View>
              <View>
                <Text style={styles.summaryLabel}>{s.label}</Text>
                <Text style={[styles.summaryValue, { color: s.color }]}>
                  {s.value}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Calendar Card ──────────────────────────────────────────────── */}
        <View style={styles.calendarCard}>

          {/* Day-of-week header row + "Week" column header */}
          <View
            style={styles.dowRow}
            onLayout={handleGridLayout}
          >
            {DAYS_OF_WEEK.map(d => (
              <View
                key={d}
                style={[styles.dowCell, { width: cellSize }]}
              >
                <Text style={styles.dowText}>{d}</Text>
              </View>
            ))}
            <View style={[styles.dowCell, { width: WEEK_COL_W }]}>
              <Text style={[styles.dowText, styles.weekHeader]}>Week</Text>
            </View>
          </View>

          {/* Loading state */}
          {isLoading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={TEXT_MUT} />
              <Text style={styles.loadingText}>Loading calendar…</Text>
            </View>
          )}

          {/* Calendar grid rows — mirrors web weeklyRows.map exactly */}
          {!isLoading && weeklyRows.map((row, rowIdx) => {
            // Weekly summary — mirrors web weekCells / weekPnl / weekTrades
            const weekCells = row.filter((c): c is NonNullable<typeof c> => c !== null);
            const weekPnl    = weekCells.reduce((s, c) => s + c.data.pnl,    0);
            const weekTrades = weekCells.reduce((s, c) => s + c.data.trades, 0);

            return (
              <View key={rowIdx} style={styles.weekRow}>

                {/* 7 day cells */}
                {Array.from({ length: 7 }).map((_, colIdx) => {
                  const cell = row[colIdx];

                  // Empty slot (padding before first day of month)
                  if (!cell) {
                    return (
                      <View
                        key={`empty-${rowIdx}-${colIdx}`}
                        style={[
                          styles.dayCell,
                          { width: cellSize, height: cellSize, borderWidth: 0, backgroundColor: "transparent" },
                        ]}
                      />
                    );
                  }

                  const isToday = isCurrentMonth && cell.date === todayStr;
                  const hasData = cell.data.trades > 0;

                  // Intensity colours — mirrors web getIntensityStyle() exactly
                  const colors = getIntensityColors(
                    cell.data.pnl,
                    cell.data.trades,
                    maxAbs,
                    isLight,
                  );
                  const bgColor     = hasData ? (colors?.bg)     : emptyBg(isToday);
                  const borderColor = hasData ? (colors?.border) : emptyBorder(isToday);

                  // Day number colour — mirrors web text className logic
                  const dayNumColor = isToday
                    ? (isLight ? "#7C3AED" : "#B7FF5A")
                    : hasData
                      ? (isLight ? "rgba(0,0,0,0.80)" : "rgba(237,240,246,0.80)")
                      : TEXT_DIM;

                  // Compact PnL — mirrors web hidden sm:block content
                  const pnlStr = hasData ? fmtPnl(cell.data.pnl) : "";

                  return (
                    <Pressable
                      key={cell.date}
                      onPress={() => hasData && handleDayPress(cell.date)}
                      disabled={!hasData}
                      accessibilityLabel={
                        hasData
                          ? `${cell.date}: ${cell.data.trades} trade${cell.data.trades !== 1 ? "s" : ""}, PnL ${fc(cell.data.pnl)}`
                          : `${cell.date}: no trades`
                      }
                      style={({ pressed }) => [
                        styles.dayCell,
                        {
                          width:           cellSize,
                          height:          cellSize,
                          backgroundColor: bgColor   ?? "transparent",
                          borderColor:     borderColor ?? "transparent",
                          borderWidth:     1,
                          opacity:         pressed && hasData ? 0.72 : 1,
                        },
                      ]}
                    >
                      {/* Day number */}
                      <Text style={[styles.dayNum, { color: dayNumColor }]}>
                        {cell.day}
                      </Text>

                      {/* PnL + trades — mirrors web hidden sm:block block */}
                      {hasData && (
                        <View style={styles.dayPnlBlock}>
                          <Text
                            style={[
                              styles.dayPnl,
                              { color: cell.data.pnl >= 0 ? PROFIT : LOSS },
                            ]}
                            numberOfLines={1}
                          >
                            {pnlStr}
                          </Text>
                          <Text style={styles.dayTrades} numberOfLines={1}>
                            {cell.data.trades}t
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}

                {/* Week total column — mirrors web hidden sm:flex div exactly */}
                <View style={[styles.weekTotalCol, { width: WEEK_COL_W }]}>
                  {weekTrades > 0 ? (
                    <>
                      <Text
                        style={[
                          styles.weekPnl,
                          { color: weekPnl >= 0 ? PROFIT : LOSS },
                        ]}
                        numberOfLines={1}
                      >
                        {weekPnl >= 0 ? "+" : ""}{fc(weekPnl)}
                      </Text>
                      <Text style={styles.weekTrades} numberOfLines={1}>
                        {weekTrades}t
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.weekEmpty}>—</Text>
                  )}
                </View>

              </View>
            );
          })}

          {/* ── Legend — mirrors web flex items-center gap-4 exactly ───── */}
          <View style={styles.legend}>
            <Text style={styles.legendIntensity}>Intensity scale:</Text>

            <View style={styles.legendGroup}>
              {profitSwatches.map((color, i) => (
                <View key={i} style={[styles.swatch, { backgroundColor: color }]} />
              ))}
              <Text style={styles.legendLabel}>Profit</Text>
            </View>

            <View style={styles.legendGroup}>
              {lossSwatches.map((color, i) => (
                <View key={i} style={[styles.swatch, { backgroundColor: color }]} />
              ))}
              <Text style={styles.legendLabel}>Loss</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Day detail sheet */}
      <DayDetailSheet
        date={selectedDate ?? ""}
        dayData={selectedDate ? (dayMap[selectedDate] ?? null) : null}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: BG_PAGE,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               16,
  },

  // ── Page header ────────────────────────────────────────────────────────────
  pageHeader: {
    flexDirection:  "row",
    alignItems:     "flex-start",
    justifyContent: "space-between",
    gap:            12,
    flexWrap:       "wrap",
  },
  titleBlock: {
    flex: 1,
  },
  pageTitle: {
    fontSize:    22,
    fontWeight:  "900",
    fontFamily:  "Inter_900Black",
    color:       TEXT_PRI,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  pageSubtitle: {
    fontSize:   12,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
  },

  // ── Month navigation ───────────────────────────────────────────────────────
  navRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  navBtn: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth:     1,
    borderColor:     BORDER,
    alignItems:      "center",
    justifyContent:  "center",
  },
  monthBadge: {
    paddingHorizontal: 16,
    paddingVertical:   8,
    backgroundColor:   BG_CARD,
    borderRadius:      10,
    borderWidth:       1,
    borderColor:       BORDER,
    minWidth:          150,
    alignItems:        "center",
  },
  monthName: {
    fontSize:   13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    color:      TEXT_PRI,
  },

  // ── Monthly summary bar ────────────────────────────────────────────────────
  summaryGrid: {
    flexDirection: "row",
    gap:           8,
    flexWrap:      "wrap",
  },
  summaryCard: {
    flex:            1,
    minWidth:        140,
    flexDirection:   "row",
    alignItems:      "center",
    gap:             10,
    backgroundColor: BG_CARD,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     BORDER,
    padding:         14,
  },
  iconBox: {
    width:           30,
    height:          30,
    borderRadius:    8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth:     1,
    borderColor:     BORDER,
    alignItems:      "center",
    justifyContent:  "center",
    flexShrink:      0,
  },
  summaryLabel: {
    fontSize:      10,
    fontWeight:    "600",
    fontFamily:    "Inter_600SemiBold",
    color:         TEXT_MUT,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom:  2,
  },
  summaryValue: {
    fontSize:   15,
    fontWeight: "900",
    fontFamily: "Inter_900Black",
    lineHeight: 18,
  },

  // ── Calendar card ──────────────────────────────────────────────────────────
  calendarCard: {
    backgroundColor: BG_CARD,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     BORDER,
    padding:         14,
    gap:             8,
  },

  // ── Day-of-week header row ─────────────────────────────────────────────────
  dowRow: {
    flexDirection: "row",
    gap:           CELL_GAP,
    marginBottom:  4,
  },
  dowCell: {
    alignItems: "center",
    paddingVertical: 4,
  },
  dowText: {
    fontSize:      11,
    fontWeight:    "600",
    fontFamily:    "Inter_600SemiBold",
    color:         "rgba(148,163,184,0.50)",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    textAlign:     "center",
  },
  weekHeader: {
    textAlign: "right",
    fontSize:  10,
    color:     "rgba(148,163,184,0.40)",
  },

  // ── Loading ────────────────────────────────────────────────────────────────
  loadingBox: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            10,
    paddingVertical: 32,
  },
  loadingText: {
    fontSize:   13,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
  },

  // ── Week row (7 day cells + week total) ────────────────────────────────────
  weekRow: {
    flexDirection: "row",
    gap:           CELL_GAP,
    alignItems:    "center",
  },

  // ── Day cell ───────────────────────────────────────────────────────────────
  dayCell: {
    borderRadius:   10,
    padding:        6,
    flexDirection:  "column",
    justifyContent: "space-between",
  },
  dayNum: {
    fontSize:   11,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    lineHeight: 14,
  },
  dayPnlBlock: {
    gap: 1,
  },
  dayPnl: {
    fontSize:   10,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    lineHeight: 13,
  },
  dayTrades: {
    fontSize:   9,
    color:      "rgba(148,163,184,0.50)",
    fontFamily: "Inter_400Regular",
    lineHeight: 11,
  },

  // ── Week total column ──────────────────────────────────────────────────────
  weekTotalCol: {
    alignItems:     "flex-end",
    justifyContent: "center",
    paddingRight:   2,
  },
  weekPnl: {
    fontSize:   11,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    lineHeight: 14,
  },
  weekTrades: {
    fontSize:   9,
    color:      "rgba(148,163,184,0.50)",
    fontFamily: "Inter_400Regular",
    lineHeight: 12,
  },
  weekEmpty: {
    fontSize:   10,
    color:      "rgba(148,163,184,0.30)",
    fontFamily: "Inter_400Regular",
  },

  // ── Legend ─────────────────────────────────────────────────────────────────
  legend: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "flex-end",
    flexWrap:       "wrap",
    gap:            12,
    marginTop:      8,
    paddingTop:     12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  legendIntensity: {
    fontSize:   11,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
  },
  legendGroup: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           3,
  },
  swatch: {
    width:        14,
    height:       14,
    borderRadius: 3,
  },
  legendLabel: {
    fontSize:   10,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
    marginLeft: 2,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// DayDetailSheet styles
// ─────────────────────────────────────────────────────────────────────────────

const sheet = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  panel: {
    position:        "absolute",
    bottom:          0,
    left:            0,
    right:           0,
    height:          "85%",
    backgroundColor: "#0C0E13",
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    borderTopWidth:   1,
    borderColor:      BORDER,
    paddingTop:       12,
  },
  handle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf:       "center",
    marginBottom:    16,
  },

  // Header
  header: {
    flexDirection:    "row",
    alignItems:       "flex-start",
    justifyContent:   "space-between",
    paddingHorizontal: 20,
    paddingBottom:    16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerLabel: {
    fontSize:   14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color:      TEXT_PRI,
    marginBottom: 2,
  },
  headerDate: {
    fontSize:   12,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
  },
  closeBtn: {
    width:           30,
    height:          30,
    borderRadius:    8,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems:      "center",
    justifyContent:  "center",
  },

  // Summary
  summaryRow: {
    flexDirection:    "row",
    gap:              12,
    padding:          20,
    paddingBottom:    12,
  },
  summaryCard: {
    flex:            1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     BORDER,
    padding:         14,
  },
  summaryLabel: {
    fontSize:   11,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
    marginBottom: 4,
  },
  summaryPnl: {
    fontSize:   20,
    fontWeight: "900",
    fontFamily: "Inter_900Black",
    marginBottom: 4,
  },
  summaryNote: {
    fontSize:   11,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
  },
  summaryStats: {
    flex:            1,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     BORDER,
    padding:         14,
    gap:             8,
  },
  statRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  statKey: {
    fontSize:   12,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
  },
  wlRow: {
    flexDirection: "row",
    gap:           16,
  },
  badgeBlue: {
    backgroundColor: "rgba(59,130,246,0.15)",
    borderRadius:    6,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  badgeGreen: {
    backgroundColor: "rgba(52,211,153,0.12)",
    borderRadius:    6,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  badgeRed: {
    backgroundColor: "rgba(248,113,113,0.12)",
    borderRadius:    6,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  badgeText: {
    fontSize:   12,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
    color:      TEXT_PRI,
  },

  // Trades header
  tradesHeader: {
    flexDirection:    "row",
    alignItems:       "center",
    gap:              8,
    paddingHorizontal: 20,
    paddingBottom:    8,
  },
  tradesLabel: {
    fontSize:   14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color:      TEXT_PRI,
  },
  tradesCount: {
    fontSize:          11,
    color:             TEXT_MUT,
    fontFamily:        "Inter_400Regular",
    backgroundColor:   "rgba(255,255,255,0.06)",
    borderRadius:      6,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },

  // Trades list
  tradesList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  tradesCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     BORDER,
    overflow:        "hidden",
  },

  // Loading inside sheet
  loadingRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            10,
    padding:        24,
  },
  loadingText: {
    fontSize:   13,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
  },

  // Empty trades
  emptyTrades: {
    alignItems:     "center",
    justifyContent: "center",
    padding:        32,
  },
  emptyText: {
    fontSize:   13,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
  },

  // Trade row
  tradeRow: {
    padding: 14,
    gap:     6,
  },
  tradeRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tradeMain: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
  },
  tradeLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  tradeSymbol: {
    fontSize:   13,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color:      TEXT_PRI,
  },
  tradeSide: {
    fontSize:   10,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  tradePnl: {
    fontSize:   14,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
  },
  tradeSub: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
  },
  tradePrice: {
    fontSize:   11,
    color:      TEXT_MUT,
    fontFamily: "Inter_400Regular",
  },
  tradeDate: {
    fontSize:   11,
    color:      TEXT_DIM,
    fontFamily: "Inter_400Regular",
  },
});
