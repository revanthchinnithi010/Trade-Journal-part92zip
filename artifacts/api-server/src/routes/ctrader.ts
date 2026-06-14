import { Router } from "express";
import { randomBytes } from "crypto";
import { pool } from "@workspace/db";
import { encrypt } from "../services/BrokerEncryption.js";
import { fetchCTraderAccountsRest } from "../brokers/CTraderTradingAdapter.js";
import { BrokerService } from "../brokers/BrokerService.js";
import type { CTraderService } from "../services/CTraderService.js";
import { logger } from "../lib/logger.js";

export function createCTraderRouter(ctrader: CTraderService): Router {
  const router = Router();

  router.get("/ctrader/config", async (req, res) => {
    const clientId = process.env["CTRADER_CLIENT_ID"];
    const configured = !!(clientId && process.env["CTRADER_CLIENT_SECRET"]);
    const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
    const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.hostname;
    const redirectUri = `${proto}://${host}/api/ctrader/callback`;
    logger.info({
      "x-forwarded-proto": req.headers["x-forwarded-proto"] ?? "(not set)",
      "x-forwarded-host": req.headers["x-forwarded-host"] ?? "(not set)",
      "x-forwarded-for": req.headers["x-forwarded-for"] ?? "(not set)",
      "req.protocol": req.protocol,
      "req.hostname": req.hostname,
      "resolved_proto": proto,
      "resolved_host": host,
      "redirect_uri": redirectUri,
    }, "ctrader/config: redirect_uri debug");

    let authUrl: string | null = null;
    if (configured) {
      try {
        const state = randomBytes(16).toString("hex");
        req.session.ctraderOAuthState = state;
        await new Promise<void>((resolve, reject) =>
          req.session.save((err) => (err ? reject(err) : resolve())),
        );
        authUrl = ctrader.buildAuthUrl(redirectUri, state);
        logger.info({ state }, "ctrader/config: OAuth state stored in session");
      } catch (err) {
        logger.warn({ err }, "ctrader/config: failed to store OAuth state");
      }
    }

    res.json({ configured, clientId: configured ? clientId : null, redirectUri, authUrl });
  });

  router.get("/ctrader/status", (_req, res) => {
    res.json(ctrader.getStatus());
  });

  router.get("/ctrader/callback", async (req, res) => {
    const { code, error, error_description, state } = req.query as Record<string, string>;

    if (error) {
      logger.warn({ error, error_description }, "ctrader/callback: provider error");
      return res.send(popupHtml("error", error_description ?? error));
    }

    if (!code) {
      return res.send(popupHtml("error", "missing_code"));
    }

    if (state) {
      const expected = req.session.ctraderOAuthState;
      if (!expected || expected !== state) {
        logger.warn(
          { state, expected, sessionId: req.sessionID },
          "ctrader/callback: OAuth state mismatch",
        );
        return res.send(popupHtml("error", "session_expired_please_retry"));
      }
      delete req.session.ctraderOAuthState;
    }

    try {
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.hostname;
      const redirectUri = `${proto}://${host}/api/ctrader/callback`;

      logger.info("ctrader/callback: exchanging authorization code for tokens");
      await ctrader.handleOAuthCode(code, redirectUri);

      const accessToken = ctrader.currentAccessToken;
      if (!accessToken) throw new Error("No access token after OAuth exchange");

      let ctidAccountId: string | null = null;
      let traderLogin: string | null = null;

      try {
        const accounts = await fetchCTraderAccountsRest(accessToken);
        const live = accounts.find((a) => a.isLive) ?? accounts[0];
        if (live) {
          ctidAccountId = String(live.ctidTraderAccountId);
          traderLogin = live.traderLogin;
          logger.info({ ctidAccountId, traderLogin }, "ctrader/callback: resolved trading account");
        }
      } catch (err) {
        logger.warn({ err }, "ctrader/callback: could not fetch accounts from REST API");
      }

      if (!ctidAccountId) {
        ctidAccountId = "pending";
      }

      const apiKeyEnc = encrypt(accessToken);
      const apiSecretEnc = encrypt(ctidAccountId);
      const apiToken = randomBytes(32).toString("hex");
      const label = traderLogin ? `cTrader ${traderLogin}` : "cTrader";

      const existing = await pool.query(
        `SELECT id FROM broker_accounts WHERE broker_id = 'ctrader'`,
      );

      let accountId: number;

      if (existing.rows.length > 0) {
        accountId = existing.rows[0].id as number;
        BrokerService.evict(accountId);
        await pool.query(
          `UPDATE broker_accounts
           SET api_key_enc=$1, api_secret_enc=$2, label=$3, is_active=true, api_token=$4
           WHERE id=$5`,
          [apiKeyEnc, apiSecretEnc, label, apiToken, accountId],
        );
      } else {
        const row = await pool.query(
          `INSERT INTO broker_accounts (broker_id, label, api_key_enc, api_secret_enc, api_token, is_active)
           VALUES ('ctrader', $1, $2, $3, $4, true)
           RETURNING id`,
          [label, apiKeyEnc, apiSecretEnc, apiToken],
        );
        accountId = (row.rows[0] as { id: number }).id;
      }

      req.session.pendingBrokerAccount = { accountId, apiToken, label };
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );

      logger.info({ accountId }, "ctrader/callback: broker account created/updated");
      return res.send(popupHtml("success", null));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown_error";
      logger.error({ err }, "ctrader/callback: token exchange failed");
      return res.send(popupHtml("error", msg));
    }
  });

  router.get("/ctrader/pending-account", (req, res) => {
    const pending = req.session.pendingBrokerAccount;
    if (!pending) {
      res.status(404).json({ ok: false, error: "No pending cTrader account in session" });
      return;
    }
    delete req.session.pendingBrokerAccount;
    req.session.save(() => {});
    res.json({ ok: true, accountId: pending.accountId, apiToken: pending.apiToken, label: pending.label });
  });

  router.post("/ctrader/disconnect", async (_req, res) => {
    try {
      await ctrader.disconnect();
      res.json({ ok: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown";
      res.status(500).json({ ok: false, error: msg });
    }
  });

  router.get("/ctrader/ticks", (_req, res) => {
    const status = ctrader.getStatus();
    res.json({ ticks: status.ticks, latencyMs: status.latencyMs, connected: status.connected });
  });

  return router;
}

function popupHtml(status: "success" | "error", message: string | null): string {
  const safeMsg = message ? message.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>cTrader OAuth</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #0D1C16; color: #F3FFF3; text-align: center; }
    .icon { font-size: 48px; margin-bottom: 12px; }
    p { color: rgba(167,184,169,0.7); font-size: 13px; margin-top: 8px; }
  </style>
</head>
<body>
  <div>
    <div class="icon">${status === "success" ? "✅" : "❌"}</div>
    <h2>${status === "success" ? "Connected!" : "Connection Failed"}</h2>
    ${safeMsg ? `<p>${safeMsg}</p>` : ""}
    <p>${status === "success" ? "You can close this window." : "Please close this window and try again."}</p>
  </div>
  <script>
    (function () {
      try {
        window.opener && window.opener.postMessage(
          { type: 'ctrader_oauth_result', status: '${status}', message: ${JSON.stringify(message ?? "")} },
          '*'
        );
      } catch (_) {}
      setTimeout(function () { window.close(); }, 1200);
    })();
  </script>
</body>
</html>`;
}
