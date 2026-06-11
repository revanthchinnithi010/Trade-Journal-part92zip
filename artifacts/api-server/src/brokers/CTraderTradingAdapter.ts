import {
  BrokerAdapter,
  type AdapterBalance,
  type AdapterPosition,
  type AdapterOrder,
  type AdapterOrderHistory,
  type PlaceOrderParams,
} from "./BrokerAdapter.js";
import { logger } from "../lib/logger.js";
import { withRetry } from "../services/retryFetch.js";

const SPOTWARE_API = "https://api.spotware.com";

interface SpotwareAccount {
  balance?: number;
  equity?: number;
  freeMargin?: number;
  depositCurrency?: string;
  currency?: string;
  [key: string]: unknown;
}

interface SpotwarePosition {
  positionId?: number;
  id?: number;
  symbolName?: string;
  symbol?: string;
  tradeSide?: string;
  volume?: number;
  entryPrice?: number;
  price?: number;
  currentPrice?: number;
  swap?: number;
  unrealizedPnl?: number;
  leverage?: number;
  stopLoss?: number;
  takeProfit?: number;
  [key: string]: unknown;
}

interface SpotwareOrder {
  orderId?: number;
  id?: number;
  symbolName?: string;
  symbol?: string;
  tradeSide?: string;
  orderType?: string;
  volume?: number;
  limitPrice?: number;
  stopPrice?: number;
  price?: number;
  orderStatus?: string;
  status?: string;
  utcLastUpdateTimestamp?: string;
  createdAt?: string;
  filledVolume?: number;
  closingPrice?: number;
  [key: string]: unknown;
}

type ListResponse<T> = T[] | { data?: T[] };

function asList<T>(data: ListResponse<T>): T[] {
  if (Array.isArray(data)) return data;
  return data.data ?? [];
}

// cTrader volumes are in cents (0.01 lot = 1000 units = volume 1000)
// Prices are in 1/100000 for forex (5 decimal places)
const VOLUME_DIVISOR = 100;
const PRICE_DIVISOR  = 100_000;

export class CTraderTradingAdapter extends BrokerAdapter {
  readonly brokerId = "ctrader";

  constructor(
    private accessToken:      string,
    private ctidAccountId:    string,
  ) {
    super();
  }

  // ── HTTP ──────────────────────────────────────────────────────────────────

