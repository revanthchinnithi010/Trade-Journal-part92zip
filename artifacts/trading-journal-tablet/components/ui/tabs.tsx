/**
 * tabs.tsx — React Native port
 *
 * Web source: @radix-ui/react-tabs
 *
 * Web → RN replacements:
 *   TabsPrimitive.Root      → React context (value + onValueChange)
 *   TabsPrimitive.List      → horizontal ScrollView with Animated indicator
 *   TabsPrimitive.Trigger   → Pressable (tab button)
 *   TabsPrimitive.Content   → View shown only when tab is active
 *   data-[state=active]:*   → conditional className / style in RN
 *   ring-offset-background  → removed (no focus rings in touch UI)
 *   inline-flex             → flex-row
 *
 * Preserved API:
 *   Tabs          — root provider (value, defaultValue, onValueChange)
 *   TabsList      — tab bar with optional horizontal scroll + animated indicator
 *   TabsTrigger   — individual tab button (value, disabled)
 *   TabsContent   — content panel (value)
 *
 * Animation:
 *   An Animated.View draws a bottom-border indicator that slides under
 *   the active tab.  Positions are measured via onLayout so the indicator
 *   correctly sizes itself for variable-width tabs.
 */

import * as React from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type ScrollViewProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Context ──────────────────────────────────────────────────────────────────

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  /** Indicator state — set by TabsList internally */
  indicatorLeft: Animated.Value;
  indicatorWidth: Animated.Value;
}

const TabsContext = React.createContext<TabsContextValue>({
  value: "",
  onValueChange: () => {},
  indicatorLeft: new Animated.Value(0),
  indicatorWidth: new Animated.Value(0),
});

// ─── Tabs (Root) ──────────────────────────────────────────────────────────────

export interface TabsProps extends ViewProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** API compat */
  activationMode?: "automatic" | "manual";
  dir?: "ltr" | "rtl";
  orientation?: "horizontal" | "vertical";
}

const Tabs = React.forwardRef<View, TabsProps>(
  (
    {
      value: valueProp,
      defaultValue = "",
      onValueChange,
      activationMode: _am,
      dir: _dir,
      orientation: _ori,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const isControlled = valueProp !== undefined;
    const [internalValue, setInternalValue] = React.useState(defaultValue);
    const value = isControlled ? valueProp! : internalValue;

    const indicatorLeft = React.useRef(new Animated.Value(0)).current;
    const indicatorWidth = React.useRef(new Animated.Value(0)).current;

    const handleValueChange = React.useCallback(
      (v: string) => {
        if (!isControlled) setInternalValue(v);
        onValueChange?.(v);
      },
      [isControlled, onValueChange],
    );

    return (
      <TabsContext.Provider
        value={{ value, onValueChange: handleValueChange, indicatorLeft, indicatorWidth }}
      >
        <View ref={ref} className={cn("flex flex-col", className)} {...props}>
          {children}
        </View>
      </TabsContext.Provider>
    );
  },
);
Tabs.displayName = "Tabs";

// ─── TabsList ─────────────────────────────────────────────────────────────────

export interface TabsListProps extends ScrollViewProps {
  className?: string;
  /** Set to false to prevent horizontal scrolling (use fixed-width tabs) */
  scrollable?: boolean;
}

const TabsList = React.forwardRef<ScrollView, TabsListProps>(
  ({ className, children, scrollable = false, ...props }, ref) => {
    const { indicatorLeft, indicatorWidth } = React.useContext(TabsContext);

    return (
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={scrollable}
        contentContainerStyle={{ flexGrow: scrollable ? undefined : 1 }}
        className={cn(
          "h-9 rounded-lg bg-muted p-1 relative",
          className,
        )}
        {...props}
      >
        {/* Sliding indicator */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 4,
            left: indicatorLeft,
            width: indicatorWidth,
            height: 2,
            borderRadius: 1,
            backgroundColor: "hsl(var(--primary, 222 47% 11%))",
          }}
        />
        {children}
      </ScrollView>
    );
  },
);
TabsList.displayName = "TabsList";

// ─── TabsTrigger ──────────────────────────────────────────────────────────────

export interface TabsTriggerProps extends Omit<PressableProps, "children"> {
  className?: string;
  value: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

const TabsTrigger = React.forwardRef<View, TabsTriggerProps>(
  ({ className, value: triggerValue, disabled = false, children, ...props }, ref) => {
    const { value, onValueChange, indicatorLeft, indicatorWidth } =
      React.useContext(TabsContext);

    const isActive = value === triggerValue;
    const layoutRef = React.useRef<{ x: number; width: number } | null>(null);

    const handleLayout = React.useCallback(
      (e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout;
        layoutRef.current = { x, width };
        if (isActive) {
          Animated.parallel([
            Animated.spring(indicatorLeft, {
              toValue: x,
              useNativeDriver: false,
              tension: 80,
              friction: 12,
            }),
            Animated.spring(indicatorWidth, {
              toValue: width,
              useNativeDriver: false,
              tension: 80,
              friction: 12,
            }),
          ]).start();
        }
      },
      [isActive, indicatorLeft, indicatorWidth],
    );

    // Drive indicator on tab change
    React.useEffect(() => {
      if (isActive && layoutRef.current) {
        Animated.parallel([
          Animated.spring(indicatorLeft, {
            toValue: layoutRef.current.x,
            useNativeDriver: false,
            tension: 80,
            friction: 12,
          }),
          Animated.spring(indicatorWidth, {
            toValue: layoutRef.current.width,
            useNativeDriver: false,
            tension: 80,
            friction: 12,
          }),
        ]).start();
      }
    }, [isActive, indicatorLeft, indicatorWidth]);

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        accessibilityRole="tab"
        accessibilityState={{ selected: isActive, disabled }}
        onPress={() => onValueChange(triggerValue)}
        onLayout={handleLayout}
        className={cn(
          "flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 py-1",
          isActive
            ? "bg-background shadow"
            : "bg-transparent",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      >
        <Text
          className={cn(
            "text-sm font-medium",
            isActive ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {children}
        </Text>
      </Pressable>
    );
  },
);
TabsTrigger.displayName = "TabsTrigger";

// ─── TabsContent ──────────────────────────────────────────────────────────────

export interface TabsContentProps extends ViewProps {
  value: string;
}

const TabsContent = React.forwardRef<View, TabsContentProps>(
  ({ className, value: contentValue, children, ...props }, ref) => {
    const { value } = React.useContext(TabsContext);
    const isActive = value === contentValue;

    if (!isActive) return null;

    return (
      <View
        ref={ref}
        accessibilityRole="none"
        className={cn("mt-2", className)}
        {...props}
      >
        {children}
      </View>
    );
  },
);
TabsContent.displayName = "TabsContent";

// ─── Exports ──────────────────────────────────────────────────────────────────

export { Tabs, TabsList, TabsTrigger, TabsContent };
