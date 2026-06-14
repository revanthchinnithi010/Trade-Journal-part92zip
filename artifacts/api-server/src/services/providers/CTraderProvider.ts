import { BaseProvider, type ProviderTick } from "./BaseProvider.js";
import type { CTraderService } from "../CTraderService.js";
import { logger } from "../../lib/logger.js";

/**
 * CTraderProvider — bridges CTraderService spot-tick events into the
 * unified BaseProvider pipeline consumed by MarketFeedManager.
 *
 * Symbol catalog is loaded dynamically from the connected broker account:
 * CTraderService fetches ALL symbols via SYMBOLS_LIST_REQ after auth,
 * then emits "symbols_loaded" with the full list.  We relay that as
 * "symbols_changed" so MarketFeedManager can update its routing table.
 */

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

  /** Populated dynamically when CTraderService emits "symbols_loaded". */
  supportedSymbols: string[] = [];

  private readonly svc: CTraderService;
  private tickHandler:    ((e: CTraderTickEvent) => void)   | null = null;
  private statusHandler:  ((e: CTraderStatusEvent) => void) | null = null;
  private symbolsHandler: ((syms: string[]) => void)        | null = null;

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

    this.symbolsHandler = (syms: string[]) => {
      this.supportedSymbols = syms;
      logger.info({ count: syms.length }, "CTraderProvider: broker symbol catalog received");
      this.emit("symbols_changed", syms);
    };

    this.svc.on("tick",           this.tickHandler);
    this.svc.on("status_change",  this.statusHandler as (e: unknown) => void);
    this.svc.on("symbols_loaded", this.symbolsHandler as (e: unknown) => void);

    const st = this.svc.getStatus();
    if (st.connected) {
      logger.info({ provider: this.name }, "CTraderProvider: already connected at bridge time");
      this.status = "connected";
      this.connectedAt = Date.now();
      // Populate symbol list from the already-connected service
      const loaded = this.svc.getLoadedSymbols();
      if (loaded.length > 0) {
        this.supportedSymbols = loaded;
        this.emit("symbols_changed", loaded);
      }
      for (const sym of this.subscriptions) this.subscribeSymbol(sym);
    }
  }

  connect(): void {
    logger.debug({ provider: this.name }, "CTraderProvider: connect() — delegated to CTraderService");
  }

  destroy(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    if (this.tickHandler)    this.svc.removeListener("tick",           this.tickHandler);
    if (this.statusHandler)  this.svc.removeListener("status_change",  this.statusHandler as (e: unknown) => void);
    if (this.symbolsHandler) this.svc.removeListener("symbols_loaded", this.symbolsHandler as (e: unknown) => void);
    this.tickHandler    = null;
    this.statusHandler  = null;
    this.symbolsHandler = null;
    logger.info({ provider: this.name }, "CTraderProvider: destroyed");
  }

  subscribeSymbol(symbol: string): void {
    logger.debug({ provider: this.name, symbol }, "CTraderProvider: subscribeSymbol (cTrader auto-streams all subscribed symbols)");
  }

  unsubscribeSymbol(symbol: string): void {
    logger.debug({ provider: this.name, symbol }, "CTraderProvider: unsubscribeSymbol");
  }

  /** Returns the broker's numeric ID for a given symbol (for diagnostics). */
  getSymbolId(name: string): bigint | undefined { return this.svc.getSymbolId(name); }

  protected scheduleReconnect(): void {
    logger.debug({ provider: this.name }, "CTraderProvider: reconnect delegated to CTraderService");
  }
}
