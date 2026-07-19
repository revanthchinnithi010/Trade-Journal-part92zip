/**
 * dropdown-menu.tsx — React Native port
 *
 * Web source: @radix-ui/react-dropdown-menu
 *
 * Web → RN replacements:
 *   DropdownMenuPrimitive.Root        → React context (open state)
 *   DropdownMenuPrimitive.Trigger     → Pressable (opens menu)
 *   DropdownMenuPrimitive.Portal      → pass-through
 *   DropdownMenuPrimitive.Group       → View (logical grouping)
 *   DropdownMenuPrimitive.Sub         → nested context (sub-menu open state)
 *   DropdownMenuPrimitive.RadioGroup  → View + RadioGroupContext
 *   DropdownMenuPrimitive.SubTrigger  → Pressable with "›" chevron
 *   DropdownMenuPrimitive.SubContent  → nested Modal
 *   DropdownMenuPrimitive.Content     → Modal + ScrollView list
 *   DropdownMenuPrimitive.Item        → Pressable row
 *   DropdownMenuPrimitive.CheckboxItem → Pressable row with "✓" indicator
 *   DropdownMenuPrimitive.RadioItem   → Pressable row with "●" indicator
 *   DropdownMenuPrimitive.Label       → Text label
 *   DropdownMenuPrimitive.Separator   → View hairline
 *   DropdownMenuPrimitive.ItemIndicator → rendered inline (not a separate element)
 *   Check/Circle/ChevronRight (lucide) → unicode "✓" "●" "›"
 *   focus:bg-accent                   → pressed state via Pressable style callback
 *   data-[disabled]:*                 → disabled prop + opacity-50
 *   data-[state=open]:animate-*       → animationType="fade" on Modal
 *
 * Behavioral note: content appears centered (no trigger-relative positioning
 * in RN). Sub-content appears in a separate Modal stacked above the parent.
 *
 * Preserved exports:
 *   DropdownMenu, DropdownMenuTrigger, DropdownMenuContent
 *   DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioItem
 *   DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut
 *   DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub
 *   DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuRadioGroup
 */

import * as React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
  type ViewProps,
  type TextProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Root context ─────────────────────────────────────────────────────────────

interface DropdownMenuContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ─── Sub context ──────────────────────────────────────────────────────────────

interface DropdownMenuSubContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DropdownMenuSubContext = React.createContext<DropdownMenuSubContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ─── RadioGroup context ───────────────────────────────────────────────────────

interface DropdownMenuRadioGroupContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
}

const DropdownMenuRadioGroupContext =
  React.createContext<DropdownMenuRadioGroupContextValue>({});

// ─── DropdownMenu (Root) ──────────────────────────────────────────────────────

export interface DropdownMenuProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean; // API compat
  dir?: "ltr" | "rtl"; // API compat
  children?: React.ReactNode;
}

