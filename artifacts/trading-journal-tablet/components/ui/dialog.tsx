/**
 * dialog.tsx — React Native port
 *
 * Web source: @radix-ui/react-dialog
 *
 * Web → RN replacements:
 *   DialogPrimitive.Root      → React context (controlled/uncontrolled open state)
 *   DialogPrimitive.Trigger   → Pressable (opens dialog)
 *   DialogPrimitive.Portal    → pass-through (Modal handles z-ordering)
 *   DialogPrimitive.Close     → Pressable (closes dialog)
 *   DialogPrimitive.Overlay   → semi-transparent View inside Modal
 *   DialogPrimitive.Content   → Modal + inner View panel
 *   DialogPrimitive.Title     → Text (semibold)
 *   DialogPrimitive.Description → Text (muted)
 *   X icon (lucide)           → "✕" unicode in Text
 *   fixed/translate CSS       → Modal centers content natively
 *   data-[state=*]:animate-*  → animationType="fade" on Modal
 *   HTMLDivElement refs       → View refs
 *   sm:* breakpoints          → removed
 *
 * Preserved API:
 *   Dialog, DialogTrigger, DialogPortal, DialogClose
 *   DialogOverlay, DialogContent
 *   DialogHeader, DialogFooter, DialogTitle, DialogDescription
 *
 * Behavioral note: backdrop press dismisses the dialog (matches web Radix).
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

// ─── Context ──────────────────────────────────────────────────────────────────

interface DialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue>({
  open: false,
  onOpenChange: () => {},
});

// ─── Dialog (Root) ────────────────────────────────────────────────────────────

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
  modal?: boolean; // accepted for API compat, ignored in RN
}

function Dialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: DialogProps) {
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
    <DialogContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      {children}
    </DialogContext.Provider>
  );
}
Dialog.displayName = "Dialog";

// ─── DialogTrigger ────────────────────────────────────────────────────────────

const DialogTrigger = React.forwardRef<View, PressableProps>(
  ({ onPress, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(DialogContext);
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
DialogTrigger.displayName = "DialogTrigger";

// ─── DialogPortal ─────────────────────────────────────────────────────────────
// Pass-through — RN Modal handles z-ordering without a DOM portal.

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
DialogPortal.displayName = "DialogPortal";

// ─── DialogClose ──────────────────────────────────────────────────────────────

const DialogClose = React.forwardRef<View, PressableProps>(
  ({ onPress, children, ...props }, ref) => {
    const { onOpenChange } = React.useContext(DialogContext);
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
DialogClose.displayName = "DialogClose";

// ─── DialogOverlay ────────────────────────────────────────────────────────────

const DialogOverlay = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("absolute inset-0 bg-black/80", className)}
      {...props}
    />
  ),
);
DialogOverlay.displayName = "DialogOverlay";

// ─── DialogContent ────────────────────────────────────────────────────────────

export interface DialogContentProps extends ViewProps {
  onOpenAutoFocus?: (e: Event) => void; // web compat, ignored
  onCloseAutoFocus?: (e: Event) => void; // web compat, ignored
  onEscapeKeyDown?: (e: KeyboardEvent) => void; // web compat, ignored
  onInteractOutside?: () => void; // web compat, maps to backdrop press
}

const DialogContent = React.forwardRef<View, DialogContentProps>(
  ({ className, children, onInteractOutside, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(DialogContext);

    return (
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => onOpenChange(false)}
        statusBarTranslucent
      >
        {/* Backdrop */}
        <Pressable
          className="absolute inset-0 bg-black/80"
          onPress={() => {
            onInteractOutside?.();
            onOpenChange(false);
          }}
        />

        {/* Panel */}
        <View className="flex-1 items-center justify-center px-4">
          <View
            ref={ref}
            className={cn(
              "w-full max-w-lg gap-4 rounded-lg border border-border bg-background p-6 shadow-lg",
              className,
            )}
            {...props}
          >
            {children}

            {/* Built-in close button */}
            <Pressable
              onPress={() => onOpenChange(false)}
              className="absolute right-4 top-4 rounded-sm p-1 opacity-70"
              accessibilityLabel="Close dialog"
            >
              <Text className="text-sm text-foreground leading-none">✕</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  },
);
DialogContent.displayName = "DialogContent";

// ─── DialogHeader ─────────────────────────────────────────────────────────────

function DialogHeader({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}
DialogHeader.displayName = "DialogHeader";

// ─── DialogFooter ─────────────────────────────────────────────────────────────

function DialogFooter({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex flex-row justify-end gap-2 flex-wrap", className)}
      {...props}
    />
  );
}
DialogFooter.displayName = "DialogFooter";

// ─── DialogTitle ──────────────────────────────────────────────────────────────

const DialogTitle = React.forwardRef<Text, TextProps>(
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
DialogTitle.displayName = "DialogTitle";

// ─── DialogDescription ───────────────────────────────────────────────────────

const DialogDescription = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  ),
);
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
