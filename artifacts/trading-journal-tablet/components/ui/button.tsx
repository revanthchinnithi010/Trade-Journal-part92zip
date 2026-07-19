/**
 * button.tsx — React Native port
 *
 * Web source used a <button> element with Radix Slot (for asChild composition)
 * and CVA variants.
 *
 * Web → RN replacements:
 *   button element     → Pressable
 *   Slot / asChild     → removed (Slot is a DOM/web pattern; not needed in RN)
 *   HTMLButtonElement  → View
 *   ButtonHTMLAttributes→ PressableProps
 *   onClick            → onPress (native event model)
 *   hover-elevate      → removed (no hover on native)
 *   active-elevate-2   → handled via Pressable's style callback
 *   focus-visible:*    → removed
 *   [&_svg]:*          → removed
 *   var(--button-outline) → inline style borderColor
 *
 * Text colour inheritance:
 *   NativeWind v4 propagates text- colours to child <Text> nodes via context.
 *   Consumers should still wrap string content in <Text> for correctness.
 *
 * Preserved API:
 *   Button          — forwardRef Pressable component
 *   buttonVariants  — cva factory exported for external class composition
 *   ButtonProps     — interface exported for typing
 *   variant         — "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
 *   size            — "default" | "sm" | "lg" | "icon"
 *   disabled        — disables interaction + 50% opacity
 *
 * Removed:
 *   asChild / Slot  — no RN equivalent; use composition instead
 */

import * as React from "react";
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type View,
} from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ─── Variants ─────────────────────────────────────────────────────────────────
// Removed web-only: hover-elevate, active-elevate-2, focus-visible:*, [&_svg]:*
// Removed CSS-var class [border-color:var(--button-outline)] → inline style below.

const buttonVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default:     "bg-primary border border-primary",
        destructive: "bg-destructive border border-destructive",
        outline:     "border bg-transparent",        // border-color set via inline style
        secondary:   "border bg-secondary border-secondary",
        ghost:       "border border-transparent bg-transparent",
        link:        "bg-transparent border-transparent",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm:      "min-h-8 rounded-md px-3",
        lg:      "min-h-10 rounded-md px-8",
        icon:    "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size:    "default",
    },
  },
);

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ButtonProps
  extends PressableProps,
    VariantProps<typeof buttonVariants> {
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Button = React.forwardRef<View, ButtonProps>(
  (
    { className, variant, size, disabled, style, children, ...props },
    ref,
  ) => {
    // outline variant: --button-outline dark = rgba(255,255,255,0.06)
    const outlineStyle =
      variant === "outline" ? styles.outlineBorder : undefined;

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled ?? false }}
        className={cn(
          buttonVariants({ variant, size }),
          disabled && "opacity-50",
          className,
        )}
        style={(state) => [
          outlineStyle,
          // active-elevate-2 equivalent: subtle opacity dip on press
          state.pressed && !disabled ? styles.pressed : undefined,
          typeof style === "function" ? style(state) : style,
        ]}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
Button.displayName = "Button";

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // --button-outline dark: rgba(255,255,255,0.06)
  outlineBorder: {
    borderColor: "rgba(255,255,255,0.06)",
  },
  // Mirrors active-elevate-2 / press feedback
  pressed: {
    opacity: 0.85,
  },
});

export { Button, buttonVariants };
