/**
 * Delta Exchange account snapshot hook.
 *
 * ⚠️  SCAFFOLD STUB — full migration pending
 * ──────────────────────────────────────────
 * This file is a typed scaffold that unblocks `combinedPortfolioStore.ts`
 * while the full broker store stack (brokerStore, livePnl, api-client-react)
 * is still being migrated.
 *
 * The stub exports the same names and types as the web original:
 *   • DELTA_FIXED_USD_INR_RATE — the fixed USD→INR rate used by Delta
 *   • useDeltaAccount()        — returns a zero-valued AccountSnapshot
 *
 * Replace this entire file with the full migration when brokerStore,
 * liveUnrealizedPnlUSD, and @workspace/api-client-react are available.
 *
 * Corresponds to: src/store/deltaAccountStore.ts
 */

import type { AccountSnapshot } from "./accountTypes";

/** Delta Exchange always converts USD → INR at a fixed rate, per product spec. */
export const DELTA_FIXED_USD_INR_RATE = 85;

/**
 * Returns a zero-valued AccountSnapshot for the Delta Exchange account.
 * This stub will be replaced by a full implementation driven by brokerStore
 * and @workspace/api-client-react when those are migrated.
 */
export function useDeltaAccount(): AccountSnapshot {
  return {
    brokerId:            "delta",
    label:               "Delta Exchange",
    isConnected:         false,
    connectionStatus:    "disconnected",
    availableBalanceUSD: 0,
    marginUsedUSD:       0,
    unrealizedPnlUSD:    0,
    realizedPnlUSD:      0,
    accountValueUSD:     0,
    toINR:               (usd) => usd * DELTA_FIXED_USD_INR_RATE,
    rateLabel:           `₹${DELTA_FIXED_USD_INR_RATE} fixed`,
  };
}
