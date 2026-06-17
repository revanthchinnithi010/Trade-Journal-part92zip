/**
 * finnhubCandleService.ts
 *
 * Fetches historical OHLCV candles from the Finnhub REST API for forex, index,
 * and commodity symbols (all routed via OANDA on the Finnhub side).
 *
 * WHY: Finnhub WS ticks arrive at 0.5–5 Hz for OANDA forex — too infrequent to
 * build realistic OHLCV from scratch (produces near-doji candles).  The REST
 * endpoint returns pre-aggregated exchange OHLCV that matches TradingView.
 *
 * ARCHITECTURE:
 *  - historical bars  ← fetchFinnhubCandles() (this file)
 *  - current open bar ← RealtimeTradeAggregator (client) + CandleAggregator (server)
 *    kept in sync by raw WS tick stream
 *
 * Intervals without a direct Finnhub resolution (3m, 2H, 4H) are fetched at
 * the finest available resolution and resampled server-side via resampleBars().
 * The bucket alignment is identical to CandleAggregator / RealtimeTradeAggregator
 * so historical and live bars mesh on the exact same boundaries.
 */

import type { OHLCBar } from "./CandleAggregator.js";
import { logger } from "../lib/logger.js";

/**
 * Internal app symbol → Finnhub / OANDA symbol.
 * Sourced from FinnhubProvider.STATIC_SYMBOL_MAP (same set, kept separate
 * to avoid circular import).
 */
const FINNHUB_SYMBOL_MAP: Record<string, string> = {
  // Forex via OANDA
  EURUSD: "OANDA:EUR_USD",
  GBPUSD: "OANDA:GBP_USD",
  USDJPY: "OANDA:USD_JPY",
  AUDUSD: "OANDA:AUD_USD",
  USDCAD: "OANDA:USD_CAD",
  USDCHF: "OANDA:USD_CHF",
  EURGBP: "OANDA:EUR_GBP",
  GBPJPY: "OANDA:GBP_JPY",
  EURJPY: "OANDA:EUR_JPY",
  NZDUSD: "OANDA:NZD_USD",
  // Indices via OANDA
  NAS100: "OANDA:NAS100_USD",
  US30:   "OANDA:US30_USD",
  SPX500: "OANDA:SPX500_USD",
  US500:  "OANDA:SPX500_USD",
  GER40:  "OANDA:DE30_EUR",
  UK100:  "OANDA:UK100_GBP",
  // Metals via OANDA
  XAUUSD: "OANDA:XAU_USD",
  XAGUSD: "OANDA:XAG_USD",
  // Commodities via OANDA
  USOIL:  "OANDA:WTICO_USD",
  UKOIL:  "OANDA:BCO_USD",
  NATGAS: "OANDA:NATGAS_USD",
  NGAS:   "OANDA:NATGAS_USD",
};

/**
 * App interval → Finnhub resolution string.
 *
 * Finnhub supports: 1, 5, 15, 30, 60, D, W, M
 * Unsupported (3m, 2H, 4H) are covered by fetching a finer resolution
 * and resampling with resampleBars().
 */
const FINNHUB_RESOLUTION: Record<string, string> = {
  "1":   "1",
  "3":   "1",   // fetch 1m → resample to 3m
  "5":   "5",
  "15":  "15",
  "30":  "30",
  "60":  "60",
  "120": "60",  // fetch 1h → resample to 2h
  "240": "60",  // fetch 1h → resample to 4h
  "D":   "D",
  "W":   "W",
};

/** Seconds per Finnhub resolution — used to compute from/to window */
const RESOLUTION_SECS: Record<string, number> = {
  "1":   60,
  "5":   300,
  "15":  900,
  "30":  1800,
  "60":  3600,
  "D":   86400,
  "W":   604800,
};

/**
 * Target interval in seconds for server-side resampling.
 * 0 means no resampling needed (fetch resolution matches target interval).
 */
const RESAMPLE_SECS: Record<string, number> = {
  "3":   180,    // 3 minutes
  "120": 7200,   // 2 hours
  "240": 14400,  // 4 hours
};

/**
 * Resample fine bars into coarser OHLCV bars aligned to UTC boundaries.
 *
 * Open  = first bar's open in the bucket.
 * High  = max high across all bars in the bucket.
 * Low   = min low across all bars in the bucket.
 * Close = last bar's close in the bucket.
 * Volume = sum.
 *
 * Bucket boundaries use the same formula as CandleAggregator.getBarStartSec()
 * and RealtimeTradeAggregator so historical + live candles land on the same grid.
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
      b.close   = bar.close;   // latest bar wins
      b.volume += bar.volume;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

interface FinnhubCandleResponse {
  c?: (number | null)[];
  h?: (number | null)[];
  l?: (number | null)[];
  o?: (number | null)[];
  s?: string;
  t?: (number | null)[];
  v?: (number | null)[];
}

/** Returns true if the symbol can be fetched from Finnhub REST */
export function isFinnhubCandleSymbol(symbol: string): boolean {
  return symbol in FINNHUB_SYMBOL_MAP;
}

