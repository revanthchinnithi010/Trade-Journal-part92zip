import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";

SplashScreen.preventAutoHideAsync();

// Maximum time (ms) we'll wait for fonts before rendering anyway.
// Prevents the app from hanging forever on the splash screen when font
// loading stalls (asset registry miss, network hiccup, pnpm symlink lag).
const FONT_TIMEOUT_MS = 4_000;

// ─────────────────────────────────────────────────────────────────────────────
// Navigation root
// ─────────────────────────────────────────────────────────────────────────────

function RootLayoutNav() {
  return (
    <>
      {/*
        StatusBar is a portal — it controls system UI, not layout.
        style="auto" defers to the active theme (light text on dark, dark on light).
      */}
      <StatusBar style="auto" />

      <Stack screenOptions={{ headerShown: false, animation: "none" }}>
        <Stack.Screen name="index" />
        {/* +not-found must be declared so Expo Router can match unknown routes. */}
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root layout
//
// Provider order (outer → inner):
//   SafeAreaProvider   — insets must be available everywhere
//     ThemeProvider    — theme must be available to ErrorBoundary fallback UI
//       ErrorBoundary  — catches errors thrown by everything below
//         GestureHandlerRootView
//           RootLayoutNav
// ─────────────────────────────────────────────────────────────────────────────

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // renderReady flips to true when fonts are done (loaded or failed) OR when
  // the timeout fires — whichever comes first.  This guarantees the app is
  // never permanently stuck on the splash screen.
  const [renderReady, setRenderReady] = useState(false);

  // Primary path: fonts resolved normally.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
      setRenderReady(true);
    }
  }, [fontsLoaded, fontError]);

  // Fallback path: hide splash and render regardless after FONT_TIMEOUT_MS.
  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
      setRenderReady(true);
    }, FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  if (!renderReady) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <RootLayoutNav />
          </GestureHandlerRootView>
        </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
