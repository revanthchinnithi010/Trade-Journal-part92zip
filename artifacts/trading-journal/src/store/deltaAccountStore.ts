import { useMemo } from "react";
import { useListTrades } from "@workspace/api-client-react";
import { useBrokerStore } from "./brokerStore";
import { classifyBrokerForSymbol } from "@/lib/brokerClassification";
import type { AccountSnapshot } from "./accountTypes";

/** Delta Exchange always converts USD → INR at a fixed rate, per product spec. */
export const DELTA_FIXED_USD_INR_RATE = 85;

/**
 * Derived, read-only view of the Delta Exchange account.
 * Pulls from the shared `brokerStore` (which already owns fetching/polling
 * for the "delta" broker key) — no duplicate network requests.
 */
export function useDeltaAccount(): AccountSnapshot {
  const balance = useBrokerStore(s => s.brokerBalances["delta"] ?? null);
  const status  = useBrokerStore(s => s.brokerStatuses["delta"] ?? "disconnected");
  const account = useBrokerStore(s => s.connectedAccounts["delta"] ?? null);
  const { data: tradeRes } = useListTrades({ limit: 500 });

  return useMemo<AccountSnapshot>(() => {
    const availableBalanceUSD = parseFloat(balance?.availableToWithdraw ?? "0") || 0;
    const walletBalanceUSD    = parseFloat(balance?.walletBalance ?? "0") || 0;
    const unrealizedPnlUSD    = parseFloat(balance?.unrealisedPnl ?? "0") || 0;
    const equityFromApi       = parseFloat(balance?.equity ?? "");
    const accountValueUSD     = Number.isFinite(equityFromApi) && balance?.equity
      ? equityFromApi
      : walletBalanceUSD + unrealizedPnlUSD;
    const marginUsedUSD = Math.max(0, walletBalanceUSD - availableBalanceUSD);

    const realizedPnlUSD = (tradeRes?.trades ?? []).reduce((sum: number, t: unknown) => {
      const trade = t as { symbol?: string; exitPrice?: number | null; pnl?: number };
      if (trade.exitPrice == null) return sum;
      if (classifyBrokerForSymbol(trade.symbol) !== "delta") return sum;
      return sum + (trade.pnl ?? 0);
    }, 0);

    return {
      brokerId: "delta",
      label: "Delta Exchange",
      isConnected: !!account && status === "connected",
      connectionStatus: status,
      availableBalanceUSD,
      marginUsedUSD,
      unrealizedPnlUSD,
      realizedPnlUSD,
      accountValueUSD,
      toINR: (usd: number) => usd * DELTA_FIXED_USD_INR_RATE,
      rateLabel: `Fixed · 1 USD = ₹${DELTA_FIXED_USD_INR_RATE}`,
    };
  }, [balance, status, account, tradeRes]);
}
