// ── Sheet Transition Profiler ─────────────────────────────────────────────
// Two independent profiling modes:
//
// MODE 1 — Snap-transition sessions (existing)
//   sheetProfiler.markStart("HALF→FULL")   ← starts a 3-s capture window
//   sheetProfiler.end(handle, "Comp", "op")← records span inside that window
//   Report auto-prints after 3 s.
//
// MODE 2 — Always-on render tracking (NEW)
//   sheetProfiler.trackRender("Comp", startTime, "file.tsx", 42)
//   Records every render from the moment profiling is enabled.
//   Call window.__tjProfiler.printRenderReport() to see the table.
//
// FPS capture (NEW)
//   window.__tjProfiler.startFps()  → runs a 5-s RAF loop, then prints FPS
//   window.__tjProfiler.stopFps()   → stop early
//
// Enable:  localStorage.setItem("TJ_PROFILE_SHEET","1"); location.reload()
// Disable: localStorage.removeItem("TJ_PROFILE_SHEET"); location.reload()
//
// Quick console commands (all on window.__tjProfiler):
//   .enable()            toggle on + reload
//   .disable()           toggle off + reload
//   .printRenderReport() always-on render stats table
//   .printNow()          snap-session report (if a session is active)
//   .startFps()          5-s FPS measurement
//   .stopFps()           stop FPS early

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
  console.group(
    `%c[SheetProfiler] ${_transitionDir} — ${_events.length} events`,
    "color:#60a5fa;font-weight:bold;font-size:13px",
  );
  console.log(
    `%c🔴 SLOWEST: [${slowest.component}] ${slowest.operation} — ${slowest.duration.toFixed(2)} ms`,
    "color:#f87171;font-weight:bold;font-size:12px",
  );
  console.table(rows);
  console.groupEnd();
}

// ── Mode 2: always-on render stats ───────────────────────────────────────
const _renderStats = new Map<string, RenderStat>();

function _printRenderReport() {
  if (_renderStats.size === 0) {
    console.log("[SheetProfiler:renders] No renders recorded yet. Interact with MiniControlBar / 3-dots / ChartSettings.");
    return;
  }
  const rows = [..._renderStats.values()]
    .sort((a, b) => b.totalMs - a.totalMs)
    .map(s => ({
      "Component":       s.component,
      "File":            s.file,
      "Line":            s.line,
      "Render Count":    s.renderCount,
      "Avg Duration ms": s.renderCount ? (s.totalMs / s.renderCount).toFixed(2) : "—",
      "Max Duration ms": s.maxMs.toFixed(2),
      "Min Duration ms": s.minMs.toFixed(2),
      "Last Duration ms":s.lastMs.toFixed(2),
      "Total ms":        s.totalMs.toFixed(2),
    }));

  const top = rows[0];
  console.group(
    "%c[SheetProfiler] ── Always-on render report ──",
    "color:#34d399;font-weight:bold;font-size:14px",
  );
  console.log(
    `%c🔴 MOST EXPENSIVE: ${top["Component"]} (${top["File"]}:${top["Line"]}) — ` +
    `${top["Render Count"]} renders, avg ${top["Avg Duration ms"]} ms, max ${top["Max Duration ms"]} ms`,
    "color:#f87171;font-weight:bold;font-size:12px",
  );
  console.log("%cFull table (sorted by total render time):", "color:#94a3b8");
  console.table(rows);

  console.log(
    "%c── How to read this ──\n" +
    "  Render Count  → how many times React called the component's render fn\n" +
    "  Avg Duration  → mean time from render-start to layout-commit (useLayoutEffect)\n" +
    "  Max Duration  → worst single render — the frame-budget killer\n" +
    "  Why it lags   → high count × high avg = sustained CPU cost; high max = jank spike",
    "color:#94a3b8;font-size:11px",
  );
  console.groupEnd();
}

// ── FPS capture ───────────────────────────────────────────────────────────
let _fpsRaf: number | null = null;
let _fpsFrames   = 0;
let _fpsStart    = 0;
let _fpsCaptureDuration = 5000;

function _startFps(durationMs = 5000) {
  if (_fpsRaf !== null) { cancelAnimationFrame(_fpsRaf); }
  _fpsFrames  = 0;
  _fpsStart   = performance.now();
  _fpsCaptureDuration = durationMs;

  function tick() {
    _fpsFrames++;
    const elapsed = performance.now() - _fpsStart;
    if (elapsed < _fpsCaptureDuration) {
      _fpsRaf = requestAnimationFrame(tick);
    } else {
      _fpsRaf = null;
      const fps = (_fpsFrames / (elapsed / 1000)).toFixed(1);
      const budget = (elapsed / _fpsFrames).toFixed(2);
      console.log(
        `%c[SheetProfiler:FPS] ${fps} fps over ${(elapsed/1000).toFixed(1)}s ` +
        `(${budget} ms/frame avg, ${_fpsFrames} frames)`,
        Number(fps) >= 55
          ? "color:#34d399;font-weight:bold"
          : Number(fps) >= 30
            ? "color:#f59e0b;font-weight:bold"
            : "color:#f87171;font-weight:bold",
      );
    }
  }
  requestAnimationFrame(tick);
  console.log(`%c[SheetProfiler:FPS] Measuring for ${durationMs / 1000}s…`, "color:#94a3b8");
}

