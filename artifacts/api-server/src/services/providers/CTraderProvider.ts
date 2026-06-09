import { BaseProvider, type ProviderTick } from "./BaseProvider.js";
import type { CTraderService } from "../CTraderService.js";
import { logger } from "../../lib/logger.js";

/**
 * CTraderProvider — bridges CTraderService spot-tick events into the
 * unified BaseProvider pipeline consumed by MarketFeedManager.
 *
 * CTraderService handles its own TLS connection, OAuth auth, heartbeat,
 * and reconnect logic. This adapter only:
 *  1. Translates its `tick` events → BaseProvider.onTick()
 *  2. Reflects its connection state → BaseProvider status fields
 *  3. Exposes the list of symbols it streams
 */

const CTRADER_SYMBOLS = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
  "USDCHF", "EURGBP", "GBPJPY", "EURJPY",
  "XAUUSD", "XAGUSD",
  "US30", "NAS100", "SPX500", "GER40", "UK100",
  "USOIL",
];

interface CTraderTickEvent {
  symbol: string;
  bid: number;
  ask: number;
  ts: number;
  source: string;
}

interface CTraderStatusEvent {
  connected: boolean;
  state: string;
  latencyMs: number;
}

export class CTraderProvider extends BaseProvider {
  readonly name        = "ctrader";
  readonly displayName = "cTrader Open API";
  readonly badge       = "ctrader";
  readonly color       = "#F59E0B";
  readonly supportedSymbols: string[] = [...CTRADER_SYMBOLS];

  private readonly svc: CTraderService;
  private tickHandler: ((e: CTraderTickEvent) => void) | null = null;
  private statusHandler: ((e: CTraderStatusEvent) => void) | null = null;

  constructor(ctrader: CTraderService) {
    super();
    this.svc = ctrader;
    this._bridge();
  }

  private _bridge(): void {
    this.tickHandler = (e: CTraderTickEvent) => {
      if (!this.subscriptions.has(e.symbol)) return;

      const mid = e.bid && e.ask ? (e.bid + e.ask) / 2 : (e.bid || e.ask);
      if (!mid || mid <= 0) return;

      const tick: ProviderTick = {
        symbol:         e.symbol,
        providerSymbol: e.symbol,
        provider:       this.name,
        price:          mid,
        volume:         0,
        timestamp:      e.ts,
        receivedAt:     Date.now(),
      };

      logger.info(
        { provider: this.name, symbol: e.symbol, bid: e.bid, ask: e.ask, mid },
        "CTraderProvider: tick",
      );
      this.onTick(tick);
    };

    this.statusHandler = (e: CTraderStatusEvent) => {
      const prev = this.status;

      if (e.connected && prev !== "connected") {
        logger.info({ provider: this.name, state: e.state }, "CTraderProvider: connected");
        this.onConnected();
      } else if (!e.connected && prev === "connected") {
        logger.warn({ provider: this.name, state: e.state }, "CTraderProvider: disconnected");
        this.status = "reconnecting";
        this.reconnectCount++;
        this.emit("reconnecting", { delay: 5000 });
      } else if (e.state === "error" && prev !== "error") {
        this.onError(new Error("cTrader connection error"));
      }

      if (e.latencyMs > 0) {
        this.latencies.push(e.latencyMs);
        if (this.latencies.length > 100) this.latencies.shift();
      }
    };

    this.svc.on("tick",          this.tickHandler);
    this.svc.on("status_change", this.statusHandler as (e: unknown) => void);

    const st = this.svc.getStatus();
    if (st.connected) {
      logger.info({ provider: this.name }, "CTraderProvider: already connected at bridge time");
      this.status = "connected";
      this.connectedAt = Date.now();
      for (const sym of this.subscriptions) this.subscribeSymbol(sym);
    }
  }

  connect(): void {
    logger.debug({ provider: this.name }, "CTraderProvider: connect() — delegated to CTraderService");
  }

  destroy(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    if (this.tickHandler)   this.svc.removeListener("tick",          this.tickHandler);
    if (this.statusHandler) this.svc.removeListener("status_change", this.statusHandler as (e: unknown) => void);
    this.tickHandler   = null;
    this.statusHandler = null;
    logger.info({ provider: this.name }, "CTraderProvider: destroyed");
  }

  subscribeSymbol(symbol: string): void {
    logger.debug({ provider: this.name, symbol }, "CTraderProvider: subscribeSymbol (cTrader auto-streams all target symbols)");
  }

  unsubscribeSymbol(symbol: string): void {
    logger.debug({ provider: this.name, symbol }, "CTraderProvider: unsubscribeSymbol (individual unsub not supported in current impl)");
  }

  protected scheduleReconnect(): void {
    logger.debug({ provider: this.name }, "CTraderProvider: reconnect delegated to CTraderService — no local timer");
  }
}
