/**
 * yahooFinanceService.ts
 *
 * Fetches OHLCV from Yahoo Finance for non-crypto symbols (indices, commodities, forex).
 * No API key required. Primary candle source for all non-crypto symbols.
 *
 * INTERVAL MAPPING NOTES
 * ──────────────────────
 * Yahoo Finance does not have every interval the app uses. The strategy is:
 *   - Use the finest available Yahoo resolution that ≤ the target interval.
 *   - For intervals without a direct Yahoo match (3m, 2H, 4H), fetch finer bars
 *     and resample server-side into proper OHLCV buckets.
 *
 * Yahoo resolution availability:
 *   1m  → last 7 days only
 *   2m  → last 60 days
 *   5m  → last 60 days
 *   15m → last 60 days
 *   30m → last 60 days
 *   60m → last 730 days
 *   1d  → unlimited
 *   1wk → unlimited
 */

import type { OHLCBar } from "./CandleAggregator.js";
import { logger } from "../lib/logger.js";

/** Maps internal app symbol → Yahoo Finance ticker */
export const YAHOO_SYMBOL_MAP: Record<string, string> = {
  NAS100: "^NDX",
  US30:   "^DJI",
  SPX500: "^GSPC",
  DE40:   "^GDAXI",
  XAUUSD: "GC=F",
  XAGUSD: "SI=F",
  USOIL:  "CL=F",
  UKOIL:  "BZ=F",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  GBPJPY: "GBPJPY=X",
  USDJPY: "JPY=X",
  AUDUSD: "AUDUSD=X",
  USDCAD: "CAD=X",
};

/**
 * Yahoo resolution to fetch for each app interval.
 *
 * For intervals without a direct Yahoo match we fetch a finer resolution and
 * resample with resampleBars(). The resample target is in RESAMPLE_SECS below.
 *
 *  app interval | Yahoo fetch | resample target
 *  -------------|-------------|----------------
 *  1m           | 1m          | — (native)
 *  3m           | 1m          | 3m  (3 × 1m)
 *  5m           | 5m          | — (native)
 *  15m          | 15m         | — (native)
 *  30m          | 30m         | — (native)
 *  60m (1H)     | 60m         | — (native)
 *  120m (2H)    | 60m         | 2H  (2 × 1H)
 *  240m (4H)    | 60m         | 4H  (4 × 1H)
 *  D            | 1d          | — (native)
 *  W            | 1wk         | — (native)
 */
const YAHOO_FETCH_INTERVAL: Record<string, string> = {
  "1":   "1m",
  "3":   "1m",   // fetch 1m → resample to 3m
  "5":   "5m",
  "15":  "15m",
  "30":  "30m",
  "60":  "60m",
  "120": "60m",  // fetch 1h → resample to 2h
  "240": "60m",  // fetch 1h → resample to 4h
  "D":   "1d",
  "W":   "1wk",
};

/** How far back to fetch (must be enough for 500 resampled bars + market gaps) */
const YAHOO_RANGE: Record<string, string> = {
  "1":   "7d",    // 1m native — Yahoo 1m limit is 7 days
  "3":   "7d",    // 1m fetch → 7d covers ~6720 1m bars → ~2240 3m bars after resample
  "5":   "60d",
  "15":  "60d",
  "30":  "60d",
  "60":  "730d",
  "120": "730d",  // 1h fetch → 730 days covers ~8760 1h bars → ~4380 2h bars
  "240": "730d",  // 1h fetch → 730 days covers ~8760 1h bars → ~2190 4h bars
  "D":   "730d",
  "W":   "730d",
};

/**
 * Resample target in seconds.  0 = no resampling needed (native Yahoo interval).
 * Resampling groups consecutive fine bars into coarser OHLCV bars aligned to
 * standard boundaries (same alignment used by CandleAggregator and RealtimeTradeAggregator).
 */
const RESAMPLE_SECS: Record<string, number> = {
  "3":   180,    // 3 minutes
  "120": 7200,   // 2 hours
  "240": 14400,  // 4 hours
};

/**
 * Resample fine bars into coarser OHLCV bars.
 *
 * Groups bars into buckets aligned to targetSecs boundaries (UTC epoch).
 * Open  = first bar's open in the bucket.
 * High  = max high across all bars in the bucket.
 * Low   = min low across all bars in the bucket.
 * Close = last bar's close in the bucket.
 * Volume = sum.
 *
 * This matches the CandleAggregator / RealtimeTradeAggregator alignment so
 * historical bars mesh correctly with live tick-built candles.
 */
