/**
 * select.tsx — React Native port
 *
 * Web source: @radix-ui/react-select
 *
 * Web → RN replacements:
 *   SelectPrimitive.Root       → React context (value + open state)
 *   SelectPrimitive.Trigger    → Pressable that opens bottom sheet
 *   SelectPrimitive.Portal     → pass-through (no DOM portals in RN)
 *   SelectPrimitive.Content    → Modal bottom sheet (same pattern as drawer.tsx)
 *   SelectPrimitive.Viewport   → ScrollView
 *   SelectPrimitive.Item       → Pressable with checkmark indicator
 *   SelectPrimitive.ItemText   → Text
 *   SelectPrimitive.ItemIndicator → View with ✓ icon
 *   SelectPrimitive.Label      → Text (group label)
 *   SelectPrimitive.Separator  → View divider
 *   SelectPrimitive.Group      → View (grouping only)
 *   SelectPrimitive.Value      → Text showing current display value
 *   SelectPrimitive.ScrollUpButton/ScrollDownButton → removed (ScrollView handles it)
 *   ChevronDown/ChevronUp      → Unicode ▾ / ▴ via Text
 *   Check icon                 → "✓" Text
 *   position="popper"          → ignored (bottom sheet always)
 *
 * Preserved API:
 *   Select, SelectGroup, SelectValue, SelectTrigger
 *   SelectContent, SelectLabel, SelectItem, SelectSeparator
 *   SelectScrollUpButton, SelectScrollDownButton (no-op stubs)
 *   value, defaultValue, onValueChange, open, defaultOpen, onOpenChange, disabled
 */

import * as React from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type PressableProps,
  type ScrollViewProps,
  type ViewProps,
  type TextProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Animation hook (bottom sheet) ───────────────────────────────────────────

function useSheetAnim(open: boolean) {
  const anim = React.useRef(new Animated.Value(open ? 1 : 0)).current;
  const [visible, setVisible] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.spring(anim, {
        toValue: 1,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }
  }, [open, anim]);

  return { anim, visible };
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface SelectContextValue {
  value: string | undefined;
  onValueChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  /** Display label for the currently selected value */
  displayLabel: string | undefined;
  setDisplayLabel: (label: string) => void;
  placeholder?: string;
}

const SelectContext = React.createContext<SelectContextValue>({
  value: undefined,
  onValueChange: () => {},
  open: false,
  onOpenChange: () => {},
  disabled: false,
  displayLabel: undefined,
  setDisplayLabel: () => {},
});

// ─── Select (Root) ────────────────────────────────────────────────────────────

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
  /** API compat — accepted but ignored */
  dir?: "ltr" | "rtl";
  name?: string;
  required?: boolean;
}

function Select({
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  children,
}: SelectProps) {
  const isValueControlled = valueProp !== undefined;
  const isOpenControlled = openProp !== undefined;

  const [internalValue, setInternalValue] = React.useState<string | undefined>(defaultValue);
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const [displayLabel, setDisplayLabel] = React.useState<string | undefined>(undefined);

  const value = isValueControlled ? valueProp : internalValue;
  const open = isOpenControlled ? openProp! : internalOpen;

  const handleValueChange = React.useCallback(
    (v: string) => {
      if (!isValueControlled) setInternalValue(v);
      onValueChange?.(v);
    },
    [isValueControlled, onValueChange],
  );

  const handleOpenChange = React.useCallback(
    (o: boolean) => {
      if (!isOpenControlled) setInternalOpen(o);
      onOpenChange?.(o);
    },
    [isOpenControlled, onOpenChange],
  );

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange: handleValueChange,
        open,
        onOpenChange: handleOpenChange,
        disabled,
        displayLabel,
        setDisplayLabel,
      }}
    >
      {children}
    </SelectContext.Provider>
  );
}
Select.displayName = "Select";

// ─── SelectGroup ──────────────────────────────────────────────────────────────

function SelectGroup({ children, ...props }: ViewProps) {
  return <View {...props}>{children}</View>;
}
SelectGroup.displayName = "SelectGroup";

// ─── SelectValue ──────────────────────────────────────────────────────────────

export interface SelectValueProps extends TextProps {
  placeholder?: string;
}

function SelectValue({ className, placeholder, ...props }: SelectValueProps) {
  const { displayLabel, value } = React.useContext(SelectContext);
  const display = displayLabel ?? value;
  return (
    <Text
      className={cn(
        "text-sm flex-1",
        display ? "text-foreground" : "text-muted-foreground",
        className,
      )}
      numberOfLines={1}
      {...props}
    >
      {display ?? placeholder ?? "Select…"}
    </Text>
  );
}
SelectValue.displayName = "SelectValue";

// ─── SelectTrigger ────────────────────────────────────────────────────────────

export interface SelectTriggerProps extends Omit<PressableProps, "children"> {
  className?: string;
  children?: React.ReactNode;
}

