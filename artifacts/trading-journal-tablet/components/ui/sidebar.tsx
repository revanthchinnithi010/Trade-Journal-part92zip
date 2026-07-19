/**
 * sidebar.tsx — React Native compatibility stub
 *
 * Web source: shadcn/ui Sidebar (radix-based, cookie-driven, keyboard-shortcut-driven)
 *
 * WHY THIS IS A STUB:
 *   The web Sidebar is a desktop-first component built on:
 *   - Radix Slot, lucide icons, browser cookies (sidebar state persistence)
 *   - Keyboard shortcut (⌘B) to toggle
 *   - Resizable panel layout (react-resizable-panels)
 *   - CSS variables (--sidebar-width, --sidebar-width-icon)
 *   - Media-query-based responsive collapsing
 *
 *   On React Native / mobile, navigation is handled differently:
 *   ✅ Bottom Tabs     — Expo Router tab layout (app/(tabs)/_layout.tsx)
 *   ✅ Drawer / Sheet  — Phase 2.3 infrastructure (drawer.tsx / sheet.tsx)
 *   ✅ Stack Navigator — Expo Router stack for drill-down flows
 *
 *   This file exports the full sidebar API as View-based stubs so that any
 *   shared code that imports from "@/components/ui/sidebar" continues to
 *   compile without modification. All structural components (Header, Footer,
 *   Content, Menu*, Group*) render their children as transparent View wrappers.
 *
 * Preserved exports (all 24):
 *   useSidebar, SidebarProvider, Sidebar, SidebarTrigger, SidebarRail,
 *   SidebarInset, SidebarInput, SidebarHeader, SidebarFooter,
 *   SidebarSeparator, SidebarContent, SidebarGroup, SidebarGroupLabel,
 *   SidebarGroupAction, SidebarGroupContent, SidebarMenu, SidebarMenuItem,
 *   SidebarMenuButton, SidebarMenuAction, SidebarMenuBadge,
 *   SidebarMenuSkeleton, SidebarMenuSub, SidebarMenuSubItem,
 *   SidebarMenuSubButton
 */

import * as React from "react";
import {
  Pressable,
  TextInput,
  View,
  Text,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
  type TextProps,
} from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ─── Context ──────────────────────────────────────────────────────────────────

export type SidebarContextProps = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextProps>({
  state: "expanded",
  open: true,
  setOpen: () => {},
  openMobile: false,
  setOpenMobile: () => {},
  isMobile: true, // always true in RN
  toggleSidebar: () => {},
});

export function useSidebar(): SidebarContextProps {
  return React.useContext(SidebarContext);
}

// ─── SidebarProvider ──────────────────────────────────────────────────────────

export interface SidebarProviderProps extends ViewProps {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  className,
  children,
  ...props
}: SidebarProviderProps) {
  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = isControlled ? openProp! : internalOpen;
  const [openMobile, setOpenMobile] = React.useState(false);

  const setOpen = React.useCallback(
    (value: boolean) => {
      if (!isControlled) setInternalOpen(value);
      onOpenChange?.(value);
    },
    [isControlled, onOpenChange],
  );

  const toggleSidebar = React.useCallback(() => setOpen(!open), [open, setOpen]);

  return (
    <SidebarContext.Provider
      value={{
        state: open ? "expanded" : "collapsed",
        open,
        setOpen,
        openMobile,
        setOpenMobile,
        isMobile: true,
        toggleSidebar,
      }}
    >
      <View className={cn("flex-1", className)} {...props}>
        {children}
      </View>
    </SidebarContext.Provider>
  );
}
SidebarProvider.displayName = "SidebarProvider";

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export interface SidebarProps extends ViewProps {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
}

function Sidebar({
  side: _side,
  variant: _variant,
  collapsible: _col,
  className,
  children,
  ...props
}: SidebarProps) {
  return (
    <View
      className={cn("flex flex-col bg-sidebar", className)}
      {...props}
    >
      {children}
    </View>
  );
}
Sidebar.displayName = "Sidebar";

