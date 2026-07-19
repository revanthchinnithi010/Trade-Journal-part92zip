/**
 * avatar.tsx — React Native port
 *
 * Web source used @radix-ui/react-avatar (Root / Image / Fallback).
 * Replaced with a context-coordinated View + Image + fallback View trio.
 *
 * Web → RN replacements:
 *   AvatarPrimitive.Root    → View (rounded-full, overflow hidden)
 *   AvatarPrimitive.Image   → Image (react-native) — onLoad/onError drive context
 *   AvatarPrimitive.Fallback→ View shown only while image is absent/loading
 *   "use client" directive  → removed (no Next.js in RN)
 *   HTMLElement refs        → View / Image refs
 *   src (string)            → source={{ uri }} for RN Image
 *
 * Coordination pattern:
 *   Avatar holds imageLoaded state in context.
 *   AvatarImage calls setImageLoaded(true/false) on load/error.
 *   AvatarFallback renders only when !imageLoaded.
 *
 * Preserved API:
 *   Avatar, AvatarImage, AvatarFallback — same component names + displayNames
 *   className, style, children — all forwarded
 *   AvatarImage: src?: string (URI string, mapped to { uri: src })
 *                onLoad, onError — forwarded after state update
 */

import * as React from "react";
import {
  Image,
  StyleSheet,
  View,
  type ImageProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Context ──────────────────────────────────────────────────────────────────

interface AvatarCtx {
  imageLoaded: boolean;
  setImageLoaded: (loaded: boolean) => void;
}

const AvatarContext = React.createContext<AvatarCtx>({
  imageLoaded: false,
  setImageLoaded: () => {},
});

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar = React.forwardRef<View, ViewProps>(
  ({ className, children, ...props }, ref) => {
    const [imageLoaded, setImageLoaded] = React.useState(false);

    return (
      <AvatarContext.Provider value={{ imageLoaded, setImageLoaded }}>
        <View
          ref={ref}
          className={cn(
            "relative h-10 w-10 shrink-0 overflow-hidden rounded-full",
            className,
          )}
          style={styles.avatar}
          {...props}
        >
          {children}
        </View>
      </AvatarContext.Provider>
    );
  },
);
Avatar.displayName = "Avatar";

// ─── AvatarImage ─────────────────────────────────────────────────────────────

export interface AvatarImageProps
  extends Omit<ImageProps, "source"> {
  /** URI string — mapped to { uri: src } for RN Image. */
  src?: string;
  className?: string;
}

const AvatarImage = React.forwardRef<Image, AvatarImageProps>(
  ({ src, className, onLoad, onError, style, ...props }, ref) => {
    const { setImageLoaded } = React.useContext(AvatarContext);

    if (!src) return null;

    return (
      <Image
        ref={ref}
        source={{ uri: src }}
        className={cn("h-full w-full", className)}
        style={[StyleSheet.absoluteFillObject, style]}
        onLoad={(e) => {
          setImageLoaded(true);
          onLoad?.(e);
        }}
        onError={(e) => {
          setImageLoaded(false);
          onError?.(e);
        }}
        {...props}
      />
    );
  },
);
AvatarImage.displayName = "AvatarImage";

// ─── AvatarFallback ───────────────────────────────────────────────────────────

const AvatarFallback = React.forwardRef<View, ViewProps>(
  ({ className, children, ...props }, ref) => {
    const { imageLoaded } = React.useContext(AvatarContext);

    // Hidden once the image loads — mirrors Radix's Fallback delayMs behaviour
    if (imageLoaded) return null;

    return (
      <View
        ref={ref}
        className={cn(
          "h-full w-full items-center justify-center rounded-full bg-muted",
          className,
        )}
        style={StyleSheet.absoluteFillObject}
        {...props}
      >
        {children}
      </View>
    );
  },
);
AvatarFallback.displayName = "AvatarFallback";

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // overflow: "hidden" must be set in StyleSheet — NativeWind's overflow-hidden
  // works on Android only when paired with explicit borderRadius in StyleSheet.
  avatar: {
    overflow: "hidden",
    borderRadius: 9999,
  },
});

export { Avatar, AvatarImage, AvatarFallback };
