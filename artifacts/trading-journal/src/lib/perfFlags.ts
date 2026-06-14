// ── Performance Feature Flags ─────────────────────────────────────────────────
//
// Temporary flags for A/B perf testing. Zero React/Zustand dependency —
// plain pub-sub store. Components subscribe via usePerfFlag().
//
// Console access:
//   window.__tjPerfFlags                    — read current state
//   window.__tjPerfTest.run()               — run automated 4-config comparison

export interface PerfFlags {
  PERF_DISABLE_SHEET_SHADOW:   boolean;
  PERF_DISABLE_MESH_BLOBS:     boolean;
  PERF_DISABLE_BACKDROP_BLUR:  boolean;
  /** When true, scheduleChartUpdate() discards pending bars — zero LWC repaints. */
  PERF_PAUSE_CHART_UPDATES:    boolean;
}

const DEFAULT: PerfFlags = {
  PERF_DISABLE_SHEET_SHADOW:   false,
  PERF_DISABLE_MESH_BLOBS:     false,
  PERF_DISABLE_BACKDROP_BLUR:  false,
  PERF_PAUSE_CHART_UPDATES:    false,
};

let _state: PerfFlags = { ...DEFAULT };
const _subs = new Set<() => void>();

export function getFlags(): Readonly<PerfFlags> { return _state; }
export function getFlag<K extends keyof PerfFlags>(k: K): boolean { return _state[k]; }

export function setFlags(partial: Partial<PerfFlags>): void {
  _state = { ..._state, ...partial };
  _subs.forEach(fn => fn());
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__tjPerfFlags = { ..._state };
  }
}

export function resetFlags(): void {
  _state = { ...DEFAULT };
  _subs.forEach(fn => fn());
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__tjPerfFlags = { ..._state };
  }
}

export function subscribe(fn: () => void): () => void {
  _subs.add(fn);
  return () => { _subs.delete(fn); };
}

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__tjPerfFlags = { ..._state };
}
