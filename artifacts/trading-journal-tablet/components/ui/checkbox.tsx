/**
 * checkbox.tsx — React Native port
 *
 * Web source used @radix-ui/react-checkbox which renders an accessible
 * checkbox with a hidden <input type="checkbox"> and a styled indicator.
 *
 * Web → RN replacements:
 *   CheckboxPrimitive.Root      → Pressable
 *   CheckboxPrimitive.Indicator → View (conditional render)
 *   Check icon (lucide)         → Text "✓" (unicode check)
 *   HTMLElement ref             → View ref
 *   data-[state=checked]:*      → conditional className via checked state
 *   focus-visible:*             → removed
 *   disabled:cursor-not-allowed → removed
 *
 * Preserved API:
 *   Checkbox          — forwardRef Pressable component
 *   CheckboxProps     — interface exported for typing
 *   checked           — controlled checked state
 *   defaultChecked    — uncontrolled initial state
 *   onCheckedChange   — callback(boolean) on toggle
 *   disabled          — disables interaction + 50% opacity
 *   className         — NativeWind class string
 */

import * as React from "react";
import { Pressable, Text, View, type PressableProps } from "react-native";

import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CheckboxProps extends Omit<PressableProps, "onPress" | "ref"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Checkbox = React.forwardRef<View, CheckboxProps>(
  (
    {
      className,
      checked: checkedProp,
      defaultChecked = false,
      onCheckedChange,
      disabled,
      ...props
    },
    ref,
  ) => {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked);
    const isControlled = checkedProp !== undefined;
    const checked = isControlled ? (checkedProp ?? false) : internalChecked;

    const handlePress = () => {
      if (disabled) return;
      const next = !checked;
      if (!isControlled) setInternalChecked(next);
      onCheckedChange?.(next);
    };

    return (
      <Pressable
        ref={ref}
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: disabled ?? false }}
        className={cn(
          "h-4 w-4 shrink-0 rounded-sm border border-primary items-center justify-center shadow",
          checked && "bg-primary",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      >
        {checked && (
          <Text className="text-primary-foreground text-[10px] font-bold leading-none">
            ✓
          </Text>
        )}
      </Pressable>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
