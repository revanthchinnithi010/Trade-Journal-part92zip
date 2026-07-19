/**
 * progress.tsx — React Native port
 *
 * Web source used @radix-ui/react-progress with translateX fill trick.
 * React Native uses a width-percentage approach instead, which is native-friendly
 * and works with onLayout without JS thread overhead.
 *
 * Web → RN replacements:
 *   ProgressPrimitive.Root      → View (track)
 *   ProgressPrimitive.Indicator → View (fill, width via percentage)
 *   translateX(-N%)             → width: `${value}%` (no transform needed)
 *   relative overflow-hidden    → overflow: 'hidden' in StyleSheet
 *
 * Preserved API:
 *   value?: number   — 0–100 (undefined treated as 0)
 *   className        — forwarded to outer track View
 *   All other ViewProps forwarded to outer View.
 */

import * as React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { cn } from "@/lib/utils";

export interface ProgressProps extends ViewProps {
  /** Progress value 0–100. Values outside this range are clamped. */
  value?: number;
}

const Progress = React.forwardRef<View, ProgressProps>(
  ({ className, value, style, ...props }, ref) => {
    const clamped = Math.min(Math.max(value ?? 0, 0), 100);

    return (
      <View
        ref={ref}
        className={cn("w-full rounded-full", className)}
        style={[styles.track, style]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: clamped }}
        {...props}
      >
        <View
          style={[styles.fill, { width: `${clamped}%` }]}
        />
      </View>
    );
  },
);
Progress.displayName = "Progress";

const styles = StyleSheet.create({
  track: {
    height: 8,                              // h-2
    overflow: "hidden",
    backgroundColor: "rgba(175,188,205,0.20)", // bg-primary/20
  },
  fill: {
    height: "100%",
    backgroundColor: "#AFBBCD",            // bg-primary
    borderRadius: 9999,
  },
});

export { Progress };
