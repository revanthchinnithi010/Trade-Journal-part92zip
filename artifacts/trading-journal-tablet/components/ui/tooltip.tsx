/**
 * tooltip.tsx — React Native port
 *
 * Web source: @radix-ui/react-tooltip
 *
 * Web → RN replacements:
 *   TooltipPrimitive.Provider   → TooltipProviderContext (delayDuration only)
 *   TooltipPrimitive.Root       → React context (open state)
 *   TooltipPrimitive.Trigger    → Pressable with onLongPress (no hover in RN)
 *   TooltipPrimitive.Portal     → pass-through
 *   TooltipPrimitive.Content    → Modal + small floating label
 *   sideOffset                  → API compat; ignored (no trigger positioning)
 *   data-[state=*]:animate-*   → animationType="fade" on Modal
 *   data-[side=*]:slide-*       → removed
 *   origin-[--radix-X]          → removed (wildcard in class name breaks NativeWind parser)
 *
 * Behavioral note: tooltip is shown on long-press (500ms default) since RN
 * has no hover state. delayDuration from TooltipProvider maps to the
 * long-press duration threshold.
 *
 * Preserved API:
 *   TooltipProvider (with delayDuration)
 *   Tooltip (with open, defaultOpen, onOpenChange, delayDuration)
 *   TooltipTrigger
 *   TooltipContent (with sideOffset)
 */

import * as React from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  type PressableProps,
  type ViewProps,
  type TextProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Provider context ─────────────────────────────────────────────────────────

interface TooltipProviderContextValue {
  delayDuration: number;
}

const TooltipProviderContext = React.createContext<TooltipProviderContextValue>({
  delayDuration: 500,
});

// ─── TooltipProvider ─────────────────────────────────────────────────────────

export interface TooltipProviderProps {
  delayDuration?: number;
  skipDelayDuration?: number; // API compat
  disableHoverableContent?: boolean; // API compat
  children?: React.ReactNode;
}

function TooltipProvider({
  delayDuration = 500,
  children,
}: TooltipProviderProps) {
  return (
    <TooltipProviderContext.Provider value={{ delayDuration }}>
      {children}
    </TooltipProviderContext.Provider>
  );
}
TooltipProvider.displayName = "TooltipProvider";

// ─── Tooltip context ──────────────────────────────────────────────────────────

interface TooltipContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delayDuration: number;
}

const TooltipContext = React.createContext<TooltipContextValue>({
  open: false,
  onOpenChange: () => {},
  delayDuration: 500,
});

// ─── Tooltip (Root) ───────────────────────────────────────────────────────────

export interface TooltipProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  delayDuration?: number;
  disableHoverableContent?: boolean; // API compat
  children?: React.ReactNode;
}

function Tooltip({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  delayDuration,
  children,
}: TooltipProps) {
  const providerCtx = React.useContext(TooltipProviderContext);
  const effectiveDelay = delayDuration ?? providerCtx.delayDuration;

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
    <TooltipContext.Provider
      value={{ open, onOpenChange: handleOpenChange, delayDuration: effectiveDelay }}
    >
      {children}
    </TooltipContext.Provider>
  );
}
Tooltip.displayName = "Tooltip";

// ─── TooltipTrigger ───────────────────────────────────────────────────────────

const TooltipTrigger = React.forwardRef<View, PressableProps>(
  ({ onPress, onLongPress, children, ...props }, ref) => {
    const { onOpenChange, delayDuration } = React.useContext(TooltipContext);

    return (
      <Pressable
        ref={ref}
        onPress={(e) => {
          onPress?.(e);
        }}
        onLongPress={(e) => {
          onOpenChange(true);
          onLongPress?.(e);
        }}
        delayLongPress={delayDuration}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
TooltipTrigger.displayName = "TooltipTrigger";

// ─── TooltipContent ───────────────────────────────────────────────────────────

export interface TooltipContentProps extends ViewProps {
  /** API compat — not used in RN (no trigger-relative positioning). */
  sideOffset?: number;
  /** API compat — not used in RN. */
  side?: "top" | "right" | "bottom" | "left";
  /** API compat — not used in RN. */
  align?: "start" | "center" | "end";
}

const TooltipContent = React.forwardRef<View, TooltipContentProps>(
  (
    {
      className,
      children,
      // API compat — unused in RN
      sideOffset: _so,
      side: _side,
      align: _align,
      ...props
    },
    ref,
  ) => {
    const { open, onOpenChange } = React.useContext(TooltipContext);

    return (
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => onOpenChange(false)}
        statusBarTranslucent
      >
        {/* Pressing anywhere dismisses the tooltip */}
        <Pressable className="flex-1 items-center justify-center" onPress={() => onOpenChange(false)}>
          <View
            ref={ref}
            className={cn(
              "rounded-md bg-primary px-3 py-1.5 shadow",
              className,
            )}
            {...props}
          >
            {typeof children === "string" ? (
              <Text className="text-xs text-primary-foreground">{children}</Text>
            ) : (
              children
            )}
          </View>
        </Pressable>
      </Modal>
    );
  },
);
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
