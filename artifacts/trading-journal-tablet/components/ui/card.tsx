/**
 * card.tsx — React Native port
 *
 * Web → RN replacements:
 *   div (all)           → View
 *   HTMLDivElement      → View
 *   HTMLAttributes<...> → ViewProps
 *
 * Note: CardTitle and CardDescription are View wrappers — consumers must
 * wrap text content in <Text> for React Native's strict text rendering rules.
 * NativeWind's text-colour inheritance propagates to child <Text> nodes.
 *
 * Preserved API:
 *   Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent
 *   className, style, children, ref — all forwarded.
 */

import * as React from "react";
import { View, type ViewProps } from "react-native";

import { cn } from "@/lib/utils";

// ─── Card ─────────────────────────────────────────────────────────────────────

const Card = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn(
        "rounded-xl border bg-card shadow",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

// ─── CardHeader ───────────────────────────────────────────────────────────────

const CardHeader = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("flex flex-col gap-1.5 p-6", className)}
      {...props}
    />
  ),
);
CardHeader.displayName = "CardHeader";

// ─── CardTitle ────────────────────────────────────────────────────────────────

const CardTitle = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

// ─── CardDescription ─────────────────────────────────────────────────────────

const CardDescription = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  ),
);
CardDescription.displayName = "CardDescription";

// ─── CardContent ──────────────────────────────────────────────────────────────

const CardContent = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

// ─── CardFooter ───────────────────────────────────────────────────────────────

const CardFooter = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("flex flex-row items-center p-6 pt-0", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};
