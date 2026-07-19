/**
 * breadcrumb.tsx — React Native port
 *
 * Web source: HTML nav/ol/li/a/span elements with Radix Slot
 *
 * Web → RN replacements:
 *   <nav>                  → View (no landmark nav role in RN)
 *   <ol> / <li>            → View (flex-row)
 *   <a> / Slot (asChild)   → Pressable with onPress (callers handle navigation)
 *   <span>                 → Text / View
 *   ChevronRight (lucide)  → "›" unicode Text
 *   MoreHorizontal (lucide)→ "…" unicode Text
 *   href + routing         → removed; use onPress for navigation
 *   asChild / Slot         → removed (no RN equivalent)
 *   sm:gap-2.5             → single gap value (no breakpoints in RN)
 *   sr-only span           → accessibilityLabel on parent element
 *
 * Preserved API:
 *   Breadcrumb             — root wrapper
 *   BreadcrumbList         — horizontal flex-row container
 *   BreadcrumbItem         — individual item slot
 *   BreadcrumbLink         — tappable crumb (onPress replaces href)
 *   BreadcrumbPage         — current (non-tappable) crumb
 *   BreadcrumbSeparator    — separator glyph between crumbs
 *   BreadcrumbEllipsis     — collapsed crumbs indicator
 *
 * API differences:
 *   BreadcrumbLink: `href` prop accepted for API compat but ignored; use `onPress`.
 *   BreadcrumbLink: `asChild` prop accepted but ignored.
 */

import * as React from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
  type TextProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

const Breadcrumb = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      accessibilityRole="none"
      accessibilityLabel="breadcrumb"
      className={cn("", className)}
      {...props}
    />
  ),
);
Breadcrumb.displayName = "Breadcrumb";

// ─── BreadcrumbList ───────────────────────────────────────────────────────────

const BreadcrumbList = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn(
        "flex flex-row flex-wrap items-center gap-1.5",
        className,
      )}
      {...props}
    />
  ),
);
BreadcrumbList.displayName = "BreadcrumbList";

// ─── BreadcrumbItem ───────────────────────────────────────────────────────────

const BreadcrumbItem = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("flex-row items-center gap-1.5", className)}
      {...props}
    />
  ),
);
BreadcrumbItem.displayName = "BreadcrumbItem";

// ─── BreadcrumbLink ───────────────────────────────────────────────────────────

export interface BreadcrumbLinkProps
  extends Omit<PressableProps, "children"> {
  className?: string;
  /** API compat — not used in RN; provide onPress for navigation */
  href?: string;
  /** API compat — ignored in RN */
  asChild?: boolean;
  children?: React.ReactNode;
}

const BreadcrumbLink = React.forwardRef<View, BreadcrumbLinkProps>(
  ({ className, href: _href, asChild: _asChild, children, ...props }, ref) => (
    <Pressable
      ref={ref}
      accessibilityRole="link"
      className={cn("", className)}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className="text-sm text-muted-foreground">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  ),
);
BreadcrumbLink.displayName = "BreadcrumbLink";

// ─── BreadcrumbPage ───────────────────────────────────────────────────────────

const BreadcrumbPage = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      accessibilityRole="none"
      accessibilityLabel="Current page"
      className={cn("text-sm font-normal text-foreground", className)}
      {...props}
    />
  ),
);
BreadcrumbPage.displayName = "BreadcrumbPage";

// ─── BreadcrumbSeparator ──────────────────────────────────────────────────────

function BreadcrumbSeparator({
  className,
  children,
  ...props
}: ViewProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn("items-center justify-center", className)}
      {...props}
    >
      {children ?? (
        <Text className="text-sm text-muted-foreground">{"›"}</Text>
      )}
    </View>
  );
}
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

// ─── BreadcrumbEllipsis ───────────────────────────────────────────────────────

function BreadcrumbEllipsis({ className, ...props }: ViewProps) {
  return (
    <View
      accessibilityRole="none"
      accessibilityLabel="More breadcrumb items"
      className={cn("h-9 w-9 items-center justify-center", className)}
      {...props}
    >
      <Text className="text-sm text-muted-foreground">{"…"}</Text>
    </View>
  );
}
BreadcrumbEllipsis.displayName = "BreadcrumbEllipsis";

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
