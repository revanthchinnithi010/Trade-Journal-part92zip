/**
 * hover-card.tsx — React Native port (redesigned as Press + Sheet)
 *
 * Web source: @radix-ui/react-hover-card
 *
 * WHY HOVER IS REMOVED:
 *   React Native / mobile has no hover event. The HoverCard pattern
 *   (show additional info when the cursor lingers) maps most naturally to:
 *   ✅ onPress → show a Modal overlay card (implemented below)
 *   ✅ onLongPress → same
 *
 * Web → RN replacements:
 *   HoverCardPrimitive.Root      → React context (open state)
 *   HoverCardPrimitive.Trigger   → Pressable (onPress opens the card)
 *   HoverCardPrimitive.Content   → Animated Modal overlay card
 *   align / sideOffset           → accepted for API compat; ignored in RN
 *                                   (Modal always centers vertically)
 *   data-[state]:animate-*       → Animated.timing fade
 *   Radix portal / z-ordering    → Modal (handles z-order natively)
 *
 * Preserved API:
 *   HoverCard           — root context (open, defaultOpen, onOpenChange, openDelay, closeDelay)
 *   HoverCardTrigger    — Pressable trigger (onPress / onLongPress)
 *   HoverCardContent    — animated card content (align, sideOffset accepted/ignored)
 *
 * Behavioral notes:
 *   openDelay / closeDelay — accepted for API compat; tap is immediate in RN.
 *   The backdrop is transparent Pressable — tap outside the card to dismiss.
 */

import * as React from "react";
import {
  Animated,
  Modal,
  Pressable,
  View,
  type PressableProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Animation hook ───────────────────────────────────────────────────────────

function useFadeAnim(open: boolean) {
  const anim = React.useRef(new Animated.Value(open ? 1 : 0)).current;
  const [visible, setVisible] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.timing(anim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    } else {
      Animated.timing(anim, { toValue: 0, duration: 100, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setVisible(false);
        },
      );
    }
  }, [open, anim]);

  return { anim, visible };
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface HoverCardContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const HoverCardContext = React.createContext<HoverCardContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ─── HoverCard (Root) ─────────────────────────────────────────────────────────

export interface HoverCardProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** API compat — ignored in RN (tap is immediate) */
  openDelay?: number;
  /** API compat — ignored in RN */
  closeDelay?: number;
  children?: React.ReactNode;
}

function HoverCard({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  openDelay: _od,
  closeDelay: _cd,
  children,
}: HoverCardProps) {
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
    <HoverCardContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </HoverCardContext.Provider>
  );
}
HoverCard.displayName = "HoverCard";

// ─── HoverCardTrigger ─────────────────────────────────────────────────────────

const HoverCardTrigger = React.forwardRef<
  View,
  Omit<PressableProps, "children"> & { children?: React.ReactNode }
>(({ onPress, onLongPress, children, ...props }, ref) => {
  const { onOpenChange } = React.useContext(HoverCardContext);

  return (
    <Pressable
      ref={ref}
      onPress={(e) => {
        onOpenChange(true);
        onPress?.(e);
      }}
      onLongPress={(e) => {
        onOpenChange(true);
        onLongPress?.(e);
      }}
      {...props}
    >
      {children}
    </Pressable>
  );
});
HoverCardTrigger.displayName = "HoverCardTrigger";

// ─── HoverCardContent ─────────────────────────────────────────────────────────

export interface HoverCardContentProps extends ViewProps {
  /** API compat — ignored in RN */
  align?: "start" | "center" | "end";
  /** API compat — ignored in RN */
  sideOffset?: number;
  /** API compat — ignored in RN */
  side?: "top" | "right" | "bottom" | "left";
}

const HoverCardContent = React.forwardRef<View, HoverCardContentProps>(
  ({ className, align: _align, sideOffset: _so, side: _side, children, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(HoverCardContext);
    const { anim, visible } = useFadeAnim(open);

    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={() => onOpenChange(false)}
        statusBarTranslucent
      >
        {/* Dismiss backdrop */}
        <Pressable
          className="absolute inset-0"
          onPress={() => onOpenChange(false)}
          accessibilityLabel="Close card"
        />

        {/* Centered card */}
        <View
          className="flex-1 items-center justify-center px-6"
          pointerEvents="box-none"
        >
          <Animated.View
            ref={ref}
            style={{ opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }}
            className={cn(
              "w-64 rounded-md border border-border bg-popover p-4 shadow-md",
              className,
            )}
            {...(props as object)}
          >
            {children}
          </Animated.View>
        </View>
      </Modal>
    );
  },
);
HoverCardContent.displayName = "HoverCardContent";

// ─── Exports ──────────────────────────────────────────────────────────────────

export { HoverCard, HoverCardTrigger, HoverCardContent };
