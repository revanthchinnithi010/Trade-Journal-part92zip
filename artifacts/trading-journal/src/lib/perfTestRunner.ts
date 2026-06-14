// ── Automated Performance Test Runner ────────────────────────────────────────
//
// Runs 4 configurations of ChartSettingsSheet open and captures perf metrics.
// Each test: set flags → wait for React → arm capture → open sheet → 2.5s → close
//
// Usage:
//   window.__tjPerfTest.run()     — start all 4 tests (~16s total)
//   window.__tjPerfResults        — raw results array after completion

import * as perfFlags from "@/lib/perfFlags";
import * as paintProfiler from "@/lib/paintProfiler";
import type { PaintReport } from "@/lib/paintProfiler";

// ── Config table ──────────────────────────────────────────────────────────────

const CONFIGS: Array<{
  name:  string;
  flags: Partial<typeof perfFlags.getFlags extends () => infer R ? R : never>;
}> = [
  { name: "1. Baseline (all enabled)",    flags: {} },
  { name: "2. Shadow disabled",           flags: { PERF_DISABLE_SHEET_SHADOW:  true } },
  { name: "3. Mesh blobs disabled",       flags: { PERF_DISABLE_MESH_BLOBS:    true } },
  { name: "4. Backdrop blur disabled",    flags: { PERF_DISABLE_BACKDROP_BLUR: true } },
];

const CAPTURE_MS       = 2500;
const POST_CLOSE_MS    = 800;
const PRE_OPEN_WAIT_MS = 400;

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

interface TestResult {
  name:            string;
  fps:             number;
  droppedFrames:   number;
  longFrames:      number;
  worstFrameMs:    number;
  avgFrameMs:      number;
  paintMs:         number | null;
  compositeMs:     number | null;
  rasterMs:        number | null;
  mountLatencyMs:  number | null;
  totalFrames:     number;
  longTaskMs:      number;
}

function extractMetrics(report: PaintReport, name: string): TestResult {
  const totalGapMs  = report.frames.reduce((s, f) => s + f.gapMs, 0) || 1;
  const fps         = report.totalFrames > 0
    ? Math.round((report.totalFrames / totalGapMs) * 1000)
    : 0;
  const longTaskMs  = report.longTasks.reduce((s, t) => s + t.durationMs, 0);

  return {
    name,
    fps,
    droppedFrames:   report.droppedFrames,
    longFrames:      report.longFrames,
    worstFrameMs:    report.worstFrameMs,
    avgFrameMs:      report.avgFrameMs,
    paintMs:         report.firstFrameMs,
    compositeMs:     report.compositeEstMs,
    rasterMs:        report.rasterEstMs,
    mountLatencyMs:  report.mountLatencyMs,
    totalFrames:     report.totalFrames,
    longTaskMs,
  };
}

function openSheet(): boolean {
  const fn = (window as unknown as Record<string, unknown>).__tjOpenSettings;
  if (typeof fn === "function") { (fn as () => void)(); return true; }
  const btn = document.querySelector<HTMLButtonElement>('button[title="Chart Settings"]');
  if (btn) { btn.click(); return true; }
  return false;
}

