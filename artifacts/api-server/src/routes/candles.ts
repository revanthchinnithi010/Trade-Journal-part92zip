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
import { ctraderTickEngine } from "../services/CtraderTickEngine.js";
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

/** ProtoOA TrendbarPeriod enum — kept in sync with CtraderTickEngine */
const INTERVAL_TO_OA_PERIOD: Partial<Record<string, number>> = {
  "1": 1, "3": 3, "5": 5, "15": 7, "30": 8, "60": 9, "240": 10, "D": 12, "W": 13,
};

/** Human-readable timeframe names for diagnostics */
const INTERVAL_LABEL: Partial<Record<string, string>> = {
  "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m",
  "60": "1H", "120": "2H", "240": "4H", "D": "Daily", "W": "Weekly",
};

/**
 * Merge historical (older) bars with live aggregator bars (newer).
 *
 * Contract:
 *  - aggregated bars have newer or equal timestamps vs. historical
 *  - returns up to 501 bars: ≤500 completed + 1 current open bar
 *  - NEVER clears historical bars when new live bars arrive
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

/**
 * Resolve clientId + clientSecret for the standalone fetchTrendbars fallback.
 *
 * Priority:
 *  1. Engine's in-memory credentials (when engine was configured even if not streaming)
 *  2. CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET env vars
 *
 * Throws if neither source provides the credentials.
 */
function resolveClientCreds(): { clientId: string; clientSecret: string } {
  // Preferred: reuse the engine's in-memory credentials (avoids env-var dependency)
  const engineCreds = ctraderTickEngine.getEngineCredentials();
  if (engineCreds?.clientId && engineCreds?.clientSecret) {
    return { clientId: engineCreds.clientId, clientSecret: engineCreds.clientSecret };
  }

  // Fallback: env vars
  const clientId     = process.env["CTRADER_CLIENT_ID"];
  const clientSecret = process.env["CTRADER_CLIENT_SECRET"];
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  throw new Error(
    "cTrader client credentials unavailable: engine not configured and " +
    "CTRADER_CLIENT_ID/CTRADER_CLIENT_SECRET env vars not set",
  );
}

