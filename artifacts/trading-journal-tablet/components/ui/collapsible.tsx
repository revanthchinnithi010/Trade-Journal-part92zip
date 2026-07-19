/**
 * collapsible.tsx — React Native port
 *
 * Web source: @radix-ui/react-collapsible
 *
 * Web → RN replacements:
 *   CollapsiblePrimitive.Root            → React context (open state)
 *   CollapsiblePrimitive.CollapsibleTrigger → Pressable
 *   CollapsiblePrimitive.CollapsibleContent → Animated height (Reanimated)
 *   CSS data-[state=open/closed]         → conditional rendering / Reanimated style
 *   overflow-hidden                      → clipped by animated container
 *
 * Preserved API:
 *   Collapsible          — root context (open, defaultOpen, onOpenChange, disabled)
 *   CollapsibleTrigger   — Pressable that toggles open state
 *   CollapsibleContent   — animated height reveal/collapse
 *
 * Animation:
 *   Uses react-native-reanimated (v4.1.x) for smooth height animation.
 *   Content is measured at natural height via onLayout, then the container
 *   animates between 0 and that measured height.
 */

import * as React from "react";
import {
  Pressable,
  View,
  type LayoutChangeEvent,
  type PressableProps,
  type ViewProps,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { cn } from "@/lib/utils";

// ─── Context ──────────────────────────────────────────────────────────────────

interface CollapsibleContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
}

const CollapsibleContext = React.createContext<CollapsibleContextValue>({
  open: false,
  onOpenChange: () => {},
  disabled: false,
});

// ─── Collapsible (Root) ───────────────────────────────────────────────────────

export interface CollapsibleProps extends ViewProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}

const Collapsible = React.forwardRef<View, CollapsibleProps>(
  (
    {
      open: openProp,
      defaultOpen = false,
      onOpenChange,
      disabled = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
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
      <CollapsibleContext.Provider value={{ open, onOpenChange: handleOpenChange, disabled }}>
        <View ref={ref} className={cn("", className)} {...props}>
          {children}
        </View>
      </CollapsibleContext.Provider>
    );
  },
);
Collapsible.displayName = "Collapsible";

// ─── CollapsibleTrigger ───────────────────────────────────────────────────────

const CollapsibleTrigger = React.forwardRef<View, PressableProps>(
  ({ className, onPress, children, ...props }, ref) => {
    const { open, onOpenChange, disabled } = React.useContext(CollapsibleContext);

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
        onPress={(e) => {
          onOpenChange(!open);
          onPress?.(e);
        }}
        className={cn(disabled && "opacity-50", className as string)}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
CollapsibleTrigger.displayName = "CollapsibleTrigger";

// ─── CollapsibleContent ───────────────────────────────────────────────────────

const CollapsibleContent = React.forwardRef<View, ViewProps>(
  ({ className, children, ...props }, ref) => {
    const { open } = React.useContext(CollapsibleContext);

    const measuredHeight = React.useRef(0);
    const heightAnim = useSharedValue(open ? -1 : 0); // -1 means "auto / measured"
    const [measured, setMeasured] = React.useState(false);
    const [shouldRender, setShouldRender] = React.useState(open);

    // Keep content mounted while open OR while animating out
    React.useEffect(() => {
      if (open) {
        setShouldRender(true);
      }
    }, [open]);

    React.useEffect(() => {
      if (!measured) return;

      const targetHeight = open ? measuredHeight.current : 0;
      heightAnim.value = withTiming(targetHeight, {
        duration: 250,
        easing: open ? Easing.out(Easing.quad) : Easing.in(Easing.quad),
      });

      if (!open) {
        // Unmount content after collapse animation finishes
        const timer = setTimeout(() => setShouldRender(false), 260);
        return () => clearTimeout(timer);
      }
    }, [open, measured, heightAnim]);

    const animStyle = useAnimatedStyle(() => {
      const h = heightAnim.value;
      return {
        height: h < 0 ? undefined : h,
        overflow: "hidden" as const,
      };
    });

    function handleLayout(e: LayoutChangeEvent) {
      const h = e.nativeEvent.layout.height;
      if (h > 0 && !measured) {
        measuredHeight.current = h;
        heightAnim.value = open ? h : 0;
        setMeasured(true);
      }
    }

    if (!shouldRender) return null;

    return (
      <Animated.View style={[!measured ? { overflow: "hidden" } : animStyle]}>
        {/* Inner View used to measure natural height */}
        <View
          ref={ref}
          onLayout={handleLayout}
          className={cn("", className)}
          {...props}
        >
          {children}
        </View>
      </Animated.View>
    );
  },
);
CollapsibleContent.displayName = "CollapsibleContent";

// ─── Exports ──────────────────────────────────────────────────────────────────

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