// ─── SidebarTrigger ───────────────────────────────────────────────────────────

function SidebarTrigger({
  className,
  onPress,
  children,
  ...props
}: Omit<PressableProps, "children"> & { className?: string; children?: React.ReactNode }) {
  const { toggleSidebar } = useSidebar();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Toggle sidebar"
      onPress={(e) => {
        toggleSidebar();
        onPress?.(e);
      }}
      className={cn("h-7 w-7 items-center justify-center", className)}
      {...props}
    >
      {children ?? <Text className="text-foreground text-sm">{"☰"}</Text>}
    </Pressable>
  );
}
SidebarTrigger.displayName = "SidebarTrigger";

// ─── SidebarRail ──────────────────────────────────────────────────────────────
// Stub — rail resize handle is desktop-only.

function SidebarRail({ className, ...props }: ViewProps) {
  return <View className={cn("w-px bg-border", className)} {...props} />;
}
SidebarRail.displayName = "SidebarRail";

// ─── SidebarInset ─────────────────────────────────────────────────────────────

function SidebarInset({ className, ...props }: ViewProps) {
  return <View className={cn("flex-1", className)} {...props} />;
}
SidebarInset.displayName = "SidebarInset";

// ─── SidebarInput ─────────────────────────────────────────────────────────────

function SidebarInput({ className, ...props }: TextInputProps & { className?: string }) {
  return (
    <TextInput
      className={cn(
        "h-8 w-full bg-transparent px-2 text-sm text-foreground placeholder:text-muted-foreground",
        className,
      )}
      placeholderTextColor="rgba(128,128,128,0.6)"
      {...props}
    />
  );
}
SidebarInput.displayName = "SidebarInput";

// ─── SidebarHeader ────────────────────────────────────────────────────────────

function SidebarHeader({ className, ...props }: ViewProps) {
  return (
    <View className={cn("flex flex-col gap-2 p-2", className)} {...props} />
  );
}
SidebarHeader.displayName = "SidebarHeader";

// ─── SidebarFooter ────────────────────────────────────────────────────────────

function SidebarFooter({ className, ...props }: ViewProps) {
  return (
    <View className={cn("flex flex-col gap-2 p-2", className)} {...props} />
  );
}
SidebarFooter.displayName = "SidebarFooter";

// ─── SidebarSeparator ─────────────────────────────────────────────────────────

function SidebarSeparator({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("mx-2 my-0.5 h-px bg-sidebar-border", className)}
      {...props}
    />
  );
}
SidebarSeparator.displayName = "SidebarSeparator";

// ─── SidebarContent ───────────────────────────────────────────────────────────

function SidebarContent({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto", className)}
      {...props}
    />
  );
}
SidebarContent.displayName = "SidebarContent";

// ─── SidebarGroup ─────────────────────────────────────────────────────────────

function SidebarGroup({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      {...props}
    />
  );
}
SidebarGroup.displayName = "SidebarGroup";

// ─── SidebarGroupLabel ────────────────────────────────────────────────────────

function SidebarGroupLabel({
  className,
  asChild: _asChild,
  ...props
}: ViewProps & { asChild?: boolean }) {
  return (
    <Text
      className={cn(
        "duration-200 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70",
        className,
      )}
      {...(props as TextProps)}
    />
  );
}
SidebarGroupLabel.displayName = "SidebarGroupLabel";

// ─── SidebarGroupAction ───────────────────────────────────────────────────────

function SidebarGroupAction({
  className,
  asChild: _asChild,
  ...props
}: Omit<PressableProps, "children"> & { className?: string; asChild?: boolean; children?: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md",
        className,
      )}
      {...props}
    />
  );
}
SidebarGroupAction.displayName = "SidebarGroupAction";

// ─── SidebarGroupContent ──────────────────────────────────────────────────────

function SidebarGroupContent({ className, ...props }: ViewProps) {
  return <View className={cn("w-full text-sm", className)} {...props} />;
}
SidebarGroupContent.displayName = "SidebarGroupContent";

// ─── SidebarMenu ──────────────────────────────────────────────────────────────