const SelectTrigger = React.forwardRef<View, SelectTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const { open, onOpenChange, disabled } = React.useContext(SelectContext);

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        onPress={() => onOpenChange(!open)}
        className={cn(
          "flex-row h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      >
        {children}
        <Text className="text-muted-foreground text-xs ml-2">{"▾"}</Text>
      </Pressable>
    );
  },
);
SelectTrigger.displayName = "SelectTrigger";

// ─── SelectScrollUpButton / SelectScrollDownButton (stubs) ────────────────────

const SelectScrollUpButton = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View ref={ref} className={cn("items-center justify-center py-1", className)} {...props}>
      <Text className="text-xs text-muted-foreground">{"▴"}</Text>
    </View>
  ),
);
SelectScrollUpButton.displayName = "SelectScrollUpButton";

const SelectScrollDownButton = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View ref={ref} className={cn("items-center justify-center py-1", className)} {...props}>
      <Text className="text-xs text-muted-foreground">{"▾"}</Text>
    </View>
  ),
);
SelectScrollDownButton.displayName = "SelectScrollDownButton";

// ─── SelectContent ────────────────────────────────────────────────────────────

export interface SelectContentProps extends ViewProps {
  position?: "popper" | "item-aligned"; // API compat — ignored in RN
}

const SelectContent = React.forwardRef<ScrollView, SelectContentProps>(
  ({ className, children, position: _pos, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(SelectContext);
    const { height: screenHeight } = useWindowDimensions();
    const { anim, visible } = useSheetAnim(open);

    const translateY = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [screenHeight, 0],
    });

    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={() => onOpenChange(false)}
        statusBarTranslucent
      >
        {/* Backdrop */}
        <Animated.View
          className="absolute inset-0 bg-black/80"
          style={{ opacity: anim }}
          pointerEvents="box-none"
        >
          <Pressable className="flex-1" onPress={() => onOpenChange(false)} />
        </Animated.View>

        {/* Bottom sheet */}
        <View className="flex-1 justify-end" pointerEvents="box-none">
          <Animated.View
            style={{ transform: [{ translateY }] }}
            className="rounded-t-xl bg-popover border-t border-border"
          >
            {/* Drag handle */}
            <View className="items-center pt-3 pb-1">
              <View className="h-1.5 w-12 rounded-full bg-muted" />
            </View>

            <ScrollView
              ref={ref}
              className={cn("max-h-80 p-1", className)}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    );
  },
);
SelectContent.displayName = "SelectContent";

// ─── SelectLabel ──────────────────────────────────────────────────────────────

const SelectLabel = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("px-2 py-1.5 text-sm font-semibold text-foreground", className)}
      {...props}
    />
  ),
);
SelectLabel.displayName = "SelectLabel";

// ─── SelectItem ───────────────────────────────────────────────────────────────

export interface SelectItemProps extends Omit<PressableProps, "children"> {
  className?: string;
  value: string;
  disabled?: boolean;
  textValue?: string; // display text (defaults to children text)
  children?: React.ReactNode;
}

const SelectItem = React.forwardRef<View, SelectItemProps>(
  ({ className, value: itemValue, disabled = false, textValue, children, ...props }, ref) => {
    const { value, onValueChange, onOpenChange, setDisplayLabel } =
      React.useContext(SelectContext);

    const isSelected = value === itemValue;

    // Register display label so SelectValue can show it
    React.useEffect(() => {
      if (isSelected) {
        setDisplayLabel(textValue ?? (typeof children === "string" ? children : ""));
      }
    }, [isSelected, textValue, children, setDisplayLabel]);

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        accessibilityRole="menuitem"
        accessibilityState={{ disabled, selected: isSelected }}
        onPress={() => {
          onValueChange(itemValue);
          setDisplayLabel(textValue ?? (typeof children === "string" ? children : ""));
          onOpenChange(false);
        }}
        className={cn(
          "relative flex-row w-full items-center rounded-sm py-1.5 pl-2 pr-8",
          disabled && "opacity-50",
          isSelected && "bg-accent",
          className,
        )}
        {...props}
      >
        {/* Check indicator on the right */}
        {isSelected && (
          <View className="absolute right-2 h-3.5 w-3.5 items-center justify-center">
            <Text className="text-xs text-foreground">{"✓"}</Text>
          </View>
        )}
        <Text
          className={cn(
            "text-sm flex-1",
            isSelected ? "text-accent-foreground font-medium" : "text-foreground",
          )}
          numberOfLines={1}
        >
          {children}
        </Text>
      </Pressable>
    );
  },
);
SelectItem.displayName = "SelectItem";

// ─── SelectSeparator ──────────────────────────────────────────────────────────

const SelectSeparator = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-muted", className)}
      {...props}
    />
  ),
);
SelectSeparator.displayName = "SelectSeparator";

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
