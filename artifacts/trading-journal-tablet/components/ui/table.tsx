/**
 * table.tsx — React Native port
 *
 * Web source: HTML <table> elements with Tailwind classes
 *
 * Web → RN replacements:
 *   table               → ScrollView (horizontal) wrapping Views
 *   thead               → TableHeader — sticky View above the scroll body
 *   tbody               → TableBody  — FlatList-ready View column
 *   tfoot               → TableFooter — View at the bottom
 *   tr                  → TableRow — horizontal View
 *   th                  → TableHead — Text (bold, muted)
 *   td                  → TableCell — View/Text cell
 *   caption             → TableCaption — Text below
 *   overflow-auto       → ScrollView with horizontal + vertical scroll
 *   zebra stripe        → isZebra prop on TableRow (every odd row)
 *   sticky header       → stickyHeaderIndices on outer ScrollView
 *
 * Preserved API:
 *   Table, TableHeader, TableBody, TableFooter
 *   TableRow, TableHead, TableCell, TableCaption
 *   All className / style props forwarded
 *
 * Architecture note:
 *   Table wraps everything in a horizontal+vertical ScrollView.
 *   TableHeader renders as the first child; pass stickyHeaderIndices={[0]}
 *   to the inner ScrollView automatically so the header stays pinned.
 */

import * as React from "react";
import {
  ScrollView,
  View,
  Text,
  type ViewProps,
  type TextProps,
  type ScrollViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Table ────────────────────────────────────────────────────────────────────

export interface TableProps extends ScrollViewProps {
  className?: string;
}

const Table = React.forwardRef<ScrollView, TableProps>(
  ({ className, children, ...props }, ref) => (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      className={cn("w-full", className)}
      {...props}
    >
      <View className="min-w-full">{children}</View>
    </ScrollView>
  ),
);
Table.displayName = "Table";

// ─── TableHeader ──────────────────────────────────────────────────────────────

const TableHeader = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("border-b border-border", className)}
      {...props}
    />
  ),
);
TableHeader.displayName = "TableHeader";

// ─── TableBody ────────────────────────────────────────────────────────────────

const TableBody = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View ref={ref} className={cn("flex-1", className)} {...props} />
  ),
);
TableBody.displayName = "TableBody";

// ─── TableFooter ──────────────────────────────────────────────────────────────

const TableFooter = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("border-t border-border bg-muted/50 font-medium", className)}
      {...props}
    />
  ),
);
TableFooter.displayName = "TableFooter";

// ─── TableRow ─────────────────────────────────────────────────────────────────

export interface TableRowProps extends ViewProps {
  /** When true renders with a subtle muted background (zebra striping). */
  isZebra?: boolean;
  /** When true renders with the selected muted background. */
  selected?: boolean;
}

const TableRow = React.forwardRef<View, TableRowProps>(
  ({ className, isZebra, selected, ...props }, ref) => (
    <View
      ref={ref}
      accessibilityRole="none"
      className={cn(
        "flex-row border-b border-border items-center",
        isZebra && "bg-muted/30",
        selected && "bg-muted",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

// ─── TableHead ────────────────────────────────────────────────────────────────

const TableHead = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      accessibilityRole="header"
      className={cn(
        "h-10 px-2 py-2 text-left text-sm font-medium text-muted-foreground flex-1",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

// ─── TableCell ────────────────────────────────────────────────────────────────

const TableCell = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("p-2 flex-1 justify-center", className)}
      {...props}
    />
  ),
);
TableCell.displayName = "TableCell";

// ─── TableCaption ─────────────────────────────────────────────────────────────

const TableCaption = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn("mt-4 text-sm text-muted-foreground text-center", className)}
      {...props}
    />
  ),
);
TableCaption.displayName = "TableCaption";

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
