import { Router } from "express";
import { requireCTrader } from "../middleware/brokerAuth.js";
import {
  orderWriteLimiter,
  dataReadLimiter,
} from "../middleware/rateLimiter.js";
import {
  validatePlaceOrder,
  validateClosePosition,
  validateModifyOrder,
} from "../middleware/validateOrder.js";
import type { CTraderTradingAdapter } from "../brokers/CTraderTradingAdapter.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Balance ──────────────────────────────────────────────────────────────────

router.get("/broker/ctrader/balance",
  dataReadLimiter,
  requireCTrader,
  async (req, res) => {
    const { adapter } = req.brokerCtx!;
    try {
      const balances = await adapter.getBalance();
      res.json({ ok: true, balance: balances[0] ?? null, all: balances });
    } catch (err) {
      logger.error({ err: String(err) }, "broker/ctrader/balance failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Positions ─────────────────────────────────────────────────────────────────

router.get("/broker/ctrader/positions",
  dataReadLimiter,
  requireCTrader,
  async (req, res) => {
    const { adapter } = req.brokerCtx!;
    try {
      const positions = await adapter.getPositions();
      res.json({ ok: true, positions });
    } catch (err) {
      logger.error({ err: String(err) }, "broker/ctrader/positions failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Open Orders ───────────────────────────────────────────────────────────────

router.get("/broker/ctrader/orders",
  dataReadLimiter,
  requireCTrader,
  async (req, res) => {
    const { adapter } = req.brokerCtx!;
    try {
      const orders = await adapter.getOrders();
      res.json({ ok: true, orders });
    } catch (err) {
      logger.error({ err: String(err) }, "broker/ctrader/orders failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Order History ─────────────────────────────────────────────────────────────

router.get("/broker/ctrader/orders/history",
  dataReadLimiter,
  requireCTrader,
  async (req, res) => {
    const { adapter } = req.brokerCtx!;
    const limit = Math.min(parseInt(String(req.query["limit"] ?? "100"), 10), 500);
    try {
      const orders = await (adapter as CTraderTradingAdapter).getOrderHistory(limit);
      res.json({ ok: true, orders, total: orders.length });
    } catch (err) {
      logger.error({ err: String(err) }, "broker/ctrader/orders/history failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Place Order (Market / Limit / Stop / StopLimit + TP/SL) ──────────────────

router.post("/broker/ctrader/order",
  orderWriteLimiter,
  requireCTrader,
  validatePlaceOrder,
  async (req, res) => {
    const { adapter, accountId } = req.brokerCtx!;
    logger.info({ accountId, body: req.body }, "broker/ctrader: placeOrder");
    try {
      const result = await adapter.placeOrder(req.body);
      res.json({ ok: true, orderId: result.orderId });
    } catch (err) {
      logger.error({ err: String(err) }, "broker/ctrader/order POST failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Modify Order (amend price / TP / SL / qty) ────────────────────────────────

router.patch("/broker/ctrader/order/:id",
  orderWriteLimiter,
  requireCTrader,
  validateModifyOrder,
  async (req, res) => {
    const { adapter, accountId } = req.brokerCtx!;
    const orderId = req.params["id"]!;
    logger.info({ accountId, orderId, body: req.body }, "broker/ctrader: modifyOrder");
    try {
      await (adapter as CTraderTradingAdapter).modifyOrder(orderId, req.body);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err: String(err), orderId }, "broker/ctrader/order PATCH failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Cancel Order ──────────────────────────────────────────────────────────────

router.delete("/broker/ctrader/order/:id",
  orderWriteLimiter,
  requireCTrader,
  async (req, res) => {
    const { adapter, accountId } = req.brokerCtx!;
    const orderId = req.params["id"]!;
    logger.info({ accountId, orderId }, "broker/ctrader: cancelOrder");
    try {
      await adapter.cancelOrder(orderId);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err: String(err), orderId }, "broker/ctrader/order DELETE failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

// ── Close Position ────────────────────────────────────────────────────────────

router.delete("/broker/ctrader/position/:id",
  orderWriteLimiter,
  requireCTrader,
  validateClosePosition,
  async (req, res) => {
    const { adapter, accountId } = req.brokerCtx!;
    const positionId = req.params["id"]!;
    const { size, side } = req.body as { size: number; side: "Long" | "Short" };
    logger.info({ accountId, positionId, size, side }, "broker/ctrader: closePosition");
    try {
      await adapter.closePosition({
        id: positionId,
        symbol: "",
        side,
        size,
        entryPrice: 0, markPrice: 0, unrealisedPnl: 0, leverage: "",
        raw: { positionId },
      });
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err: String(err), positionId }, "broker/ctrader/position DELETE failed");
      res.status(502).json({ ok: false, error: String(err) });
    }
  },
);

export { router as brokerCTraderRouter };
