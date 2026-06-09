import { DeltaWsClient } from "./DeltaWsClient";
import { CTraderWsClient } from "./CTraderWsClient";
import { SubscriptionManager } from "./SubscriptionManager";
import { LivePnlTracker } from "./LivePnlTracker";
import type {
  BrokerEvent, BrokerEventHandler, IBrokerWsClient,
  WsClientState, SubscriptionTopic,
} from "./types";
import type { BrokerAccount, BrokerId, BrokerPosition } from "@/types/broker";

type RelaySubscribeFn = (handler: (msg: unknown) => void) => () => void;

export interface OrchestratorState {
  delta:   WsClientState | null;
  ctrader: WsClientState | null;
}

/**
 * BrokerWsOrchestrator — single coordination layer for all broker WS clients.
 *
 * Responsibilities:
 *  - Instantiates and owns DeltaWsClient + CTraderWsClient
 *  - Routes events from both clients to a unified SubscriptionManager
 *  - Drives LivePnlTracker with ticks from the active broker
 *  - Exposes connect/disconnect per broker and a unified subscribe() API
 *
 * One instance lives for the app lifetime (created in useBrokerWs hook).
 */
export class BrokerWsOrchestrator {
  private readonly delta:   DeltaWsClient;
  private readonly ctrader: CTraderWsClient;
  private readonly subs    = new SubscriptionManager();
  private readonly pnl     = new LivePnlTracker();
  private readonly globalHandlers = new Set<BrokerEventHandler>();

  private activeClients = new Map<BrokerId, IBrokerWsClient>();
  private cleanups: (() => void)[] = [];

  constructor(relaySubscribeFn: RelaySubscribeFn) {
    this.delta   = new DeltaWsClient();
    this.ctrader = new CTraderWsClient(relaySubscribeFn);

    const wire = (client: IBrokerWsClient) => {
      return client.onEvent((event) => {
        if (event.kind === "tick") {
          this.pnl.onTick(event.broker, event.symbol, event.price);
        }
        this.subs.emit(event);
        for (const h of this.globalHandlers) {
          try { h(event); } catch { /* ignore */ }
        }
      });
    };

    this.cleanups.push(wire(this.delta));
    this.cleanups.push(wire(this.ctrader));

    this.cleanups.push(
      this.pnl.onEvent((event) => {
        this.subs.emit(event);
        for (const h of this.globalHandlers) {
          try { h(event); } catch { /* ignore */ }
        }
      })
    );
  }

  get state(): OrchestratorState {
    return {
      delta:   this.activeClients.has("delta")   ? this.delta.state   : null,
      ctrader: this.activeClients.has("ctrader") ? this.ctrader.state : null,
    };
  }

  connectBroker(account: BrokerAccount): void {
    const id = account.broker_id as BrokerId;
    if (id === "delta") {
      const resolvedUrl = DeltaWsClient.resolveWsUrl(account.ws_url);
      this.delta.setWsUrl(resolvedUrl);
      this.activeClients.set("delta", this.delta);
      this.delta.connect();
      this.subscribeActiveSymbol(account);
    } else if (id === "ctrader") {
      this.activeClients.set("ctrader", this.ctrader);
      this.ctrader.connect();
    }
  }

  disconnectBroker(brokerId: BrokerId): void {
    if (brokerId === "delta") {
      this.delta.disconnect();
      this.activeClients.delete("delta");
      this.pnl.clear("delta");
    } else if (brokerId === "ctrader") {
      this.ctrader.disconnect();
      this.activeClients.delete("ctrader");
      this.pnl.clear("ctrader");
    }
  }

  disconnectAll(): void {
    this.delta.disconnect();
    this.ctrader.disconnect();
    this.activeClients.clear();
    this.pnl.clear();
  }

  /** Subscribe a specific symbol for Delta tick streaming. */
  subscribeSymbol(symbol: string): void {
    this.delta.subscribeSymbol(symbol);
  }

  unsubscribeSymbol(symbol: string): void {
    this.delta.unsubscribeSymbol(symbol);
  }

  /** Update positions in the live PnL tracker. */
  updatePositions(broker: BrokerId, positions: BrokerPosition[]): void {
    this.pnl.setPositions(broker, positions);
  }

  /** Get live total unrealised PnL for a broker. */
  totalPnl(broker: BrokerId): number {
    return this.pnl.totalPnl(broker);
  }

  /** Subscribe to a specific topic. Returns unsubscribe fn. */
  subscribe(topic: SubscriptionTopic | "*", handler: BrokerEventHandler): () => void {
    return this.subs.subscribe(topic, handler);
  }

  /** Subscribe to all events (wildcard). Returns unsubscribe fn. */
  onEvent(handler: BrokerEventHandler): () => void {
    this.globalHandlers.add(handler);
    return () => this.globalHandlers.delete(handler);
  }

  /** Destroy the orchestrator and all connections. */
  destroy(): void {
    this.delta.disconnect();
    this.ctrader.disconnect();
    this.subs.clear();
    this.globalHandlers.clear();
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
  }

  private subscribeActiveSymbol(account: BrokerAccount): void {
    const sym = (account as unknown as { activeSymbol?: string }).activeSymbol ?? "BTCUSD";
    this.delta.subscribeSymbol(sym);
  }
}
