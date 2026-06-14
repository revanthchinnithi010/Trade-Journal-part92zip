// ── Runtime GPU / Paint Profiler ─────────────────────────────────────────────
//
// Instruments ChartSettingsSheet open to capture:
//   1. Frame-drop source component (via longtask attribution + timing)
//   2. Paint duration       (trigger-mark → first-painted-frame RAF)
//   3. Composite duration   (double-RAF inner gap after first frame)
//   4. Rasterization        (worst-frame − JS-long-task − composite estimate)
//   5. Exact DOM element    (getComputedStyle walk of live DOM)
//   6. Exact CSS property   (backdropFilter / willChange / filter / boxShadow)
//
// Usage (automatic — hooked from MobileChartLayout):
//   paintProfiler.startCapture()          ← call BEFORE setShowSettings(true)
//   paintProfiler.onSheetMounted(el?)     ← call in ChartSettingsSheet mount useEffect
//
// Manual console access:
//   window.__tjPaint.startCapture()
//   window.__tjPaint.report()
//   window.__tjPaint.cssAudit()           ← re-runs DOM walk on current DOM

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FrameRecord {
  rafTimestamp:   number;
  gapMs:          number;
  isDropped:      boolean;
  isLong:         boolean;
}

export interface LongTaskRecord {
  startTime:      number;
  durationMs:     number;
  attribution:    string;
  containerType:  string;
}

export interface CssAuditEntry {
  element:        string;
  tagName:        string;
  classes:        string;
  dataAttrs:      string;
  property:       string;
  computedValue:  string;
  inlineValue:    string;
  areaPixels:     number;
  rect:           { x: number; y: number; w: number; h: number };
  zIndex:         string;
  position:       string;
}

export interface PaintReport {
  captureStartMs:    number;
  mountLatencyMs:    number | null;
  firstFrameMs:      number | null;
  compositeEstMs:    number | null;
  rasterEstMs:       number | null;
  totalFrames:       number;
  droppedFrames:     number;
  longFrames:        number;
  worstFrameMs:      number;
  avgFrameMs:        number;
  longTasks:         LongTaskRecord[];
  cssAudit:          CssAuditEntry[];
  frames:            FrameRecord[];
}

// ── GPU-promoting CSS properties to audit ────────────────────────────────────

const GPU_PROPS: Array<{ prop: keyof CSSStyleDeclaration; cssName: string }> = [
  { prop: "backdropFilter",      cssName: "backdrop-filter"   },
  { prop: "webkitBackdropFilter",cssName: "-webkit-backdrop-filter" },
  { prop: "willChange",          cssName: "will-change"       },
  { prop: "filter",              cssName: "filter"            },
  { prop: "boxShadow",           cssName: "box-shadow"        },
  { prop: "transform",           cssName: "transform"         },
  { prop: "opacity",             cssName: "opacity"           },
];

const GPU_SKIP_VALUES = new Set(["none", "auto", "normal", "0px", "", "0", "1"]);

function isGpuRelevant(prop: string, val: string): boolean {
  if (!val || val === "none" || val === "auto" || val === "normal") return false;
  if (prop === "opacity" && val === "1") return false;
  if (prop === "transform" && val === "matrix(1, 0, 0, 1, 0, 0)") return false;
  if (prop === "transform" && val === "none") return false;
  if (prop === "willChange" && val === "auto") return false;
  if (prop === "filter" && val === "none") return false;
  if (prop === "boxShadow" && val === "none") return false;
  return !GPU_SKIP_VALUES.has(val.trim());
}

function elId(el: Element): string {
  const tag  = el.tagName.toLowerCase();
  const id   = el.id ? `#${el.id}` : "";
  const cls  = el.className && typeof el.className === "string"
    ? `.${el.className.trim().replace(/\s+/g, ".")}`
    : "";
  const data = Array.from(el.attributes)
    .filter(a => a.name.startsWith("data-"))
    .map(a => `[${a.name}="${a.value}"]`)
    .join("");
  return `${tag}${id}${cls.slice(0, 40)}${data.slice(0, 40)}`;
}

