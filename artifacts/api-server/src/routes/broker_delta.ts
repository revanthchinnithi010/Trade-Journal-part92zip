import { Router } from "express";
import { getBrokerAdapter } from "../brokers/BrokerService.js";
import { validateDeltaCredentials } from "../services/deltaAuth.js";
import { deltaSocketManager } from "../ws/deltaSocket.js";
import { decrypt } from "../services/BrokerEncryption.js";
import { pool } from "@workspace/db";

const router = Router();

router.get("/broker/delta/balance", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "delta") { res.status(400).json({ ok: false, error: "Account is not a Delta account" }); return; }
  try {
    const balances = await ctx.adapter.getBalance();
    const usdt = balances.find(b => b.coin === "USDT") ?? balances[0];
    res.json({ ok: true, balance: usdt, all: balances });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.get("/broker/delta/positions", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "delta") { res.status(400).json({ ok: false, error: "Account is not a Delta account" }); return; }
  try {
    const positions = await ctx.adapter.getPositions();
    res.json({ ok: true, positions });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.get("/broker/delta/orders", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "delta") { res.status(400).json({ ok: false, error: "Account is not a Delta account" }); return; }
  try {
    const orders = await ctx.adapter.getOrders();
    res.json({ ok: true, orders });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.post("/broker/delta/order", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "delta") { res.status(400).json({ ok: false, error: "Account is not a Delta account" }); return; }
  try {
    const result = await ctx.adapter.placeOrder(req.body);
    res.json({ ok: true, orderId: result.orderId });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.delete("/broker/delta/order/:id", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "delta") { res.status(400).json({ ok: false, error: "Account is not a Delta account" }); return; }
  try {
    await ctx.adapter.cancelOrder(req.params["id"]!);
    res.json({ ok: true });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.delete("/broker/delta/position/:productId", async (req, res) => {
  const ctx = await getBrokerAdapter(req, res);
  if (!ctx) return;
  if (ctx.brokerId !== "delta") { res.status(400).json({ ok: false, error: "Account is not a Delta account" }); return; }
  const { size, side } = req.body as { size: number; side: "Long" | "Short" };
  try {
    await ctx.adapter.closePosition({
      id: req.params["productId"]!,
      symbol: "",
      side,
      size,
      entryPrice: 0, markPrice: 0, unrealisedPnl: 0, leverage: "",
      raw: { product_id: Number(req.params["productId"]) },
    });
    res.json({ ok: true });
  } catch (err) { res.status(502).json({ ok: false, error: String(err) }); }
});

router.post("/broker/delta/validate", async (req, res) => {
  const { api_key, api_secret } = req.body as { api_key?: string; api_secret?: string };
  if (!api_key || !api_secret) {
    res.status(400).json({ ok: false, error: "api_key and api_secret are required" });
    return;
  }
  try {
    const result = await validateDeltaCredentials(api_key.trim(), api_secret.trim());
    if (result.valid) {
      res.json({ ok: true, usdtBalance: result.usdtBalance });
    } else {
      res.status(401).json({ ok: false, error: result.error });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.post("/broker/delta/ws/start", async (req, res) => {
  const accountIdStr = req.headers["x-broker-account-id"] as string;
  const apiToken = req.headers["x-broker-token"] as string;

  if (!accountIdStr || !apiToken) {
    res.status(400).json({ ok: false, error: "X-Broker-Account-Id and X-Broker-Token headers required" });
    return;
  }

  const accountId = parseInt(accountIdStr, 10);
  if (isNaN(accountId) || accountId <= 0) {
    res.status(400).json({ ok: false, error: "Invalid X-Broker-Account-Id" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT api_key_enc, api_secret_enc, api_token, broker_id, meta FROM broker_accounts WHERE id=$1`,
      [accountId],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ ok: false, error: "Account not found" });
      return;
    }
    const row = result.rows[0] as {
      api_key_enc: string;
      api_secret_enc: string;
      api_token: string;
      broker_id: string;
    };

    if (row.api_token !== apiToken) {
      res.status(403).json({ ok: false, error: "Invalid broker account token" });
      return;
    }

    if (row.broker_id !== "delta") {
      res.status(400).json({ ok: false, error: "Account is not a Delta account" });
      return;
    }

    const apiKey    = decrypt(row.api_key_enc);
    const apiSecret = decrypt(row.api_secret_enc);

    // Use the environment-specific WS URL detected during connect (India vs International).
    // Fall back to International if the account was saved before env-detection was added.
    const meta  = (row as { meta?: Record<string, unknown> | null }).meta ?? {};
    const wsUrl = typeof meta["ws_url"] === "string"
      ? meta["ws_url"]
      : "wss://socket.delta.exchange";

    deltaSocketManager.startSession(accountId, apiKey, apiSecret, wsUrl);
    res.json({ ok: true, message: "Delta WebSocket session started" });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

router.delete("/broker/delta/ws/stop", async (req, res) => {
  const accountIdStr = req.headers["x-broker-account-id"] as string;
  if (!accountIdStr) {
    res.status(400).json({ ok: false, error: "X-Broker-Account-Id header required" });
    return;
  }
  const accountId = parseInt(accountIdStr, 10);
  deltaSocketManager.stopSession(accountId);
  res.json({ ok: true });
});

export { router as brokerDeltaRouter };
