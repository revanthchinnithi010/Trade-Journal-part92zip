/**
 * navigation-menu.tsx — React Native port
 *
 * Web source: @radix-ui/react-navigation-menu
 *
 * Web → RN replacements:
 *   NavigationMenuPrimitive.Root      → View with NavigationMenuContext
 *   NavigationMenuPrimitive.List      → horizontal ScrollView/View row
 *   NavigationMenuPrimitive.Item      → View with NavigationMenuItemContext
 *   NavigationMenuPrimitive.Trigger   → Pressable with rotate chevron
 *   NavigationMenuPrimitive.Content   → View (inline expand, shown when active)
 *   NavigationMenuPrimitive.Link      → Pressable with accessibilityRole="link"
 *   NavigationMenuPrimitive.Viewport  → View container (rendered below list)
 *   NavigationMenuPrimitive.Indicator → View arrow indicator
 *   ChevronDown (lucide)              → Text "▾" (unicode)
 *   hover:bg-accent                   → removed (no hover in RN)
 *   data-[state=open]:*               → conditional className via context value
 *   data-[motion=*]:*                 → removed (Radix motion data attributes)
 *   md:absolute / md:w-auto           → removed (no breakpoints)
 *   group-data-[state=open]:rotate-180 → Animated rotation on chevron
 *   origin-[--radix-*]               → removed
 *
 * Architecture in RN:
 *   - NavigationMenuContext tracks the `value` of the currently open item.
 *   - NavigationMenuItemContext provides each item's value to its children.
 *   - NavigationMenuTrigger toggles its item's value in context.
 *   - NavigationMenuContent renders inline (not in a portal/viewport) when
 *     its parent item is the active one.
 *   - NavigationMenu renders children + NavigationMenuViewport (pass-through).
 *   - NavigationMenuViewport is a pass-through View (no Radix portal).
 *
 * Preserved exports (all, matching source exactly):
 *   navigationMenuTriggerStyle (cva factory)
 *   NavigationMenu, NavigationMenuList, NavigationMenuItem
 *   NavigationMenuContent, NavigationMenuTrigger
 *   NavigationMenuLink, NavigationMenuIndicator, NavigationMenuViewport
 */

import * as React from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
  type ViewProps,
} from "react-native";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ─── navigationMenuTriggerStyle (cva — kept for external className use) ───────

const navigationMenuTriggerStyle = cva(
  "flex-row h-9 items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium",
);

// ─── NavigationMenu context ───────────────────────────────────────────────────

interface NavigationMenuContextValue {
  value: string;
  onValueChange: (value: string) => void;
  delayDuration: number;
}

const NavigationMenuContext = React.createContext<NavigationMenuContextValue>({
  value: "",
  onValueChange: () => {},
  delayDuration: 200,
});

// ─── Per-item context ─────────────────────────────────────────────────────────

interface NavigationMenuItemContextValue {
  value: string;
}

const NavigationMenuItemContext =
  React.createContext<NavigationMenuItemContextValue>({ value: "" });

// ─── NavigationMenu (Root) ────────────────────────────────────────────────────

export interface NavigationMenuRootProps extends ViewProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  delayDuration?: number;
  skipDelayDuration?: number; // API compat
  dir?: "ltr" | "rtl"; // API compat
  orientation?: "horizontal" | "vertical"; // API compat
}

const NavigationMenu = React.forwardRef<View, NavigationMenuRootProps>(
  (
    {
      className,
      children,
      value: valueProp,
      defaultValue = "",
      onValueChange,
      delayDuration = 200,
      ...props
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const isControlled = valueProp !== undefined;
    const value = isControlled ? valueProp! : internalValue;

    const handleValueChange = React.useCallback(
      (next: string) => {
        if (!isControlled) setInternalValue(next);
        onValueChange?.(next);
      },
      [isControlled, onValueChange],
    );

    return (
      <NavigationMenuContext.Provider
        value={{ value, onValueChange: handleValueChange, delayDuration }}
      >
        <View
          ref={ref}
          className={cn(
            "relative z-10 flex max-w-max flex-1 items-center justify-center",
            className,
          )}
          {...props}
        >
          {children}
          {/* Viewport is rendered here in the web source — in RN it's a no-op */}
          <NavigationMenuViewport />
        </View>
      </NavigationMenuContext.Provider>
    );
  },
);
NavigationMenu.displayName = "NavigationMenu";

// ─── NavigationMenuList ───────────────────────────────────────────────────────

const NavigationMenuList = React.forwardRef<View, ViewProps>(
  ({ className, children, ...props }, ref) => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <View
        ref={ref}
        className={cn("flex-row flex-1 items-center justify-center gap-1", className)}
        {...props}
      >
        {children}
      </View>
    </ScrollView>
  ),
);
NavigationMenuList.displayName = "NavigationMenuList";

// ─── NavigationMenuItem ───────────────────────────────────────────────────────
// Provides a unique value to Trigger and Content so they can coordinate.

