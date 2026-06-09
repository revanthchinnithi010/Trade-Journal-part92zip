import { createHmac } from "crypto";
import { logger } from "../lib/logger.js";
import {
  BrokerAdapter,
  type AdapterBalance,
  type AdapterPosition,
  type AdapterOrder,
  type PlaceOrderParams,
} from "./BrokerAdapter.js";

export type DeltaAuthMode = "api_key" | "oauth";

/**
 * Delta Exchange REST adapter.
 *
 * baseOrigin must be the environment-specific origin with NO trailing slash:
 *   International → "https://api.delta.exchange"
 *   India         → "https://api.india.delta.exchange"
 *
 * All paths passed to request() are relative to /v2 (e.g. "/wallet/balances").
 * The adapter prepends /v2 internally so the HMAC is computed over the full path.
 */
const API_PREFIX = "/v2";
const DEFAULT_ORIGIN = "https://api.delta.exchange";

export class DeltaTradingAdapter extends BrokerAdapter {
  readonly brokerId = "delta";
  private readonly authMode: DeltaAuthMode;
  private readonly baseOrigin: string;

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    authMode: DeltaAuthMode = "api_key",
    baseOrigin: string = DEFAULT_ORIGIN,
  ) {
    super();
    this.authMode   = authMode;
    this.baseOrigin = baseOrigin.replace(/\/$/, "");
  }

  /**
   * Sign a request.
   * fullPath must include /v2 prefix (e.g. "/v2/wallet/balances").
   * timestamp is Unix seconds (Math.floor(Date.now() / 1000)).
   */
  private sign(
    method: string,
    fullPath: string,
    queryString: string,
    body: string,
    timestamp: number,
  ): string {
    const payload =
      method.toUpperCase() +
      String(timestamp) +
      fullPath +
      (queryString ? "?" + queryString : "") +
      body;

    logger.debug(
      { method, fullPath, queryString: queryString || "(none)", bodyLen: body.length, timestamp, payload },
      "DeltaAdapter: signing",
    );

    return createHmac("sha256", this.apiSecret).update(payload).digest("hex");
  }

  private buildHeaders(
    method: string,
    fullPath: string,
    queryString: string,
    body: string,
  ): Record<string, string> {
    if (this.authMode === "oauth") {
      return {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
        "User-Agent":    "TradeVault/1.0",
      };
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = this.sign(method.toUpperCase(), fullPath, queryString, body, timestamp);

    logger.debug(
      { method: method.toUpperCase(), fullPath, timestamp, envOrigin: this.baseOrigin, signatureHead: signature.slice(0, 12) },
      "DeltaAdapter: headers",
    );

    return {
      "api-key":      this.apiKey,
      "timestamp":    String(timestamp),
      "signature":    signature,
      "Content-Type": "application/json",
      "Accept":       "application/json",
      "User-Agent":   "TradeVault/1.0",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string>,
    body?: object,
  ): Promise<T> {
    const fullPath   = API_PREFIX + path;
    const queryString = params ? new URLSearchParams(params).toString() : "";
    const bodyStr    = body ? JSON.stringify(body) : "";
    const headers    = this.buildHeaders(method.toUpperCase(), fullPath, queryString, bodyStr);
    const url        = this.baseOrigin + fullPath + (queryString ? "?" + queryString : "");

    logger.debug({ method: method.toUpperCase(), url }, "DeltaAdapter: request");

    const res = await fetch(url, { method, headers, body: bodyStr || undefined });

    const data = await res.json() as {
      success?: boolean;
      result?:  T;
      error?:   { code: string; message?: string };
      message?: string;
    };

    logger.debug({ status: res.status, success: data.success, errorCode: data.error?.code }, "DeltaAdapter: response");

    if (res.status === 401) {
      const code = data.error?.code ?? "unknown";
      const msg  = data.error?.message ?? data.message ?? "Unauthorized";
      logger.error({ code, msg, fullPath, envOrigin: this.baseOrigin }, "DeltaAdapter: 401");
      throw new Error(`Delta 401 ${code}: ${msg}`);
    }

    if (!res.ok || data.success === false) {
      const msg = data.error?.message ?? data.message ?? `HTTP ${res.status}`;
      throw new Error(`Delta API error: ${msg}`);
    }

    return data.result as T;
  }

  async connect(): Promise<void> {
    const ok = await this.testConnection();
    if (!ok) throw new Error("Delta connection test failed — check API key and secret");
    this.emitEvent({ type: "statusChange", status: "connected" });
  }

  disconnect(): void {
    this.emitEvent({ type: "statusChange", status: "disconnected" });
    this.removeAllListeners();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("GET", "/wallet/balances");
      logger.info({ envOrigin: this.baseOrigin }, "DeltaAdapter: connection test passed");
      return true;
    } catch (err) {
      logger.error({ err: String(err), envOrigin: this.baseOrigin }, "DeltaAdapter: connection test failed");
      return false;
    }
  }

  async getBalance(): Promise<AdapterBalance[]> {
    const raw = await this.request<Array<Record<string, string>>>("GET", "/wallet/balances");
    return raw.map(r => ({
      coin:                r["asset_symbol"] ?? "USDT",
      equity:              r["balance"] ?? "0",
      walletBalance:       r["balance"] ?? "0",
      availableToWithdraw: r["available_balance"] ?? "0",
      unrealisedPnl:       "0",
    }));
  }

  async getPositions(): Promise<AdapterPosition[]> {
    const result = await this.request<{ positions: Array<Record<string, unknown>> }>(
      "GET", "/positions/margined",
    );
    return (result.positions ?? [])
      .filter(p => Number(p["size"]) !== 0)
      .map(p => ({
        id:           String(p["product_id"]),
        symbol:       String(p["product_symbol"] ?? ""),
        side:         p["side"] === "sell" ? "Short" : "Long",
        size:         Number(p["size"] ?? 0),
        entryPrice:   parseFloat(String(p["entry_price"]   ?? 0)),
        markPrice:    parseFloat(String(p["mark_price"]     ?? 0)),
        unrealisedPnl: parseFloat(String(p["unrealized_pnl"] ?? 0)),
        leverage:     String(p["leverage"] ?? ""),
        raw:          p,
      } satisfies AdapterPosition));
  }

  async getOrders(): Promise<AdapterOrder[]> {
    const raw = await this.request<Array<Record<string, unknown>>>(
      "GET", "/orders", { state: "open" },
    );
    return raw.map(o => ({
      id:        String(o["id"]),
      symbol:    String(o["product_symbol"] ?? ""),
      side:      o["side"] === "buy" ? "Buy" : "Sell",
      orderType: String(o["order_type"] ?? ""),
      price:     parseFloat(String(o["limit_price"] ?? 0)),
      qty:       Number(o["size"] ?? 0),
      status:    String(o["state"] ?? ""),
      createdAt: String(o["created_at"] ?? ""),
      raw:       o,
    } satisfies AdapterOrder));
  }

  async placeOrder(params: PlaceOrderParams): Promise<{ orderId: string }> {
    const body = {
      product_symbol: params.symbol,
      size:           parseFloat(params.qty),
      side:           params.side.toLowerCase(),
      order_type:     params.orderType === "Market" ? "market_order" : "limit_order",
      ...(params.orderType === "Limit" && params.price ? { limit_price: params.price } : {}),
      ...(params.stopLoss ? { stop_price: params.stopLoss } : {}),
    };
    const result = await this.request<{ id: number }>("POST", "/orders", undefined, body);
    return { orderId: String(result.id) };
  }

  async cancelOrder(orderId: string): Promise<void> {
    await this.request("DELETE", `/orders/${orderId}`);
  }

  async closePosition(position: AdapterPosition): Promise<void> {
    const raw       = position.raw as Record<string, unknown>;
    const closeSide = position.side === "Long" ? "sell" : "buy";
    await this.request("POST", "/orders", undefined, {
      product_id:  Number(raw["product_id"]),
      size:        position.size,
      side:        closeSide,
      order_type:  "market_order",
      reduce_only: true,
    });
  }
}
