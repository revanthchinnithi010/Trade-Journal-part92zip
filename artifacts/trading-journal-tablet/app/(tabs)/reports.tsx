/**
 * app/(tabs)/reports.tsx — Performance Reports Screen
 *
 * Migration of: artifacts/trading-journal/src/pages/reports.tsx
 *
 * Web → RN replacements
 * ──────────────────────────────────────────────────────────────────────────
 *   div / span / button            → View / Text / Pressable
 *   CSS grid / flex layouts        → StyleSheet.create
 *   <table> / <tr> / <td>         → custom View rows + horizontal ScrollView
 *   recharts (BarChart, AreaChart,
 *             PieChart, RadarChart) → chart placeholder components
 *                                    (Phase 10 contract — see §Chart Abstraction)
 *   Lucide React icons             → @expo/vector-icons Ionicons
 *   AnimatedCard / PageTransition  → plain View
 *   DashboardSegmentedControl (web
 *     reads router automatically)  → fully controlled DashboardSegmentedControl
 *                                    with router.replace() navigation
 *   shimmer-loading ChartSkeleton  → Skeleton + ChartSkeleton components
 *
 * Chart Abstraction (Phase 10 contract)
 * ──────────────────────────────────────────────────────────────────────────
 * All chart rendering is deferred to Phase 10.
 * This file establishes a two-layer architecture:
 *
 *   Layer 1 — Data Builders (exported pure functions, memoized at call sites):
 *     buildEquityCurveDataset()      → AreaPoint[]
 *     buildWeeklyPnlDataset()        → BarPoint[]
 *     buildWinLossDataset()          → PieSlice[]
 *     buildSymbolPnlDataset()        → HBarPoint[]
 *     buildBrokerPerfDataset()       → BarPoint[]
 *     buildPerformanceRadarDataset() → RadarAxis[]
 *     buildRRHistogramDataset()      → BarPoint[]
 *
 *   Layer 2 — Placeholder renderers (exported, accept Phase 10 props):
 *     <EquityCurveChart>      — area chart (equity curve)
 *     <WeeklyPnlChart>        — vertical bar chart (weekly PNL)
 *     <WinLossChart>          — pie/donut chart (win/loss split)
 *     <SymbolPnlChart>        — horizontal bar chart (symbol PNL)
 *     <PerformanceRadarChart> — radar/spider chart (performance score)
 *     <BrokerPnlChart>        — vertical bar chart (broker PNL)
 *     <RRHistogramChart>      — vertical bar chart (RR distribution)
 *
 * Phase 10 replaces ONLY the render body of each placeholder.
 * No call sites, no data builders, no business logic changes.
 *
 * Business logic preserved exactly (same variable names, same math)
 * ──────────────────────────────────────────────────────────────────────────
 *   weeklyLabels     — .map(w => ({...w, label: toLocaleDateString(...)}))
 *   winLossData      — filter(d => d.value > 0) + GREEN/RED/MUTED mapping
 *   brokerPerf       — same forEach aggregation over PROVIDER_MAP
 *   derived          — expectancy formula, Kelly criterion, topSymbol/worstSymbol sorts
 *   SESSIONS         — identical static array (simulated session data)
 *   avgPnl per row   — s.pnl / s.trades
 *   All StatsSummary fields used verbatim (no aliasing)
 */

import { Ionicons } from "@expo/vector-icons";
import {
  type EquityPoint,
  type StatsSummary,
  type SymbolStat,
  type WeeklyPnlPoint,
  useGetEquityCurve,
  useGetStatsSummary,
  useGetSymbolBreakdown,
  useGetWeeklyPnl,
} from "@workspace/api-client-react";
import { router } from "expo-router";
import React, { memo, useCallback, useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DashboardSegmentedControl from "@/components/DashboardSegmentedControl";
import { Skeleton } from "@/components/ui/skeleton";
import { PROVIDER_MAP } from "@/data/sampleData";
import {
  useCurrencyAxisFormatter,
  useCurrencyFormatter,
} from "@/store/currencyStore";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (dark theme — matches calendar.tsx / index.tsx)
// ─────────────────────────────────────────────────────────────────────────────

const BG_CARD  = "rgba(12,14,19,0.97)";
const BORDER   = "rgba(255,255,255,0.08)";
const TEXT_PRI = "#EDF0F6";
const TEXT_MUT = "rgba(148,163,184,0.60)";
const TEXT_DIM = "rgba(148,163,184,0.40)";

// ─────────────────────────────────────────────────────────────────────────────
// Chart color palette — verbatim from web reports.tsx
// ─────────────────────────────────────────────────────────────────────────────

const GREEN  = "hsl(145, 58%, 52%)";   // profitable
const RED    = "hsl(0, 68%, 58%)";     // loss
const PURPLE = "hsl(161, 72%, 42%)";   // primary accent
const BLUE   = "hsl(210, 80%, 62%)";   // secondary accent
const ORANGE = "hsl(32, 85%, 58%)";    // tertiary accent
const MUTED  = "hsl(128, 8%, 38%)";    // breakeven / neutral

// ─────────────────────────────────────────────────────────────────────────────
// Static data — verbatim from web reports.tsx
// ─────────────────────────────────────────────────────────────────────────────

/** Trading session performance — static simulation, same as web source */
const SESSIONS = [
  { session: "Asia",   trades: 6,  winRate: 66.7, pnl: 1240 },
  { session: "London", trades: 14, winRate: 85.7, pnl: 6850 },
  { session: "NY AM",  trades: 12, winRate: 83.3, pnl: 5420 },
  { session: "NY PM",  trades: 6,  winRate: 66.7, pnl: 1655 },
];

const SEGMENT_OPTIONS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "reports",   label: "Reports"   },
];

// ─────────────────────────────────────────────────────────────────────────────
// ── Phase 10 chart contract types ────────────────────────────────────────────
// These interfaces define the exact props each chart placeholder accepts.
// Phase 10 replaces the render body but the props are locked.
// ─────────────────────────────────────────────────────────────────────────────

/** A single point on a time-series area chart (equity curve) */
export interface AreaPoint {
  /** ISO date string "YYYY-MM-DD" — x-axis label */
  date:  string;
  /** Y-axis value in USD */
  value: number;
}

/** A single bar in a vertical or horizontal bar chart */
export interface BarPoint {
  /** X-axis / category label */
  label: string;
  /** Bar value */
  value: number;
  /** Pre-computed fill color — Phase 10 must honor this */
  color: string;
}

