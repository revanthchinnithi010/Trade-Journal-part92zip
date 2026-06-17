import { Router } from "express";
import { randomBytes } from "crypto";
import { pool } from "@workspace/db";
import { encrypt } from "../services/BrokerEncryption.js";
import { logger } from "../lib/logger.js";

const SPOTWARE_AUTH_URL = "https://connect.spotware.com/apps/auth";
const SPOTWARE_TOKEN_URL = "https://connect.spotware.com/apps/token";

async function createCtraderOAuthState(): Promise<string> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ctrader_oauth_state (
      state TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
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

function getRedirectUri(req: { headers: Record<string, string | string[] | undefined>; protocol: string; hostname: string }): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.hostname;
  return `${proto}://${host}/api/ctrader/oauth/callback`;
}

export function createCtraderOAuthRouter(): Router {
  const router = Router();

  router.get("/ctrader/oauth/config", async (req, res) => {
    const clientId = process.env["CTRADER_CLIENT_ID"];
    const configured = !!(clientId && process.env["CTRADER_CLIENT_SECRET"]);
    const redirectUri = getRedirectUri(req);

    let authUrl: string | null = null;
    if (configured) {
      try {
        const state = await createCtraderOAuthState();
        const params = new URLSearchParams({
          client_id: clientId!,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "trading",
          state,
        });
        authUrl = `${SPOTWARE_AUTH_URL}?${params.toString()}`;
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

    if (!code) {
      return res.send(popupHtml("error", "missing_authorization_code"));
    }

    if (state) {
      const valid = await validateCtraderOAuthState(state);
      if (!valid) {
        logger.warn({ state }, "ctrader/oauth/callback: CSRF state mismatch");
        return res.send(popupHtml("error", "session_expired_please_retry"));
      }
    }

    try {
      const redirectUri = getRedirectUri(req);
      const clientId = process.env["CTRADER_CLIENT_ID"]!;
      const clientSecret = process.env["CTRADER_CLIENT_SECRET"]!;

      logger.info("ctrader/oauth/callback: exchanging authorization code for tokens");

      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });

      const tokenRes = await fetch(SPOTWARE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      type TokenPayload = {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        token_type?: string;
        error?: string;
        error_description?: string;
      };

      const tokenData = (await tokenRes.json()) as TokenPayload;

      if (!tokenRes.ok || !tokenData.access_token) {
        const msg = tokenData.error_description ?? tokenData.error ?? `HTTP ${tokenRes.status}`;
        logger.error({ status: tokenRes.status, msg }, "ctrader/oauth/callback: token exchange failed");
        throw new Error(`Token exchange failed: ${msg}`);
      }

      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token ?? "";
      const expiresIn = tokenData.expires_in ?? 2592000;
      const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

      const apiKeyEnc = encrypt(accessToken);
      const apiSecretEnc = encrypt(refreshToken);
      const apiToken = randomBytes(32).toString("hex");
      const label = "cTrader Account";
      const meta = JSON.stringify({ auth_mode: "oauth", expires_at: expiresAt });

      const existing = await pool.query(
        `SELECT id FROM broker_accounts WHERE broker_id = 'ctrader' LIMIT 1`,
      );

      let accountId: number;

      if (existing.rows.length > 0) {
        accountId = (existing.rows[0] as { id: number }).id;
        await pool.query(
          `UPDATE broker_accounts
           SET api_key_enc=$1, api_secret_enc=$2, label=$3, is_active=true, api_token=$4, meta=$5
           WHERE id=$6`,
          [apiKeyEnc, apiSecretEnc, label, apiToken, meta, accountId],
        );
      } else {
        const row = await pool.query(
          `INSERT INTO broker_accounts (broker_id, label, api_key_enc, api_secret_enc, api_token, is_active, meta)
           VALUES ('ctrader', $1, $2, $3, $4, true, $5)
           RETURNING id`,
          [label, apiKeyEnc, apiSecretEnc, apiToken, meta],
        );
        accountId = (row.rows[0] as { id: number }).id;
      }

      logger.info({ accountId, expiresAt }, "ctrader/oauth/callback: account saved");
      return res.send(popupHtml("success", null, { accountId, apiToken, label }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown_error";
      logger.error({ err }, "ctrader/oauth/callback: unhandled error");
      return res.send(popupHtml("error", msg));
    }
  });

  router.get("/ctrader/oauth/pending-account", async (_req, res) => {
    try {
      const row = await pool.query(
        `SELECT id, label, api_token FROM broker_accounts
         WHERE broker_id = 'ctrader' AND is_active = true
         ORDER BY id DESC LIMIT 1`,
      );
      if (row.rows.length > 0) {
        const acc = row.rows[0] as { id: number; label: string; api_token: string };
        return res.json({ ok: true, accountId: acc.id, apiToken: acc.api_token, label: acc.label });
      }
      res.status(404).json({ ok: false, error: "No pending cTrader account" });
    } catch (err) {
      logger.warn({ err }, "ctrader/oauth/pending-account: DB error");
      res.status(500).json({ ok: false, error: "DB error" });
    }
  });

  router.post("/ctrader/oauth/disconnect", async (req, res) => {
    const { account_id } = req.body as { account_id?: number };
    try {
      if (account_id) {
        await pool.query(`DELETE FROM broker_accounts WHERE id=$1 AND broker_id='ctrader'`, [account_id]);
      } else {
        await pool.query(`DELETE FROM broker_accounts WHERE broker_id='ctrader'`);
      }
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}

interface AccountPayload {
  accountId: number;
  apiToken: string;
  label: string;
}

function popupHtml(status: "success" | "error", message: string | null, account?: AccountPayload): string {
  const safeMsg = message ? message.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
  const safeMessage = JSON.stringify(message ?? "");
  const safeAccountId = account ? String(account.accountId) : "null";
  const safeApiToken = account ? JSON.stringify(account.apiToken) : "null";
  const safeLabel = account ? JSON.stringify(account.label) : "null";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>cTrader OAuth</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #0D1117; color: #F3FFF3; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 12px; }
    h2 { margin: 0 0 8px; font-size: 20px; }
    p { color: rgba(167,184,169,0.7); font-size: 13px; margin-top: 8px; }
    .badge { display:inline-block; margin-top:12px; padding:4px 12px; border-radius:20px;
             font-size:11px; font-weight:600;
             background:${status === "success" ? "rgba(183,255,90,0.12)" : "rgba(239,68,68,0.12)"};
             color:${status === "success" ? "#B7FF5A" : "#f87171"};
             border:1px solid ${status === "success" ? "rgba(183,255,90,0.3)" : "rgba(239,68,68,0.3)"}; }
  </style>
</head>
<body>
  <div>
    <div class="icon">${status === "success" ? "✅" : "❌"}</div>
    <h2>${status === "success" ? "cTrader Connected!" : "Connection Failed"}</h2>
    ${safeMsg ? `<p>${safeMsg}</p>` : ""}
    <div class="badge">${status === "success" ? "OAuth 2.0 authenticated" : "Authentication error"}</div>
    <p>${status === "success" ? "You can close this window." : "Please close this window and try again."}</p>
  </div>
  <script>
    (function () {
      var cbStatus = '${status}';
      var accountId = ${safeAccountId};
      var apiToken  = ${safeApiToken};
      var label     = ${safeLabel};
      try {
        window.opener && window.opener.postMessage(
          {
            type: 'ctrader_oauth_result',
            status: cbStatus,
            message: ${safeMessage},
            accountId: accountId,
            apiToken: apiToken,
            label: label,
          },
          '*'
        );
      } catch (_) {}
      setTimeout(function () { window.close(); }, 1500);
    })();
  </script>
</body>
</html>`;
}
