import React, { useCallback, useEffect, useRef } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const WEB_URL = DOMAIN ? `https://${DOMAIN}/` : "/";

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
  meta.content = 'width=${vpWidth}, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
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

function buildOAuthSuccessScript(): string {
  return `
(function() {
  console.log('[cTrader OAuth] Deep link received in WebView — injecting success event');
  try {
    sessionStorage.setItem('ctrader_oauth_resume', 'true');
    var evt = new MessageEvent('message', {
      data: { type: 'ctrader_oauth_result', status: 'success', message: null },
      origin: window.location.origin
    });
    window.dispatchEvent(evt);
    console.log('[cTrader OAuth] Account loading started — dispatched ctrader_oauth_result');
  } catch (e) {
    console.error('[cTrader OAuth] injection error:', e);
  }
})();
true;
`;
}

function buildOAuthCancelScript(reason: string): string {
  return `
(function() {
  console.log('[cTrader OAuth] OAuth cancelled or dismissed: ${reason}');
  try {
    var evt = new MessageEvent('message', {
      data: { type: 'ctrader_oauth_result', status: 'error', message: 'OAuth was cancelled' },
      origin: window.location.origin
    });
    window.dispatchEvent(evt);
  } catch (e) {}
})();
true;
`;
}

export default function TabletScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width >= height;
  const webViewRef = useRef<WebView>(null);
  const prevLandscape = useRef<boolean | null>(null);
  const oauthActiveRef = useRef(false);

  useEffect(() => {
    if (prevLandscape.current === isLandscape) return;
    prevLandscape.current = isLandscape;
    webViewRef.current?.injectJavaScript(buildOrientationScript(isLandscape));
  }, [isLandscape]);

  const injectOAuthSuccess = useCallback(() => {
    console.log("[cTrader OAuth] Account loading started — injecting success into WebView");
    webViewRef.current?.injectJavaScript(buildOAuthSuccessScript());
    oauthActiveRef.current = false;
  }, []);

  const handleCTraderOAuthStart = useCallback(async (authUrl: string) => {
    if (oauthActiveRef.current) {
      console.log("[cTrader OAuth] OAuth already in progress — ignoring duplicate start");
      return;
    }
    oauthActiveRef.current = true;
    const redirectUrl = Linking.createURL("ctrader-connected");
    console.log("[cTrader OAuth] Deep link: opening system browser");
    console.log("[cTrader OAuth] Deep link: redirectUrl =", redirectUrl);
    console.log("[cTrader OAuth] Deep link: authUrl =", authUrl.slice(0, 80) + "…");

    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      console.log("[cTrader OAuth] Browser result type:", result.type);

      if (result.type === "success") {
        console.log("[cTrader OAuth] Deep link received:", result.url);
        console.log("[cTrader OAuth] Account loading started");
        injectOAuthSuccess();
      } else if (result.type === "cancel" || result.type === "dismiss") {
        console.log("[cTrader OAuth] OAuth dismissed by user");
        webViewRef.current?.injectJavaScript(buildOAuthCancelScript(result.type));
        oauthActiveRef.current = false;
      } else {
        console.log("[cTrader OAuth] Browser closed without result:", result.type);
        oauthActiveRef.current = false;
      }
    } catch (err) {
      console.error("[cTrader OAuth] Error opening auth session:", err);
      oauthActiveRef.current = false;
    }
  }, [injectOAuthSuccess]);

  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type?: string; url?: string };
      if (msg.type === "ctrader_oauth_start" && msg.url) {
        console.log("[cTrader OAuth] Bridge message received: ctrader_oauth_start");
        handleCTraderOAuthStart(msg.url);
      }
    } catch { /* non-JSON WebView messages are safe to ignore */ }
  }, [handleCTraderOAuthStart]);

  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      console.log("[cTrader OAuth] Linking event received:", url);
      if (url.startsWith("tradevault://ctrader-connected") && oauthActiveRef.current) {
        console.log("[cTrader OAuth] Deep link received via Linking fallback");
        console.log("[cTrader OAuth] Account loading started (Linking path)");
        injectOAuthSuccess();
      }
    });
    return () => sub.remove();
  }, [injectOAuthSuccess]);

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
        onMessage={handleWebViewMessage}
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
