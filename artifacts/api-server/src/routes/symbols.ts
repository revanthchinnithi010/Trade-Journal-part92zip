import { Router, type IRouter } from "express";
import type { MarketDataService } from "../services/MarketDataService.js";
import { logger } from "../lib/logger.js";

/**
 * GET /api/symbols
 * GET /api/symbols?broker=delta
 *
 * Returns the full tradable symbol catalog for Delta Exchange.
 * Delta India symbols are fetched live from the REST API and cached 10 min.
 */
export function createSymbolsRouter(marketData: MarketDataService): IRouter {
  const router: IRouter = Router();

  router.get("/symbols", async (req, res): Promise<void> => {
    const broker = (req.query["broker"] as string | undefined)?.toLowerCase();
    const forceRefresh = req.query["refresh"] === "1";

    logger.info({ broker, forceRefresh }, "symbols: fetching catalog");

    res.setHeader("Cache-Control", "public, max-age=600, stale-while-revalidate=60");

    try {
      const svc = marketData.getSymbolService();

      if (broker === "delta" || !broker) {
        const symbols = await svc.getDeltaSymbols(forceRefresh);
        res.json({ broker: "delta", count: symbols.length, symbols });
        return;
      }

      const { delta } = await svc.getAllSymbols();
      res.json({
        delta: { count: delta.length, symbols: delta },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "symbols: failed to fetch catalog");
      res.status(502).json({ error: `Failed to fetch symbol catalog: ${msg}` });
    }
  });

  return router;
}
