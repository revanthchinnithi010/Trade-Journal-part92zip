/**
 * input-group.tsx — React Native port
 *
 * Web source used div containers with complex CSS sibling/child selectors
 * (has-[], [&>*:not(:first-child)]:*, group-data-[disabled]:*) and a click
 * handler on InputGroupAddon to programmatically focus the inner input.
 *
 * Web → RN replacements:
 *   div → View
 *   span → View (InputGroupText is a flex row container, not inline text)
 *   Complex CSS selectors (has-[], [&>input]:*, group-data-[*]:*) → removed;
 *     layout handled by explicit flex props on each child instead.
 *   onClick that focuses inner <input> → removed (no DOM query in RN;
 *     consumers should pass a ref and focus it via onPress themselves)
 *   Button   → imported from RN port
 *   Input    → imported from RN port
 *   Textarea → imported from RN port
 *
 * Preserved API:
 *   InputGroup           — View wrapper (group container)
 *   InputGroupAddon      — View addon (inline-start/end, block-start/end)
 *   InputGroupButton     — Button inside addon
 *   InputGroupText       — Text/icon row inside addon
 *   InputGroupInput      — Input inside group (no border / focus ring)
 *   InputGroupTextarea   — Textarea inside group (no border / focus ring)
 *   buttonGroupVariants  — cva factory for InputGroup
 *   inputGroupAddonVariants — cva factory for InputGroupAddon
 *   inputGroupButtonVariants — cva factory for InputGroupButton
 *   orientation          — "horizontal" | "vertical" (InputGroup)
 *   align                — "inline-start" | "inline-end" | "block-start" | "block-end" (addon)
 */

import * as React from "react";
import { View, type ViewProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input, type InputProps } from "@/components/ui/input";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";

// ─── InputGroup ───────────────────────────────────────────────────────────────

const inputGroupVariants = cva(
  "flex items-stretch gap-0 border border-input rounded-md overflow-hidden",
  {
    variants: {
      orientation: {
        horizontal: "flex-row",
        vertical:   "flex-col",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  },
);

function InputGroup({
  className,
  orientation,
  ...props
}: ViewProps & VariantProps<typeof inputGroupVariants>) {
  return (
    <View
      className={cn(inputGroupVariants({ orientation }), className)}
      {...props}
    />
  );
}

// ─── InputGroupAddon ──────────────────────────────────────────────────────────

const inputGroupAddonVariants = cva(
  "flex items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground",
  {
    variants: {
      align: {
        "inline-start": "flex-row pl-3",
        "inline-end":   "flex-row pr-3",
        "block-start":  "flex-col w-full justify-start px-3 pt-3",
        "block-end":    "flex-col w-full justify-start px-3 pb-3",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  },
);

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: ViewProps & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <View
      className={cn(inputGroupAddonVariants({ align }), className)}
      {...props}
    />
  );
}

// ─── InputGroupButton ─────────────────────────────────────────────────────────

const inputGroupButtonVariants = cva(
  "flex items-center gap-2 text-sm shadow-none",
  {
    variants: {
      size: {
        xs:       "h-6 gap-1 rounded-md px-2",
        sm:       "h-8 gap-1.5 rounded-md px-2.5",
        "icon-xs": "h-6 w-6 rounded-md p-0",
        "icon-sm": "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  },
);

function InputGroupButton({
  className,
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<ButtonProps, "size"> & VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  );
}

// ─── InputGroupText ───────────────────────────────────────────────────────────
// Flex row for icons, labels, and static text inside an addon.

function InputGroupText({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex-row items-center gap-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

// ─── InputGroupInput ──────────────────────────────────────────────────────────

function InputGroupInput({ className, ...props }: InputProps) {
  return (
    <Input
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none",
        className,
      )}
      {...props}
    />
  );
}

// ─── InputGroupTextarea ───────────────────────────────────────────────────────

function InputGroupTextarea({ className, ...props }: TextareaProps) {
  return (
    <Textarea
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent py-3 shadow-none",
        className,
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
  inputGroupVariants,
  inputGroupAddonVariants,
  inputGroupButtonVariants,
};
