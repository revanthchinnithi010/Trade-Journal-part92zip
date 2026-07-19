/**
 * kbd.tsx — React Native port
 *
 * Web source: <kbd> HTML element
 *
 * Web → RN replacements:
 *   <kbd> element          → Text (styled badge)
 *   data-slot="kbd"        → removed (no data attributes in RN)
 *   pointer-events-none    → no interactivity by default (Text is non-interactive)
 *   [&_svg:not([class*='size-'])]:size-3 → removed (SVG children unsupported in Text)
 *   [[data-slot=tooltip-content]_&]:*  → removed (no CSS context selectors in RN)
 *   inline-flex h-5 w-fit  → View row wrapper for multi-child groups
 *
 * Preserved API:
 *   Kbd       — single key badge (renders children as Text in a View)
 *   KbdGroup  — row of multiple Kbd badges with gap
 *
 * Props:
 *   Both components accept className + any ViewProps.
 *   On mobile these are purely informational / decorative;
 *   keyboard shortcuts don't apply on touch devices.
 */

import * as React from "react";
import { Text, View, type ViewProps } from "react-native";

import { cn } from "@/lib/utils";

// ─── Kbd ──────────────────────────────────────────────────────────────────────

export interface KbdProps extends ViewProps {
  className?: string;
  children?: React.ReactNode;
}

function Kbd({ className, children, ...props }: KbdProps) {
  return (
    <View
      className={cn(
        "flex-row items-center justify-center rounded-sm bg-muted px-1 min-h-5 min-w-5",
        className,
      )}
      accessibilityRole="none"
      {...props}
    >
      {typeof children === "string" ? (
        <Text className="text-xs font-medium font-mono text-muted-foreground">
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
Kbd.displayName = "Kbd";

// ─── KbdGroup ─────────────────────────────────────────────────────────────────

function KbdGroup({ className, children, ...props }: KbdProps) {
  return (
    <View
      className={cn("flex-row items-center gap-1", className)}
      {...props}
    >
      {children}
    </View>
  );
}
KbdGroup.displayName = "KbdGroup";

// ─── Exports ──────────────────────────────────────────────────────────────────

export { Kbd, KbdGroup };
