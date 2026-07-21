/**
 * app/webview.tsx — Preserved WebView bridge screen.
 *
 * Originally app/index.tsx before Phase 8.5 activation of the native app.
 * Kept here so the WebView is still reachable via router.push("/webview")
 * if intentionally referenced elsewhere.
 *
 * The native app now launches into app/(tabs)/index.tsx directly.
 * This screen is NOT in the tab bar — it is a hidden Stack screen registered
 * in app/_layout.tsx.
 */

import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";

// Guard against Metro injecting the literal string "undefined" when the env
// var was not set at bundle time, and against an empty string.
const _raw  = process.env.EXPO_PUBLIC_DOMAIN;
const DOMAIN  = _raw && _raw !== "undefined" ? _raw : "";
const WEB_URL = DOMAIN ? `https://${DOMAIN}/` : "";

const TABLET_UA =
  "Mozilla/5.0 (Linux; Android 13; Lenovo TB-J716F Build/TP1A.220624.014) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.6099.230 Safari/537.36";

function buildOrientationScript(isLandscape: boolean): string {
  const vpWidth = isLandscape ? 1340 : 430;
  return `
(function() {
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.content = 'width=${vpWidth}, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
  requestAnimationFrame(function() {
    setTimeout(function() {
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new Event('resize'));
    }, 32);
  });
})();
true;
`;
}

function LoadingView() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#22c55e" />
    </View>
  );
}

function MissingDomainScreen() {
  return (
    <View style={styles.loading}>
      <Text
        style={{ color: "#ef4444", fontSize: 14, fontWeight: "bold", marginBottom: 8 }}
      >
        Configuration error
      </Text>
      <Text
        style={{
          color:             "#9ca3af",
          fontSize:          12,
          textAlign:         "center",
          paddingHorizontal: 32,
        }}
      >
        EXPO_PUBLIC_DOMAIN is not set.{"\n"}
        Restart the Expo workflow so the Replit dev domain is baked into the
        bundle.
      </Text>
    </View>
  );
}

export default function WebViewScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape       = width >= height;
  const webViewRef        = useRef<WebView>(null);
  const prevLandscape     = useRef<boolean | null>(null);
  const insets            = useSafeAreaInsets();

  useEffect(() => {
    if (prevLandscape.current === isLandscape) return;
    prevLandscape.current = isLandscape;
    webViewRef.current?.injectJavaScript(buildOrientationScript(isLandscape));
  }, [isLandscape]);

  if (!WEB_URL) return <MissingDomainScreen />;

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <iframe
          src={WEB_URL}
          style={iframeStyle}
          title="Trading Journal"
          allow="clipboard-read; clipboard-write"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={{ height: insets.top, backgroundColor: "#0d1117" }} />
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_URL }}
        style={styles.webview}
        userAgent={TABLET_UA}
        injectedJavaScript={buildOrientationScript(isLandscape)}
        injectedJavaScriptForMainFrameOnly
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        scalesPageToFit={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        startInLoadingState
        renderLoading={() => <LoadingView />}
        onError={(e) =>
          console.warn("[WebView] error", e.nativeEvent.description)
        }
        onHttpError={(e) =>
          console.warn("[WebView] HTTP", e.nativeEvent.statusCode, WEB_URL)
        }
        onContentProcessDidTerminate={() => {
          webViewRef.current?.reload();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: "#0d1117",
  },
  webview: {
    flex:            1,
    backgroundColor: "#0d1117",
  },
  loading: {
    flex:            1,
    backgroundColor: "#0d1117",
    alignItems:      "center",
    justifyContent:  "center",
  },
});

const iframeStyle: React.CSSProperties = {
  width:           "100%",
  height:          "100%",
  border:          "none",
  backgroundColor: "#0d1117",
};