function resampleBars(bars: OHLCBar[], targetSecs: number): OHLCBar[] {
  if (bars.length === 0) return [];
  const buckets = new Map<number, OHLCBar>();
  for (const bar of bars) {
    const t = Math.floor(bar.time / targetSecs) * targetSecs;
    const b = buckets.get(t);
    if (!b) {
      buckets.set(t, {
        time:   t,
        open:   bar.open,
        high:   bar.high,
        low:    bar.low,
        close:  bar.close,
        volume: bar.volume,
      });
    } else {
      if (bar.high > b.high) b.high = bar.high;
      if (bar.low  < b.low)  b.low  = bar.low;
      b.close   = bar.close;   // last bar wins
      b.volume += bar.volume;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

export function isYahooSymbol(symbol: string): boolean {
  return symbol in YAHOO_SYMBOL_MAP;
}

interface YahooResult {
  timestamp:  number[];
  indicators: {
    quote: Array<{
      open:   (number | null)[];
      high:   (number | null)[];
      low:    (number | null)[];
      close:  (number | null)[];
      volume: (number | null)[];
    }>;
  };
}

interface YahooResponse {
  chart: {
    result?: YahooResult[];
    error?:  unknown;
  };
}

export async function fetchYahooCandles(
  symbol:   string,
  interval: string,
  beforeSec?: number,
): Promise<OHLCBar[]> {
  const ticker = YAHOO_SYMBOL_MAP[symbol];
  if (!ticker) {
    logger.warn({ symbol }, "Yahoo Finance: no ticker mapping for symbol");
    return [];
  }

  const yahooInterval = YAHOO_FETCH_INTERVAL[interval] ?? "1d";
  const yahooRange    = YAHOO_RANGE[interval]           ?? "730d";
  const resampleSec   = RESAMPLE_SECS[interval]         ?? 0;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?interval=${yahooInterval}&range=${yahooRange}&includeTimestamps=true`;

  logger.info({ symbol, ticker, yahooInterval, yahooRange }, "Yahoo Finance: fetching bars");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":          "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer":         "https://finance.yahoo.com/",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    logger.error({ symbol, ticker, err }, "Yahoo Finance: network error");
    return [];
  }

  if (!res.ok) {
    logger.warn({ symbol, ticker, status: res.status, statusText: res.statusText }, "Yahoo Finance: HTTP error");
    return [];
  }

  let data: YahooResponse;
  try {
    data = (await res.json()) as YahooResponse;
  } catch (err) {
    logger.error({ symbol, ticker, err }, "Yahoo Finance: JSON parse error");
    return [];
  }

  const result = data?.chart?.result?.[0];
  if (!result) {
    logger.warn({ symbol, ticker, error: data?.chart?.error }, "Yahoo Finance: empty result or API error");
    return [];
  }

  const { timestamp, indicators: { quote } } = result;
  const q = quote?.[0];
  if (!timestamp?.length || !q) {
    logger.warn({ symbol, ticker }, "Yahoo Finance: malformed response (missing timestamps or quote)");
    return [];
  }

  const bars: OHLCBar[] = [];
  for (let i = 0; i < timestamp.length; i++) {
    const o = q.open[i];
    const h = q.high[i];
    const l = q.low[i];
    const c = q.close[i];
    if (o == null || h == null || l == null || c == null) continue;
    const t = timestamp[i];
    if (!t) continue;
    bars.push({
      time:   t,
      open:   o,
      high:   h,
      low:    l,
      close:  c,
      volume: q.volume[i] ?? 0,
    });
  }

  if (bars.length === 0) {
    logger.warn({ symbol, ticker }, "Yahoo Finance: all bars filtered out (nulls)");
    return [];
  }

  // Deduplicate + sort by timestamp ascending
  const sorted = [...new Map(bars.map(b => [b.time, b])).values()]
    .sort((a, b) => a.time - b.time);

  // Resample to coarser interval if needed (3m, 2H, 4H)
  const processed = resampleSec > 0 ? resampleBars(sorted, resampleSec) : sorted;

  // Apply beforeSec filter for pagination
  const filtered = (beforeSec && beforeSec > 0)
    ? processed.filter(b => b.time < beforeSec)
    : processed;

  logger.info(
    { symbol, ticker, total: sorted.length, resampled: processed.length, returned: Math.min(filtered.length, 500) },
    "Yahoo Finance: bars loaded ✓",
  );

  return filtered.slice(-500);
}
