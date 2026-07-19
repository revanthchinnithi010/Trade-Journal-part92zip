/**
 * Normalized per-broker account snapshot consumed by the Portfolio account
 * cards and the combined portfolio store. All monetary fields are in USD —
 * conversion to the display currency is broker-specific (see `toINR`).
 *
 * React Native port of src/store/accountTypes.ts
 * ───────────────────────────────────────────────
 * No modifications — the file contains only a pure TypeScript interface.
 * There are no DOM APIs, browser globals, or browser event types.
 *
 * Import path update:
 *   @/types/broker            → @/types/broker            (already migrated ✓)
 *   @/lib/brokerClassification → @/lib/brokerClassification (migrated as dependency ✓)
 */

import type { ConnectionStatus } from "@/types/broker";
import type { PortfolioBrokerId } from "@/lib/brokerClassification";

export interface AccountSnapshot {
  brokerId: PortfolioBrokerId;
  label: string;
  isConnected: boolean;
  connectionStatus: ConnectionStatus;

  availableBalanceUSD: number;
  marginUsedUSD: number;
  unrealizedPnlUSD: number;
  realizedPnlUSD: number;
  accountValueUSD: number;

  /** Converts a USD amount to INR using this broker's conversion rule. */
  toINR: (usd: number) => number;
  /** Short label describing the conversion rule (shown in the UI). */
  rateLabel: string;
}
