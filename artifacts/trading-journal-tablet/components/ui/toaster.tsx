/**
 * toaster.tsx — React Native global toast provider
 *
 * Web source: uses useToast() hook + Radix Toast primitives inline
 *
 * Web → RN replacement:
 *   Radix ToastProvider + ToastViewport  → react-native-toast-message <Toast />
 *   useToast() loop over state           → library manages its own queue
 *   CSS transition animations            → library spring/slide animations
 *   fixed position viewport              → library handles position (top/bottom)
 *   data-slot / group selectors          → NativeWind className on custom views
 *
 * Usage:
 *   Mount <Toaster /> once at the root of your app (e.g. app/_layout.tsx),
 *   after all other providers so it sits above the full view hierarchy:
 *
 *     <ThemeProvider>
 *       <SafeAreaProvider>
 *         <Stack />
 *         <Toaster />    ← last child so it renders above everything
 *       </SafeAreaProvider>
 *     </ThemeProvider>
 *
 *   Then trigger toasts from anywhere:
 *     import { toast } from "@/hooks/use-toast";
 *     toast.success("Saved successfully");
 *     toast.error("Something went wrong", { description: "Check your connection." });
 *
 * Custom toast types supported:
 *   success | error | info | warning | loading | default | destructive
 *
 * Theme integration:
 *   All custom toast views use NativeWind className tokens so they
 *   automatically follow the active light/dark theme.
 */

import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import RNToast, { type ToastConfig, type ToastConfigParams } from "react-native-toast-message";

import { cn } from "@/lib/utils";

// ─── Icon glyphs (no lucide in RN) ───────────────────────────────────────────

const ICONS: Record<string, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

// ─── Shared close button ──────────────────────────────────────────────────────

function CloseButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress ?? (() => RNToast.hide())}
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
      hitSlop={12}
      className="ml-2 h-6 w-6 items-center justify-center rounded-md"
    >
      <Text className="text-xs text-muted-foreground">{"✕"}</Text>
    </Pressable>
  );
}

// ─── Toast row component ──────────────────────────────────────────────────────

interface ToastRowProps {
  icon?: string;
  iconClassName?: string;
  text1?: string;
  text2?: string;
  onPress?: () => void;
  hide?: () => void;
  /** Extra left-border accent color applied via inline style */
  accentColor?: string;
  /** Render a spinner instead of the icon (for loading toasts) */
  showSpinner?: boolean;
}

function ToastRow({
  icon,
  iconClassName,
  text1,
  text2,
  onPress,
  hide,
  accentColor,
  showSpinner,
}: ToastRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="mx-3 overflow-hidden rounded-xl border border-border bg-popover shadow-lg"
      style={accentColor ? { borderLeftWidth: 4, borderLeftColor: accentColor } : undefined}
    >
      <View className="flex-row items-start gap-3 px-4 py-3">
        {/* Left icon / spinner */}
        <View className="mt-0.5 h-5 w-5 items-center justify-center">
          {showSpinner ? (
            <ActivityIndicator size="small" color="#B0BCCE" />
          ) : icon ? (
            <Text className={cn("text-sm font-bold", iconClassName)}>{icon}</Text>
          ) : null}
        </View>

        {/* Content */}
        <View className="flex-1 gap-0.5">
          {text1 ? (
            <Text className="text-sm font-semibold text-foreground" numberOfLines={2}>
              {text1}
            </Text>
          ) : null}
          {text2 ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={3}>
              {text2}
            </Text>
          ) : null}
        </View>

        {/* Dismiss */}
        <CloseButton onPress={hide} />
      </View>
    </Pressable>
  );
}

// ─── Custom toast type definitions ───────────────────────────────────────────

const toastConfig: ToastConfig = {
  /** Default / untyped toast */
  default: ({ text1, text2, onPress, hide }: ToastConfigParams<unknown>) => (
    <ToastRow
      icon={undefined}
      text1={text1}
      text2={text2}
      onPress={onPress}
      hide={() => hide()}
    />
  ),

  /** Destructive — alias for error, maps from variant:"destructive" */
  destructive: ({ text1, text2, onPress, hide }: ToastConfigParams<unknown>) => (
    <ToastRow
      icon={ICONS.error}
      iconClassName="text-destructive"
      text1={text1}
      text2={text2}
      onPress={onPress}
      hide={() => hide()}
      accentColor="#E03E3E"
    />
  ),

  /** Success */
  success: ({ text1, text2, onPress, hide }: ToastConfigParams<unknown>) => (
    <ToastRow
      icon={ICONS.success}
      iconClassName="text-green-400"
      text1={text1}
      text2={text2}
      onPress={onPress}
      hide={() => hide()}
      accentColor="#4ade80"
    />
  ),

  /** Error */
  error: ({ text1, text2, onPress, hide }: ToastConfigParams<unknown>) => (
    <ToastRow
      icon={ICONS.error}
      iconClassName="text-destructive"
      text1={text1}
      text2={text2}
      onPress={onPress}
      hide={() => hide()}
      accentColor="#E03E3E"
    />
  ),

  /** Warning */
  warning: ({ text1, text2, onPress, hide }: ToastConfigParams<unknown>) => (
    <ToastRow
      icon={ICONS.warning}
      iconClassName="text-yellow-400"
      text1={text1}
      text2={text2}
      onPress={onPress}
      hide={() => hide()}
      accentColor="#facc15"
    />
  ),

  /** Info */
  info: ({ text1, text2, onPress, hide }: ToastConfigParams<unknown>) => (
    <ToastRow
      icon={ICONS.info}
      iconClassName="text-blue-400"
      text1={text1}
      text2={text2}
      onPress={onPress}
      hide={() => hide()}
      accentColor="#60a5fa"
    />
  ),

  /** Loading — spinner replaces icon, autoHide disabled */
  loading: ({ text1, text2, onPress, hide }: ToastConfigParams<unknown>) => (
    <ToastRow
      showSpinner
      text1={text1}
      text2={text2}
      onPress={onPress}
      hide={() => hide()}
    />
  ),
};

// ─── Toaster (mount once at app root) ────────────────────────────────────────

export interface ToasterProps {
  /** Where toasts appear (default: "top") */
  position?: "top" | "bottom";
  /** Distance from top of screen in px (default: 56 — clears typical header) */
  topOffset?: number;
  /** Distance from bottom of screen in px (default: 80 — clears bottom tabs) */
  bottomOffset?: number;
}

export function Toaster({
  position = "top",
  topOffset = 56,
  bottomOffset = 80,
}: ToasterProps) {
  return (
    <RNToast
      config={toastConfig}
      position={position}
      topOffset={topOffset}
      bottomOffset={bottomOffset}
      visibilityTime={4000}
    />
  );
}
