/**
 * separator.tsx — React Native port
 *
 * Web source used @radix-ui/react-separator which renders a styled hr/div.
 * In React Native, a View with a single border edge achieves the same result.
 *
 * Web → RN replacements:
 *   SeparatorPrimitive.Root → View
 *   h-[1px] w-full         → borderTopWidth: StyleSheet.hairlineWidth (horizontal)
 *   h-full w-[1px]         → borderLeftWidth: StyleSheet.hairlineWidth (vertical)
 *   decorative prop        → accessibilityRole="none" | omitted
 *
 * Preserved API:
 *   orientation?: "horizontal" | "vertical"   (default "horizontal")
 *   decorative?:  boolean                     (default true)
 */

import * as React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { cn } from "@/lib/utils";

export interface SeparatorProps extends ViewProps {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}

const Separator = React.forwardRef<View, SeparatorProps>(
  (
    { className, orientation = "horizontal", decorative = true, style, ...props },
    ref,
  ) => (
    <View
      ref={ref}
      accessibilityRole={decorative ? "none" : undefined}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "w-full" : "h-full",
        className,
      )}
      style={[
        orientation === "horizontal"
          ? styles.horizontal
          : styles.vertical,
        style,
      ]}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";

const styles = StyleSheet.create({
  horizontal: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
  },
  vertical: {
    width: StyleSheet.hairlineWidth,
    height: "100%",
  },
});

export { Separator };
