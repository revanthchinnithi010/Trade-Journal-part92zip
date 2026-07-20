/**
 * fmtPrice — price display formatting utility.
 *
 * React Native port of the `fmtPrice` export from
 * src/contexts/LiveMarketContext.tsx (web).
 *
 * Extracted into its own lib file because the tablet's
 * LiveMarketContext.tsx is currently a stub (WsStatus type only) and
 * BrokerWatchlist / MobileWatchlistOverlay both need fmtPrice independently.
 *
 * Logic preserved exactly from the web original:
 *   - JPY pairs: 3 decimal places for large values (e.g. USDJPY at 152.xxx)
 *   - Crypto / large prices (≥10000): 1 decimal place
 *   - Indices / gold (1000-10000): 2 decimal places
 *   - Mid-range (100-1000): 3 decimal places
 *   - Forex majors (1-100): 5 decimal places
 *   - Micro prices (<1): 6 decimal places
 *   - Near-zero / tiny crypto: toPrecision(4)
 */
export function fmtPrice(price: number, symbol: string): string {
  if (!isFinite(price) || price <= 0) return "—";
  // JPY pairs: convention is 3 dp above 100, 5 dp below
  if (symbol && symbol.includes("JPY")) {
    return price >= 100 ? price.toFixed(3) : price.toFixed(5);
  }
  // Large crypto / indices (BTC, NAS100, US30, etc.)
  if (price >= 10000) return price.toFixed(1);
  // Mid-large: ETH, gold, crude
  if (price >= 1000) return price.toFixed(2);
  // Lower indices, gold sub-1000
  if (price >= 100) return price.toFixed(3);
  // Forex majors (EUR/USD, GBP/USD, etc.) and smaller crypto
  if (price >= 1) return price.toFixed(5);
  // Micro-cap crypto (0.001 – 1)
  if (price >= 0.001) return price.toFixed(6);
  // Nano-cap (PEPE, etc.)
  return price.toPrecision(4);
}
