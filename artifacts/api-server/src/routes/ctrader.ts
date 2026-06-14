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
    const redirectUri = resolveRedirectUri(req);
    logger.info({
      "CTRADER_REDIRECT_URI_env": process.env["CTRADER_REDIRECT_URI"] ?? "(not set)",
      "x-forwarded-proto": req.headers["x-forwarded-proto"] ?? "(not set)",
      "x-forwarded-host": req.headers["x-forwarded-host"] ?? "(not set)",
      "x-forwarded-for": req.headers["x-forwarded-for"] ?? "(not set)",
      "req.protocol": req.protocol,
      "req.hostname": req.hostname,
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
      const redirectUri = resolveRedirectUri(req);

      logger.info({ redirectUri }, "ctrader/callback: exchanging authorization code for tokens");
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

  router.get("/ctrader/diagnostics", (_req, res) => {
    const s = ctrader.getStatus();
    const idx = s.stateIdx; // -1 if state is unknown

    function stepStatus(readyAtIdx: number): "done" | "active" | "pending" {
      if (idx >= readyAtIdx) return "done";
      if (idx >= readyAtIdx - 2 && idx >= 0) return "active";
      return "pending";
    }

    res.json({
      state: s.state,
      connected: s.connected,
      hasToken: s.hasToken,
      activeAccountId: s.activeAccountId,
      symbolCount: s.symbolCount,
      latencyMs: s.latencyMs,
      lastError: s.lastError,
      steps: [
        {
          id: "oauth",
          label: "OAuth authorized",
          status: s.hasToken ? "done" : "active",
          detail: s.hasToken ? "Access token stored" : "Awaiting authorization",
        },
        {
          id: "accounts",
          label: "Trading account loaded",
          status: s.activeAccountId ? "done" : (idx >= 1 ? "active" : "pending"),
          detail: s.activeAccountId
            ? `Account ID ${s.activeAccountId}`
            : "Authenticating with cTrader",
        },
        {
          id: "symbols",
          label: "Symbol catalog downloaded",
          status: s.symbolCount > 0 ? "done" : stepStatus(5),
          detail: s.symbolCount > 0
            ? `${s.symbolCount.toLocaleString()} symbols loaded`
            : "Downloading symbol list",
        },
        {
          id: "websocket",
          label: "WebSocket session active",
          status: s.connected ? "done" : (idx >= 1 ? "active" : "pending"),
          detail: s.connected
            ? `${s.latencyMs}ms latency`
            : s.state === "subscribed" ? "Connected" : `Connecting… (${s.state})`,
        },
      ],
      error: s.lastError ?? (s.state === "error" ? "Connection failed — check credentials and retry" : null),
    });
  });

  return router;
}

function resolveRedirectUri(req: import("express").Request): string {
  if (process.env["CTRADER_REDIRECT_URI"]) {
    return process.env["CTRADER_REDIRECT_URI"];
  }
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.hostname;
  return `${proto}://${host}/api/ctrader/callback`;
}

function popupHtml(status: "success" | "error", message: string | null): string {
  const safeMsg = message ? message.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
  const safeMessage = JSON.stringify(message ?? "");
  const redirectParam = status === "success"
    ? "ctrader_connected=true"
    : `ctrader_error=${encodeURIComponent(message ?? "oauth_failed")}`;

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
    <p id="sub">${status === "success" ? "You can close this window." : "Please close this window and try again."}</p>
  </div>
  <script>
    (function () {
      console.log('[cTrader OAuth callback] entered — status: ${status}');
      var openerAvailable = false;
      try { openerAvailable = !!(window.opener && window.opener.postMessage); } catch (_) {}
      console.log('[cTrader OAuth callback] window.opener available:', openerAvailable);

      if (openerAvailable) {
        // Popup mode: notify parent via postMessage then close
        try {
          window.opener.postMessage(
            { type: 'ctrader_oauth_result', status: '${status}', message: ${safeMessage} },
            '*'
          );
          console.log('[cTrader OAuth callback] postMessage sent to opener');
        } catch (e) {
          console.warn('[cTrader OAuth callback] postMessage failed:', e);
        }
        setTimeout(function () { window.close(); }, 1200);
      } else {
        // Same-tab / mobile mode: redirect back to the app with result in URL
        console.log('[cTrader OAuth callback] no opener — redirecting to app with ?${redirectParam}');
        document.getElementById('sub').textContent = 'Returning to app…';
        setTimeout(function () {
          window.location.replace('/brokers?${redirectParam}');
        }, 400);
      }
    })();
  </script>
</body>
</html>`;
}
