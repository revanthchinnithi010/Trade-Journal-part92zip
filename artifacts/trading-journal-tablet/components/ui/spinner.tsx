/**
 * spinner.tsx — React Native port
 *
 * Web source used Loader2Icon (lucide-react SVG with animate-spin CSS).
 * React Native's ActivityIndicator is the idiomatic equivalent — it uses
 * platform-native spinner rendering (UIActivityIndicatorView / ProgressBar).
 *
 * Web → RN replacements:
 *   Loader2Icon (lucide-react SVG)    → ActivityIndicator (react-native)
 *   className="size-4 animate-spin"   → size / color props
 *   role="status" aria-label="Loading"→ accessibilityLabel="Loading"
 *   React.ComponentProps<"svg">       → SpinnerProps (custom)
 *
 * Preserved API:
 *   className  — passed to a wrapping View for layout (ActivityIndicator
 *                does not accept className directly)
 *   size       — "small" | "large" | number  (default "small" ≈ size-4)
 *   color      — tint color string (default uses primary token)
 */

import * as React from "react";
import { ActivityIndicator, View, type ViewProps } from "react-native";

import { cn } from "@/lib/utils";

export interface SpinnerProps extends ViewProps {
  /** Spinner size — "small" (~16px) mirrors the web's size-4. Default: "small". */
  size?: "small" | "large" | number;
  /** Spinner colour. Defaults to the muted-foreground token value. */
  color?: string;
}

function Spinner({
  className,
  size = "small",
  color = "#B3BDD1", // --muted-foreground dark token
  style,
  ...props
}: SpinnerProps) {
  return (
    <View
      className={cn("items-center justify-center", className)}
      style={style}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      {...props}
    >
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

export { Spinner };