function runCssAudit(): CssAuditEntry[] {
  const results: CssAuditEntry[] = [];
  const all = document.querySelectorAll("*");

  all.forEach(el => {
    const cs  = window.getComputedStyle(el as HTMLElement);
    const st  = (el as HTMLElement).style ?? null;
    const rect = el.getBoundingClientRect();
    const area = Math.round(rect.width * rect.height);

    for (const { prop, cssName } of GPU_PROPS) {
      const computed = (cs as unknown as Record<string, string>)[prop as string] ?? "";
      if (!isGpuRelevant(cssName, computed)) continue;

      const inline = st ? (st as unknown as Record<string, string>)[prop as string] ?? "" : "";

      results.push({
        element:       elId(el),
        tagName:       el.tagName.toLowerCase(),
        classes:       typeof el.className === "string" ? el.className : "",
        dataAttrs:     Array.from(el.attributes).filter(a => a.name.startsWith("data-")).map(a => `${a.name}=${a.value}`).join(" "),
        property:      cssName,
        computedValue: computed,
        inlineValue:   inline,
        areaPixels:    area,
        rect:          { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        zIndex:        cs.zIndex,
        position:      cs.position,
      });
    }
  });

  return results.sort((a, b) => {
    const propRank = (p: string) =>
      p === "backdrop-filter" ? 0 :
      p === "will-change"     ? 1 :
      p === "filter"          ? 2 :
      p === "box-shadow"      ? 3 : 4;
    const pr = propRank(a.property) - propRank(b.property);
    return pr !== 0 ? pr : b.areaPixels - a.areaPixels;
  });
}

// ── Capture state ─────────────────────────────────────────────────────────────

const FRAME_DROP_MS    = 16.7;
const FRAME_LONG_MS    = 50;
const CAPTURE_DURATION = 4000;

let _captureStart      = 0;
let _mountMarkTime: number | null = null;
let _firstFrameTime: number | null = null;
let _compositeEst: number | null = null;
let _rasterEst: number | null = null;

let _rafId: number | null = null;
let _prevRafTs: number | null = null;
let _frames: FrameRecord[] = [];

let _longTasks: LongTaskRecord[] = [];
let _paintEntries: PerformanceEntry[] = [];
let _longTaskObs: PerformanceObserver | null = null;
let _paintObs: PerformanceObserver | null = null;
let _layoutShiftObs: PerformanceObserver | null = null;

let _capturing = false;
let _cssAudit: CssAuditEntry[] = [];
let _autoStopTimer: ReturnType<typeof setTimeout> | null = null;

// ── RAF loop ──────────────────────────────────────────────────────────────────

function _rafLoop(ts: number) {
  if (!_capturing) return;

  const gap = _prevRafTs !== null ? ts - _prevRafTs : 0;
  _prevRafTs = ts;

  if (gap > 0) {
    _frames.push({
      rafTimestamp: ts,
      gapMs:        gap,
      isDropped:    gap > FRAME_DROP_MS,
      isLong:       gap > FRAME_LONG_MS,
    });

    // Capture first painted frame mark
    if (_firstFrameTime === null) {
      _firstFrameTime = performance.now() - _captureStart;

      // Double-RAF composite estimate: schedule an inner RAF immediately
      // and measure how long the GPU takes to deliver the next scanout.
      const outer = performance.now();
      requestAnimationFrame(() => {
        const inner = performance.now();
        _compositeEst = inner - outer;

        // Rough rasterization estimate:
        // worstFrame so far - any longtask in that window - composite overhead
        const worstGap = _frames.reduce((m, f) => Math.max(m, f.gapMs), 0);
        const jsBudget = _longTasks
          .filter(lt => lt.startTime >= _captureStart && lt.startTime <= _captureStart + CAPTURE_DURATION)
          .reduce((s, lt) => s + lt.durationMs, 0);
        _rasterEst = Math.max(0, worstGap - Math.min(jsBudget, worstGap * 0.8) - (_compositeEst ?? 0));
      });
    }
  }

  _rafId = requestAnimationFrame(_rafLoop);
}

// ── PerformanceObserver setup ─────────────────────────────────────────────────

function _startObservers() {
  // longtask — Chrome-only, guard with try/catch
  try {
    _longTaskObs = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const lt = entry as PerformanceLongTaskTiming;
        const attr = lt.attribution?.[0];
        _longTasks.push({
          startTime:     lt.startTime,
          durationMs:    lt.duration,
          attribution:   attr?.name ?? "unknown",
          containerType: attr?.containerType ?? "unknown",
        });
      }
    });
    _longTaskObs.observe({ type: "longtask", buffered: true });
  } catch { /* longtask not supported */ }

  // paint — "first-paint" and "first-contentful-paint" (page-level)
  try {
    _paintObs = new PerformanceObserver(list => {
      _paintEntries.push(...list.getEntries());
    });
    _paintObs.observe({ type: "paint", buffered: true });
  } catch { /* paint not supported */ }

  // layout-shift
  try {
    _layoutShiftObs = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const ls = entry as unknown as { value: number; sources?: unknown[] };
        if (ls.value > 0.01) {
          console.warn(
            `%c[PaintProfiler] Layout shift detected: CLS=${ls.value.toFixed(4)} at t=${(entry.startTime - _captureStart).toFixed(1)}ms`,
            "color:#f59e0b;font-weight:bold",
          );
        }
      }
    });
    _layoutShiftObs.observe({ type: "layout-shift", buffered: true });
  } catch { /* layout-shift not supported */ }
}

