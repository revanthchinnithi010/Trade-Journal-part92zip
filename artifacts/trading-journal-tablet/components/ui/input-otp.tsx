/**
 * input-otp.tsx — React Native port
 *
 * Web source used the `input-otp` library (DOM-based) which renders a
 * single hidden <input> behind visual slot cells and manages cursor logic.
 *
 * In React Native there is no equivalent library, so this is a self-contained
 * implementation using a hidden TextInput + React context to share per-slot
 * data with InputOTPSlot children.
 *
 * Web → RN replacements:
 *   OTPInput (input-otp)   → custom InputOTP component with hidden TextInput
 *   OTPInputContext        → OTPInputContext (local, same shape)
 *   div wrappers           → View
 *   Minus (lucide)         → View separator line
 *   animate-caret-blink    → Animated loop (opacity 1 → 0 → 1)
 *   first:rounded-l-md / last:rounded-r-md → explicit index-based className
 *   has-[:disabled]:opacity-50 → conditional opacity on containerClassName
 *
 * Preserved API:
 *   InputOTP           — forwardRef component (ref = hidden TextInput for focus)
 *     maxLength        — number of OTP digits (required)
 *     value            — controlled value string
 *     onChange         — callback(string) on text change
 *     disabled         — disables the hidden input
 *     containerClassName — className for the outer container
 *     className        — not used (kept for web API compat)
 *   InputOTPGroup      — forwardRef View row wrapper
 *   InputOTPSlot       — forwardRef Pressable slot cell
 *     index            — slot index within the OTP value
 *   InputOTPSeparator  — forwardRef View separator
 *
 * OTPInputContext shape mirrors the web library's context so that
 * InputOTPSlot can be written identically to the web version.
 */

import * as React from "react";
import {
  Animated,
  Pressable,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Context (mirrors input-otp OTPInputContext shape) ────────────────────────

interface OTPSlot {
  char: string;
  hasFakeCaret: boolean;
  isActive: boolean;
}

interface OTPContextValue {
  slots: OTPSlot[];
  focusInput: () => void;
}

const OTPInputContext = React.createContext<OTPContextValue>({
  slots: [],
  focusInput: () => {},
});

// ─── InputOTP ─────────────────────────────────────────────────────────────────

export interface InputOTPProps
  extends Omit<TextInputProps, "ref" | "value" | "onChangeText" | "maxLength" | "onChange"> {
  /** Total number of OTP characters. */
  maxLength: number;
  /** Controlled value string (e.g. "1234"). */
  value?: string;
  /** Called with the full value string on every keystroke. */
  onChange?: (value: string) => void;
  disabled?: boolean;
  containerClassName?: string;
  /** Kept for web API compatibility — not applied in RN. */
  className?: string;
  children?: React.ReactNode;
}

const InputOTP = React.forwardRef<TextInput, InputOTPProps>(
  (
    {
      maxLength,
      value: valueProp,
      onChange,
      disabled,
      containerClassName,
      children,
      ...props
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState("");
    const isControlled = valueProp !== undefined;
    const value = isControlled ? (valueProp ?? "") : internalValue;
    const [isFocused, setIsFocused] = React.useState(false);

    const inputRef = React.useRef<TextInput>(null);

    // Expose the hidden TextInput via the forwarded ref so callers can .focus().
    React.useImperativeHandle(ref, () => inputRef.current!);

    const handleChange = (text: string) => {
      // Restrict to digits only; honour maxLength.
      const filtered = text.replace(/\D/g, "").slice(0, maxLength);
      if (!isControlled) setInternalValue(filtered);
      onChange?.(filtered);
    };

    const focusInput = React.useCallback(() => {
      inputRef.current?.focus();
    }, []);

    // Build per-slot data for children.
    const slots: OTPSlot[] = Array.from({ length: maxLength }, (_, i) => ({
      char:         value[i] ?? "",
      isActive:     isFocused && i === Math.min(value.length, maxLength - 1),
      hasFakeCaret: isFocused && i === value.length && i < maxLength,
    }));

    return (
      <OTPInputContext.Provider value={{ slots, focusInput }}>
        <View
          className={cn(
            "flex-row items-center gap-2",
            disabled && "opacity-50",
            containerClassName,
          )}
        >
          {/* Hidden TextInput captures all keystrokes. */}
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={handleChange}
            maxLength={maxLength}
            keyboardType="number-pad"
            editable={!disabled}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            caretHidden
            // Positioned off-screen so it is invisible but still captures input.
            style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
            {...props}
          />
          {children}
        </View>
      </OTPInputContext.Provider>
    );
  },
);
InputOTP.displayName = "InputOTP";

// ─── InputOTPGroup ────────────────────────────────────────────────────────────

const InputOTPGroup = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("flex-row items-center", className)}
      {...props}
    />
  ),
);
InputOTPGroup.displayName = "InputOTPGroup";

// ─── InputOTPSlot ─────────────────────────────────────────────────────────────

export interface InputOTPSlotProps extends Omit<PressableProps, "ref"> {
  index: number;
  className?: string;
}

const InputOTPSlot = React.forwardRef<View, InputOTPSlotProps>(
  ({ index, className, ...props }, ref) => {
    const ctx = React.useContext(OTPInputContext);
    const slot = ctx.slots[index] ?? { char: "", hasFakeCaret: false, isActive: false };
    const { char, hasFakeCaret, isActive } = slot;

    // Blinking caret animation.
    const caretOpacity = React.useRef(new Animated.Value(1)).current;
    React.useEffect(() => {
      if (!hasFakeCaret) {
        caretOpacity.setValue(1);
        return;
      }
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(caretOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(caretOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      );
      anim.start();
      return () => anim.stop();
    }, [hasFakeCaret, caretOpacity]);

    return (
      <Pressable
        ref={ref}
        onPress={() => ctx.focusInput()}
        className={cn(
          "relative h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-sm",
          // Web uses CSS :first-child/:last-child — replicated by index.
          index === 0 && "rounded-l-md border-l",
          isActive && "z-10 ring-1 ring-ring",
          className,
        )}
        {...props}
      >
        {char ? (
          <Animated.Text className="text-sm text-foreground">{char}</Animated.Text>
        ) : null}
        {hasFakeCaret && (
          <View className="absolute inset-0 items-center justify-center">
            <Animated.View
              className="h-4 w-px bg-foreground"
              style={{ opacity: caretOpacity }}
            />
          </View>
        )}
      </Pressable>
    );
  },
);
InputOTPSlot.displayName = "InputOTPSlot";

// ─── InputOTPSeparator ────────────────────────────────────────────────────────

const InputOTPSeparator = React.forwardRef<View, ViewProps>(
  ({ ...props }, ref) => (
    <View ref={ref} accessibilityRole="none" {...props}>
      {/* Mirrors the web Minus icon with a simple horizontal bar. */}
      <View className="h-px w-4 bg-muted-foreground" />
    </View>
  ),
);
InputOTPSeparator.displayName = "InputOTPSeparator";

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator };
