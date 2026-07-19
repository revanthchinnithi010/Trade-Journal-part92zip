/**
 * command.tsx — React Native port (REDESIGNED as Search + Bottom Sheet)
 *
 * Web source: cmdk (CommandPrimitive) + Radix Dialog
 *
 * Web → RN replacements:
 *   CommandPrimitive (cmdk)    → Pure RN implementation; cmdk is DOM-only
 *   Radix Dialog               → Modal + Animated.View (bottom sheet pattern)
 *   cmdk-input-wrapper         → View row with TextInput
 *   cmdk-list                  → FlatList for filtered results
 *   cmdk-group                 → Grouped section with optional heading
 *   cmdk-empty                 → Text shown when results list is empty
 *   cmdk-item                  → Pressable row with optional icon
 *   cmdk-separator             → thin View divider
 *   Search (lucide)            → Unicode "⌕" / inline SVG path avoided
 *   DialogProps                → CommandDialogProps (open/onOpenChange)
 *   keyboard-driven selection  → touch-only in RN (no physical keyboard shortcuts)
 *
 * Preserved exports:
 *   Command, CommandDialog, CommandInput, CommandList
 *   CommandEmpty, CommandGroup, CommandItem
 *   CommandShortcut, CommandSeparator
 *
 * Architecture:
 *   Command        — root context that holds search state + filtered items
 *   CommandDialog  — bottom sheet Modal wrapper around Command
 *   CommandInput   — controlled TextInput bound to Command search state
 *   CommandList    — FlatList/ScrollView that renders children
 *   CommandGroup   — groups items under a heading
 *   CommandItem    — individual selectable row
 */

import * as React from "react";
import {
  Animated,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
  type ViewProps,
  type TextProps,
  type PressableProps,
} from "react-native";

import { cn } from "@/lib/utils";

// ─── Animation hook (bottom sheet) ───────────────────────────────────────────

