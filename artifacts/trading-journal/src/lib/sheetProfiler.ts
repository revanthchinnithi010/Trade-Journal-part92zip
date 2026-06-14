// ── Sheet Transition Profiler ─────────────────────────────────────────────
// Two independent profiling modes:
//
// MODE 1 — Snap-transition sessions
//   sheetProfiler.markStart("HALF→FULL")   ← starts a 3-s capture window
//   sheetProfiler.end(handle, "Comp", "op")← records span inside that window
//
// MODE 2 — Always-on render tracking
//   sheetProfiler.trackRender("Comp", "file.tsx", 42)
//   Records every render unconditionally (no localStorage flag needed).
//   Call getRenderStats() or printRenderReport() to read data.
//
// MODE 3 — Tick-correlation (always-on)
//   Call notifyTick(symbol, price) each time a price batch lands in the store.
//   Within the next 120 ms, any watched component that commits a render is
//   flagged as tick-triggered and logged to the console.
//
//   Watched components:
//     ChartSettingsSheet · SettingsTabContent · SettingsRow:* (prefix)
//     MobileChartLayout  · Charts
//
//   Every 20th clean tick (no watched re-renders) a summary is logged instead
//   of spamming the console on every tick.
//
// FPS capture
//   measureFps(durationMs) → Promise<FpsResult>  ← for on-screen panel
//   startFps(durationMs)                          ← console-only helper
//
// Console commands (window.__tjProfiler):
//   .enable() / .disable()
//   .getRenderStats()
//   .printRenderReport()
//   .resetRenderStats()
//   .measureFps(5000)
//   .startFps(5000) / .stopFps()
//   .notifyTick(symbol, price)   ← manual test

export type ProfileEvent = {
  timestamp: number;
  component: string;
  operation: string;
  duration:  number;
};

export type RenderStat = {
  component:   string;
  file:        string;
  line:        number;
  renderCount: number;
  totalMs:     number;
  maxMs:       number;
  minMs:       number;
  lastMs:      number;
};

export type FpsResult = {
  fps:          number;
  avgFrameMs:   number;
  worstFrameMs: number;
  frameCount:   number;
  durationMs:   number;
};

const ENABLED =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("TJ_PROFILE_SHEET") === "1";

// ── Mode 1: snap-session state ────────────────────────────────────────────
let _transitionStart = 0;
let _transitionDir   = "";
let _events: ProfileEvent[] = [];
let _reportTimer: ReturnType<typeof setTimeout> | null = null;
let _active = false;

function _reset() {
  _events = [];
  _active = false;
  if (_reportTimer !== null) { clearTimeout(_reportTimer); _reportTimer = null; }
}

function _printReport() {
  _active = false;
  if (_events.length === 0) {
    console.log("[SheetProfiler] No snap-session events captured.");
    return;
  }
  const sorted = [..._events].sort((a, b) => b.duration - a.duration);
  const slowest = sorted[0];
  const rows = sorted.map(e => ({
    "Timestamp (ms)": e.timestamp.toFixed(2),
    "Component":      e.component,
    "Operation":      e.operation,
    "Duration (ms)":  e.duration.toFixed(2),
  }));
  console.group(`%c[SheetProfiler] ${_transitionDir} — ${_events.length} events`, "color:#60a5fa;font-weight:bold;font-size:13px");
  console.log(`%c🔴 SLOWEST: [${slowest.component}] ${slowest.operation} — ${slowest.duration.toFixed(2)} ms`, "color:#f87171;font-weight:bold;font-size:12px");
  console.table(rows);
  console.groupEnd();
}

// ── Mode 2: always-on render stats ────────────────────────────────────────
const _renderStats = new Map<string, RenderStat>();

