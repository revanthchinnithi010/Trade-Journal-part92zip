/**
 * app/(tabs)/markets.tsx — Markets tab
 *
 * Migration of: artifacts/trading-journal/src/pages/markets.tsx
 *
 * Web → RN replacements:
 *   wouter useLocation / navigate → router.push()  (Expo Router)
 *   useChartStore(s => s.symbol)  → useMarketStore(s => s.activeSymbol)
 *   useChartStore.getState()      → useMarketStore.getState()
 *   div wrapper (position:absolute inset:0, background:#000000)
 *                                 → View flex:1 + black background
 *
 * Business logic, state flow, symbol selection behaviour, watchlist wiring,
 * and navigation intent are preserved exactly from the web original.
 *
 * Symbol selection:
 * - Watchlist tab tap → handleWatchlistTap → sets activeSymbol in marketStore
 *   then navigates to Charts tab via router.push().
 * - Markets tab tap  → handleMarketsSelect → sets activeSymbol only, no navigation.
 *
 * SharedMarketSelector (Phase 5.2) owns all search / filtering / favourites /
 * broker switching / asset-class grouping / market-status badges.
 * This screen is intentionally a thin mount shell, identical to the web.
 */

import { router } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";

import { SharedMarketSelector } from "@/components/SharedMarketSelector";
import { useMarketStore } from "@/store/marketStore";

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function MarketsScreen() {
  // Web: useChartStore(s => s.symbol)
  // RN:  useMarketStore(s => s.activeSymbol)
  const activeSymbol = useMarketStore(s => s.activeSymbol);

  // Watchlist row tap: select symbol then navigate straight to Charts tab.
  // Web: navigate("/charts")
  // RN:  router.push("/(tabs)/charts")
  const handleWatchlistTap = useCallback((symbol: string) => {
    useMarketStore.getState().setActiveSymbol(symbol);
    router.push("/(tabs)/charts" as never);
  }, []);

  // Markets tab row tap: update active symbol only, stay on Markets.
  const handleMarketsSelect = useCallback((symbol: string) => {
    useMarketStore.getState().setActiveSymbol(symbol);
  }, []);

  return (
    <View style={styles.container}>
      <SharedMarketSelector
        mode="page"
        activeSymbol={activeSymbol}
        onSelect={handleMarketsSelect}
        onWatchlistTap={handleWatchlistTap}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Web: div { width:100%; height:100%; background:#000000; overflow:hidden }
  // RN:  flex:1 fills the tab content area provided by expo-router's <Tabs>
  container: {
    flex:            1,
    backgroundColor: "#000000",
  },
});
