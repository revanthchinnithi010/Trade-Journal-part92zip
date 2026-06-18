/**
 * cTrader Spot Streaming routes
 *
 * POST /api/ctrader/spots/start        — start the tick engine (connect + auth)
 * POST /api/ctrader/spots/stop         — stop the tick engine
 * POST /api/ctrader/spots/subscribe    — add a symbol to the watchlist feed
 * POST /api/ctrader/spots/unsubscribe  — remove a symbol from the watchlist feed
 * GET  /api/ctrader/spots/status       — engine status + subscribed symbols
 *
 * Architecture:
 *   The engine starts with ZERO subscriptions after authentication.
 *   Subscriptions are driven exclusively by watchlist add/remove events.
 *   The full symbolMap is loaded at startup so SPOT_EVENT payloads can be decoded.
 */

import { Router } from "express";
import { ctraderTickEngine } from "../services/CtraderTickEngine.js";
import { pool } from "@workspace/db";
import { db, watchlistTable } from "@workspace/db";
import { decrypt } from "../services/BrokerEncryption.js";
import { logger } from "../lib/logger.js";

// ── DB helpers ────────────────────────────────────────────────────────────────

async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_tokens (
      id                SERIAL PRIMARY KEY,
      access_token_enc  TEXT NOT NULL,
      refresh_token_enc TEXT NOT NULL,
      expires_at        BIGINT NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_spot_config (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      account_id BIGINT  NOT NULL,
      is_live    BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_symbols (
      symbol_id    INTEGER PRIMARY KEY,
      symbol_name  TEXT NOT NULL,
      description  TEXT NOT NULL,
      pip_position INTEGER NOT NULL,
      digits       INTEGER NOT NULL,
      fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}

/**
 * Look up a symbol by name in ctrader_symbols.
 * Returns { symbolId, symbolName } or null if not found.
 */
export async function getCtraderSymbolRow(
  symbol: string,
): Promise<{ symbolId: number; symbolName: string } | null> {
  const result = await pool.query(
    "SELECT symbol_id, symbol_name FROM ctrader_symbols WHERE UPPER(symbol_name) = $1 LIMIT 1",
    [symbol.toUpperCase().trim()],
  );
  if (!result.rows.length) return null;
  const row = result.rows[0] as { symbol_id: number; symbol_name: string };
  return { symbolId: Number(row.symbol_id), symbolName: row.symbol_name };
}

/**
 * Load credentials + full symbolMap (no subscription set — engine starts empty).
 */
async function loadEngineOpts() {
  await ensureTables();

  const clientId     = process.env["CTRADER_CLIENT_ID"];
  const clientSecret = process.env["CTRADER_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET not set");
  }

  const tokenRow = await pool.query(
    "SELECT access_token_enc FROM ctrader_tokens ORDER BY id DESC LIMIT 1",
  );
  if (!tokenRow.rows.length) throw new Error("No cTrader token stored — complete OAuth first");
  const accessToken = decrypt((tokenRow.rows[0] as { access_token_enc: string }).access_token_enc);
  if (!accessToken) throw new Error("Could not decrypt cTrader access token");

  const cfgRow = await pool.query(
    "SELECT account_id, is_live FROM ctrader_spot_config WHERE id = 1",
  );
  if (!cfgRow.rows.length) throw new Error("No account configured — wire symbols first (supply accountId)");
  const { account_id, is_live } = cfgRow.rows[0] as { account_id: number; is_live: boolean };

  const symRows = await pool.query(
    "SELECT symbol_id, symbol_name FROM ctrader_symbols ORDER BY symbol_id",
  );
  if (!symRows.rows.length) throw new Error("No symbols in DB — wire symbols first");

  const symbolMap = new Map<number, string>();
  for (const row of symRows.rows as { symbol_id: number; symbol_name: string }[]) {
    symbolMap.set(Number(row.symbol_id), row.symbol_name);
  }

  return {
    clientId, clientSecret,
    accessToken,
    ctidTraderAccountId: Number(account_id),
    isLive: Boolean(is_live),
    symbolMap,
    // symbolIds intentionally omitted — engine starts with zero subscriptions
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createCtraderSpotsRouter(): Router {
  const router = Router();

  // POST /api/ctrader/spots/start
  router.post("/ctrader/spots/start", async (req, res) => {
    try {
      const current = ctraderTickEngine.getStatus();
      if (current.status === "streaming") {
        return res.json({ ok: true, message: "Already streaming", status: current });
      }

      const opts = await loadEngineOpts();

      // Allow request body to override accountId / isLive
      const body = req.body as { ctidTraderAccountId?: number; accountId?: number; isLive?: boolean };
      const overrideId = body.ctidTraderAccountId ?? body.accountId;
      if (overrideId) opts.ctidTraderAccountId = Number(overrideId);
      if (body.isLive !== undefined) opts.isLive = Boolean(body.isLive);

      ctraderTickEngine.stop();
      ctraderTickEngine.configure(opts);
      ctraderTickEngine.start();

      logger.info({
        accountId: opts.ctidTraderAccountId,
        isLive:    opts.isLive,
      }, "CtraderSpots: engine started via API (zero initial subscriptions)");

      return res.json({
        ok: true,
        message: "Engine starting — subscriptions driven by watchlist",
        accountId: opts.ctidTraderAccountId,
        isLive:    opts.isLive,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "CtraderSpots: start error");
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // POST /api/ctrader/spots/subscribe — add a symbol to the watchlist feed
  router.post("/ctrader/spots/subscribe", async (req, res) => {
    try {
      const { symbol } = req.body as { symbol?: string };
      if (!symbol) return res.status(400).json({ ok: false, error: "symbol required" });

      const row = await getCtraderSymbolRow(symbol);
      if (!row) {
        return res.json({ ok: false, error: `Symbol ${symbol.toUpperCase()} not found in cTrader catalog` });
      }

      ctraderTickEngine.addSymbol(row.symbolId, row.symbolName);
      const status = ctraderTickEngine.getStatus();
      logger.info({ symbol: row.symbolName, symbolId: row.symbolId, engineStatus: status.status },
        "CtraderSpots: symbol subscribed via API");
      return res.json({ ok: true, symbol: row.symbolName, symbolId: row.symbolId, engineStatus: status.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "CtraderSpots: subscribe error");
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // POST /api/ctrader/spots/unsubscribe — remove a symbol from the watchlist feed
  router.post("/ctrader/spots/unsubscribe", async (req, res) => {
    try {
      const { symbol } = req.body as { symbol?: string };
      if (!symbol) return res.status(400).json({ ok: false, error: "symbol required" });

      const row = await getCtraderSymbolRow(symbol);
      if (!row) {
        return res.json({ ok: false, error: `Symbol ${symbol.toUpperCase()} not found in cTrader catalog` });
      }

      ctraderTickEngine.removeSymbol(row.symbolId, row.symbolName);
      const status = ctraderTickEngine.getStatus();
      logger.info({ symbol: row.symbolName, symbolId: row.symbolId, engineStatus: status.status },
        "CtraderSpots: symbol unsubscribed via API");
      return res.json({ ok: true, symbol: row.symbolName, symbolId: row.symbolId, engineStatus: status.status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "CtraderSpots: unsubscribe error");
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // POST /api/ctrader/spots/stop
  router.post("/ctrader/spots/stop", (_req, res) => {
    ctraderTickEngine.stop();
    logger.info("CtraderSpots: engine stopped via API");
    return res.json({ ok: true, message: "Engine stopped" });
  });

  // GET /api/ctrader/spots/status
  router.get("/ctrader/spots/status", (_req, res) => {
    const status      = ctraderTickEngine.getStatus();
    const sampleTicks = ctraderTickEngine.getAllLastTicks().slice(0, 30);
    return res.json({ ok: true, status, sampleTicks });
  });

  return router;
}

// ── Auto-start helper (called from index.ts after migrations) ─────────────────

export async function autoStartCtraderEngine(): Promise<void> {
  const clientId     = process.env["CTRADER_CLIENT_ID"];
  const clientSecret = process.env["CTRADER_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    logger.info("CtraderSpots: CTRADER_CLIENT_ID/SECRET not set — skipping auto-start");
    return;
  }

  try {
    const opts = await loadEngineOpts();
    ctraderTickEngine.configure(opts);
    ctraderTickEngine.start();
    logger.info({
      accountId: opts.ctidTraderAccountId,
      isLive:    opts.isLive,
    }, "CtraderSpots: auto-started (zero initial subscriptions — waiting for watchlist)");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info({ reason: msg }, "CtraderSpots: auto-start skipped (config not ready)");
  }
}

/**
 * Called at server startup (after autoStartCtraderEngine) to subscribe all
 * cTrader symbols currently in the watchlist.
 * Safe to call even if engine is not yet streaming — symbols are queued in the
 * subscribedIds Set and sent on the next ACCT_AUTH_RES.
 */
export async function subscribeWatchlistCtraderSymbols(): Promise<void> {
  try {
    const { asc } = await import("drizzle-orm");
    const items = await db.select({ symbol: watchlistTable.symbol })
      .from(watchlistTable)
      .orderBy(asc(watchlistTable.position));

    let count = 0;
    for (const { symbol } of items) {
      const row = await getCtraderSymbolRow(symbol);
      if (row) {
        ctraderTickEngine.addSymbol(row.symbolId, row.symbolName);
        count++;
      }
    }
    if (count > 0) {
      logger.info({ count }, "CtraderSpots: subscribed watchlist cTrader symbols at startup");
    }
  } catch (err) {
    logger.warn({ err }, "CtraderSpots: subscribeWatchlistCtraderSymbols failed (non-fatal)");
  }
}
