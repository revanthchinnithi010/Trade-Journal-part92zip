/**
 * sheet.tsx — React Native port
 *
 * Web source: @radix-ui/react-dialog (used as a sheet/drawer overlay)
 *
 * Web → RN replacements:
 *   SheetPrimitive.Root      → React context (open state)
 *   SheetPrimitive.Trigger   → Pressable
 *   SheetPrimitive.Portal    → pass-through
 *   SheetPrimitive.Close     → Pressable (closes)
 *   SheetPrimitive.Overlay   → View backdrop inside Modal
 *   SheetPrimitive.Content   → Modal + Animated.View sliding from a side
 *   SheetPrimitive.Title     → Text semibold
 *   SheetPrimitive.Description → Text muted
 *   X icon (lucide)          → "✕" unicode Text
 *   data-[state=*]:slide-*   → Animated.timing on translateX/translateY
 *   inset-y-0/inset-x-0      → flex layout inside Modal positions the panel
 *   sm:max-w-sm              → removed (no breakpoints in RN)
 *
 * Preserved API:
 *   Sheet, SheetTrigger, SheetPortal, SheetClose
 *   SheetOverlay, SheetContent (with side prop)
 *   SheetHeader, SheetFooter, SheetTitle, SheetDescription
 *   sheetVariants (cva factory — className strings still used where NativeWind applies)
 */

import * as React from "react";
import {
  Animated,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
  type PressableProps,
  type ViewProps,
  type TextProps,
} from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ─── Animation hook ───────────────────────────────────────────────────────────

function useSlideAnimation(open: boolean) {
  const anim = React.useRef(new Animated.Value(open ? 1 : 0)).current;
  const [modalVisible, setModalVisible] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setModalVisible(true);
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setModalVisible(false);
      });
    }
  }, [open, anim]);

  return { anim, modalVisible };
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface SheetContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SheetContext = React.createContext<SheetContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ─── sheetVariants ────────────────────────────────────────────────────────────
// Kept for external className composition; animation handled via Animated.

const sheetVariants = cva("absolute gap-4 bg-background p-6 shadow-lg", {
  variants: {
    side: {
      top:    "inset-x-0 top-0 border-b border-border",
      bottom: "inset-x-0 bottom-0 border-t border-border",
      left:   "inset-y-0 left-0 w-3/4 border-r border-border",
      right:  "inset-y-0 right-0 w-3/4 border-l border-border",
    },
  },
  defaultVariants: { side: "right" },
});

// ─── Sheet (Root) ─────────────────────────────────────────────────────────────

export interface SheetProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  modal?: boolean; // accepted for API compat
}

function Sheet({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: SheetProps) {
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
    <SheetContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </SheetContext.Provider>
  );
}
Sheet.displayName = "Sheet";

// ─── SheetTrigger ─────────────────────────────────────────────────────────────

const SheetTrigger = React.forwardRef<View, PressableProps>(
  ({ onPress, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(SheetContext);
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
SheetTrigger.displayName = "SheetTrigger";

// ─── SheetPortal ──────────────────────────────────────────────────────────────

function SheetPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
SheetPortal.displayName = "SheetPortal";

// ─── SheetClose ───────────────────────────────────────────────────────────────

const SheetClose = React.forwardRef<View, PressableProps>(
  ({ onPress, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(SheetContext);
    return (
      <Pressable
        ref={ref}
        onPress={(e) => {
          onOpenChange(false);
          onPress?.(e);
        }}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
SheetClose.displayName = "SheetClose";

// ─── SheetOverlay ─────────────────────────────────────────────────────────────

const SheetOverlay = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("absolute inset-0 bg-black/80", className)}
      {...props}
    />
  ),
);
SheetOverlay.displayName = "SheetOverlay";

// ─── SheetContent ─────────────────────────────────────────────────────────────

export interface SheetContentProps extends ViewProps, VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<View, SheetContentProps>(
  ({ side = "right", className, children, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(SheetContext);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const { anim, modalVisible } = useSlideAnimation(open);

    // Build transform based on the side.
    // No explicit Animated.AnimatedTransform type — it's not exported in this RN version.
    const transform = React.useMemo(() => {
      switch (side) {
        case "bottom":
          return [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [screenHeight, 0] }) }];
        case "top":
          return [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-screenHeight, 0] }) }];
        case "left":
          return [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-screenWidth, 0] }) }];
        default: // "right"
          return [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [screenWidth, 0] }) }];
      }
    }, [side, anim, screenWidth, screenHeight]);

    // Outer flex container alignment per side.
    const containerStyle = React.useMemo(() => {
      switch (side) {
        case "top":    return { justifyContent: "flex-start" as const };
        case "bottom": return { justifyContent: "flex-end" as const };
        case "left":   return { flexDirection: "row" as const, justifyContent: "flex-start" as const };
        case "right":  return { flexDirection: "row" as const, justifyContent: "flex-end" as const };
      }
    }, [side]);

    // Sheet panel sizing per side.
    const panelStyle = React.useMemo(() => {
      switch (side) {
        case "top":
        case "bottom":
          return { width: "100%" as const };
        default:
          return { width: Math.min(screenWidth * 0.75, 320), height: "100%" as const };
      }
    }, [side, screenWidth]);

    return (
      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={() => onOpenChange(false)}
        statusBarTranslucent
      >
        {/* Animated backdrop */}
        <Animated.View
          className="absolute inset-0 bg-black/80"
          style={{ opacity: anim }}
          pointerEvents="box-none"
        >
          <Pressable className="flex-1" onPress={() => onOpenChange(false)} />
        </Animated.View>

        {/* Outer layout container */}
        <View className="flex-1" style={containerStyle} pointerEvents="box-none">
          {/* Sliding panel */}
          <Animated.View
            style={[panelStyle, { transform }]}
            className={cn(sheetVariants({ side }), className)}
          >
            <View ref={ref} className="flex-1" {...props}>
              {children}
            </View>

            {/* Built-in close button */}
            <Pressable
              onPress={() => onOpenChange(false)}
              className="absolute right-4 top-4 z-10 rounded-sm p-1 opacity-70"
              accessibilityLabel="Close sheet"
            >
              <Text className="text-sm text-foreground leading-none">✕</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    );
  },
);
SheetContent.displayName = "SheetContent";

// ─── SheetHeader ──────────────────────────────────────────────────────────────

function SheetHeader({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}
SheetHeader.displayName = "SheetHeader";

// ─── SheetFooter ──────────────────────────────────────────────────────────────

function SheetFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex flex-row justify-end gap-2 flex-wrap", className)}
      {...props}
    />
  );
}
SheetFooter.displayName = "SheetFooter";

// ─── SheetTitle ───────────────────────────────────────────────────────────────

const SheetTitle = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  ),
);
SheetTitle.displayName = "SheetTitle";

// ─── SheetDescription ─────────────────────────────────────────────────────────

const SheetDescription = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  ),
);
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  sheetVariants,
};
