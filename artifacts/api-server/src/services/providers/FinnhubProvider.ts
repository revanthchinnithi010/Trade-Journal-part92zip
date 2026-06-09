import WebSocket from "ws";
import { BaseProvider, type ProviderTick } from "./BaseProvider.js";
import { logger } from "../../lib/logger.js";

// Finnhub symbols: OANDA for forex/indices/commodities, Binance for crypto
const SYMBOL_MAP: Record<string, string> = {
  // Forex / Indices / Commodities via OANDA
  NAS100: "OANDA:NAS100_USD",
  US30:   "OANDA:US30_USD",
  XAUUSD: "OANDA:XAU_USD",
  EURUSD: "OANDA:EUR_USD",
  GBPJPY: "OANDA:GBP_JPY",
  USOIL:  "OANDA:WTICO_USD",
  UKOIL:  "OANDA:BCO_USD",
  // Crypto via Binance (USDT-margined, highest liquidity)
  BTCUSD:  "BINANCE:BTCUSDT",
  ETHUSD:  "BINANCE:ETHUSDT",
  SOLUSD:  "BINANCE:SOLUSDT",
  DOGEUSD: "BINANCE:DOGEUSDT",
  PEPEUSD: "BINANCE:PEPEUSDT",
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]),
);

const PING_INTERVAL_MS = 25_000;

export class FinnhubProvider extends BaseProvider {
  readonly name = "finnhub";
  readonly displayName = "Finnhub / OANDA · Binance";
  readonly badge = "oanda";
  readonly color = "#3B82F6";
  readonly supportedSymbols = Object.keys(SYMBOL_MAP);

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private subscribedFinnhub: Set<string> = new Set();

  constructor(private apiKey: string) {
    super();
  }

  connect(): void {
    if (this.destroyed) return;
    this.clearReconnectTimer();
    this.clearPing();

    const url = `wss://ws.finnhub.io?token=${this.apiKey}`;
    logger.info({ provider: this.name }, "FinnhubProvider: connecting");
    this.ws = new WebSocket(url);

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
        };
        if (msg.type === "trade" && Array.isArray(msg.data)) {
          for (const trade of msg.data) {
            const sym = REVERSE_MAP[trade.s];
            if (!sym) continue;
            const tick: ProviderTick = {
              symbol: sym,
              providerSymbol: trade.s,
              provider: this.name,
              price: trade.p,
              volume: trade.v,
              timestamp: trade.t,
              receivedAt: Date.now(),
            };
            this.onTick(tick);
          }
        }
        if (msg.type === "error") {
          logger.warn({ msg, provider: this.name }, "FinnhubProvider: server-side error message (symbol may be unavailable)");
        }
      } catch (err) {
        logger.warn({ err, provider: this.name }, "FinnhubProvider: parse error");
      }
    });

    this.ws.on("error", (err) => this.onError(err));
    this.ws.on("close", (code) => {
      this.clearPing();
      this.onDisconnected(code);
    });
  }

  subscribeSymbol(symbol: string): void {
    const finnhubSym = SYMBOL_MAP[symbol];
    if (!finnhubSym || this.subscribedFinnhub.has(finnhubSym)) return;
    this.subscribedFinnhub.add(finnhubSym);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", symbol: finnhubSym }));
      logger.info({ provider: this.name, finnhubSym }, "FinnhubProvider: subscribed");
    }
  }

  unsubscribeSymbol(symbol: string): void {
    const finnhubSym = SYMBOL_MAP[symbol];
    if (!finnhubSym) return;
    this.subscribedFinnhub.delete(finnhubSym);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", symbol: finnhubSym }));
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.clearPing();
    this.clearReconnectTimer();
    this.ws?.close();
    this.ws = null;
  }

  private clearPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }
}
