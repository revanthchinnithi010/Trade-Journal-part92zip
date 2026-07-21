/**
 * MiniChart.tsx — Phase 9.13 Strategy Gate result.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ENGINE DECISION — LOCKED: React Native Skia (@shopify/react-native-skia)│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * See full benchmark analysis in Phase 9.13 output.
 * See prototypes: MiniChartWebView.tsx (A) · MiniChartSkia.tsx (B)
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * React Native port of src/components/charts/MiniChart.tsx
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Public API is preserved exactly from the web version.
 * DOM/browser sub-components (MiniSymbolPicker HTML/CSS) are replaced with
 * React Native equivalents in Phase 9.14.
 * This file is the shell: correct props, correct state machine, engine locked.
 */

import React, { useEffect, useRef, useState, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutChangeEvent,
} from "react-native";

import { useTickStore } from "@/store/tickStore";
import { useChartStore } from "@/store/chartStore";
import type { ChartSettings } from "./chartSettingsTypes";
import { DEFAULT_CHART_SETTINGS } from "./chartSettingsTypes";
import MiniChartSkia from "./MiniChartSkia";

// ── Timeframes (preserved from web) ──────────────────────────────────────────

const TIMEFRAMES = [
  { label: "1m",  value: "1"   },
  { label: "5m",  value: "5"   },
  { label: "15m", value: "15"  },
  { label: "1H",  value: "60"  },
  { label: "4H",  value: "240" },
  { label: "1D",  value: "D"   },
];

// ── Public props interface — preserved exactly from web ───────────────────────

export interface MiniChartProps {
  defaultSymbol:       string;
  defaultInterval:     string;
  /** When provided, overrides internal interval (timeframe sync mode) */
  syncedInterval?:     string;
  /** When true, hides the symbol/TF header — parent controls symbol via controlledSymbol */
  headerless?:         boolean;
  /** When provided, parent controls the displayed symbol */
  controlledSymbol?:   string;
  /** When provided, parent controls the displayed interval (active-slot TF routing) */
  controlledInterval?: string;
  /** Child components (DrawingOverlay, IndicatorRenderer, etc.) — rendered over chart */
  children?:           React.ReactNode;
  /** Called whenever symbol changes */
  onSymbolChange?:     (sym: string) => void;
  /** Called whenever interval changes */
  onIntervalChange?:   (iv: string) => void;
  /** Theme settings — must match the main chart */
  settings?:           ChartSettings;
}

// ── MiniChart ─────────────────────────────────────────────────────────────────

/**
 * MiniChart — layout-slot shell.
 *
 * Mirrors the web version's state machine exactly:
 *   - symbol / interval local state with controlled prop syncing
 *   - headerless mode
 *   - syncedInterval TF lock
 *   - onSymbolChange / onIntervalChange notifications
 *
 * Rendering is delegated to MiniChartSkia (engine decision locked in Phase 9.13).
 * MiniSymbolPicker is stubbed here — full implementation in Phase 9.14.
 *
 * NOTE: Requires a Dev Build for Skia. Expo Go will show a fallback view.
 */