function _printRenderReport() {
  const stats = _getRenderStats();
  if (stats.length === 0) {
    console.log("[SheetProfiler:renders] No renders recorded yet.");
    return;
  }
  const rows = stats.map(s => ({
    "Component":    s.component,
    "File":         s.file,
    "Line":         s.line,
    "Renders":      s.renderCount,
    "Avg ms":       s.renderCount ? (s.totalMs / s.renderCount).toFixed(2) : "—",
    "Max ms":       s.maxMs.toFixed(2),
    "Min ms":       s.minMs.toFixed(2),
    "Last ms":      s.lastMs.toFixed(2),
    "Total ms":     s.totalMs.toFixed(2),
  }));
  const top = rows[0];
  console.group("%c[SheetProfiler] ── Render Report ──", "color:#34d399;font-weight:bold;font-size:14px");
  console.log(`%c🔴 SLOWEST: ${top["Component"]} (${top["File"]}:${top["Line"]}) — ${top["Renders"]} renders, avg ${top["Avg ms"]} ms, max ${top["Max ms"]} ms`, "color:#f87171;font-weight:bold;font-size:12px");
  console.table(rows);
  console.groupEnd();
}

function _getRenderStats(): RenderStat[] {
  return [..._renderStats.values()].sort((a, b) => b.totalMs - a.totalMs);
}

// ── Mode 3: tick-correlation ───────────────────────────────────────────────
// Components the user cares about for tick re-render analysis.
const _WATCH_SET = new Set([
  "ChartSettingsSheet",
  "SettingsTabContent",
  "MobileChartLayout",
  "Charts",
]);

function _isWatched(component: string): boolean {
  return _WATCH_SET.has(component) || component.startsWith("SettingsRow:");
}

// Rolling 2-second buffer of commit timestamps per stat-key (for renders/sec).
const _rpsBuffer = new Map<string, number[]>();
const RPS_WINDOW_MS  = 1000;   // window for renders/sec calculation
const TICK_WINDOW_MS = 120;    // renders within this many ms of a tick are "tick-triggered"

let _lastTick: { symbol: string; price: number; at: number } | null = null;
let _pendingTickLog: string[] = [];   // watched component names that re-rendered
let _tickLogTimer: ReturnType<typeof setTimeout> | null = null;
let _cleanTicks = 0;                  // consecutive ticks with zero watched re-renders

function _getComponentRps(component: string): number {
  let total = 0;
  const now = performance.now();
  const cutoff = now - RPS_WINDOW_MS;
  for (const [key, stat] of _renderStats) {
    if (stat.component !== component && !(component === "SettingsRow:*" && stat.component.startsWith("SettingsRow:"))) continue;
    const buf = _rpsBuffer.get(key);
    if (!buf) continue;
    total += buf.filter(t => t >= cutoff).length;
  }
  return total;
}

function _getAllWatchedRps(): Record<string, number> {
  const now = performance.now();
  const cutoff = now - RPS_WINDOW_MS;
  const out: Record<string, number> = {};
  for (const [key, stat] of _renderStats) {
    if (!_isWatched(stat.component)) continue;
    const buf = _rpsBuffer.get(key);
    if (!buf) continue;
    const rps = buf.filter(t => t >= cutoff).length;
    if (rps === 0) continue;
    // Bucket SettingsRow:* variants under a single key for readability
    const bucket = stat.component.startsWith("SettingsRow:") ? "SettingsRow:*" : stat.component;
    out[bucket] = (out[bucket] ?? 0) + rps;
  }
  return out;
}

function _flushTickLog(): void {
  _tickLogTimer = null;
  if (!_lastTick) return;

  const { symbol, price } = _lastTick;
  const rpsMap = _getAllWatchedRps();

  if (_pendingTickLog.length > 0) {
    _cleanTicks = 0;

    // Deduplicate (multiple components may have same name from different keys)
    const unique = [...new Set(_pendingTickLog)];
    console.group(
      `%c[TJProfiler] ⚡ TICK ${symbol} @${price.toFixed(2)} → ${unique.length} watched component(s) RE-RENDERED`,
      "color:#f87171;font-weight:bold;font-size:13px",
    );
    unique.forEach(c => {
      const bucket = c.startsWith("SettingsRow:") ? "SettingsRow:*" : c;
      const rps = rpsMap[bucket] ?? 0;
      console.log(`%c  🔴 ${c}  ·  source: tick  ·  ~${rps} renders/sec`, "color:#fbbf24;font-weight:600");
    });

    // Always print the full rps summary table for watched components
    const tableRows = Object.entries(rpsMap).map(([comp, rps]) => ({
      "Component": comp,
      "Renders/sec": rps,
      "Tick-triggered": unique.some(u => (u.startsWith("SettingsRow:") ? "SettingsRow:*" : u) === comp) ? "🔴 YES" : "—",
    }));
    if (tableRows.length > 0) console.table(tableRows);
    console.groupEnd();
  } else {
    _cleanTicks++;
    // Log 1-in-20 clean ticks so there is evidence of silence
    if (_cleanTicks % 20 === 1) {
      const rpsStr = Object.keys(rpsMap).length > 0
        ? Object.entries(rpsMap).map(([c, r]) => `${c}=${r}`).join(" | ")
        : "all 0";
      console.log(
        `%c[TJProfiler] ✅ TICK ${symbol} @${price.toFixed(2)} — no watched component re-rendered  (${_cleanTicks} consecutive clean ticks)  rps: ${rpsStr}`,
        "color:#34d399;font-size:11px",
      );
    }
  }
}

