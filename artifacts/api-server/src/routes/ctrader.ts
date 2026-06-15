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
      "sessionId_before_config": req.sessionID ?? "(none)",
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
        logger.info({ state, sessionId: req.sessionID }, "ctrader/config: OAuth state stored in session");
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

    logger.info({
      sessionId: req.sessionID,
      hasCode: !!code,
      hasError: !!error,
      hasState: !!state,
      sessionState: req.session.ctraderOAuthState ?? "(none)",
      cookies: Object.keys(req.cookies ?? {}),
    }, "ctrader/callback: ── RECEIVED ──");

    if (error) {
      logger.warn({ error, error_description, sessionId: req.sessionID }, "ctrader/callback: provider returned error");
      return res.send(popupHtml("error", error_description ?? error));
    }

    if (!code) {
      logger.warn({ sessionId: req.sessionID }, "ctrader/callback: missing authorization code");
      return res.send(popupHtml("error", "missing_code"));
    }

    logger.info({ sessionId: req.sessionID, codeLength: code.length }, "ctrader/callback: authorization code received");

    if (state) {
      const expected = req.session.ctraderOAuthState;
      logger.info({
        receivedState: state,
        expectedState: expected ?? "(none)",
        sessionId: req.sessionID,
        match: state === expected,
      }, "ctrader/callback: OAuth state check");

      if (!expected || expected !== state) {
        logger.warn(
          { state, expected, sessionId: req.sessionID },
          "ctrader/callback: ❌ OAuth state MISMATCH — session did not carry over from /config",
        );
        // State mismatch usually means session was lost. Continue anyway since
        // we log the mismatch for diagnosis and the token exchange can still succeed.
        // Return error only if state is present and wrong.
        return res.send(popupHtml("error", "session_expired_please_retry"));
      }
      delete req.session.ctraderOAuthState;
    }

    try {
      const redirectUri = resolveRedirectUri(req);

      logger.info({ redirectUri, sessionId: req.sessionID }, "ctrader/callback: exchanging authorization code for tokens");
      await ctrader.handleOAuthCode(code, redirectUri);

      const accessToken = ctrader.currentAccessToken;
      if (!accessToken) throw new Error("No access token after OAuth exchange");

      logger.info({ sessionId: req.sessionID, hasToken: true }, "ctrader/callback: ✅ token exchange SUCCESS");

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

      // Write to session as a fallback (may not survive cross-window navigation in proxied environments)
      req.session.pendingBrokerAccount = { accountId, apiToken, label };
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => {
          if (err) {
            logger.warn({ err, sessionId: req.sessionID }, "ctrader/callback: ⚠️ session save FAILED — account still in DB");
            reject(err);
          } else {
            logger.info({
              accountId,
              sessionId: req.sessionID,
              label,
            }, "ctrader/callback: ✅ session written with pendingBrokerAccount");
            resolve();
          }
        }),
      ).catch(() => {
        // Non-fatal: account is already in DB; clients will use DB fallback
      });

      logger.info({ accountId, label }, "ctrader/callback: broker account created/updated in DB");

      // Pass accountId + apiToken + label directly in the popup HTML so the
      // frontend can bypass the session-based pending-account lookup entirely.
      return res.send(popupHtml("success", null, { accountId, apiToken, label }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown_error";
      logger.error({ err, sessionId: req.sessionID }, "ctrader/callback: ❌ token exchange FAILED");
      return res.send(popupHtml("error", msg));
    }
  });

  router.get("/ctrader/pending-account", async (req, res) => {
    logger.info({ sessionId: req.sessionID, hasPending: !!req.session.pendingBrokerAccount },
      "ctrader/pending-account: request received");

    // 1. Try session first (works when popup and main window share a session)
    const pending = req.session.pendingBrokerAccount;
    if (pending) {
      logger.info({ accountId: pending.accountId, sessionId: req.sessionID },
        "ctrader/pending-account: ✅ found in session");
      delete req.session.pendingBrokerAccount;
      req.session.save(() => {});
      return res.json({ ok: true, accountId: pending.accountId, apiToken: pending.apiToken, label: pending.label });
    }

    // 2. Session miss (Replit proxy fragmentation) — fall back to the most recently
    //    updated active cTrader account in the DB.
    logger.warn({ sessionId: req.sessionID },
      "ctrader/pending-account: ⚠️ session miss — trying DB fallback");
    try {
      const row = await pool.query(
        `SELECT id, label, api_token FROM broker_accounts
         WHERE broker_id = 'ctrader' AND is_active = true
         ORDER BY id DESC
         LIMIT 1`,
      );
      if (row.rows.length > 0) {
        const acc = row.rows[0] as { id: number; label: string; api_token: string };
        logger.info({ accountId: acc.id, sessionId: req.sessionID },
          "ctrader/pending-account: ✅ DB fallback succeeded");
        return res.json({ ok: true, accountId: acc.id, apiToken: acc.api_token, label: acc.label });
      }
      logger.warn({ sessionId: req.sessionID }, "ctrader/pending-account: ❌ no cTrader account in DB");
    } catch (err) {
      logger.warn({ err, sessionId: req.sessionID }, "ctrader/pending-account: DB fallback error");
    }

    res.status(404).json({ ok: false, error: "No pending cTrader account in session" });
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
    const idx = s.stateIdx;
    const isErr = s.state === "error";

    const stuckStepId = (() => {
      const step = (s as Record<string, unknown>)["lastStuckStep"] as string | null;
      if (!step) return null;
      if (/app.?auth|TLS|connecting/i.test(step)) return "websocket";
      if (/account|get.?account/i.test(step)) return "accounts";
      if (/symbol/i.test(step)) return "symbols";
      return null;
    })();

    type StepStatus = "done" | "active" | "error" | "pending";

    function stepStatus(readyAtIdx: number, stepId: string): StepStatus {
      if (isErr && stuckStepId === stepId) return "error";
      if (isErr) {
        const order = ["websocket", "accounts", "symbols", "websocket"];
        const stuckPos = order.indexOf(stuckStepId ?? "");
        const thisPos = order.indexOf(stepId);
        if (stuckPos >= 0 && thisPos < stuckPos) return "done";
        if (stuckPos >= 0 && thisPos > stuckPos) return "pending";
        return "pending";
      }
      if (idx >= readyAtIdx) return "done";
      if (idx >= readyAtIdx - 2 && idx >= 0) return "active";
      return "pending";
    }

    const accountsStatus: StepStatus = isErr && (stuckStepId === "accounts" || (!stuckStepId && !s.activeAccountId))
      ? "error"
      : s.activeAccountId ? "done"
      : (idx >= 1 ? "active" : "pending");

    const symbolsStatus: StepStatus = isErr && stuckStepId === "symbols"
      ? "error"
      : s.symbolCount > 0 ? "done"
      : stepStatus(5, "symbols");

    const wsStatus: StepStatus = s.connected ? "done"
      : isErr && stuckStepId === "websocket" ? "error"
      : (idx >= 1 ? "active" : "pending");

    const errMsg: string | null = s.lastError ?? (isErr ? "Connection failed — check credentials and retry" : null);

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
          status: accountsStatus,
          detail: accountsStatus === "error"
            ? (errMsg ?? "No trading accounts found")
            : s.activeAccountId
            ? `Account ID ${s.activeAccountId}`
            : (s.state === "app_auth" || s.state === "connecting")
            ? "Connecting to Spotware TLS endpoint…"
            : "Requesting trading accounts…",
        },
        {
          id: "symbols",
          label: "Symbol catalog downloaded",
          status: symbolsStatus,
          detail: symbolsStatus === "error"
            ? (errMsg ?? "Failed to download symbols")
            : s.symbolCount > 0
            ? `${s.symbolCount.toLocaleString()} symbols loaded`
            : idx >= 4 ? "Downloading symbol catalog…" : "Waiting for account auth…",
        },
        {
          id: "websocket",
          label: "WebSocket session active",
          status: wsStatus,
          detail: wsStatus === "error"
            ? (errMsg ?? "TLS connection failed")
            : s.connected
            ? `${s.latencyMs}ms latency`
            : idx >= 6 ? "Subscribing to spot prices…" : `Connecting… (${s.state})`,
        },
      ],
      error: errMsg,
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

