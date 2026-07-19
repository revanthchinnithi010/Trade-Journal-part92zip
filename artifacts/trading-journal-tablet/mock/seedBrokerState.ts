/**
 * Mock broker state seeder — React Native port of src/mock/seedBrokerState.ts
 *
 * Purpose: seed broker account snapshots (balances, positions, orders) with
 * deterministic mock data in DEV_MODE, bypassing the real connect/WS flow so
 * dashboard widgets show data without the user manually connecting a broker.
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * ⚠️  STUB — broker store migration pending
 *
 * The web original imports `useBrokerStore` and `deriveLegacy` from the
 * unified `brokerStore`, which has not been migrated to the tablet yet.
 * The tablet uses per-broker scaffold stubs (`deltaAccountStore`,
 * `ctraderAccountStore`) that will be replaced by the full implementation
 * in a future phase.
 *
 * Until then, `installMockBrokerState` is a typed no-op.  The data imports
 * below are preserved so they are type-checked and ready to wire in when the
 * broker store migration lands.
 *
 * To remove: delete this file and its call site in `app/_layout.tsx`.
 */
import { DEV_MODE } from "./config";

// Data imports preserved verbatim — these will be passed to the broker store
// once the full store migration is complete.
export {
  MOCK_BROKER_ACCOUNTS,
  MOCK_DELTA_BALANCE,
  MOCK_CTRADER_BALANCE,
  MOCK_DELTA_POSITIONS,
  MOCK_CTRADER_POSITIONS,
  MOCK_DELTA_ORDERS,
  MOCK_CTRADER_ORDERS,
} from "./data/portfolio";

/**
 * Seeds the broker store with deterministic mock account data in DEV_MODE.
 *
 * ⚠️  Currently a no-op stub pending the broker store migration.
 * When `store/brokerStore.ts` is migrated, restore the store seeding logic
 * from the web original (src/mock/seedBrokerState.ts).
 */
export function installMockBrokerState(): void {
  if (!DEV_MODE) return;
  // TODO: restore useBrokerStore.setState() call when brokerStore is migrated.
  // See src/mock/seedBrokerState.ts in the web artifact for the full implementation.
}
