import WebSocket from "ws";
import { BaseProvider, type ProviderTick } from "./BaseProvider.js";
import { logger } from "../../lib/logger.js";

/**
 * Finnhub WebSocket provider.
 *
 * WS endpoint: wss://ws.finnhub.io?token=API_KEY
 * Message format: { type: "trade", data: [{ s, p, v, t }] }
 *
 * Symbol routing:
 *   - Forex / Indices / Commodities → OANDA:<BASE>_<QUOTE>
 *   - Crypto                        → BINANCE:<PAIR>USDT
 *   - US Stocks / ETFs              → raw ticker (e.g. "AAPL")
 *
 * Dynamic subscription: any symbol can be subscribed at runtime.
 * Unknown internal symbols are forwarded as-is to Finnhub; the server
 * will return an error message if the symbol is invalid.
 *
 * Rate-limit protection:
 *   Subscribe messages are queued and sent at SUBSCRIBE_INTERVAL_MS intervals
 *   to avoid hitting Finnhub's subscription rate limit on reconnects.
 *   MAX_SUBSCRIPTIONS caps the total to stay within free-plan limits.
 */

// Built-in static map: internal → Finnhub symbol
const STATIC_SYMBOL_MAP: Record<string, string> = {
  // Forex via OANDA
  EURUSD: "OANDA:EUR_USD",
  GBPUSD: "OANDA:GBP_USD",
  USDJPY: "OANDA:USD_JPY",
  AUDUSD: "OANDA:AUD_USD",
  USDCAD: "OANDA:USD_CAD",
  USDCHF: "OANDA:USD_CHF",
  EURGBP: "OANDA:EUR_GBP",
  GBPJPY: "OANDA:GBP_JPY",
  EURJPY: "OANDA:EUR_JPY",
  NZDUSD: "OANDA:NZD_USD",
  // Indices via OANDA
  NAS100: "OANDA:NAS100_USD",
  US30:   "OANDA:US30_USD",
  SPX500: "OANDA:SPX500_USD",
  US500:  "OANDA:SPX500_USD",
  GER40:  "OANDA:DE30_EUR",
  UK100:  "OANDA:UK100_GBP",
  // Metals via OANDA
  XAUUSD: "OANDA:XAU_USD",
  XAGUSD: "OANDA:XAG_USD",
  // Commodities via OANDA
  USOIL:  "OANDA:WTICO_USD",
  UKOIL:  "OANDA:BCO_USD",
  NGAS:   "OANDA:NATGAS_USD",
  NATGAS: "OANDA:NATGAS_USD",
  // Crypto via Binance (highest liquidity on Finnhub)
  BTCUSD:  "BINANCE:BTCUSDT",
  ETHUSD:  "BINANCE:ETHUSDT",
  SOLUSD:  "BINANCE:SOLUSDT",
  DOGEUSD: "BINANCE:DOGEUSDT",
  PEPEUSD: "BINANCE:PEPEUSDT",
  BNBUSD:  "BINANCE:BNBUSDT",
  XRPUSD:  "BINANCE:XRPUSDT",
};

const PING_INTERVAL_MS = 25_000;

/**
 * Rate-limit: 1 subscribe message per SUBSCRIBE_INTERVAL_MS.
 * Finnhub free plan allows ~30 simultaneous subscriptions.
 * Starter/professional plans allow more but benefit from the queue too.
 */
const SUBSCRIBE_INTERVAL_MS = 250; // 4 subscribes/sec — safe for all plans
const MAX_SUBSCRIPTIONS = 50;       // guard against free-plan hard cap

/**
 * Convert an internal symbol to a Finnhub symbol.
 * Falls back to the raw symbol if no mapping exists.
 */
