/**
 * context-menu.tsx — React Native port (redesigned as Long-Press → Bottom Sheet)
 *
 * Web source: @radix-ui/react-context-menu
 *
 * WHY THE REDESIGN:
 *   A context menu is triggered by right-click (desktop) which doesn't exist on
 *   mobile. The natural mobile equivalent is a long-press action sheet.
 *
 *   This implementation uses the same Modal + Animated.View bottom-sheet
 *   pattern already established in drawer.tsx (Phase 2.3).
 *
 * Web → RN replacements:
 *   ContextMenuPrimitive.Root        → React context (open state)
 *   ContextMenuPrimitive.Trigger     → Pressable with onLongPress to open sheet
 *   ContextMenuPrimitive.Portal      → pass-through
 *   ContextMenuPrimitive.Content     → Modal bottom sheet
 *   ContextMenuPrimitive.Item        → Pressable row
 *   ContextMenuPrimitive.CheckboxItem→ Pressable row with checkmark state
 *   ContextMenuPrimitive.RadioGroup  → context with value/onValueChange
 *   ContextMenuPrimitive.RadioItem   → Pressable row with radio indicator
 *   ContextMenuPrimitive.Label       → Text label
 *   ContextMenuPrimitive.Separator   → View divider
 *   ContextMenuPrimitive.Sub         → stub (sub-menus unsupported; renders inline)
 *   ContextMenuPrimitive.SubTrigger  → Pressable (stub — no nested sheet)
 *   ContextMenuPrimitive.SubContent  → View (stub — renders children inline)
 *   Check (lucide)                   → "✓" Text
 *   Circle (lucide)                  → "●" Text
 *   ChevronRight (lucide)            → "›" Text
 *   inset prop                       → pl-8 left padding
 *
 * Preserved exports (all 14):
 *   ContextMenu, ContextMenuTrigger, ContextMenuContent
 *   ContextMenuItem, ContextMenuCheckboxItem, ContextMenuRadioItem
 *   ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut
 *   ContextMenuGroup, ContextMenuPortal
 *   ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger
 *   ContextMenuRadioGroup
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
  type ViewProps,
  type TextProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Bottom-sheet animation ───────────────────────────────────────────────────

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

// ─── Root context ─────────────────────────────────────────────────────────────

interface ContextMenuContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ContextMenuContext = React.createContext<ContextMenuContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ─── Radio group context ──────────────────────────────────────────────────────

interface RadioGroupContextValue {
  value: string | undefined;
  onValueChange: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue>({
  value: undefined,
  onValueChange: () => {},
});

// ─── ContextMenu (Root) ───────────────────────────────────────────────────────

export interface ContextMenuProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** API compat — modal behaviour controlled by Modal component */
  modal?: boolean;
  children?: React.ReactNode;
}

function ContextMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  modal: _modal,
  children,
}: ContextMenuProps) {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = isControlled ? openProp! : internalOpen;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  return (
    <ContextMenuContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </ContextMenuContext.Provider>
  );
}
ContextMenu.displayName = "ContextMenu";

// ─── ContextMenuTrigger ───────────────────────────────────────────────────────

const ContextMenuTrigger = React.forwardRef<
  View,
  Omit<PressableProps, "children"> & { children?: React.ReactNode; asChild?: boolean }
>(({ onLongPress, onPress: _onPress, asChild: _asChild, children, ...props }, ref) => {
  const { onOpenChange } = React.useContext(ContextMenuContext);

  return (
    <Pressable
      ref={ref}
      onLongPress={(e) => {
        onOpenChange(true);
        onLongPress?.(e);
      }}
      delayLongPress={400}
      {...props}
    >
      {children}
    </Pressable>
  );
});
ContextMenuTrigger.displayName = "ContextMenuTrigger";

// ─── ContextMenuPortal ────────────────────────────────────────────────────────

function ContextMenuPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
ContextMenuPortal.displayName = "ContextMenuPortal";

// ─── ContextMenuContent ───────────────────────────────────────────────────────

export interface ContextMenuContentProps extends ViewProps {
  /** API compat — ignored in RN */
  alignOffset?: number;
  avoidCollisions?: boolean;
  collisionBoundary?: unknown;
  collisionPadding?: unknown;
  loop?: boolean;
  onCloseAutoFocus?: (e: Event) => void;
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
  onPointerDownOutside?: (e: unknown) => void;
  onFocusOutside?: (e: unknown) => void;
  onInteractOutside?: (e: unknown) => void;
  sticky?: "partial" | "always";
  hideWhenDetached?: boolean;
}

