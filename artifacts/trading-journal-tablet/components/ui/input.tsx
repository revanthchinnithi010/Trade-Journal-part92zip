/**
 * input.tsx — React Native port
 *
 * Web source used a plain <input> HTML element.
 *
 * Web → RN replacements:
 *   input element           → TextInput
 *   HTMLInputElement ref    → TextInput ref
 *   React.ComponentProps<"input"> → TextInputProps
 *   disabled:cursor-not-allowed  → removed (no cursors on native)
 *   focus-visible:*              → removed (no keyboard focus ring on native)
 *   file:*                       → removed (no file input on native)
 *   md:text-sm                   → removed (no breakpoints via media query on native)
 *   type="password"              → secureTextEntry={true}
 *   type="email"                 → keyboardType="email-address"
 *   type="number"                → keyboardType="numeric"
 *   type="tel"                   → keyboardType="phone-pad"
 *   type="search"                → keyboardType="web-search"
 *   type="url"                   → keyboardType="url"
 *
 * Preserved API:
 *   Input          — forwardRef TextInput component
 *   InputProps     — interface exported for typing
 *   className      — NativeWind class string
 *   type           — subset mapped to RN keyboard/security props
 *   disabled       — via editable={false} + opacity-50
 *   placeholder    — forwarded as-is
 *   value          — forwarded as-is
 *   onChangeText   — RN text change handler (replaces onChange)
 */

import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";

import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface InputProps extends Omit<TextInputProps, "ref"> {
  /**
   * Mirrors HTML <input type="...">.
   * Mapped to native equivalents: password → secureTextEntry,
   * email → keyboardType, number → keyboardType, etc.
   */
  type?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Input = React.forwardRef<TextInput, InputProps>(
  ({ className, type, editable, ...props }, ref) => {
    const isDisabled = editable === false;

    // Map HTML input type to RN TextInput equivalents.
    const typeProps: Partial<TextInputProps> = {};
    switch (type) {
      case "password":
        typeProps.secureTextEntry = true;
        break;
      case "email":
        typeProps.keyboardType = "email-address";
        typeProps.autoCapitalize = "none";
        break;
      case "number":
        typeProps.keyboardType = "numeric";
        break;
      case "tel":
        typeProps.keyboardType = "phone-pad";
        break;
      case "search":
        typeProps.keyboardType = "web-search";
        break;
      case "url":
        typeProps.keyboardType = "url";
        typeProps.autoCapitalize = "none";
        break;
      default:
        break;
    }

    return (
      <TextInput
        ref={ref}
        editable={editable}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base text-foreground",
          "placeholder:text-muted-foreground",
          isDisabled && "opacity-50",
          className,
        )}
        {...typeProps}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