const MiniChart = memo(function MiniChart({
  defaultSymbol,
  defaultInterval,
  syncedInterval,
  headerless,
  controlledSymbol,
  controlledInterval,
  children: _children,  // wired in Phase 9.14 DrawingOverlay migration
  onSymbolChange,
  onIntervalChange,
  settings = DEFAULT_CHART_SETTINGS,
}: MiniChartProps) {
  const [symbol,     setSymbol]     = useState(defaultSymbol);
  const [interval,   setInterval]   = useState(syncedInterval ?? defaultInterval);
  const [showPicker, setShowPicker] = useState(false);

  // Layout measurement — required by Skia Canvas (needs explicit dimensions)
  const [size, setSize] = useState({ width: 0, height: 0 });

  const symRef = useRef(symbol);
  const ivRef  = useRef(interval);
  symRef.current = symbol;
  ivRef.current  = interval;

  // ── Controlled prop syncing (identical logic to web) ───────────────────────

  useEffect(() => {
    if (syncedInterval && syncedInterval !== ivRef.current) setInterval(syncedInterval);
  }, [syncedInterval]); // eslint-disable-line

  useEffect(() => {
    if (controlledSymbol && controlledSymbol !== symRef.current) setSymbol(controlledSymbol);
  }, [controlledSymbol]); // eslint-disable-line

  useEffect(() => {
    if (controlledInterval && controlledInterval !== ivRef.current) setInterval(controlledInterval);
  }, [controlledInterval]); // eslint-disable-line

  // Notify parent of changes
  useEffect(() => { onSymbolChange?.(symbol); }, [symbol]); // eslint-disable-line
  useEffect(() => { onIntervalChange?.(interval); }, [interval]); // eslint-disable-line

  // ── Live tick ───────────────────────────────────────────────────────────────
  const tick      = useTickStore(s => s.ticks[symbol] ?? null);
  const livePrice = tick?.price ?? null;
  const isPos     = (tick?.changePct ?? 0) >= 0;

  // ── Bars from chart store (wired to API fetch in Phase 9.14) ───────────────
  // Placeholder: empty until the candle-fetch hook is migrated.
  const bars = useChartStore(s =>
    s.symbol === symbol ? [] : []  // Phase 9.14: replace with fetched bars
  );

  const isSynced = !!syncedInterval;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={styles.root}>

      {/* ── Compact header (hidden in headerless mode) ── */}
      {!headerless && (
        <View style={styles.header}>
          {/* Symbol button — full picker implemented in Phase 9.14 */}
          <TouchableOpacity
            style={[styles.symbolBtn, showPicker && styles.symbolBtnActive]}
            onPress={() => setShowPicker(v => !v)}
            activeOpacity={0.7}
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{symbol.slice(0, 4)}</Text>
            </View>
            <Text style={styles.symbolText}>{symbol}</Text>
            <Text style={styles.chevron}>▾</Text>
          </TouchableOpacity>

          {/* TF pills */}
          <View style={styles.pills}>
            {TIMEFRAMES.map(tf => {
              const active = tf.value === interval;
              return (
                <TouchableOpacity
                  key={tf.value}
                  onPress={() => { if (!isSynced) setInterval(tf.value); }}
                  style={[styles.pill, active && styles.pillActive]}
                  activeOpacity={isSynced ? 1 : 0.7}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {tf.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Live price */}
          {livePrice !== null && livePrice > 0 && (
            <View style={styles.priceRow}>
              <Text style={styles.price}>{livePrice.toFixed(2)}</Text>
              {tick && (
                <Text style={[styles.pct, { color: isPos ? "#B7FF5A" : "#ef4444" }]}>
                  {isPos ? "+" : ""}{tick.changePct.toFixed(2)}%
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Chart body — Skia canvas ── */}
      <View style={styles.chartBody} onLayout={onLayout}>
        {size.width > 0 && size.height > 0 ? (
          <MiniChartSkia
            bars={bars}
            livePrice={livePrice}
            settings={settings}
            width={size.width}
            height={size.height}
          />
        ) : null}
      </View>
    </View>
  );
});

export default MiniChart;

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "column",
    backgroundColor: "#07110D",
    overflow: "hidden",
  },
  header: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    backgroundColor: "rgba(9,15,11,0.96)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(57,91,67,0.2)",
    flexShrink: 0,
  },
  symbolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 7,
    backgroundColor: "rgba(13,22,17,0.85)",
    borderWidth: 1,
    borderColor: "rgba(57,91,67,0.3)",
  },
  symbolBtnActive: {
    backgroundColor: "rgba(183,255,90,0.1)",
    borderColor: "rgba(183,255,90,0.3)",
  },
  badge: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: "rgba(183,255,90,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 6,
    fontWeight: "900",
    color: "#B7FF5A",
  },
  symbolText: {
    fontSize: 10.5,
    fontWeight: "800",
    color: "#F3FFF3",
  },
  chevron: {
    fontSize: 9,
    color: "rgba(167,184,169,0.4)",
  },
  pills: {
    flexDirection: "row",
    gap: 1,
  },
  pill: {
    paddingHorizontal: 5,
    height: 20,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: {
    backgroundColor: "rgba(183,255,90,0.12)",
  },
  pillText: {
    fontSize: 9.5,
    fontWeight: "600",
    color: "rgba(167,184,169,0.45)",
  },
  pillTextActive: {
    fontWeight: "800",
    color: "#B7FF5A",
  },
  priceRow: {
    marginLeft: "auto" as never,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  price: {
    fontSize: 10.5,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: "#F3FFF3",
  },
  pct: {
    fontSize: 9,
    fontWeight: "700",
  },
  chartBody: {
    flex: 1,
    minHeight: 0,
  },
});
