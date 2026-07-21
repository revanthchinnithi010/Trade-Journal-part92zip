/**
 * app/index.tsx — Root entry point.
 *
 * Phase 8.5: Native app is now the default launch experience.
 * Redirects immediately to the native Tabs layout (app/(tabs)/index.tsx).
 *
 * The previous WebView implementation has been preserved at app/webview.tsx
 * and is reachable via router.push("/webview") when intentionally referenced.
 *
 * Deep linking, navigation, auth flow, and modal routes are all preserved —
 * Expo Router handles the redirect transparently before any screen renders.
 */

import { Redirect } from "expo-router";
import React from "react";

export default function Index() {
  return <Redirect href="/(tabs)" />;
}
