import { Router, type Request, type Response } from "express";
import type { CTraderService } from "../services/CTraderService.js";
import { logger } from "../lib/logger.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveRedirectUri(req: Request): string {
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost";
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  return `${proto}://${host}/api/ctrader/callback`;
}

function popupHtml(data: Record<string, unknown>): string {
  const payload = JSON.stringify({ ...data, type: "ctrader_oauth_result" });
  return `<!DOCTYPE html><html><head><title>cTrader OAuth</title>
<style>
  body{margin:0;display:flex;align-items:center;justify-content:center;
  min-height:100vh;background:#0B1017;font-family:system-ui,sans-serif;color:#fff}
  p{font-size:14px;color:rgba(255,255,255,0.5);text-align:center;padding:0 20px}
</style></head><body>
<p>Authentication complete — this window will close automatically.</p>
<script>
(function(){
  try{ if(window.opener) window.opener.postMessage(${payload},'*'); }catch(e){}
  setTimeout(function(){ window.close(); }, 600);
})();
</script>
</body></html>`;
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createCTraderRouter(ctrader: CTraderService): Router {
  const router = Router();

  // ── OAuth: generate auth URL ──────────────────────────────────────────────

  router.get("/ctrader/config", async (req: Request, res: Response) => {
    const clientId     = process.env["CTRADER_CLIENT_ID"];
    const clientSecret = process.env["CTRADER_CLIENT_SECRET"];

    if (!clientId || !clientSecret) {
      res.json({ configured: false, authUrl: null });
      return;
    }

    try {
      const state       = await ctrader.createOAuthState();
      const redirectUri = resolveRedirectUri(req);
      const authUrl     = ctrader.buildAuthUrl(redirectUri, state);
      res.json({ configured: true, authUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "ctrader/config: failed to build auth URL");
      res.json({ configured: false, authUrl: null, error: msg });
    }
  });

  // ── OAuth: callback (receives code from cTrader) ──────────────────────────

  router.get("/ctrader/callback", async (req: Request, res: Response) => {
    const { code, state, error: oauthErr } = req.query;

    if (oauthErr) {
      logger.warn({ oauthErr }, "ctrader/callback: user denied or error from provider");
      res.send(popupHtml({ status: "error", message: String(oauthErr) }));
      return;
    }

    if (!code || typeof code !== "string") {
      res.send(popupHtml({ status: "error", message: "Missing authorization code" }));
      return;
    }

    // Validate CSRF state
    if (state && typeof state === "string") {
      const valid = await ctrader.validateOAuthState(state);
      if (!valid) {
        res.send(popupHtml({ status: "error", message: "Invalid or expired OAuth state — please try again" }));
        return;
      }
    }

    try {
      const redirectUri = resolveRedirectUri(req);
      await ctrader.handleOAuthCode(code, redirectUri);
      res.send(popupHtml({ status: "success" }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "ctrader/callback: OAuth code exchange failed");
      res.send(popupHtml({ status: "error", message: msg }));
    }
  });

  // ── Status & diagnostics ──────────────────────────────────────────────────

  router.get("/ctrader/status", (_req, res) => {
    res.json(ctrader.getStatus());
  });

  router.post("/ctrader/disconnect", async (_req, res) => {
    try {
      await ctrader.disconnect();
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : "unknown" });
    }
  });

  router.get("/ctrader/ticks", (_req, res) => {
    const s = ctrader.getStatus();
    res.json({ ticks: s.ticks, latencyMs: s.latencyMs, connected: s.connected });
  });

  router.get("/ctrader/diagnostics", (_req, res) => {
    const s = ctrader.getStatus();
    const idx   = s.stateIdx;
    const isErr = s.state === "error";

    const stuckStepId = (() => {
      const step = (s as Record<string, unknown>)["lastStuckStep"] as string | null;
      if (!step) return null;
      if (/app.?auth|TLS|connecting/i.test(step)) return "websocket";
      if (/account|get.?account/i.test(step))      return "accounts";
      if (/symbol/i.test(step))                     return "symbols";
      return null;
    })();

    type SS = "done" | "active" | "error" | "pending";

    function derived(readyAtIdx: number, stepId: string): SS {
      if (isErr && stuckStepId === stepId) return "error";
      if (isErr) {
        const order = ["websocket", "accounts", "symbols", "websocket"];
        const stuckPos = order.indexOf(stuckStepId ?? "");
        const thisPos  = order.indexOf(stepId);
        if (stuckPos >= 0 && thisPos < stuckPos) return "done";
        if (stuckPos >= 0 && thisPos > stuckPos) return "pending";
        return "pending";
      }
      if (idx >= readyAtIdx) return "done";
      if (idx >= readyAtIdx - 2 && idx >= 0) return "active";
      return "pending";
    }

    const accountsStatus: SS = isErr && (stuckStepId === "accounts" || (!stuckStepId && !s.activeAccountId))
      ? "error"
      : s.activeAccountId ? "done"
      : (idx >= 1 ? "active" : "pending");

    const symbolsStatus: SS = isErr && stuckStepId === "symbols"
      ? "error"
      : s.symbolCount > 0 ? "done"
      : derived(5, "symbols");

    const wsStatus: SS = s.connected ? "done"
      : isErr && stuckStepId === "websocket" ? "error"
      : (idx >= 1 ? "active" : "pending");

    const errMsg: string | null = s.lastError ?? (isErr ? "Connection failed — check credentials and retry" : null);

    res.json({
      state:           s.state,
      connected:       s.connected,
      hasToken:        s.hasToken,
      activeAccountId: s.activeAccountId,
      symbolCount:     s.symbolCount,
      latencyMs:       s.latencyMs,
      lastError:       s.lastError,
      steps: [
        {
          id: "oauth", label: "OAuth authorized", status: s.hasToken ? "done" : "active",
          detail: s.hasToken ? "Access token stored" : "Awaiting OAuth authorization",
        },
        {
          id: "accounts", label: "Trading account loaded", status: accountsStatus,
          detail: accountsStatus === "error"
            ? (errMsg ?? "No trading accounts found")
            : s.activeAccountId
            ? `Account ID ${s.activeAccountId}`
            : (s.state === "app_auth" || s.state === "connecting")
            ? "Connecting to Spotware TLS endpoint…"
            : "Requesting trading accounts…",
        },
        {
          id: "symbols", label: "Symbol catalog downloaded", status: symbolsStatus,
          detail: symbolsStatus === "error"
            ? (errMsg ?? "Failed to download symbols")
            : s.symbolCount > 0
            ? `${s.symbolCount.toLocaleString()} symbols loaded`
            : idx >= 4 ? "Downloading symbol catalog…" : "Waiting for account auth…",
        },
        {
          id: "websocket", label: "WebSocket session active", status: wsStatus,
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

  // ── Direct token connect (fallback / alternative) ─────────────────────────

  router.post("/ctrader/connect-token", async (req, res) => {
    try {
      const { accessToken, accountId } = req.body;
      if (!accessToken) { res.status(400).json({ error: "accessToken is required" }); return; }
      await ctrader.connectWithToken(accessToken, accountId ?? null);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "ctrader/connect-token failed");
      res.status(500).json({ error: "Failed to connect" });
    }
  });

  return router;
}
