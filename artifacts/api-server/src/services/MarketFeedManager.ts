import { EventEmitter } from "events";
import { BaseProvider, type ProviderTick, type ProviderStats } from "./providers/BaseProvider.js";
import { FinnhubProvider } from "./providers/FinnhubProvider.js";
import { DeltaExchangeProvider, type DeltaSymbolEntry } from "./providers/DeltaExchangeProvider.js";
import { CTraderProvider } from "./providers/CTraderProvider.js";
import type { CTraderService } from "./CTraderService.js";
import { SymbolService } from "./SymbolService.js";
import { logger } from "../lib/logger.js";

const MAX_TICKS_PER_SYMBOL = 500;

export interface UnifiedTick extends ProviderTick {}

export interface FeedManagerStats {
  providers:          ProviderStats[];
  totalSymbols:       number;
  totalTicks:         number;
  allProvidersHealthy: boolean;
}

/**
 * Symbol routing:
 *  - Crypto perpetuals → Delta Exchange India (no API key required)
 *  - Forex / Metals / Indices → Finnhub/OANDA (requires FINNHUB_API_KEY)
 *                              OR cTrader (requires OAuth)
 *
 * Routes are stored in a mutable map so new symbols can be added dynamically
 * as the Delta India catalog is fetched and cTrader connects.
 */

// Broker-aware static symbol routing.
// Forex / Metals / Indices / Commodities → cTrader (Fusion Markets)
// Crypto perpetuals → Delta Exchange India (USDT-quoted; also legacy USD-suffix aliases)
const STATIC_SYMBOL_ROUTING: Record<string, string> = {
  // ── Forex ──────────────────────────────────────────────────────────────────
  EURUSD: "ctrader", GBPUSD: "ctrader", USDJPY: "ctrader",
  AUDUSD: "ctrader", USDCAD: "ctrader", USDCHF: "ctrader",
  EURGBP: "ctrader", GBPJPY: "ctrader", EURJPY: "ctrader",
  EURAUD: "ctrader", GBPAUD: "ctrader", NZDUSD: "ctrader",
  USDSGD: "ctrader", USDHKD: "ctrader",
  // ── Metals ─────────────────────────────────────────────────────────────────
  XAUUSD: "ctrader", XAGUSD: "ctrader",
  // ── Indices ────────────────────────────────────────────────────────────────
  US30: "ctrader", NAS100: "ctrader", SPX500: "ctrader",
  GER40: "ctrader", UK100:  "ctrader", JP225:  "ctrader",
  AUS200: "ctrader", STOXX50: "ctrader",
  // ── Commodities ────────────────────────────────────────────────────────────
  USOIL: "ctrader", UKOIL: "ctrader", NGAS: "ctrader",
  // ── Crypto perpetuals (USDT-quoted, Delta Exchange India) ──────────────────
  BTCUSDT: "delta", ETHUSDT: "delta", SOLUSDT: "delta",
  BNBUSDT: "delta", XRPUSDT: "delta", DOGEUSDT: "delta",
  ADAUSDT: "delta", AVAXUSDT: "delta", DOTUSDT: "delta",
  PEPEUSDT: "delta", LINKUSDT: "delta", UNIUSDT: "delta",
  NEARUSDT: "delta", ATOMUSDT: "delta", LTCUSDT: "delta",
  // ── Legacy USD-suffix aliases (backward compat for old watchlist entries) ──
  BTCUSD: "delta", ETHUSD: "delta", SOLUSD: "delta",
  DOGEUSD: "delta", PEPEUSD: "delta",
};

export const PROVIDER_METADATA: Record<string, { displayName: string; badge: string; color: string }> = {
  finnhub: { displayName: "Finnhub / OANDA · Binance", badge: "oanda",   color: "#3B82F6" },
  delta:   { displayName: "Delta Exchange India",       badge: "delta",   color: "#8B5CF6" },
  ctrader: { displayName: "cTrader Open API",           badge: "ctrader", color: "#F59E0B" },
};

export class MarketFeedManager extends EventEmitter {
  private providers:        Map<string, BaseProvider>  = new Map();
  private latestTicks:      Map<string, UnifiedTick>   = new Map();
  private tickHistory:      Map<string, UnifiedTick[]> = new Map();
  private subscribedSymbols: Set<string>               = new Set();
  private symbolRouting:    Map<string, string>        = new Map(Object.entries(STATIC_SYMBOL_ROUTING));
  private totalTicks = 0;