function SidebarMenu({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex w-full min-w-0 flex-col gap-1", className)}
      {...props}
    />
  );
}
SidebarMenu.displayName = "SidebarMenu";

// ─── SidebarMenuItem ──────────────────────────────────────────────────────────

function SidebarMenuItem({ className, ...props }: ViewProps) {
  return (
    <View className={cn("group/menu-item relative", className)} {...props} />
  );
}
SidebarMenuItem.displayName = "SidebarMenuItem";

// ─── SidebarMenuButton variants ───────────────────────────────────────────────

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline: "bg-background shadow-sm hover:bg-sidebar-accent",
      },
      size: {
        default: "h-8 text-sm",
        sm:      "h-7 text-xs",
        lg:      "h-12 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface SidebarMenuButtonProps
  extends Omit<PressableProps, "children">,
    VariantProps<typeof sidebarMenuButtonVariants> {
  className?: string;
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string | Record<string, unknown>;
  children?: React.ReactNode;
}

const SidebarMenuButton = React.forwardRef<View, SidebarMenuButtonProps>(
  (
    {
      className,
      variant,
      size,
      isActive,
      asChild: _asChild,
      tooltip: _tooltip,
      children,
      ...props
    },
    ref,
  ) => (
    <Pressable
      ref={ref}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: !!isActive }}
      className={cn(
        sidebarMenuButtonVariants({ variant, size }),
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        className,
      )}
      {...props}
    >
      {children}
    </Pressable>
  ),
);
SidebarMenuButton.displayName = "SidebarMenuButton";

// ─── SidebarMenuAction ────────────────────────────────────────────────────────

function SidebarMenuAction({
  className,
  asChild: _asChild,
  showOnHover: _soh,
  ...props
}: Omit<PressableProps, "children"> & {
  className?: string;
  asChild?: boolean;
  showOnHover?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md",
        className,
      )}
      {...props}
    />
  );
}
SidebarMenuAction.displayName = "SidebarMenuAction";

// ─── SidebarMenuBadge ─────────────────────────────────────────────────────────

function SidebarMenuBadge({ className, ...props }: TextProps) {
  return (
    <Text
      className={cn(
        "pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground select-none",
        className,
      )}
      {...props}
    />
  );
}
SidebarMenuBadge.displayName = "SidebarMenuBadge";

// ─── SidebarMenuSkeleton ──────────────────────────────────────────────────────

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: ViewProps & { showIcon?: boolean }) {
  return (
    <View
      className={cn("flex h-8 flex-row items-center gap-2 rounded-md px-2", className)}
      {...props}
    >
      {showIcon && (
        <View className="h-4 w-4 rounded-md bg-muted animate-pulse" />
      )}
      <View className="h-4 flex-1 rounded-md bg-muted animate-pulse" />
    </View>
  );
}
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton";

// ─── SidebarMenuSub ───────────────────────────────────────────────────────────

function SidebarMenuSub({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        "mx-3.5 flex min-w-0 flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
        className,
      )}
      {...props}
    />
  );
}
SidebarMenuSub.displayName = "SidebarMenuSub";

// ─── SidebarMenuSubItem ───────────────────────────────────────────────────────

function SidebarMenuSubItem({ className, ...props }: ViewProps) {
  return <View className={cn("group/menu-sub-item relative", className)} {...props} />;
}
SidebarMenuSubItem.displayName = "SidebarMenuSubItem";

// ─── SidebarMenuSubButton ─────────────────────────────────────────────────────

function SidebarMenuSubButton({
  className,
  asChild: _asChild,
  size = "md",
  isActive,
  ...props
}: Omit<PressableProps, "children"> & {
  className?: string;
  asChild?: boolean;
  size?: "sm" | "md";
  isActive?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected: !!isActive }}
      className={cn(
        "flex h-7 min-w-0 flex-row items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground",
        size === "sm" ? "text-xs" : "text-sm",
        isActive && "text-sidebar-accent-foreground font-medium",
        className,
      )}
      {...props}
    />
  );
}
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
};
