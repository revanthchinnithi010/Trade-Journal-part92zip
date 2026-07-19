/**
 * cTrader account snapshot hook.
 *
 * ⚠️  SCAFFOLD STUB — full migration pending
 * ──────────────────────────────────────────
 * This file is a typed scaffold that unblocks `combinedPortfolioStore.ts`
 * while the full broker store stack (brokerStore, livePnl, api-client-react,
 * currencyStore live rate) is still being migrated.
 *
 * The stub exports the same name and type as the web original:
 *   • useCtraderAccount() — returns a zero-valued AccountSnapshot
 *
 * Unlike Delta, cTrader uses the LIVE market rate from currencyStore for
 * USD→INR conversion.  The stub hard-codes the fallback rate (85) — replace
 * this entire file with the full implementation once brokerStore and
 * liveUnrealizedPnlUSD are available.
 *
 * Corresponds to: src/store/ctraderAccountStore.ts
 */

import type { AccountSnapshot } from "./accountTypes";

const CTRADER_FALLBACK_USD_INR_RATE = 85;

/**
 * Returns a zero-valued AccountSnapshot for the cTrader account.
 * This stub will be replaced by a full implementation driven by brokerStore,
 * @workspace/api-client-react, and currencyStore's live exchange rate.
 */
export function useCtraderAccount(): AccountSnapshot {
  return {
    brokerId:            "ctrader",
    label:               "cTrader",
    isConnected:         false,
    connectionStatus:    "disconnected",
    availableBalanceUSD: 0,
    marginUsedUSD:       0,
    unrealizedPnlUSD:    0,
    realizedPnlUSD:      0,
    accountValueUSD:     0,
    toINR:               (usd) => usd * CTRADER_FALLBACK_USD_INR_RATE,
    rateLabel:           "live rate",
  };
}
