import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { run as runPerfTests, type TestResult as PerfTestResult } from "@/lib/perfTestRunner";

type BenchState =
  | { phase: "idle" }
  | { phase: "running"; configIndex: number; total: number; configName: string }
  | { phase: "done"; results: PerfTestResult[] };

const fpsColor  = (fps: number) => fps >= 55 ? "#34d399" : fps >= 30 ? "#f59e0b" : "#f87171";
const dropColor = (n: number)   => n === 0 ? "#34d399" : n <= 3 ? "#f59e0b" : "#f87171";
const worstColor = (ms: number) => ms < 20 ? "#34d399" : ms < 50 ? "#f59e0b" : "#f87171";
const fmt = (v: number | null, decimals = 1) => v == null ? "—" : v.toFixed(decimals);

export function PerfBenchmarkPanel({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<BenchState>({ phase: "idle" });

  const run = useCallback(async () => {
    setState({ phase: "running", configIndex: 0, total: 4, configName: "1. Baseline (all enabled)" });
    const results = await runPerfTests((configIndex, total, configName) => {
      setState({ phase: "running", configIndex, total, configName });
    });
    setState({ phase: "done", results });
  }, []);

  const baseline = state.phase === "done" ? state.results[0] : null;

  const scored = state.phase === "done" && state.results.length > 1
    ? state.results.slice(1).map(r => ({
        name: r.name,
        score: (baseline!.droppedFrames - r.droppedFrames) * 5
             + (baseline!.worstFrameMs  - r.worstFrameMs)  * 0.5
             + (r.fps                   - baseline!.fps)    * 2
             + (baseline!.longTaskMs    - r.longTaskMs)     * 0.1,
      })).sort((a, b) => b.score - a.score)
    : [];

  const rankOf = (name: string) => {
    const i = scored.findIndex(s => s.name === name);
    return i === -1 ? null : { rank: i + 1, score: scored[i].score };
  };

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.88)",
      display: "flex", flexDirection: "column",
      fontFamily: "ui-monospace,SFMono-Regular,monospace",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px 12px",
        background: "rgba(10,12,20,0.99)",
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#60a5fa", letterSpacing: "0.04em" }}>
          ⚡ Performance Benchmark
        </span>
        <button onClick={onClose} style={{
          padding: "5px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600,
          background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.30)",
          color: "#f87171", cursor: "pointer",
        }}>✕ Close</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 32px", maxWidth: 640, width: "100%" }}>

        {/* ── Idle ── */}
        {state.phase === "idle" && (
          <>
            <div style={{
              padding: "12px 14px", borderRadius: 10, marginBottom: 14,
              background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.20)",
              color: "rgba(255,255,255,0.50)", fontSize: 11, lineHeight: 1.7,
            }}>
              Opens Chart Settings 4× with different flag combos.
              Takes ~16 s total. Do not interact with the app during the run.
            </div>
            <button onClick={run} style={{
              width: "100%", padding: "16px", borderRadius: 10,
              background: "rgba(96,165,250,0.14)", border: "1.5px solid rgba(96,165,250,0.40)",
              color: "#60a5fa", fontSize: 14, fontWeight: 700, cursor: "pointer",
              letterSpacing: "0.03em",
            }}>
              ▶ Run Performance Test
            </button>
          </>
        )}

        {/* ── Running ── */}
        {state.phase === "running" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{
              padding: "14px 16px", borderRadius: 10,
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.28)",
              color: "#f59e0b", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <span style={{ fontSize: 24 }}>⏱</span>
              <div>
                <div>Running {state.configIndex + 1} / {state.total}</div>
                <div style={{ fontSize: 11, fontWeight: 400, color: "rgba(255,255,255,0.45)", marginTop: 3 }}>
                  {state.configName}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {Array.from({ length: state.total }, (_, i) => (
                <div key={i} style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: i < state.configIndex
                    ? "#34d399"
                    : i === state.configIndex
                      ? "#f59e0b"
                      : "rgba(255,255,255,0.15)",
                  transition: "background 0.3s",
                }} />
              ))}
            </div>
            <div style={{ color: "rgba(255,255,255,0.28)", fontSize: 11 }}>
              ⚠ Do not touch the app — sheet will open and close automatically
            </div>
          </div>
        )}

        {/* ── Done ── */}
        {state.phase === "done" && (
          <>
            <button onClick={run} style={{
              width: "100%", padding: "10px", borderRadius: 8, marginBottom: 14,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>
              ↺ Re-run
            </button>

            {state.results.map((r, idx) => {
              const isBase = idx === 0;
              const rk = isBase ? null : rankOf(r.name);
              const shortName = r.name.replace(/^\d+\.\s*/, "");

              type MetricEntry = {
                label: string;
                value: string;
                color: string;
                delta: number | null;
                higherBetter: boolean;
              };

              const metrics: MetricEntry[] = [
                { label: "FPS",          value: String(r.fps),           color: fpsColor(r.fps),             delta: isBase ? null : r.fps - baseline!.fps,                                                                              higherBetter: true  },
                { label: "Dropped",      value: String(r.droppedFrames), color: dropColor(r.droppedFrames),  delta: isBase ? null : r.droppedFrames - baseline!.droppedFrames,                                                          higherBetter: false },
                { label: "Worst ms",     value: fmt(r.worstFrameMs),     color: worstColor(r.worstFrameMs),  delta: isBase ? null : r.worstFrameMs - baseline!.worstFrameMs,                                                            higherBetter: false },
                { label: "Paint ms",     value: fmt(r.paintMs),          color: "rgba(255,255,255,0.75)",    delta: isBase ? null : (r.paintMs     != null && baseline!.paintMs     != null ? r.paintMs     - baseline!.paintMs     : null), higherBetter: false },
                { label: "Composite ms", value: fmt(r.compositeMs),      color: "rgba(255,255,255,0.75)",    delta: isBase ? null : (r.compositeMs  != null && baseline!.compositeMs  != null ? r.compositeMs  - baseline!.compositeMs  : null), higherBetter: false },
                { label: "Raster ms",    value: fmt(r.rasterMs),         color: "rgba(255,255,255,0.75)",    delta: isBase ? null : (r.rasterMs    != null && baseline!.rasterMs    != null ? r.rasterMs    - baseline!.rasterMs    : null), higherBetter: false },
              ];

              return (
                <div key={r.name} style={{
                  borderRadius: 10, marginBottom: 10, overflow: "hidden",
                  background: isBase
                    ? "rgba(96,165,250,0.07)"
                    : rk && rk.score > 0 ? "rgba(52,211,153,0.06)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${
                    isBase ? "rgba(96,165,250,0.22)"
                    : rk && rk.score > 0 ? "rgba(52,211,153,0.20)" : "rgba(255,255,255,0.08)"
                  }`,
                }}>
                  {/* Card header */}
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 12px 7px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: isBase ? "#60a5fa" : rk && rk.score > 0 ? "#34d399" : "#e2e8f0",
                    }}>
                      {isBase ? "① Baseline" : shortName}
                    </span>
                    {!isBase && rk && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                        background: rk.score > 0 ? "rgba(52,211,153,0.18)" : rk.score < 0 ? "rgba(248,113,113,0.15)" : "rgba(255,255,255,0.07)",
                        color: rk.score > 0 ? "#34d399" : rk.score < 0 ? "#f87171" : "rgba(255,255,255,0.40)",
                      }}>
                        {rk.score > 0 ? `✅ #${rk.rank} best` : rk.score < 0 ? "❌ worse" : "➖ same"}
                        {" "}(score {rk.score > 0 ? "+" : ""}{rk.score.toFixed(1)})
                      </span>
                    )}
                  </div>

                  {/* Metric grid */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 1, background: "rgba(255,255,255,0.04)",
                  }}>
                    {metrics.map(m => (
                      <div key={m.label} style={{
                        background: "rgba(10,12,20,0.70)",
                        padding: "9px 10px 8px",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: m.color, lineHeight: 1 }}>
                          {m.value}
                        </div>
                        {m.delta != null && (
                          <div style={{
                            fontSize: 9, fontWeight: 600,
                            color: (m.higherBetter ? m.delta > 0 : m.delta < 0)
                              ? "#34d399"
                              : m.delta === 0 ? "rgba(255,255,255,0.25)" : "#f87171",
                          }}>
                            {m.delta > 0 ? "+" : ""}{m.delta.toFixed(1)}
                          </div>
                        )}
                        <div style={{
                          fontSize: 8, color: "rgba(255,255,255,0.28)",
                          textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center",
                        }}>
                          {m.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Ranking summary */}
            {scored.length > 0 && (
              <div style={{
                marginTop: 6, padding: "12px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.30)",
                  textTransform: "uppercase", letterSpacing: "0.10em", marginBottom: 8,
                }}>
                  Improvement Ranking
                </div>
                {scored.map((s, i) => (
                  <div key={s.name} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 0",
                    borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
                  }}>
                    <span style={{ fontSize: 11, color: s.score > 0 ? "#34d399" : s.score < 0 ? "#f87171" : "rgba(255,255,255,0.35)" }}>
                      {s.score > 0 ? "✅" : s.score < 0 ? "❌" : "➖"}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.65)" }}>
                      #{i + 1} {s.name.replace(/^\d+\.\s*/, "")}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: s.score > 0 ? "#34d399" : s.score < 0 ? "#f87171" : "rgba(255,255,255,0.30)",
                    }}>
                      {s.score > 0 ? "+" : ""}{s.score.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
