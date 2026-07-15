import { useMemo } from "react";
import { useListTrades } from "@workspace/api-client-react";
import { useBrokerStore } from "./brokerStore";
import { useCurrencyStore } from "./currencyStore";
import { useTickStore } from "./tickStore";
import { classifyBrokerForSymbol } from "@/lib/brokerClassification";
import { liveUnrealizedPnlUSD } from "@/lib/livePnl";
import type { AccountSnapshot } from "./accountTypes";

/**
 * Derived, read-only view of the cTrader account.
 * Unlike Delta, cTrader converts USD → INR using the LIVE market rate
 * (currencyStore.exchangeRate), which auto-updates whenever the rate refreshes.
 */
export function useCtraderAccount(): AccountSnapshot {
  const balance = useBrokerStore(s => s.brokerBalances["ctrader"] ?? null);
  const status  = useBrokerStore(s => s.brokerStatuses["ctrader"] ?? "disconnected");
  const account = useBrokerStore(s => s.connectedAccounts["ctrader"] ?? null);
  const positions = useBrokerStore(s => s.brokerPositions["ctrader"] ?? []);
  const ticks = useTickStore(s => s.ticks);
  const liveRate = useCurrencyStore(s => s.exchangeRate);
  const { data: tradeRes } = useListTrades({ limit: 500 });

  return useMemo<AccountSnapshot>(() => {
    const availableBalanceUSD = parseFloat(balance?.availableToWithdraw ?? "0") || 0;
    const walletBalanceUSD    = parseFloat(balance?.walletBalance ?? "0") || 0;
    // Tick-driven live unrealized PnL — avoids the "stuck" balance snapshot
    // that only refreshes on the 15s REST poll (see brokerStore.ts POLL_INTERVAL).
    const polledUnrealizedPnlUSD = parseFloat(balance?.unrealisedPnl ?? "0") || 0;
    const unrealizedPnlUSD    = liveUnrealizedPnlUSD(positions, ticks, polledUnrealizedPnlUSD);
    const equityFromApi       = parseFloat(balance?.equity ?? "");
    const accountValueUSD     = Number.isFinite(equityFromApi) && balance?.equity
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
      brokerId: "ctrader",
      label: "cTrader",
      isConnected: !!account && status === "connected",
      connectionStatus: status,
      availableBalanceUSD,
      marginUsedUSD,
      unrealizedPnlUSD,
      realizedPnlUSD,
      accountValueUSD,
      toINR: (usd: number) => usd * liveRate,
      rateLabel: "Live market rate",
    };
  }, [balance, status, account, tradeRes, liveRate, positions, ticks]);
}