interface AccountPayload {
  accountId: number;
  apiToken: string;
  label: string;
}

function popupHtml(
  status: "success" | "error",
  message: string | null,
  account?: AccountPayload,
): string {
  const safeMsg = message ? message.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
  const safeMessage = JSON.stringify(message ?? "");

  // Embed account data for direct handoff (bypasses session entirely)
  const safeAccountId  = account ? String(account.accountId) : "null";
  const safeApiToken   = account ? JSON.stringify(account.apiToken)  : "null";
  const safeLabel      = account ? JSON.stringify(account.label)     : "null";

  // Expo deep link
  const deepLink = status === "success"
    ? `tradevault://ctrader-connected?broker=ctrader&success=true`
    : `tradevault://ctrader-error?broker=ctrader&error=${encodeURIComponent(message ?? "oauth_failed")}`;

  // Web fallbacks — include account token in URL so layout.tsx / FusionPanel can
  // hand it off to BrokerConnectModal without needing a session lookup.
  const tokenSuffix = account
    ? `&ct_token=${encodeURIComponent(account.apiToken)}&ct_acct=${account.accountId}&ct_label=${encodeURIComponent(account.label)}`
    : "";

  const desktopFallback = status === "success"
    ? `/?ctrader_connected=true${tokenSuffix}`
    : `/?ctrader_error=${encodeURIComponent(message ?? "oauth_failed")}`;
  const mobileFallback = status === "success"
    ? `/brokers?ctrader=connected${tokenSuffix}`
    : `/brokers?ctrader_error=${encodeURIComponent(message ?? "oauth_failed")}`;

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
    <p id="sub">Returning to app\u2026</p>
  </div>
  <script>
    (function () {
      var cbStatus = '${status}';
      var accountId = ${safeAccountId};
      var apiToken  = ${safeApiToken};
      var label     = ${safeLabel};

      console.log('[cTrader OAuth callback] status:', cbStatus);
      console.log('[cTrader OAuth callback] accountId:', accountId, 'label:', label);

      var openerAvailable = false;
      try { openerAvailable = !!(window.opener && window.opener.postMessage); } catch (_) {}
      console.log('[cTrader OAuth callback] window.opener available:', openerAvailable);

      if (openerAvailable) {
        // ── Web popup mode ────────────────────────────────────────────────────
        // postMessage carries the full account payload — no session lookup needed.
        try {
          window.opener.postMessage(
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
          console.log('[cTrader OAuth callback] postMessage sent to opener with account payload');
        } catch (e) {
          console.warn('[cTrader OAuth callback] postMessage failed:', e);
        }

        // Reliable fallback: navigate opener to /?ctrader_connected=true&ct_token=...
        // Token is embedded in URL so layout.tsx can hand it off without session.
        if (cbStatus === 'success') {
          try {
            window.opener.location.href = '${desktopFallback}';
            console.log('[cTrader OAuth callback] opener redirected to ${desktopFallback}');
          } catch (e) {
            console.warn('[cTrader OAuth callback] opener location change failed:', e);
          }
        }

        setTimeout(function () {
          console.log('[cTrader OAuth callback] closing popup');
          window.close();
        }, 900);

      } else {
        // ── Mobile / Expo mode ────────────────────────────────────────────────
        var deepLink = '${deepLink}';
        console.log('[cTrader OAuth callback] no opener — trying deep link then web redirect');
        window.location.href = deepLink;
        setTimeout(function () {
          console.log('[cTrader OAuth callback] deep-link fallback — redirecting to brokers page');
          window.location.replace('${mobileFallback}');
        }, 700);
      }
    })();
  </script>
</body>
</html>`;
}
