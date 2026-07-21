/**
 * components/ui/item.tsx — React Native port of the web item.tsx UI primitive.
 *
 * Web original: artifacts/trading-journal/src/components/ui/item.tsx
 *
 * Conversions applied (behaviour unchanged):
 *   <div>           → <View>
 *   <p>             → <Text>
 *   className       → style (ViewStyle / TextStyle)
 *   cn() + CVA      → inline StyleSheet + variant lookup
 *   Radix Slot      → accepted as prop but not used (no Radix in RN)
 *   Separator       → View with hairline border
 *
 * All exports are preserved exactly:
 *   Item, ItemMedia, ItemContent, ItemActions,
 *   ItemGroup, ItemSeparator, ItemTitle, ItemDescription,
 *   ItemHeader, ItemFooter
 */

import * as React from "react";
import {
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

// ─────────────────────────────────────────────────────────────────────────────
// ItemGroup — role="list" wrapper
// ─────────────────────────────────────────────────────────────────────────────

interface ItemGroupProps {
  style?: ViewStyle;
  children?: React.ReactNode;
}

function ItemGroup({ style, ...props }: ItemGroupProps) {
  return (
    <View
      accessibilityRole="list"
      style={[styles.itemGroup, style]}
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemSeparator — horizontal divider (replaces web Separator component)
// ─────────────────────────────────────────────────────────────────────────────

interface ItemSeparatorProps {
  style?: ViewStyle;
}

function ItemSeparator({ style }: ItemSeparatorProps) {
  return <View style={[styles.separator, style]} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Item — main list-item container
//
// variant: "default" | "outline" | "muted"
// size:    "default" | "sm"
// asChild: accepted in props (web API compat) but ignored in RN — there is no
//          Radix Slot equivalent; callers wrap with Pressable when needed.
// ─────────────────────────────────────────────────────────────────────────────

type ItemVariant = "default" | "outline" | "muted";
type ItemSize    = "default" | "sm";

interface ItemProps {
  variant?:  ItemVariant;
  size?:     ItemSize;
  /** Accepted for web API compatibility; ignored in React Native. */
  asChild?:  boolean;
  style?:    ViewStyle;
  children?: React.ReactNode;
}

function Item({
  variant  = "default",
  size     = "default",
  asChild  = false,    // eslint-disable-line @typescript-eslint/no-unused-vars
  style,
  ...props
}: ItemProps) {
  return (
    <View
      style={[
        styles.item,
        variant === "outline" && styles.itemOutline,
        variant === "muted"   && styles.itemMuted,
        size    === "sm"      && styles.itemSm,
        style,
      ]}
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemMedia — leading icon / image slot
// ─────────────────────────────────────────────────────────────────────────────

type ItemMediaVariant = "default" | "icon" | "image";

interface ItemMediaProps {
  variant?:  ItemMediaVariant;
  style?:    ViewStyle;
  children?: React.ReactNode;
}

function ItemMedia({ variant = "default", style, ...props }: ItemMediaProps) {
  return (
    <View
      style={[
        styles.itemMedia,
        variant === "icon"  && styles.itemMediaIcon,
        variant === "image" && styles.itemMediaImage,
        style,
      ]}
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemContent — flex-column content area
// ─────────────────────────────────────────────────────────────────────────────

interface ItemContentProps {
  style?:    ViewStyle;
  children?: React.ReactNode;
}

function ItemContent({ style, ...props }: ItemContentProps) {
  return <View style={[styles.itemContent, style]} {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemTitle — primary label row
// ─────────────────────────────────────────────────────────────────────────────

interface ItemTitleProps {
  style?:    ViewStyle;
  children?: React.ReactNode;
}

function ItemTitle({ style, ...props }: ItemTitleProps) {
  return <View style={[styles.itemTitle, style]} {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemDescription — secondary supporting text
// ─────────────────────────────────────────────────────────────────────────────

interface ItemDescriptionProps {
  style?:       TextStyle;
  children?:    React.ReactNode;
  numberOfLines?: number;
}

function ItemDescription({
  style,
  numberOfLines = 2,
  ...props
}: ItemDescriptionProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[styles.itemDescription, style]}
      {...props}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemActions — trailing action buttons
// ─────────────────────────────────────────────────────────────────────────────

interface ItemActionsProps {
  style?:    ViewStyle;
  children?: React.ReactNode;
}

function ItemActions({ style, ...props }: ItemActionsProps) {
  return <View style={[styles.itemActions, style]} {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemHeader — full-width header row (basis-full equivalent)
// ─────────────────────────────────────────────────────────────────────────────

interface ItemHeaderProps {
  style?:    ViewStyle;
  children?: React.ReactNode;
}

function ItemHeader({ style, ...props }: ItemHeaderProps) {
  return <View style={[styles.itemHeader, style]} {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// ItemFooter — full-width footer row (basis-full equivalent)
// ─────────────────────────────────────────────────────────────────────────────

interface ItemFooterProps {
  style?:    ViewStyle;
  children?: React.ReactNode;
}

function ItemFooter({ style, ...props }: ItemFooterProps) {
  return <View style={[styles.itemFooter, style]} {...props} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — mirrors web CVA variants and Tailwind tokens
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ItemGroup — flex column (mirrors "flex flex-col")
  itemGroup: {
    flexDirection: "column",
  },

  // ItemSeparator — hairline horizontal line (mirrors Separator orientation="horizontal")
  separator: {
    height:          StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.10)",  // muted border
    marginVertical:  0,
  },

  // Item base — mirrors:
  //   "flex flex-wrap items-center rounded-md border border-transparent text-sm"
  // variant=default
  item: {
    flexDirection:  "row",
    flexWrap:       "wrap",
    alignItems:     "center",
    borderRadius:   6,
    borderWidth:    1,
    borderColor:    "transparent",
    gap:            16,   // size=default: gap-4
    padding:        16,   // size=default: p-4
  },
  // variant=outline — mirrors "border-border"
  itemOutline: {
    borderColor: "rgba(255,255,255,0.12)",
  },
  // variant=muted — mirrors "bg-muted/50"
  itemMuted: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  // size=sm — mirrors "gap-2.5 px-4 py-3"
  itemSm: {
    gap:             10,
    paddingHorizontal: 16,
    paddingVertical:   12,
  },

  // ItemMedia base — mirrors:
  //   "flex shrink-0 items-center justify-center gap-2"
  itemMedia: {
    flexShrink:     0,
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            8,
  },
  // variant=icon — mirrors "bg-muted size-8 rounded-sm border"
  itemMediaIcon: {
    width:           32,
    height:          32,
    borderRadius:    4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.10)",
  },
  // variant=image — mirrors "size-10 overflow-hidden rounded-sm"
  itemMediaImage: {
    width:        40,
    height:       40,
    borderRadius: 4,
    overflow:     "hidden",
  },

  // ItemContent — mirrors "flex flex-1 flex-col gap-1"
  itemContent: {
    flex:          1,
    flexDirection: "column",
    gap:           4,
  },

  // ItemTitle — mirrors "flex w-fit items-center gap-2 text-sm font-medium leading-snug"
  itemTitle: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },

  // ItemDescription — mirrors "text-muted-foreground line-clamp-2 text-sm font-normal"
  itemDescription: {
    color:      "rgba(148,163,184,0.70)",
    fontSize:   14,
    fontWeight: "400",
    lineHeight: 20,
  },

  // ItemActions — mirrors "flex items-center gap-2"
  itemActions: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },

  // ItemHeader — mirrors "flex basis-full items-center justify-between gap-2"
  itemHeader: {
    flexDirection:  "row",
    alignSelf:      "stretch",
    alignItems:     "center",
    justifyContent: "space-between",
    gap:            8,
    width:          "100%",
  },

  // ItemFooter — mirrors "flex basis-full items-center justify-between gap-2"
  itemFooter: {
    flexDirection:  "row",
    alignSelf:      "stretch",
    alignItems:     "center",
    justifyContent: "space-between",
    gap:            8,
    width:          "100%",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Exports — identical to the web original
// ─────────────────────────────────────────────────────────────────────────────

export {
  Item,
  ItemMedia,
  ItemContent,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemFooter,
};
