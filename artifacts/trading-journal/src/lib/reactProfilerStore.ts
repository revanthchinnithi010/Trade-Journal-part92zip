// ── React Profiler Store ───────────────────────────────────────────────────────
// Collects <Profiler> onRender callbacks and exposes per-component aggregate
// stats. All consumers subscribe via subscribe() and pull fresh data with
// getStats().

export interface ProfilerCommit {
  phase:          "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration:   number;
  commitTime:     number;
}

export interface ComponentStats {
  id:            string;
  mountDuration: number | null;   // actualDuration of first "mount" commit
  renderCount:   number;          // number of non-mount commits
  totalActualMs: number;
  peakActualMs:  number;
  lastActualMs:  number;
  lastPhase:     ProfilerCommit["phase"] | null;
  commits:       ProfilerCommit[];
}

const _stats = new Map<string, ComponentStats>();
const _subs  = new Set<() => void>();

function _notify() {
  _subs.forEach(fn => fn());
}

/**
 * Drop-in React <Profiler> onRender callback.
 * Pass directly: <Profiler id="X" onRender={rpStore.onRender}>
 */
export function onRender(
  id:             string,
  phase:          "mount" | "update" | "nested-update",
  actualDuration: number,
  baseDuration:   number,
  _startTime:     number,
  commitTime:     number,
): void {
  let s = _stats.get(id);
  if (!s) {
    s = {
      id,
      mountDuration: null,
      renderCount:   0,
      totalActualMs: 0,
      peakActualMs:  0,
      lastActualMs:  0,
      lastPhase:     null,
      commits:       [],
    };
    _stats.set(id, s);
  }
  if (phase === "mount") {
    s.mountDuration = actualDuration;
  } else {
    s.renderCount++;
  }
  s.totalActualMs += actualDuration;
  if (actualDuration > s.peakActualMs) s.peakActualMs = actualDuration;
  s.lastActualMs = actualDuration;
  s.lastPhase    = phase;
  s.commits.push({ phase, actualDuration, baseDuration, commitTime });
  _notify();
}

export function getStats(): ComponentStats[] {
  return Array.from(_stats.values());
}

export function clearStats(): void {
  _stats.clear();
  _notify();
}

export function subscribe(fn: () => void): () => void {
  _subs.add(fn);
  return () => { _subs.delete(fn); };
}
