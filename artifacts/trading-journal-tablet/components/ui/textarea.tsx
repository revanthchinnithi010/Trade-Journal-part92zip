/**
 * textarea.tsx — React Native port
 *
 * Web source used a plain <textarea> HTML element.
 *
 * Web → RN replacements:
 *   textarea element          → TextInput with multiline={true}
 *   HTMLTextAreaElement ref   → TextInput ref
 *   React.ComponentProps<"textarea"> → TextInputProps
 *   resize-none               → removed (no resize handles in RN)
 *   disabled:cursor-not-allowed  → removed
 *   focus-visible:*           → removed
 *   md:text-sm                → removed
 *
 * Preserved API:
 *   Textarea     — forwardRef TextInput component
 *   TextareaProps — interface exported for typing
 *   className    — NativeWind class string
 *   placeholder  — forwarded as-is
 *   value        — forwarded as-is
 *   onChangeText — RN text change handler
 */

import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";

import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface TextareaProps extends Omit<TextInputProps, "ref"> {}

// ─── Component ────────────────────────────────────────────────────────────────

const Textarea = React.forwardRef<TextInput, TextareaProps>(
  ({ className, editable, ...props }, ref) => {
    const isDisabled = editable === false;

    return (
      <TextInput
        ref={ref}
        multiline
        textAlignVertical="top"
        editable={editable}
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base text-foreground",
          "placeholder:text-muted-foreground",
          isDisabled && "opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
