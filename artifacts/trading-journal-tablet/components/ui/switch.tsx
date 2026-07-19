/**
 * switch.tsx — React Native port
 *
 * Web source used @radix-ui/react-switch which renders a toggle button
 * with a sliding thumb and WAI-ARIA role="switch".
 *
 * Web → RN replacements:
 *   SwitchPrimitives.Root  → Pressable (track)
 *   SwitchPrimitives.Thumb → Animated.View (sliding thumb)
 *   data-[state=checked]:* → conditional className + Animated.timing
 *   focus-visible:*        → removed
 *   pointer-events-none    → removed from thumb (no pointer events in RN)
 *   disabled:cursor-not-allowed → removed
 *
 * Preserved API:
 *   Switch        — forwardRef Pressable component
 *   SwitchProps   — interface exported for typing
 *   checked       — controlled checked state
 *   defaultChecked — uncontrolled initial state
 *   onCheckedChange — callback(boolean) on toggle
 *   disabled      — disables interaction + 50% opacity
 *   className     — NativeWind class string
 */

import * as React from "react";
import { Animated, Pressable, View, type PressableProps } from "react-native";

import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SwitchProps extends Omit<PressableProps, "onPress" | "ref"> {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Switch = React.forwardRef<View, SwitchProps>(
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

    // Thumb slides 0 → 16px when checked (track w-9=36px, thumb w-4=16px, border-2×2=4px → travel ≈16px)
    const translateX = React.useRef(new Animated.Value(checked ? 16 : 0)).current;

    React.useEffect(() => {
      Animated.timing(translateX, {
        toValue: checked ? 16 : 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }, [checked, translateX]);

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
        accessibilityRole="switch"
        accessibilityState={{ checked, disabled: disabled ?? false }}
        className={cn(
          "inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent",
          checked ? "bg-primary" : "bg-input",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      >
        <Animated.View
          className="h-4 w-4 rounded-full bg-background shadow-lg"
          style={{ transform: [{ translateX }] }}
        />
      </Pressable>
    );
  },
);
Switch.displayName = "Switch";

export { Switch };
