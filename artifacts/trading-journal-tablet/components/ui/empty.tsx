/**
 * empty.tsx — React Native port
 *
 * Web → RN replacements:
 *   div / p             → View
 *   HTMLDivElement      → View
 *   ComponentProps<"div"> / ComponentProps<"p"> → ViewProps
 *
 * Removed (web-only):
 *   md:p-12            — no breakpoint media queries in NativeWind on native
 *   text-balance       — web-only CSS property
 *   [&>a:hover]:*      — hover pseudo-class (no hover on native)
 *   [&>a]:underline    — anchor-scoped selector
 *   text-sm/relaxed    — / line-height modifier
 *   pointer-events-none on svg children — SVG selectors don't apply
 *
 * Preserved API:
 *   Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia
 *   variant prop on EmptyMedia: "default" | "icon"
 */

import * as React from "react";
import { View, type ViewProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ─── Empty ────────────────────────────────────────────────────────────────────

function Empty({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        "flex-1 flex-col items-center justify-center gap-6 rounded-lg border border-dashed border-border p-6",
        className,
      )}
      {...props}
    />
  );
}

// ─── EmptyHeader ──────────────────────────────────────────────────────────────

function EmptyHeader({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        "max-w-sm flex-col items-center gap-2",
        className,
      )}
      {...props}
    />
  );
}

// ─── EmptyMedia ───────────────────────────────────────────────────────────────

const emptyMediaVariants = cva(
  "mb-2 shrink-0 items-center justify-center",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon:    "bg-muted h-10 w-10 shrink-0 items-center justify-center rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: ViewProps & VariantProps<typeof emptyMediaVariants>) {
  return (
    <View
      className={cn(emptyMediaVariants({ variant }), className)}
      {...props}
    />
  );
}

// ─── EmptyTitle ───────────────────────────────────────────────────────────────

function EmptyTitle({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("text-lg font-medium tracking-tight", className)}
      {...props}
    />
  );
}

// ─── EmptyDescription ────────────────────────────────────────────────────────

function EmptyDescription({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

// ─── EmptyContent ────────────────────────────────────────────────────────────

function EmptyContent({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn(
        "w-full max-w-sm flex-col items-center gap-4 text-sm",
        className,
      )}
      {...props}
    />
  );
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
};
