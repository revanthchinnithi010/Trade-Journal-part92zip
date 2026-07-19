/**
 * menubar.tsx — React Native port
 *
 * Web source: @radix-ui/react-menubar
 *
 * Web → RN replacements:
 *   MenubarPrimitive.Root         → horizontal View with MenubarContext
 *   MenubarPrimitive.Menu         → View with per-menu open state context
 *   MenubarPrimitive.Trigger      → Pressable (opens its parent menu)
 *   MenubarPrimitive.Portal       → pass-through
 *   MenubarPrimitive.Group        → View (logical grouping)
 *   MenubarPrimitive.Sub          → nested context (sub-menu open state)
 *   MenubarPrimitive.RadioGroup   → View + RadioGroupContext
 *   MenubarPrimitive.SubTrigger   → Pressable with "›" chevron
 *   MenubarPrimitive.SubContent   → nested Modal
 *   MenubarPrimitive.Content      → Modal + ScrollView list
 *   MenubarPrimitive.Item         → Pressable row
 *   MenubarPrimitive.CheckboxItem → Pressable row with "✓" indicator
 *   MenubarPrimitive.RadioItem    → Pressable row with "●" indicator
 *   MenubarPrimitive.Label        → Text label
 *   MenubarPrimitive.Separator    → View hairline
 *   Check/Circle/ChevronRight     → unicode "✓" "●" "›"
 *   focus:bg-accent               → pressed state via Pressable style callback
 *   data-[state=open]:bg-accent   → highlighted className when open
 *   h-9 / space-x-1 / p-1 bar    → NativeWind equivalents
 *   .displayname (note: lowercase in source) → preserved as-is on MenubarShortcut
 *
 * Preserved exports (all, matching source exactly):
 *   Menubar, MenubarMenu, MenubarTrigger, MenubarContent
 *   MenubarItem, MenubarSeparator, MenubarLabel
 *   MenubarCheckboxItem, MenubarRadioGroup, MenubarRadioItem
 *   MenubarPortal, MenubarSubContent, MenubarSubTrigger
 *   MenubarGroup, MenubarSub, MenubarShortcut
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

// ─── Menubar-level context (tracks which menu is open) ────────────────────────

interface MenubarContextValue {
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
}

const MenubarContext = React.createContext<MenubarContextValue>({
  openMenuId: null,
  setOpenMenuId: () => {},
});

// ─── Per-menu context ─────────────────────────────────────────────────────────

interface MenubarMenuContextValue {
  menuId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MenubarMenuContext = React.createContext<MenubarMenuContextValue>({
  menuId: "",
  open: false,
  onOpenChange: () => {},
});

// ─── Sub-menu context ─────────────────────────────────────────────────────────

interface MenubarSubContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MenubarSubContext = React.createContext<MenubarSubContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ─── RadioGroup context ───────────────────────────────────────────────────────

interface MenubarRadioGroupContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
}

const MenubarRadioGroupContext =
  React.createContext<MenubarRadioGroupContextValue>({});

// ─── Menubar (Root bar) ───────────────────────────────────────────────────────

const Menubar = React.forwardRef<View, ViewProps>(
  ({ className, children, ...props }, ref) => {
    const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);

    return (
      <MenubarContext.Provider value={{ openMenuId, setOpenMenuId }}>
        <View
          ref={ref}
          className={cn(
            "flex-row h-9 items-center gap-1 rounded-md border border-border bg-background px-1 shadow-sm",
            className,
          )}
          {...props}
        >
          {children}
        </View>
      </MenubarContext.Provider>
    );
  },
);
Menubar.displayName = "Menubar";

// ─── MenubarMenu ──────────────────────────────────────────────────────────────

function MenubarMenu({ children }: { children?: React.ReactNode }) {
  const menuId = React.useId();
  const { openMenuId, setOpenMenuId } = React.useContext(MenubarContext);
  const open = openMenuId === menuId;

  const onOpenChange = React.useCallback(
    (next: boolean) => {
      setOpenMenuId(next ? menuId : null);
    },
    [menuId, setOpenMenuId],
  );

  return (
    <MenubarMenuContext.Provider value={{ menuId, open, onOpenChange }}>
      <View>{children}</View>
    </MenubarMenuContext.Provider>
  );
}
MenubarMenu.displayName = "MenubarMenu";

// ─── MenubarTrigger ───────────────────────────────────────────────────────────

const MenubarTrigger = React.forwardRef<View, PressableProps>(
  ({ className, onPress, children, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(MenubarMenuContext);
    return (
      <Pressable
        ref={ref}
        onPress={(e) => {
          onOpenChange(!open);
          onPress?.(e);
        }}
        className={cn(
          "flex-row cursor-default items-center rounded-sm px-3 py-1",
          open && "bg-accent",
          className,
        )}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
MenubarTrigger.displayName = "MenubarTrigger";

// ─── MenubarPortal ────────────────────────────────────────────────────────────

function MenubarPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
MenubarPortal.displayName = "MenubarPortal";

// ─── MenubarGroup ─────────────────────────────────────────────────────────────

const MenubarGroup = React.forwardRef<View, ViewProps>(
  ({ children, ...props }, ref) => (
    <View ref={ref} {...props}>{children}</View>
  ),
);
MenubarGroup.displayName = "MenubarGroup";

// ─── MenubarSub ───────────────────────────────────────────────────────────────

function MenubarSub({
  children,
  open: openProp,
  onOpenChange,
}: {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
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
    <MenubarSubContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </MenubarSubContext.Provider>
  );
}
MenubarSub.displayName = "MenubarSub";

// ─── MenubarRadioGroup ────────────────────────────────────────────────────────

function MenubarRadioGroup({
  value,
  onValueChange,
  children,
  ...props
}: ViewProps & { value?: string; onValueChange?: (v: string) => void }) {
  return (
    <MenubarRadioGroupContext.Provider value={{ value, onValueChange }}>
      <View {...props}>{children}</View>
    </MenubarRadioGroupContext.Provider>
  );
}
MenubarRadioGroup.displayName = "MenubarRadioGroup";

// ─── MenubarContent ───────────────────────────────────────────────────────────

export interface MenubarContentProps extends ViewProps {
  align?: "start" | "center" | "end"; // API compat
  alignOffset?: number; // API compat
  sideOffset?: number; // API compat
}

const MenubarContent = React.forwardRef<View, MenubarContentProps>(
  (
    {
      className,
      children,
      align: _a,
      alignOffset: _ao,
      sideOffset: _so,
      ...props
    },
    ref,
  ) => {
    const { open, onOpenChange } = React.useContext(MenubarMenuContext);

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
              "z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md",
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
MenubarContent.displayName = "MenubarContent";

// ─── MenubarSubTrigger ────────────────────────────────────────────────────────

export interface MenubarSubTriggerProps extends Omit<PressableProps, "children"> {
  inset?: boolean;
  children?: React.ReactNode;
}

const MenubarSubTrigger = React.forwardRef<View, MenubarSubTriggerProps>(
  ({ className, inset, children, onPress, ...props }, ref) => {
    const { onOpenChange } = React.useContext(MenubarSubContext);
    return (
      <Pressable
        ref={ref}
        onPress={(e) => {
          onOpenChange(true);
          onPress?.(e);
        }}
        className={cn(
          "flex-row items-center rounded-sm px-2 py-1.5",
          inset && "pl-8",
          className,
        )}
        style={({ pressed }) => pressed ? { backgroundColor: "rgba(255,255,255,0.06)" } : {}}
        {...props}
      >
        {children}
        <Text className="ml-auto text-foreground text-sm">›</Text>
      </Pressable>
    );
  },
);
MenubarSubTrigger.displayName = "MenubarSubTrigger";

// ─── MenubarSubContent ────────────────────────────────────────────────────────

const MenubarSubContent = React.forwardRef<View, ViewProps>(
  ({ className, children, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(MenubarSubContext);

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
MenubarSubContent.displayName = "MenubarSubContent";

// ─── MenubarItem ──────────────────────────────────────────────────────────────

export interface MenubarItemProps extends Omit<PressableProps, "children"> {
  inset?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

const MenubarItem = React.forwardRef<View, MenubarItemProps>(
  ({ className, inset, disabled, children, ...props }, ref) => (
    <Pressable
      ref={ref}
      disabled={disabled}
      className={cn(
        "relative flex-row items-center rounded-sm px-2 py-1.5",
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
MenubarItem.displayName = "MenubarItem";

// ─── MenubarCheckboxItem ──────────────────────────────────────────────────────

export interface MenubarCheckboxItemProps extends Omit<PressableProps, "children"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

const MenubarCheckboxItem = React.forwardRef<View, MenubarCheckboxItemProps>(
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
        {checked && <Text className="text-foreground text-xs leading-none">✓</Text>}
      </View>
      {children}
    </Pressable>
  ),
);
MenubarCheckboxItem.displayName = "MenubarCheckboxItem";

// ─── MenubarRadioItem ─────────────────────────────────────────────────────────

export interface MenubarRadioItemProps extends Omit<PressableProps, "children"> {
  value: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

const MenubarRadioItem = React.forwardRef<View, MenubarRadioItemProps>(
  ({ className, children, value, disabled, onPress, ...props }, ref) => {
    const { value: groupValue, onValueChange } = React.useContext(MenubarRadioGroupContext);
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
          {isSelected && <View className="h-2 w-2 rounded-full bg-foreground" />}
        </View>
        {children}
      </Pressable>
    );
  },
);
MenubarRadioItem.displayName = "MenubarRadioItem";

// ─── MenubarLabel ─────────────────────────────────────────────────────────────

export interface MenubarLabelProps extends TextProps {
  inset?: boolean;
}

const MenubarLabel = React.forwardRef<Text, MenubarLabelProps>(
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
MenubarLabel.displayName = "MenubarLabel";

// ─── MenubarSeparator ─────────────────────────────────────────────────────────

const MenubarSeparator = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("-mx-1 my-1 bg-muted", className)}
      style={{ height: 1 }}
      {...props}
    />
  ),
);
MenubarSeparator.displayName = "MenubarSeparator";

// ─── MenubarShortcut ──────────────────────────────────────────────────────────
// Note: source has .displayname (lowercase) — preserved intentionally.

function MenubarShortcut({ className, ...props }: TextProps) {
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
// Preserving original casing from web source (lowercase displayname).
(MenubarShortcut as { displayname?: string }).displayname = "MenubarShortcut";

export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarLabel,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarPortal,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarGroup,
  MenubarSub,
  MenubarShortcut,
};
