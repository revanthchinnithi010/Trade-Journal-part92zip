import { SubscriptionManager } from "./SubscriptionManager";
import type {
  IBrokerWsClient, WsClientState, BrokerEventHandler,
  TickEvent, PositionsEvent, OrdersEvent, BalanceEvent, StatusEvent,
} from "./types";
import type { BrokerPosition, BrokerOrder, BrokerBalance } from "@/types/broker";

type RelaySubscribeFn = (handler: (msg: unknown) => void) => () => void;

interface CTraderTickMsg       { type: "ctrader_tick";      symbol: string; bid?: number; ask?: number; price?: number }
interface CTraderStatusMsg     { type: "ctrader_status";    connected: boolean; error?: string }
interface CTraderPositionsMsg  { type: "ctrader_positions"; positions: BrokerPosition[] }
interface CTraderOrdersMsg     { type: "ctrader_orders";    orders: BrokerOrder[] }
interface CTraderBalanceMsg    { type: "ctrader_balance";   balance: BrokerBalance }
interface CTraderPongMsg       { type: "pong";              latencyMs?: number }
type CTraderRelayMsg =
  | CTraderTickMsg | CTraderStatusMsg | CTraderPositionsMsg
  | CTraderOrdersMsg | CTraderBalanceMsg | CTraderPongMsg
  | { type: string };

/**
 * cTrader data client — receives all data via the backend relay WebSocket.
 * Does NOT open a direct WS to cTrader (the cTrader Open API is binary/protobuf
 * and lives server-side). Instead, the backend relays events through /api/ws.
 *
 * Expected relay message types from the backend:
 *   ctrader_tick | ctrader_status | ctrader_positions | ctrader_orders | ctrader_balance
 */
export class CTraderWsClient implements IBrokerWsClient {
  readonly brokerId = "ctrader" as const;

  private readonly handlers = new Set<BrokerEventHandler>();
  private unsubRelay: (() => void) | null = null;
  private _state: WsClientState = {
    status: "idle",
    latencyMs: null,
    reconnectAttempts: 0,
    lastConnectedAt: null,
    lastPongAt: null,
  };

  constructor(private readonly subscribeToRelay: RelaySubscribeFn) {}

  get state(): WsClientState { return { ...this._state }; }

  connect(): void {
    if (this.unsubRelay) return;
    this._state = { ...this._state, status: "connecting", lastConnectedAt: Date.now() };
    this.unsubRelay = this.subscribeToRelay((msg) => this.handleRelayMessage(msg as CTraderRelayMsg));
    this._state = { ...this._state, status: "connected" };
    this.emit({ kind: "status", broker: "ctrader", status: "connected", ts: Date.now() } as StatusEvent);
  }

  disconnect(): void {
    this.unsubRelay?.();
    this.unsubRelay = null;
    this._state = { ...this._state, status: "disconnected" };
    this.emit({ kind: "status", broker: "ctrader", status: "disconnected", ts: Date.now() } as StatusEvent);
  }

  send(_msg: unknown): boolean {
    return false;
  }

  onEvent(handler: BrokerEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private handleRelayMessage(msg: CTraderRelayMsg): void {
    if (!msg || typeof msg.type !== "string") return;

    switch (msg.type) {
      case "ctrader_tick": {
        const t = msg as CTraderTickMsg;
        const price = t.price ?? (t.bid && t.ask ? (t.bid + t.ask) / 2 : 0);
        if (!price) return;
        this.emit({
          kind: "tick", broker: "ctrader",
          symbol: t.symbol, price,
          bid: t.bid, ask: t.ask,
          ts: Date.now(),
        } as TickEvent);
        break;
      }

      case "ctrader_status": {
        const s = msg as CTraderStatusMsg;
        const status = s.connected ? "connected" : "error";
        this._state = { ...this._state, status };
        this.emit({ kind: "status", broker: "ctrader", status, error: s.error, ts: Date.now() } as StatusEvent);
        break;
      }

      case "ctrader_positions": {
        const p = msg as CTraderPositionsMsg;
        this.emit({ kind: "positions", broker: "ctrader", positions: p.positions ?? [], ts: Date.now() } as PositionsEvent);
        break;
      }

      case "ctrader_orders": {
        const o = msg as CTraderOrdersMsg;
        this.emit({ kind: "orders", broker: "ctrader", orders: o.orders ?? [], ts: Date.now() } as OrdersEvent);
        break;
      }

      case "ctrader_balance": {
        const b = msg as CTraderBalanceMsg;
        this.emit({ kind: "balance", broker: "ctrader", balance: b.balance, ts: Date.now() } as BalanceEvent);
        break;
      }

      case "pong": {
        const p = msg as CTraderPongMsg;
        if (typeof p.latencyMs === "number") {
          this._state = { ...this._state, latencyMs: p.latencyMs, lastPongAt: Date.now() };
          this.emit({ kind: "latency", broker: "ctrader", latencyMs: p.latencyMs, ts: Date.now() });
        }
        break;
      }
    }
  }

  private emit(event: Parameters<BrokerEventHandler>[0]): void {
    for (const h of this.handlers) {
      try { h(event); } catch (e) { console.error("[CTraderWsClient] handler error", e); }
    }
  }
}
