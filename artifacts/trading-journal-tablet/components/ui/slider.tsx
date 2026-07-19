/**
 * slider.tsx — React Native port
 *
 * Web source used @radix-ui/react-slider which provides a draggable
 * range input with track, filled range, and thumb(s).
 *
 * Web → RN replacements:
 *   SliderPrimitive.Root  → View with PanResponder
 *   SliderPrimitive.Track → View (track background)
 *   SliderPrimitive.Range → View (filled portion, width derived from value)
 *   SliderPrimitive.Thumb → View with panHandlers (draggable)
 *   touch-none / select-none → removed (no CSS pointer-events in RN)
 *   focus-visible:*          → removed
 *   disabled:pointer-events-none → accessibilityState.disabled
 *
 * PanResponder notes:
 *   All mutable values accessed inside PanResponder callbacks are stored
 *   in refs to avoid stale closure issues (PanResponder is created once).
 *
 * Preserved API:
 *   Slider        — forwardRef View component
 *   SliderProps   — interface exported for typing
 *   min           — minimum value (default 0)
 *   max           — maximum value (default 100)
 *   step          — snap interval (default 1)
 *   value         — controlled value array (e.g. [50])
 *   defaultValue  — uncontrolled initial value array
 *   onValueChange — callback(number[]) on drag
 *   disabled      — disables dragging + 50% opacity
 *   orientation   — "horizontal" (default) | "vertical" (horizontal only implemented)
 */

import * as React from "react";
import { PanResponder, View, type ViewProps } from "react-native";

import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SliderProps extends Omit<ViewProps, "ref"> {
  min?: number;
  max?: number;
  step?: number;
  value?: number[];
  defaultValue?: number[];
  onValueChange?: (value: number[]) => void;
  disabled?: boolean;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Slider = React.forwardRef<View, SliderProps>(
  (
    {
      className,
      min = 0,
      max = 100,
      step = 1,
      value: valueProp,
      defaultValue = [0],
      onValueChange,
      disabled,
      orientation = "horizontal",
      ...props
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState<number[]>(defaultValue);
    const isControlled = valueProp !== undefined;
    const value = isControlled ? valueProp! : internalValue;
    const currentVal = value[0] ?? min;

    // ── Refs for PanResponder closures (avoids stale state) ────────────────────
    const trackWidthRef   = React.useRef(1);
    const startFracRef    = React.useRef(0);
    const currentValRef   = React.useRef(currentVal);
    const minRef          = React.useRef(min);
    const maxRef          = React.useRef(max);
    const stepRef         = React.useRef(step);
    const disabledRef     = React.useRef(disabled);
    const isControlledRef = React.useRef(isControlled);
    const onChangeRef     = React.useRef(onValueChange);
    const setInternal     = React.useRef(setInternalValue);

    // Keep refs in sync every render (cheap, no extra effects).
    currentValRef.current = currentVal;
    minRef.current        = min;
    maxRef.current        = max;
    stepRef.current       = step;
    disabledRef.current   = disabled;
    isControlledRef.current = isControlled;
    onChangeRef.current   = onValueChange;

    // ── Clamp + snap helper (uses refs, safe inside PanResponder) ──────────────
    const clampSnap = (raw: number): number => {
      const lo = minRef.current;
      const hi = maxRef.current;
      const s  = stepRef.current;
      const snapped = s > 0 ? Math.round((raw - lo) / s) * s + lo : raw;
      return Math.min(hi, Math.max(lo, snapped));
    };

    // ── PanResponder — created once, reads mutable state via refs ──────────────
    const panResponder = React.useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder:  () => !disabledRef.current,
        onPanResponderGrant: () => {
          const lo = minRef.current;
          const hi = maxRef.current;
          startFracRef.current =
            (currentValRef.current - lo) / Math.max(hi - lo, 1);
        },
        onPanResponderMove: (_, gs) => {
          if (disabledRef.current) return;
          const w   = Math.max(trackWidthRef.current, 1);
          const lo  = minRef.current;
          const hi  = maxRef.current;
          const raw = lo + (startFracRef.current + gs.dx / w) * (hi - lo);
          const next = [clampSnap(raw)];
          if (!isControlledRef.current) setInternal.current(next);
          onChangeRef.current?.(next);
        },
      }),
    ).current;

    // ── Derived display values ─────────────────────────────────────────────────
    const fraction = (currentVal - min) / Math.max(max - min, 1);
    const pct      = `${Math.max(0, Math.min(100, fraction * 100))}%` as const;

    return (
      <View
        ref={ref}
        className={cn(
          "relative w-full h-5 flex-row items-center justify-center",
          className,
        )}
        onLayout={(e) => {
          trackWidthRef.current = e.nativeEvent.layout.width;
        }}
        {...props}
      >
        {/* Track background + filled range */}
        <View className="absolute w-full h-1.5 rounded-full bg-primary/20 overflow-hidden">
          <View
            className="h-full bg-primary rounded-full"
            style={{ width: pct }}
          />
        </View>

        {/* Draggable thumb */}
        <View
          {...panResponder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityValue={{ min, max, now: currentVal }}
          accessibilityState={{ disabled: disabled ?? false }}
          className={cn(
            "absolute h-4 w-4 rounded-full border border-primary/50 bg-background shadow",
            disabled && "opacity-50",
          )}
          style={{
            left: pct,
            // Centre the 16 px thumb on the pct position.
            transform: [{ translateX: -8 }],
          }}
        />
      </View>
    );
  },
);
Slider.displayName = "Slider";

export { Slider };
