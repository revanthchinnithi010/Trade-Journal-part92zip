import { Router } from "express";
import type { CTraderService } from "../services/CTraderService.js";
import { logger } from "../lib/logger.js";

export function createCTraderRouter(ctrader: CTraderService): Router {
  const router = Router();

  router.post("/ctrader/connect-token", async (req, res) => {
    try {
      const { accessToken, accountId } = req.body;
      if (!accessToken) {
        res.status(400).json({ error: "accessToken is required" });
        return;
      }
      await ctrader.connectWithToken(accessToken, accountId ?? null);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, "ctrader/connect-token failed");
      res.status(500).json({ error: "Failed to connect" });
    }
  });

  router.get("/ctrader/status", (_req, res) => {
    res.json(ctrader.getStatus());
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
          id: "token",
          label: "Token verified",
          status: s.hasToken ? "done" : "active",
          detail: s.hasToken ? "Access token stored" : "Awaiting token",
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
