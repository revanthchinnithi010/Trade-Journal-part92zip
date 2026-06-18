import { Router } from "express";
import { randomBytes } from "crypto";
import { pool } from "@workspace/db";
import { encrypt, decrypt } from "../services/BrokerEncryption.js";
import { logger } from "../lib/logger.js";
import { fetchSymbolsViaProtoOA, fetchSymbolsVerbose, probeAppAuth, type CtraderSymbol } from "../lib/ctraderProtoOA.js";

const CTRADER_AUTH_URL  = "https://openapi.ctrader.com/apps/auth";
const CTRADER_TOKEN_URL = "https://openapi.ctrader.com/apps/token";
// REST API lives on api.spotware.com (api.openapi.ctrader.com does NOT resolve in all environments)
const CTRADER_API_BASE  = "https://api.spotware.com";
// Parameter name for Spotware REST is oauth_token (not accessToken)
const CTRADER_TOKEN_PARAM = "oauth_token";

const ENSURE_TOKENS_TABLE = `
  CREATE TABLE IF NOT EXISTS ctrader_tokens (
    id               SERIAL PRIMARY KEY,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT NOT NULL,
    expires_at       BIGINT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

async function ensureTokensTable(): Promise<void> {
  await pool.query(ENSURE_TOKENS_TABLE);
}

async function createCtraderOAuthState(): Promise<string> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_oauth_state (
      state      TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  const state = randomBytes(16).toString("hex");
  await pool.query("INSERT INTO ctrader_oauth_state (state) VALUES ($1)", [state]);
  await pool.query("DELETE FROM ctrader_oauth_state WHERE created_at < NOW() - INTERVAL '15 minutes'");
  return state;
}

async function validateCtraderOAuthState(state: string): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM ctrader_oauth_state WHERE state = $1 RETURNING state",
    [state],
  );
  return result.rowCount !== null && result.rowCount > 0;
}

async function getStoredToken(): Promise<{ token: string; expiresAt: number } | null> {
  await ensureTokensTable();
  const row = await pool.query(
    "SELECT access_token_enc, expires_at FROM ctrader_tokens ORDER BY id DESC LIMIT 1",
  );
  if (!row.rows.length) return null;
  const r = row.rows[0] as { access_token_enc: string; expires_at: number };
  const token = decrypt(r.access_token_enc);
  if (!token) return null;
  return { token, expiresAt: r.expires_at };
}

export function createCtraderOAuthRouter(): Router {
  const router = Router();

  router.get("/ctrader/debug-config", (req, res) => {
    const clientId     = process.env["CTRADER_CLIENT_ID"];
    const clientSecret = process.env["CTRADER_CLIENT_SECRET"];
    const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
    const host  = (req.headers["x-forwarded-host"]  as string | undefined) ?? req.hostname;
    res.json({
      hasClientId:     !!clientId,
      hasClientSecret: !!clientSecret,
      clientIdLength:  clientId?.length ?? 0,
      redirectUri:     `${proto}://${host}/api/ctrader/oauth/callback`,
    });
  });

  router.get("/ctrader/oauth/config", async (req, res) => {
    const clientId = process.env["CTRADER_CLIENT_ID"];
    const configured = !!(clientId && process.env["CTRADER_CLIENT_SECRET"]);

    const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
    const host  = (req.headers["x-forwarded-host"]  as string | undefined) ?? req.hostname;
    const redirectUri = `${proto}://${host}/api/ctrader/oauth/callback`;

    let authUrl: string | null = null;
    if (configured) {
      try {
        const state = await createCtraderOAuthState();
        const params = new URLSearchParams({
          client_id:     clientId!,
          redirect_uri:  redirectUri,
          response_type: "code",
          scope:         "accounts",
          state,
        });
        authUrl = `${CTRADER_AUTH_URL}?${params.toString()}`;
        logger.info({ state }, "ctrader/oauth/config: auth URL built");
      } catch (err) {
        logger.warn({ err }, "ctrader/oauth/config: failed to build auth URL");
      }
    } else {
      logger.warn("ctrader/oauth/config: CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET not set");
    }

    res.json({ configured, redirectUri, authUrl });
  });

  router.get("/ctrader/oauth/callback", async (req, res) => {
    const { code, error, error_description, state } = req.query as Record<string, string>;

    if (error) {
      logger.warn({ error, error_description }, "ctrader/oauth/callback: provider returned error");
      return res.send(popupHtml("error", error_description ?? error));
    }
    if (!code) return res.send(popupHtml("error", "missing_authorization_code"));

    if (state) {
      const valid = await validateCtraderOAuthState(state);
      if (!valid) {
        logger.warn({ state }, "ctrader/oauth/callback: CSRF state mismatch");
        return res.send(popupHtml("error", "session_expired_please_retry"));
      }
    }

    try {
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
      const host  = (req.headers["x-forwarded-host"]  as string | undefined) ?? req.hostname;
      const redirectUri = `${proto}://${host}/api/ctrader/oauth/callback`;

      const clientId     = process.env["CTRADER_CLIENT_ID"]!;
      const clientSecret = process.env["CTRADER_CLIENT_SECRET"]!;

      logger.info("ctrader/oauth/callback: exchanging code for tokens");

      const tokenRes = await fetch(CTRADER_TOKEN_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "authorization_code",
          code,
          redirect_uri:  redirectUri,
          client_id:     clientId,
          client_secret: clientSecret,
        }).toString(),
      });

      type TokenPayload = {
        access_token?:  string;
        refresh_token?: string;
        expires_in?:    number;
        error?:         string;
        error_description?: string;
      };
      const tokenData = (await tokenRes.json()) as TokenPayload;

      if (!tokenRes.ok || !tokenData.access_token) {
        const msg = tokenData.error ?? `HTTP ${tokenRes.status}`;
        logger.error({ status: tokenRes.status, msg }, "ctrader/oauth/callback: token exchange failed");
        throw new Error(`Token exchange failed: ${msg}`);
      }

      const accessToken  = tokenData.access_token;
      const refreshToken = tokenData.refresh_token ?? "";
      const expiresIn    = tokenData.expires_in ?? 3600;
      const expiresAt    = Math.floor(Date.now() / 1000) + expiresIn;

      await ensureTokensTable();
      const existing = await pool.query("SELECT id FROM ctrader_tokens LIMIT 1");
      if (existing.rows.length > 0) {
        await pool.query(
          "UPDATE ctrader_tokens SET access_token_enc=$1, refresh_token_enc=$2, expires_at=$3, updated_at=NOW() WHERE id=$4",
          [encrypt(accessToken), encrypt(refreshToken), expiresAt, (existing.rows[0] as { id: number }).id],
        );
      } else {
        await pool.query(
          "INSERT INTO ctrader_tokens (access_token_enc, refresh_token_enc, expires_at) VALUES ($1,$2,$3)",
          [encrypt(accessToken), encrypt(refreshToken), expiresAt],
        );
      }

      const maskedToken = `${accessToken.slice(0, 12)}...${accessToken.slice(-6)}`;
      logger.info({ expiresAt, maskedToken }, "ctrader/oauth/callback: tokens stored");
      return res.send(popupHtml("success", null, { maskedToken, expiresAt }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown_error";
      logger.error({ err }, "ctrader/oauth/callback: unhandled error");
      return res.send(popupHtml("error", msg));
    }
  });

  router.get("/ctrader/oauth/status", async (_req, res) => {
    try {
      await ensureTokensTable();
      const row = await pool.query(
        "SELECT id, expires_at, updated_at FROM ctrader_tokens ORDER BY id DESC LIMIT 1",
      );
      if (!row.rows.length) return res.json({ connected: false });
      const r   = row.rows[0] as { id: number; expires_at: number; updated_at: Date };
      const now = Math.floor(Date.now() / 1000);
      return res.json({
        connected:  true,
        id:         r.id,
        expires_at: r.expires_at,
        expired:    r.expires_at < now,
        updated_at: r.updated_at,
      });
    } catch (err) {
      logger.warn({ err }, "ctrader/oauth/status: DB error");
      res.status(500).json({ connected: false, error: "DB error" });
    }
  });

  router.get("/ctrader/oauth/token", async (_req, res) => {
    try {
      const stored = await getStoredToken();
      if (!stored) return res.status(404).json({ ok: false, error: "No token stored" });
      const masked = `${stored.token.slice(0, 12)}...${stored.token.slice(-6)}`;
      return res.json({
        ok:           true,
        masked_token: masked,
        full_token:   stored.token,
        expires_at:   stored.expiresAt,
        expired:      stored.expiresAt < Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      logger.warn({ err }, "ctrader/oauth/token: error");
      res.status(500).json({ ok: false, error: "Server error" });
    }
  });

  // ── Connectivity probe ────────────────────────────────────────────────────
  router.get("/ctrader/ping", async (_req, res) => {
    const targets = [
      "https://api.spotware.com",
      "https://api.spotware.com/connect/tradingaccounts",
      "https://openapi.ctrader.com",
    ];
    const results: Record<string, unknown> = {};

    for (const url of targets) {
      try {
        const r = await fetch(url, {
          signal:   AbortSignal.timeout(8_000),
          redirect: "manual",
        });
        const body = await r.text();
        results[url] = {
          ok:          r.ok,
          http_status: r.status,
          body_length: body.length,
          body_preview: body.slice(0, 200),
          content_type: r.headers.get("content-type"),
        };
      } catch (e: unknown) {
        const err = e as Error & { cause?: Error & { code?: string } };
        results[url] = {
          ok:         false,
          error_name: err.name,
          error_msg:  err.message,
          cause_msg:  err.cause?.message,
          cause_code: err.cause?.code,
          stack:      err.stack?.slice(0, 400),
        };
      }
    }

    logger.info({ results }, "ctrader/ping: connectivity probe");
    res.json({ results });
  });

  // ── GET /api/ctrader/accounts (clean path used by frontend) ───────────────
  router.get("/ctrader/accounts", async (_req, res) => {
    return handleFetchAccounts(res);
  });

  // ── GET /api/ctrader/auth-test — try Mode A (numeric-only) then Mode B (full env var) ──
  // Official Spotware clientId format: '{appId}_{longAlphanumeric}'
  // Example from connect-nodejs-samples: '7_5az7pj935owsss8kgokcco84wc8osk0g0gksow0ow4s4ocwwgc'
  // Mode A: numeric-only portion of CTRADER_CLIENT_ID  (e.g. "26547")
  // Mode B: full CTRADER_CLIENT_ID env var as-is        (e.g. "26547_abc123...")
  // Run both sequentially; log which gets APP_AUTH_RES vs Bye/ERROR_RES
  router.get("/ctrader/auth-test", async (req, res) => {
    const isLive = req.query.isLive === "true";

    const rawClientId  = process.env.CTRADER_CLIENT_ID  ?? "";
    const clientSecret = process.env.CTRADER_CLIENT_SECRET ?? "";

    if (!rawClientId || !clientSecret) {
      return res.status(500).json({
        ok: false,
        error: "CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET not configured",
      });
    }

    // Mode A: extract only the numeric leading digits
    // e.g. "26547_abc" → "26547"  |  "26547" → "26547"
    const modeAClientId = rawClientId.replace(/[^0-9].*$/, "").trim() || rawClientId.trim();
    // Mode B: full value as stored in the Secret
    const modeBClientId = rawClientId;

    logger.info({
      isLive,
      modeA: { clientId: modeAClientId, length: modeAClientId.length },
      modeB: { clientId: modeBClientId, length: modeBClientId.length },
      secretLen: clientSecret.length,
      note: [
        "Official Spotware clientId format: '{appId}_{longAlphanumericString}'",
        "Example from connect-nodejs-samples: '7_5az7pj935owsss8kgokcco84wc8osk0g0gksow0ow4s4ocwwgc'",
        "If Mode A == Mode B == numeric only, CTRADER_CLIENT_ID needs the full string from the portal.",
      ],
    }, "ctrader/auth-test: starting dual-mode probe");

    const [modeA, modeB] = await Promise.allSettled([
      probeAppAuth({ clientId: modeAClientId, clientSecret, isLive, mode: "A", timeoutMs: 14_000 }),
      // stagger B by 200ms so logs are distinguishable
      new Promise<void>(r => setTimeout(r, 200)).then(() =>
        probeAppAuth({ clientId: modeBClientId, clientSecret, isLive, mode: "B", timeoutMs: 14_000 })
      ),
    ]);

    const resultA = modeA.status === "fulfilled" ? modeA.value : { mode: "A", success: false, error: String((modeA as PromiseRejectedResult).reason) };
    const resultB = modeB.status === "fulfilled" ? modeB.value : { mode: "B", success: false, error: String((modeB as PromiseRejectedResult).reason) };

    logger.info({
      modeA: { success: resultA.success, closeReason: (resultA as any).closeReason, errorCode: (resultA as any).errorCode },
      modeB: { success: resultB.success, closeReason: (resultB as any).closeReason, errorCode: (resultB as any).errorCode },
    }, "ctrader/auth-test: SUMMARY");

    return res.json({
      ok:  resultA.success || resultB.success,
      isLive,
      note: {
        officialFormat: "'{appId}_{longAlphanumeric}' e.g. '26547_abc123...'",
        source:         "github.com/spotware/connect-nodejs-samples/index.js",
        fix: !resultA.success && !resultB.success
          ? "Both modes failed. Go to id.ctrader.com → your app → copy the full 'Client ID' string (format: 26547_xxxx...) and update CTRADER_CLIENT_ID in Replit Secrets."
          : "One mode succeeded — see which one to know the correct clientId format.",
      },
      modeA: resultA,
      modeB: resultB,
    });
  });

  // ── ProtoOA WebSocket symbol fetch (replaces broken REST /symbol endpoint) ──
  router.get("/ctrader/symbols/:accountId", async (req, res) => {
    const ctidTraderAccountId = parseInt(req.params.accountId, 10);
    const isLive = req.query.isLive === "true";

    if (isNaN(ctidTraderAccountId) || ctidTraderAccountId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid ctidTraderAccountId" });
    }

    const stored = await getStoredToken().catch(() => null);
    if (!stored) {
      return res.status(401).json({ ok: false, error: "Not authenticated — complete OAuth first" });
    }

    const clientId     = process.env.CTRADER_CLIENT_ID;
    const clientSecret = process.env.CTRADER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ ok: false, error: "CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET not configured" });
    }

    logger.info({ ctidTraderAccountId, isLive }, "ctrader/symbols: starting ProtoOA WS flow");

    try {
      const symbols = await fetchSymbolsViaProtoOA({
        ctidTraderAccountId,
        isLive,
        accessToken:  stored.token,
        clientId,
        clientSecret,
        timeoutMs:    25_000,
      });

      logger.info({ ctidTraderAccountId, count: symbols.length }, "ctrader/symbols: ProtoOA fetch complete");

      return res.json({
        ok:      true,
        via:     "protoa_ws",
        count:   symbols.length,
        symbols,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err, ctidTraderAccountId, isLive }, "ctrader/symbols: ProtoOA error");
      return res.status(502).json({ ok: false, error: msg });
    }
  });

  // ── Cache cTrader symbols to DB ──────────────────────────────────────────────
  async function cacheCtraderSymbols(symbols: CtraderSymbol[]): Promise<void> {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ctrader_symbols (
        symbol_id    INTEGER PRIMARY KEY,
        symbol_name  TEXT NOT NULL,
        description  TEXT NOT NULL,
        pip_position INTEGER NOT NULL,
        digits       INTEGER NOT NULL,
        fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    for (const sym of symbols) {
      await pool.query(
        `INSERT INTO ctrader_symbols (symbol_id, symbol_name, description, pip_position, digits, fetched_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (symbol_id) DO UPDATE SET
           symbol_name  = EXCLUDED.symbol_name,
           description  = EXCLUDED.description,
           pip_position = EXCLUDED.pip_position,
           digits       = EXCLUDED.digits,
           fetched_at   = NOW()`,
        [sym.symbolId, sym.symbolName, sym.description, sym.pipPosition, sym.digits],
      );
    }
  }

  // ── Verbose ProtoOA symbol fetch — full 6-step trace ─────────────────────────
  router.get("/ctrader/symbols-verbose/:accountId", async (req, res) => {
    const ctidTraderAccountId = parseInt(req.params.accountId, 10);
    const isLive = req.query.isLive === "true";

    if (isNaN(ctidTraderAccountId) || ctidTraderAccountId <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid ctidTraderAccountId" });
    }

    const stored = await getStoredToken().catch(() => null);
    if (!stored) {
      return res.status(401).json({ ok: false, error: "Not authenticated — complete OAuth first" });
    }

    const clientId     = process.env.CTRADER_CLIENT_ID;
    const clientSecret = process.env.CTRADER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ ok: false, error: "CTRADER_CLIENT_ID or CTRADER_CLIENT_SECRET not configured" });
    }

    logger.info({ ctidTraderAccountId, isLive }, "ctrader/symbols-verbose: starting");

    try {
      const result = await fetchSymbolsVerbose({
        ctidTraderAccountId,
        isLive,
        accessToken:  stored.token,
        clientId,
        clientSecret,
        timeoutMs:    35_000,
      });

      logger.info({
        ok: result.ok, durationMs: result.durationMs,
        totalSymbols: result.totalSymbols, traceLen: result.trace.length,
        acctAuthOk: result.acctAuthOk,
      }, "ctrader/symbols-verbose: complete");

      return res.json({
        ok:             result.ok,
        trace:          result.trace,
        acctAuthOk:     result.acctAuthOk,
        acctAuthFields: result.acctAuthFields,
        errorCodes:     result.errorCodes,
        totalSymbols:   result.totalSymbols,
        first20:        result.first20,
        symbols:        result.symbols,
        durationMs:     result.durationMs,
        error:          result.error,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, ctidTraderAccountId, isLive }, "ctrader/symbols-verbose: error");
      return res.status(502).json({ ok: false, error: msg });
    }
  });

  // ── Wire (cache) cTrader symbols into DB so the broker watchlist can load them
  router.post("/ctrader/symbols-cache", async (req, res) => {
    const { symbols } = req.body as { symbols?: CtraderSymbol[] };
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ ok: false, error: "No symbols provided" });
    }
    try {
      await cacheCtraderSymbols(symbols);
      logger.info({ count: symbols.length }, "ctrader/symbols-cache: saved to DB");
      return res.json({ ok: true, cached: symbols.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "ctrader/symbols-cache: error");
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  // ── Read cached cTrader symbols from DB ───────────────────────────────────────
  router.get("/ctrader/symbols-cached", async (_req, res) => {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ctrader_symbols (
          symbol_id    INTEGER PRIMARY KEY,
          symbol_name  TEXT NOT NULL,
          description  TEXT NOT NULL,
          pip_position INTEGER NOT NULL,
          digits       INTEGER NOT NULL,
          fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      const rows = await pool.query(
        "SELECT symbol_id, symbol_name, description, pip_position, digits FROM ctrader_symbols ORDER BY symbol_name",
      );
      return res.json({ ok: true, count: rows.rowCount, symbols: rows.rows });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ ok: false, error: msg });
    }
  });

  async function handleFetchAccounts(res: import("express").Response): Promise<void> {
    try {
      const stored = await getStoredToken();
      if (!stored) {
        res.status(401).json({
          ok: false, error: "Not authenticated — complete OAuth first",
          raw: "", http_status: 401, accounts: null,
        });
        return;
      }

      const tokenPreview = `${stored.token.slice(0, 12)}...${stored.token.slice(-6)}`;
      // Correct Spotware REST endpoint — api.openapi.ctrader.com does not resolve universally
      const url = `${CTRADER_API_BASE}/connect/tradingaccounts?${CTRADER_TOKEN_PARAM}=${encodeURIComponent(stored.token)}`;
      const maskedUrl = url.replace(/oauth_token=[^&]+/, "oauth_token=***");

      logger.info(
        { url: maskedUrl, tokenPreview, base: CTRADER_API_BASE },
        "ctrader/accounts: calling Spotware REST server-side",
      );

      let body = "";
      let httpStatus = 0;
      let responseHeaders: Record<string, string> = {};
      let accountRes: Response | null = null;

      try {
        accountRes = await fetch(url, {
          signal:  AbortSignal.timeout(10_000),
          headers: {
            "Accept":        "application/json",
            "Authorization": `Bearer ${stored.token}`,
          },
        });
        httpStatus = accountRes.status;
        responseHeaders = Object.fromEntries(accountRes.headers);
        body = await accountRes.text();
      } catch (fetchErr: unknown) {
        const e = fetchErr as Error & { cause?: Error & { code?: string } };
        logger.error(
          {
            error_name:  e.name,
            error_msg:   e.message,
            cause_msg:   e.cause?.message,
            cause_code:  e.cause?.code,
            stack:       e.stack?.slice(0, 600),
            url:         maskedUrl,
          },
          "ctrader/accounts: server-side fetch failed",
        );
        res.status(502).json({
          ok:          false,
          error:       `Server-side fetch failed: ${e.message}`,
          error_name:  e.name,
          cause:       e.cause?.message,
          cause_code:  e.cause?.code,
          stack:       e.stack?.slice(0, 600),
          url_called:  maskedUrl,
          raw:         "",
          http_status: 0,
          accounts:    null,
        });
        return;
      }

      logger.info(
        {
          http_status:   httpStatus,
          body_length:   body.length,
          response_headers: responseHeaders,
          body_preview:  body.slice(0, 600),
        },
        "ctrader/accounts: Spotware REST response received",
      );

      let parsed: unknown = null;
      try { parsed = JSON.parse(body); } catch { /* keep null */ }

      const ok = accountRes?.ok ?? false;
      res.json({
        ok,
        http_status:      httpStatus,
        response_headers: responseHeaders,
        accounts:         ok ? parsed : null,
        raw:              body,
        url_called:       maskedUrl,
        note:             ok ? null : "HTTP 401/403 = token expired (re-run OAuth). HTTP 400 = wrong param. HTTP 0 = DNS/network.",
      });
    } catch (err: unknown) {
      const e = err as Error;
      logger.error({ err }, "ctrader/accounts: unhandled error");
      res.status(500).json({ ok: false, error: e.message, stack: e.stack?.slice(0, 400), raw: "", http_status: 500, accounts: null });
    }
  }

  router.get("/ctrader/oauth/accounts", async (_req, res) => {
    try {
      const stored = await getStoredToken();
      if (!stored) {
        return res.status(401).json({
          ok: false, error: "Not authenticated — run OAuth first",
          raw: "", http_status: 401, accounts: null,
        });
      }

      const tokenPreview = `${stored.token.slice(0, 12)}...${stored.token.slice(-6)}`;
      const url = `${CTRADER_API_BASE}/connect/tradingaccounts?${CTRADER_TOKEN_PARAM}=${encodeURIComponent(stored.token)}`;

      logger.info({ url: url.replace(/oauth_token=[^&]+/, "oauth_token=***"), tokenPreview }, "ctrader/oauth/accounts: calling REST API");

      let body = "";
      let httpStatus = 0;
      let accountRes: Response | null = null;

      try {
        accountRes = await fetch(url, {
          headers: {
            "Accept":        "application/json",
            "Authorization": `Bearer ${stored.token}`,
          },
        });
        httpStatus = accountRes.status;
        body = await accountRes.text();
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        logger.error({ err: fetchErr, url }, "ctrader/oauth/accounts: fetch failed");
        return res.status(502).json({
          ok: false, error: `Network error: ${msg}`,
          raw: "", http_status: 0, accounts: null, endpoint_url: url,
        });
      }

      logger.info(
        { http_status: httpStatus, body_length: body.length, body_preview: body.slice(0, 600) },
        "ctrader/oauth/accounts: raw response received",
      );

      let parsed: unknown = null;
      try { parsed = JSON.parse(body); } catch { /* keep null */ }

      const ok = accountRes?.ok ?? false;
      return res.json({
        ok,
        http_status: httpStatus,
        accounts:    ok ? parsed : null,
        raw:         body,
        endpoint_url: url.replace(/accessToken=[^&]+/, "accessToken=***"),
        note: ok ? null : "If you get 401/403, the token may have expired. Re-run OAuth. Full account list may require ProtoOA WebSocket.",
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      logger.error({ err }, "ctrader/oauth/accounts: unhandled error");
      res.status(500).json({
        ok: false, error: msg,
        raw: "", http_status: 500, accounts: null,
      });
    }
  });

  router.get("/ctrader/oauth/symbols/:accountId", async (req, res) => {
    const { accountId } = req.params;
    try {
      const stored = await getStoredToken();
      if (!stored) {
        return res.status(401).json({
          ok: false, error: "Not authenticated — run OAuth first",
          raw: "", http_status: 401,
        });
      }

      const url = `${CTRADER_API_BASE}/connect/symbol?ctidTraderAccountId=${accountId}&${CTRADER_TOKEN_PARAM}=${encodeURIComponent(stored.token)}`;
      logger.info({ accountId, url: url.replace(/oauth_token=[^&]+/, "oauth_token=***") }, "ctrader/oauth/symbols: querying symbol list");

      let body = "";
      let httpStatus = 0;
      let symRes: Response | null = null;

      try {
        symRes = await fetch(url, {
          headers: {
            "Accept":        "application/json",
            "Authorization": `Bearer ${stored.token}`,
          },
        });
        httpStatus = symRes.status;
        body = await symRes.text();
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        logger.error({ err: fetchErr }, "ctrader/oauth/symbols: fetch failed");
        return res.status(502).json({
          ok: false, error: `Network error: ${msg}`,
          raw: "", http_status: 0,
        });
      }

      logger.info(
        { http_status: httpStatus, body_length: body.length, body_preview: body.slice(0, 600) },
        "ctrader/oauth/symbols: raw response received",
      );

      let parsed: unknown = null;
      try { parsed = JSON.parse(body); } catch { /* keep null */ }

      if (!symRes?.ok) {
        return res.json({
          ok:          false,
          http_status: httpStatus,
          raw:         body,
          note:        "Symbol list via REST requires a valid ctidTraderAccountId. Full list needs ProtoOA WS.",
        });
      }

      const arr = Array.isArray(parsed)
        ? parsed
        : ((parsed as { symbol?: unknown[]; symbols?: unknown[] })?.symbol
            ?? (parsed as { symbol?: unknown[]; symbols?: unknown[] })?.symbols
            ?? []);
      return res.json({
        ok:          true,
        http_status: httpStatus,
        count:       arr.length,
        sample:      arr.slice(0, 20),
        raw:         body,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      logger.error({ err }, "ctrader/oauth/symbols: error");
      res.status(500).json({ ok: false, error: msg, raw: "", http_status: 500 });
    }
  });

  router.post("/ctrader/oauth/refresh", async (_req, res) => {
    try {
      await ensureTokensTable();
      const row = await pool.query(
        "SELECT id, refresh_token_enc FROM ctrader_tokens ORDER BY id DESC LIMIT 1",
      );
      if (!row.rows.length) return res.status(404).json({ ok: false, error: "No token stored" });
      const r            = row.rows[0] as { id: number; refresh_token_enc: string };
      const refreshToken = decrypt(r.refresh_token_enc);
      if (!refreshToken) return res.status(400).json({ ok: false, error: "No refresh token — please reconnect" });

      const clientId     = process.env["CTRADER_CLIENT_ID"]!;
      const clientSecret = process.env["CTRADER_CLIENT_SECRET"]!;

      const tokenRes = await fetch(CTRADER_TOKEN_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type:    "refresh_token",
          refresh_token: refreshToken,
          client_id:     clientId,
          client_secret: clientSecret,
        }).toString(),
      });

      type RefreshPayload = {
        access_token?:  string;
        refresh_token?: string;
        expires_in?:    number;
        error?:         string;
      };
      const tokenData = (await tokenRes.json()) as RefreshPayload;
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error ?? `HTTP ${tokenRes.status}`);
      }

      const newAccess    = tokenData.access_token;
      const newRefresh   = tokenData.refresh_token ?? refreshToken;
      const expiresAt    = Math.floor(Date.now() / 1000) + (tokenData.expires_in ?? 3600);

      await pool.query(
        "UPDATE ctrader_tokens SET access_token_enc=$1, refresh_token_enc=$2, expires_at=$3, updated_at=NOW() WHERE id=$4",
        [encrypt(newAccess), encrypt(newRefresh), expiresAt, r.id],
      );

      logger.info({ expiresAt }, "ctrader/oauth/refresh: tokens refreshed");
      return res.json({ ok: true, expires_at: expiresAt });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      logger.error({ err }, "ctrader/oauth/refresh: failed");
      res.status(502).json({ ok: false, error: msg });
    }
  });

  router.post("/ctrader/oauth/disconnect", async (_req, res) => {
    try {
      await ensureTokensTable();
      await pool.query("DELETE FROM ctrader_tokens");
      logger.info("ctrader/oauth/disconnect: tokens cleared");
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}

interface PopupToken { maskedToken: string; expiresAt: number }

function popupHtml(status: "success" | "error", message: string | null, token?: PopupToken): string {
  const safeMsg     = message ? message.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
  const safeMessage = JSON.stringify(message ?? "");
  const safeMasked  = token ? JSON.stringify(token.maskedToken) : "null";
  const safeExpires = token ? String(token.expiresAt)          : "null";
  const ok          = status === "success";

  return `<!doctype html><html><head>
  <meta charset="utf-8"/><title>cTrader OAuth</title>
  <style>
    body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
         min-height:100vh;margin:0;background:#0D1117;color:#F3FFF3;text-align:center}
    .icon{font-size:48px;margin-bottom:12px}
    h2{margin:0 0 8px;font-size:20px}
    p{color:rgba(167,184,169,0.7);font-size:13px;margin-top:8px}
    .badge{display:inline-block;margin-top:12px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;
           background:${ok?"rgba(183,255,90,0.12)":"rgba(239,68,68,0.12)"};
           color:${ok?"#B7FF5A":"#f87171"};
           border:1px solid ${ok?"rgba(183,255,90,0.3)":"rgba(239,68,68,0.3)"}}
  </style>
</head><body>
  <div>
    <div class="icon">${ok?"✅":"❌"}</div>
    <h2>${ok?"cTrader Connected!":"Connection Failed"}</h2>
    ${safeMsg?`<p>${safeMsg}</p>`:""}
    <div class="badge">${ok?"OAuth 2.0 authenticated":"Authentication error"}</div>
    <p>${ok?"You can close this window.":"Please close this window and try again."}</p>
  </div>
  <script>
    (function(){
      try{window.opener&&window.opener.postMessage(
        {type:'ctrader_oauth_result',status:'${status}',message:${safeMessage},maskedToken:${safeMasked},expiresAt:${safeExpires}},
        '*'
      );}catch(_){}
      setTimeout(function(){window.close();},1500);
    })();
  </script>
</body></html>`;
}
