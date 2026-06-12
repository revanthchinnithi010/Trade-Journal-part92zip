// ── Sheet Transition Profiler ─────────────────────────────────────────────
// Instruments HALF↔FULL transitions in the DrawingToolsSheet / BottomSheet.
// Usage:
//   sheetProfiler.markStart("HALF→FULL")
//   const t = sheetProfiler.begin("CustomChart", "ResizeObserver callback")
//   ... operation ...
//   sheetProfiler.end(t)
//
// Report is printed automatically 3 s after each markStart call.
// Enable in the browser console: localStorage.setItem("TJ_PROFILE_SHEET","1"); location.reload()
// Disable:                        localStorage.removeItem("TJ_PROFILE_SHEET"); location.reload()

export type ProfileEvent = {
  timestamp: number;  // ms since transition start
  component: string;
  operation: string;
  duration: number;   // ms — 0 for instant markers, >0 for timed spans
};

const ENABLED =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("TJ_PROFILE_SHEET") === "1";

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
    console.log("[SheetProfiler] No events captured.");
    return;
  }

  // Sort by duration DESC (longest first)
  const sorted = [..._events].sort((a, b) => b.duration - a.duration);

  const slowest = sorted[0];
  const rows = sorted.map(e => ({
    "Timestamp (ms)":  e.timestamp.toFixed(2),
    "Component":       e.component,
    "Operation":       e.operation,
    "Duration (ms)":   e.duration.toFixed(2),
  }));

  console.group(
    `%c[SheetProfiler] ${_transitionDir} — ${_events.length} events captured`,
    "color:#60a5fa;font-weight:bold;font-size:13px"
  );
  console.log(
    `%c🔴 SLOWEST: [${slowest.component}] ${slowest.operation} — ${slowest.duration.toFixed(2)} ms (at +${slowest.timestamp.toFixed(1)} ms)`,
    "color:#f87171;font-weight:bold;font-size:12px"
  );
  console.table(rows);
  console.groupEnd();
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Call this the moment a snap transition is committed (before animateTo). */
export function markStart(direction: "HALF→FULL" | "FULL→HALF") {
  if (!ENABLED) return;
  _reset();
  _transitionStart = performance.now();
  _transitionDir   = direction;
  _active          = true;

  // Log the transition marker itself as event 0
  _events.push({
    timestamp: 0,
    component: "BottomSheet",
    operation: `commitSnap: ${direction}`,
    duration:  0,
  });

  // Auto-print after 3 s — enough for all async effects, ResizeObservers, etc.
  _reportTimer = setTimeout(_printReport, 3000);

  console.log(
    `%c[SheetProfiler] ▶ Capturing ${direction} — will print in 3 s`,
    "color:#34d399;font-weight:bold"
  );
}

/** Start timing a synchronous or async operation. Returns an opaque handle. */
export function begin(component: string, operation: string): number {
  if (!ENABLED || !_active) return 0;
  return performance.now();
}

/** End timing. Pass the handle from begin(). Records the event. */
export function end(
  handle: number,
  component: string,
  operation: string,
): void {
  if (!ENABLED || !_active || handle === 0) return;
  const now      = performance.now();
  const duration = now - handle;
  const timestamp = handle - _transitionStart;
  _events.push({ timestamp, component, operation, duration });
}

/** Log an instant event (no duration — just marks when it fired). */
export function instant(component: string, operation: string): void {
  if (!ENABLED || !_active) return;
  const now = performance.now();
  _events.push({
    timestamp: now - _transitionStart,
    component,
    operation,
    duration: 0,
  });
}

/** Force-print the report now (useful from the browser console). */
export function printNow(): void {
  if (_reportTimer !== null) { clearTimeout(_reportTimer); _reportTimer = null; }
  _printReport();
}

/** Whether profiling is currently active (between markStart and report). */
export function isActive(): boolean { return ENABLED && _active; }

/** Whether profiling is enabled at all (toggle via localStorage). */
export function isEnabled(): boolean { return ENABLED; }

// Expose on window for console access
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__tjProfiler = {
    markStart, begin, end, instant, printNow, isEnabled, isActive,
    enable:  () => { localStorage.setItem("TJ_PROFILE_SHEET","1"); location.reload(); },
    disable: () => { localStorage.removeItem("TJ_PROFILE_SHEET"); location.reload(); },
  };

  if (ENABLED) {
    console.log(
      "%c[SheetProfiler] ✅ ENABLED — open DrawingToolsSheet and drag HALF↔FULL to capture.",
      "color:#34d399;font-weight:bold"
    );
    console.log("  printNow:  window.__tjProfiler.printNow()");
    console.log("  disable:   window.__tjProfiler.disable()");
  } else {
    console.log(
      "%c[SheetProfiler] ⚫ inactive — run window.__tjProfiler.enable() to activate.",
      "color:#6b7280"
    );
  }
}
