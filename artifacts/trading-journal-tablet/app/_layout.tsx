// NativeWind v4 — must be the first import in the root layout so the
// CSS→JS transform is registered before any component tree is evaluated.
import "../global.css";

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Toaster } from "@/components/ui/toaster";
import { WatchlistProvider } from "@/contexts/WatchlistContext";

// ─────────────────────────────────────────────────────────────────────────────
// API base URL
//
// EXPO_PUBLIC_API_BASE_URL takes precedence (production-friendly override).
// Falls back to EXPO_PUBLIC_DOMAIN which is set to $REPLIT_DEV_DOMAIN in the
// dev script — giving us the correct Replit proxy URL automatically.
//
// To swap for production: set EXPO_PUBLIC_API_BASE_URL in your release build.
// ─────────────────────────────────────────────────────────────────────────────

const _apiBaseUrl: string | null =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : null);

setBaseUrl(_apiBaseUrl);

// ─────────────────────────────────────────────────────────────────────────────
// React Query client
//
// Created once at module level — never inside a component — to prevent
// duplicate instances across hot reloads or re-renders.
// ─────────────────────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1_000,   // 5 min — fresh enough for trading data
      gcTime: 10 * 60 * 1_000,     // 10 min — keep inactive queries in cache
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,                  // mutations are not idempotent; never auto-retry
    },
  },
});

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
        {/* Current WebView wrapper — the entry point for the web-bridge phase */}
        <Stack.Screen name="index" />
        {/*
          (tabs) route group — the native navigation shell.
          Route groups are transparent in URLs; (tabs)/index resolves to /tabs/index
          while app/index.tsx retains ownership of /.
          This screen is additive — it does not replace the WebView root.
        */}
        <Stack.Screen name="(tabs)" />
        {/*
          Stack screens for detail pages pushed on top of the tab bar.
          trade/[id]    — Trade detail (currently a "coming soon" stub,
                          matching web src/pages/trade.tsx)
          position/[id] — Full position detail screen with live PnL, bracket
                          orders, close/update actions.
        */}
        <Stack.Screen name="trade/[id]" />
        <Stack.Screen name="position/[id]" />
        {/*
          webview — preserved WebView bridge, accessible via router.push("/webview").
          Not in the tab bar; not the default launch screen.  Available for
          intentional use (e.g. opening the full web app from a settings screen).
        */}
        <Stack.Screen name="webview" />
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
//           QueryClientProvider
//             RootLayoutNav
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
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <BottomSheetModalProvider>
                <WatchlistProvider>
                  <RootLayoutNav />
                </WatchlistProvider>
              </BottomSheetModalProvider>
            </GestureHandlerRootView>
          </ErrorBoundary>
        </QueryClientProvider>
      </ThemeProvider>
      {/* Global toast overlay — must be last so it renders above all screens */}
      <Toaster topOffset={56} bottomOffset={80} />
    </SafeAreaProvider>
  );
}