function closeSheet(): void {
  const fn = (window as unknown as Record<string, unknown>).__tjCloseSettings;
  if (typeof fn === "function") (fn as () => void)();
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runPerfTests(
  onProgress?: (configIndex: number, total: number, configName: string) => void,
): Promise<TestResult[]> {
  console.group(
    "%c[PerfTestRunner] ── Automated 4-Config Perf Test ──",
    "color:#60a5fa;font-weight:bold;font-size:14px",
  );
  console.log(`Each config: set flags → ${PRE_OPEN_WAIT_MS}ms settle → open sheet → ${CAPTURE_MS}ms capture → close → ${POST_CLOSE_MS}ms gap`);
  console.log("%c⚠️  Do NOT touch the app while tests are running.", "color:#f87171;font-weight:bold");
  console.groupEnd();

  const results: TestResult[] = [];

  // Ensure sheet is closed before starting
  closeSheet();
  await sleep(POST_CLOSE_MS);

  for (let i = 0; i < CONFIGS.length; i++) {
    const cfg = CONFIGS[i];
    onProgress?.(i, CONFIGS.length, cfg.name);
    console.log(
      `%c[PerfTestRunner] ▶ [${i + 1}/${CONFIGS.length}] ${cfg.name}`,
      "color:#f59e0b;font-weight:bold",
    );

    // STEP 1 ── set flags
    console.log(`%c  [step 1] resetFlags + setFlags`, "color:#94a3b8;font-size:11px");
    perfFlags.resetFlags();
    perfFlags.setFlags(cfg.flags as Parameters<typeof perfFlags.setFlags>[0]);

    console.log(`%c  [step 1] sleeping ${PRE_OPEN_WAIT_MS}ms for React settle…`, "color:#94a3b8;font-size:11px");
    await sleep(PRE_OPEN_WAIT_MS);
    console.log(`%c  [step 1] settle done`, "color:#94a3b8;font-size:11px");

    // STEP 2 ── arm async profiler
    console.log(`%c  [step 2] startCaptureAsync(${CAPTURE_MS})`, "color:#94a3b8;font-size:11px");
    const capturePromise = paintProfiler.startCaptureAsync(CAPTURE_MS);
    console.log(`%c  [step 2] capturePromise armed`, "color:#94a3b8;font-size:11px");

    // STEP 3 ── open sheet
    console.log(`%c  [step 3] calling openSheet()…`, "color:#94a3b8;font-size:11px");
    const opened = openSheet();
    console.log(`%c  [step 3] openSheet() returned: ${opened}`, opened ? "color:#34d399;font-size:11px" : "color:#f87171;font-weight:bold;font-size:11px");
    if (!opened) {
      console.error("[PerfTestRunner] Cannot find Chart Settings button — aborting.");
      console.error("  Checked: window.__tjOpenSettings and button[title='Chart Settings'] — both missing.");
      perfFlags.resetFlags();
      return [];
    }

    // STEP 4 ── await profiler resolve
    console.log(`%c  [step 4] awaiting capturePromise (${CAPTURE_MS}ms window)…`, "color:#94a3b8;font-size:11px");
    const t4start = performance.now();
    const report = await capturePromise;
    console.log(`%c  [step 4] capturePromise resolved after ${(performance.now() - t4start).toFixed(0)}ms`, "color:#34d399;font-size:11px");

    results.push(extractMetrics(report, cfg.name));
    console.log(`%c[PerfTestRunner] ✔ [${i + 1}/${CONFIGS.length}] "${cfg.name}" done`, "color:#34d399;font-weight:bold");

    // STEP 5 ── close sheet
    console.log(`%c  [step 5] closeSheet + sleeping ${POST_CLOSE_MS}ms`, "color:#94a3b8;font-size:11px");
    closeSheet();
    await sleep(POST_CLOSE_MS);
    console.log(`%c  [step 5] gap done — starting next config`, "color:#94a3b8;font-size:11px");
  }

  // Restore flags
  perfFlags.resetFlags();

  _printComparisonTable(results);
  return results;
}

// ── Table printer ─────────────────────────────────────────────────────────────

function _printComparisonTable(results: TestResult[]): void {
  if (results.length === 0) { console.warn("[PerfTestRunner] No results."); return; }

  const baseline = results[0];

  const fmtDelta = (delta: number, higherIsBetter = false, unit = "") => {
    if (delta === 0) return "—";
    const improved = higherIsBetter ? delta > 0 : delta < 0;
    const sign = delta > 0 ? "+" : "";
    return `${improved ? "✅" : "❌"} ${sign}${delta.toFixed(1)}${unit}`;
  };

  console.group(
    "%c[PerfTestRunner] ── Comparison Results ──",
    "color:#60a5fa;font-weight:bold;font-size:14px",
  );

  console.table(results.map(r => {
    const isBase = r === baseline;
    return {
      "Configuration":      r.name,
      "FPS":                r.fps,
      "FPS Δ":              isBase ? "baseline" : fmtDelta(r.fps - baseline.fps, true),
      "Dropped frames":     r.droppedFrames,
      "Dropped Δ":          isBase ? "baseline" : fmtDelta(r.droppedFrames - baseline.droppedFrames),
      "Worst frame ms":     r.worstFrameMs.toFixed(1),
      "Worst Δ ms":         isBase ? "baseline" : fmtDelta(r.worstFrameMs - baseline.worstFrameMs),
      "Paint ms":           r.paintMs?.toFixed(2)       ?? "—",
      "Paint Δ ms":         isBase ? "baseline" : (r.paintMs != null && baseline.paintMs != null ? fmtDelta(r.paintMs - baseline.paintMs) : "—"),
      "Composite ms":       r.compositeMs?.toFixed(2)   ?? "—",
      "Raster est ms":      r.rasterMs?.toFixed(2)      ?? "—",
      "Mount latency ms":   r.mountLatencyMs?.toFixed(2) ?? "—",
    };
  }));

  // Composite improvement score (higher = better)
  const nonBaseline = results.slice(1);
  if (nonBaseline.length > 0) {
    const scored = nonBaseline.map(r => ({
      name:  r.name,
      score: (baseline.droppedFrames - r.droppedFrames) * 5   // heaviest weight: drops
           + (baseline.worstFrameMs  - r.worstFrameMs)  * 0.5
           + (r.fps                  - baseline.fps)     * 2
           + (baseline.longTaskMs    - r.longTaskMs)     * 0.1,
    })).sort((a, b) => b.score - a.score);

    const best = scored[0];
    const bestResult = results.find(r => r.name === best.name)!;

    console.log(""); // blank line before summary

    if (best.score > 0) {
      console.log(
        `%c🏆  BIGGEST WIN:  "${best.name}"`,
        "color:#34d399;font-weight:bold;font-size:13px",
      );
      const lines: string[] = [];
      if (bestResult.droppedFrames < baseline.droppedFrames)
        lines.push(`    dropped frames: ${baseline.droppedFrames} → ${bestResult.droppedFrames}  (${baseline.droppedFrames - bestResult.droppedFrames} fewer)`);
      if (bestResult.worstFrameMs < baseline.worstFrameMs)
        lines.push(`    worst frame:    ${baseline.worstFrameMs.toFixed(1)} → ${bestResult.worstFrameMs.toFixed(1)} ms`);
      if (bestResult.fps > baseline.fps)
        lines.push(`    fps:            ${baseline.fps} → ${bestResult.fps}`);
      if (lines.length) console.log(lines.join("\n"));

      // Remaining sorted list
      console.log("  Improvement ranking:");
      scored.forEach((s, idx) => {
        const indicator = s.score > 0 ? "✅" : (s.score === 0 ? "➖" : "❌");
        console.log(`    ${idx + 1}. ${indicator}  ${s.name}  (score ${s.score > 0 ? "+" : ""}${s.score.toFixed(1)})`);
      });
    } else {
      console.log(
        "%c⚠️  No configuration outperformed baseline. Perf is bottlenecked elsewhere.",
        "color:#f59e0b;font-weight:bold;font-size:13px",
      );
    }
  }

  console.log("\n%c  → window.__tjPerfResults   raw data array", "color:#94a3b8;font-size:10px");
  console.groupEnd();

  (window as unknown as Record<string, unknown>).__tjPerfResults = results;
}

// ── Window exposure ───────────────────────────────────────────────────────────

if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__tjPerfTest = {
    run: runPerfTests,
    configs: CONFIGS.map(c => c.name),
  };

  console.log(
    "%c[PerfTestRunner] ready.\n" +
    "  → window.__tjPerfTest.run()   — run all 4 tests (~16 s)\n" +
    "  → window.__tjPerfResults      — results after completion",
    "color:#f59e0b;font-weight:bold;font-size:11px",
  );
}

export type { TestResult };
export { runPerfTests as run };
