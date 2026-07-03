/**
 * candles.ts — serves real OHLCV bars.
 *
 * Routing strategy:
 *
 *  1. cTrader (non-crypto: forex, indices, metals, commodities)
 *     → fetches up to 500 historical bars via ProtoOA GetTrendbars (PT 2137/2138)
 *     → merges with live CandleAggregator bars (current open bar from live ticks)
 *     → trendbars cached 5 min to avoid repeated ProtoOA TLS connections (~1–2 s each)
 *     → fallback to aggregated-only if ProtoOA unavailable
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
import { fetchTrendbars } from "../lib/ctraderProtoOA.js";
import { pool } from "@workspace/db";
import { decrypt } from "../services/BrokerEncryption.js";
import { logger } from "../lib/logger.js";

const VALID_INTERVALS = new Set(["1", "3", "5", "15", "30", "60", "120", "240", "D", "W"]);

/**
 * Symbols served by cTrader (all non-crypto).
 * Add/remove symbols here as cTrader subscriptions change.
 */
const CTRADER_SYMBOLS = new Set([
  "NAS100", "US30", "US500", "SPX500", "GER40", "DE40", "UK100", "JP225",
  "XAUUSD", "XAGUSD", "USOIL", "UKOIL", "NATGAS",
  "EURUSD", "GBPUSD", "GBPJPY", "USDJPY", "AUDUSD", "USDCAD", "USDCHF",
  "EURGBP", "EURJPY", "EURAUD", "GBPAUD", "NZDUSD",
]);

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

// ── cTrader credential cache (1 min TTL — avoids DB hit per candle request) ───
interface CtraderCreds {
  token:     string;
  accountId: number;
  isLive:    boolean;
  cachedAt:  number;
}
let credCache: CtraderCreds | null = null;
const CRED_CACHE_TTL = 60_000;

async function getCtraderCreds(): Promise<CtraderCreds> {
  if (credCache && Date.now() - credCache.cachedAt < CRED_CACHE_TTL) return credCache;

  const [tokRow, cfgRow] = await Promise.all([
    pool.query<{ access_token_enc: string }>(
      "SELECT access_token_enc FROM ctrader_tokens ORDER BY id DESC LIMIT 1",
    ),
    pool.query<{ account_id: number; is_live: boolean }>(
      "SELECT account_id, is_live FROM ctrader_spot_config WHERE id=1",
    ),
  ]);

  if (!tokRow.rows.length || !cfgRow.rows.length)
    throw new Error("cTrader credentials not configured in DB");

  const accessToken = decrypt(tokRow.rows[0].access_token_enc);
  if (!accessToken) throw new Error("cTrader access token decrypt failed");

  const cfg = cfgRow.rows[0];
  credCache = {
    token:     accessToken,
    accountId: cfg.account_id,
    isLive:    Boolean(cfg.is_live),
    cachedAt:  Date.now(),
  };
  return credCache;
}

// ── Trendbars result cache (5 min TTL — each ProtoOA connection costs ~1–2 s) ─
interface TrendbarsEntry { bars: OHLCBar[]; fetchedAt: number; }
const trendbarsCache = new Map<string, TrendbarsEntry>();
const TRENDBARS_CACHE_TTL = 5 * 60_000;

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

    const iv = interval as CandleInterval;

    // ── cTrader symbols (forex, indices, metals, commodities) ─────────────────
    // Fetch completed historical bars via ProtoOA GetTrendbars and merge with
    // the live CandleAggregator's current open bar.
    if (CTRADER_SYMBOLS.has(symbol)) {
      const cacheKey = `${symbol}:${interval}`;
      const cached   = trendbarsCache.get(cacheKey);
      const aggBars  = aggregator.getBars(symbol, iv);

      // Fast path: cached trendbars are fresh — merge with latest live bar
      if (cached && Date.now() - cached.fetchedAt < TRENDBARS_CACHE_TTL) {
        const merged = mergeBars(cached.bars, aggBars);
        logger.info(
          { symbol, interval, cached: cached.bars.length, agg: aggBars.length, merged: merged.length },
          "candles: cTrader cache-hit ✓",
        );
        res.json(merged);
        return;
      }

      // Slow path: fetch historical bars from ProtoOA (~1–2 s)
      logger.info({ symbol, interval }, "candles: cTrader — fetching ProtoOA trendbars");
      try {
        const clientId     = process.env["CTRADER_CLIENT_ID"];
        const clientSecret = process.env["CTRADER_CLIENT_SECRET"];
        if (!clientId || !clientSecret) throw new Error("CTRADER_CLIENT_ID/SECRET not set in env");

        const creds = await getCtraderCreds();

        // Resolve symbol → symbolId via ctrader_symbols DB table
        const symRow = await pool.query<{ symbol_id: number }>(
          "SELECT symbol_id FROM ctrader_symbols WHERE UPPER(symbol_name) = UPPER($1) LIMIT 1",
          [symbol],
        );
        if (!symRow.rows.length) {
          throw new Error(`Symbol "${symbol}" not found in ctrader_symbols — run auto-setup first`);
        }
        const symbolId = Number(symRow.rows[0].symbol_id);

        logger.info({ symbol, symbolId, interval }, "candles: cTrader — symbolId resolved, requesting trendbars");

        const trendbars = await fetchTrendbars({
          ctidTraderAccountId: creds.accountId,
          isLive:              creds.isLive,
          accessToken:         creds.token,
          clientId,
          clientSecret,
          symbolId,
          interval,
          count: 500,
        });

        // Cache the completed historical bars (current open bar comes from aggregator)
        trendbarsCache.set(cacheKey, { bars: trendbars, fetchedAt: Date.now() });

        const freshAgg = aggregator.getBars(symbol, iv);
        const merged   = mergeBars(trendbars, freshAgg);
        logger.info(
          { symbol, symbolId, interval, historical: trendbars.length, agg: freshAgg.length, merged: merged.length },
          "candles: cTrader trendbars ✓",
        );
        res.json(merged);
      } catch (err) {
        // Fallback: serve live aggregated bars only — better than an error
        logger.warn(
          { symbol, interval, err: String(err) },
          "candles: cTrader trendbars FAILED — falling back to aggregated-only",
        );
        res.json(aggregator.getBars(symbol, iv).slice(-501));
      }
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
    logger.info({ symbol, interval }, "candles: fetching real Delta Exchange India bars");

    const historicalBars = await fetchDeltaCandles(symbol, interval, 500);
    const aggBars        = aggregator.getBars(symbol, iv);

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
      { symbol, interval, historical: historicalBars.length, aggregated: aggBars.length, merged: merged.length },
      "candles: serving real Delta Exchange India bars ✓",
    );

    res.json(merged);
  });

  return router;
}
