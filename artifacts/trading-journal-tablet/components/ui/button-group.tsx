/**
 * button-group.tsx — React Native port
 *
 * Web source used div containers with complex CSS sibling/child selectors.
 * React Native replaces those with explicit flex layouts and borderRadius
 * overrides applied by the group to its children through a StyleSheet.
 *
 * Web → RN replacements:
 *   div → View
 *   Slot / asChild → removed (not applicable in RN; use render props or
 *                    plain children instead)
 *   Complex CSS selectors in CVA (has-[], [&>*:not(:first-child)]:*, etc.)
 *     → removed; RN child styling is done via explicit style props or
 *       cloneElement when needed. For this primitive, groups are visual
 *       wrappers only — border-radius flattening between adjacent items
 *       must be handled by the consumer or a future RN-specific utility.
 *
 * Preserved API:
 *   ButtonGroup          — View wrapper with orientation flex direction
 *   ButtonGroupText      — View with muted background + border (label chip)
 *   ButtonGroupSeparator — thin Separator between group items
 *   buttonGroupVariants  — cva factory exported for external composition
 *   orientation          — "horizontal" (default) | "vertical"
 *
 * Note on border-radius joining:
 *   The web version uses CSS selectors to strip inner radii between adjacent
 *   buttons. This is not feasible in RN without measuring children. Consumers
 *   who need the joined look should pass explicit borderRadius overrides to
 *   each child button via style prop.
 */

import * as React from "react";
import { View, type ViewProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import type { SeparatorProps } from "@/components/ui/separator";

// ─── Variants ────────────────────────────────────────────────────────────────
// Removed web-only CSS selectors; orientation sets flex direction only.

const buttonGroupVariants = cva(
  "flex items-stretch gap-0",
  {
    variants: {
      orientation: {
        horizontal: "flex-row",
        vertical:   "flex-col",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

// ─── ButtonGroup ──────────────────────────────────────────────────────────────

function ButtonGroup({
  className,
  orientation,
  ...props
}: ViewProps & VariantProps<typeof buttonGroupVariants>) {
  return (
    <View
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

// ─── ButtonGroupText ──────────────────────────────────────────────────────────
// Displays a non-interactive label chip inside a ButtonGroup.
// Web had asChild via Slot — removed in RN; always renders a View.

function ButtonGroupText({
  className,
  ...props
}: ViewProps) {
  return (
    <View
      className={cn(
        "bg-muted flex-row items-center gap-2 rounded-md border border-border px-4 text-sm font-medium",
        className,
      )}
      {...props}
    />
  );
}

// ─── ButtonGroupSeparator ─────────────────────────────────────────────────────

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: SeparatorProps) {
  return (
    <Separator
      orientation={orientation}
      className={cn("bg-input self-stretch", className)}
      {...props}
    />
  );
}

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
};
