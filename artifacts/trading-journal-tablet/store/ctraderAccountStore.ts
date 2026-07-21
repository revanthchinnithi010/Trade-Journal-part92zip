/**
 * ctraderAccountStore.ts — derived cTrader account snapshot hook.
 *
 * React Native port of src/store/ctraderAccountStore.ts
 * ──────────────────────────────────────────────────────
 * RN compatibility notes
 * ──────────────────────
 * No modifications required.  This file contains only:
 *   • useMemo — standard React hook, identical in React Native
 *   • useListTrades from @workspace/api-client-react — React Query hook
 *   • useBrokerStore, useTickStore, useCurrencyStore — plain Zustand selectors
 *   • classifyBrokerForSymbol, liveUnrealizedPnlUSD — pure TS functions
 *
 * No DOM APIs, no localStorage, no browser globals.
 *
 * Unlike Delta, cTrader converts USD → INR using the LIVE market rate
 * (currencyStore.exchangeRate), which auto-updates whenever the rate refreshes.
 *
 * This file REPLACES the scaffold stub that was written when brokerStore
 * had not yet been migrated.  The implementation is now complete.
 *
 * Logic is preserved exactly from the web original.
 */

import { useMemo } from "react";
import { useListTrades } from "@workspace/api-client-react";
import { useBrokerStore } from "./brokerStore";
import { useCurrencyStore } from "./currencyStore";
import { useTickStore } from "./tickStore";
import { classifyBrokerForSymbol } from "@/lib/brokerClassification";
import { liveUnrealizedPnlUSD } from "@/lib/livePnl";
import type { AccountSnapshot } from "./accountTypes";

// Stable empty-array sentinel — same rationale as deltaAccountStore.ts:
// `?? []` inside a Zustand selector returns a new array reference on every
// call when the key is absent, which breaks useSyncExternalStore's
// Object.is snapshot comparison and causes an infinite re-render loop.
const EMPTY_POSITIONS: never[] = [];

/**
 * Derived, read-only view of the cTrader account.
 * Unlike Delta, cTrader converts USD → INR using the LIVE market rate
 * (currencyStore.exchangeRate), which auto-updates whenever the rate refreshes.
 */
export function useCtraderAccount(): AccountSnapshot {
  const balance   = useBrokerStore(s => s.brokerBalances["ctrader"] ?? null);
  const status    = useBrokerStore(s => s.brokerStatuses["ctrader"] ?? "disconnected");
  const account   = useBrokerStore(s => s.connectedAccounts["ctrader"] ?? null);
  const positions = useBrokerStore(s => s.brokerPositions["ctrader"] ?? EMPTY_POSITIONS);
  const ticks     = useTickStore(s => s.ticks);
  const liveRate  = useCurrencyStore(s => s.exchangeRate);
  const { data: tradeRes } = useListTrades({ limit: 500 });

  return useMemo<AccountSnapshot>(() => {
    const availableBalanceUSD    = parseFloat(balance?.availableToWithdraw ?? "0") || 0;
    const walletBalanceUSD       = parseFloat(balance?.walletBalance        ?? "0") || 0;
    // Tick-driven live unrealized PnL — avoids the "stuck" balance snapshot
    // that only refreshes on the 15s REST poll (see brokerStore.ts POLL_INTERVAL).
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
      if (classifyBrokerForSymbol(trade.symbol) !== "ctrader") return sum;
      return sum + (trade.pnl ?? 0);
    }, 0);

    return {
      brokerId:         "ctrader",
      label:            "cTrader",
      isConnected:      !!account && status === "connected",
      connectionStatus: status,
      availableBalanceUSD,
      marginUsedUSD,
      unrealizedPnlUSD,
      realizedPnlUSD,
      accountValueUSD,
      toINR:     (usd: number) => usd * liveRate,
      rateLabel: "Live market rate",
    };
  }, [balance, status, account, tradeRes, liveRate, positions, ticks]);
}
