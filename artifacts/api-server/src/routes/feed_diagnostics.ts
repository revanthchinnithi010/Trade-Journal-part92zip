import { Router, type IRouter } from "express";
import type { MarketDataService } from "../services/MarketDataService.js";

/**
 * GET /api/feed/diagnostics
 *
 * Returns per-symbol data provider routing, subscription status, last tick
 * time, and provider connection state. Used by the frontend diagnostics panel
 * to show: Selected Symbol, Asset Class, Data Provider, Subscription Status,
 * Last Tick Time, Ticks Per Second.
 */
export function createFeedDiagnosticsRouter(marketData: MarketDataService): IRouter {
  const router: IRouter = Router();

  router.get("/feed/diagnostics", (_req, res): void => {
    try {
      const diag = marketData.getDiagnostics();
      res.setHeader("Cache-Control", "no-store");
      res.json(diag);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Diagnostics failed: ${msg}` });
    }
  });

  return router;
}
