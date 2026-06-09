import "dotenv/config";
import { createServer } from "http";
import { createApp } from "./app.js";
import { WSManager } from "./ws/WSManager.js";
import { deltaSocketManager } from "./ws/deltaSocket.js";
import { MarketDataService } from "./services/MarketDataService.js";
import { CandleAggregator } from "./services/CandleAggregator.js";
import { TelegramService } from "./services/TelegramService.js";
import { FinnhubService } from "./services/FinnhubService.js";
import { DeltaService } from "./services/DeltaService.js";
import { CTraderService } from "./services/CTraderService.js";
import { AlertEngine } from "./services/AlertEngine.js";
import { FeedHealthMonitor } from "./services/FeedHealthMonitor.js";
import { runMigrations } from "./lib/migrate.js";
import { logger } from "./lib/logger.js";

console.log(`CTRADER_CLIENT_ID loaded: ${process.env["CTRADER_CLIENT_ID"] ? "YES" : "NO"}`);
console.log(`CTRADER_CLIENT_SECRET loaded: ${process.env["CTRADER_CLIENT_SECRET"] ? "YES" : "NO"}`);

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

const wsManager        = new WSManager();
deltaSocketManager.setWsManager(wsManager);
const marketData       = new MarketDataService(undefined);
const candleAggregator = new CandleAggregator();
const telegram         = new TelegramService();
const finnhub          = new FinnhubService(marketData);
const delta            = new DeltaService(marketData);
const ctrader          = new CTraderService();
const alertEngine      = new AlertEngine(marketData, telegram, wsManager);
const healthMonitor    = new FeedHealthMonitor(marketData, wsManager, telegram);

marketData.on("tick", (tick) => {
  // Clear per-tick candle payload cache before aggregation so each new tick
  // gets fresh serialisation (avoids stale bar data leaking across ticks).
  wsManager.clearCandleCache();
  candleAggregator.ingestTick(tick);
  wsManager.broadcast({ type: "tick", ...tick });
});

candleAggregator.on("candle_update", (update: { symbol: string; interval: string; bar: object }) => {
  // Per-client filtered broadcast — only sends to clients subscribed to this
  // symbol:interval, eliminating ~89% of candle_update WS traffic vs the old
  // "broadcast everything to everyone" approach.
  wsManager.broadcastCandleUpdate(update.symbol, update.interval, update.bar);
});

ctrader.on("tick", (tick) => {
  wsManager.broadcast({ type: "ctrader_tick", ...tick });
});

ctrader.on("status_change", (status) => {
  wsManager.broadcast({ type: "ctrader_status", ...status });
});

marketData.on("feed_status", (status) => {
  wsManager.broadcast({ type: "feed_status", ...status });
});

marketData.on("provider_status", (status) => {
  wsManager.broadcast({ type: "provider_status", ...status });
});

marketData.on("subscription_update", (update) => {
  wsManager.broadcast({ type: "subscription_update", ...update });
});

marketData.start([]).catch(err =>
  logger.error({ err }, "MarketDataService: async start error"),
);

ctrader.on("status_change", (status) => {
  if (status.connected) {
    marketData.enableCTrader(ctrader);
    logger.info("index: cTrader connected — market data bridged");
  }
});

const app    = createApp({ alertEngine, marketData, healthMonitor, telegram, finnhub, delta, ctrader, wsManager, candleAggregator });
const server = createServer(app);

server.on("upgrade", (req, socket, head) => {
  wsManager.handleUpgrade(req, socket as import("net").Socket, head);
});

healthMonitor.start();

(async () => {
  try {
    await runMigrations();
  } catch (err) {
    logger.error({ err }, "DB migration failed — services may have limited functionality");
  }

  await new Promise<void>((resolve, reject) => {
    server.listen(port, (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        reject(err);
        process.exit(1);
      }
      logger.info({ port }, "Server listening — all feeds require manual connect via Settings");
      resolve();
    });
  });

  await Promise.all([
    telegram.init().then(() => {
      logger.info({ telegramEnabled: telegram.isEnabled() }, "TelegramService: init complete");
    }),
    finnhub.init().then(() => {
      logger.info("FinnhubService: init complete");
    }),
    delta.init().then(() => {
      logger.info("DeltaService: init complete");
    }),
    ctrader.init().then(() => {
      logger.info({ state: ctrader.connectionState }, "CTraderService: init complete");
    }),
  ]).catch((err) => {
    logger.warn({ err }, "Service init warning");
  });

  alertEngine.start().then(() => {
    logger.info("AlertEngine: started");
  }).catch((err) => {
    logger.error({ err }, "AlertEngine: failed to start");
  });

  // Subscribe all saved watchlist symbols so they stream as soon as a provider connects
  try {
    const { db: dbClient, watchlistTable } = await import("@workspace/db");
    const { asc } = await import("drizzle-orm");
    const items = await dbClient.select({ symbol: watchlistTable.symbol }).from(watchlistTable).orderBy(asc(watchlistTable.position));
    for (const { symbol } of items) {
      marketData.subscribe(symbol);
    }
    if (items.length > 0) {
      logger.info({ count: items.length }, "Startup: subscribed watchlist symbols");
    }
  } catch (err) {
    logger.warn({ err }, "Startup: could not subscribe watchlist symbols — non-fatal");
  }
})();

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — shutting down");
  marketData.stop();
  alertEngine.stop().catch(() => {});
  healthMonitor.stop();
  server.close(() => process.exit(0));
});
