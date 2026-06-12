/**
 * candles.ts — serves real OHLCV bars from Delta Exchange India.
 *
 * ALL fake / seeded / Binance data has been removed.
 *
 * Delta India symbol format: all perpetuals end in "USD" (e.g. BTCUSD),
 * which matches the internal app symbol — no conversion needed.
 */

import { Router, type IRouter } from "express";
import type { CandleAggregator, OHLCBar, CandleInterval } from "../services/CandleAggregator.js";
import type { MarketDataService } from "../services/MarketDataService.js";
import { fetchDeltaCandles } from "../services/deltaHistoryService.js";
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

    // ── History pagination: ?before=<unix_seconds> ───────────────────────────
    // When the client has scrolled near the left edge of loaded data it sends
    // ?before=<oldest_bar_time> to fetch the preceding 500 bars. These are pure
    // historical bars — no live aggregator merge is needed or wanted.
    const beforeRaw = req.query["before"];
    const beforeSec = typeof beforeRaw === "string" ? parseInt(beforeRaw, 10) : NaN;
    if (!isNaN(beforeSec) && beforeSec > 0) {
      logger.info(
        { symbol, interval, beforeSec },
        "candles: history page — fetching older bars before timestamp",
      );
      const bars = await fetchDeltaCandles(symbol, interval, 500, beforeSec);
      logger.info(
        { symbol, interval, beforeSec, returned: bars.length },
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
