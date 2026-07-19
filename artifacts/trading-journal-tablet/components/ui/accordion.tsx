/**
 * accordion.tsx — React Native port
 *
 * Web source: @radix-ui/react-accordion
 *
 * Web → RN replacements:
 *   AccordionPrimitive.Root      → React context wrapping Collapsible instances
 *   AccordionPrimitive.Item      → AccordionItemContext (tracks own value)
 *   AccordionPrimitive.Header    → View (no landmark <header> in RN)
 *   AccordionPrimitive.Trigger   → CollapsibleTrigger + chevron indicator
 *   AccordionPrimitive.Content   → CollapsibleContent (Reanimated height)
 *   ChevronDown (lucide)         → Animated.Text "▾" rotated via Reanimated
 *   data-[state=open]>svg        → Reanimated rotate transform on chevron
 *   hover:underline              → removed (no hover in touch UI)
 *
 * Preserved API:
 *   Accordion          — root (type: "single" | "multiple", value, defaultValue, onValueChange,
 *                         collapsible prop for single-mode collapse-to-empty)
 *   AccordionItem      — item wrapper (value, disabled)
 *   AccordionTrigger   — header button with animated chevron
 *   AccordionContent   — animated height body
 *
 * Built on top of:
 *   Collapsible, CollapsibleTrigger, CollapsibleContent (this file imports them)
 */

import * as React from "react";
import {
  Pressable,
  Text,
  View,
  type PressableProps,
  type ViewProps,
  type TextProps,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ─── Accordion Root Context ───────────────────────────────────────────────────

type AccordionType = "single" | "multiple";

interface AccordionContextValue {
  type: AccordionType;
  openItems: string[];
  toggleItem: (value: string) => void;
  collapsible: boolean;
}

const AccordionContext = React.createContext<AccordionContextValue>({
  type: "single",
  openItems: [],
  toggleItem: () => {},
  collapsible: false,
});

// ─── Accordion Item Context ───────────────────────────────────────────────────

interface AccordionItemContextValue {
  value: string;
  isOpen: boolean;
  disabled: boolean;
}

const AccordionItemContext = React.createContext<AccordionItemContextValue>({
  value: "",
  isOpen: false,
  disabled: false,
});

// ─── Accordion (Root) ─────────────────────────────────────────────────────────

export type AccordionSingleProps = {
  type: "single";
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  collapsible?: boolean;
};

export type AccordionMultipleProps = {
  type: "multiple";
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  collapsible?: boolean; // API compat — always collapsible in multiple mode
};

export type AccordionProps = (AccordionSingleProps | AccordionMultipleProps) & ViewProps;

const Accordion = React.forwardRef<View, AccordionProps>(
  (props, ref) => {
    const {
      type,
      collapsible = false,
      className,
      children,
      ...rest
    } = props;

    // Single mode
    const singleProps = props as AccordionSingleProps & ViewProps;
    const multipleProps = props as AccordionMultipleProps & ViewProps;

    const isControlled =
      type === "single"
        ? singleProps.value !== undefined
        : multipleProps.value !== undefined;

    const [internalItems, setInternalItems] = React.useState<string[]>(() => {
      if (type === "single") {
        return singleProps.defaultValue ? [singleProps.defaultValue] : [];
      }
      return (multipleProps.defaultValue as string[]) ?? [];
    });

    const openItems: string[] = isControlled
      ? type === "single"
        ? singleProps.value
          ? [singleProps.value]
          : []
        : (multipleProps.value as string[]) ?? []
      : internalItems;

    const toggleItem = React.useCallback(
      (value: string) => {
        let next: string[];
        if (type === "multiple") {
          if (openItems.includes(value)) {
            next = openItems.filter((v) => v !== value);
          } else {
            next = [...openItems, value];
          }
          if (!isControlled) setInternalItems(next);
          multipleProps.onValueChange?.(next);
        } else {
          // single
          const isOpen = openItems.includes(value);
          if (isOpen && collapsible) {
            next = [];
          } else if (isOpen) {
            next = openItems; // stay open
          } else {
            next = [value];
          }
          if (!isControlled) setInternalItems(next);
          singleProps.onValueChange?.(next[0] ?? "");
        }
      },
      [type, openItems, collapsible, isControlled, singleProps, multipleProps],
    );

    return (
      <AccordionContext.Provider value={{ type, openItems, toggleItem, collapsible }}>
        <View
          ref={ref}
          className={cn("", className)}
          {...(rest as ViewProps)}
        >
          {children}
        </View>
      </AccordionContext.Provider>
    );
  },
);
Accordion.displayName = "Accordion";

// ─── AccordionItem ────────────────────────────────────────────────────────────

export interface AccordionItemProps extends ViewProps {
  value: string;
  disabled?: boolean;
}

const AccordionItem = React.forwardRef<View, AccordionItemProps>(
  ({ className, value, disabled = false, children, ...props }, ref) => {
    const { openItems, toggleItem } = React.useContext(AccordionContext);
    const isOpen = openItems.includes(value);

    return (
      <AccordionItemContext.Provider value={{ value, isOpen, disabled }}>
        <Collapsible
          ref={ref}
          open={isOpen}
          onOpenChange={() => !disabled && toggleItem(value)}
          disabled={disabled}
          className={cn("border-b border-border", className)}
          {...props}
        >
          {children}
        </Collapsible>
      </AccordionItemContext.Provider>
    );
  },
);
AccordionItem.displayName = "AccordionItem";

// ─── AccordionTrigger ─────────────────────────────────────────────────────────

export interface AccordionTriggerProps extends Omit<PressableProps, "children"> {
  className?: string;
  children?: React.ReactNode;
}

const AccordionTrigger = React.forwardRef<View, AccordionTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const { isOpen, disabled } = React.useContext(AccordionItemContext);

    const rotation = useSharedValue(isOpen ? 180 : 0);

    React.useEffect(() => {
      rotation.value = withTiming(isOpen ? 180 : 0, { duration: 200 });
    }, [isOpen, rotation]);

    const chevronStyle = useAnimatedStyle(() => ({
      transform: [{ rotate: `${rotation.value}deg` }],
    }));

    return (
      <View className="flex-row">
        <CollapsibleTrigger
          ref={ref}
          disabled={disabled}
          className={cn(
            "flex-1 flex-row items-center justify-between py-4 text-left",
            disabled && "opacity-50",
            className as string,
          )}
          {...props}
        >
          <View className="flex-1 flex-row items-center justify-between">
            {typeof children === "string" ? (
              <Text className="text-sm font-medium text-foreground flex-1">
                {children}
              </Text>
            ) : (
              <View className="flex-1">{children}</View>
            )}
            <Animated.View style={chevronStyle} className="ml-2 shrink-0">
              <Text className="text-sm text-muted-foreground">{"▾"}</Text>
            </Animated.View>
          </View>
        </CollapsibleTrigger>
      </View>
    );
  },
);
AccordionTrigger.displayName = "AccordionTrigger";

// ─── AccordionContent ─────────────────────────────────────────────────────────

const AccordionContent = React.forwardRef<View, ViewProps>(
  ({ className, children, ...props }, ref) => (
    <CollapsibleContent ref={ref} {...props}>
      <View className={cn("pb-4 pt-0", className)}>
        {typeof children === "string" ? (
          <Text className="text-sm text-foreground">{children}</Text>
        ) : (
          children
        )}
      </View>
    </CollapsibleContent>
  ),
);
AccordionContent.displayName = "AccordionContent";

// ─── Exports ──────────────────────────────────────────────────────────────────

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
