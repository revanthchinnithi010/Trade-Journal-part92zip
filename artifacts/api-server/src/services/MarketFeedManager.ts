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
 * Symbol routing is built entirely dynamically — no hardcoded symbol lists.
 *
 * Sources:
 *  - Delta Exchange: catalog fetched from REST API on startup + periodic refresh
 *  - cTrader: catalog loaded from the connected broker account via SYMBOLS_LIST_REQ
 *
 * Routing rules (applied in order):
 *  1. Explicit entry in symbolRouting map (set when catalogs load)
 *  2. Auto-route: any xyzUSDT or xyzUSD perpetual pattern → Delta (crypto fallback)
 */

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
  private symbolRouting:    Map<string, string>        = new Map();
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
      "MarketFeedManager: started — symbol routing will be built dynamically",
    );

    this._bootstrapDeltaIndia(defaultSymbols).catch(err =>
      logger.error({ err }, "MarketFeedManager: Delta India bootstrap error"),
    );
  }

  /** Fetch the full Delta India catalog and upgrade the provider symbol map. */
  private async _bootstrapDeltaIndia(defaultSymbols: string[]): Promise<void> {
    try {
      const catalog = await this.symbolService.getDeltaSymbols();
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

    // Auto-route: any unknown xyzUSDT or xyzUSD perpetual → Delta India.
    // This handles coins added before the async bootstrap completes AND
    // any new Delta India listing not yet in the routing table.
    // Symbols explicitly routed elsewhere (ctrader) are never overridden.
    if (!providerName && /^[A-Z0-9]+USDT?$/.test(symbol)) {
      providerName = "delta";
      this.symbolRouting.set(symbol, "delta");
      logger.info({ symbol }, "MarketFeedManager: auto-routed new crypto symbol → delta");
    }

    if (!providerName) return false;

    // Always record the intent — even if the provider isn't live yet.
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
        internalSymbol: s.symbol,
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

    // If symbols are already loaded (re-enable after reconnect), seed routing now.
    this._onCTraderSymbolsChanged(provider, provider.supportedSymbols);

    // Listen for future catalog updates (first connect, or reconnects).
    provider.on("symbols_changed", (syms: string[]) => {
      this._onCTraderSymbolsChanged(provider, syms);
    });

    provider.connect();
    logger.info("MarketFeedManager: cTrader provider enabled — routing will be seeded from broker catalog");
  }

  private _onCTraderSymbolsChanged(provider: CTraderProvider, syms: string[]): void {
    let newRoutes = 0;
    for (const sym of syms) {
      // Never override an explicit Delta route.
      const current = this.symbolRouting.get(sym);
      if (!current || current === "finnhub") {
        this.symbolRouting.set(sym, "ctrader");
        newRoutes++;
      }
      // Re-subscribe queued symbols.
      if (this.subscribedSymbols.has(sym)) provider.subscribe(sym);
    }

    // Update SymbolService with the live cTrader catalog.
    this.symbolService.setCTraderSymbols(
      syms.map(sym => ({
        symbol:       sym,
        name:         sym,
        contractType: this._guessCTraderContractType(sym),
        broker:       "ctrader",
        underlying:   sym.slice(0, 3),
        quoteAsset:   sym.slice(3) || "USD",
        active:       true,
      }))
    );

    logger.info(
      { total: syms.length, newRoutes },
      "MarketFeedManager: cTrader routing table updated from live broker catalog",
    );

    this.emit("subscription_update", { action: "catalog_updated", provider: "ctrader", count: syms.length });
  }

  private _guessCTraderContractType(sym: string): string {
    const s = sym.toUpperCase();
    const METALS = ["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD"];
    if (METALS.includes(s)) return "metal";
    if (/^[A-Z]{6}$/.test(s)) return "forex";
    if (/^(US30|NAS|SPX|GER|UK1|JP2|AUS|DOW|DAX|CAC|FTSE|IBEX|HAN|BEL|SMI|OMX)/.test(s)) return "index";
    if (/^(USOIL|UKOIL|NGAS|COPPER|WHEAT|CORN|SUGAR|COFFEE|COCOA|COTTON)/.test(s)) return "commodity";
    return "cfd";
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
    const ctraderProvider = this.providers.get("ctrader") as CTraderProvider | undefined;

    const perSymbol: Record<string, {
      provider:     string | undefined;
      subscribed:   boolean;
      lastTickAt:   number | null;
      lastPrice:    number | null;
      lastTickAgo:  number | null;
      symbolId:     string | undefined;
    }> = {};

    for (const sym of this.symbolRouting.keys()) {
      const tick         = allTicks[sym];
      const providerName = this.symbolRouting.get(sym);
      const symbolId     = providerName === "ctrader"
        ? ctraderProvider?.getSymbolId(sym)?.toString()
        : undefined;

      perSymbol[sym] = {
        provider:    providerName,
        subscribed:  this.subscribedSymbols.has(sym),
        lastTickAt:  tick?.timestamp ?? null,
        lastPrice:   tick?.price    ?? null,
        lastTickAgo: tick ? now - tick.timestamp : null,
        symbolId,
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

    // Delta provider starts with an empty catalog — full catalog loaded async via _bootstrapDeltaIndia.
    this.providers.set("delta", new DeltaExchangeProvider([]));
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
