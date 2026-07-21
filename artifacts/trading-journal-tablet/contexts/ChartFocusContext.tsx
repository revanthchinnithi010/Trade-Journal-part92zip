/**
 * ChartFocusContext — provides a callback to open the chart sidebar.
 *
 * React Native port of src/contexts/ChartFocusContext.tsx
 * ─────────────────────────────────────────────────────────
 * No modifications — pure React context with no DOM APIs, no browser
 * globals, and no platform-specific dependencies.  createContext /
 * useContext are identical on web and React Native.
 */

import { createContext, useContext } from "react";

interface ChartFocusContextValue {
  openSidebar: () => void;
}

export const ChartFocusContext = createContext<ChartFocusContextValue>({
  openSidebar: () => {},
});

export function useChartFocusMode() {
  return useContext(ChartFocusContext);
}