/** Horizontal bar chart point — same shape as BarPoint, different semantic */
export type HBarPoint = BarPoint;

/** A single slice in a pie / donut chart */
export interface PieSlice {
  name:  string;
  value: number;
  color: string;
}

/** A single axis on a radar / spider chart */
export interface RadarAxis {
  metric: string;
  score:  number;
}

// ── Per-chart prop shapes (Phase 10 contract) ─────────────────────────────────

export interface EquityCurveChartProps {
  data:          AreaPoint[];
  color:         string;
  /** Full currency formatter — used for tooltip values */
  formatter:     (v: number) => string;
  /** Compact formatter — used for axis ticks */
  axisFormatter: (v: number) => string;
  height?:       number;
}

export interface WeeklyPnlChartProps {
  data:          BarPoint[];
  formatter:     (v: number) => string;
  axisFormatter: (v: number) => string;
  /** Y value of the zero crossing reference line */
  referenceY:    number;
  height?:       number;
}

export interface WinLossChartProps {
  data:         PieSlice[];
  innerRadius?: number;
  outerRadius?: number;
  height?:      number;
}

export interface SymbolPnlChartProps {
  data:          HBarPoint[];
  formatter:     (v: number) => string;
  axisFormatter: (v: number) => string;
  /** X value of the zero crossing reference line */
  referenceX:    number;
  height?:       number;
}

export interface PerformanceRadarChartProps {
  data:    RadarAxis[];
  color:   string;
  height?: number;
}

export interface BrokerPnlChartProps {
  data:          BarPoint[];
  formatter:     (v: number) => string;
  axisFormatter: (v: number) => string;
  height?:       number;
}

