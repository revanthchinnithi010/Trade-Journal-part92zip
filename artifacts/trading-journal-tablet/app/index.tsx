import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const WEB_URL = DOMAIN ? `https://${DOMAIN}/` : "/";

const TABLET_UA =
  "Mozilla/5.0 (Linux; Android 13; Lenovo TB-J716F Build/TP1A.220624.014) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.6099.230 Safari/537.36";

/**
 * Inject a viewport <meta> that matches the device orientation, then — after
 * a short rAF+timeout so the browser has committed the new viewport — fire
 * both 'orientationchange' and 'resize'.  The web app's useIsMobile() hook
 * listens to all three events, so it will re-evaluate matchMedia and switch
 * between mobile (portrait) and desktop (landscape) layouts seamlessly.
 *
 * Portrait:  viewportWidth (430) < device height → portrait media query = true  → mobile layout
 * Landscape: viewportWidth (1340) > device height → portrait media query = false → desktop layout
 */
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
  meta.content = 'width=${vpWidth}, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
  // Wait for the browser to repaint with the new viewport before firing events
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

export default function TabletScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width >= height;
  const webViewRef = useRef<WebView>(null);
  const prevLandscape = useRef<boolean | null>(null);

  // Re-inject on every orientation flip
  useEffect(() => {
    if (prevLandscape.current === isLandscape) return;
    prevLandscape.current = isLandscape;
    webViewRef.current?.injectJavaScript(buildOrientationScript(isLandscape));
  }, [isLandscape]);

  // Web platform — plain iframe; orientation handled by the browser natively
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
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "bottom", "left", "right"]}
    >
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
        onContentProcessDidTerminate={() => {
          webViewRef.current?.reload();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
});

const iframeStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  border: "none",
  backgroundColor: "#0d1117",
};
