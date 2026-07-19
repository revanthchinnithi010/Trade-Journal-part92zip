/**
 * KeyboardAwareScrollViewCompat
 *
 * Cross-platform scroll view that handles keyboard avoidance correctly on
 * both Android and iOS without layout jumping.
 *
 * ── Platform behaviour ────────────────────────────────────────────────────
 * iOS / Android  → KeyboardAwareScrollView from react-native-keyboard-controller.
 *                  Automatically adjusts scroll position when the software
 *                  keyboard appears, keeping the focused input visible.
 * Web            → Plain ScrollView (react-native-keyboard-controller does
 *                  not target web; the browser handles keyboard natively).
 *
 * ── Why not KeyboardAvoidingView? ────────────────────────────────────────
 * KeyboardAvoidingView is notoriously inconsistent across Android OEM
 * keyboards and doesn't scroll to the focused field — it just shifts the
 * entire layout.  react-native-keyboard-controller computes exact keyboard
 * height via WorkLets and animates the scroll position directly, which
 * produces zero layout jump on both platforms.
 *
 * ── Ref forwarding ───────────────────────────────────────────────────────
 * The component forwards its ref to the underlying scroll view so callers
 * can call .scrollTo(), .scrollToEnd(), etc.
 */

import React from "react";
import { Platform, ScrollView } from "react-native";
import type { ScrollViewProps } from "react-native";
import {
  KeyboardAwareScrollView,
} from "react-native-keyboard-controller";
import type { KeyboardAwareScrollViewProps } from "react-native-keyboard-controller";

// KeyboardAwareScrollViewProps already extends ScrollViewProps, so the union
// type is equivalent to KeyboardAwareScrollViewProps alone.  We alias it for
// clarity so consuming code can import Props from this file if needed.
export type KeyboardAwareScrollViewCompatProps = KeyboardAwareScrollViewProps;

export const KeyboardAwareScrollViewCompat = React.forwardRef<
  ScrollView,
  KeyboardAwareScrollViewCompatProps
>(function KeyboardAwareScrollViewCompat(
  {
    children,
    keyboardShouldPersistTaps = "handled",
    keyboardDismissMode = "interactive",
    showsVerticalScrollIndicator = false,
    ...rest
  },
  ref,
) {
  if (Platform.OS === "web") {
    // react-native-keyboard-controller does not support web — fall back to the
    // standard ScrollView.  Cast to ScrollViewProps to drop any native-only
    // props that ScrollView does not accept.
    const scrollViewProps = rest as ScrollViewProps;
    return (
      <ScrollView
        ref={ref}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <KeyboardAwareScrollView
      ref={ref}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
});
