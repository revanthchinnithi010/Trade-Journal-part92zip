/**
 * WatchlistContext — thin bridge over the global Zustand watchlist store.
 *
 * React Native port of src/contexts/WatchlistContext.tsx
 * ──────────────────────────────────────────────────────
 * No functional changes. WatchlistProvider triggers the initial API refresh;
 * useWatchlist() is a pass-through to useBrokerWatchlistStore().
 */

import { useEffect, type ReactNode } from "react";
import {
  useBrokerWatchlistStore,
  SYMBOL_CATALOG,
  deriveMeta,
} from "@/store/brokerWatchlistStore";

// ── Re-exports for backward compatibility ─────────────────────────────────
export type { WatchlistEntry, CatalogEntry, Market } from "@/store/brokerWatchlistStore";
export { SYMBOL_CATALOG, deriveMeta } from "@/store/brokerWatchlistStore";

// ── useWatchlist — thin hook over the global Zustand store ─────────────────
export function useWatchlist() {
  return useBrokerWatchlistStore();
}

// ── WatchlistProvider — triggers initial load, no React state ─────────────
export function WatchlistProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const { items, loading, refresh } = useBrokerWatchlistStore.getState();
    if (loading && items.length === 0) {
      // Small delay so the app shell renders first
      const id = setTimeout(() => { refresh(); }, 1500);
      return () => clearTimeout(id);
    }
  }, []);

  return <>{children}</>;
}

// ── Keep BrokerWatchlistState type exported for convenience ───────────────
export type { BrokerWatchlistState as WatchlistContextValue } from "@/store/brokerWatchlistStore";
