/**
 * popover.tsx — React Native port
 *
 * Web source: @radix-ui/react-popover
 *
 * Web → RN replacements:
 *   PopoverPrimitive.Root    → React context (open state)
 *   PopoverPrimitive.Trigger → Pressable (toggles popover)
 *   PopoverPrimitive.Anchor  → View (anchor marker; no DOM positioning in RN)
 *   PopoverPrimitive.Portal  → pass-through
 *   PopoverPrimitive.Content → Modal + centered floating panel
 *   align / sideOffset       → accepted for API compat; positioning not
 *                              trigger-relative in RN (no getBoundingClientRect)
 *   data-[state=*]:animate-* → animationType="fade" on Modal
 *   origin-[--radix-X]       → removed (Radix CSS custom properties; * in class name breaks NativeWind parser)
 *   data-[side=*]:slide-*    → removed (Radix positioning data attributes)
 *
 * Behavioral note: content is centered on screen (not anchored to trigger).
 * This is the correct RN approach without native view measurement.
 *
 * Preserved API:
 *   Popover, PopoverTrigger, PopoverAnchor, PopoverContent
 */

import * as React from "react";
import {
  Modal,
  Pressable,
  View,
  type PressableProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Context ──────────────────────────────────────────────────────────────────

interface PopoverContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PopoverContext = React.createContext<PopoverContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ─── Popover (Root) ───────────────────────────────────────────────────────────

export interface PopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  modal?: boolean; // API compat
}

function Popover({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: PopoverProps) {
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
    <PopoverContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </PopoverContext.Provider>
  );
}
Popover.displayName = "Popover";

// ─── PopoverTrigger ───────────────────────────────────────────────────────────

const PopoverTrigger = React.forwardRef<View, PressableProps>(
  ({ onPress, children, ...props }, ref) => {
    const { onOpenChange, open } = React.useContext(PopoverContext);
    return (
      <Pressable
        ref={ref}
        onPress={(e) => {
          onOpenChange(!open);
          onPress?.(e);
        }}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
PopoverTrigger.displayName = "PopoverTrigger";

// ─── PopoverAnchor ────────────────────────────────────────────────────────────
// In web, provides an alternative anchor point for positioning.
// In RN, kept as a pass-through View for API compatibility.

const PopoverAnchor = React.forwardRef<View, ViewProps>(
  ({ children, ...props }, ref) => (
    <View ref={ref} {...props}>{children}</View>
  ),
);
PopoverAnchor.displayName = "PopoverAnchor";

// ─── PopoverContent ───────────────────────────────────────────────────────────

export interface PopoverContentProps extends ViewProps {
  /** API compat — not used in RN (no trigger-relative positioning). */
  align?: "start" | "center" | "end";
  /** API compat — not used in RN. */
  sideOffset?: number;
  /** API compat — not used in RN. */
  side?: "top" | "right" | "bottom" | "left";
  onOpenAutoFocus?: (e: Event) => void;
  onCloseAutoFocus?: (e: Event) => void;
  onInteractOutside?: () => void;
}

const PopoverContent = React.forwardRef<View, PopoverContentProps>(
  (
    {
      className,
      children,
      onInteractOutside,
      // API compat props — unused in RN
      align: _align,
      sideOffset: _so,
      side: _side,
      onOpenAutoFocus: _oaf,
      onCloseAutoFocus: _caf,
      ...props
    },
    ref,
  ) => {
    const { open, onOpenChange } = React.useContext(PopoverContext);

    return (
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => onOpenChange(false)}
        statusBarTranslucent
      >
        {/* Backdrop — dismisses on press */}
        <Pressable
          className="absolute inset-0"
          onPress={() => {
            onInteractOutside?.();
            onOpenChange(false);
          }}
        />

        {/* Floating content panel — centered */}
        <View className="flex-1 items-center justify-center px-4">
          <View
            ref={ref}
            className={cn(
              "z-50 w-72 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md",
              className,
            )}
            {...props}
          >
            {children}
          </View>
        </View>
      </Modal>
    );
  },
);
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
