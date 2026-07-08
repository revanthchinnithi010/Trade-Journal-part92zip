import { useCallback } from "react";
import { useLocation } from "wouter";
import { useChartStore } from "@/store/chartStore";
import { SharedMarketSelector } from "@/components/SharedMarketSelector";

/**
 * Markets page — full-screen market browser + watchlist.
 *
 * Layout: position:absolute inset:0 so it sits behind the fixed bottom nav bar.
 *
 * Symbol selection:
 * - Watchlist tab tap → onWatchlistTap → sets symbol in chartStore then navigates
 *   directly to /charts. No secondary sheet is opened.
 * - Markets tab tap  → onSelect → just updates chartStore.symbol (no navigation).
 */
export default function Markets() {
  const chartSymbol = useChartStore(s => s.symbol);
  const [, navigate] = useLocation();

  // Watchlist row tap: select symbol then go straight to the Charts page.
  // No secondary sheet — the chart will read the updated symbol from chartStore.
  const handleWatchlistTap = useCallback((symbol: string) => {
    useChartStore.getState().setSymbol(symbol); // also persists to localStorage internally
    navigate("/charts");
  }, [navigate]);

  // Markets tab row tap: select symbol only, stay on Markets.
  const handleMarketsSelect = useCallback((symbol: string) => {
    useChartStore.getState().setSymbol(symbol); // also persists to localStorage internally
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
    </div>
  );
}
