import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { MarketDataService } from "./MarketDataService.js";

const KEY_API_KEY = "finnhub_api_key";

const FINNHUB_SYMBOLS = [
  // Forex
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF",
  // Metals
  "XAUUSD", "XAGUSD",
  // Commodities
  "USOIL", "UKOIL", "NATGAS",
  // Indices
  "US30", "NAS100", "US500", "GER40", "UK100",
];

function maskKey(key: string): string {
  if (key.length <= 12) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export type FinnhubStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "invalid_key"
  | "error";

export class FinnhubService {
  private apiKey: string | undefined;
  private status: FinnhubStatus = "disconnected";
  private source: "db" | "env" | "none" = "none";
  private marketData: MarketDataService;

  constructor(marketData: MarketDataService) {
    this.marketData = marketData;
    const envKey = process.env["FINNHUB_API_KEY"];
    if (envKey) {
      this.apiKey = envKey;
      this.source = "env";
    }
  }

  async init(): Promise<void> {
    try {
      const rows = await db.select().from(settingsTable)
        .where(eq(settingsTable.key, KEY_API_KEY));
      const dbKey = rows[0]?.value ?? undefined;
      if (dbKey) {
        this.apiKey = dbKey;
        this.source = "db";
        logger.info({ keyMasked: maskKey(dbKey), source: "db" }, "FinnhubService: loaded key from DB — enabling feed");
        await this._enableFeed(dbKey);
        return;
      }
    } catch (err) {
      logger.warn({ err }, "FinnhubService: could not load key from DB");
    }

    if (this.apiKey && this.source === "env") {
      logger.info({ keyMasked: maskKey(this.apiKey), source: "env" }, "FinnhubService: loaded key from env — enabling feed");
      await this._enableFeed(this.apiKey);
    } else {
      logger.warn("FinnhubService: no API key — Finnhub feed disabled");
      this.status = "disconnected";
    }
  }

  async configure(apiKey: string): Promise<{ success: boolean; error?: string }> {
    logger.info({ keyMasked: maskKey(apiKey) }, "FinnhubService: configure requested");

    const valid = await this._validateKey(apiKey);
    if (!valid.ok) {
      this.status = "invalid_key";
      return { success: false, error: valid.error };
    }

    try {
      await db.insert(settingsTable)
        .values({ key: KEY_API_KEY, value: apiKey, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: apiKey, updatedAt: new Date() },
        });
    } catch (err) {
      logger.error({ err }, "FinnhubService: failed to persist key to DB");
      return { success: false, error: "Failed to save key to database" };
    }

    this.apiKey = apiKey;
    this.source = "db";
    await this._enableFeed(apiKey);
    return { success: true };
  }

  async disconnect(): Promise<void> {
    try {
      await db.delete(settingsTable).where(eq(settingsTable.key, KEY_API_KEY));
    } catch (err) {
      logger.warn({ err }, "FinnhubService: error clearing DB key");
    }
    const envKey = process.env["FINNHUB_API_KEY"];
    this.apiKey = envKey;
    this.source = envKey ? "env" : "none";
    this.status = "disconnected";
    this.marketData.disableFinnhub();
    logger.info("FinnhubService: disconnected");
  }

  async test(): Promise<{ success: boolean; error?: string }> {
    if (!this.apiKey) {
      return { success: false, error: "No API key configured" };
    }
    const valid = await this._validateKey(this.apiKey);
    return valid.ok ? { success: true } : { success: false, error: valid.error };
  }

  /** Returns the raw API key — used by the candles router for Finnhub REST history calls. */
  getApiKey(): string | undefined {
    return this.apiKey;
  }

  getStatus(): {
    configured: boolean;
    status: FinnhubStatus;
    keyMasked: string | null;
    source: "db" | "env" | "none";
  } {
    return {
      configured: !!this.apiKey,
      status: this.status,
      keyMasked: this.apiKey ? maskKey(this.apiKey) : null,
      source: this.source,
    };
  }

  private async _enableFeed(apiKey: string): Promise<void> {
    this.status = "connecting";
    try {
      this.marketData.enableFinnhub(apiKey, FINNHUB_SYMBOLS);
      this.status = "connected";
      logger.info({ symbols: FINNHUB_SYMBOLS }, "FinnhubService: feed enabled");
    } catch (err) {
      this.status = "error";
      logger.error({ err }, "FinnhubService: failed to enable feed");
    }
  }

  private async _validateKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const url = `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: "Invalid API key — check your Finnhub token" };
      }
      if (!res.ok) {
        return { ok: false, error: `Finnhub returned HTTP ${res.status}` };
      }
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (body.error) {
        return { ok: false, error: body.error };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Connection failed: ${msg}` };
    }
  }
}