  readonly symbolService: SymbolService = new SymbolService();

  constructor(private finnhubApiKey: string | undefined) {
    super();
  }

  async start(defaultSymbols: string[] = []): Promise<void> {
    this.buildStaticProviders();

    for (const sym of defaultSymbols) {
      this.subscribedSymbols.add(sym);
    }

    for (const [name, provider] of this.providers) {
      const symbolsForProvider = defaultSymbols.filter(s => this.symbolRouting.get(s) === name);
      this.wireProvider(provider);
      for (const sym of symbolsForProvider) provider.subscribe(sym);
      provider.connect();
    }

    logger.info(
      { providers: [...this.providers.keys()], symbols: defaultSymbols },
      "MarketFeedManager: started",
    );

    this._bootstrapDeltaIndia(defaultSymbols).catch(err =>
      logger.error({ err }, "MarketFeedManager: Delta India bootstrap error"),
    );
  }

  /** Fetch the full Delta India catalog and upgrade the provider symbol map. */
  private async _bootstrapDeltaIndia(defaultSymbols: string[]): Promise<void> {
    try {
      const catalog = await this.symbolService.getDeltaSymbols();
      // Delta India product symbols are "xyzUSD" (e.g. BTCUSD).
      // The replace("USDT","USD") is a no-op for these symbols but kept for safety.
      // internalSymbol === deltaSymbol for all Delta India perpetuals.
      const entries: DeltaSymbolEntry[] = catalog.map(s => ({
        internalSymbol: s.symbol,
        deltaSymbol:    s.symbol,
      }));

      for (const { internalSymbol } of entries) {
        if (!this.symbolRouting.has(internalSymbol)) {
          this.symbolRouting.set(internalSymbol, "delta");
        }
      }

      const deltaProvider = this.providers.get("delta");
      if (deltaProvider && deltaProvider instanceof DeltaExchangeProvider) {
        deltaProvider.refreshSymbols(entries);
        logger.info({ count: entries.length }, "MarketFeedManager: Delta India symbol map refreshed");

        for (const sym of defaultSymbols) {
          if (this.symbolRouting.get(sym) === "delta") deltaProvider.subscribe(sym);
        }
      } else {
        const delta = new DeltaExchangeProvider(entries);
        this.wireProvider(delta);
        this.providers.set("delta", delta);
        for (const sym of defaultSymbols) {
          if (this.symbolRouting.get(sym) === "delta") delta.subscribe(sym);
        }
        delta.connect();
        logger.info({ count: entries.length }, "MarketFeedManager: Delta India provider created with full catalog");
      }
    } catch (err) {
      logger.error({ err }, "MarketFeedManager: failed to bootstrap Delta India catalog");
    }
  }

  subscribe(symbol: string): boolean {
    let providerName = this.symbolRouting.get(symbol);

    // Auto-route: any unknown xyzUSD / xyzUSDT perpetual → Delta India.
    // This handles coins added before the async bootstrap completes AND
    // any new Delta India listing not yet in the static routing table.
    // Symbols explicitly routed elsewhere (finnhub/ctrader) are not overridden.
    if (!providerName && /^[A-Z0-9]+USDT?$/.test(symbol)) {
      providerName = "delta";
      this.symbolRouting.set(symbol, "delta");
      logger.info({ symbol }, "MarketFeedManager: auto-routed new crypto symbol → delta");
    }

    if (!providerName) return false;

    // Always record the intent — even if the provider isn't live yet.
    // When enableCTrader() / enableDelta() runs later it checks
    // subscribedSymbols to re-subscribe queued symbols.
    this.subscribedSymbols.add(symbol);

    const provider = this.providers.get(providerName);
    if (!provider) {
      logger.debug({ symbol, providerName }, "MarketFeedManager: provider not yet active — subscription queued");
      return false;
    }
    provider.subscribe(symbol);
    this.emit("subscription_update", { symbol, action: "subscribed", provider: providerName, subscriptions: this.getSubscriptions() });
    return true;
  }

  unsubscribe(symbol: string): boolean {
    if (!this.subscribedSymbols.has(symbol)) return false;
    const providerName = this.symbolRouting.get(symbol);
    if (providerName) this.providers.get(providerName)?.unsubscribe(symbol);
    this.subscribedSymbols.delete(symbol);
    this.emit("subscription_update", { symbol, action: "unsubscribed", subscriptions: this.getSubscriptions() });
    return true;
  }

