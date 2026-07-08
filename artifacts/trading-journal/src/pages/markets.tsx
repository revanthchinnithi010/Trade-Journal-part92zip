import { useState, useCallback } from "react";
import { useChartStore } from "@/store/chartStore";
import { SharedMarketSelector } from "@/components/SharedMarketSelector";

/**
 * Markets page — full-screen market browser + watchlist.
 *
 * Layout: position:absolute inset:0 so it sits behind the fixed bottom nav bar.
 *
 * Symbol selection:
 * - Watchlist tab tap → onWatchlistTap → sets symbol as active, lazy-mounts the
 *   same SharedMarketSelector sheet used in the Charts mini control bar.
 * - Markets tab tap  → onSelect → just updates chartStore.symbol (no sheet).
 *
 * Sheet lifecycle:
 * - pickerMounted: controls whether the sheet instance exists in the DOM.
 *   Lazy-mount (set true on open) avoids duplicating Delta/cTrader API fetches.
 * - pickerOpen (visible prop): controls sheet visibility / slide animation.
 *   The sheet's own doClose() animates out, then fires onClose → we unmount.
 */
export default function Markets() {
  const chartSymbol = useChartStore(s => s.symbol);

  // Lazy-mount gate: sheet instance is only in the DOM while pickerMounted=true.
  const [pickerMounted, setPickerMounted] = useState(false);
  // Visible prop fed to the sheet — drives open/close animation inside the component.
  const [pickerOpen,    setPickerOpen]    = useState(false);

  // Watchlist row tap: select symbol + open the same sheet picker as Charts.
  const handleWatchlistTap = useCallback((symbol: string) => {
    useChartStore.getState().setSymbol(symbol);
    localStorage.setItem("tv_symbol", symbol);
    setPickerMounted(true);   // mount first (avoids first-render flash)
    setPickerOpen(true);      // triggers sheet open animation
  }, []);

  // Markets tab row tap: select symbol only, no sheet.
  const handleMarketsSelect = useCallback((symbol: string) => {
    useChartStore.getState().setSymbol(symbol);
    localStorage.setItem("tv_symbol", symbol);
  }, []);

  // Sheet symbol picked: update shared state. The sheet itself calls doClose()
  // which animates out and then fires onClose — we don't need to close here.
  const handlePickerSelect = useCallback((symbol: string) => {
    useChartStore.getState().setSymbol(symbol);
    localStorage.setItem("tv_symbol", symbol);
  }, []);

  // Called by the sheet after its close animation completes — safe to unmount.
  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
    setPickerMounted(false);
  }, []);

  return (
    <div style={{
      width: "100%",
      height: "100%",
      background: "#000000",
      overflow: "hidden",
    }}>
      {/* Full-screen market browser (watchlist + all markets) */}
      <SharedMarketSelector
        mode="page"
        activeSymbol={chartSymbol}
        onSelect={handleMarketsSelect}
        onWatchlistTap={handleWatchlistTap}
      />

      {/* Symbol picker popup — lazy-mounted, exact same component as Charts mini
          control bar. Mounts on first Watchlist tap, unmounts after close animation. */}
      {pickerMounted && (
        <SharedMarketSelector
          mode="sheet"
          visible={pickerOpen}
          activeSymbol={chartSymbol}
          onSelect={handlePickerSelect}
          onClose={handlePickerClose}
        />
      )}
    </div>
  );
}
