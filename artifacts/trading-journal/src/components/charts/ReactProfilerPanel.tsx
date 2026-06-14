import { useEffect, useReducer } from "react";
import { createPortal } from "react-dom";
import * as rpStore from "@/lib/reactProfilerStore";
import type { ComponentStats } from "@/lib/reactProfilerStore";

interface Props {
  onClose: () => void;
}

function fmt(ms: number | null): string {
  if (ms === null) return "—";
  return ms.toFixed(2) + " ms";
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 8, fontWeight: 800, padding: "2px 5px", borderRadius: 4,
      background: color + "22", border: `1px solid ${color}55`,
      color, letterSpacing: "0.06em", textTransform: "uppercase",
      marginLeft: 5, verticalAlign: "middle",
    }}>
      {label}
    </span>
  );
}

export default function ReactProfilerPanel({ onClose }: Props) {
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  useEffect(() => rpStore.subscribe(forceUpdate), []);

  const stats = rpStore.getStats();
  const slowest = stats.length > 0
    ? stats.reduce((a, b) => (b.peakActualMs > a.peakActualMs ? b : a))
    : null;

  const panel = (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.82)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    }}>
      <div style={{
        width: "min(98vw, 860px)",
        maxHeight: "90vh",
        background: "#0c0e14",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 16,
        boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 14, color: "#a78bfa", fontWeight: 800 }}>⚛ React Profiler</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", flex: 1 }}>
            {stats.length === 0
              ? "Open Chart Settings to collect data"
              : `${stats.length} component${stats.length > 1 ? "s" : ""} tracked`}
          </span>
          <button
            onClick={() => rpStore.clearStats()}
            style={{
              padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700,
              background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
              color: "#f87171", cursor: "pointer",
            }}
          >
            Clear
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "5px 12px", borderRadius: 7, fontSize: 10, fontWeight: 700,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.6)", cursor: "pointer",
            }}
          >
            ✕ Close
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 0 12px" }}>

          {/* Legend */}
          <div style={{
            padding: "10px 18px 6px",
            fontSize: 9, color: "rgba(255,255,255,0.3)",
            letterSpacing: "0.06em",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            display: "flex", gap: 24,
          }}>
            <span>MOUNT MS — actual render time on first mount</span>
            <span>RENDERS — update commits after mount</span>
            <span>LAST MS — most recent commit duration</span>
            <span>PEAK MS — worst single commit</span>
          </div>

          {stats.length === 0 ? (
            <div style={{
              padding: "40px 20px", textAlign: "center",
              color: "rgba(255,255,255,0.25)", fontSize: 11,
            }}>
              No profiler data yet.<br />
              <span style={{ fontSize: 9, marginTop: 6, display: "block" }}>
                Open Chart Settings (desktop) or tap the gear icon (mobile) to instrument a render cycle.
              </span>
            </div>
          ) : (
            <table style={{
              width: "100%", borderCollapse: "collapse",
              fontSize: 11, color: "rgba(255,255,255,0.82)",
            }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                  {["Component", "Mounts", "Mount ms", "Renders", "Last ms", "Peak ms"].map(h => (
                    <th key={h} style={{
                      padding: "8px 14px", textAlign: "left",
                      fontSize: 9, fontWeight: 700,
                      color: "rgba(255,255,255,0.35)",
                      letterSpacing: "0.08em", textTransform: "uppercase",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...stats]
                  .sort((a, b) => b.peakActualMs - a.peakActualMs)
                  .map((s: ComponentStats, i) => {
                    const isSlowest = slowest?.id === s.id;
                    const rowBg = isSlowest
                      ? "rgba(251,191,36,0.05)"
                      : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)";
                    return (
                      <tr key={s.id} style={{ background: rowBg }}>

                        {/* Component name */}
                        <td style={{ padding: "9px 14px", fontWeight: 700, whiteSpace: "nowrap" }}>
                          <span style={{ color: isSlowest ? "#fbbf24" : "#a78bfa" }}>
                            {s.id}
                          </span>
                          {isSlowest && <Badge label="🏆 slowest" color="#fbbf24" />}
                          {s.lastPhase === "mount" && (
                            <Badge label="just mounted" color="#34d399" />
                          )}
                        </td>

                        {/* Mounts */}
                        <td style={{ padding: "9px 14px", color: "#34d399" }}>
                          {s.mountDuration !== null ? "1" : "0"}
                        </td>

                        {/* Mount ms */}
                        <td style={{
                          padding: "9px 14px",
                          color: mountColor(s.mountDuration),
                          fontWeight: s.mountDuration !== null && s.mountDuration > 10 ? 700 : 400,
                        }}>
                          {fmt(s.mountDuration)}
                        </td>

                        {/* Renders (update count) */}
                        <td style={{
                          padding: "9px 14px",
                          color: s.renderCount > 0 ? "#fb923c" : "rgba(255,255,255,0.4)",
                        }}>
                          {s.renderCount}
                        </td>

                        {/* Last ms */}
                        <td style={{
                          padding: "9px 14px",
                          color: commitColor(s.lastActualMs),
                        }}>
                          {fmt(s.lastActualMs)}
                        </td>

                        {/* Peak ms */}
                        <td style={{
                          padding: "9px 14px",
                          color: commitColor(s.peakActualMs),
                          fontWeight: isSlowest ? 800 : 600,
                        }}>
                          {fmt(s.peakActualMs)}
                          {s.peakActualMs > 16 && (
                            <Badge
                              label={s.peakActualMs > 50 ? "jank" : ">1 frame"}
                              color={s.peakActualMs > 50 ? "#f87171" : "#fb923c"}
                            />
                          )}
                        </td>

                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}

          {/* ── Summary callout ── */}
          {slowest && (
            <div style={{
              margin: "14px 18px 0",
              padding: "12px 16px",
              background: "rgba(251,191,36,0.06)",
              border: "1px solid rgba(251,191,36,0.2)",
              borderRadius: 10,
              fontSize: 11,
            }}>
              <span style={{ color: "#fbbf24", fontWeight: 800 }}>🏆 Slowest:</span>
              {" "}
              <span style={{ color: "rgba(255,255,255,0.8)" }}>
                <strong style={{ color: "#a78bfa" }}>{slowest.id}</strong>
                {" — "}
                Mount: <strong>{fmt(slowest.mountDuration)}</strong>
                {" · "}
                Peak commit: <strong style={{ color: commitColor(slowest.peakActualMs) }}>
                  {fmt(slowest.peakActualMs)}
                </strong>
                {" · "}
                Total updates: <strong>{slowest.renderCount}</strong>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

function mountColor(ms: number | null): string {
  if (ms === null) return "rgba(255,255,255,0.3)";
  if (ms > 50)  return "#f87171";
  if (ms > 16)  return "#fb923c";
  if (ms > 5)   return "#fbbf24";
  return "#34d399";
}

function commitColor(ms: number): string {
  if (ms > 50)  return "#f87171";
  if (ms > 16)  return "#fb923c";
  if (ms > 5)   return "#fbbf24";
  return "#34d399";
}