  getLatestTick(symbol: string): UnifiedTick | undefined  { return this.latestTicks.get(symbol); }
  getAllLatestTicks(): Record<string, UnifiedTick>         { return Object.fromEntries(this.latestTicks.entries()); }
  getTickHistory(symbol: string): UnifiedTick[]           { return this.tickHistory.get(symbol) ?? []; }
  getSubscriptions(): string[]                            { return [...this.subscribedSymbols]; }
  getSupportedSymbols(): string[]                         { return [...this.symbolRouting.keys()]; }
  getProviderForSymbol(symbol: string): string | undefined { return this.symbolRouting.get(symbol); }
  getProviderStats(): ProviderStats[]                     { return [...this.providers.values()].map(p => p.getStats()); }

  getFeedManagerStats(): FeedManagerStats {
    const stats = this.getProviderStats();
    return {
      providers:           stats,
      totalSymbols:        this.subscribedSymbols.size,
      totalTicks:          this.totalTicks,
      allProvidersHealthy: stats.every(s => s.status === "connected"),
    };
  }

  isAnyConnected(): boolean  { return [...this.providers.values()].some(p => p.isConnected()); }
  isFeedEnabled(): boolean   { return !!this.finnhubApiKey || this.providers.size > 0; }

  enableFinnhub(apiKey: string, symbols: string[]): void {
    const existing = this.providers.get("finnhub");
    if (existing) { existing.destroy(); this.providers.delete("finnhub"); }
    const finnhub = new FinnhubProvider(apiKey);
    this.wireProvider(finnhub);
    this.providers.set("finnhub", finnhub);
    for (const sym of symbols) { this.subscribedSymbols.add(sym); finnhub.subscribe(sym); }
    finnhub.connect();
    logger.info({ symbols }, "MarketFeedManager: Finnhub provider enabled");
  }

  disableFinnhub(): void {
    const existing = this.providers.get("finnhub");
    if (existing) {
      existing.destroy();
      this.providers.delete("finnhub");
      logger.info("MarketFeedManager: Finnhub provider disabled");
      this.emit("provider_status", { provider: "finnhub", status: "disconnected" });
    }
  }

  enableDelta(symbols: string[]): void {
    const existing = this.providers.get("delta");
    if (existing) { existing.destroy(); this.providers.delete("delta"); }

    const entries: DeltaSymbolEntry[] = symbols.map(sym => ({
      internalSymbol: sym,
      deltaSymbol:    sym.replace("USD", "USDT"),
    }));

    const delta = new DeltaExchangeProvider(entries);
    this.wireProvider(delta);
    this.providers.set("delta", delta);
    for (const sym of symbols) { this.subscribedSymbols.add(sym); delta.subscribe(sym); }
    delta.connect();
    logger.info({ symbols }, "MarketFeedManager: Delta India provider enabled");

    this.symbolService.getDeltaSymbols().then(catalog => {
      const fullEntries: DeltaSymbolEntry[] = catalog.map(s => ({
        internalSymbol: s.symbol.replace("USDT", "USD"),
        deltaSymbol:    s.symbol,
      }));
      delta.refreshSymbols(fullEntries);
      for (const { internalSymbol } of fullEntries) {
        if (!this.symbolRouting.has(internalSymbol)) this.symbolRouting.set(internalSymbol, "delta");
      }
      logger.info({ count: fullEntries.length }, "MarketFeedManager: Delta India catalog refreshed after enableDelta");
    }).catch(err => logger.error({ err }, "MarketFeedManager: Delta catalog refresh failed"));
  }

  disableDelta(): void {
    const existing = this.providers.get("delta");
    if (existing) {
      existing.destroy();
      this.providers.delete("delta");
      logger.info("MarketFeedManager: Delta provider disabled");
      this.emit("provider_status", { provider: "delta", status: "disconnected" });
    }
  }