  private async request<T>(
    method: string,
    path:   string,
    body?:  object,
  ): Promise<T> {
    return withRetry(async () => {
      const res = await fetch(`${SPOTWARE_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          "Accept":       "application/json",
          "User-Agent":   "TradeVault/1.0",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 401 || res.status === 403) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`cTrader auth ${res.status}: ${text}`);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`cTrader API ${res.status}: ${text}`);
      }

      return res.json() as Promise<T>;
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    const ok = await this.testConnection();
    if (!ok) throw new Error("cTrader connection test failed");
    this.emitEvent({ type: "statusChange", status: "connected" });
  }

  disconnect(): void {
    this.emitEvent({ type: "statusChange", status: "disconnected" });
    this.removeAllListeners();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("GET", `/connect/tradingaccounts/${this.ctidAccountId}`);
      return true;
    } catch {
      return false;
    }
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  async getBalance(): Promise<AdapterBalance[]> {
    try {
      const data = await this.request<SpotwareAccount>(
        "GET", `/connect/tradingaccounts/${this.ctidAccountId}`,
      );
      const balance    = Number(data.balance    ?? 0) / VOLUME_DIVISOR;
      const equity     = Number(data.equity     ?? 0) / VOLUME_DIVISOR;
      const freeMargin = Number(data.freeMargin ?? 0) / VOLUME_DIVISOR;
      const currency   = String(data.depositCurrency ?? data.currency ?? "USD");
      return [{
        coin:                currency,
        equity:              equity.toFixed(2),
        walletBalance:       balance.toFixed(2),
        availableToWithdraw: freeMargin.toFixed(2),
        unrealisedPnl:       (equity - balance).toFixed(2),
      }];
    } catch {
      return [];
    }
  }

  async getPositions(): Promise<AdapterPosition[]> {
    try {
      const data = await this.request<ListResponse<SpotwarePosition>>(
        "GET", `/connect/tradingaccounts/${this.ctidAccountId}/positions`,
      );
      return asList(data).map(p => {
        const tradeSide = String(p.tradeSide ?? "BUY").toUpperCase();
        return {
          id:           String(p.positionId ?? p.id ?? ""),
          symbol:       String(p.symbolName ?? p.symbol ?? ""),
          side:         tradeSide === "SELL" ? "Short" : ("Long" as "Long" | "Short"),
          size:         Number(p.volume ?? 0) / VOLUME_DIVISOR,
          entryPrice:   Number(p.entryPrice ?? p.price ?? 0) / PRICE_DIVISOR,
          markPrice:    Number(p.currentPrice ?? p.entryPrice ?? 0) / PRICE_DIVISOR,
          unrealisedPnl: Number(p.swap ?? p.unrealizedPnl ?? 0) / VOLUME_DIVISOR,
          leverage:     String(p.leverage ?? ""),
          raw:          p,
        };
      });
    } catch {
      return [];
    }
  }

  async getOrders(): Promise<AdapterOrder[]> {
    try {
      const data = await this.request<ListResponse<SpotwareOrder>>(
        "GET", `/connect/tradingaccounts/${this.ctidAccountId}/orders`,
      );
      return asList(data).map(o => this.normalizeOrder(o));
    } catch {
      return [];
    }
  }

  async getOrderHistory(limit = 100): Promise<AdapterOrderHistory[]> {
    try {
      const to   = Date.now();
      const from = to - 30 * 24 * 60 * 60 * 1000; // last 30 days
      const data = await this.request<ListResponse<SpotwareOrder>>(
        "GET",
        `/connect/tradingaccounts/${this.ctidAccountId}/orders?fromTimestamp=${from}&toTimestamp=${to}&limit=${limit}`,
      );
      return asList(data)
        .filter(o => {
          const status = String(o.orderStatus ?? o.status ?? "").toUpperCase();
          return status === "FILLED" || status === "CANCELLED" || status === "REJECTED";
        })
        .map(o => this.normalizeOrderHistory(o));
    } catch {
      return [];
    }
  }

  // ── Order execution ───────────────────────────────────────────────────────

  async placeOrder(params: PlaceOrderParams): Promise<{ orderId: string }> {
    const side   = params.side.toUpperCase(); // "BUY" / "SELL"
    const volume = Math.round(parseFloat(params.qty) * VOLUME_DIVISOR);

    // Market order → open a position directly
    if (params.orderType === "Market") {
      const body: Record<string, unknown> = {
        symbolName: params.symbol,
        volume,
        tradeSide:  side,
      };
      if (params.stopLossPrice)   body["stopLoss"]   = Math.round(parseFloat(params.stopLossPrice)   * PRICE_DIVISOR);
      if (params.takeProfitPrice) body["takeProfit"] = Math.round(parseFloat(params.takeProfitPrice) * PRICE_DIVISOR);

      logger.info({ symbol: params.symbol, side, volume, type: "Market" }, "CTraderAdapter: placeOrder (market)");
      const res = await this.request<{ positionId?: number; id?: number }>(
        "POST",
        `/connect/tradingaccounts/${this.ctidAccountId}/positions`,
        body,
      );
      return { orderId: String(res.positionId ?? res.id ?? "unknown") };
    }

    // Limit / Stop / StopLimit → pending order
    const ctraderType =
      params.orderType === "Limit"    ? "LIMIT"       :
      params.orderType === "Stop"     ? "STOP"        :
      params.orderType === "StopLimit" ? "STOP_LIMIT" : "LIMIT";

    const body: Record<string, unknown> = {
      symbolName: params.symbol,
      volume,
      tradeSide:  side,
      orderType:  ctraderType,
    };

    if (params.price)     body["limitPrice"] = Math.round(parseFloat(params.price)     * PRICE_DIVISOR);
    if (params.stopPrice) body["stopPrice"]  = Math.round(parseFloat(params.stopPrice) * PRICE_DIVISOR);
    if (params.stopLossPrice)   body["stopLoss"]   = Math.round(parseFloat(params.stopLossPrice)   * PRICE_DIVISOR);
    if (params.takeProfitPrice) body["takeProfit"] = Math.round(parseFloat(params.takeProfitPrice) * PRICE_DIVISOR);

    logger.info({ symbol: params.symbol, side, volume, type: ctraderType }, "CTraderAdapter: placeOrder (pending)");
    const res = await this.request<{ orderId?: number; id?: number }>(
      "POST",
      `/connect/tradingaccounts/${this.ctidAccountId}/orders`,
      body,
    );
    return { orderId: String(res.orderId ?? res.id ?? "unknown") };
  }

  async cancelOrder(orderId: string): Promise<void> {
    logger.info({ orderId }, "CTraderAdapter: cancelOrder");
    await this.request(
      "DELETE",
      `/connect/tradingaccounts/${this.ctidAccountId}/orders/${orderId}`,
    );
  }

  async closePosition(position: AdapterPosition): Promise<void> {
    const raw    = position.raw as SpotwarePosition;
    const posId  = raw.positionId ?? raw.id ?? position.id;
    const volume = Math.round(position.size * VOLUME_DIVISOR);
    logger.info({ posId, symbol: position.symbol, size: position.size }, "CTraderAdapter: closePosition");
    await this.request(
      "PUT",
      `/connect/tradingaccounts/${this.ctidAccountId}/positions/${posId}`,
      { volume },
    );
  }

  async modifyOrder(
    orderId: string,
    params: Partial<Pick<PlaceOrderParams, "price" | "stopPrice" | "takeProfitPrice" | "stopLossPrice" | "qty">>,
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (params.qty)             body["volume"]      = Math.round(parseFloat(params.qty) * VOLUME_DIVISOR);
    if (params.price)           body["limitPrice"]  = Math.round(parseFloat(params.price)           * PRICE_DIVISOR);
    if (params.stopPrice)       body["stopPrice"]   = Math.round(parseFloat(params.stopPrice)        * PRICE_DIVISOR);
    if (params.stopLossPrice)   body["stopLoss"]    = Math.round(parseFloat(params.stopLossPrice)    * PRICE_DIVISOR);
    if (params.takeProfitPrice) body["takeProfit"]  = Math.round(parseFloat(params.takeProfitPrice)  * PRICE_DIVISOR);
    logger.info({ orderId, ...body }, "CTraderAdapter: modifyOrder");
    await this.request(
      "PATCH",
      `/connect/tradingaccounts/${this.ctidAccountId}/orders/${orderId}`,
      body,
    );
  }

  // ── Normalizers ───────────────────────────────────────────────────────────

  private normalizeOrder(o: SpotwareOrder): AdapterOrder {
    const tradeSide = String(o.tradeSide ?? "BUY").toUpperCase();
    const type = String(o.orderType ?? "MARKET").toUpperCase();
    const typeMap: Record<string, string> = {
      MARKET: "Market", LIMIT: "Limit", STOP: "Stop", STOP_LIMIT: "StopLimit",
    };
    return {
      id:        String(o.orderId ?? o.id ?? ""),
      symbol:    String(o.symbolName ?? o.symbol ?? ""),
      side:      tradeSide === "SELL" ? "Sell" : "Buy",
      orderType: typeMap[type] ?? type,
      price:     Number(o.limitPrice ?? o.stopPrice ?? o.price ?? 0) / PRICE_DIVISOR,
      qty:       Number(o.volume ?? 0) / VOLUME_DIVISOR,
      status:    String(o.orderStatus ?? o.status ?? ""),
      createdAt: String(o.utcLastUpdateTimestamp ?? o.createdAt ?? ""),
      raw:       o,
    };
  }

  private normalizeOrderHistory(o: SpotwareOrder): AdapterOrderHistory {
    const base = this.normalizeOrder(o);
    return {
      ...base,
      filledQty:    Number(o.filledVolume ?? 0) / VOLUME_DIVISOR,
      avgFillPrice: Number(o.closingPrice ?? o.limitPrice ?? o.price ?? 0) / PRICE_DIVISOR,
      closedAt:     String(o.utcLastUpdateTimestamp ?? ""),
    };
  }
}

export async function fetchCTraderAccountsRest(
  accessToken: string,
): Promise<Array<{ ctidTraderAccountId: number; isLive: boolean; traderLogin: string }>> {
  const res = await fetch(`${SPOTWARE_API}/connect/tradingaccounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Failed to fetch cTrader accounts: ${text}`);
  }
  const data = (await res.json()) as ListResponse<{
    ctidTraderAccountId: number;
    isLive: boolean;
    traderLogin: string;
  }>;
  return asList(data);
}
