/**
 * badge.tsx — React Native port
 *
 * Web → RN replacements:
 *   div                  → View (flex-row for badge pill shape)
 *   HTMLAttributes<div>  → ViewProps
 *   hover-elevate        → removed (no hover on native)
 *   focus:ring-*         → removed (no focus rings on native)
 *   whitespace-nowrap    → enforced via numberOfLines on child Text
 *
 * The `outline` variant's [border-color:var(--badge-outline)] CSS-var class
 * is replaced with an inline style using the design-token value
 * (rgba(255,255,255,0.04) for dark, which is the --badge-outline dark value).
 * Consumers on light theme should override via style prop.
 *
 * Preserved API:
 *   Badge component — className, variant, style, children
 *   badgeVariants   — exported for composing class strings elsewhere
 *   BadgeProps      — interface exported for typing
 *
 * Usage in RN:
 *   <Badge variant="default">
 *     <Text>Label</Text>
 *   </Badge>
 */

import * as React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Base: flex-row pill shape — removed web-only: hover-elevate, focus:*, whitespace-nowrap
  "flex-row items-center rounded-md border px-2.5 py-0.5",
  {
    variants: {
      variant: {
        default:     "border-transparent bg-primary",
        secondary:   "border-transparent bg-secondary",
        destructive: "border-transparent bg-destructive",
        outline:     "border-border bg-transparent",     // border-color set inline
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends ViewProps,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, style, ...props }: BadgeProps) {
  // outline variant: apply --badge-outline token value as inline border colour.
  // Design token: rgba(255,255,255,0.04) for dark (see index.css :root).
  const outlineStyle =
    variant === "outline" ? styles.outlineBorder : undefined;

  return (
    <View
      className={cn(badgeVariants({ variant }), className)}
      style={[outlineStyle, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  // --badge-outline dark: rgba(255,255,255,0.04)
  outlineBorder: {
    borderColor: "rgba(255,255,255,0.04)",
  },
});

export { Badge, badgeVariants };
