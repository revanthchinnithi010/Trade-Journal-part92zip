/**
 * field.tsx — React Native port
 *
 * Web source used HTML semantic elements (fieldset, legend, div, p, ul, li)
 * with complex CSS pseudo-selectors and @container queries.
 *
 * Web → RN replacements:
 *   "use client" directive    → removed (no Next.js in RN)
 *   fieldset → View
 *   legend   → Text
 *   div      → View
 *   p        → Text
 *   ul       → View
 *   li       → View + Text
 *   span     → Text
 *   has-[>[data-slot=...]]:* → removed (no CSS selectors)
 *   @container / @md         → removed (no container queries)
 *   group-data-[disabled]:*  → conditional className via disabled prop
 *   nth-last-2 / last:*      → removed
 *   leading-snug / text-balance → kept (NativeWind supports these)
 *   Label    → imported from RN label.tsx (Text-based)
 *   Separator → imported from RN separator.tsx
 *
 * Preserved API (all exports, all props):
 *   FieldSet         — View (was fieldset)
 *   FieldLegend      — Text (was legend), variant: "legend" | "label"
 *   FieldGroup       — View with flex-col layout
 *   Field            — View with orientation variant
 *   FieldContent     — View (inner content column)
 *   FieldLabel       — Label (Text-based)
 *   FieldTitle       — Text (bold title for a field)
 *   FieldDescription — Text (muted helper text)
 *   FieldSeparator   — View with Separator line + optional text
 *   FieldError       — View with alert role; renders error messages
 *     errors         — Array<{ message?: string } | undefined>
 *     children       — overrides errors rendering
 */

import { useMemo } from "react";
import { Text, View, type TextProps, type ViewProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// ─── FieldSet ─────────────────────────────────────────────────────────────────

function FieldSet({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex flex-col gap-6", className)}
      {...props}
    />
  );
}

// ─── FieldLegend ─────────────────────────────────────────────────────────────

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: TextProps & { variant?: "legend" | "label" }) {
  return (
    <Text
      className={cn(
        "mb-3 font-medium",
        variant === "legend" ? "text-base" : "text-sm",
        className,
      )}
      {...props}
    />
  );
}

// ─── FieldGroup ───────────────────────────────────────────────────────────────

function FieldGroup({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex w-full flex-col gap-7", className)}
      {...props}
    />
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────

const fieldVariants = cva(
  "flex w-full gap-3",
  {
    variants: {
      orientation: {
        vertical:   "flex-col",
        horizontal: "flex-row items-center",
        // "responsive" collapses to vertical in RN (no container queries).
        responsive:  "flex-col",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  },
);

function Field({
  className,
  orientation = "vertical",
  ...props
}: ViewProps & VariantProps<typeof fieldVariants>) {
  return (
    <View
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

// ─── FieldContent ─────────────────────────────────────────────────────────────

function FieldContent({ className, ...props }: ViewProps) {
  return (
    <View
      className={cn("flex flex-1 flex-col gap-1.5", className)}
      {...props}
    />
  );
}

// ─── FieldLabel ───────────────────────────────────────────────────────────────

function FieldLabel({
  className,
  ...props
}: TextProps) {
  return (
    <Label
      className={cn("flex w-auto gap-2 leading-snug", className)}
      {...props}
    />
  );
}

// ─── FieldTitle ───────────────────────────────────────────────────────────────

function FieldTitle({ className, ...props }: TextProps) {
  return (
    <Text
      className={cn(
        "flex items-center gap-2 text-sm font-medium leading-snug",
        className,
      )}
      {...props}
    />
  );
}

// ─── FieldDescription ────────────────────────────────────────────────────────

function FieldDescription({ className, ...props }: TextProps) {
  return (
    <Text
      className={cn("text-muted-foreground text-sm font-normal leading-normal", className)}
      {...props}
    />
  );
}

// ─── FieldSeparator ───────────────────────────────────────────────────────────

function FieldSeparator({
  children,
  className,
  ...props
}: ViewProps & { children?: React.ReactNode }) {
  return (
    <View
      className={cn("relative items-center justify-center h-5", className)}
      {...props}
    >
      <Separator className="absolute w-full" />
      {children != null && (
        <View className="bg-background px-2 z-10">
          <Text className="text-muted-foreground text-sm">{children}</Text>
        </View>
      )}
    </View>
  );
}

// ─── FieldError ───────────────────────────────────────────────────────────────

function FieldError({
  className,
  children,
  errors,
  ...props
}: ViewProps & {
  errors?: Array<{ message?: string } | undefined>;
  children?: React.ReactNode;
}) {
  const content = useMemo(() => {
    if (children) {
      return children;
    }

    if (!errors || errors.length === 0) {
      return null;
    }

    if (errors.length === 1 && errors[0]?.message) {
      return (
        <Text className="text-destructive text-sm font-normal">
          {errors[0].message}
        </Text>
      );
    }

    return (
      <View className="ml-4 gap-1">
        {errors.map(
          (error, index) =>
            error?.message ? (
              <Text key={index} className="text-destructive text-sm font-normal">
                {"• " + error.message}
              </Text>
            ) : null,
        )}
      </View>
    );
  }, [children, errors]);

  if (!content) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      className={cn("gap-1", className)}
      {...props}
    >
      {content}
    </View>
  );
}

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
};
