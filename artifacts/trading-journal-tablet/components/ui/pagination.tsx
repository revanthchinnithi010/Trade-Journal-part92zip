/**
 * pagination.tsx — React Native port
 *
 * Web source: HTML nav + ul/li/a elements with buttonVariants
 *
 * Web → RN replacements:
 *   nav element          → View with accessibilityRole="none" (no nav role in RN)
 *   ul / li elements     → View (flex-row)
 *   a element            → Pressable (PaginationLink)
 *   href / navigation    → onPress callback (callers handle navigation)
 *   ChevronLeft/Right    → Unicode "‹" / "›" via Text
 *   MoreHorizontal       → "…" via Text
 *   buttonVariants cva   → inline className logic (no import from button needed)
 *   sr-only span         → accessibilityLabel prop
 *
 * Preserved API:
 *   Pagination            — root nav wrapper
 *   PaginationContent     — flex-row item container
 *   PaginationItem        — individual slot wrapper
 *   PaginationLink        — page number / named page button (isActive, size, onPress)
 *   PaginationPrevious    — previous button
 *   PaginationNext        — next button
 *   PaginationEllipsis    — "…" spacer
 *
 * Props difference:
 *   PaginationLink replaces href+<a> with onPress+<Pressable>.
 *   All size/variant className logic is preserved via NativeWind.
 */

import * as React from "react";
import {
  Pressable,
  Text,
  View,
  type PressableProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationProps extends ViewProps {
  className?: string;
}

function Pagination({ className, ...props }: PaginationProps) {
  return (
    <View
      accessibilityRole="none"
      accessibilityLabel="pagination"
      className={cn("mx-auto flex-row w-full justify-center", className)}
      {...props}
    />
  );
}
Pagination.displayName = "Pagination";

// ─── PaginationContent ────────────────────────────────────────────────────────

const PaginationContent = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("flex-row items-center gap-1", className)}
      {...props}
    />
  ),
);
PaginationContent.displayName = "PaginationContent";

// ─── PaginationItem ───────────────────────────────────────────────────────────

const PaginationItem = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View ref={ref} className={cn("", className)} {...props} />
  ),
);
PaginationItem.displayName = "PaginationItem";

// ─── PaginationLink ───────────────────────────────────────────────────────────

export type PaginationLinkSize = "default" | "sm" | "lg" | "icon";

export interface PaginationLinkProps extends PressableProps {
  className?: string;
  isActive?: boolean;
  size?: PaginationLinkSize;
  /** Replaces web href — callers provide navigation via onPress */
  href?: string; // accepted for API compat; ignored in RN
}

function PaginationLink({
  className,
  isActive,
  size = "icon",
  href: _href,
  children,
  ...props
}: PaginationLinkProps) {
  const sizeClass: Record<PaginationLinkSize, string> = {
    default: "min-h-9 px-4 py-2",
    sm:      "min-h-8 px-3",
    lg:      "min-h-10 px-8",
    icon:    "h-9 w-9",
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!isActive }}
      className={cn(
        "flex-row items-center justify-center rounded-md text-sm font-medium",
        sizeClass[size],
        isActive
          ? "border border-input bg-transparent"
          : "bg-transparent border border-transparent",
        className,
      )}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className="text-sm text-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
PaginationLink.displayName = "PaginationLink";

// ─── PaginationPrevious ───────────────────────────────────────────────────────

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      accessibilityLabel="Go to previous page"
      className={cn("gap-1 pl-2.5", className)}
      {...props}
    >
      <View className="flex-row items-center gap-1">
        <Text className="text-foreground text-sm">{"‹"}</Text>
        <Text className="text-foreground text-sm">Previous</Text>
      </View>
    </PaginationLink>
  );
}
PaginationPrevious.displayName = "PaginationPrevious";

// ─── PaginationNext ───────────────────────────────────────────────────────────

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      accessibilityLabel="Go to next page"
      className={cn("gap-1 pr-2.5", className)}
      {...props}
    >
      <View className="flex-row items-center gap-1">
        <Text className="text-foreground text-sm">Next</Text>
        <Text className="text-foreground text-sm">{"›"}</Text>
      </View>
    </PaginationLink>
  );
}
PaginationNext.displayName = "PaginationNext";

// ─── PaginationEllipsis ───────────────────────────────────────────────────────

function PaginationEllipsis({
  className,
  ...props
}: ViewProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn("h-9 w-9 items-center justify-center", className)}
      {...props}
    >
      <Text className="text-foreground text-sm">{"…"}</Text>
    </View>
  );
}
PaginationEllipsis.displayName = "PaginationEllipsis";

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
