/**
 * yahooFinanceService.ts
 *
 * Fetches OHLCV from Yahoo Finance for non-crypto symbols (indices, commodities, forex).
 * No API key required. Used as a fallback when the symbol is not a Delta Exchange perpetual.
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

/** Map app interval → Yahoo Finance interval string */
const YAHOO_INTERVAL: Record<string, string> = {
  "1":   "2m",
  "3":   "5m",
  "5":   "5m",
  "15":  "15m",
  "30":  "30m",
  "60":  "1h",
  "120": "1h",
  "240": "1d",
  "D":   "1d",
  "W":   "1wk",
};

/** Map app interval → Yahoo Finance range (how far back to fetch) */
const YAHOO_RANGE: Record<string, string> = {
  "1":   "7d",
  "3":   "7d",
  "5":   "60d",
  "15":  "60d",
  "30":  "60d",
  "60":  "730d",
  "120": "730d",
  "240": "730d",
  "D":   "730d",
  "W":   "730d",
};

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

  const yahooInterval = YAHOO_INTERVAL[interval] ?? "1d";
  const yahooRange    = YAHOO_RANGE[interval]    ?? "730d";

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

  const sorted = bars.sort((a, b) => a.time - b.time);
  const deduped = [...new Map(sorted.map(b => [b.time, b])).values()];

  const filtered = beforeSec && beforeSec > 0
    ? deduped.filter(b => b.time < beforeSec)
    : deduped;

  logger.info(
    { symbol, ticker, total: deduped.length, returned: filtered.length },
    "Yahoo Finance: bars loaded ✓",
  );

  return filtered.slice(-500);
}
