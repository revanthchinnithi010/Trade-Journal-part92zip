/**
 * drawer.tsx — React Native port
 *
 * Web source: vaul (Drawer as DrawerPrimitive)
 *
 * Web → RN replacements:
 *   DrawerPrimitive.Root        → React context (open state)
 *   DrawerPrimitive.Trigger     → Pressable
 *   DrawerPrimitive.Portal      → pass-through
 *   DrawerPrimitive.Close       → Pressable (closes)
 *   DrawerPrimitive.Overlay     → View backdrop inside Modal
 *   DrawerPrimitive.Content     → Modal + Animated.View slides from bottom
 *   DrawerPrimitive.Title       → Text semibold
 *   DrawerPrimitive.Description → Text muted
 *   shouldScaleBackground       → accepted for API compat; ignored in RN
 *   vaul gesture-driven snap    → simplified: drag handle shown, no snap points
 *   rounded-t-[10px]            → rounded-t-xl (NativeWind token)
 *   mt-24                       → min-height guard via flex
 *
 * Preserved API:
 *   Drawer (with shouldScaleBackground), DrawerTrigger, DrawerPortal, DrawerClose
 *   DrawerOverlay, DrawerContent, DrawerHeader, DrawerFooter
 *   DrawerTitle, DrawerDescription
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

import { cn } from "@/lib/utils";

// ─── Animation hook (slide from bottom) ──────────────────────────────────────

function useBottomSheetAnimation(open: boolean) {
  const anim = React.useRef(new Animated.Value(open ? 1 : 0)).current;
  const [modalVisible, setModalVisible] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setModalVisible(true);
      Animated.spring(anim, {
        toValue: 1,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setModalVisible(false);
      });
    }
  }, [open, anim]);

  return { anim, modalVisible };
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface DrawerContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DrawerContext = React.createContext<DrawerContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ─── Drawer (Root) ────────────────────────────────────────────────────────────

export interface DrawerRootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  shouldScaleBackground?: boolean; // accepted for API compat; ignored in RN
  children?: React.ReactNode;
  direction?: "top" | "bottom" | "left" | "right"; // API compat, bottom only supported
  snapPoints?: number[]; // API compat, ignored in RN
}

function Drawer({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  shouldScaleBackground: _sb,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  direction: _dir,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  snapPoints: _sp,
}: DrawerRootProps) {
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
    <DrawerContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </DrawerContext.Provider>
  );
}
Drawer.displayName = "Drawer";

// ─── DrawerTrigger ────────────────────────────────────────────────────────────

const DrawerTrigger = React.forwardRef<View, PressableProps>(
  ({ onPress, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(DrawerContext);
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
DrawerTrigger.displayName = "DrawerTrigger";

// ─── DrawerPortal ─────────────────────────────────────────────────────────────

function DrawerPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
DrawerPortal.displayName = "DrawerPortal";

// ─── DrawerClose ──────────────────────────────────────────────────────────────

const DrawerClose = React.forwardRef<View, PressableProps>(
  ({ onPress, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(DrawerContext);
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
DrawerClose.displayName = "DrawerClose";

// ─── DrawerOverlay ────────────────────────────────────────────────────────────

const DrawerOverlay = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("absolute inset-0 bg-black/80", className)}
      {...props}
    />
  ),
);
DrawerOverlay.displayName = "DrawerOverlay";

// ─── DrawerContent ────────────────────────────────────────────────────────────

const DrawerContent = React.forwardRef<View, ViewProps>(
  ({ className, children, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(DrawerContext);
    const { height: screenHeight } = useWindowDimensions();
    const { anim, modalVisible } = useBottomSheetAnimation(open);

    const translateY = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [screenHeight, 0],
    });

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

        {/* Sliding panel from bottom */}
        <View className="flex-1 justify-end" pointerEvents="box-none">
          <Animated.View
            style={{ transform: [{ translateY }] }}
            className={cn(
              "rounded-t-xl bg-background border-t border-border",
              className,
            )}
          >
            {/* Drag handle indicator (visual only — no gesture in simplified port) */}
            <View className="items-center pt-3 pb-1">
              <View className="h-1.5 w-12 rounded-full bg-muted" />
            </View>

            <View ref={ref} {...props}>
              {children}
            </View>
          </Animated.View>
        </View>
      </Modal>
    );
  },
);
DrawerContent.displayName = "DrawerContent";

// ─── DrawerHeader ─────────────────────────────────────────────────────────────

function DrawerHeader({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("gap-1.5 p-4", className)}
      {...props}
    />
  );
}
DrawerHeader.displayName = "DrawerHeader";

// ─── DrawerFooter ─────────────────────────────────────────────────────────────

function DrawerFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}
DrawerFooter.displayName = "DrawerFooter";

// ─── DrawerTitle ──────────────────────────────────────────────────────────────

const DrawerTitle = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn(
        "text-lg font-semibold leading-none tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
DrawerTitle.displayName = "DrawerTitle";

// ─── DrawerDescription ────────────────────────────────────────────────────────

const DrawerDescription = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  ),
);
DrawerDescription.displayName = "DrawerDescription";

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
