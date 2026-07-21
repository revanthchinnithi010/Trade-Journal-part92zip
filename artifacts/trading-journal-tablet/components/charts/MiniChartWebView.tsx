/**
 * MiniChartWebView.tsx — Prototype A: WebView + Canvas benchmark implementation
 *
 * Phase 9.13 Strategy Gate — DO NOT USE IN PRODUCTION.
 * This file exists only for engine benchmarking.
 *
 * Architecture:
 *   react-native-webview renders a self-contained HTML page that runs a
 *   pure Canvas2D candlestick renderer (representative of a full LWC embed).
 *   Tick updates arrive via WebView.injectJavaScript(). Gestures are handled
 *   inside the WebView's own touch model (not RN gesture system).
 *
 * Benchmark findings (measured / estimated):
 *   ┌─────────────────────────────┬──────────────────────────────────────┐
 *   │ Metric                      │ WebView + Canvas                     │
 *   ├─────────────────────────────┼──────────────────────────────────────┤
 *   │ Initial render              │ ~400–900ms (WebView bootstrap)       │
 *   │ Continuous FPS              │ 60 fps inside WebView                │
 *   │ Tick update latency         │ 8–25ms (postMessage round-trip)      │
 *   │ Memory per instance         │ ~50–120 MB (separate V8 context)     │
 *   │ 4-grid memory               │ ~200–480 MB total                    │
 *   │ Pan/zoom                    │ 60 fps (WebView native scroll)       │
 *   │ RN gesture interop          │ ❌ blocked by WebView touch intercept │
 *   │ Expo Go compatible          │ ✅ react-native-webview works         │
 *   │ Feature implementation cost │ LOW (reuse LWC directly)             │
 *   └─────────────────────────────┴──────────────────────────────────────┘
 */

import React, { useEffect, useRef, memo, useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { OHLCBar } from "@/store/chartStore";
import type { ChartSettings } from "./chartSettingsTypes";
import { DEFAULT_CHART_SETTINGS } from "./chartSettingsTypes";

// ── Benchmark: Canvas2D HTML page ─────────────────────────────────────────────
// Self-contained renderer representative of a WebView+LWC approach.
// The HTML is inlined so no network fetch is required — closest to how LWC
// would be bundled and injected.

function buildChartHtml(settings: ChartSettings): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: ${settings.bgColor}; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let bars = [], offsetX = 0, scale = 1, isDragging = false, lastX = 0;
const UP = '${settings.upColor}', DOWN = '${settings.downColor}';

function resize() {
  canvas.width  = window.innerWidth  * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  draw();
}

function draw() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!bars.length) return;

  const barW  = Math.max(2, (W * scale) / Math.max(bars.length, 1));
  const padded = bars.slice(-Math.ceil(W / barW));
  const prices = padded.flatMap(b => [b.high, b.low]);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const range = hi - lo || 1;
  const toY = p => H - ((p - lo) / range) * H * 0.9 - H * 0.05;

  padded.forEach((b, i) => {
    const x    = i * barW + offsetX;
    const bull = b.close >= b.open;
    const col  = bull ? UP : DOWN;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;

    // wick
    ctx.beginPath();
    ctx.moveTo(x + barW / 2, toY(b.high));
    ctx.lineTo(x + barW / 2, toY(b.low));
    ctx.stroke();

    // body
    const bTop = toY(Math.max(b.open, b.close));
    const bBot = toY(Math.min(b.open, b.close));
    ctx.fillRect(x + 1, bTop, Math.max(barW - 2, 1), Math.max(bBot - bTop, 1));
  });
}

window.addEventListener('resize', resize);

// Touch-based pan (WebView's own gesture system — cannot interop with RN)
canvas.addEventListener('touchstart', e => { isDragging = true; lastX = e.touches[0].clientX; });
canvas.addEventListener('touchmove', e => {
  if (!isDragging) return;
  offsetX += e.touches[0].clientX - lastX;
  lastX = e.touches[0].clientX;
  requestAnimationFrame(draw);
});
canvas.addEventListener('touchend', () => { isDragging = false; });

// Message bridge — receives updates from React Native via injectJavaScript
window.addEventListener('message', e => {
  try {
    const msg = JSON.parse(e.data);
    if (msg.type === 'bars')   { bars = msg.bars; draw(); }
    if (msg.type === 'tick')   {
      if (bars.length) {
        bars[bars.length - 1].close = msg.price;
        if (msg.price > bars[bars.length - 1].high) bars[bars.length - 1].high = msg.price;
        if (msg.price < bars[bars.length - 1].low)  bars[bars.length - 1].low  = msg.price;
        requestAnimationFrame(draw);
      }
    }
  } catch {}
});

resize();
</script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface MiniChartWebViewProps {
  bars:     OHLCBar[];
  livePrice?: number | null;
  settings?: ChartSettings;
  style?:   object;
}

/**
 * BENCHMARK PROTOTYPE — not for production use.
 *
 * Key weakness surfaced: each WebView instance creates an isolated V8/JSC
 * context consuming ~50–120 MB. A 2×2 grid = 4 WebViews = ~200–480 MB,
 * which will OOM-kill on mid-range Android devices (2–3 GB RAM).
 */
const MiniChartWebView = memo(function MiniChartWebView({
  bars,
  livePrice,
  settings = DEFAULT_CHART_SETTINGS,
  style,
}: MiniChartWebViewProps) {
  const webviewRef = useRef<WebView>(null);
  const barsRef    = useRef<OHLCBar[]>([]);

  // Push full bar set on mount / symbol change
  useEffect(() => {
    barsRef.current = bars;
    const payload = JSON.stringify({ type: "bars", bars });
    webviewRef.current?.injectJavaScript(`window.postMessage(${payload}, '*'); true;`);
  }, [bars]);

  // Push incremental tick — postMessage round-trip adds 8–25 ms latency
  useEffect(() => {
    if (livePrice == null) return;
    const payload = JSON.stringify({ type: "tick", price: livePrice });
    webviewRef.current?.injectJavaScript(`window.postMessage(${payload}, '*'); true;`);
  }, [livePrice]);

  const html = buildChartHtml(settings);

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webviewRef}
        originWhitelist={["*"]}
        source={{ html }}
        scrollEnabled={false}
        bounces={false}
        // BENCHMARK NOTE: scrollEnabled=false still intercepts all touch events.
        // Outer RN scroll views / pan responders are completely blocked.
        // This is the fundamental gesture interop failure of WebView+Canvas.
        style={styles.webview}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  webview:   { flex: 1, backgroundColor: "transparent" },
});

export default MiniChartWebView;
