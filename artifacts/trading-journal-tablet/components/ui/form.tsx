/**
 * form.tsx — React Native port
 *
 * Web source used @radix-ui/react-label and @radix-ui/react-slot alongside
 * react-hook-form helpers.
 *
 * react-hook-form (FormProvider, Controller, useFormContext, etc.) is
 * framework-agnostic and works identically in React Native — no changes needed
 * for those imports.
 *
 * Web → RN replacements:
 *   @radix-ui/react-label   → removed; Label from RN label.tsx used directly
 *   @radix-ui/react-slot (Slot / asChild) → View wrapper (no DOM merging needed)
 *   HTMLDivElement ref      → View ref
 *   HTMLParagraphElement ref → Text ref
 *   React.HTMLAttributes<HTMLDivElement>      → ViewProps
 *   React.HTMLAttributes<HTMLParagraphElement> → TextProps
 *   id / aria-describedby / aria-invalid (DOM attrs) → accessibilityLabel /
 *     accessibilityHint / accessibilityState (RN equivalents)
 *   htmlFor (Label)         → removed (no DOM inputs)
 *   space-y-2               → gap-2 (NativeWind flex column gap)
 *   text-[0.8rem]           → text-xs (closest NativeWind token)
 *   <p>                     → <Text>
 *   <div>                   → <View>
 *
 * Preserved API:
 *   Form              — re-export of FormProvider (unchanged)
 *   FormField         — Controller wrapper (unchanged)
 *   useFormField      — hook returning id, name, fieldState (unchanged)
 *   FormItem          — View with FormItemContext (id via useId)
 *   FormLabel         — Label (Text) that turns destructive on error
 *   FormControl       — View wrapper that passes accessibility state to children
 *   FormDescription   — Text with muted style
 *   FormMessage       — Text that shows error.message or children
 */

import * as React from "react";
import { Text, View, type TextProps, type ViewProps } from "react-native";
import {
  Controller,
  FormProvider,
  useFormContext,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

// ─── Form (FormProvider passthrough) ─────────────────────────────────────────

const Form = FormProvider;

// ─── FormField ────────────────────────────────────────────────────────────────

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

// ─── useFormField ─────────────────────────────────────────────────────────────

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext  = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  if (!itemContext) {
    throw new Error("useFormField should be used within <FormItem>");
  }

  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;

  return {
    id,
    name:              fieldContext.name,
    formItemId:        `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId:     `${id}-form-item-message`,
    ...fieldState,
  };
};

// ─── FormItem ─────────────────────────────────────────────────────────────────

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue | null>(null);

const FormItem = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => {
    const id = React.useId();

    return (
      <FormItemContext.Provider value={{ id }}>
        <View ref={ref} className={cn("gap-2", className)} {...props} />
      </FormItemContext.Provider>
    );
  },
);
FormItem.displayName = "FormItem";

// ─── FormLabel ────────────────────────────────────────────────────────────────

const FormLabel = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => {
    const { error } = useFormField();

    return (
      <Label
        ref={ref}
        className={cn(error && "text-destructive", className)}
        {...props}
      />
    );
  },
);
FormLabel.displayName = "FormLabel";

// ─── FormControl ──────────────────────────────────────────────────────────────
// Replaces web's Slot (asChild prop merger). In RN we use a View wrapper and
// relay accessibility state so screen readers understand the field's validity.

const FormControl = React.forwardRef<View, ViewProps>(
  ({ children, ...props }, ref) => {
    const { error, formDescriptionId, formMessageId } = useFormField();

    return (
      <View
        ref={ref}
        accessibilityHint={
          !error
            ? formDescriptionId
            : `${formDescriptionId} ${formMessageId}`
        }
        accessibilityState={{ disabled: false, selected: !!error }}
        {...props}
      >
        {children}
      </View>
    );
  },
);
FormControl.displayName = "FormControl";

// ─── FormDescription ─────────────────────────────────────────────────────────

const FormDescription = React.forwardRef<Text, TextProps>(
  ({ className, ...props }, ref) => {
    return (
      <Text
        ref={ref}
        className={cn("text-xs text-muted-foreground", className)}
        {...props}
      />
    );
  },
);
FormDescription.displayName = "FormDescription";

// ─── FormMessage ─────────────────────────────────────────────────────────────

const FormMessage = React.forwardRef<Text, TextProps>(
  ({ className, children, ...props }, ref) => {
    const { error } = useFormField();
    const body = error ? String(error?.message ?? "") : children;

    if (!body) {
      return null;
    }

    return (
      <Text
        ref={ref}
        className={cn("text-xs font-medium text-destructive", className)}
        {...props}
      >
        {body}
      </Text>
    );
  },
);
FormMessage.displayName = "FormMessage";

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
