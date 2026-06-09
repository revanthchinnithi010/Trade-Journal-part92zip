import { logger } from "../lib/logger.js";

export interface SymbolInfo {
  symbol:       string;
  name:         string;
  contractType: string;
  broker:       string;
  underlying:   string;
  quoteAsset:   string;
  active:       boolean;
}

interface DeltaProduct {
  symbol:           string;
  description?:     string;
  contract_type:    string;
  trading_status:   string;
  underlying_asset?: { symbol: string };
  settling_asset?:  { symbol: string };
}

const DELTA_INDIA_REST = "https://api.india.delta.exchange";
const CACHE_TTL_MS = 10 * 60 * 1_000; // 10 minutes

const CTRADER_SYMBOLS: SymbolInfo[] = [
  { symbol: "EURUSD",  name: "Euro / US Dollar",          contractType: "forex",     broker: "ctrader", underlying: "EUR", quoteAsset: "USD", active: true },
  { symbol: "GBPUSD",  name: "British Pound / US Dollar", contractType: "forex",     broker: "ctrader", underlying: "GBP", quoteAsset: "USD", active: true },
  { symbol: "USDJPY",  name: "US Dollar / Japanese Yen",  contractType: "forex",     broker: "ctrader", underlying: "USD", quoteAsset: "JPY", active: true },
  { symbol: "AUDUSD",  name: "Australian Dollar / USD",   contractType: "forex",     broker: "ctrader", underlying: "AUD", quoteAsset: "USD", active: true },
  { symbol: "USDCAD",  name: "US Dollar / Canadian Dollar",contractType: "forex",    broker: "ctrader", underlying: "USD", quoteAsset: "CAD", active: true },
  { symbol: "USDCHF",  name: "US Dollar / Swiss Franc",   contractType: "forex",     broker: "ctrader", underlying: "USD", quoteAsset: "CHF", active: true },
  { symbol: "EURGBP",  name: "Euro / British Pound",      contractType: "forex",     broker: "ctrader", underlying: "EUR", quoteAsset: "GBP", active: true },
  { symbol: "GBPJPY",  name: "British Pound / Yen",       contractType: "forex",     broker: "ctrader", underlying: "GBP", quoteAsset: "JPY", active: true },
  { symbol: "EURJPY",  name: "Euro / Japanese Yen",       contractType: "forex",     broker: "ctrader", underlying: "EUR", quoteAsset: "JPY", active: true },
  { symbol: "XAUUSD",  name: "Gold / US Dollar",          contractType: "metal",     broker: "ctrader", underlying: "XAU", quoteAsset: "USD", active: true },
  { symbol: "XAGUSD",  name: "Silver / US Dollar",        contractType: "metal",     broker: "ctrader", underlying: "XAG", quoteAsset: "USD", active: true },
  { symbol: "US30",    name: "Dow Jones Industrial Avg",  contractType: "index",     broker: "ctrader", underlying: "US30", quoteAsset: "USD", active: true },
  { symbol: "NAS100",  name: "NASDAQ 100",                contractType: "index",     broker: "ctrader", underlying: "NAS100", quoteAsset: "USD", active: true },
  { symbol: "SPX500",  name: "S&P 500",                   contractType: "index",     broker: "ctrader", underlying: "SPX500", quoteAsset: "USD", active: true },
  { symbol: "GER40",   name: "Germany 40 (DAX)",          contractType: "index",     broker: "ctrader", underlying: "GER40", quoteAsset: "EUR", active: true },
  { symbol: "UK100",   name: "UK 100 (FTSE)",             contractType: "index",     broker: "ctrader", underlying: "UK100", quoteAsset: "GBP", active: true },
  { symbol: "USOIL",   name: "Crude Oil WTI",             contractType: "commodity", broker: "ctrader", underlying: "USOIL", quoteAsset: "USD", active: true },
];

interface DeltaCacheEntry {
  symbols:  SymbolInfo[];
  fetchedAt: number;
}

export class SymbolService {
  private deltaCache: DeltaCacheEntry | null = null;
  private fetchPromise: Promise<SymbolInfo[]> | null = null;

  async getDeltaSymbols(forceRefresh = false): Promise<SymbolInfo[]> {
    if (!forceRefresh && this.deltaCache && Date.now() - this.deltaCache.fetchedAt < CACHE_TTL_MS) {
      logger.debug({ count: this.deltaCache.symbols.length }, "SymbolService: Delta India cache hit");
      return this.deltaCache.symbols;
    }

    if (this.fetchPromise) {
      logger.debug("SymbolService: waiting for in-flight Delta India fetch");
      return this.fetchPromise;
    }

    this.fetchPromise = this._fetchDeltaIndia().finally(() => {
      this.fetchPromise = null;
    });

    return this.fetchPromise;
  }

  private async _fetchDeltaIndia(): Promise<SymbolInfo[]> {
    logger.info("SymbolService: fetching Delta India product catalog");
    try {
      const url = `${DELTA_INDIA_REST}/v2/products?states=live`;
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        headers: {
          "Accept": "application/json",
          "User-Agent": "TradeVault/1.0",
        },
      });

      if (!resp.ok) {
        throw new Error(`Delta India REST returned HTTP ${resp.status}`);
      }

      const body = await resp.json() as { result?: DeltaProduct[]; success?: boolean };
      const products: DeltaProduct[] = Array.isArray(body.result) ? body.result : [];

      const symbols: SymbolInfo[] = products
        .filter(p =>
          p.contract_type === "perpetual_futures" &&
          p.trading_status === "operational" &&
          p.symbol,
        )
        .map(p => ({
          symbol:       p.symbol,
          name:         p.description ?? p.symbol,
          contractType: p.contract_type,
          broker:       "delta",
          underlying:   p.underlying_asset?.symbol ?? p.symbol.replace("USDT", ""),
          quoteAsset:   p.settling_asset?.symbol ?? "USDT",
          active:       true,
        }))
        .sort((a, b) => a.symbol.localeCompare(b.symbol));

      logger.info({ count: symbols.length }, "SymbolService: Delta India symbols loaded");

      this.deltaCache = { symbols, fetchedAt: Date.now() };
      return symbols;
    } catch (err) {
      logger.error({ err }, "SymbolService: failed to fetch Delta India symbols — returning cached or fallback");

      if (this.deltaCache) return this.deltaCache.symbols;

      return this._fallbackDeltaSymbols();
    }
  }

  private _fallbackDeltaSymbols(): SymbolInfo[] {
    logger.warn("SymbolService: using hardcoded Delta India fallback symbols");
    const fallback = [
      "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
      "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "DOTUSDT", "MATICUSDT",
      "LINKUSDT", "LTCUSDT", "UNIUSDT", "ATOMUSDT", "NEARUSDT",
    ];
    return fallback.map(sym => ({
      symbol: sym,
      name: sym,
      contractType: "perpetual_futures",
      broker: "delta",
      underlying: sym.replace("USDT", ""),
      quoteAsset: "USDT",
      active: true,
    }));
  }

  getCTraderSymbols(): SymbolInfo[] {
    return CTRADER_SYMBOLS;
  }

  async getAllSymbols(): Promise<{ delta: SymbolInfo[]; ctrader: SymbolInfo[] }> {
    const [delta] = await Promise.all([this.getDeltaSymbols()]);
    return { delta, ctrader: this.getCTraderSymbols() };
  }
}
