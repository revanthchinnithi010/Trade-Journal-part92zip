/**
 * skeleton.tsx — React Native port
 *
 * Web source used `animate-pulse` CSS animation on a div.
 * React Native's Animated API replicates the pulse effect without Reanimated
 * (Reanimated is not required for this component).
 *
 * Web → RN replacements:
 *   div                  → Animated.View
 *   animate-pulse (CSS)  → Animated.loop(Animated.sequence([...]))
 *   rounded-md bg-primary/10 → inline style (bg-primary/10 opacity fallback)
 *   HTMLAttributes<HTMLDivElement> → ViewProps
 *
 * Preserved API:
 *   className, style, children — all forwarded to Animated.View
 */

import * as React from "react";
import { Animated, StyleSheet, type ViewProps } from "react-native";

import { cn } from "@/lib/utils";

// Pulse easing: 0.4 → 0.85 → 0.4 (mirrors CSS animate-pulse opacity rhythm)
const PULSE_LOW  = 0.4;
const PULSE_HIGH = 0.85;
const PULSE_MS   = 700;   // matches CSS pulse 1.4s → ~700ms per half-cycle

function Skeleton({ className, style, ...props }: ViewProps) {
  const opacity = React.useRef(new Animated.Value(PULSE_LOW)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue:         PULSE_HIGH,
          duration:        PULSE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue:         PULSE_LOW,
          duration:        PULSE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={cn("rounded-md", className)}
      style={[styles.base, { opacity }, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    // bg-primary/10 → #AFBBCD at ~10% opacity
    backgroundColor: "rgba(175, 188, 205, 0.10)",
  },
});

export { Skeleton };
