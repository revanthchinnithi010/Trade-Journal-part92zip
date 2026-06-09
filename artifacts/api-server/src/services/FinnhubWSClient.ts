import { EventEmitter } from "events";
import WebSocket from "ws";
import { logger } from "../lib/logger.js";

export interface Tick {
  symbol: string;
  finnhubSymbol: string;
  price: number;
  volume: number;
  timestamp: number;
}

const SYMBOL_MAP: Record<string, string> = {
  NAS100:  "OANDA:NAS100_USD",
  US30:    "OANDA:US30_USD",
  XAUUSD:  "OANDA:XAU_USD",
  EURUSD:  "OANDA:EUR_USD",
  GBPJPY:  "OANDA:GBP_JPY",
  BTCUSDT: "BINANCE:BTCUSDT",
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SYMBOL_MAP).map(([k, v]) => [v, k]),
);

const FINNHUB_WS_URL = "wss://ws.finnhub.io";
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 60000;
const PING_INTERVAL_MS = 25000;

export class FinnhubWSClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private subscribed: Set<string> = new Set();
  private reconnectDelay = BASE_RECONNECT_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private connected = false;

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  connect(): void {
    if (this.destroyed) return;
    this.clearTimers();

    const url = `${FINNHUB_WS_URL}?token=${this.apiKey}`;
    logger.info("FinnhubWSClient: connecting");
    this.ws = new WebSocket(url);

    this.ws.on("open", () => {
      this.connected = true;
      this.reconnectDelay = BASE_RECONNECT_DELAY;
      logger.info("FinnhubWSClient: connected");
      this.emit("connected");

      for (const sym of this.subscribed) {
        this.sendSubscribe(sym);
      }

      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
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
            const internalSymbol = REVERSE_MAP[trade.s];
            if (!internalSymbol) continue;
            const tick: Tick = {
              symbol: internalSymbol,
              finnhubSymbol: trade.s,
              price: trade.p,
              volume: trade.v,
              timestamp: trade.t,
            };
            this.emit("tick", tick);
          }
        }

        if (msg.type === "error") {
          logger.error({ msg }, "FinnhubWSClient: error message from server");
          this.emit("error", new Error(String(msg)));
        }
      } catch (err) {
        logger.warn({ err }, "FinnhubWSClient: failed to parse message");
      }
    });

    this.ws.on("error", (err) => {
      logger.error({ err }, "FinnhubWSClient: socket error");
      this.emit("error", err);
    });

    this.ws.on("close", (code, reason) => {
      this.connected = false;
      this.clearTimers();
      logger.warn({ code, reason: reason.toString() }, "FinnhubWSClient: disconnected");
      this.emit("disconnected", { code });
      this.scheduleReconnect();
    });
  }

  subscribe(symbol: string): void {
    const finnhubSym = SYMBOL_MAP[symbol];
    if (!finnhubSym) {
      logger.warn({ symbol }, "FinnhubWSClient: unknown symbol");
      return;
    }
    this.subscribed.add(finnhubSym);
    if (this.connected) {
      this.sendSubscribe(finnhubSym);
    }
  }

  unsubscribe(symbol: string): void {
    const finnhubSym = SYMBOL_MAP[symbol];
    if (!finnhubSym) return;
    this.subscribed.delete(finnhubSym);
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", symbol: finnhubSym }));
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSubscribedSymbols(): string[] {
    return [...this.subscribed].map((s) => REVERSE_MAP[s]).filter(Boolean);
  }

  destroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.ws?.close();
    this.ws = null;
  }

  private sendSubscribe(finnhubSym: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", symbol: finnhubSym }));
      logger.info({ finnhubSym }, "FinnhubWSClient: subscribed");
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    logger.info({ delay: this.reconnectDelay }, "FinnhubWSClient: scheduling reconnect");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
      this.connect();
    }, this.reconnectDelay);
  }

  private clearTimers(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  static readonly SUPPORTED_SYMBOLS = Object.keys(SYMBOL_MAP);
}
