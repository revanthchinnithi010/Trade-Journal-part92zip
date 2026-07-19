/**
 * radio-group.tsx — React Native port
 *
 * Web source used @radix-ui/react-radio-group which provides a WAI-ARIA
 * radio group with roving tabindex and controlled/uncontrolled selection.
 *
 * Web → RN replacements:
 *   RadioGroupPrimitive.Root      → View with React context
 *   RadioGroupPrimitive.Item      → Pressable
 *   RadioGroupPrimitive.Indicator → inner View (filled circle)
 *   Circle icon (lucide)          → inner View with rounded-full
 *   HTMLElement refs              → View refs
 *   focus:outline-none / focus-visible:* → removed
 *   disabled:cursor-not-allowed   → removed
 *
 * Preserved API:
 *   RadioGroup          — forwardRef View container with context
 *   RadioGroupItem      — forwardRef Pressable item
 *   RadioGroupProps     — interface exported for typing
 *   RadioGroupItemProps — interface exported for typing
 *   value               — controlled selection string
 *   defaultValue        — uncontrolled initial selection
 *   onValueChange       — callback(string) on item press
 *   disabled            — group-level + item-level disable
 */

import * as React from "react";
import { Pressable, View, type PressableProps, type ViewProps } from "react-native";

import { cn } from "@/lib/utils";

// ─── Context ──────────────────────────────────────────────────────────────────

interface RadioGroupContextValue {
  value: string | undefined;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue>({
  value: undefined,
  onValueChange: () => {},
  disabled: false,
});

// ─── RadioGroup ───────────────────────────────────────────────────────────────

export interface RadioGroupProps extends ViewProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

const RadioGroup = React.forwardRef<View, RadioGroupProps>(
  (
    { className, value: valueProp, defaultValue, onValueChange, disabled, ...props },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState<string | undefined>(
      defaultValue,
    );
    const isControlled = valueProp !== undefined;
    const value = isControlled ? valueProp : internalValue;

    const handleValueChange = React.useCallback(
      (newValue: string) => {
        if (!isControlled) setInternalValue(newValue);
        onValueChange?.(newValue);
      },
      [isControlled, onValueChange],
    );

    return (
      <RadioGroupContext.Provider
        value={{ value, onValueChange: handleValueChange, disabled }}
      >
        <View
          ref={ref}
          accessibilityRole="radiogroup"
          className={cn("gap-2", className)}
          {...props}
        />
      </RadioGroupContext.Provider>
    );
  },
);
RadioGroup.displayName = "RadioGroup";

// ─── RadioGroupItem ───────────────────────────────────────────────────────────

export interface RadioGroupItemProps extends Omit<PressableProps, "onPress" | "ref"> {
  /** Item identifier — matched against RadioGroup value. */
  value: string;
  disabled?: boolean;
}

const RadioGroupItem = React.forwardRef<View, RadioGroupItemProps>(
  ({ className, value, disabled: itemDisabled, ...props }, ref) => {
    const ctx = React.useContext(RadioGroupContext);
    const isSelected = ctx.value === value;
    const isDisabled = itemDisabled ?? ctx.disabled ?? false;

    return (
      <Pressable
        ref={ref}
        onPress={() => {
          if (!isDisabled) ctx.onValueChange(value);
        }}
        disabled={isDisabled}
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected, disabled: isDisabled }}
        className={cn(
          "aspect-square h-4 w-4 rounded-full border border-primary items-center justify-center shadow",
          isDisabled && "opacity-50",
          className,
        )}
        {...props}
      >
        {isSelected && (
          <View className="h-2 w-2 rounded-full bg-primary" />
        )}
      </Pressable>
    );
  },
);
RadioGroupItem.displayName = "RadioGroupItem";

export { RadioGroup, RadioGroupItem };
