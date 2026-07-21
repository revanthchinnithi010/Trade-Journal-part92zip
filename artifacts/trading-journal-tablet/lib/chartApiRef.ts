/**
 * chartApiRef — module-level ref to the active IChartApi instance.
 *
 * React Native port of src/lib/chartApiRef.ts
 * ────────────────────────────────────────────
 * Web API replacement: the web original imports `IChartApi` from
 * `lightweight-charts` (a DOM/canvas library unavailable on React Native).
 *
 * RN change: `IChartApi` is imported from the local stub defined in
 * `@/contexts/ChartContext`, which preserves the identical type shape.
 *
 * The exported API — `chartApiRef: { current: IChartApi | null }` — is
 * preserved exactly.
 */

import type { IChartApi } from "@/contexts/ChartContext";

export const chartApiRef: { current: IChartApi | null } = { current: null };
