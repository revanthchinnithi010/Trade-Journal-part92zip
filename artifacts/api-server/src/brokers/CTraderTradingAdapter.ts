import {
  BrokerAdapter,
  type AdapterBalance,
  type AdapterPosition,
  type AdapterOrder,
  type PlaceOrderParams,
} from "./BrokerAdapter.js";

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
  price?: number;
  orderStatus?: string;
  status?: string;
  utcLastUpdateTimestamp?: string;
  createdAt?: string;
  [key: string]: unknown;
}

type ListResponse<T> = T[] | { data?: T[] };

function asList<T>(data: ListResponse<T>): T[] {
  if (Array.isArray(data)) return data;
  return data.data ?? [];
}

export class CTraderTradingAdapter extends BrokerAdapter {
  readonly brokerId = "ctrader";

  constructor(
    private accessToken: string,
    private ctidAccountId: string,
  ) {
    super();
  }

  private async request<T>(
    method: string,
    path: string,
    body?: object,
  ): Promise<T> {
    const res = await fetch(`${SPOTWARE_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`cTrader API ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

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

  async getBalance(): Promise<AdapterBalance[]> {
    try {
      const data = await this.request<SpotwareAccount>(
        "GET",
        `/connect/tradingaccounts/${this.ctidAccountId}`,
      );
      const balance = Number(data.balance ?? 0) / 100;
      const equity = Number(data.equity ?? 0) / 100;
      const freeMargin = Number(data.freeMargin ?? 0) / 100;
      const currency = String(data.depositCurrency ?? data.currency ?? "USD");
      return [
        {
          coin: currency,
          equity: equity.toFixed(2),
          walletBalance: balance.toFixed(2),
          availableToWithdraw: freeMargin.toFixed(2),
          unrealisedPnl: (equity - balance).toFixed(2),
        },
      ];
    } catch {
      return [];
    }
  }

  async getPositions(): Promise<AdapterPosition[]> {
    try {
      const data = await this.request<ListResponse<SpotwarePosition>>(
        "GET",
        `/connect/tradingaccounts/${this.ctidAccountId}/positions`,
      );
      return asList(data).map((p) => {
        const tradeSide = String(p.tradeSide ?? "BUY").toUpperCase();
        return {
          id: String(p.positionId ?? p.id ?? ""),
          symbol: String(p.symbolName ?? p.symbol ?? ""),
          side: tradeSide === "SELL" ? "Short" : ("Long" as "Long" | "Short"),
          size: Number(p.volume ?? 0) / 100,
          entryPrice: Number(p.entryPrice ?? p.price ?? 0) / 100000,
          markPrice: Number(p.currentPrice ?? p.entryPrice ?? 0) / 100000,
          unrealisedPnl: Number(p.swap ?? p.unrealizedPnl ?? 0) / 100,
          leverage: String(p.leverage ?? ""),
          raw: p,
        };
      });
    } catch {
      return [];
    }
  }

  async getOrders(): Promise<AdapterOrder[]> {
    try {
      const data = await this.request<ListResponse<SpotwareOrder>>(
        "GET",
        `/connect/tradingaccounts/${this.ctidAccountId}/orders`,
      );
      return asList(data).map((o) => {
        const tradeSide = String(o.tradeSide ?? "BUY").toUpperCase();
        return {
          id: String(o.orderId ?? o.id ?? ""),
          symbol: String(o.symbolName ?? o.symbol ?? ""),
          side: tradeSide === "SELL" ? "Sell" : ("Buy" as "Buy" | "Sell"),
          orderType: String(o.orderType ?? "MARKET"),
          price: Number(o.limitPrice ?? o.price ?? 0) / 100000,
          qty: Number(o.volume ?? 0) / 100,
          status: String(o.orderStatus ?? o.status ?? ""),
          createdAt: String(o.utcLastUpdateTimestamp ?? o.createdAt ?? ""),
          raw: o,
        };
      });
    } catch {
      return [];
    }
  }

  async placeOrder(_params: PlaceOrderParams): Promise<{ orderId: string }> {
    throw new Error(
      "cTrader order placement via REST is not yet supported. Please use the cTrader platform directly.",
    );
  }

  async cancelOrder(_orderId: string): Promise<void> {
    throw new Error(
      "cTrader order cancellation via REST is not yet supported.",
    );
  }

  async closePosition(_position: AdapterPosition): Promise<void> {
    throw new Error(
      "cTrader position close via REST is not yet supported.",
    );
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
