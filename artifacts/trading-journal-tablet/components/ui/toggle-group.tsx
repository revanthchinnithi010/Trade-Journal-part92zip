/**
 * toggle-group.tsx — React Native port
 *
 * Web source used @radix-ui/react-toggle-group which provides a WAI-ARIA
 * roving-tabindex group with controlled single/multiple selection.
 *
 * In React Native both concepts are handled by a View container with a
 * React context that tracks selected values and passes them to ToggleGroupItem.
 *
 * Web → RN replacements:
 *   ToggleGroupPrimitive.Root → View
 *   ToggleGroupPrimitive.Item → Pressable (via Toggle logic, embedded here)
 *   "use client" directive    → removed
 *   HTMLElement refs          → View refs
 *
 * Preserved API:
 *   ToggleGroup      — container component
 *     type           — "single" | "multiple"
 *     value          — controlled selection (string for single, string[] for multiple)
 *     defaultValue   — uncontrolled initial selection
 *     onValueChange  — callback(newValue)
 *     variant / size — forwarded to items via context
 *   ToggleGroupItem  — individual item
 *     value          — item identifier string (required)
 *     disabled       — disables this item
 *
 * Note: ToggleGroupItem imports toggleVariants from "./toggle" — same as web.
 */

import * as React from "react";
import {
  Pressable,
  View,
  type PressableProps,
  type ViewProps,
} from "react-native";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { toggleVariants } from "@/components/ui/toggle";

// ─── Internal context ─────────────────────────────────────────────────────────

interface ToggleGroupCtx extends VariantProps<typeof toggleVariants> {
  type:          "single" | "multiple";
  value:         string[];
  onItemPress:   (itemValue: string) => void;
}

const ToggleGroupContext = React.createContext<ToggleGroupCtx>({
  type:        "single",
  variant:     "default",
  size:        "default",
  value:       [],
  onItemPress: () => {},
});

// ─── ToggleGroup ──────────────────────────────────────────────────────────────

export interface ToggleGroupSingleProps extends ViewProps, VariantProps<typeof toggleVariants> {
  type:           "single";
  value?:         string;
  defaultValue?:  string;
  onValueChange?: (value: string) => void;
}

export interface ToggleGroupMultipleProps extends ViewProps, VariantProps<typeof toggleVariants> {
  type:           "multiple";
  value?:         string[];
  defaultValue?:  string[];
  onValueChange?: (value: string[]) => void;
}

type ToggleGroupProps = ToggleGroupSingleProps | ToggleGroupMultipleProps;

const ToggleGroup = React.forwardRef<View, ToggleGroupProps>(
  ({ className, variant, size, children, ...props }, ref) => {
    // ── Normalise single/multiple into a unified string[] state ────────────
    const isSingle = props.type === "single";

    const toArray = (v: string | string[] | undefined): string[] => {
      if (v === undefined) return [];
      return Array.isArray(v) ? v : [v];
    };

    const initialValue = toArray(
      isSingle
        ? (props as ToggleGroupSingleProps).defaultValue
        : (props as ToggleGroupMultipleProps).defaultValue,
    );

    const [internalValue, setInternalValue] = React.useState<string[]>(initialValue);

    // Controlled: prefer props.value; fall back to internal state.
    const controlledRaw = isSingle
      ? (props as ToggleGroupSingleProps).value
      : (props as ToggleGroupMultipleProps).value;
    const controlled = controlledRaw !== undefined;
    const value: string[] = controlled ? toArray(controlledRaw) : internalValue;

    const handleItemPress = React.useCallback(
      (itemValue: string) => {
        let next: string[];

        if (isSingle) {
          // Toggle off if already selected; otherwise select.
          next = value.includes(itemValue) ? [] : [itemValue];
        } else {
          next = value.includes(itemValue)
            ? value.filter((v) => v !== itemValue)
            : [...value, itemValue];
        }

        if (!controlled) setInternalValue(next);

        if (isSingle) {
          (props as ToggleGroupSingleProps).onValueChange?.(next[0] ?? "");
        } else {
          (props as ToggleGroupMultipleProps).onValueChange?.(next);
        }
      },
      [value, isSingle, controlled, props],
    );

    // Strip union-specific props before forwarding to View.
    // Cast to a flat object type so TS can create a rest type from it.
    const {
      type: _type,
      value: _value,
      defaultValue: _defaultValue,
      onValueChange: _onValueChange,
      ...viewProps
    } = props as ViewProps & {
      type:           "single" | "multiple";
      value?:         unknown;
      defaultValue?:  unknown;
      onValueChange?: unknown;
    };

    return (
      <ToggleGroupContext.Provider
        value={{ type: props.type, variant, size, value, onItemPress: handleItemPress }}
      >
        <View
          ref={ref}
          className={cn("flex-row items-center justify-center gap-1", className)}
          {...viewProps}
        >
          {children}
        </View>
      </ToggleGroupContext.Provider>
    );
  },
);
ToggleGroup.displayName = "ToggleGroup";

// ─── ToggleGroupItem ─────────────────────────────────────────────────────────

export interface ToggleGroupItemProps
  extends Omit<PressableProps, "onPress">,
    VariantProps<typeof toggleVariants> {
  /** Item identifier — used to track selection. */
  value: string;
}

const ToggleGroupItem = React.forwardRef<View, ToggleGroupItemProps>(
  ({ className, children, value, variant, size, disabled, style, ...props }, ref) => {
    const ctx = React.useContext(ToggleGroupContext);
    const isPressed = ctx.value.includes(value);

    // Context variant/size take precedence; item-level props override only if ctx is default.
    const resolvedVariant = ctx.variant ?? variant ?? "default";
    const resolvedSize    = ctx.size    ?? size    ?? "default";

    return (
      <Pressable
        ref={ref}
        onPress={() => ctx.onItemPress(value)}
        disabled={disabled}
        accessibilityRole="togglebutton"
        accessibilityState={{ checked: isPressed, disabled: disabled ?? false }}
        className={cn(
          toggleVariants({ variant: resolvedVariant, size: resolvedSize }),
          isPressed  && "bg-accent",
          disabled   && "opacity-50",
          className,
        )}
        style={style}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
ToggleGroupItem.displayName = "ToggleGroupItem";

export { ToggleGroup, ToggleGroupItem };
