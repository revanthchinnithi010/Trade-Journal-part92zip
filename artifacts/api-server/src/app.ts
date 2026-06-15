import "dotenv/config";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger.js";
import type { AlertEngine } from "./services/AlertEngine.js";
import type { MarketDataService } from "./services/MarketDataService.js";
import type { FeedHealthMonitor } from "./services/FeedHealthMonitor.js";
import type { TelegramService } from "./services/TelegramService.js";
import type { FinnhubService } from "./services/FinnhubService.js";
import type { DeltaService } from "./services/DeltaService.js";
import type { WSManager } from "./ws/WSManager.js";
import type { CandleAggregator } from "./services/CandleAggregator.js";
import { createRouter } from "./routes/index.js";

declare module "express-session" {
  interface SessionData {
    deltaOAuthState?: string;
    pendingBrokerAccount?: {
      accountId: number;
      apiToken: string;
      label: string;
    };
    pendingDeltaAccount?: {
      accountId: number;
      apiToken: string;
      label: string;
    };
  }
}

const PgSession = connectPgSimple(session);

export function createApp(deps: {
  alertEngine: AlertEngine;
  marketData: MarketDataService;
  healthMonitor: FeedHealthMonitor;
  telegram: TelegramService;
  finnhub: FinnhubService;
  delta: DeltaService;
  wsManager: WSManager;
  candleAggregator: CandleAggregator;
}): Express {
  const app: Express = express();

  app.set("trust proxy", 1);

  const allowedOrigins = [
    /\.replit\.dev$/,
    /\.pike\.replit\.dev$/,
    /\.replit\.app$/,
    /localhost/,
  ];

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const ok = allowedOrigins.some((p) =>
          typeof p === "string" ? p === origin : p.test(origin),
        );
        cb(null, ok ? origin : false);
      },
      credentials: true,
    }),
  );

  app.use(
    session({
      secret: process.env["SESSION_SECRET"] ?? "dev-fallback-secret-replace-in-prod",
      resave: false,
      saveUninitialized: false,
      proxy: true,
      store: new PgSession({
        pool,
        tableName: "sessions",
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60,
      }),
      cookie: {
        secure: true,
        sameSite: "none",
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", createRouter(deps));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