/**
 * Fetch historical OHLCV candles from Finnhub's forex candle REST endpoint.
 *
 * @param symbol    Internal app symbol (e.g. "EURUSD")
 * @param interval  App interval string (e.g. "1", "60", "240")
 * @param apiKey    Finnhub API key
 * @param limit     Maximum bars to return (default 500)
 * @param beforeSec Pagination: only return bars with time < beforeSec
 */
export async function fetchFinnhubCandles(
  symbol:    string,
  interval:  string,
  apiKey:    string,
  limit    = 500,
  beforeSec?: number,
): Promise<OHLCBar[]> {
  const finnhubSym = FINNHUB_SYMBOL_MAP[symbol];
  if (!finnhubSym) {
    logger.warn({ symbol }, "fetchFinnhubCandles: no symbol mapping — try Yahoo fallback");
    return [];
  }

  const resolution    = FINNHUB_RESOLUTION[interval]   ?? "D";
  const resolutionSec = RESOLUTION_SECS[resolution]    ?? 86400;
  const resampleSec   = RESAMPLE_SECS[interval]        ?? 0;

  // How many raw bars we need (×resample factor + ×2 gap factor for weekends / holidays)
  const resampleFactor  = resampleSec > 0 ? Math.ceil(resampleSec / resolutionSec) : 1;
  const rawBarsNeeded   = limit * resampleFactor * 2;  // ×2 gap factor

  const to   = beforeSec ?? Math.floor(Date.now() / 1000);
  const from = to - rawBarsNeeded * resolutionSec;

  const url =
    `https://finnhub.io/api/v1/forex/candle` +
    `?symbol=${encodeURIComponent(finnhubSym)}` +
    `&resolution=${resolution}` +
    `&from=${from}&to=${to}` +
    `&token=${apiKey}`;

  logger.info(
    { symbol, finnhubSym, resolution, interval, from, to, rawBarsNeeded },
    "fetchFinnhubCandles: fetching",
  );

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  } catch (err) {
    logger.error({ symbol, err }, "fetchFinnhubCandles: network error");
    return [];
  }

  if (res.status === 401 || res.status === 403) {
    logger.warn({ symbol, status: res.status }, "fetchFinnhubCandles: invalid API key");
    return [];
  }

  if (!res.ok) {
    logger.warn({ symbol, status: res.status }, "fetchFinnhubCandles: HTTP error");
    return [];
  }

  let data: FinnhubCandleResponse;
  try {
    data = (await res.json()) as FinnhubCandleResponse;
  } catch (err) {
    logger.error({ symbol, err }, "fetchFinnhubCandles: JSON parse error");
    return [];
  }

  if (data.s === "no_data" || !data.t?.length) {
    logger.warn({ symbol, interval, s: data.s }, "fetchFinnhubCandles: no data returned");
    return [];
  }

  // Build raw bars
  const bars: OHLCBar[] = [];
  const n = data.t.length;
  for (let i = 0; i < n; i++) {
    const t = data.t[i];
    const o = data.o?.[i];
    const h = data.h?.[i];
    const l = data.l?.[i];
    const c = data.c?.[i];
    if (t == null || o == null || h == null || l == null || c == null) continue;
    if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
    bars.push({ time: t, open: o, high: h, low: l, close: c, volume: data.v?.[i] ?? 0 });
  }

  if (bars.length === 0) {
    logger.warn({ symbol }, "fetchFinnhubCandles: all bars filtered out (nulls / non-finite)");
    return [];
  }

  // Deduplicate + sort ascending
  const sorted = [...new Map(bars.map(b => [b.time, b])).values()]
    .sort((a, b) => a.time - b.time);

  // Resample to target interval if needed (3m, 2H, 4H)
  const processed = resampleSec > 0 ? resampleBars(sorted, resampleSec) : sorted;

  // Apply beforeSec filter AFTER resampling (bucket boundaries may shift)
  const filtered = (beforeSec && beforeSec > 0)
    ? processed.filter(b => b.time < beforeSec)
    : processed;

  logger.info(
    {
      symbol, interval,
      raw:       sorted.length,
      processed: processed.length,
      returned:  Math.min(filtered.length, limit),
    },
    "fetchFinnhubCandles: bars loaded ✓",
  );

  return filtered.slice(-limit);
}
