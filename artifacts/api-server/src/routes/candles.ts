/**
 * candles.ts — serves real OHLCV bars.
 *
 * Routing strategy:
 *
 *  1. Yahoo Finance (non-crypto: forex, indices, metals, commodities)
 *     → fetchYahooCandles() — no API key required
 *
 *  2. Delta Exchange India (crypto — BTCUSD, ETHUSD, etc.)
 *     → fetchDeltaCandles() + CandleAggregator merge
 *
 * All sources return OHLCBar[] with time in unix seconds (UTC),
 * bars sorted ascending, capped at 500–501 entries.
 */

import { Router, type IRouter } from "express";
import type { CandleAggregator, OHLCBar, CandleInterval } from "../services/CandleAggregator.js";
import type { MarketDataService } from "../services/MarketDataService.js";
import { fetchDeltaCandles } from "../services/deltaHistoryService.js";
import { isYahooSymbol, fetchYahooCandles } from "../services/yahooFinanceService.js";
import { logger } from "../lib/logger.js";

const VALID_INTERVALS = new Set(["1", "3", "5", "15", "30", "60", "120", "240", "D", "W"]);

/**
 * Merge historical (older) bars with live aggregator bars (newer).
 *
 * Contract:
 *  - aggregated bars have newer or equal timestamps vs. historical
 *  - returns up to 501 bars: ≤500 completed + 1 current open bar
 */
function mergeBars(historical: OHLCBar[], aggregated: OHLCBar[]): OHLCBar[] {
  if (aggregated.length === 0) return historical.slice(-500);
  if (historical.length === 0) return aggregated.slice(-501);

  const firstAggTime = aggregated[0].time;
  const base         = historical.filter(b => b.time < firstAggTime);
  const combined     = [...base, ...aggregated];
  return combined.slice(-501);
}

export function createCandlesRouter(
  aggregator:  CandleAggregator,
  _marketData: MarketDataService,
): IRouter {
  const router: IRouter = Router();

  router.get("/candles/:symbol/:interval", async (req, res): Promise<void> => {
    const symbol   = (req.params["symbol"]   ?? "").toUpperCase().trim();
    const interval =  req.params["interval"] ?? "";

    if (!symbol || !VALID_INTERVALS.has(interval)) {
      res.status(400).json({ error: "Invalid symbol or interval" });
      return;
    }

    const beforeRaw = req.query["before"];
    const beforeSec = typeof beforeRaw === "string" ? parseInt(beforeRaw, 10) : NaN;
    const beforeSecOpt = (!isNaN(beforeSec) && beforeSec > 0) ? beforeSec : undefined;

    // ── Non-crypto (forex, indices, metals, commodities) via Yahoo Finance ────
    if (isYahooSymbol(symbol)) {
      logger.info({ symbol, interval }, "candles: routing to Yahoo Finance");
      const bars = await fetchYahooCandles(symbol, interval, beforeSecOpt);
      logger.info({ symbol, interval, returned: bars.length }, "candles: Yahoo Finance bars served ✓");
      res.json(bars);
      return;
    }

    // ── History pagination: ?before=<unix_seconds> (Delta crypto) ────────────
    if (beforeSecOpt) {
      logger.info(
        { symbol, interval, beforeSec: beforeSecOpt },
        "candles: history page — fetching older bars before timestamp",
      );
      const bars = await fetchDeltaCandles(symbol, interval, 500, beforeSecOpt);
      logger.info(
        { symbol, interval, beforeSec: beforeSecOpt, returned: bars.length },
        bars.length > 0
          ? "candles: history page served ✓"
          : "candles: history page — no older bars (exchange history exhausted)",
      );
      res.json(bars);
      return;
    }

    // ── Initial load: latest 500 bars merged with live aggregator ─────────────
    const iv = interval as CandleInterval;

    logger.info({ symbol, interval }, "candles: fetching real Delta Exchange India bars");

    const historicalBars = await fetchDeltaCandles(symbol, interval, 500);
    const aggBars = aggregator.getBars(symbol, iv);

    if (historicalBars.length === 0) {
      logger.warn(
        { symbol, interval, aggBars: aggBars.length },
        "candles: Delta India returned 0 historical bars — serving aggregated ticks only (no fake data)",
      );
      res.json(aggBars.slice(-501));
      return;
    }

    const merged = mergeBars(historicalBars, aggBars);

    logger.info(
      {
        symbol,
        interval,
        historical: historicalBars.length,
        aggregated: aggBars.length,
        merged:     merged.length,
      },
      "candles: serving real Delta Exchange India bars ✓",
    );

    res.json(merged);
  });

  return router;
}