function toFinnhubSymbol(symbol: string): string {
  if (STATIC_SYMBOL_MAP[symbol]) return STATIC_SYMBOL_MAP[symbol]!;
  // Auto-convert crypto patterns: XXXYYYY → BINANCE:XXXYYYY
  if (/^[A-Z0-9]{2,8}USDT$/.test(symbol))  return `BINANCE:${symbol}`;
  if (/^[A-Z0-9]{2,8}USD$/.test(symbol) && !symbol.endsWith("XUSD")) return `BINANCE:${symbol}T`;
  return symbol;
}

export class FinnhubProvider extends BaseProvider {
  readonly name        = "finnhub";
  readonly displayName = "Finnhub / OANDA · Binance";
  readonly badge       = "oanda";
  readonly color       = "#3B82F6";

  private ws:                WebSocket | null = null;
  private pingTimer:         ReturnType<typeof setInterval>  | null = null;
  private subscribeTimer:    ReturnType<typeof setTimeout>   | null = null;
  private subscribedFinnhub: Set<string>    = new Set();
  private subscribeQueue:    string[]       = []; // internal symbols awaiting WS subscribe

  // Dynamic symbol registry: internal → finnhub, finnhub → internal
  private internalToFinnhub: Map<string, string> = new Map(Object.entries(STATIC_SYMBOL_MAP));
  private finnhubToInternal: Map<string, string> = new Map(
    Object.entries(STATIC_SYMBOL_MAP).map(([k, v]) => [v, k]),
  );

  get supportedSymbols(): string[] {
    return [...this.internalToFinnhub.keys()];
  }

  constructor(private apiKey: string) {
    super();
  }

  /**
   * Override BaseProvider.subscribe() to support dynamic symbols.
   * Any symbol can be subscribed — unknown symbols are auto-mapped.
   */
  override subscribe(symbol: string): boolean {
    const s = symbol.toUpperCase();

    // Register dynamic mapping if not already known
    if (!this.internalToFinnhub.has(s)) {
      const finnhubSym = toFinnhubSymbol(s);
      this.internalToFinnhub.set(s, finnhubSym);
      this.finnhubToInternal.set(finnhubSym, s);
      logger.info({ provider: this.name, symbol: s, finnhubSym }, "FinnhubProvider: dynamically registered symbol");
    }

    this.subscriptions.add(s);

    if (this.status === "connected") {
      // WS is live — enqueue immediately; the queue drainer will rate-limit it
      this.enqueue(s);
    }
    // If not yet connected, onConnected() will enqueue everything in bulk

    return true;
  }