/**
 * Call once per price-batch flush (after _setMany lands in the store).
 * Resets the pending log window and schedules a 120ms-deferred flush —
 * giving React time to commit any tick-triggered re-renders before we report.
 */
export function notifyTick(symbol: string, price: number): void {
  _lastTick = { symbol, price, at: performance.now() };
  _pendingTickLog = [];   // fresh window for this tick batch
  if (_tickLogTimer !== null) clearTimeout(_tickLogTimer);
  _tickLogTimer = setTimeout(_flushTickLog, 120);
}

// ── Mode 2 + 3: trackRender ────────────────────────────────────────────────

/**
 * Always-on render tracker — NO ENABLED gate, always accumulates.
 * Pattern:
 *   const _commit = sheetProfiler.trackRender("Name", "file.tsx", LINE);
 *   useLayoutEffect(() => { _commit(); });
 */
export function trackRender(component: string, file: string, line: number): () => void {
  const start = performance.now();
  return function commit() {
    const now      = performance.now();
    const duration = now - start;
    const key      = `${component}@${file}:${line}`;

    // ── render stats ─────────────────────────────────────────────────────
    const s = _renderStats.get(key);
    if (s) {
      s.renderCount++;
      s.totalMs += duration;
      if (duration > s.maxMs) s.maxMs = duration;
      if (duration < s.minMs) s.minMs = duration;
      s.lastMs = duration;
    } else {
      _renderStats.set(key, {
        component, file, line,
        renderCount: 1, totalMs: duration,
        maxMs: duration, minMs: duration, lastMs: duration,
      });
    }

    // ── rps ring buffer ───────────────────────────────────────────────────
    let buf = _rpsBuffer.get(key);
    if (!buf) { buf = []; _rpsBuffer.set(key, buf); }
    buf.push(now);
    // Trim entries older than 2 × RPS_WINDOW_MS to cap memory
    const cutoff = now - RPS_WINDOW_MS * 2;
    let i = 0;
    while (i < buf.length && buf[i] < cutoff) i++;
    if (i > 0) buf.splice(0, i);

    // ── tick correlation ──────────────────────────────────────────────────
    if (
      _lastTick &&
      (now - _lastTick.at) < TICK_WINDOW_MS &&
      _isWatched(component)
    ) {
      if (!_pendingTickLog.includes(component)) {
        _pendingTickLog.push(component);
      }
    }
  };
}

// ── FPS capture ───────────────────────────────────────────────────────────
let _fpsRaf: number | null = null;

/**
 * Returns a Promise that resolves with FPS data after durationMs.
 * Suitable for on-screen panel use.
 */
function _measureFps(durationMs = 5000): Promise<FpsResult> {
  return new Promise(resolve => {
    if (_fpsRaf !== null) { cancelAnimationFrame(_fpsRaf); _fpsRaf = null; }

    let frames = 0;
    let prevTime = performance.now();
    let worstFrameMs = 0;
    const start = prevTime;

    function tick(now: number) {
      const delta = now - prevTime;
      prevTime = now;
      frames++;
      if (delta > worstFrameMs) worstFrameMs = delta;

      const elapsed = now - start;
      if (elapsed < durationMs) {
        _fpsRaf = requestAnimationFrame(tick);
      } else {
        _fpsRaf = null;
        const fps        = frames / (elapsed / 1000);
        const avgFrameMs = elapsed / frames;
        resolve({ fps, avgFrameMs, worstFrameMs, frameCount: frames, durationMs: elapsed });
      }
    }
    _fpsRaf = requestAnimationFrame(tick);
  });
}

