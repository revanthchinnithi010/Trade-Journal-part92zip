/**
 * ChartContext — provides chart and candle series refs to chart consumers.
 *
 * React Native port of src/contexts/ChartContext.tsx
 * ──────────────────────────────────────────────────
 * Web API replacement: `lightweight-charts` is a DOM/canvas library that is
 * not available in React Native / Hermes.  The web original imports
 * `IChartApi` and `ISeriesApi` directly from that package.
 *
 * RN approach:
 *   - Both types are defined locally as minimal structural stubs.
 *   - The stub shapes preserve the type identity (name + generic slot) so
 *     that all consumers continue to compile without modification.
 *   - The stubs are intentionally thin — they will be expanded in future
 *     chart-rendering phases as concrete methods are consumed.
 *   - `IChartApi` and `ISeriesApi` are exported so that other files that
 *     previously imported them from `lightweight-charts` (e.g. chartApiRef)
 *     can import from this module instead.
 *
 * All exported context APIs, interface names, hook signatures, and default
 * values are preserved exactly.
 */

import { createContext, useContext } from "react";

// ── LWC type stubs ────────────────────────────────────────────────────────────

/**
 * Minimal structural stub for lightweight-charts `IChartApi`.
 *
 * On web this interface is satisfied by the LWC chart object returned by
 * `createChart()`.  On React Native the chart implementation will be
 * supplied by the chart-rendering phase; until then the context holds null.
 *
 * The `_brand` discriminant prevents accidental structural compatibility with
 * unrelated objects and makes the type easy to search for at refactor time.
 */
export interface IChartApi {
  readonly _brand: "IChartApi";
}

/**
 * Minimal structural stub for lightweight-charts `ISeriesApi<T>`.
 *
 * The generic type parameter `T` preserves the same slot used by the web
 * version so that `ISeriesApi<"Candlestick">` compiles identically.
 */
export interface ISeriesApi<T extends string = string> {
  readonly _brand: "ISeriesApi";
  readonly _seriesType: T;
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface ChartContextValue {
  chart:  IChartApi | null;
  candle: ISeriesApi<"Candlestick"> | null;
}

export const ChartContext = createContext<ChartContextValue>({ chart: null, candle: null });

export function useChartContext(): ChartContextValue {
  return useContext(ChartContext);
}