function _stopObservers() {
  _longTaskObs?.disconnect();  _longTaskObs = null;
  _paintObs?.disconnect();     _paintObs = null;
  _layoutShiftObs?.disconnect(); _layoutShiftObs = null;
}

// ── Report printer ────────────────────────────────────────────────────────────

function _printReport() {
  if (!_captureStart) {
    console.warn("[PaintProfiler] No capture in progress.");
    return;
  }

  _stopCapture();

  const totalFrames   = _frames.length;
  const dropped       = _frames.filter(f => f.isDropped).length;
  const long          = _frames.filter(f => f.isLong).length;
  const worstFrame    = _frames.reduce((m, f) => Math.max(m, f.gapMs), 0);
  const avgFrame      = totalFrames > 0 ? _frames.reduce((s, f) => s + f.gapMs, 0) / totalFrames : 0;

  const report: PaintReport = {
    captureStartMs:  _captureStart,
    mountLatencyMs:  _mountMarkTime,
    firstFrameMs:    _firstFrameTime,
    compositeEstMs:  _compositeEst,
    rasterEstMs:     _rasterEst,
    totalFrames,
    droppedFrames:   dropped,
    longFrames:      long,
    worstFrameMs:    worstFrame,
    avgFrameMs:      avgFrame,
    longTasks:       _longTasks,
    cssAudit:        _cssAudit,
    frames:          _frames,
  };

  // ── Header ────────────────────────────────────────────────────────────────
  console.group(
    "%c[PaintProfiler] ── ChartSettingsSheet Open Report ──",
    "color:#60a5fa;font-weight:bold;font-size:14px",
  );

  // ── Timing summary ────────────────────────────────────────────────────────
  console.group("%c① Timing", "color:#34d399;font-weight:bold");
  console.table([{
    "Mount latency ms":   _mountMarkTime?.toFixed(2)  ?? "not captured",
    "First frame ms":     _firstFrameTime?.toFixed(2) ?? "not captured",
    "Composite est. ms":  _compositeEst?.toFixed(2)   ?? "not captured",
    "Raster est. ms":     _rasterEst?.toFixed(2)      ?? "not captured",
  }]);
  console.groupEnd();

  // ── Frame drop summary ────────────────────────────────────────────────────
  const dropColor = dropped > 0 ? "color:#f87171;font-weight:bold" : "color:#34d399;font-weight:bold";
  console.group(`%c② Frame Drops  —  ${dropped} dropped / ${totalFrames} total  |  worst ${worstFrame.toFixed(1)} ms  |  avg ${avgFrame.toFixed(1)} ms`, dropColor);
  const worstFrames = [..._frames]
    .filter(f => f.isDropped)
    .sort((a, b) => b.gapMs - a.gapMs)
    .slice(0, 10);
  if (worstFrames.length > 0) {
    console.table(worstFrames.map(f => ({
      "RAF t (ms)":   (f.rafTimestamp - _captureStart).toFixed(1),
      "Gap ms":       f.gapMs.toFixed(2),
      "Dropped?":     f.isDropped ? "🔴 YES" : "—",
      "Long (>50ms)?": f.isLong   ? "🔴 YES" : "—",
    })));
  } else {
    console.log("%c  No dropped frames recorded.", "color:#34d399");
  }
  console.groupEnd();

  // ── Long tasks ────────────────────────────────────────────────────────────
  if (_longTasks.length > 0) {
    console.group(`%c③ Long Tasks  —  ${_longTasks.length} task(s) blocked main thread > 50ms`, "color:#f87171;font-weight:bold");
    console.table(_longTasks.map(lt => ({
      "Start t (ms)":    (lt.startTime - _captureStart).toFixed(1),
      "Duration ms":     lt.durationMs.toFixed(2),
      "Attribution":     lt.attribution,
      "Container type":  lt.containerType,
    })));
    console.groupEnd();
  } else {
    console.log("%c③ Long Tasks  —  none (no JS blocking > 50ms detected)", "color:#34d399;font-weight:bold");
  }

  // ── CSS / GPU audit ───────────────────────────────────────────────────────
  if (_cssAudit.length > 0) {
    console.group(`%c④ GPU-Promoting CSS Audit  —  ${_cssAudit.length} element×property pairs  (ranked: backdrop-filter → will-change → filter → box-shadow, then by area)`, "color:#f59e0b;font-weight:bold");
    console.table(_cssAudit.map(e => ({
      "Element":          e.element,
      "CSS property":     e.property,
      "Computed value":   e.computedValue.slice(0, 60),
      "Inline value":     e.inlineValue.slice(0, 40) || "(stylesheet)",
      "Area px²":         e.areaPixels,
      "Rect w×h":         `${e.rect.w}×${e.rect.h}`,
      "position":         e.position,
      "z-index":          e.zIndex,
    })));

    // Highlight the single most expensive entry
    const top = _cssAudit[0];
    if (top) {
      console.log(
        `%c  🔴 TOP HIT: <${top.tagName}> · property="${top.property}" · value="${top.computedValue.slice(0, 80)}" · area=${top.areaPixels}px²`,
        "color:#f87171;font-weight:bold;font-size:12px",
      );
    }
    console.groupEnd();
  } else {
    console.log("%c④ GPU-Promoting CSS Audit  —  no GPU-promoting properties found in live DOM", "color:#34d399;font-weight:bold");
  }

  // ── Performance marks/measures ────────────────────────────────────────────
  try {
    const measures = performance.getEntriesByName("tj_paint_mount_latency");
    const marks    = [
      ...performance.getEntriesByName("tj_paint_sheet_trigger"),
      ...performance.getEntriesByName("tj_paint_sheet_mounted"),
    ];
    if (measures.length > 0 || marks.length > 0) {
      console.group("%c⑤ Performance Marks / Measures", "color:#94a3b8;font-weight:bold");
      [...marks, ...measures].forEach(e => {
        console.log(`  ${e.entryType.padEnd(9)} "${e.name}"  startTime=${e.startTime.toFixed(2)}  duration=${e.duration.toFixed(2)}`);
      });
      console.groupEnd();
    }
  } catch { /* */ }

  console.groupEnd(); // outer group

  // Expose full report on window for further inspection
  (window as unknown as Record<string, unknown>).__tjPaintLastReport = report;
  console.log("%c[PaintProfiler] Full report object → window.__tjPaintLastReport", "color:#94a3b8;font-size:10px");
}