function _startFps(durationMs = 5000) {
  _measureFps(durationMs).then(r => {
    const fps = r.fps.toFixed(1);
    console.log(
      `%c[SheetProfiler:FPS] ${fps} fps | avg ${r.avgFrameMs.toFixed(2)} ms/frame | worst ${r.worstFrameMs.toFixed(2)} ms | ${r.frameCount} frames`,
      Number(fps) >= 55 ? "color:#34d399;font-weight:bold" : Number(fps) >= 30 ? "color:#f59e0b;font-weight:bold" : "color:#f87171;font-weight:bold",
    );
  });
  console.log(`%c[SheetProfiler:FPS] Measuring for ${durationMs / 1000}s…`, "color:#94a3b8");
}

function _stopFps() {
  if (_fpsRaf !== null) { cancelAnimationFrame(_fpsRaf); _fpsRaf = null; }
  console.log("[SheetProfiler:FPS] stopped early.");
}

// ── Public API ─────────────────────────────────────────────────────────────

export function markStart(direction: "HALF→FULL" | "FULL→HALF") {
  if (!ENABLED) return;
  _reset();
  _transitionStart = performance.now();
  _transitionDir   = direction;
  _active          = true;
  _events.push({ timestamp: 0, component: "BottomSheet", operation: `commitSnap: ${direction}`, duration: 0 });
  _reportTimer = setTimeout(_printReport, 3000);
  console.log(`%c[SheetProfiler] ▶ Capturing ${direction} — will print in 3 s`, "color:#34d399;font-weight:bold");
}

export function begin(component: string, _operation: string): number {
  if (!ENABLED || !_active) return 0;
  return performance.now();
}

export function end(handle: number, component: string, operation: string): void {
  if (!ENABLED || !_active || handle === 0) return;
  const now = performance.now();
  _events.push({ timestamp: handle - _transitionStart, component, operation, duration: now - handle });
}

export function instant(component: string, operation: string): void {
  if (!ENABLED || !_active) return;
  _events.push({ timestamp: performance.now() - _transitionStart, component, operation, duration: 0 });
}

/** Returns render stats sorted by total time descending. Always available. */
export function getRenderStats(): RenderStat[] { return _getRenderStats(); }

/** Promise-based FPS measurement — resolves after durationMs. */
export function measureFps(durationMs = 5000): Promise<FpsResult> { return _measureFps(durationMs); }

export function printNow(): void { if (_reportTimer !== null) { clearTimeout(_reportTimer); _reportTimer = null; } _printReport(); }
export function printRenderReport(): void { _printRenderReport(); }
export function resetRenderStats(): void { _renderStats.clear(); _rpsBuffer.clear(); }
export function isActive():  boolean { return ENABLED && _active; }
export function isEnabled(): boolean { return ENABLED; }

// ── Window exposure ────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__tjProfiler = {
    markStart, begin, end, instant,
    printNow, isEnabled, isActive,
    getRenderStats:    _getRenderStats,
    printRenderReport: _printRenderReport,
    resetRenderStats,
    measureFps:        _measureFps,
    startFps:          _startFps,
    stopFps:           _stopFps,
    notifyTick,
    enable:  () => { localStorage.setItem("TJ_PROFILE_SHEET","1"); location.reload(); },
    disable: () => { localStorage.removeItem("TJ_PROFILE_SHEET"); location.reload(); },
  };

  console.log(
    "%c[TJProfiler] tick-correlation active.\n" +
    "  Watched: ChartSettingsSheet · SettingsTabContent · SettingsRow:* · MobileChartLayout · Charts\n" +
    "  → tick-triggered re-renders log automatically when they happen\n" +
    "  → every 20th clean tick logs a ✅ silence confirmation\n" +
    "  → window.__tjProfiler.printRenderReport()  — full render table\n" +
    "  → window.__tjProfiler.resetRenderStats()   — clear counters\n" +
    "  → window.__tjProfiler.measureFps(5000)     — Promise<FpsResult>\n" +
    "  → window.__tjProfiler.notifyTick('BTC',95000) — manual test",
    "color:#34d399;font-weight:bold;font-size:12px",
  );
}
