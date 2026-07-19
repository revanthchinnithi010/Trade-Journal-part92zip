/**
 * toggle.tsx — React Native port
 *
 * Web source used @radix-ui/react-toggle which wraps a <button> element and
 * manages aria-pressed / data-[state=on] attributes for CSS targeting.
 *
 * In React Native there is no CSS data-attribute targeting, so the pressed
 * state is resolved explicitly in the component and merged into className.
 *
 * Web → RN replacements:
 *   TogglePrimitive.Root → Pressable
 *   data-[state=on]:*    → conditional className based on `pressed` boolean
 *   hover:*              → removed (no hover on native)
 *   focus-visible:*      → removed (no focus rings on native)
 *   [&_svg]:*            → removed (SVG selector not applicable)
 *   disabled:*           → Pressable `disabled` prop + opacity style
 *   HTMLElement ref      → View ref
 *
 * Preserved API:
 *   Toggle         — forwardRef component
 *   toggleVariants — cva factory exported for ToggleGroup reuse
 *   variant        — "default" | "outline"
 *   size           — "default" | "sm" | "lg"
 *   pressed        — controlled pressed state
 *   defaultPressed — uncontrolled initial state (default false)
 *   onPressedChange(pressed: boolean) — callback
 *   disabled       — disables interaction + applies 50% opacity
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
// Web-only tokens removed: hover:*, focus-visible:*, data-[state=on]:*, [&_svg]:*
// Pressed / active styling is applied imperatively in the component below.

const toggleVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-transparent",
      },
      size: {
        default: "h-9 px-2 min-w-9",
        sm:      "h-8 px-1.5 min-w-8",
        lg:      "h-10 px-2.5 min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size:    "default",
    },
  },
);

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ToggleProps
  extends Omit<PressableProps, "onPress">,
    VariantProps<typeof toggleVariants> {
  /** Controlled pressed state. */
  pressed?: boolean;
  /** Initial pressed state for uncontrolled usage. */
  defaultPressed?: boolean;
  /** Called with the new pressed value after each press. */
  onPressedChange?: (pressed: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Toggle = React.forwardRef<View, ToggleProps>(
  (
    {
      className,
      variant,
      size,
      pressed: controlledPressed,
      defaultPressed = false,
      onPressedChange,
      disabled,
      style,
      children,
      ...props
    },
    ref,
  ) => {
    const [internalPressed, setInternalPressed] =
      React.useState(defaultPressed);

    // If `pressed` is provided, use it (controlled); otherwise use local state.
    const isPressed =
      controlledPressed !== undefined ? controlledPressed : internalPressed;

    const handlePress = React.useCallback(() => {
      const next = !isPressed;
      if (controlledPressed === undefined) setInternalPressed(next);
      onPressedChange?.(next);
    }, [isPressed, controlledPressed, onPressedChange]);

    return (
      <Pressable
        ref={ref}
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="togglebutton"
        accessibilityState={{ checked: isPressed, disabled: disabled ?? false }}
        className={cn(
          toggleVariants({ variant, size }),
          // Active state: bg-accent text-accent-foreground (mirrors data-[state=on]:*)
          isPressed && "bg-accent",
          // Disabled state: mirrors disabled:opacity-50 disabled:pointer-events-none
          disabled && "opacity-50",
          className,
        )}
        style={[disabled ? styles.disabled : undefined, style]}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
Toggle.displayName = "Toggle";

const styles = StyleSheet.create({
  disabled: { pointerEvents: "none" } as object,
});

export { Toggle, toggleVariants };