const ContextMenuContent = React.forwardRef<View, ContextMenuContentProps>(
  ({ className, children, ...rest }, ref) => {
    // Strip web-only props before spreading onto View
    const {
      alignOffset: _ao, avoidCollisions: _ac, collisionBoundary: _cb,
      collisionPadding: _cp, loop: _l, onCloseAutoFocus: _ocaf,
      onEscapeKeyDown: _oekd, onPointerDownOutside: _opdo,
      onFocusOutside: _ofo, onInteractOutside: _oio,
      sticky: _st, hideWhenDetached: _hwd,
      ...props
    } = rest;

    const { open, onOpenChange } = React.useContext(ContextMenuContext);
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
          className="absolute inset-0 bg-black/60"
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
              showsVerticalScrollIndicator={false}
              className={cn("max-h-96 p-1 pb-safe", className)}
              keyboardShouldPersistTaps="handled"
            >
              <View ref={ref} {...(props as ViewProps)}>
                {children}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    );
  },
);
ContextMenuContent.displayName = "ContextMenuContent";

// ─── ContextMenuItem ──────────────────────────────────────────────────────────

export interface ContextMenuItemProps
  extends Omit<PressableProps, "children"> {
  className?: string;
  inset?: boolean;
  disabled?: boolean;
  /** API compat — called when item is selected */
  onSelect?: (event: Event) => void;
  textValue?: string;
  children?: React.ReactNode;
}

