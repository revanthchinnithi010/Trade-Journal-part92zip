/**
 * Combined portfolio hook — single source of truth for aggregated account
 * metrics across both brokers (Delta + cTrader).
 *
 * React Native port of src/store/combinedPortfolioStore.ts
 * ─────────────────────────────────────────────────────────
 * No modifications — the file contains only pure React hooks and TypeScript
 * types.  There are no DOM APIs, browser globals, or browser event types.
 *
 * Dependency notes
 * ─────────────────
 * • deltaAccountStore   — scaffold stub (full migration pending); exports
 *                          the same useDeltaAccount() signature as the web.
 * • ctraderAccountStore — scaffold stub (full migration pending); exports
 *                          the same useCtraderAccount() signature as the web.
 * • currencyStore       — fully migrated ✓
 * • accountTypes        — fully migrated ✓
 *
 * When the two scaffold stubs are replaced with their full implementations,
 * this file requires zero changes — the API contract is identical.
 */

import { useMemo } from "react";
import { useDeltaAccount } from "./deltaAccountStore";
import { useCtraderAccount } from "./ctraderAccountStore";
import { useCurrencyStore } from "./currencyStore";
import type { AccountSnapshot } from "./accountTypes";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CombinedMetrics {
  accountValue:        number;
  equity:              number;
  unrealizedPnl:       number;
  realizedPnl:         number;
  netPnl:              number;
  totalBalance:        number;
  totalPortfolioValue: number;
}

export interface CombinedPortfolio {
  /** Raw USD totals — never re-converted, safe for cross-currency math. */
  usd: CombinedMetrics;
  /**
   * Totals already converted into the globally-selected currency, using each
   * account's own conversion rule (Delta = fixed ₹85, cTrader = live rate).
   * Render these directly — do NOT run them through the global exchange
   * rate again, or Delta's fixed-rate amount will be double-converted.
   */
  display: CombinedMetrics;
  delta:   AccountSnapshot;
  ctrader: AccountSnapshot;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function sumMetrics(
  delta:   AccountSnapshot,
  ctrader: AccountSnapshot,
  convert: (usd: number, acct: AccountSnapshot) => number
): CombinedMetrics {
  const deltaNet   = delta.unrealizedPnlUSD   + delta.realizedPnlUSD;
  const ctraderNet = ctrader.unrealizedPnlUSD + ctrader.realizedPnlUSD;
  return {
    accountValue:        convert(delta.accountValueUSD,      delta)   + convert(ctrader.accountValueUSD,      ctrader),
    equity:              convert(delta.accountValueUSD,      delta)   + convert(ctrader.accountValueUSD,      ctrader),
    unrealizedPnl:       convert(delta.unrealizedPnlUSD,     delta)   + convert(ctrader.unrealizedPnlUSD,     ctrader),
    realizedPnl:         convert(delta.realizedPnlUSD,       delta)   + convert(ctrader.realizedPnlUSD,       ctrader),
    netPnl:              convert(deltaNet,                   delta)   + convert(ctraderNet,                   ctrader),
    totalBalance:        convert(delta.availableBalanceUSD,  delta)   + convert(ctrader.availableBalanceUSD,  ctrader),
    totalPortfolioValue: convert(delta.accountValueUSD,      delta)   + convert(ctrader.accountValueUSD,      ctrader),
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Single source of truth for combined account data across both brokers.
 * The Dashboard reads ONLY from this hook — never directly from
 * deltaAccountStore / ctraderAccountStore / brokerStore for these metrics.
 */
export function useCombinedPortfolio(): CombinedPortfolio {
  const delta    = useDeltaAccount();
  const ctrader  = useCtraderAccount();
  const currency = useCurrencyStore(s => s.currency);

  return useMemo(() => {
    const usd = sumMetrics(delta, ctrader, (v) => v);
    const display = currency === "INR"
      ? sumMetrics(delta, ctrader, (v, acct) => acct.toINR(v))
      : usd;
    return { usd, display, delta, ctrader };
  }, [delta, ctrader, currency]);
}
