/**
 * label.tsx — React Native port
 *
 * Web source used @radix-ui/react-label (wraps <label> HTML element).
 * React Native has no <label> concept; Text is the direct equivalent.
 *
 * Web → RN replacements:
 *   @radix-ui/react-label → Text (react-native)
 *   HTMLElement / ComponentPropsWithoutRef → TextProps
 *
 * Removed (web-only):
 *   htmlFor           — no DOM inputs in RN
 *   peer-disabled:*   — no peer selector in NativeWind on native
 *
 * Preserved API:
 *   className, style, children, onPress (replaces onClick for tap handling)
 *   All other TextProps forwarded as-is.
 */

import * as React from "react";
import { Text, type TextProps } from "react-native";

import { cn } from "@/lib/utils";

const Label = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => (
    <Text
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none",
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export { Label };
