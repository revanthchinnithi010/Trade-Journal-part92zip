/**
 * app/index.tsx — Root entry point.
 *
 * Phase 8.5: Native app is now the default launch experience.
 * Navigates immediately to the native Tabs layout (app/(tabs)/index.tsx).
 *
 * WHY useEffect + router.replace instead of <Redirect>:
 *   Expo Router's <Redirect> internally calls useFocusEffect WITHOUT useCallback.
 *   useFocusEffect puts `effect` in its own useEffect dependency array, so every
 *   render creates a new arrow function → the internal useEffect re-runs → on
 *   native the screen is still isFocused() during the slide-out transition →
 *   router.replace fires again → navigation state update → re-render → repeat →
 *   "Maximum update depth exceeded" after ~25 cycles.
 *
 *   A plain useEffect with [] runs exactly once (on mount) regardless of how many
 *   times this component re-renders while the navigation is in flight.
 *
 * The previous WebView implementation has been preserved at app/webview.tsx
 * and is reachable via router.push("/webview") when intentionally referenced.
 */

import { router } from "expo-router";
import React, { useEffect } from "react";

export default function Index() {
  useEffect(() => {
    router.replace("/(tabs)");
  }, []); // empty deps — runs once on mount, never again

  return null;
}