function DropdownMenu({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp! : internalOpen;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  return (
    <DropdownMenuContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </DropdownMenuContext.Provider>
  );
}
DropdownMenu.displayName = "DropdownMenu";

// ─── DropdownMenuTrigger ──────────────────────────────────────────────────────

const DropdownMenuTrigger = React.forwardRef<View, PressableProps>(
  ({ onPress, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(DropdownMenuContext);
    return (
      <Pressable
        ref={ref}
        onPress={(e) => {
          onOpenChange(true);
          onPress?.(e);
        }}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

// ─── DropdownMenuPortal ───────────────────────────────────────────────────────

function DropdownMenuPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
DropdownMenuPortal.displayName = "DropdownMenuPortal";

// ─── DropdownMenuGroup ────────────────────────────────────────────────────────

const DropdownMenuGroup = React.forwardRef<View, ViewProps>(
  ({ children, ...props }, ref) => (
    <View ref={ref} {...props}>{children}</View>
  ),
);
DropdownMenuGroup.displayName = "DropdownMenuGroup";

// ─── DropdownMenuSub ──────────────────────────────────────────────────────────

export interface DropdownMenuSubProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

function DropdownMenuSub({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: DropdownMenuSubProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp! : internalOpen;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  return (
    <DropdownMenuSubContext.Provider
      value={{ open, onOpenChange: handleOpenChange }}
    >
      {children}
    </DropdownMenuSubContext.Provider>
  );
}
DropdownMenuSub.displayName = "DropdownMenuSub";

// ─── DropdownMenuRadioGroup ───────────────────────────────────────────────────

export interface DropdownMenuRadioGroupProps extends ViewProps {
  value?: string;
  onValueChange?: (value: string) => void;
}

function DropdownMenuRadioGroup({
  value,
  onValueChange,
  children,
  ...props
}: DropdownMenuRadioGroupProps) {
  return (
    <DropdownMenuRadioGroupContext.Provider value={{ value, onValueChange }}>
      <View {...props}>{children}</View>
    </DropdownMenuRadioGroupContext.Provider>
  );
}
DropdownMenuRadioGroup.displayName = "DropdownMenuRadioGroup";

// ─── DropdownMenuContent ──────────────────────────────────────────────────────

export interface DropdownMenuContentProps extends ViewProps {
  sideOffset?: number; // API compat
  align?: "start" | "center" | "end"; // API compat
  side?: "top" | "right" | "bottom" | "left"; // API compat
  loop?: boolean; // API compat
  onCloseAutoFocus?: (e: Event) => void; // API compat
  onEscapeKeyDown?: (e: KeyboardEvent) => void; // API compat
  onInteractOutside?: () => void;
}

const DropdownMenuContent = React.forwardRef<View, DropdownMenuContentProps>(
  (
    {
      className,
      children,
      onInteractOutside,
      sideOffset: _so,
      align: _a,
      side: _s,
      loop: _l,
      onCloseAutoFocus: _caf,
      onEscapeKeyDown: _ekd,
      ...props
    },
    ref,
  ) => {
    const { open, onOpenChange } = React.useContext(DropdownMenuContext);

    return (
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => onOpenChange(false)}
        statusBarTranslucent
      >
        <Pressable
          className="absolute inset-0"
          onPress={() => {
            onInteractOutside?.();
            onOpenChange(false);
          }}
        />
        <View className="flex-1 items-center justify-center px-4">
          <View
            ref={ref}
            className={cn(
              "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md",
              className,
            )}
            {...props}
          >
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  },
);
DropdownMenuContent.displayName = "DropdownMenuContent";

// ─── DropdownMenuSubTrigger ───────────────────────────────────────────────────

export interface DropdownMenuSubTriggerProps extends Omit<PressableProps, "children"> {
  inset?: boolean;
  children?: React.ReactNode;
}

const DropdownMenuSubTrigger = React.forwardRef<View, DropdownMenuSubTriggerProps>(
  ({ className, inset, children, onPress, ...props }, ref) => {
    const { onOpenChange } = React.useContext(DropdownMenuSubContext);
    return (
      <Pressable
        ref={ref}
        onPress={(e) => {
          onOpenChange(true);
          onPress?.(e);
        }}
        className={cn(
          "flex-row items-center gap-2 rounded-sm px-2 py-1.5",
          inset && "pl-8",
          className,
        )}
        {...props}
      >
        {children}
        <Text className="ml-auto text-foreground text-sm">›</Text>
      </Pressable>
    );
  },
);
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

// ─── DropdownMenuSubContent ───────────────────────────────────────────────────

const DropdownMenuSubContent = React.forwardRef<View, ViewProps>(
  ({ className, children, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(DropdownMenuSubContext);

    return (
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => onOpenChange(false)}
        statusBarTranslucent
      >
        <Pressable
          className="absolute inset-0"
          onPress={() => onOpenChange(false)}
        />
        <View className="flex-1 items-center justify-center px-4">
          <View
            ref={ref}
            className={cn(
              "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg",
              className,
            )}
            {...props}
          >
            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  },
);
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

// ─── DropdownMenuItem ─────────────────────────────────────────────────────────

export interface DropdownMenuItemProps extends Omit<PressableProps, "children"> {
  inset?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

const DropdownMenuItem = React.forwardRef<View, DropdownMenuItemProps>(
  ({ className, inset, disabled, children, ...props }, ref) => (
    <Pressable
      ref={ref}
      disabled={disabled}
      className={cn(
        "relative flex-row items-center gap-2 rounded-sm px-2 py-1.5",
        inset && "pl-8",
        disabled && "opacity-50",
        className,
      )}
      style={({ pressed }) => pressed && !disabled ? { backgroundColor: "rgba(255,255,255,0.06)" } : {}}
      {...props}
    >
      {children}
    </Pressable>
  ),
);
DropdownMenuItem.displayName = "DropdownMenuItem";

// ─── DropdownMenuCheckboxItem ─────────────────────────────────────────────────

export interface DropdownMenuCheckboxItemProps extends Omit<PressableProps, "children"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

const DropdownMenuCheckboxItem = React.forwardRef<View, DropdownMenuCheckboxItemProps>(
  ({ className, children, checked, onCheckedChange, disabled, onPress, ...props }, ref) => (
    <Pressable
      ref={ref}
      disabled={disabled}
      onPress={(e) => {
        if (!disabled) onCheckedChange?.(!checked);
        onPress?.(e);
      }}
      className={cn(
        "relative flex-row items-center rounded-sm py-1.5 pl-8 pr-2",
        disabled && "opacity-50",
        className,
      )}
      style={({ pressed }) => pressed && !disabled ? { backgroundColor: "rgba(255,255,255,0.06)" } : {}}
      {...props}
    >
      <View className="absolute left-2 h-3.5 w-3.5 items-center justify-center">
        {checked && (
          <Text className="text-foreground text-xs leading-none">✓</Text>
        )}
      </View>
      {children}
    </Pressable>
  ),
);
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

// ─── DropdownMenuRadioItem ────────────────────────────────────────────────────

export interface DropdownMenuRadioItemProps extends Omit<PressableProps, "children"> {
  value: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

const DropdownMenuRadioItem = React.forwardRef<View, DropdownMenuRadioItemProps>(
  ({ className, children, value, disabled, onPress, ...props }, ref) => {
    const { value: groupValue, onValueChange } =
      React.useContext(DropdownMenuRadioGroupContext);
    const isSelected = groupValue === value;

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        onPress={(e) => {
          if (!disabled) onValueChange?.(value);
          onPress?.(e);
        }}
        className={cn(
          "relative flex-row items-center rounded-sm py-1.5 pl-8 pr-2",
          disabled && "opacity-50",
          className,
        )}
        style={({ pressed }) => pressed && !disabled ? { backgroundColor: "rgba(255,255,255,0.06)" } : {}}
        {...props}
      >
        <View className="absolute left-2 h-3.5 w-3.5 items-center justify-center">
          {isSelected && (
            <View className="h-2 w-2 rounded-full bg-foreground" />
          )}
        </View>
        {children}
      </Pressable>
    );
  },
);
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

// ─── DropdownMenuLabel ────────────────────────────────────────────────────────

export interface DropdownMenuLabelProps extends TextProps {
  inset?: boolean;
}

const DropdownMenuLabel = React.forwardRef<Text, DropdownMenuLabelProps>(
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
DropdownMenuLabel.displayName = "DropdownMenuLabel";

// ─── DropdownMenuSeparator ────────────────────────────────────────────────────

const DropdownMenuSeparator = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("-mx-1 my-1 bg-muted", className)}
      style={{ height: 1 }}
      {...props}
    />
  ),
);
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

// ─── DropdownMenuShortcut ─────────────────────────────────────────────────────

function DropdownMenuShortcut({ className, ...props }: TextProps) {
  return (
    <Text
      className={cn("ml-auto text-xs tracking-widest opacity-60 text-foreground", className)}
      {...props}
    />
  );
}
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};