export interface RRHistogramChartProps {
  data:    BarPoint[];
  height?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Chart data builders ───────────────────────────────────────────────────────
// Pure functions — no React, no hooks, no side-effects.
// Business logic lives here; renderers receive only the computed arrays.
// ─────────────────────────────────────────────────────────────────────────────

/** Equity curve API data → AreaPoint[] */
export function buildEquityCurveDataset(equity: EquityPoint[]): AreaPoint[] {
  return equity.map(e => ({ date: e.date, value: e.equity }));
}

/**
 * Pre-labelled weekly PNL entries (with human-readable `.label` added by the
 * `weeklyLabels` useMemo in the component) → BarPoint[].
 * Bar colors follow the same conditional as the web Cell elements.
 */
export function buildWeeklyPnlDataset(
  weeklyLabels: Array<WeeklyPnlPoint & { label: string }>,
): BarPoint[] {
  return weeklyLabels.map(w => ({
    label: w.label,
    value: w.pnl,
    color: w.pnl >= 0 ? GREEN : RED,
  }));
}

/** Stats summary → PieSlice[] for the win/loss donut — same filter as web */
export function buildWinLossDataset(stats: StatsSummary): PieSlice[] {
  return [
    { name: "Wins",      value: stats.winCount,      color: GREEN },
    { name: "Losses",    value: stats.lossCount,      color: RED   },
    { name: "Breakeven", value: stats.breakevenCount, color: MUTED },
  ].filter(d => d.value > 0);
}

/** SymbolStat[] → HBarPoint[] for the horizontal symbol PNL chart */
export function buildSymbolPnlDataset(symbolStats: SymbolStat[]): HBarPoint[] {
  return symbolStats.map(s => ({
    label: s.symbol,
    value: s.pnl,
    color: s.pnl >= 0 ? GREEN : RED,
  }));
}

/**
 * SymbolStat[] → BarPoint[] for the RR distribution histogram.
 * Uses the same `winRate / 25` proxy as the web RRHistogram component.
 */
export function buildRRHistogramDataset(symbolStats: SymbolStat[]): BarPoint[] {
  const bins: BarPoint[] = [
    { label: "0–1R", value: 0, color: RED    },
    { label: "1–2R", value: 0, color: ORANGE },
    { label: "2–3R", value: 0, color: PURPLE },
    { label: "3–4R", value: 0, color: GREEN  },
    { label: "4R+",  value: 0, color: BLUE   },
  ];
  symbolStats.forEach(s => {
    const rr = s.winRate / 25;
    if      (rr < 1) bins[0]!.value += s.trades;
    else if (rr < 2) bins[1]!.value += s.trades;
    else if (rr < 3) bins[2]!.value += s.trades;
    else if (rr < 4) bins[3]!.value += s.trades;
    else             bins[4]!.value += s.trades;
  });
  return bins;
}

/**
 * Stats summary → RadarAxis[] — same formula as PerformanceRadar in web.
 * Math.min clamps each score to 0–100.
 */
export function buildPerformanceRadarDataset(stats: StatsSummary): RadarAxis[] {
  return [
    { metric: "Win Rate",      score: Math.min(stats.winRate, 100) },
    { metric: "Profit Factor", score: Math.min(stats.profitFactor * 20, 100) },
    { metric: "Avg RR",        score: Math.min(stats.averageRR * 25, 100) },
    { metric: "Consistency",   score: Math.min((stats.winCount / Math.max(stats.totalTrades, 1)) * 110, 100) },
    {
      metric: "Risk Mgmt",
      score: stats.averageLoss > 0
        ? Math.min(100 - (stats.averageLoss / Math.max(stats.averageWin, 1)) * 50, 100)
        : 70,
    },
    { metric: "Volume", score: Math.min(stats.totalTrades * 2.5, 100) },
  ];
}

/**
 * Broker performance aggregation → BarPoint[] for the broker PNL bar chart.
 * Pure function equivalent of the `brokerPerf` useMemo in the component.
 */
export function buildBrokerPerfDataset(
  symbolStats: SymbolStat[],
  providerMap:  Record<string, string>,
): BarPoint[] {
  const map: Record<string, { pnl: number; trades: number }> = {
    "Delta Exchange": { pnl: 0, trades: 0 },
    "FusionMarkets":  { pnl: 0, trades: 0 },
  };
  symbolStats.forEach(s => {
    const provider = providerMap[s.symbol];
    const key = provider === "Delta Exchange" ? "Delta Exchange" : "FusionMarkets";
    const entry = map[key];
    if (entry) {
      entry.pnl    += s.pnl;
      entry.trades += s.trades;
    }
  });
  const colors = [PURPLE, BLUE, ORANGE] as string[];
  return Object.entries(map)
    .filter(([, v]) => v.trades > 0)
    .map(([name, v], i) => ({
      label: name,
      value: Math.round(v.pnl * 100) / 100,
      color: colors[i] ?? ORANGE,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Chart placeholder renderers ───────────────────────────────────────────────
// Phase 10 replaces the body of each exported component below.
// All call sites, props, and data builders remain unchanged in Phase 10.
// ─────────────────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

/** Internal skeleton shell shared by all chart placeholders */
function ChartSkeletonPlaceholder({
  height = 190,
  iconName = "bar-chart-outline" as IoniconName,
  summary,
}: {
  height?:   number;
  iconName?: IoniconName;
  summary?:  string;
}) {
  return (
    <View style={[cs.wrapper, { height }]}>
      <Ionicons name={iconName} size={24} color="rgba(148,163,184,0.18)" />
      <Text style={cs.phaseLabel}>Phase 10 chart</Text>
      {summary ? <Text style={cs.summary}>{summary}</Text> : null}
    </View>
  );
}

/** Equity curve (area chart) — Phase 10 contract */
export const EquityCurveChart = memo(function EquityCurveChart({
  data, formatter, height = 190,
}: EquityCurveChartProps) {
  const latest = data[data.length - 1];
  return (
    <ChartSkeletonPlaceholder
      height={height}
      iconName="trending-up-outline"
      summary={latest ? formatter(latest.value) : undefined}
    />
  );
});

/** Weekly PNL (vertical bar chart) — Phase 10 contract */
export const WeeklyPnlChart = memo(function WeeklyPnlChart({
  data, formatter, height = 190,
}: WeeklyPnlChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <ChartSkeletonPlaceholder
      height={height}
      iconName="bar-chart-outline"
      summary={formatter(total)}
    />
  );
});

/** Win / Loss split (donut chart) — Phase 10 contract */
export const WinLossChart = memo(function WinLossChart({
  data, height = 165,
}: WinLossChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <ChartSkeletonPlaceholder
      height={height}
      iconName="pie-chart-outline"
      summary={`${total} trades`}
    />
  );
});

/** Symbol PNL (horizontal bar chart) — Phase 10 contract */
export const SymbolPnlChart = memo(function SymbolPnlChart({
  data, height = 190,
}: SymbolPnlChartProps) {
  return (
    <ChartSkeletonPlaceholder
      height={height}
      iconName="bar-chart-outline"
      summary={`${data.length} symbols`}
    />
  );
});

/** Performance score (radar / spider chart) — Phase 10 contract */
export const PerformanceRadarChart = memo(function PerformanceRadarChart({
  data, height = 200,
}: PerformanceRadarChartProps) {
  const avg = data.length > 0
    ? data.reduce((sum, d) => sum + d.score, 0) / data.length
    : 0;
  return (
    <ChartSkeletonPlaceholder
      height={height}
      iconName="radio-button-on-outline"
      summary={`${avg.toFixed(0)}% avg score`}
    />
  );
});

/** Broker PNL (vertical bar chart) — Phase 10 contract */
export const BrokerPnlChart = memo(function BrokerPnlChart({
  data, height = 190,
}: BrokerPnlChartProps) {
  return (
    <ChartSkeletonPlaceholder
      height={height}
      iconName="bar-chart-outline"
      summary={`${data.length} broker${data.length !== 1 ? "s" : ""}`}
    />
  );
});

/** RR distribution (vertical bar chart) — Phase 10 contract */
export const RRHistogramChart = memo(function RRHistogramChart({
  data, height = 200,
}: RRHistogramChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <ChartSkeletonPlaceholder
      height={height}
      iconName="bar-chart-outline"
      summary={`${total} trades`}
    />
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ── ProviderBadge ─────────────────────────────────────────────────────────────
// Mirrors web ProviderBadge — Delta Exchange vs cTrader visual identity
// ─────────────────────────────────────────────────────────────────────────────

const ProviderBadge = memo(function ProviderBadge({ symbol }: { symbol: string }) {
  const provider = PROVIDER_MAP[symbol];
  if (!provider) return null;
  const isDelta = provider === "Delta Exchange";
  return (
    <View style={[pb.badge, isDelta ? pb.badgeDelta : pb.badgeCtrader]}>
      <Text style={[pb.label, isDelta ? pb.labelDelta : pb.labelCtrader]}>
        {isDelta ? "Δ Delta" : "⊕ cTrader"}
      </Text>
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ── MetricCard ────────────────────────────────────────────────────────────────
// Mirrors web MetricCard exactly:
//   • card shell (label + icon) always renders — even during loading
//   • value + sub swap to Skeleton placeholders when loading = true
//   • bar renders a progress bar; gradient thresholds: ≥60% green, ≥50% amber
// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label:       string;
  value:       string;
  sub?:        string;
  iconName:    IoniconName;
  valueColor?: string;
  iconBg?:     string;
  iconColor?:  string;
  bar?:        number;
  index?:      number;
  loading?:    boolean;
}

const MetricCard = memo(function MetricCard({
  label, value, sub, iconName, valueColor, iconBg, iconColor, bar, loading = false,
}: MetricCardProps) {
  const barPct  = Math.min(bar ?? 0, 100);
  const barColor =
    barPct >= 60 ? GREEN :
    barPct >= 50 ? "#F59E0B" :
    RED;

  return (
    <View style={mc.card}>
      {/* Header row: label + icon (always rendered) */}
      <View style={mc.headerRow}>
        <Text style={mc.label}>{label}</Text>
        <View style={[mc.iconWrap, iconBg ? { backgroundColor: iconBg } : null]}>
          <Ionicons
            name={iconName}
            size={13}
            color={iconColor ?? "rgba(148,163,184,0.60)"}
          />
        </View>
      </View>

      {/* Value region — skeleton while loading */}
      {loading ? (
        <Skeleton style={mc.valueSkeleton} />
      ) : (
        <Text style={[mc.value, valueColor ? { color: valueColor } : null]}>
          {value}
        </Text>
      )}

      {/* Progress bar (optional) — hidden while loading */}
      {!loading && bar !== undefined && (
        <View style={mc.barTrack}>
          <View
            style={[mc.barFill, {
              width:           `${barPct}%`,
              backgroundColor: barColor,
            }]}
          />
        </View>
      )}

      {/* Sub-label — skeleton while loading */}
      {loading ? (
        <Skeleton style={mc.subSkeleton} />
      ) : (
        sub ? <Text style={mc.sub}>{sub}</Text> : null
      )}
    </View>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ── Reports ───────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

export default function Reports() {
  const insets = useSafeAreaInsets();

  // ── API data ─────────────────────────────────────────────────────────────
  // Mirrors web hook calls exactly — same hooks, same destructuring pattern.
  const { data: stats }       = useGetStatsSummary();
  const { data: symbolStats } = useGetSymbolBreakdown();
  const { data: equity }      = useGetEquityCurve();
  const { data: weeklyPnl }   = useGetWeeklyPnl();

  const hasStats  = !!stats;
  const hasSymbol = !!symbolStats;

  // ── Currency formatters ───────────────────────────────────────────────────
  const fc            = useCurrencyFormatter();
  const axisFormatter = useCurrencyAxisFormatter();

  // ── weeklyLabels — verbatim from web ─────────────────────────────────────
  const weeklyLabels = useMemo(() =>
    (weeklyPnl ?? []).map((w: WeeklyPnlPoint) => ({
      ...w,
      label: new Date(w.week).toLocaleDateString("en-US", {
        month: "short", day: "numeric",
      }),
    })),
  [weeklyPnl]);

  // ── winLossData — verbatim from web ──────────────────────────────────────
  const winLossData = useMemo((): PieSlice[] => {
    if (!stats) return [];
    return [
      { name: "Wins",      value: stats.winCount,       color: GREEN },
      { name: "Losses",    value: stats.lossCount,       color: RED   },
      { name: "Breakeven", value: stats.breakevenCount,  color: MUTED },
    ].filter(d => d.value > 0);
  }, [stats]);

  // ── brokerPerf — verbatim from web ───────────────────────────────────────
  const brokerPerf = useMemo(() => {
    if (!symbolStats) return [];
    const map: Record<string, { pnl: number; trades: number; wins: number }> = {
      "Delta Exchange": { pnl: 0, trades: 0, wins: 0 },
      "FusionMarkets":  { pnl: 0, trades: 0, wins: 0 },
    };
    symbolStats.forEach((s: SymbolStat) => {
      const provider = PROVIDER_MAP[s.symbol];
      const key = provider === "Delta Exchange" ? "Delta Exchange" : "FusionMarkets";
      const entry = map[key];
      if (entry) {
        entry.pnl    += s.pnl;
        entry.trades += s.trades;
        entry.wins   += Math.round(s.trades * s.winRate / 100);
      }
    });
    return Object.entries(map)
      .filter(([, v]) => v.trades > 0)
      .map(([name, v]) => ({
        name,
        pnl:     Math.round(v.pnl * 100) / 100,
        trades:  v.trades,
        winRate: v.trades > 0 ? Math.round((v.wins / v.trades) * 100) : 0,
      }));
  }, [symbolStats]);

  // ── derived — verbatim from web ──────────────────────────────────────────
  // Expectancy formula: E[R] = P(win)×avgWin − P(loss)×avgLoss
  // Kelly criterion:    K%   = P(win) − P(loss)/(avgWin/avgLoss)
  const derived = useMemo(() => {
    if (!stats) {
      return {
        expectancy:   0,
        kellyCrit:    0,
        topSymbol:    undefined as SymbolStat | undefined,
        worstSymbol:  undefined as SymbolStat | undefined,
      };
    }
    const expectancy = (stats.winRate / 100) * stats.averageWin
      - (1 - stats.winRate / 100) * stats.averageLoss;
    const kellyCrit = stats.averageLoss > 0
      ? ((stats.winRate / 100)
          - (1 - stats.winRate / 100) / (stats.averageWin / stats.averageLoss)) * 100
      : 0;
    const topSymbol   = symbolStats ? [...symbolStats].sort((a, b) => b.pnl - a.pnl)[0] : undefined;
    const worstSymbol = symbolStats ? [...symbolStats].sort((a, b) => a.pnl - b.pnl)[0] : undefined;
    return { expectancy, kellyCrit, topSymbol, worstSymbol };
  }, [stats, symbolStats]);

  // ── Chart datasets (Phase 10 layer) ──────────────────────────────────────
  // Each is memoized independently so only the affected chart re-derives data
  // when its input changes. Datasets are computed from the same raw API data
  // (or from the business-layer memos above) via the exported builder functions.

  const equityChartData  = useMemo(
    () => (equity ? buildEquityCurveDataset(equity) : []),
    [equity],
  );
  const weeklyChartData  = useMemo(
    () => buildWeeklyPnlDataset(weeklyLabels),
    [weeklyLabels],
  );
  // winLossData already matches PieSlice[] shape — no builder needed
  const winLossChartData = winLossData;
  const symbolChartData  = useMemo(
    () => (symbolStats ? buildSymbolPnlDataset(symbolStats) : []),
    [symbolStats],
  );
  const radarChartData   = useMemo(
    () => (stats ? buildPerformanceRadarDataset(stats) : []),
    [stats],
  );
  const rrHistChartData  = useMemo(
    () => (symbolStats ? buildRRHistogramDataset(symbolStats) : []),
    [symbolStats],
  );
  // Broker chart data sourced from business layer memo to avoid double-scan
  const brokerChartData  = useMemo(
    () => brokerPerf.map((b, i) => ({
      label: b.name,
      value: b.pnl,
      color: ([PURPLE, BLUE, ORANGE] as string[])[i] ?? ORANGE,
    })),
    [brokerPerf],
  );

  // ── Segmented control navigation ─────────────────────────────────────────
  // "Dashboard" taps navigate back to the index tab via router.replace.
  const handleSegmentChange = useCallback((v: string) => {
    if (v === "dashboard") router.replace("/");
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 16 }]}
      showsVerticalScrollIndicator={false}
    >

      {/* ── Segmented control — Dashboard / Reports ─────────────────────── */}
      <DashboardSegmentedControl
        value="reports"
        options={SEGMENT_OPTIONS}
        onValueChange={handleSegmentChange}
      />

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <View style={s.headerRow}>
        <View style={s.headerText}>
          <Text style={s.headerTitle}>Performance Reports</Text>
          <Text style={s.headerSub}>
            Deep-dive analytics across all brokers and asset classes
          </Text>
        </View>
        <View style={s.liveChip}>
          <View style={s.liveDot} />
          <Text style={s.liveText}>
            Live data · {hasStats ? stats.totalTrades : "…"} trades
          </Text>
        </View>
      </View>

      {/* ── Top-level stat cards (8-up grid) ─────────────────────────────── */}
      <View style={s.grid2}>
        <MetricCard
          index={0} loading={!hasStats}
          label="Net PNL"
          value={hasStats ? fc(stats.netPnl) : ""}
          sub="All-time realized"
          iconName={hasStats && stats.netPnl < 0 ? "trending-down" : "trending-up"}
          valueColor={hasStats ? (stats.netPnl >= 0 ? GREEN : RED) : undefined}
          iconBg={hasStats ? (stats.netPnl >= 0 ? "rgba(52,211,153,0.10)" : "rgba(248,113,113,0.10)") : undefined}
          iconColor={hasStats ? (stats.netPnl >= 0 ? GREEN : RED) : undefined}
        />
        <MetricCard
          index={1} loading={!hasStats}
          label="Win Rate"
          value={hasStats ? `${stats.winRate.toFixed(1)}%` : ""}
          sub={hasStats ? `${stats.winCount}W · ${stats.lossCount}L · ${stats.breakevenCount}BE` : ""}
          iconName="stats-chart-outline"
          bar={hasStats ? stats.winRate : undefined}
          valueColor={
            hasStats
              ? (stats.winRate >= 60 ? GREEN : stats.winRate >= 50 ? TEXT_PRI : RED)
              : undefined
          }
        />
        <MetricCard
          index={2} loading={!hasStats}
          label="Profit Factor"
          value={hasStats ? stats.profitFactor.toFixed(2) : ""}
          sub="Gross wins / gross losses"
          iconName="shield-outline"
          valueColor={
            hasStats
              ? (stats.profitFactor >= 2 ? GREEN : stats.profitFactor >= 1 ? TEXT_PRI : RED)
              : undefined
          }
          iconBg="rgba(52,211,153,0.10)"
          iconColor={GREEN}
        />
        <MetricCard
          index={3} loading={!hasStats}
          label="Avg RR"
          value={hasStats ? `${stats.averageRR.toFixed(2)}R` : ""}
          sub="Reward / risk ratio"
          iconName="radio-button-on-outline"
          valueColor={hasStats ? (stats.averageRR >= 2 ? GREEN : TEXT_PRI) : undefined}
        />
        <MetricCard
          index={4} loading={!hasStats}
          label="Avg Win"
          value={hasStats ? fc(stats.averageWin) : ""}
          sub="Per winning trade"
          iconName="arrow-up-outline"
          valueColor={GREEN}
          iconBg="rgba(52,211,153,0.10)"
          iconColor={GREEN}
        />
        <MetricCard
          index={5} loading={!hasStats}
          label="Avg Loss"
          value={hasStats ? fc(stats.averageLoss) : ""}
          sub="Per losing trade"
          iconName="arrow-down-outline"
          valueColor={RED}
          iconBg="rgba(248,113,113,0.10)"
          iconColor={RED}
        />
        <MetricCard
          index={6} loading={!hasStats}
          label="Expectancy"
          value={hasStats ? fc(derived.expectancy) : ""}
          sub="Per trade expected"
          iconName="flash-outline"
          valueColor={derived.expectancy >= 0 ? GREEN : RED}
        />
        <MetricCard
          index={7} loading={!hasStats}
          label="Kelly %"
          value={hasStats ? `${derived.kellyCrit.toFixed(1)}%` : ""}
          sub="Optimal position size"
          iconName="ribbon-outline"
          valueColor={TEXT_PRI}
        />
      </View>

      {/* ── Equity Curve ─────────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardIconWrap}>
            <Ionicons name="pulse-outline" size={14} color={PURPLE} />
          </View>
          <Text style={s.cardTitle}>Equity Curve</Text>
          {equity && equity.length > 0 && (
            <View style={[
              s.pill,
              equity[equity.length - 1]!.equity >= equity[0]!.equity
                ? s.pillGreen : s.pillRed,
            ]}>
              <Text style={[
                s.pillText,
                equity[equity.length - 1]!.equity >= equity[0]!.equity
                  ? s.pillTextGreen : s.pillTextRed,
              ]}>
                {fc(equity[equity.length - 1]!.equity)}
              </Text>
            </View>
          )}
        </View>
        {equity ? (
          <EquityCurveChart
            data={equityChartData}
            color={PURPLE}
            formatter={fc}
            axisFormatter={axisFormatter}
            height={190}
          />
        ) : (
          <Skeleton style={s.chartSkeleton} />
        )}
      </View>

      {/* ── Win / Loss Split ─────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardIconWrap}>
            <Ionicons name="flame-outline" size={14} color={PURPLE} />
          </View>
          <Text style={s.cardTitle}>Win / Loss Split</Text>
        </View>
        {hasStats ? (
          <>
            <WinLossChart
              data={winLossChartData}
              innerRadius={50}
              outerRadius={72}
              height={165}
            />
            {/* Summary row — mirrors web Win/Loss card footer */}
            <View style={s.wlRow}>
              <View style={s.wlCell}>
                <Text style={[s.wlValue, { color: GREEN }]}>{stats.winCount}</Text>
                <Text style={s.wlLabel}>Wins</Text>
              </View>
              <View style={s.wlDivider} />
              <View style={s.wlCell}>
                <Text style={[s.wlValue, { color: RED }]}>{stats.lossCount}</Text>
                <Text style={s.wlLabel}>Losses</Text>
              </View>
              <View style={s.wlDivider} />
              <View style={s.wlCell}>
                <Text style={[s.wlValue, { color: TEXT_PRI }]}>
                  {stats.largestWin > 0 ? fc(stats.largestWin) : "—"}
                </Text>
                <Text style={s.wlLabel}>Best</Text>
              </View>
            </View>
          </>
        ) : (
          <Skeleton style={[s.chartSkeleton, { height: 165 }]} />
        )}
      </View>

      {/* ── Weekly PNL ───────────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardIconWrap}>
            <Ionicons name="bar-chart-outline" size={14} color={PURPLE} />
          </View>
          <Text style={s.cardTitle}>Weekly PNL</Text>
        </View>
        {weeklyPnl ? (
          <WeeklyPnlChart
            data={weeklyChartData}
            formatter={fc}
            axisFormatter={axisFormatter}
            referenceY={0}
            height={190}
          />
        ) : (
          <Skeleton style={s.chartSkeleton} />
        )}
      </View>

      {/* ── Symbol PNL ───────────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardIconWrap}>
            <Ionicons name="layers-outline" size={14} color={PURPLE} />
          </View>
          <Text style={s.cardTitle}>Symbol PNL</Text>
        </View>
        {hasSymbol ? (
          <SymbolPnlChart
            data={symbolChartData}
            formatter={fc}
            axisFormatter={axisFormatter}
            referenceX={0}
            height={190}
          />
        ) : (
          <Skeleton style={s.chartSkeleton} />
        )}
      </View>

      {/* ── Performance Score ─────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardIconWrap}>
            <Ionicons name="pulse-outline" size={14} color={PURPLE} />
          </View>
          <Text style={s.cardTitle}>Performance Score</Text>
        </View>
        {hasStats ? (
          <PerformanceRadarChart
            data={radarChartData}
            color={PURPLE}
            height={200}
          />
        ) : (
          <Skeleton style={[s.chartSkeleton, { height: 200 }]} />
        )}
      </View>

      {/* ── RR Distribution ──────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardIconWrap}>
            <Ionicons name="radio-button-on-outline" size={14} color={PURPLE} />
          </View>
          <Text style={s.cardTitle}>RR Distribution</Text>
        </View>
        {hasSymbol ? (
          <RRHistogramChart data={rrHistChartData} height={200} />
        ) : (
          <Skeleton style={[s.chartSkeleton, { height: 200 }]} />
        )}
      </View>

      {/* ── Broker PNL ───────────────────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardIconWrap}>
            <Ionicons name="bar-chart-outline" size={14} color={PURPLE} />
          </View>
          <Text style={s.cardTitle}>Broker PNL</Text>
        </View>
        {hasSymbol ? (
          <BrokerPnlChart
            data={brokerChartData}
            formatter={fc}
            axisFormatter={axisFormatter}
            height={190}
          />
        ) : (
          <Skeleton style={s.chartSkeleton} />
        )}
      </View>

      {/* ── Trading Session Analysis ─────────────────────────────────────── */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardIconWrap}>
            <Ionicons name="time-outline" size={14} color={PURPLE} />
          </View>
          <Text style={s.cardTitle}>Trading Session Analysis</Text>
        </View>
        <View style={s.sessionsGrid}>
          {SESSIONS.map((session, idx) => (
            <View
              key={session.session}
              style={[
                s.sessionCell,
                idx < SESSIONS.length - 1 && s.sessionCellBorder,
              ]}
            >
              <Text style={s.sessionName}>{session.session}</Text>
              <Text style={[s.sessionPnl, { color: session.pnl >= 0 ? GREEN : RED }]}>
                {fc(session.pnl)}
              </Text>
              <Text style={s.sessionDetail}>
                {session.winRate.toFixed(0)}% win · {session.trades} trades
              </Text>
              <View style={s.sessionBarTrack}>
                <View style={[s.sessionBarFill, { width: `${session.winRate}%` }]} />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* ── Symbol Details Table ──────────────────────────────────────────── */}
      <View style={s.card}>
        {/* Card header with best/worst legend */}
        <View style={[s.cardHeader, { justifyContent: "space-between" }]}>
          <View style={s.cardHeaderLeft}>
            <View style={s.cardIconWrap}>
              <Ionicons name="layers-outline" size={14} color={PURPLE} />
            </View>
            <Text style={s.cardTitle}>Symbol Details</Text>
          </View>
          <View style={s.symbolLegend}>
            {derived.topSymbol && (
              <View style={s.symbolLegendItem}>
                <Ionicons name="trending-up" size={10} color={TEXT_MUT} />
                <Text style={s.symbolLegendText}>
                  Best: {derived.topSymbol.symbol}
                </Text>
              </View>
            )}
            {derived.worstSymbol && derived.worstSymbol.pnl < 0 && (
              <View style={s.symbolLegendItem}>
                <Ionicons
                  name="trending-down"
                  size={10}
                  color="rgba(248,113,113,0.80)"
                />
                <Text style={[s.symbolLegendText, { color: "rgba(248,113,113,0.80)" }]}>
                  Worst: {derived.worstSymbol.symbol}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Horizontally scrollable table (mirrors web overflow-x-auto) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            {/* Table header */}
            <View style={[t.row, t.headerRow]}>
              <Text style={[t.headerCell, { width: COL.symbol }]}>Symbol</Text>
              <Text style={[t.headerCell, { width: COL.provider }]}>Provider</Text>
              <Text style={[t.headerCell, t.right, { width: COL.trades }]}>Trades</Text>
              <Text style={[t.headerCell, t.right, { width: COL.winRate }]}>Win Rate</Text>
              <Text style={[t.headerCell, t.right, { width: COL.pnl }]}>Net PNL</Text>
              <Text style={[t.headerCell, t.right, { width: COL.avgPnl }]}>Avg/Trade</Text>
            </View>

            {/* Table body */}
            {hasSymbol ? (
              symbolStats!.map((sym: SymbolStat, idx: number) => {
                const avgPnl = sym.trades > 0 ? sym.pnl / sym.trades : 0;
                const isLast = idx === symbolStats!.length - 1;
                return (
                  <View
                    key={sym.symbol}
                    style={[t.row, !isLast && t.rowBorder]}
                  >
                    <Text style={[t.cell, t.symbolText, { width: COL.symbol }]}>
                      {sym.symbol}
                    </Text>
                    <View style={[t.cell, { width: COL.provider }]}>
                      <ProviderBadge symbol={sym.symbol} />
                    </View>
                    <Text style={[t.cell, t.right, t.monoMuted, { width: COL.trades }]}>
                      {sym.trades}
                    </Text>
                    <View style={[t.cell, t.right, t.winRateWrap, { width: COL.winRate }]}>
                      <View style={t.winRateBar}>
                        <View style={[t.winRateFill, { width: `${sym.winRate}%` }]} />
                      </View>
                      <Text style={[t.monoSemibold, {
                        color: sym.winRate >= 60 ? GREEN
                          : sym.winRate >= 50 ? TEXT_PRI
                          : RED,
                      }]}>
                        {sym.winRate.toFixed(0)}%
                      </Text>
                    </View>
                    <Text style={[t.cell, t.right, t.monoBold, {
                      width: COL.pnl,
                      color: sym.pnl >= 0 ? GREEN : RED,
                    }]}>
                      {fc(sym.pnl)}
                    </Text>
                    <Text style={[t.cell, t.right, t.monoMuted, {
                      width:  COL.avgPnl,
                      color:  avgPnl >= 0
                        ? "rgba(52,211,153,0.80)"
                        : "rgba(248,113,113,0.80)",
                    }]}>
                      {fc(avgPnl)}
                    </Text>
                  </View>
                );
              })
            ) : (
              [0, 1, 2, 3].map(i => (
                <Skeleton key={i} style={t.skeletonRow} />
              ))
            )}
          </View>
        </ScrollView>
      </View>

      {/* ── Best/Worst + Advanced Stats ───────────────────────────────────── */}
      <View style={s.grid2}>
        {(hasStats ? [
          {
            label:      "Largest Win",
            value:      fc(stats.largestWin),
            valueColor: GREEN,
            iconName:   "arrow-up-outline" as IoniconName,
            iconBg:     "rgba(52,211,153,0.10)",
            iconColor:  GREEN,
            sub:        undefined as string | undefined,
          },
          {
            label:      "Largest Loss",
            value:      fc(stats.largestLoss),
            valueColor: RED,
            iconName:   "arrow-down-outline" as IoniconName,
            iconBg:     "rgba(248,113,113,0.10)",
            iconColor:  RED,
            sub:        undefined as string | undefined,
          },
          {
            label:      "Current Streak",
            value:      `${Math.abs(stats.currentStreak)}${stats.currentStreak >= 0 ? "W" : "L"}`,
            valueColor: stats.currentStreak >= 0 ? GREEN : RED,
            iconName:   "flash-outline" as IoniconName,
            iconBg:     undefined as string | undefined,
            iconColor:  undefined as string | undefined,
            sub:        (stats.currentStreak >= 0 ? "Winning streak" : "Losing streak") as string | undefined,
          },
          {
            label:      "Total Volume",
            value:      `${stats.totalTrades}`,
            valueColor: TEXT_PRI,
            iconName:   "layers-outline" as IoniconName,
            iconBg:     undefined as string | undefined,
            iconColor:  undefined as string | undefined,
            sub:        `${stats.winCount + stats.lossCount} decisive` as string | undefined,
          },
        ] : [
          { label: "Largest Win",    value: "", valueColor: undefined, iconName: "arrow-up-outline"   as IoniconName, iconBg: "rgba(52,211,153,0.10)",  iconColor: GREEN,      sub: undefined as string | undefined },
          { label: "Largest Loss",   value: "", valueColor: undefined, iconName: "arrow-down-outline" as IoniconName, iconBg: "rgba(248,113,113,0.10)", iconColor: RED,        sub: undefined as string | undefined },
          { label: "Current Streak", value: "", valueColor: undefined, iconName: "flash-outline"      as IoniconName, iconBg: undefined,                iconColor: undefined,  sub: undefined as string | undefined },
          { label: "Total Volume",   value: "", valueColor: undefined, iconName: "layers-outline"     as IoniconName, iconBg: undefined,                iconColor: undefined,  sub: undefined as string | undefined },
        ]).map((c, i) => (
          <MetricCard
            key={c.label}
            index={17 + i}
            loading={!hasStats}
            label={c.label}
            value={c.value}
            sub={c.sub}
            iconName={c.iconName}
            valueColor={c.valueColor}
            iconBg={c.iconBg}
            iconColor={c.iconColor}
          />
        ))}
      </View>

    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Table column widths
// ─────────────────────────────────────────────────────────────────────────────

const COL = {
  symbol:   80,
  provider: 74,
  trades:   54,
  winRate:  96,
  pnl:      90,
  avgPnl:   86,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// StyleSheets
// ─────────────────────────────────────────────────────────────────────────────

// ── ChartSkeleton placeholder ─────────────────────────────────────────────────
const cs = StyleSheet.create({
  wrapper: {
    alignItems:     "center",
    justifyContent: "center",
    gap:            6,
    margin:         12,
    borderRadius:   10,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth:    1,
    borderColor:    BORDER,
    borderStyle:    "dashed",
  },
  phaseLabel: {
    fontSize:    10,
    color:       TEXT_DIM,
    fontFamily:  "Inter_400Regular",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  summary: {
    fontSize:    13,
    color:       TEXT_MUT,
    fontFamily:  "Inter_600SemiBold",
  },
});

// ── ProviderBadge ─────────────────────────────────────────────────────────────
const pb = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical:   3,
    borderRadius:      5,
    borderWidth:       1,
    alignSelf:         "flex-start",
  },
  badgeDelta: {
    backgroundColor: "rgba(249,115,22,0.15)",
    borderColor:     "rgba(249,115,22,0.20)",
  },
  badgeCtrader: {
    backgroundColor: "rgba(59,130,246,0.15)",
    borderColor:     "rgba(59,130,246,0.20)",
  },
  label: {
    fontSize:    9,
    fontFamily:  "Inter_700Bold",
  },
  labelDelta: {
    color: "#f97316",
  },
  labelCtrader: {
    color: "#60a5fa",
  },
});

// ── MetricCard ────────────────────────────────────────────────────────────────
const mc = StyleSheet.create({
  card: {
    width:           "48%",
    backgroundColor: BG_CARD,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     BORDER,
    padding:         16,
    gap:             4,
  },
  headerRow: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginBottom:   8,
  },
  label: {
    fontSize:      10,
    fontFamily:    "Inter_600SemiBold",
    color:         TEXT_MUT,
    letterSpacing: 1.0,
    textTransform: "uppercase",
    flex:          1,
  },
  iconWrap: {
    padding:         6,
    borderRadius:    8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  value: {
    fontSize:    22,
    fontFamily:  "Inter_700Bold",
    color:       TEXT_PRI,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  valueSkeleton: {
    height:       28,
    width:        80,
    borderRadius: 6,
    marginBottom: 4,
  },
  barTrack: {
    height:          4,
    width:           "100%",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius:    999,
    overflow:        "hidden",
    marginVertical:  4,
  },
  barFill: {
    height:       "100%",
    borderRadius: 999,
  },
  sub: {
    fontSize:   11,
    fontFamily: "Inter_400Regular",
    color:      TEXT_MUT,
  },
  subSkeleton: {
    height:       12,
    width:        96,
    borderRadius: 4,
  },
});

// ── Main layout ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    flex:            1,
    backgroundColor: "#05070A",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               12,
  },

  // ── Page header ─────────────────────────────────────────────────────────
  headerRow: {
    flexDirection:  "row",
    alignItems:     "flex-start",
    justifyContent: "space-between",
    flexWrap:       "wrap",
    gap:            8,
  },
  headerText: {
    flex: 1,
    gap:  2,
  },
  headerTitle: {
    fontSize:      20,
    fontFamily:    "Inter_700Bold",
    color:         TEXT_PRI,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize:   12,
    fontFamily: "Inter_400Regular",
    color:      TEXT_DIM,
  },
  liveChip: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical:   6,
  },
  liveDot: {
    width:           6,
    height:          6,
    borderRadius:    3,
    backgroundColor: "#60a5fa",
  },
  liveText: {
    fontSize:   11,
    fontFamily: "Inter_400Regular",
    color:      TEXT_MUT,
  },

  // ── 2-column card grid ───────────────────────────────────────────────────
  grid2: {
    flexDirection: "row",
    flexWrap:      "wrap",
    gap:           10,
  },

  // ── Glass card ───────────────────────────────────────────────────────────
  card: {
    backgroundColor: BG_CARD,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     BORDER,
    overflow:        "hidden",
  },
  cardHeader: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             8,
    padding:         16,
    paddingBottom:   8,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  cardIconWrap: {
    width:           24,
    height:          24,
    borderRadius:    6,
    backgroundColor: "rgba(27,189,142,0.15)",
    alignItems:      "center",
    justifyContent:  "center",
  },
  cardTitle: {
    fontSize:   13,
    fontFamily: "Inter_600SemiBold",
    color:      TEXT_PRI,
  },

  // ── Equity pill (last equity value badge) ────────────────────────────────
  pill: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      999,
    marginLeft:        "auto",
  },
  pillGreen: { backgroundColor: "rgba(52,211,153,0.15)" },
  pillRed:   { backgroundColor: "rgba(248,113,113,0.15)" },
  pillText: {
    fontSize:   11,
    fontFamily: "Inter_700Bold",
  },
  pillTextGreen: { color: "#34d399" },
  pillTextRed:   { color: "#f87171" },

  // ── Chart skeleton (loaded, data pending) ────────────────────────────────
  chartSkeleton: {
    height:       190,
    borderRadius: 8,
    margin:       12,
  },

  // ── Win/Loss footer row ──────────────────────────────────────────────────
  wlRow: {
    flexDirection:  "row",
    justifyContent: "space-around",
    marginHorizontal: 16,
    marginBottom:     16,
    paddingTop:       12,
    borderTopWidth:   StyleSheet.hairlineWidth,
    borderTopColor:   BORDER,
  },
  wlCell: {
    alignItems: "center",
    gap:        2,
  },
  wlValue: {
    fontSize:   15,
    fontFamily: "Inter_700Bold",
  },
  wlLabel: {
    fontSize:   10,
    fontFamily: "Inter_400Regular",
    color:      TEXT_MUT,
  },
  wlDivider: {
    width:           StyleSheet.hairlineWidth,
    alignSelf:       "stretch",
    backgroundColor: BORDER,
  },

  // ── Session grid ─────────────────────────────────────────────────────────
  sessionsGrid: {
    flexDirection: "row",
    flexWrap:      "wrap",
  },
  sessionCell: {
    width:             "50%",
    paddingHorizontal: 16,
    paddingBottom:     16,
    gap:               4,
  },
  sessionCellBorder: {
    // borders between cells — handled via paddingBottom gap
  },
  sessionName: {
    fontSize:      10,
    fontFamily:    "Inter_600SemiBold",
    color:         TEXT_DIM,
    letterSpacing: 1.0,
    textTransform: "uppercase",
    marginBottom:  4,
  },
  sessionPnl: {
    fontSize:   17,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  sessionDetail: {
    fontSize:   11,
    fontFamily: "Inter_400Regular",
    color:      "rgba(255,255,255,0.60)",
  },
  sessionBarTrack: {
    height:          4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius:    999,
    overflow:        "hidden",
    marginTop:       4,
  },
  sessionBarFill: {
    height:          "100%",
    borderRadius:    999,
    backgroundColor: "rgba(27,189,142,0.70)",
  },

  // ── Symbol Details legend ─────────────────────────────────────────────────
  symbolLegend: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           12,
  },
  symbolLegendItem: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
  },
  symbolLegendText: {
    fontSize:   10,
    fontFamily: "Inter_400Regular",
    color:      TEXT_MUT,
  },
});

// ── Symbol Details Table ──────────────────────────────────────────────────────
const t = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems:    "center",
    paddingHorizontal: 12,
  },
  headerRow: {
    borderTopWidth:  StyleSheet.hairlineWidth,
    borderTopColor:  BORDER,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.015)",
    paddingVertical: 8,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  headerCell: {
    fontSize:      10,
    fontFamily:    "Inter_600SemiBold",
    color:         TEXT_DIM,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 8,
    paddingVertical: 0,
  },
  cell: {
    paddingHorizontal: 8,
    paddingVertical:   10,
    justifyContent:    "center",
  },
  right: {
    textAlign: "right",
    alignItems: "flex-end",
  },
  symbolText: {
    fontSize:   12,
    fontFamily: "Inter_700Bold",
    color:      TEXT_PRI,
  },
  monoMuted: {
    fontSize:   11,
    fontFamily: "Inter_400Regular",
    color:      TEXT_MUT,
    textAlign:  "right",
  },
  monoSemibold: {
    fontSize:   11,
    fontFamily: "Inter_600SemiBold",
    textAlign:  "right",
  },
  monoBold: {
    fontSize:   12,
    fontFamily: "Inter_700Bold",
    textAlign:  "right",
  },
  winRateWrap: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "flex-end",
    gap:            6,
  },
  winRateBar: {
    width:           48,
    height:          4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius:    999,
    overflow:        "hidden",
  },
  winRateFill: {
    height:          "100%",
    backgroundColor: "rgba(52,211,153,0.60)",
    borderRadius:    999,
  },
  skeletonRow: {
    height:          36,
    borderRadius:    8,
    margin:          8,
  },
});