export interface NavigationMenuItemProps extends ViewProps {
  /** Unique identifier for this item. Auto-generated via useId if omitted. */
  value?: string;
}

function NavigationMenuItem({ children, value, ...props }: NavigationMenuItemProps) {
  const autoId = React.useId();
  const itemValue = value ?? autoId;

  return (
    <NavigationMenuItemContext.Provider value={{ value: itemValue }}>
      <View {...props}>{children}</View>
    </NavigationMenuItemContext.Provider>
  );
}
NavigationMenuItem.displayName = "NavigationMenuItem";

// ─── NavigationMenuTrigger ────────────────────────────────────────────────────

const NavigationMenuTrigger = React.forwardRef<
  View,
  Omit<PressableProps, "children"> & { children?: React.ReactNode }
>(({ className, children, onPress, ...props }, ref) => {
    const { value, onValueChange } = React.useContext(NavigationMenuContext);
    const { value: itemValue } = React.useContext(NavigationMenuItemContext);
    const isOpen = value === itemValue;

    // Animated chevron rotation.
    const rotation = React.useRef(new Animated.Value(isOpen ? 1 : 0)).current;
    React.useEffect(() => {
      Animated.timing(rotation, {
        toValue: isOpen ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }, [isOpen, rotation]);

    const rotate = rotation.interpolate({
      inputRange: [0, 1],
      outputRange: ["0deg", "180deg"],
    });

    return (
      <Pressable
        ref={ref}
        onPress={(e) => {
          onValueChange(isOpen ? "" : itemValue);
          onPress?.(e);
        }}
        className={cn(navigationMenuTriggerStyle(), className)}
        accessibilityState={{ expanded: isOpen }}
        {...props}
      >
        {children}
        <Animated.Text
          className="ml-1 text-xs text-foreground"
          style={{ transform: [{ rotate }] }}
        >
          ▾
        </Animated.Text>
      </Pressable>
    );
  },
);
NavigationMenuTrigger.displayName = "NavigationMenuTrigger";

// ─── NavigationMenuContent ────────────────────────────────────────────────────
// Renders inline (not in a portal) when its parent item is active.
// In RN this is the practical equivalent of the Radix viewport mechanism.

const NavigationMenuContent = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => {
    const { value } = React.useContext(NavigationMenuContext);
    const { value: itemValue } = React.useContext(NavigationMenuItemContext);
    const isOpen = value === itemValue;

    if (!isOpen) return null;

    return (
      <View
        ref={ref}
        className={cn("w-full", className)}
        {...props}
      />
    );
  },
);
NavigationMenuContent.displayName = "NavigationMenuContent";

// ─── NavigationMenuLink ───────────────────────────────────────────────────────
// Web source: NavigationMenuPrimitive.Link (renders as <a>)
// RN port: Pressable with accessibilityRole="link"

export interface NavigationMenuLinkProps extends PressableProps {
  active?: boolean; // API compat (aria-current)
  asChild?: boolean; // API compat, ignored
}

const NavigationMenuLink = React.forwardRef<View, NavigationMenuLinkProps>(
  ({ className, active, children, ...props }, ref) => (
    <Pressable
      ref={ref}
      accessibilityRole="link"
      accessibilityState={{ selected: active ?? false }}
      className={cn("block", className)}
      {...props}
    >
      {children}
    </Pressable>
  ),
);
NavigationMenuLink.displayName = "NavigationMenuLink";

// ─── NavigationMenuViewport ───────────────────────────────────────────────────
// In web: floating container positioned below the nav bar that renders the
// active item's content via a Radix portal.
// In RN: pass-through View (NavigationMenuContent renders inline in each item).

const NavigationMenuViewport = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn(
        "absolute left-0 top-full w-full overflow-hidden rounded-md border border-border bg-popover shadow",
        className,
      )}
      pointerEvents="box-none"
      {...props}
    />
  ),
);
NavigationMenuViewport.displayName = "NavigationMenuViewport";

// ─── NavigationMenuIndicator ──────────────────────────────────────────────────
// In web: an arrow that appears below the active trigger pointing to the viewport.
// In RN: a simple decorative View — kept for API compat.

export interface NavigationMenuIndicatorProps extends ViewProps {
  /** API compat from Radix (not used in RN). */
  forceMount?: boolean;
}

const NavigationMenuIndicator = React.forwardRef<View, NavigationMenuIndicatorProps>(
  ({ className, forceMount: _fm, ...props }, ref) => {
    const { value } = React.useContext(NavigationMenuContext);
    if (!value) return null;

    return (
      <View
        ref={ref}
        className={cn(
          "top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden",
          className,
        )}
        {...props}
      >
        {/* Arrow indicator */}
        <View className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border shadow-md" />
      </View>
    );
  },
);
NavigationMenuIndicator.displayName = "NavigationMenuIndicator";

export {
  navigationMenuTriggerStyle,
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
};
