import { Router, type IRouter } from "express";
import { z } from "zod";
import type { FinnhubService } from "../services/FinnhubService.js";

const ConfigBody = z.object({
  apiKey: z.string().min(10, "API key is too short"),
});

export function createFinnhubRouter(finnhub: FinnhubService): IRouter {
  const router: IRouter = Router();

  router.get("/finnhub/status", (_req, res): void => {
    res.json(finnhub.getStatus());
  });

  router.post("/finnhub/config", async (req, res): Promise<void> => {
    const parsed = ConfigBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const result = await finnhub.configure(parsed.data.apiKey);
    res.json(result);
  });

  router.delete("/finnhub/config", async (_req, res): Promise<void> => {
    await finnhub.disconnect();
    res.json({ success: true, configured: false });
  });

  router.post("/finnhub/test", async (_req, res): Promise<void> => {
    const status = finnhub.getStatus();
    if (!status.configured) {
      res.status(200).json({ success: false, error: "No API key configured — connect Finnhub first" });
      return;
    }
    const result = await finnhub.test();
    res.status(200).json(result);
  });

  return router;
}