  enableCTrader(ctrader: CTraderService): void {
    const existing = this.providers.get("ctrader");
    if (existing) { existing.destroy(); this.providers.delete("ctrader"); }

    const provider = new CTraderProvider(ctrader);
    this.wireProvider(provider);
    this.providers.set("ctrader", provider);

    for (const sym of provider.supportedSymbols) {
      // Override any "finnhub" placeholder routes — Finnhub is disabled in prod
      // so these symbols would never receive ticks unless rerouted to ctrader.
      // Delta routes are never overridden.
      const current = this.symbolRouting.get(sym);
      if (!current || current === "finnhub") {
        this.symbolRouting.set(sym, "ctrader");
      }
      if (this.subscribedSymbols.has(sym)) provider.subscribe(sym);
    }

    provider.connect();
    logger.info(
      { symbols: provider.supportedSymbols, overrodeCount: provider.supportedSymbols.length },
      "MarketFeedManager: cTrader provider enabled — Forex/Indices/Commodities routed",
    );
  }

  disableCTrader(): void {
    const existing = this.providers.get("ctrader");
    if (existing) {
      existing.destroy();
      this.providers.delete("ctrader");
      logger.info("MarketFeedManager: cTrader provider disabled");
      this.emit("provider_status", { provider: "ctrader", status: "disconnected" });
    }
  }

  getDiagnostics() {
    const allTicks = this.getAllLatestTicks();
    const now      = Date.now();

    const perSymbol: Record<string, {
      provider:     string | undefined;
      subscribed:   boolean;
      lastTickAt:   number | null;
      lastPrice:    number | null;
      lastTickAgo:  number | null;
    }> = {};

    for (const sym of this.symbolRouting.keys()) {
      const tick = allTicks[sym];
      perSymbol[sym] = {
        provider:    this.symbolRouting.get(sym),
        subscribed:  this.subscribedSymbols.has(sym),
        lastTickAt:  tick?.timestamp ?? null,
        lastPrice:   tick?.price    ?? null,
        lastTickAgo: tick ? now - tick.timestamp : null,
      };
    }

    return {
      providers:     this.getProviderStats(),
      symbolRouting: Object.fromEntries(this.symbolRouting.entries()),
      subscriptions: [...this.subscribedSymbols],
      perSymbol,
      totalTicks:    this.totalTicks,
      ts:            now,
    };
  }

  stop(): void {
    for (const provider of this.providers.values()) provider.destroy();
    this.providers.clear();
  }

  private buildStaticProviders(): void {
    if (this.finnhubApiKey) {
      this.providers.set("finnhub", new FinnhubProvider(this.finnhubApiKey));
    } else {
      logger.warn("MarketFeedManager: no FINNHUB_API_KEY — Finnhub/OANDA/Binance feed disabled");
    }

    // Delta India symbols are "xyzUSD" — internalSymbol === deltaSymbol.
    // (Full catalog is loaded asynchronously via _bootstrapDeltaIndia.)
    const fallbackEntries: DeltaSymbolEntry[] = [
      { internalSymbol: "BTCUSD",  deltaSymbol: "BTCUSD"  },
      { internalSymbol: "ETHUSD",  deltaSymbol: "ETHUSD"  },
      { internalSymbol: "SOLUSD",  deltaSymbol: "SOLUSD"  },
      { internalSymbol: "DOGEUSD", deltaSymbol: "DOGEUSD" },
      { internalSymbol: "PEPEUSD", deltaSymbol: "PEPEUSD" },
    ];
    this.providers.set("delta", new DeltaExchangeProvider(fallbackEntries));
  }

  private wireProvider(provider: BaseProvider): void {
    provider.on("tick", (tick: ProviderTick) => {
      const unified: UnifiedTick = tick;
      this.latestTicks.set(tick.symbol, unified);
      this.totalTicks++;

      const history = this.tickHistory.get(tick.symbol) ?? [];
      history.push(unified);
      if (history.length > MAX_TICKS_PER_SYMBOL) history.shift();
      this.tickHistory.set(tick.symbol, history);

      this.emit("tick", unified);
    });

    provider.on("connected", () => {
      this.emit("provider_status", { provider: provider.name, status: "connected" });
    });

    provider.on("disconnected", (info: { code?: number }) => {
      this.emit("provider_status", { provider: provider.name, status: "disconnected", ...info });
    });

    provider.on("reconnecting", (info: { delay: number }) => {
      this.emit("provider_status", { provider: provider.name, status: "reconnecting", ...info });
    });

    provider.on("error", (err: Error) => {
      this.emit("provider_status", { provider: provider.name, status: "error", message: err.message });
    });
  }
}
