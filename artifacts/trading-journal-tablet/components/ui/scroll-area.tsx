/**
 * scroll-area.tsx — React Native port
 *
 * Web source: @radix-ui/react-scroll-area
 *
 * Web → RN replacements:
 *   ScrollAreaPrimitive.Root             → ScrollView (native scrolling)
 *   ScrollAreaPrimitive.Viewport         → removed (ScrollView is the viewport)
 *   ScrollAreaPrimitive.ScrollAreaScrollbar → View stub (native handles scroll indicators)
 *   ScrollAreaPrimitive.ScrollAreaThumb  → removed (managed by OS)
 *   ScrollAreaPrimitive.Corner           → removed
 *   overflow-hidden                      → ScrollView clips naturally
 *   touch-none / select-none             → not applicable in RN
 *   Custom scrollbar track+thumb         → native iOS/Android scroll indicator
 *
 * Preserved API:
 *   ScrollArea   — ScrollView wrapper supporting both directions
 *   ScrollBar    — visual compat stub (native scroll indicator shown instead)
 *
 * Props preserved:
 *   ScrollArea: className, children, type (API compat ignored), scrollHideDelay (ignored)
 *               horizontal — pass horizontal={true} to enable horizontal scrolling
 *   ScrollBar:  orientation ("vertical" | "horizontal") — drives indicator style
 *               className — forwarded
 */

import * as React from "react";
import {
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── ScrollArea ───────────────────────────────────────────────────────────────

export interface ScrollAreaProps extends ScrollViewProps {
  className?: string;
  /** API compat — Radix scroll type; ignored in RN (always native) */
  type?: "auto" | "always" | "scroll" | "hover";
  /** API compat — delay before hiding scrollbar indicator; ignored in RN */
  scrollHideDelay?: number;
  /** Set true to enable horizontal scrolling (default: vertical) */
  horizontal?: boolean;
}

const ScrollArea = React.forwardRef<ScrollView, ScrollAreaProps>(
  (
    {
      className,
      children,
      type: _type,
      scrollHideDelay: _shd,
      horizontal = false,
      showsHorizontalScrollIndicator,
      showsVerticalScrollIndicator,
      ...props
    },
    ref,
  ) => (
    <ScrollView
      ref={ref}
      horizontal={horizontal}
      showsHorizontalScrollIndicator={
        showsHorizontalScrollIndicator ?? horizontal
      }
      showsVerticalScrollIndicator={
        showsVerticalScrollIndicator ?? !horizontal
      }
      className={cn("flex-1", className)}
      {...props}
    >
      {children}
    </ScrollView>
  ),
);
ScrollArea.displayName = "ScrollArea";

// ─── ScrollBar ────────────────────────────────────────────────────────────────
// Visual compatibility stub.
// React Native renders native OS scroll indicators automatically inside ScrollView.
// This component exists solely so imports compile — it renders nothing visible.

export interface ScrollBarProps extends ViewProps {
  orientation?: "vertical" | "horizontal";
  className?: string;
}

const ScrollBar = React.forwardRef<View, ScrollBarProps>(
  ({ className, orientation = "vertical", ...props }, ref) => (
    <View
      ref={ref}
      // Visually invisible stub — native scrollbar is drawn by the OS
      className={cn(
        "flex touch-none select-none",
        orientation === "vertical" && "w-2.5",
        orientation === "horizontal" && "h-2.5 flex-col",
        className,
      )}
      pointerEvents="none"
      {...props}
    />
  ),
);
ScrollBar.displayName = "ScrollBar";

// ─── Exports ──────────────────────────────────────────────────────────────────

export { ScrollArea, ScrollBar };