export function createCandlesRouter(
  aggregator:  CandleAggregator,
  _marketData: MarketDataService,
): IRouter {
  const router: IRouter = Router();

  // ── GET /api/candles/ctrader/diagnostic/:symbol/:interval ─────────────────
  // Returns detailed diagnostics for the historical candle pipeline without
  // serving the full candle array.  Bypasses the 5-minute cache.
  router.get("/candles/ctrader/diagnostic/:symbol/:interval", async (req, res): Promise<void> => {
    const symbol   = (req.params["symbol"]   ?? "").toUpperCase().trim();
    const interval =  req.params["interval"] ?? "";

    const engineStatus   = ctraderTickEngine.getStatus();
    const engineCreds    = ctraderTickEngine.getEngineCredentials();
    const period         = INTERVAL_TO_OA_PERIOD[interval] ?? null;
    const timeframeLabel = INTERVAL_LABEL[interval] ?? interval;

    const diag: Record<string, unknown> = {
      symbol,
      interval,
      timeframeLabel,
      period,
      isCtraderSymbol: CTRADER_SYMBOLS.has(symbol),
      engineStatus:    engineStatus.status,
      engineAccountId: engineStatus.accountId,
      engineIsLive:    engineStatus.isLive,
      engineHasCreds:  !!engineCreds,
      envVarsPresent: {
        CTRADER_CLIENT_ID:     !!process.env["CTRADER_CLIENT_ID"],
        CTRADER_CLIENT_SECRET: !!process.env["CTRADER_CLIENT_SECRET"],
      },
    };

    // Resolve symbolId
    let symbolId: number | null = null;
    try {
      const symRow = await pool.query<{ symbol_id: number }>(
        "SELECT symbol_id FROM ctrader_symbols WHERE UPPER(symbol_name) = UPPER($1) LIMIT 1",
        [symbol],
      );
      symbolId = symRow.rows.length ? Number(symRow.rows[0].symbol_id) : null;
      diag["symbolId"]       = symbolId;
      diag["symbolIdFound"]  = symbolId !== null;
    } catch (e) {
      diag["symbolIdError"] = String(e);
    }

    // Request timestamps
    const now    = Date.now();
    const toMs   = now + 60_000;
    const fromMs = now - 500 * 60 * 60_000; // 500 × 1H as worst-case safety span
    diag["requestTimestamps"] = {
      nowMs:   now,
      toMs,
      fromMs,
      nowISO:  new Date(now).toISOString(),
      toISO:   new Date(toMs).toISOString(),
      fromISO: new Date(fromMs).toISOString(),
    };

    const aggBars = aggregator.getBars(symbol, interval as CandleInterval);
    diag["aggregatorBars"] = aggBars.length;

    // If engine is streaming and symbolId known, attempt a live trendbars fetch
    if (engineStatus.status === "streaming" && symbolId !== null && period !== null) {
      const t0 = Date.now();
      try {
        const bars = await ctraderTickEngine.fetchTrendbarsOnSession(symbolId, interval, 10, 15_000);
        diag["liveSessionFetch"] = {
          ok:         true,
          bars:       bars.length,
          durationMs: Date.now() - t0,
          firstBar:   bars[0]     ? { time: bars[0].time,     iso: new Date(bars[0].time * 1000).toISOString(),     open: bars[0].open }     : null,
          lastBar:    bars.at(-1) ? { time: bars.at(-1)!.time, iso: new Date(bars.at(-1)!.time * 1000).toISOString(), close: bars.at(-1)!.close } : null,
        };
      } catch (e) {
        diag["liveSessionFetch"] = { ok: false, error: String(e), durationMs: Date.now() - t0 };
      }
    } else {
      diag["liveSessionFetch"] = {
        skipped: true,
        reason: engineStatus.status !== "streaming"
          ? `engine not streaming (status=${engineStatus.status})`
          : symbolId === null ? "symbolId not found" : "period mapping missing",
      };
    }

    res.json(diag);
  });

  // ── GET /api/candles/:symbol/:interval ────────────────────────────────────
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
    //
    // Strategy (fastest first):
    //   1. Cache hit  → serve instantly (5-min TTL)
    //   2. Engine session → send GET_TRENDBARS_REQ on the live authenticated
    //      streaming connection (no new TLS handshake, uses current token)
    //   3. Standalone fetchTrendbars → opens a new TLS connection + re-auth
    //      (fallback when engine is not yet streaming; uses engine's cached
    //       credentials or env vars — whichever is available)
    if (CTRADER_SYMBOLS.has(symbol)) {
      const cacheKey = `${symbol}:${interval}`;
      const cached   = trendbarsCache.get(cacheKey);
      const aggBars  = aggregator.getBars(symbol, iv);

      // Fast path: cached trendbars are fresh — merge with latest live bar
      if (cached && Date.now() - cached.fetchedAt < TRENDBARS_CACHE_TTL) {
        const merged = mergeBars(cached.bars, aggBars);
        logger.info(
          {
            symbol, interval,
            timeframe:  INTERVAL_LABEL[interval] ?? interval,
            cached:     cached.bars.length,
            agg:        aggBars.length,
            merged:     merged.length,
            firstTime:  cached.bars[0]     ? new Date(cached.bars[0].time     * 1000).toISOString() : null,
            lastTime:   cached.bars.at(-1) ? new Date(cached.bars.at(-1)!.time * 1000).toISOString() : null,
          },
          "candles: cTrader cache-hit ✓",
        );
        res.json(merged);
        return;
      }

      // Resolve symbol → symbolId (required for both code paths below)
      let symbolId: number;
      try {
        const symRow = await pool.query<{ symbol_id: number }>(
          "SELECT symbol_id FROM ctrader_symbols WHERE UPPER(symbol_name) = UPPER($1) LIMIT 1",
          [symbol],
        );
        if (!symRow.rows.length) {
          throw new Error(`Symbol "${symbol}" not found in ctrader_symbols — run auto-setup first`);
        }
        symbolId = Number(symRow.rows[0].symbol_id);
      } catch (err) {
        logger.warn({ symbol, interval, err: String(err) }, "candles: cTrader symbolId lookup FAILED");
        res.json(aggBars.slice(-501));
        return;
      }

      const period         = INTERVAL_TO_OA_PERIOD[interval];
      const timeframeLabel = INTERVAL_LABEL[interval] ?? interval;
      const engineStatus   = ctraderTickEngine.getStatus();
      const toMs           = Date.now() + 60_000;   // 1 min future margin (ProtoOA)

      // Diagnostic log — shows exactly what we're about to request
      logger.info({
        symbol, symbolId, interval, timeframeLabel, period,
        count:         500,
        toISO:         new Date(toMs).toISOString(),
        engineStatus:  engineStatus.status,
        engineIsLive:  engineStatus.isLive,
        engineAcctId:  engineStatus.accountId,
      }, "candles: cTrader — fetching trendbars");

      try {
        let trendbars: OHLCBar[];
        const t0 = Date.now();

        if (engineStatus.status === "streaming") {
          // ── Preferred: reuse existing authenticated session ─────────────────
          // Sends GET_TRENDBARS_REQ on the live TLS connection.
          // No new connection, no re-auth — typically resolves in <200 ms.
          logger.info({ symbol, symbolId, interval, timeframeLabel },
            "candles: cTrader — using engine session for trendbars");
          trendbars = await ctraderTickEngine.fetchTrendbarsOnSession(symbolId, interval, 500) as OHLCBar[];
          logger.info({
            symbol, symbolId, interval, timeframeLabel,
            bars:      trendbars.length,
            durationMs: Date.now() - t0,
            firstTime: trendbars[0]     ? new Date(trendbars[0].time     * 1000).toISOString() : null,
            lastTime:  trendbars.at(-1) ? new Date(trendbars.at(-1)!.time * 1000).toISOString() : null,
          }, "candles: cTrader — engine session trendbars result");
        } else {
          // ── Fallback: open a new standalone TLS connection (~1–2 s) ─────────
          // Use engine's stored credentials if available, otherwise env vars.
          const { clientId, clientSecret } = resolveClientCreds();
          const creds = await getCtraderCreds();

          logger.info({
            symbol, symbolId, interval, timeframeLabel,
            engineStatus: engineStatus.status,
            accountId:    creds.accountId,
            isLive:       creds.isLive,
            toISO:        new Date(toMs).toISOString(),
          }, "candles: cTrader — engine not streaming, using standalone fetchTrendbars");

          trendbars = await fetchTrendbars({
            ctidTraderAccountId: creds.accountId,
            isLive:              creds.isLive,
            accessToken:         creds.token,
            clientId,
            clientSecret,
            symbolId,
            interval,
            count: 500,
          });

          logger.info({
            symbol, symbolId, interval, timeframeLabel,
            bars:      trendbars.length,
            durationMs: Date.now() - t0,
            firstTime: trendbars[0]     ? new Date(trendbars[0].time     * 1000).toISOString() : null,
            lastTime:  trendbars.at(-1) ? new Date(trendbars.at(-1)!.time * 1000).toISOString() : null,
          }, "candles: cTrader — standalone trendbars result");
        }

        // Cache the completed historical bars (current open bar comes from aggregator)
        trendbarsCache.set(cacheKey, { bars: trendbars, fetchedAt: Date.now() });

        const freshAgg = aggregator.getBars(symbol, iv);
        const merged   = mergeBars(trendbars, freshAgg);
        logger.info(
          {
            symbol, symbolId, interval, timeframeLabel,
            historical: trendbars.length,
            agg:        freshAgg.length,
            merged:     merged.length,
            firstTime:  merged[0]     ? new Date(merged[0].time     * 1000).toISOString() : null,
            lastTime:   merged.at(-1) ? new Date(merged.at(-1)!.time * 1000).toISOString() : null,
            apiError:   trendbars.length === 0 ? "WARNING: 0 historical bars returned — check symbolId/period/logs" : null,
          },
          trendbars.length > 0
            ? "candles: cTrader trendbars ✓"
            : "candles: cTrader trendbars EMPTY — serving aggregator-only bars",
        );
        res.json(merged);
      } catch (err) {
        // Fallback: serve live aggregated bars only — better than an error
        logger.error(
          { symbol, symbolId, interval, timeframeLabel, err: String(err) },
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