// ── Public API ────────────────────────────────────────────────────────────────

function _stopCapture() {
  if (!_capturing) return;
  _capturing = false;
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
  if (_autoStopTimer !== null) { clearTimeout(_autoStopTimer); _autoStopTimer = null; }
  _stopObservers();
}

function _reset() {
  _stopCapture();
  _captureStart     = 0;
  _mountMarkTime    = null;
  _firstFrameTime   = null;
  _compositeEst     = null;
  _rasterEst        = null;
  _prevRafTs        = null;
  _frames           = [];
  _longTasks        = [];
  _paintEntries     = [];
  _cssAudit         = [];
}

/**
 * Call immediately BEFORE setShowSettings(true).
 * Arms all observers and starts the RAF timing loop.
 */
export function startCapture(): void {
  _reset();
  _captureStart = performance.now();

  // Mark trigger point
  try {
    performance.clearMarks("tj_paint_sheet_trigger");
    performance.mark("tj_paint_sheet_trigger");
  } catch { /* */ }

  _capturing = true;
  _startObservers();
  _prevRafTs = null;
  _rafId = requestAnimationFrame(_rafLoop);

  // Auto-stop + print after CAPTURE_DURATION ms
  _autoStopTimer = setTimeout(() => {
    console.log(
      "%c[PaintProfiler] Capture window ended — printing report…",
      "color:#94a3b8;font-size:11px",
    );
    _printReport();
  }, CAPTURE_DURATION);

  console.log(
    "%c[PaintProfiler] ▶ Capture started. Sheet should open now. Auto-report in 4 s.",
    "color:#34d399;font-weight:bold;font-size:12px",
  );
}