function _stopFps() {
  if (_fpsRaf !== null) { cancelAnimationFrame(_fpsRaf); _fpsRaf = null; }
  console.log("[SheetProfiler:FPS] stopped early.");
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Call this the moment a snap transition is committed (before animateTo). */
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

/** Start timing a synchronous or async operation (snap-session only). */
export function begin(component: string, _operation: string): number {
  if (!ENABLED || !_active) return 0;
  return performance.now();
}

/** End timing for snap-session span. */
export function end(handle: number, component: string, operation: string): void {
  if (!ENABLED || !_active || handle === 0) return;
  const now      = performance.now();
  const duration = now - handle;
  const timestamp = handle - _transitionStart;
  _events.push({ timestamp, component, operation, duration });
}

/** Log an instant event inside a snap session. */
export function instant(component: string, operation: string): void {
  if (!ENABLED || !_active) return;
  const now = performance.now();
  _events.push({ timestamp: now - _transitionStart, component, operation, duration: 0 });
}

/**
 * Always-on render tracker — does NOT require an active snap session.
 * Call at the TOP of a component function body (before hooks, to capture full render time),
 * and pair with a useLayoutEffect that calls the returned `commit` function.
 *
 * Example (inside a component):
 *   const _commit = sheetProfiler.trackRender("MiniControlBar", "MobileChartLayout.tsx", 2801);
 *   useLayoutEffect(() => { _commit(); });
 */
export function trackRender(
  component: string,
  file: string,
  line: number,
): () => void {
  if (!ENABLED) return () => {};
  const start = performance.now();
  return function commit() {
    const duration = performance.now() - start;
    const key = `${component}@${file}:${line}`;
    const existing = _renderStats.get(key);
    if (existing) {
      existing.renderCount++;
      existing.totalMs += duration;
      if (duration > existing.maxMs) existing.maxMs = duration;
      if (duration < existing.minMs) existing.minMs = duration;
      existing.lastMs = duration;
    } else {
      _renderStats.set(key, {
        component, file, line,
        renderCount: 1,
        totalMs:     duration,
        maxMs:       duration,
        minMs:       duration,
        lastMs:      duration,
      });
    }
  };
}

/** Force-print snap-session report now. */
export function printNow(): void {
  if (_reportTimer !== null) { clearTimeout(_reportTimer); _reportTimer = null; }
  _printReport();
}

/** Print the always-on render stats report. */
export function printRenderReport(): void {
  _printRenderReport();
}

/** Reset the always-on render stats counters. */
export function resetRenderStats(): void {
  _renderStats.clear();
  console.log("[SheetProfiler] Render stats reset.");
}

export function isActive():  boolean { return ENABLED && _active; }
export function isEnabled(): boolean { return ENABLED; }

// ── Window exposure ────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__tjProfiler = {
    markStart, begin, end, instant, printNow, isEnabled, isActive,
    printRenderReport: _printRenderReport,
    resetRenderStats,
    startFps: _startFps,
    stopFps:  _stopFps,
    enable:   () => { localStorage.setItem("TJ_PROFILE_SHEET","1"); location.reload(); },
    disable:  () => { localStorage.removeItem("TJ_PROFILE_SHEET"); location.reload(); },
  };

  if (ENABLED) {
    console.log(
      "%c[SheetProfiler] ✅ ENABLED\n" +
      "  MiniControlBar, MoreOptionsSheet, ChartSettingsSheet are instrumented.\n" +
      "  → window.__tjProfiler.printRenderReport()  — render counts + durations\n" +
      "  → window.__tjProfiler.resetRenderStats()   — clear counters\n" +
      "  → window.__tjProfiler.startFps(5000)       — 5-s FPS measurement\n" +
      "  → window.__tjProfiler.printNow()           — snap-session report\n" +
      "  → window.__tjProfiler.disable()            — turn off + reload",
      "color:#34d399;font-weight:bold;font-size:13px",
    );
  } else {
    console.log(
      "%c[SheetProfiler] ⚫ inactive — run window.__tjProfiler.enable() to activate.",
      "color:#6b7280",
    );
  }
}