const ContextMenuItem = React.forwardRef<View, ContextMenuItemProps>(
  ({ className, inset, disabled, onSelect: _os, textValue: _tv, children, onPress, ...props }, ref) => {
    const { onOpenChange } = React.useContext(ContextMenuContext);

    return (
      <Pressable
        ref={ref}
        disabled={!!disabled}
        accessibilityRole="menuitem"
        accessibilityState={{ disabled: !!disabled }}
        onPress={(e) => {
          onOpenChange(false);
          onPress?.(e);
        }}
        className={cn(
          "relative flex-row cursor-default items-center rounded-sm px-2 py-1.5",
          inset && "pl-8",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      >
        {typeof children === "string" ? (
          <Text className="text-sm text-foreground flex-1">{children}</Text>
        ) : (
          children
        )}
      </Pressable>
    );
  },
);
ContextMenuItem.displayName = "ContextMenuItem";

// ─── ContextMenuCheckboxItem ──────────────────────────────────────────────────

export interface ContextMenuCheckboxItemProps
  extends Omit<PressableProps, "children"> {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  onSelect?: (event: Event) => void;
  textValue?: string;
  children?: React.ReactNode;
}

const ContextMenuCheckboxItem = React.forwardRef<View, ContextMenuCheckboxItemProps>(
  (
    { className, children, checked, onCheckedChange, disabled, onSelect: _os, textValue: _tv, onPress, ...props },
    ref,
  ) => {
    const { onOpenChange } = React.useContext(ContextMenuContext);

    return (
      <Pressable
        ref={ref}
        disabled={!!disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!checked, disabled: !!disabled }}
        onPress={(e) => {
          onCheckedChange?.(!checked);
          onOpenChange(false);
          onPress?.(e);
        }}
        className={cn(
          "relative flex-row items-center rounded-sm py-1.5 pl-8 pr-2",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      >
        <View className="absolute left-2 h-3.5 w-3.5 items-center justify-center">
          {checked && <Text className="text-xs text-foreground">{"✓"}</Text>}
        </View>
        {typeof children === "string" ? (
          <Text className="text-sm text-foreground flex-1">{children}</Text>
        ) : (
          children
        )}
      </Pressable>
    );
  },
);
ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem";

// ─── ContextMenuRadioGroup ────────────────────────────────────────────────────

export interface ContextMenuRadioGroupProps extends ViewProps {
  value?: string;
  onValueChange?: (value: string) => void;
}

function ContextMenuRadioGroup({
  value,
  onValueChange,
  children,
  ...props
}: ContextMenuRadioGroupProps) {
  return (
    <RadioGroupContext.Provider
      value={{ value, onValueChange: onValueChange ?? (() => {}) }}
    >
      <View {...props}>{children}</View>
    </RadioGroupContext.Provider>
  );
}
ContextMenuRadioGroup.displayName = "ContextMenuRadioGroup";

// ─── ContextMenuRadioItem ─────────────────────────────────────────────────────

export interface ContextMenuRadioItemProps
  extends Omit<PressableProps, "children"> {
  className?: string;
  value: string;
  disabled?: boolean;
  onSelect?: (event: Event) => void;
  textValue?: string;
  children?: React.ReactNode;
}

const ContextMenuRadioItem = React.forwardRef<View, ContextMenuRadioItemProps>(
  ({ className, children, value: itemValue, disabled, onSelect: _os, textValue: _tv, onPress, ...props }, ref) => {
    const { value, onValueChange } = React.useContext(RadioGroupContext);
    const { onOpenChange } = React.useContext(ContextMenuContext);
    const isSelected = value === itemValue;

    return (
      <Pressable
        ref={ref}
        disabled={!!disabled}
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected, disabled: !!disabled }}
        onPress={(e) => {
          onValueChange(itemValue);
          onOpenChange(false);
          onPress?.(e);
        }}
        className={cn(
          "relative flex-row items-center rounded-sm py-1.5 pl-8 pr-2",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      >
        <View className="absolute left-2 h-3.5 w-3.5 items-center justify-center">
          {isSelected && (
            <Text className="text-xs text-foreground leading-none">{"●"}</Text>
          )}
        </View>
        {typeof children === "string" ? (
          <Text className="text-sm text-foreground flex-1">{children}</Text>
        ) : (
          children
        )}
      </Pressable>
    );
  },
);
ContextMenuRadioItem.displayName = "ContextMenuRadioItem";

// ─── ContextMenuLabel ─────────────────────────────────────────────────────────

export interface ContextMenuLabelProps extends TextProps {
  inset?: boolean;
}

const ContextMenuLabel = React.forwardRef<Text, ContextMenuLabelProps>(
  ({ className, inset, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn(
        "px-2 py-1.5 text-sm font-semibold text-foreground",
        inset && "pl-8",
        className,
      )}
      {...props}
    />
  ),
);
ContextMenuLabel.displayName = "ContextMenuLabel";

// ─── ContextMenuSeparator ─────────────────────────────────────────────────────

const ContextMenuSeparator = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  ),
);
ContextMenuSeparator.displayName = "ContextMenuSeparator";

// ─── ContextMenuShortcut ──────────────────────────────────────────────────────

function ContextMenuShortcut({ className, ...props }: TextProps) {
  return (
    <Text
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
ContextMenuShortcut.displayName = "ContextMenuShortcut";

// ─── ContextMenuGroup ─────────────────────────────────────────────────────────

function ContextMenuGroup({ className, ...props }: ViewProps) {
  return <View className={cn("", className)} {...props} />;
}
ContextMenuGroup.displayName = "ContextMenuGroup";

// ─── ContextMenuSub ───────────────────────────────────────────────────────────
// Stub: sub-menus are not supported in this RN port.
// Sub-trigger renders as a regular item; sub-content renders inline below it.

function ContextMenuSub({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
ContextMenuSub.displayName = "ContextMenuSub";

// ─── ContextMenuSubTrigger ────────────────────────────────────────────────────

export interface ContextMenuSubTriggerProps
  extends Omit<PressableProps, "children"> {
  className?: string;
  inset?: boolean;
  children?: React.ReactNode;
}

const ContextMenuSubTrigger = React.forwardRef<View, ContextMenuSubTriggerProps>(
  ({ className, inset, children, ...props }, ref) => (
    <Pressable
      ref={ref}
      accessibilityRole="menuitem"
      className={cn(
        "flex-row cursor-default items-center rounded-sm px-2 py-1.5",
        inset && "pl-8",
        className,
      )}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className="text-sm text-foreground flex-1">{children}</Text>
      ) : (
        <View className="flex-1">{children}</View>
      )}
      <Text className="ml-auto text-sm text-muted-foreground">{"›"}</Text>
    </Pressable>
  ),
);
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

// ─── ContextMenuSubContent ────────────────────────────────────────────────────

const ContextMenuSubContent = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("ml-4 border-l border-border pl-2", className)}
      {...props}
    />
  ),
);
ContextMenuSubContent.displayName = "ContextMenuSubContent";

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