/**
 * Call in ChartSettingsSheet mount useEffect (after React commit).
 * Marks mount latency, runs CSS audit on the live DOM.
 */
export function onSheetMounted(_containerEl?: Element | null): void {
  const now = performance.now();
  _mountMarkTime = now - _captureStart;

  try {
    performance.clearMarks("tj_paint_sheet_mounted");
    performance.mark("tj_paint_sheet_mounted");
    performance.clearMeasures("tj_paint_mount_latency");
    performance.measure("tj_paint_mount_latency", "tj_paint_sheet_trigger", "tj_paint_sheet_mounted");
  } catch { /* */ }

  // DOM walk — runs synchronously after mount commit
  _cssAudit = runCssAudit();

  console.log(
    `%c[PaintProfiler] Sheet mounted at ${_mountMarkTime.toFixed(2)} ms — DOM audit: ${_cssAudit.length} GPU entries found`,
    "color:#60a5fa;font-size:11px",
  );
}

/** Re-runs CSS audit on the current DOM without a full capture. */
export function cssAudit(): CssAuditEntry[] {
  const audit = runCssAudit();
  console.group(`%c[PaintProfiler] Live CSS Audit — ${audit.length} GPU-promoting elements`, "color:#f59e0b;font-weight:bold");
  console.table(audit.map(e => ({
    "Element":        e.element,
    "CSS property":   e.property,
    "Value":          e.computedValue.slice(0, 60),
    "Area px²":       e.areaPixels,
    "Rect w×h":       `${e.rect.w}×${e.rect.h}`,
  })));
  console.groupEnd();
  return audit;
}

/** Prints the last capture report without re-capturing. */
export function report(): void { _printReport(); }

/** Returns current frame data for inspection. */
export function getFrames(): FrameRecord[] { return [..._frames]; }

// ── Window exposure ───────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__tjPaint = {
    startCapture,
    onSheetMounted,
    cssAudit,
    report,
    getFrames,
  };

  console.log(
    "%c[PaintProfiler] ready.\n" +
    "  → window.__tjPaint.startCapture()   — arm capture (auto-fires when sheet opens)\n" +
    "  → window.__tjPaint.cssAudit()       — live DOM GPU-property audit\n" +
    "  → window.__tjPaint.report()         — print last capture\n" +
    "  → window.__tjPaintLastReport        — full report object",
    "color:#60a5fa;font-weight:bold;font-size:11px",
  );
}