  connect(): void {
    if (this.destroyed) return;
    this.clearReconnectTimer();
    this.clearPing();
    this.clearSubscribeQueue();
    this.subscribedFinnhub.clear();

    const url = `wss://ws.finnhub.io?token=${this.apiKey}`;
    logger.info({ provider: this.name }, "FinnhubProvider: connecting");
    this.ws = new WebSocket(url, { handshakeTimeout: 10_000 });

    this.ws.on("open", () => {
      this.subscribedFinnhub.clear();
      this.onConnected();
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.ping();
      }, PING_INTERVAL_MS);
    });

    this.ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          data?: Array<{ s: string; p: number; v: number; t: number }>;
          msg?:  string;
        };

        if (msg.type === "trade" && Array.isArray(msg.data)) {
          for (const trade of msg.data) {
            const sym = this.finnhubToInternal.get(trade.s) ?? trade.s;
            const tick: ProviderTick = {
              symbol:         sym,
              providerSymbol: trade.s,
              provider:       this.name,
              price:          trade.p,
              volume:         trade.v,
              timestamp:      trade.t,  // Finnhub sends ms timestamps
              receivedAt:     Date.now(),
            };
            this.onTick(tick);
          }
        }

        if (msg.type === "error") {
          logger.warn(
            { msg, provider: this.name },
            "FinnhubProvider: server-side error (symbol may be unavailable or plan limit reached)",
          );
        }
      } catch (err) {
        logger.warn({ err, provider: this.name }, "FinnhubProvider: parse error");
      }
    });

    this.ws.on("error", (err) => this.onError(err));
    this.ws.on("close", (code) => {
      this.clearPing();
      this.clearSubscribeQueue();
      this.onDisconnected(code);
    });
  }

  /**
   * Override onConnected to enqueue all pending subscriptions with rate-limiting
   * instead of firing them all at once (which trips Finnhub's rate limiter).
   */
  protected override onConnected(): void {
    this.status     = "connected";
    this.connectedAt = Date.now();
    this.reconnectDelay = 1_000; // reset backoff

    logger.info(
      { provider: this.name, symbols: this.subscriptions.size },
      "FinnhubProvider: connected — queuing subscriptions",
    );
    this.emit("connected");

    // Enqueue all pending subscriptions; the queue drainer will pace them
    for (const sym of this.subscriptions) {
      this.enqueue(sym);
    }
  }

  subscribeSymbol(symbol: string): void {
    // Called by BaseProvider.subscribe() — we route through the queue instead
    this.enqueue(symbol);
  }

  unsubscribeSymbol(symbol: string): void {
    const finnhubSym = this.internalToFinnhub.get(symbol.toUpperCase());
    if (!finnhubSym) return;

    // Remove from queue (may not have been sent yet)
    this.subscribeQueue = this.subscribeQueue.filter(s => s !== symbol.toUpperCase());
    this.subscribedFinnhub.delete(finnhubSym);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", symbol: finnhubSym }));
      logger.info({ provider: this.name, finnhubSym }, "FinnhubProvider: unsubscribed");
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.clearPing();
    this.clearReconnectTimer();
    this.clearSubscribeQueue();
    this.ws?.close();
    this.ws = null;
    logger.info({ provider: this.name }, "FinnhubProvider: destroyed");
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Add a symbol to the subscribe queue (no-op if already subscribed or queued).
   * Starts the drain loop if it isn't already running.
   */
  private enqueue(symbol: string): void {
    const s          = symbol.toUpperCase();
    const finnhubSym = this.internalToFinnhub.get(s);
    if (!finnhubSym) return;

    // Already subscribed on this connection
    if (this.subscribedFinnhub.has(finnhubSym)) return;
    // Already in queue
    if (this.subscribeQueue.includes(s)) return;
    // Enforce max subscription cap
    if (this.subscribedFinnhub.size + this.subscribeQueue.length >= MAX_SUBSCRIPTIONS) {
      logger.warn(
        { provider: this.name, symbol: s, cap: MAX_SUBSCRIPTIONS },
        "FinnhubProvider: subscription cap reached — symbol not queued",
      );
      return;
    }

    this.subscribeQueue.push(s);
    this.drainQueue();
  }

  /**
   * Drain one item from the queue, then schedule the next drain after SUBSCRIBE_INTERVAL_MS.
   * Safe to call repeatedly — guards against concurrent timers.
   */
  private drainQueue(): void {
    if (this.subscribeTimer !== null) return; // already scheduled
    if (this.subscribeQueue.length === 0)     return;
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const sym        = this.subscribeQueue.shift()!;
    const finnhubSym = this.internalToFinnhub.get(sym);

    if (finnhubSym && !this.subscribedFinnhub.has(finnhubSym) && this.ws?.readyState === WebSocket.OPEN) {
      this.subscribedFinnhub.add(finnhubSym);
      this.ws.send(JSON.stringify({ type: "subscribe", symbol: finnhubSym }));
      logger.info(
        { provider: this.name, finnhubSym, internalSym: sym, queueRemaining: this.subscribeQueue.length },
        "FinnhubProvider: subscribed",
      );
    }

    if (this.subscribeQueue.length > 0) {
      this.subscribeTimer = setTimeout(() => {
        this.subscribeTimer = null;
        this.drainQueue();
      }, SUBSCRIBE_INTERVAL_MS);
    }
  }

  private clearSubscribeQueue(): void {
    this.subscribeQueue = [];
    if (this.subscribeTimer !== null) {
      clearTimeout(this.subscribeTimer);
      this.subscribeTimer = null;
    }
  }

  private clearPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }
}