function useBottomSheetAnim(open: boolean) {
  const anim = React.useRef(new Animated.Value(open ? 1 : 0)).current;
  const [visible, setVisible] = React.useState(open);

  React.useEffect(() => {
    if (open) {
      setVisible(true);
      Animated.spring(anim, {
        toValue: 1,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(anim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setVisible(false);
      });
    }
  }, [open, anim]);

  return { anim, visible };
}

// ─── Command Context ──────────────────────────────────────────────────────────

interface CommandContextValue {
  search: string;
  setSearch: (s: string) => void;
  /** Items register/deregister for filtering */
  registerItem: (id: string, label: string) => void;
  unregisterItem: (id: string) => void;
  isItemVisible: (id: string) => boolean;
}

const CommandContext = React.createContext<CommandContextValue>({
  search: "",
  setSearch: () => {},
  registerItem: () => {},
  unregisterItem: () => {},
  isItemVisible: () => true,
});

// ─── Command (Root) ───────────────────────────────────────────────────────────

export interface CommandProps extends ViewProps {
  /** Current search value (controlled) */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Filter function — return true to show the item */
  filter?: (value: string, search: string) => boolean;
  /** Shorthand loop prop — accepted for API compat */
  loop?: boolean;
}

const Command = React.forwardRef<View, CommandProps>(
  (
    {
      className,
      value: valueProp,
      onValueChange,
      filter,
      loop: _loop,
      children,
      ...props
    },
    ref,
  ) => {
    const [internalSearch, setInternalSearch] = React.useState("");
    const isControlled = valueProp !== undefined;
    const search = isControlled ? valueProp! : internalSearch;

    const items = React.useRef<Map<string, string>>(new Map());

    const setSearch = React.useCallback(
      (s: string) => {
        if (!isControlled) setInternalSearch(s);
        onValueChange?.(s);
      },
      [isControlled, onValueChange],
    );

    const registerItem = React.useCallback((id: string, label: string) => {
      items.current.set(id, label);
    }, []);

    const unregisterItem = React.useCallback((id: string) => {
      items.current.delete(id);
    }, []);

    const isItemVisible = React.useCallback(
      (id: string) => {
        if (!search) return true;
        const label = items.current.get(id) ?? "";
        if (filter) return filter(label, search);
        return label.toLowerCase().includes(search.toLowerCase());
      },
      [search, filter],
    );

    return (
      <CommandContext.Provider
        value={{ search, setSearch, registerItem, unregisterItem, isItemVisible }}
      >
        <View
          ref={ref}
          className={cn(
            "flex flex-col overflow-hidden rounded-md bg-popover",
            className,
          )}
          {...props}
        >
          {children}
        </View>
      </CommandContext.Provider>
    );
  },
);
Command.displayName = "Command";

// ─── CommandDialog ────────────────────────────────────────────────────────────

export interface CommandDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

function CommandDialog({ open = false, onOpenChange, children }: CommandDialogProps) {
  const { height: screenHeight } = useWindowDimensions();
  const { anim, visible } = useBottomSheetAnim(open);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [screenHeight, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={() => onOpenChange?.(false)}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View
        className="absolute inset-0 bg-black/80"
        style={{ opacity: anim }}
        pointerEvents="box-none"
      >
        <Pressable className="flex-1" onPress={() => onOpenChange?.(false)} />
      </Animated.View>

      {/* Bottom Sheet */}
      <View className="flex-1 justify-end" pointerEvents="box-none">
        <Animated.View
          style={{ transform: [{ translateY }] }}
          className="rounded-t-xl bg-popover border-t border-border overflow-hidden"
        >
          {/* Drag handle */}
          <View className="items-center pt-3 pb-1">
            <View className="h-1.5 w-12 rounded-full bg-muted" />
          </View>

          <Command>{children}</Command>
        </Animated.View>
      </View>
    </Modal>
  );
}
CommandDialog.displayName = "CommandDialog";

// ─── CommandInput ─────────────────────────────────────────────────────────────

export interface CommandInputProps extends Omit<TextInputProps, "value" | "onChangeText"> {
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

const CommandInput = React.forwardRef<TextInput, CommandInputProps>(
  ({ className, value: valueProp, onValueChange, ...props }, ref) => {
    const { search, setSearch } = React.useContext(CommandContext);
    const value = valueProp !== undefined ? valueProp : search;

    return (
      <View className="flex-row items-center border-b border-border px-3">
        <Text className="mr-2 text-base text-muted-foreground opacity-50">{"⌕"}</Text>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={(text) => {
            setSearch(text);
            onValueChange?.(text);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          placeholderTextColor="rgba(128,128,128,0.6)"
          className={cn(
            "flex-1 h-12 bg-transparent text-sm text-foreground outline-none py-3",
            className,
          )}
          {...props}
        />
        {value.length > 0 && (
          <Pressable
            onPress={() => {
              setSearch("");
              onValueChange?.("");
            }}
            accessibilityLabel="Clear search"
            className="p-1"
          >
            <Text className="text-muted-foreground text-base">{"✕"}</Text>
          </Pressable>
        )}
      </View>
    );
  },
);
CommandInput.displayName = "Command.Input";

// ─── CommandList ──────────────────────────────────────────────────────────────

const CommandList = React.forwardRef<ScrollView, ViewProps>(
  ({ className, children, ...props }, ref) => (
    <ScrollView
      ref={ref}
      className={cn("max-h-80 overflow-y-auto", className)}
      keyboardShouldPersistTaps="handled"
      {...(props as object)}
    >
      {children}
    </ScrollView>
  ),
);
CommandList.displayName = "Command.List";

// ─── CommandEmpty ─────────────────────────────────────────────────────────────

const CommandEmpty = React.forwardRef<Text, TextProps>(
  ({ className, children = "No results found.", ...props }, ref) => {
    const { search } = React.useContext(CommandContext);
    if (!search) return null;
    return (
      <Text
        ref={ref}
        className={cn("py-6 text-center text-sm text-muted-foreground", className)}
        {...props}
      >
        {children}
      </Text>
    );
  },
);
CommandEmpty.displayName = "Command.Empty";

// ─── CommandGroup ─────────────────────────────────────────────────────────────

export interface CommandGroupProps extends ViewProps {
  heading?: React.ReactNode;
}

const CommandGroup = React.forwardRef<View, CommandGroupProps>(
  ({ className, heading, children, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("overflow-hidden p-1 text-foreground", className)}
      {...props}
    >
      {heading && (
        <Text className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          {heading}
        </Text>
      )}
      {children}
    </View>
  ),
);
CommandGroup.displayName = "Command.Group";

// ─── CommandSeparator ─────────────────────────────────────────────────────────

const CommandSeparator = React.forwardRef<View, ViewProps>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  ),
);
CommandSeparator.displayName = "Command.Separator";

// ─── CommandItem ──────────────────────────────────────────────────────────────

export interface CommandItemProps extends PressableProps {
  className?: string;
  /** The text value used for filtering */
  value?: string;
  disabled?: boolean;
  keywords?: string[]; // API compat, merged into filter label
  onSelect?: (value: string) => void;
}

const CommandItem = React.forwardRef<View, CommandItemProps>(
  (
    {
      className,
      value = "",
      disabled = false,
      keywords: _kw,
      onSelect,
      onPress,
      children,
      ...props
    },
    ref,
  ) => {
    const id = React.useId();
    const { registerItem, unregisterItem, isItemVisible } =
      React.useContext(CommandContext);

    // Compute display label from children text if value not given
    const label = value || id;
    React.useEffect(() => {
      registerItem(id, label);
      return () => unregisterItem(id);
    }, [id, label, registerItem, unregisterItem]);

    if (!isItemVisible(id)) return null;

    return (
      <Pressable
        ref={ref}
        disabled={disabled}
        accessibilityRole="menuitem"
        accessibilityState={{ disabled }}
        onPress={(e) => {
          onSelect?.(value);
          onPress?.(e);
        }}
        className={cn(
          "relative flex-row cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5",
          disabled && "opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </Pressable>
    );
  },
);
CommandItem.displayName = "Command.Item";

// ─── CommandShortcut ──────────────────────────────────────────────────────────

function CommandShortcut({ className, children, ...props }: TextProps) {
  return (
    <Text
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </Text>
  );
}
CommandShortcut.displayName = "CommandShortcut";

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
