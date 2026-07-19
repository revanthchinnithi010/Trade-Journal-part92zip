/**
 * alert.tsx — React Native port
 *
 * Web → RN replacements:
 *   div          → View
 *   h5           → Text (accessibilityRole="header")
 *   role="alert" → accessibilityRole="alert"
 *   HTMLDivElement / HTMLAttributes → View / ViewProps
 *   HTMLParagraphElement / HTMLHeadingElement → Text / TextProps
 *
 * Removed (web-only, no RN equivalent):
 *   [&>svg+div]:translate-y-[-3px]
 *   [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4
 *   [&>svg]:text-foreground [&>svg~*]:pl-7
 *   dark: prefix variants (ThemeContext handles theming in RN)
 */

import * as React from "react";
import { Text, View, type TextProps, type ViewProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3",
  {
    variants: {
      variant: {
        default:     "bg-background border-border",
        destructive: "border-destructive/50",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// ─── Alert ────────────────────────────────────────────────────────────────────

const Alert = React.forwardRef<
  View,
  ViewProps & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <View
    ref={ref}
    accessibilityRole="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

// ─── AlertTitle ───────────────────────────────────────────────────────────────

const AlertTitle = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      accessibilityRole="header"
      className={cn("mb-1 font-medium leading-none tracking-tight text-foreground text-sm", className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = "AlertTitle";

// ─── AlertDescription ─────────────────────────────────────────────────────────

const AlertDescription = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("text-sm", className)}
      {...props}
    />
  ),
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
