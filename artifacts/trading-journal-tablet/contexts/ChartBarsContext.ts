/**
 * ChartBarsContext — provides a stable ref to the current bars array and a
 * replay bar count trigger.
 *
 * React Native port of src/contexts/ChartBarsContext.ts
 * ──────────────────────────────────────────────────────
 * Changes vs the web original:
 *   1. Import path: `@/store/chartStore` resolves to the tablet's chartStore
 *      (same alias, same OHLCBar shape — no type changes).
 *
 * All context API, types, and hook exports are preserved exactly.
 */

import { createContext, useContext } from "react";
import type { OHLCBar } from "@/store/chartStore";

export interface ChartBarsContextValue {
  barsRef: React.MutableRefObject<OHLCBar[]>;
  /** Increments whenever barsRef.current is updated — use as a useEffect dep to react to replay advances */
  replayBarCount: number;
}

const fallbackRef: React.MutableRefObject<OHLCBar[]> = { current: [] };

export const ChartBarsContext = createContext<ChartBarsContextValue>({ barsRef: fallbackRef, replayBarCount: 0 });

export function useChartBars(): ChartBarsContextValue {
  return useContext(ChartBarsContext);
}
