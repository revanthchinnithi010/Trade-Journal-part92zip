import { Router, type IRouter } from "express";
import { db, watchlistTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import type { MarketDataService } from "../services/MarketDataService.js";

const PROVIDER_MAP: Record<string, string> = {
  NAS100: "finnhub",  US30: "finnhub",   XAUUSD: "finnhub",   XAGUSD: "finnhub",
  EURUSD: "finnhub",  GBPUSD: "finnhub", GBPJPY: "finnhub",   USDJPY: "finnhub",
  AUDUSD: "finnhub",  USDCAD: "finnhub", USOIL: "finnhub",    UKOIL: "finnhub",
  SPX500: "finnhub",  DE40: "finnhub",
  BTCUSD: "finnhub",  ETHUSD: "finnhub", SOLUSD: "finnhub",
  DOGEUSD: "finnhub", PEPEUSD: "finnhub",
};

const AddSymbolBody = z.object({
  symbol: z.string().toUpperCase(),
  isFavorite: z.boolean().optional().default(false),
});

const UpdateBody = z.object({
  isFavorite: z.boolean().optional(),
  position:   z.number().int().min(0).optional(),
});

const IdParam = z.object({ id: z.coerce.number().int().positive() });

function serialize(w: typeof watchlistTable.$inferSelect) {
  return { ...w, createdAt: w.createdAt.toISOString() };
}

export function createWatchlistRouter(marketData: MarketDataService): IRouter {
  const router: IRouter = Router();

  router.get("/watchlist", async (_req, res): Promise<void> => {
    try {
      const items = await db.select().from(watchlistTable).orderBy(asc(watchlistTable.position), asc(watchlistTable.createdAt));
      res.json(items.map(serialize));
    } catch { res.status(500).json({ error: "Failed to fetch watchlist" }); }
  });

  router.post("/watchlist", async (req, res): Promise<void> => {
    const parsed = AddSymbolBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const provider = PROVIDER_MAP[parsed.data.symbol] ?? "finnhub";
    try {
      const existing = await db.select().from(watchlistTable).where(eq(watchlistTable.symbol, parsed.data.symbol));
      if (existing.length > 0) { res.status(409).json({ error: "Symbol already in watchlist" }); return; }

      const allItems = await db.select().from(watchlistTable);
      const [item] = await db.insert(watchlistTable).values({
        symbol:     parsed.data.symbol,
        provider,
        isFavorite: parsed.data.isFavorite,
        position:   allItems.length,
      }).returning();

      marketData.subscribe(parsed.data.symbol);

      res.status(201).json(serialize(item));
    } catch (err: unknown) {
      const pg = err as { code?: string };
      if (pg.code === "23505") { res.status(409).json({ error: "Symbol already in watchlist" }); return; }
      res.status(500).json({ error: "Failed to add to watchlist" });
    }
  });

  router.patch("/watchlist/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    try {
      const [item] = await db.update(watchlistTable).set(parsed.data).where(eq(watchlistTable.id, params.data.id)).returning();
      if (!item) { res.status(404).json({ error: "Not found" }); return; }
      res.json(serialize(item));
    } catch { res.status(500).json({ error: "Failed to update watchlist item" }); }
  });

  router.delete("/watchlist/:id", async (req, res): Promise<void> => {
    const params = IdParam.safeParse(req.params);
    if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [item] = await db.delete(watchlistTable).where(eq(watchlistTable.id, params.data.id)).returning();
      if (!item) { res.status(404).json({ error: "Not found" }); return; }
      // NOTE: intentionally NOT unsubscribing here.
      // Removing from the watchlist is a display/preference action only.
      // Market data subscriptions are managed independently so the Markets
      // page continues to show live prices for any symbol regardless of
      // whether it is in the user's watchlist.
      res.sendStatus(204);
    } catch { res.status(500).json({ error: "Failed to remove from watchlist" }); }
  });

  return router;
}
