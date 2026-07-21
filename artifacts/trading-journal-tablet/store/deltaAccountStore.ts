/**
 * deltaAccountStore.ts — derived Delta Exchange account snapshot hook.
 *
 * React Native port of src/store/deltaAccountStore.ts
 * ────────────────────────────────────────────────────
 * RN compatibility notes
 * ──────────────────────
 * No modifications required.  This file contains only:
 *   • useMemo — standard React hook, identical in React Native
 *   • useListTrades from @workspace/api-client-react — React Query hook,
 *     works the same in React Native
 *   • useBrokerStore, useTickStore — plain Zustand selectors
 *   • classifyBrokerForSymbol, liveUnrealizedPnlUSD — pure TS functions
 *   • DELTA_FIXED_USD_INR_RATE — number constant
 *
 * No DOM APIs, no localStorage, no browser globals.
 *
 * This file REPLACES the scaffold stub that was written when brokerStore
 * had not yet been migrated.  The implementation is now complete.
 *
 * Logic is preserved exactly from the web original.
 */

import { useMemo } from "react";
import { useListTrades } from "@workspace/api-client-react";
import { useBrokerStore } from "./brokerStore";
import { useTickStore } from "./tickStore";
import { classifyBrokerForSymbol } from "@/lib/brokerClassification";
import { liveUnrealizedPnlUSD } from "@/lib/livePnl";
import type { AccountSnapshot } from "./accountTypes";

// Stable empty-array sentinel used by Zustand selectors below.
// MUST be module-level: `?? []` inside a selector creates a new array reference
// on every call, which fails useSyncExternalStore's Object.is snapshot check
// and causes an infinite re-render loop ("getSnapshot should be cached").
const EMPTY_POSITIONS: never[] = [];

/** Delta Exchange always converts USD → INR at a fixed rate, per product spec. */
export const DELTA_FIXED_USD_INR_RATE = 85;

/**
 * Derived, read-only view of the Delta Exchange account.
 * Pulls from the shared `brokerStore` (which already owns fetching/polling
 * for the "delta" broker key) — no duplicate network requests.
 */
export function useDeltaAccount(): AccountSnapshot {
  const balance   = useBrokerStore(s => s.brokerBalances["delta"] ?? null);
  const status    = useBrokerStore(s => s.brokerStatuses["delta"] ?? "disconnected");
  const account   = useBrokerStore(s => s.connectedAccounts["delta"] ?? null);
  const positions = useBrokerStore(s => s.brokerPositions["delta"] ?? EMPTY_POSITIONS);
  const ticks     = useTickStore(s => s.ticks);
  const { data: tradeRes } = useListTrades({ limit: 500 });

  return useMemo<AccountSnapshot>(() => {
    const availableBalanceUSD    = parseFloat(balance?.availableToWithdraw ?? "0") || 0;
    const walletBalanceUSD       = parseFloat(balance?.walletBalance        ?? "0") || 0;
    // Tick-driven live unrealized PnL — avoids the "stuck" balance snapshot
    // that only refreshes on the 3s REST poll (see brokerStore.ts POLL_INTERVAL).
    const polledUnrealizedPnlUSD = parseFloat(balance?.unrealisedPnl ?? "0") || 0;
    const unrealizedPnlUSD       = liveUnrealizedPnlUSD(positions, ticks, polledUnrealizedPnlUSD);
    const equityFromApi          = parseFloat(balance?.equity ?? "");
    const accountValueUSD        = Number.isFinite(equityFromApi) && balance?.equity
      ? equityFromApi - polledUnrealizedPnlUSD + unrealizedPnlUSD
      : walletBalanceUSD + unrealizedPnlUSD;
    const marginUsedUSD = Math.max(0, walletBalanceUSD - availableBalanceUSD);

    const realizedPnlUSD = (tradeRes?.trades ?? []).reduce((sum: number, t: unknown) => {
      const trade = t as { symbol?: string; exitPrice?: number | null; pnl?: number };
      if (trade.exitPrice == null) return sum;
      if (classifyBrokerForSymbol(trade.symbol) !== "delta") return sum;
      return sum + (trade.pnl ?? 0);
    }, 0);

    return {
      brokerId:         "delta",
      label:            "Delta Exchange",
      isConnected:      !!account && status === "connected",
      connectionStatus: status,
      availableBalanceUSD,
      marginUsedUSD,
      unrealizedPnlUSD,
      realizedPnlUSD,
      accountValueUSD,
      toINR:     (usd: number) => usd * DELTA_FIXED_USD_INR_RATE,
      rateLabel: `Fixed · 1 USD = ₹${DELTA_FIXED_USD_INR_RATE}`,
    };
  }, [balance, status, account, tradeRes, positions, ticks]);
}
