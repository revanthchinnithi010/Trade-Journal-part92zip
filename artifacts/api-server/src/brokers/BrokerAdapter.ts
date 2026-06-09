import { EventEmitter } from "events";

export interface AdapterBalance {
  coin: string;
  equity: string;
  walletBalance: string;
  availableToWithdraw: string;
  unrealisedPnl: string;
}

export interface AdapterPosition {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealisedPnl: number;
  leverage: string;
  raw: unknown;
}

export interface AdapterOrder {
  id: string;
  symbol: string;
  side: "Buy" | "Sell";
  orderType: string;
  price: number;
  qty: number;
  status: string;
  createdAt: string;
  raw: unknown;
}

export interface PlaceOrderParams {
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  qty: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  category?: string;
}

export type BrokerAdapterEvent =
  | { type: "positionUpdate"; positions: AdapterPosition[] }
  | { type: "orderUpdate"; orders: AdapterOrder[] }
  | { type: "statusChange"; status: "connected" | "error" | "disconnected"; error?: string };

export abstract class BrokerAdapter extends EventEmitter {
  abstract readonly brokerId: string;

  protected emitEvent(event: BrokerAdapterEvent): void {
    this.emit(event.type, event);
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract getBalance(): Promise<AdapterBalance[]>;
  abstract getPositions(): Promise<AdapterPosition[]>;
  abstract getOrders(): Promise<AdapterOrder[]>;
  abstract placeOrder(params: PlaceOrderParams): Promise<{ orderId: string }>;
  abstract cancelOrder(orderId: string, extra?: Record<string, string>): Promise<void>;
  abstract closePosition(position: AdapterPosition): Promise<void>;
  abstract testConnection(): Promise<boolean>;
}
