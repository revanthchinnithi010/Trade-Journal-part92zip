/**
 * toast.tsx — React Native port
 *
 * Web source: @radix-ui/react-toast + class-variance-authority
 *
 * WHY THESE ARE STUBS:
 *   The web Toast renders toasts into the DOM via a Radix portal/viewport.
 *   In React Native, react-native-toast-message handles all rendering
 *   imperatively — the <Toast /> component from that library is mounted once
 *   in toaster.tsx and controlled via Toast.show() / Toast.hide().
 *
 *   These stub components preserve the TypeScript API so that
 *   use-toast.ts and any shared code that imports from
 *   "@/components/ui/toast" continues to compile without changes.
 *
 * Web → RN replacements:
 *   @radix-ui/react-toast           → react-native-toast-message (imperative)
 *   ToastPrimitives.Provider        → React.Fragment (pass-through)
 *   ToastPrimitives.Viewport        → View stub (invisible — library handles position)
 *   ToastPrimitives.Root (Toast)    → View stub (no rendering — library renders)
 *   ToastPrimitives.Action          → Pressable (API compat)
 *   ToastPrimitives.Close           → Pressable (API compat)
 *   ToastPrimitives.Title           → Text (API compat)
 *   ToastPrimitives.Description     → Text (API compat)
 *   cva toastVariants               → ToastVariant type only
 *   lucide X icon                   → "✕" Text
 *   data-[state]:animate-*          → library handles animations
 *
 * Preserved exports (all 7):
 *   ToastProps, ToastActionElement (types)
 *   ToastProvider, ToastViewport, Toast, ToastTitle,
 *   ToastDescription, ToastClose, ToastAction
 */

import * as React from "react";
import {
  Pressable,
  Text,
  View,
  type PressableProps,
  type TextProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Maps to react-native-toast-message `type` values. */
export type ToastVariant = "default" | "destructive";

/**
 * ToastProps — kept API-compatible with the web version.
 * Fields used by use-toast.ts: variant, open, onOpenChange.
 */
export interface ToastProps extends ViewProps {
  variant?: ToastVariant;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// ─── ToastProvider ────────────────────────────────────────────────────────────
// Stub — react-native-toast-message does not require a Provider.

function ToastProvider({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
ToastProvider.displayName = "ToastProvider";

// ─── ToastViewport ────────────────────────────────────────────────────────────
// Stub — react-native-toast-message handles its own viewport positioning.

const ToastViewport = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("", className)}
      pointerEvents="none"
      style={{ width: 0, height: 0 }}
      {...props}
    />
  ),
);
ToastViewport.displayName = "ToastViewport";

// ─── Toast ────────────────────────────────────────────────────────────────────
// Stub — actual toast rendering is delegated to react-native-toast-message.
// This component does not render any visible UI; it exists for type compat.

const Toast = React.forwardRef<View, ToastProps>(
  ({ className, variant: _variant, open: _open, onOpenChange: _oc, children, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("", className)}
      style={{ width: 0, height: 0, overflow: "hidden" }}
      {...props}
    >
      {/* Children kept for type compat but not rendered visibly */}
      {children}
    </View>
  ),
);
Toast.displayName = "Toast";

// ─── ToastAction ─────────────────────────────────────────────────────────────

export interface ToastActionProps extends Omit<PressableProps, "children"> {
  /** Required for accessibility — describes the action */
  altText: string;
  className?: string;
  children?: React.ReactNode;
}

const ToastAction = React.forwardRef<View, ToastActionProps>(
  ({ className, altText, children, ...props }, ref) => (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={altText}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border bg-transparent px-3",
        className,
      )}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className="text-sm font-medium text-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  ),
);
ToastAction.displayName = "ToastAction";

/** Mirrors the web type for use-toast.ts compatibility. */
export type ToastActionElement = React.ReactElement<typeof ToastAction>;

// ─── ToastClose ───────────────────────────────────────────────────────────────

const ToastClose = React.forwardRef<View, Omit<PressableProps, "children"> & { className?: string }>(
  ({ className, ...props }, ref) => (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel="Dismiss notification"
      className={cn(
        "absolute right-2 top-2 rounded-md p-1 opacity-70",
        className,
      )}
      {...props}
    >
      <Text className="text-sm text-foreground">{"✕"}</Text>
    </Pressable>
  ),
);
ToastClose.displayName = "ToastClose";

// ─── ToastTitle ───────────────────────────────────────────────────────────────

const ToastTitle = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  ),
);
ToastTitle.displayName = "ToastTitle";

// ─── ToastDescription ─────────────────────────────────────────────────────────

const ToastDescription = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  ),
);
ToastDescription.displayName = "ToastDescription";

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
