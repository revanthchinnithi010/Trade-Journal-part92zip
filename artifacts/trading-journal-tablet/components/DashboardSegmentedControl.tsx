/**
 * DashboardSegmentedControl — React Native port
 *
 * Web source: artifacts/trading-journal/src/components/DashboardSegmentedControl.tsx
 *
 * Web → RN replacements:
 *   CSS translate3d transition  → Reanimated withTiming (UI-thread animation)
 *   onClick                     → onPress (Pressable)
 *   contain: "layout paint"     → removed (no CSS containment in RN)
 *   useLocation (wouter)        → removed; value is now a controlled prop
 *   href navigation             → removed; caller manages navigation via onValueChange
 *
 * API changes vs web:
 *   Web: no props (reads router location internally)
 *   RN:  fully controlled — value + options + onValueChange + disabled
 *        Callers own navigation; this component only signals selection.
 *
 * Animation:
 *   Uses react-native-reanimated (already in devDependencies ~4.1.1).
 *   The sliding pill translates on the UI thread via withTiming — zero JS
 *   bridge frames, equivalent to CSS translate3d on the web.
 *
 * Responsive:
 *   Each segment is flex:1; the pill width matches one segment exactly.
 *   Works for 2–6 options across phone and tablet widths.
 */

import React, { memo, useCallback, useEffect, useRef } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SegmentOption {
  /** Unique identifier compared against `value`. */
  value: string;
  /** Human-readable label displayed on the segment. */
  label: string;
}

export interface DashboardSegmentedControlProps {
  /** Currently selected segment value. */
  value: string;
  /** Ordered list of segments to render. */
  options: SegmentOption[];
  /** Fired when the user taps a different segment. */
  onValueChange: (value: string) => void;
  /** When true the control is non-interactive and 50% opaque. */
  disabled?: boolean;
  /** Optional override for the outer container style. */
  style?: ViewStyle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Animation constants
// ─────────────────────────────────────────────────────────────────────────────

/** Duration mirrors CSS transition 220ms used throughout the web app. */
const ANIM_DURATION_MS = 220;
/** Easing curve: approximates iOS native segmented control. */
const PILL_EASING = { duration: ANIM_DURATION_MS } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function DashboardSegmentedControl({
  value,
  options,
  onValueChange,
  disabled = false,
  style,
}: DashboardSegmentedControlProps) {
  const count = options.length;

  // Track the measured pixel width of the full container so the pill can be
  // sized as containerWidth / count (equal-width segments).
  const containerWidthRef = useRef(0);

  // Shared value holds the current pill translateX in px.
  const pillX = useSharedValue(0);

  // Resolve the active index from the current `value` prop.
  const activeIndex = options.findIndex((o) => o.value === value);
  const safeIndex   = activeIndex < 0 ? 0 : activeIndex;

  // Jump the pill to the correct position whenever value/count/width changes
  // (including initial mount and container measure).
  const movePill = useCallback(
    (index: number, animated: boolean) => {
      const w = containerWidthRef.current;
      if (w <= 0) return;
      const segW    = w / count;
      const targetX = index * segW;
      if (animated) {
        pillX.value = withTiming(targetX, PILL_EASING);
      } else {
        pillX.value = targetX;
      }
    },
    [count, pillX],
  );

  // Re-position whenever the controlled value changes.
  useEffect(() => {
    movePill(safeIndex, true);
  }, [safeIndex, movePill]);

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      if (w === containerWidthRef.current) return;
      containerWidthRef.current = w;
      // Snap without animation on first layout / resize.
      movePill(safeIndex, false);
    },
    [safeIndex, movePill],
  );

  // Animated pill style — width = 1/count of container, translateX = pillX.
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width:     containerWidthRef.current > 0
      ? containerWidthRef.current / count
      : undefined,
  }));

  return (
    <View
      style={[styles.track, disabled && styles.trackDisabled, style]}
      onLayout={handleLayout}
    >
      {/* ── Sliding pill (rendered behind labels) ── */}
      <Animated.View
        style={[styles.pill, pillStyle]}
        pointerEvents="none"
      />

      {/* ── Segment buttons ── */}
      {options.map((option, idx) => {
        const isActive = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (disabled || isActive) return;
              onValueChange(option.value);
            }}
            disabled={disabled}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isActive, disabled }}
            style={styles.segment}
          >
            {({ pressed }) => (
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  isActive  ? styles.labelActive   : styles.labelInactive,
                  pressed   ? styles.labelPressed   : null,
                  disabled  ? styles.labelDisabled  : null,
                ]}
              >
                {option.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const TRACK_BG     = "rgba(255,255,255,0.04)";
const TRACK_BORDER = "rgba(255,255,255,0.07)";
const PILL_BG      = "rgba(255,255,255,0.10)";
const PILL_BORDER  = "rgba(255,255,255,0.12)";

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  track: {
    flexDirection:   "row",
    backgroundColor: TRACK_BG,
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     TRACK_BORDER,
    padding:         3,
    position:        "relative",
    overflow:        "hidden",
    height:          36,
  },
  trackDisabled: {
    opacity: 0.50,
  },

  // ── Pill ─────────────────────────────────────────────────────────────────
  pill: {
    position:        "absolute",
    top:             3,
    bottom:          3,
    borderRadius:    7,
    backgroundColor: PILL_BG,
    borderWidth:     1,
    borderColor:     PILL_BORDER,
  },

  // ── Segments ─────────────────────────────────────────────────────────────
  segment: {
    flex:            1,
    alignItems:      "center",
    justifyContent:  "center",
    zIndex:          1,        // sit above the pill so taps register
    paddingHorizontal: 4,
  },

  // ── Labels ───────────────────────────────────────────────────────────────
  label: {
    fontSize:      12,
    letterSpacing: 0.1,
  },
  labelActive: {
    color:       "#EDF0F6",
    fontFamily:  "Inter_600SemiBold",
    fontWeight:  "600",
  },
  labelInactive: {
    color:       "rgba(148,163,184,0.55)",
    fontFamily:  "Inter_400Regular",
    fontWeight:  "400",
  },
  labelPressed: {
    opacity: 0.70,
  },
  labelDisabled: {
    opacity: 0.50,
  },
});

export default memo(DashboardSegmentedControl);
