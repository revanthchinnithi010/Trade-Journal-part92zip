/**
 * alert-dialog.tsx — React Native port
 *
 * Web source: @radix-ui/react-alert-dialog
 *
 * Web → RN replacements:
 *   AlertDialogPrimitive.Root    → React context (open state)
 *   AlertDialogPrimitive.Trigger → Pressable
 *   AlertDialogPrimitive.Portal  → pass-through
 *   AlertDialogPrimitive.Overlay → View (backdrop inside Modal)
 *   AlertDialogPrimitive.Content → Modal + View panel (NO backdrop dismiss —
 *                                  alert dialogs require explicit action)
 *   AlertDialogPrimitive.Title   → Text semibold
 *   AlertDialogPrimitive.Description → Text muted
 *   AlertDialogPrimitive.Action  → primary Button-styled Pressable
 *   AlertDialogPrimitive.Cancel  → outline Button-styled Pressable
 *   buttonVariants               → className strings from RN port
 *   HTMLDivElement refs          → View refs
 *   sm:* breakpoints             → removed
 *
 * Preserved API:
 *   AlertDialog, AlertDialogTrigger, AlertDialogPortal, AlertDialogOverlay
 *   AlertDialogContent, AlertDialogHeader, AlertDialogFooter
 *   AlertDialogTitle, AlertDialogDescription
 *   AlertDialogAction, AlertDialogCancel
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
import { buttonVariants } from "@/components/ui/button";

// ─── Context ──────────────────────────────────────────────────────────────────

interface AlertDialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AlertDialogContext = React.createContext<AlertDialogContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ─── AlertDialog (Root) ───────────────────────────────────────────────────────

export interface AlertDialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

function AlertDialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: AlertDialogProps) {
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
    <AlertDialogContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </AlertDialogContext.Provider>
  );
}
AlertDialog.displayName = "AlertDialog";

// ─── AlertDialogTrigger ───────────────────────────────────────────────────────

const AlertDialogTrigger = React.forwardRef<View, PressableProps>(
  ({ onPress, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(AlertDialogContext);
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
AlertDialogTrigger.displayName = "AlertDialogTrigger";

// ─── AlertDialogPortal ────────────────────────────────────────────────────────

function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
AlertDialogPortal.displayName = "AlertDialogPortal";

// ─── AlertDialogOverlay ───────────────────────────────────────────────────────

const AlertDialogOverlay = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("absolute inset-0 bg-black/80", className)}
      {...props}
    />
  ),
);
AlertDialogOverlay.displayName = "AlertDialogOverlay";

// ─── AlertDialogContent ───────────────────────────────────────────────────────
// Alert dialogs must NOT be dismissed by pressing the backdrop —
// the user must press Action or Cancel.

const AlertDialogContent = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(AlertDialogContext);

    return (
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {/* intentionally no-op — must use Action/Cancel */}}
        statusBarTranslucent
      >
        {/* Non-dismissible backdrop */}
        <View className="absolute inset-0 bg-black/80" />

        <View className="flex-1 items-center justify-center px-4">
          <View
            ref={ref}
            className={cn(
              "w-full max-w-lg gap-4 rounded-lg border border-border bg-background p-6 shadow-lg",
              className,
            )}
            accessibilityRole="alert"
            {...props}
          />
        </View>
      </Modal>
    );
  },
);
AlertDialogContent.displayName = "AlertDialogContent";

// ─── AlertDialogHeader ────────────────────────────────────────────────────────

function AlertDialogHeader({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}
AlertDialogHeader.displayName = "AlertDialogHeader";

// ─── AlertDialogFooter ────────────────────────────────────────────────────────

function AlertDialogFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex flex-row justify-end gap-2 flex-wrap", className)}
      {...props}
    />
  );
}
AlertDialogFooter.displayName = "AlertDialogFooter";

// ─── AlertDialogTitle ─────────────────────────────────────────────────────────

const AlertDialogTitle = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  ),
);
AlertDialogTitle.displayName = "AlertDialogTitle";

// ─── AlertDialogDescription ───────────────────────────────────────────────────

const AlertDialogDescription = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  ),
);
AlertDialogDescription.displayName = "AlertDialogDescription";

// ─── AlertDialogAction ────────────────────────────────────────────────────────

const AlertDialogAction = React.forwardRef<View, PressableProps>(
  ({ className, onPress, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(AlertDialogContext);
    return (
      <Pressable
        ref={ref}
        onPress={(e) => {
          onOpenChange(false);
          onPress?.(e);
        }}
        className={cn(buttonVariants(), className)}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
AlertDialogAction.displayName = "AlertDialogAction";

// ─── AlertDialogCancel ────────────────────────────────────────────────────────

const AlertDialogCancel = React.forwardRef<View, PressableProps>(
  ({ className, onPress, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(AlertDialogContext);
    return (
      <Pressable
        ref={ref}
        onPress={(e) => {
          onOpenChange(false);
          onPress?.(e);
        }}
        className={cn(buttonVariants({ variant: "outline" }), className)}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
