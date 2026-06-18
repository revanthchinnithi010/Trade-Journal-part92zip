/**
 * cTrader Spot Streaming routes
 *
 * POST /api/ctrader/spots/start   — start the tick engine
 * POST /api/ctrader/spots/stop    — stop the tick engine
 * GET  /api/ctrader/spots/status  — engine status + sample ticks
 */

import { Router } from "express";
import { ctraderTickEngine } from "../services/CtraderTickEngine.js";
import { pool } from "@workspace/db";
import { decrypt } from "../services/BrokerEncryption.js";
import { logger } from "../lib/logger.js";

async function loadEngineOpts() {
  const clientId     = process.env["CTRADER_CLIENT_ID"];
  const clientSecret = process.env["CTRADER_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET not set");
  }

  // Access token (encrypted) from ctrader_tokens table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_tokens (
      id                SERIAL PRIMARY KEY,
      access_token_enc  TEXT NOT NULL,
      refresh_token_enc TEXT NOT NULL,
      expires_at        BIGINT NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  const tokenRow = await pool.query(
    "SELECT access_token_enc FROM ctrader_tokens ORDER BY id DESC LIMIT 1",
  );
  if (!tokenRow.rows.length) throw new Error("No cTrader token stored — complete OAuth first");
  const accessToken = decrypt((tokenRow.rows[0] as { access_token_enc: string }).access_token_enc);
  if (!accessToken) throw new Error("Could not decrypt cTrader access token");

  // Account config (stored when symbols were wired via symbols-cache)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_spot_config (
      id         INTEGER PRIMARY KEY DEFAULT 1,
      account_id BIGINT  NOT NULL,
      is_live    BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  const cfgRow = await pool.query(
    "SELECT account_id, is_live FROM ctrader_spot_config WHERE id = 1",
  );
  if (!cfgRow.rows.length) throw new Error("No account configured — wire symbols first (supply accountId)");
  const { account_id, is_live } = cfgRow.rows[0] as { account_id: number; is_live: boolean };

  // Symbol map from ctrader_symbols table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_symbols (
      symbol_id    INTEGER PRIMARY KEY,
      symbol_name  TEXT NOT NULL,
      description  TEXT NOT NULL,
      pip_position INTEGER NOT NULL,
      digits       INTEGER NOT NULL,
      fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  const symRows = await pool.query(
    "SELECT symbol_id, symbol_name FROM ctrader_symbols ORDER BY symbol_id",
  );
  if (!symRows.rows.length) throw new Error("No symbols in DB — wire symbols first");

  const symbolMap = new Map<number, string>();
  const symbolIds: number[] = [];
  for (const row of symRows.rows as { symbol_id: number; symbol_name: string }[]) {
    symbolMap.set(Number(row.symbol_id), row.symbol_name);
    symbolIds.push(Number(row.symbol_id));
  }

  return {
    clientId, clientSecret,
    accessToken,
    ctidTraderAccountId: Number(account_id),
    isLive: Boolean(is_live),
    symbolIds, symbolMap,
  };
}

export function createCtraderSpotsRouter(): Router {
  const router = Router();

  // POST /api/ctrader/spots/start
  router.post("/ctrader/spots/start", async (req, res) => {
    try {
      const current = ctraderTickEngine.getStatus();
      if (current.status === "streaming") {
        return res.json({ ok: true, message: "Already streaming", status: current });
      }

      let opts = await loadEngineOpts();

      // Allow request body to override accountId / isLive
      const body = req.body as { ctidTraderAccountId?: number; accountId?: number; isLive?: boolean };
      const overrideId = body.ctidTraderAccountId ?? body.accountId;
      if (overrideId) opts.ctidTraderAccountId = Number(overrideId);
      if (body.isLive !== undefined) opts.isLive = Boolean(body.isLive);

      ctraderTickEngine.stop();
      ctraderTickEngine.configure(opts);
      ctraderTickEngine.start();

      logger.info({
        accountId:   opts.ctidTraderAccountId,
        isLive:      opts.isLive,
        symbolCount: opts.symbolIds.length,
      }, "CtraderSpots: engine started via API");

      return res.json({
        ok: true,
        message: "Engine starting",
        accountId:   opts.ctidTraderAccountId,
        isLive:      opts.isLive,
        symbolCount: opts.symbolIds.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "CtraderSpots: start error");
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
    const status     = ctraderTickEngine.getStatus();
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
      accountId:   opts.ctidTraderAccountId,
      isLive:      opts.isLive,
      symbolCount: opts.symbolIds.length,
    }, "CtraderSpots: auto-started on server boot");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info({ reason: msg }, "CtraderSpots: auto-start skipped (config not ready)");
  }
}
