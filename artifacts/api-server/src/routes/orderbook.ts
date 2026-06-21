import { Router, type IRouter } from "express";

const DELTA_INDIA_REST = "https://api.india.delta.exchange";

export function createOrderbookRouter(): IRouter {
  const router: IRouter = Router();

  router.get("/orderbook/:symbol", async (req, res): Promise<void> => {
    const { symbol } = req.params;
    const depth = Math.min(Number(req.query.depth ?? 20), 40);

    if (!symbol || !/^[A-Z0-9]+$/.test(symbol)) {
      res.status(400).json({ success: false, error: "Invalid symbol" });
      return;
    }

    try {
      const url = `${DELTA_INDIA_REST}/v2/l2orderbook/${symbol}?depth=${depth}`;
      const resp = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        res.status(resp.status).json({
          success: false,
          error: `Delta API error: ${resp.status}`,
          detail: text.slice(0, 200),
        });
        return;
      }

      const data = await resp.json() as {
        success: boolean;
        result?: { buy?: unknown[]; sell?: unknown[] };
        error?: unknown;
      };

      if (!data.success || !data.result) {
        res.status(502).json({
          success: false,
          error: "Delta returned no result",
          upstream: data.error ?? null,
        });
        return;
      }

      res.json({
        success: true,
        symbol,
        buy:  (data.result.buy  ?? []).slice(0, depth),
        sell: (data.result.sell ?? []).slice(0, depth),
        ts: Date.now(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(503).json({ success: false, error: msg });
    }
  });

  return router;
}
