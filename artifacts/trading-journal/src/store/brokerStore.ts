import { create } from "zustand";
import type {
  BrokerAccount, BrokerBalance, BrokerPosition, BrokerOrder,
  PlaceOrderRequest, ConnectionStatus, BrokerId,
} from "@/types/broker";
import type { WsStatus } from "@/contexts/LiveMarketContext";
import type { BrokerEvent, WsClientState } from "@/lib/broker-ws/types";
import type { BrokerWsOrchestrator } from "@/lib/broker-ws/BrokerWsOrchestrator";
import { getAdapter } from "./brokerAdapters";

let _orchestrator: BrokerWsOrchestrator | null = null;
export function getBrokerOrchestrator(): BrokerWsOrchestrator | null { return _orchestrator; }

const LS_TOKEN_PREFIX = "tj_broker_token_";

function saveToken(accountId: number, token: string) {
  try { localStorage.setItem(LS_TOKEN_PREFIX + accountId, token); } catch { /* ignore */ }
}
function loadToken(accountId: number): string {
  try { return localStorage.getItem(LS_TOKEN_PREFIX + accountId) ?? ""; } catch { return ""; }
}
function removeToken(accountId: number) {
  try { localStorage.removeItem(LS_TOKEN_PREFIX + accountId); } catch { /* ignore */ }
}
function withToken(account: BrokerAccount): BrokerAccount {
  if (account.api_token) return account;
  return { ...account, api_token: loadToken(account.id) };
}
function brokerHeaders(account: BrokerAccount): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Broker-Account-Id": String(account.id),
    "X-Broker-Token": account.api_token,
  };
}

const POLL_INTERVAL: Record<string, number> = {
  delta:   3_000,
  ctrader: 5_000,
  default: 4_000,
};

function pollIntervalFor(brokerId: string): number {
  return POLL_INTERVAL[brokerId] ?? POLL_INTERVAL["default"]!;
}

type RefreshResult = { ok: true } | { ok: false; error: string };

let pollHandle: ReturnType<typeof setInterval> | null = null;
let reconnectHandle: ReturnType<typeof setTimeout> | null = null;

function clearPoll() {
  if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
}
function clearReconnect() {
  if (reconnectHandle) { clearTimeout(reconnectHandle); reconnectHandle = null; }
}

async function doRefreshBalance(account: BrokerAccount): Promise<RefreshResult & { balance?: BrokerBalance }> {
  const adapter = getAdapter(account.broker_id);
  try {
    const res = await fetch(adapter.balancePath, { headers: brokerHeaders(account) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { ok: boolean; balance: unknown; error?: string };
    if (!data.ok) return { ok: false, error: data.error ?? "No balance data" };
    return { ok: true, balance: adapter.normalizeBalance(data.balance) };
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function doRefreshPositions(account: BrokerAccount): Promise<RefreshResult & { positions?: BrokerPosition[] }> {
  const adapter = getAdapter(account.broker_id);
  try {
    const res = await fetch(adapter.positionsPath, { headers: brokerHeaders(account) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { ok: boolean; positions: unknown[]; error?: string };
    if (!data.ok) return { ok: false, error: data.error ?? "Error response" };
    return { ok: true, positions: adapter.normalizePositions(data.positions ?? []) };
  } catch (e) { return { ok: false, error: String(e) }; }
}

async function doRefreshOrders(account: BrokerAccount): Promise<RefreshResult & { orders?: BrokerOrder[] }> {
  const adapter = getAdapter(account.broker_id);
  try {
    const res = await fetch(adapter.ordersPath, { headers: brokerHeaders(account) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { ok: boolean; orders: unknown[]; error?: string };
    if (!data.ok) return { ok: false, error: data.error ?? "Error response" };
    return { ok: true, orders: adapter.normalizeOrders(data.orders ?? []) };
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ---------------------------------------------------------------------------
// Delta WS payload normalizers
// These convert raw Delta Exchange WebSocket message payloads into the typed
// BrokerBalance / BrokerPosition / BrokerOrder interfaces used by the store.
// ---------------------------------------------------------------------------

function normalizeDeltaWsBalance(payload: Record<string, unknown>): BrokerBalance | null {
  const symbol = String(payload["asset_symbol"] ?? "");
  if (!symbol) return null;

  const walletBal    = parseFloat(String(payload["balance"]          ?? "0"));
  const orderMargin  = parseFloat(String(payload["order_margin"]     ?? "0"));
  const posMargin    = parseFloat(String(payload["position_margin"]  ?? "0"));

  if (!isFinite(walletBal)) return null;

  const available = Math.max(0, walletBal - orderMargin - posMargin);

  return {
    coin:               symbol,
    walletBalance:      walletBal.toFixed(4),
    equity:             walletBal.toFixed(4),
    availableToWithdraw: available.toFixed(4),
    unrealisedPnl:      "0",
  };
}

function normalizeDeltaWsPosition(payload: Record<string, unknown>): BrokerPosition {
  const side = String(payload["side"] ?? "buy").toLowerCase();
  return {
    id:           String(payload["product_id"] ?? payload["id"] ?? ""),
    symbol:       String(payload["product_symbol"] ?? payload["symbol"] ?? ""),
    side:         side === "buy" ? "Long" : "Short",
    size:         Math.abs(parseFloat(String(payload["size"] ?? "0"))),
    entryPrice:   parseFloat(String(payload["entry_price"]     ?? "0")),
    markPrice:    parseFloat(String(payload["mark_price"]      ?? "0")),
    unrealisedPnl: parseFloat(String(payload["unrealized_pnl"] ?? "0")),
    leverage:     String(payload["leverage"] ?? "1"),
    raw:          payload,
  };
}

function normalizeDeltaWsOrder(payload: Record<string, unknown>): BrokerOrder {
  const side      = String(payload["side"] ?? "buy").toLowerCase();
  const orderType = String(payload["order_type"] ?? "limit_order")
    .replace(/_order$/, "")
    .toLowerCase();
  return {
    id:        String(payload["id"] ?? ""),
    symbol:    String(payload["product_symbol"] ?? payload["symbol"] ?? ""),
    side:      side === "buy" ? "Buy" : "Sell",
    orderType: orderType,
    price:     parseFloat(String(payload["limit_price"] ?? payload["price"] ?? "0")),
    qty:       parseFloat(String(payload["size"] ?? payload["quantity"] ?? "0")),
    status:    String(payload["state"] ?? payload["status"] ?? "open"),
    createdAt: String(payload["created_at"] ?? new Date().toISOString()),
    raw:       payload,
  };
}

const DELTA_ORDER_TERMINAL_STATES = new Set(["filled", "cancelled", "closed", "rejected", "expired"]);

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type PrivateWsStatus = "idle" | "connecting" | "connected" | "reconnecting" | "failed";

export interface BrokerState {
  accounts: BrokerAccount[];

  connectedBroker: BrokerAccount | null;
  activeAccount: BrokerAccount | null;

  brokerStatus: ConnectionStatus;
  connectionStatus: ConnectionStatus;

  accountBalance: BrokerBalance | null;
  balance: BrokerBalance | null;

  positions: BrokerPosition[];
  orders: BrokerOrder[];
  error: string | null;

  websocketStatus: WsStatus;
  connectionLatency: number | null;
  reconnectingState: boolean;
  reconnectAttempts: number;
  lastSuccessfulPoll: number | null;

  /** Status of the backend-side authenticated private WS session (Delta only). */
  privateWsStatus: PrivateWsStatus;

  activeSymbol: string;
  activeTimeframe: string;

  showSelectModal: boolean;
  showAuthModal: boolean;
  authBrokerId: BrokerId | null;
  showPositions: boolean;
  showOrders: boolean;
  showPlaceOrder: boolean;

  loadAccounts: () => Promise<void>;

  connectBroker: (account: BrokerAccount) => Promise<void>;
  connect: (account: BrokerAccount) => Promise<void>;

  disconnectBroker: () => void;
  disconnect: () => void;

  updateBalance: () => Promise<void>;
  refreshBalance: () => Promise<void>;

  updatePositions: () => Promise<void>;
  refreshPositions: () => Promise<void>;

  updateOrders: () => Promise<void>;
  refreshOrders: () => Promise<void>;

  refreshAll: () => Promise<void>;

  setLatency: (ms: number) => void;

  placeOrder: (req: PlaceOrderRequest) => Promise<RefreshResult>;
  closePosition: (pos: BrokerPosition) => Promise<RefreshResult>;
  cancelOrder: (ord: BrokerOrder) => Promise<RefreshResult>;
  deleteAccount: (id: number) => Promise<void>;

  reconnect: () => Promise<void>;

  livePnl: Record<string, number>;
  wsClientStates: { delta: WsClientState | null; ctrader: WsClientState | null };

  setWebsocketStatus: (s: WsStatus) => void;
  handleWsMessage: (msg: unknown) => void;
  handleBrokerEvent: (event: BrokerEvent) => void;
  setOrchestratorRef: (orch: BrokerWsOrchestrator | null) => void;

  setActiveSymbol: (s: string) => void;
  setActiveTimeframe: (s: string) => void;

  openSelectModal: () => void;
  closeSelectModal: () => void;
  openAuthModal: (brokerId: BrokerId) => void;
  closeAuthModal: () => void;
  setShowPositions: (v: boolean) => void;
  setShowOrders: (v: boolean) => void;
  setShowPlaceOrder: (v: boolean) => void;
}

function syncAccount(account: BrokerAccount | null) {
  return { connectedBroker: account, activeAccount: account };
}
function syncStatus(s: ConnectionStatus) {
  return { brokerStatus: s, connectionStatus: s };
}
function syncBalance(b: BrokerBalance | null) {
  return { accountBalance: b, balance: b };
}

export const useBrokerStore = create<BrokerState>((set, get) => ({
  accounts: [],

  connectedBroker: null,
  activeAccount: null,

  brokerStatus: "disconnected",
  connectionStatus: "disconnected",

  accountBalance: null,
  balance: null,

  positions: [],
  orders: [],
  error: null,

  websocketStatus: "disconnected",
  connectionLatency: null,
  reconnectingState: false,
  reconnectAttempts: 0,
  lastSuccessfulPoll: null,
  privateWsStatus: "idle",

  activeSymbol: "BTCUSD",
  activeTimeframe: "60",

  livePnl: {},
  wsClientStates: { delta: null, ctrader: null },

  showSelectModal: false,
  showAuthModal: false,
  authBrokerId: null,
  showPositions: false,
  showOrders: false,
  showPlaceOrder: false,

  loadAccounts: async () => {
    try {
      const res = await fetch("/api/broker-accounts");
      if (!res.ok) return;
      const data = await res.json() as { ok: boolean; accounts: BrokerAccount[] };
      set({ accounts: (data.accounts ?? []).map(a => withToken(a)) });
    } catch { /* ignore */ }
  },

  connectBroker: async (account: BrokerAccount) => {
    return get().connect(account);
  },

  connect: async (account: BrokerAccount) => {
    clearPoll();
    clearReconnect();
    const full = withToken(account);
    saveToken(full.id, full.api_token);

    set({
      ...syncAccount(full),
      ...syncStatus("connecting"),
      ...syncBalance(null),
      positions: [],
      orders: [],
      error: null,
      reconnectingState: false,
      reconnectAttempts: 0,
      privateWsStatus: "idle",
    });

    const [balRes, posRes, ordRes] = await Promise.all([
      doRefreshBalance(full),
      doRefreshPositions(full),
      doRefreshOrders(full),
    ]);

    const allFailed = !balRes.ok && !posRes.ok && !ordRes.ok;

    if (allFailed) {
      set({ ...syncStatus("error"), error: "All broker API calls failed — check credentials or reconnect" });
      return;
    }

    const patch: Partial<BrokerState> = {
      ...syncStatus("connected"),
      lastSuccessfulPoll: Date.now(),
    };
    if (balRes.ok && balRes.balance) {
      patch.accountBalance = balRes.balance;
      patch.balance = balRes.balance;
    }
    if (posRes.ok && posRes.positions) patch.positions = posRes.positions;
    if (ordRes.ok && ordRes.orders)    patch.orders    = ordRes.orders;
    set(patch);

    const interval = pollIntervalFor(full.broker_id);
    pollHandle = setInterval(async () => {
      const { connectedBroker } = get();
      if (!connectedBroker) return;

      const [br, pr, or2] = await Promise.all([
        doRefreshBalance(connectedBroker),
        doRefreshPositions(connectedBroker),
        doRefreshOrders(connectedBroker),
      ]);

      const nowAllFailed = !br.ok && !pr.ok && !or2.ok;
      const patch2: Partial<BrokerState> = {};

      if (br.ok && br.balance) {
        patch2.accountBalance = br.balance;
        patch2.balance = br.balance;
      }
      if (pr.ok && pr.positions) patch2.positions = pr.positions;
      if (or2.ok && or2.orders)  patch2.orders    = or2.orders;

      if (br.ok || pr.ok || or2.ok) {
        patch2.lastSuccessfulPoll = Date.now();
      }

      if (nowAllFailed && get().brokerStatus === "connected") {
        patch2.brokerStatus = "error";
        patch2.connectionStatus = "error";
        patch2.error = "Broker API unreachable — will retry";
      } else if ((br.ok || pr.ok || or2.ok) && get().brokerStatus === "error") {
        patch2.brokerStatus = "connected";
        patch2.connectionStatus = "connected";
        patch2.error = null;
      }

      if (Object.keys(patch2).length > 0) set(patch2);
    }, interval);
  },

  disconnectBroker: () => get().disconnect(),

  disconnect: () => {
    clearPoll();
    clearReconnect();
    set({
      ...syncAccount(null),
      ...syncStatus("disconnected"),
      ...syncBalance(null),
      positions: [],
      orders: [],
      error: null,
      reconnectingState: false,
      reconnectAttempts: 0,
      privateWsStatus: "idle",
      showPositions: false,
      showOrders: false,
      showPlaceOrder: false,
    });
  },

  updateBalance: async () => get().refreshBalance(),
  refreshBalance: async () => {
    const { connectedBroker } = get();
    if (!connectedBroker) return;
    const r = await doRefreshBalance(connectedBroker);
    if (r.ok && r.balance) set({ ...syncBalance(r.balance), lastSuccessfulPoll: Date.now() });
  },

  updatePositions: async () => get().refreshPositions(),
  refreshPositions: async () => {
    const { connectedBroker } = get();
    if (!connectedBroker) return;
    const r = await doRefreshPositions(connectedBroker);
    if (r.ok && r.positions) set({ positions: r.positions, lastSuccessfulPoll: Date.now() });
  },

  updateOrders: async () => get().refreshOrders(),
  refreshOrders: async () => {
    const { connectedBroker } = get();
    if (!connectedBroker) return;
    const r = await doRefreshOrders(connectedBroker);
    if (r.ok && r.orders) set({ orders: r.orders, lastSuccessfulPoll: Date.now() });
  },

  refreshAll: async () => {
    const { connectedBroker } = get();
    if (!connectedBroker) return;
    const [br, pr, or2] = await Promise.all([
      doRefreshBalance(connectedBroker),
      doRefreshPositions(connectedBroker),
      doRefreshOrders(connectedBroker),
    ]);
    const patch: Partial<BrokerState> = {};
    if (br.ok && br.balance)    { patch.accountBalance = br.balance; patch.balance = br.balance; }
    if (pr.ok && pr.positions)  patch.positions = pr.positions;
    if (or2.ok && or2.orders)   patch.orders    = or2.orders;
    if (Object.keys(patch).length > 0) {
      patch.lastSuccessfulPoll = Date.now();
      set(patch);
    }
  },

  setLatency: (ms: number) => set({ connectionLatency: ms }),

  placeOrder: async (req: PlaceOrderRequest): Promise<RefreshResult> => {
    const { connectedBroker } = get();
    if (!connectedBroker) return { ok: false, error: "No broker connected" };
    const adapter = getAdapter(connectedBroker.broker_id);
    try {
      const body = adapter.buildOrderBody(req);
      const res = await fetch(`/api/broker/${connectedBroker.broker_id}/order`, {
        method: "POST",
        headers: brokerHeaders(connectedBroker),
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) return { ok: false, error: data.error ?? "Order failed" };
      setTimeout(() => get().refreshAll(), 800);
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  },

  closePosition: async (pos: BrokerPosition): Promise<RefreshResult> => {
    const { connectedBroker } = get();
    if (!connectedBroker) return { ok: false, error: "No broker connected" };
    const adapter = getAdapter(connectedBroker.broker_id);
    try {
      const { path, method, body } = adapter.closePositionConfig(pos);
      const res = await fetch(path, { method, headers: brokerHeaders(connectedBroker), body: JSON.stringify(body) });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) return { ok: false, error: data.error ?? "Close failed" };
      setTimeout(() => get().refreshAll(), 800);
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  },

  cancelOrder: async (ord: BrokerOrder): Promise<RefreshResult> => {
    const { connectedBroker } = get();
    if (!connectedBroker) return { ok: false, error: "No broker connected" };
    const adapter = getAdapter(connectedBroker.broker_id);
    try {
      const { path, method, body } = adapter.cancelOrderConfig(ord);
      const res = await fetch(path, {
        method,
        headers: brokerHeaders(connectedBroker),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) return { ok: false, error: data.error ?? "Cancel failed" };
      setTimeout(() => get().refreshAll(), 800);
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e) }; }
  },

  deleteAccount: async (id: number) => {
    await fetch(`/api/broker-accounts/${id}`, { method: "DELETE" });
    removeToken(id);
    const { connectedBroker } = get();
    if (connectedBroker?.id === id) get().disconnect();
    set(s => ({ accounts: s.accounts.filter(a => a.id !== id) }));
  },

  reconnect: async () => {
    clearPoll();
    clearReconnect();
    const { connectedBroker, reconnectAttempts } = get();
    if (!connectedBroker) return;

    const attempt = reconnectAttempts + 1;
    const delayMs = Math.min(1000 * Math.pow(1.5, attempt - 1), 30_000);

    set({
      ...syncStatus("connecting"),
      reconnectingState: true,
      reconnectAttempts: attempt,
      error: null,
    });

    reconnectHandle = setTimeout(async () => {
      const { connectedBroker: current } = get();
      if (!current) return;
      await get().connect(current);
      set({ reconnectingState: false });
    }, attempt > 1 ? delayMs : 0);
  },

  setWebsocketStatus: (s: WsStatus) => set({ websocketStatus: s }),

  // ---------------------------------------------------------------------------
  // handleWsMessage: processes relay messages from the backend (via LiveMarketContext).
  //
  // Backend sends these message types:
  //   pong              — latency ack
  //   ctrader_status    — cTrader private WS status
  //   delta_ws_status   — Delta private WS connection state
  //   delta_ws_error    — Delta authentication / connection error
  //   delta_balance     — Live balance update (v2/user_balance)
  //   delta_orders      — Live order update (v2/orders)
  //   delta_positions   — Live position update (v2/position_lifecycle)
  // ---------------------------------------------------------------------------
  handleWsMessage: (msg: unknown) => {
    const m = msg as Record<string, unknown>;
    if (!m || typeof m.type !== "string") return;

    // ── Latency pong ──────────────────────────────────────────────────────────
    if (m.type === "pong" && typeof m.latencyMs === "number") {
      set({ connectionLatency: m.latencyMs as number });
      return;
    }

    // ── cTrader status relay ──────────────────────────────────────────────────
    if (m.type === "ctrader_status") {
      const { connectedBroker } = get();
      if (!connectedBroker || connectedBroker.broker_id !== "ctrader") return;
      const st = m as { connected?: boolean };
      if (st.connected === true && get().brokerStatus !== "connected") {
        set({ ...syncStatus("connected"), error: null });
      } else if (st.connected === false && get().brokerStatus === "connected") {
        set({ ...syncStatus("error"), error: "cTrader WebSocket disconnected — reconnecting" });
        get().reconnect();
      }
      return;
    }

    // ── Delta private WS status ───────────────────────────────────────────────
    if (m.type === "delta_ws_status") {
      const { connectedBroker } = get();
      if (!connectedBroker || connectedBroker.broker_id !== "delta") return;

      const status = String(m.status ?? "");
      const statusMap: Record<string, PrivateWsStatus> = {
        connecting:   "connecting",
        connected:    "connected",
        reconnecting: "reconnecting",
        failed:       "failed",
      };
      const mapped = statusMap[status] ?? "idle";
      set({ privateWsStatus: mapped });
      return;
    }

    // ── Delta private WS error ────────────────────────────────────────────────
    if (m.type === "delta_ws_error") {
      const { connectedBroker } = get();
      if (!connectedBroker || connectedBroker.broker_id !== "delta") return;
      set({
        privateWsStatus: "failed",
        error: String(m.error ?? "Delta WebSocket authentication failed"),
      });
      return;
    }

    // ── Delta live balance update ─────────────────────────────────────────────
    if (m.type === "delta_balance") {
      const { connectedBroker } = get();
      if (!connectedBroker || connectedBroker.broker_id !== "delta") return;

      const payload = (m.payload ?? m) as Record<string, unknown>;
      const normalized = normalizeDeltaWsBalance(payload);
      if (!normalized) return;

      const existing = get().balance;
      // Only update if same coin as existing balance, or no balance yet
      if (!existing || normalized.coin === existing.coin || normalized.coin === "USDT") {
        set({
          ...syncBalance(normalized),
          lastSuccessfulPoll: Date.now(),
        });
      }
      return;
    }

    // ── Delta live order update ───────────────────────────────────────────────
    if (m.type === "delta_orders") {
      const { connectedBroker } = get();
      if (!connectedBroker || connectedBroker.broker_id !== "delta") return;

      const payload = (m.payload ?? m) as Record<string, unknown>;
      if (!payload["id"]) return;

      const orderId = String(payload["id"]);
      const orderState = String(payload["state"] ?? payload["status"] ?? "open").toLowerCase();
      const isTerminal = DELTA_ORDER_TERMINAL_STATES.has(orderState);

      set(s => {
        const existing = s.orders.filter(o => o.id !== orderId);
        const orders = isTerminal
          ? existing
          : [...existing, normalizeDeltaWsOrder(payload)];
        return { orders, lastSuccessfulPoll: Date.now() };
      });
      return;
    }

    // ── Delta live position update ────────────────────────────────────────────
    if (m.type === "delta_positions") {
      const { connectedBroker } = get();
      if (!connectedBroker || connectedBroker.broker_id !== "delta") return;

      const payload = (m.payload ?? m) as Record<string, unknown>;
      const productId = String(payload["product_id"] ?? payload["id"] ?? "");
      if (!productId) return;

      const size = parseFloat(String(payload["size"] ?? "0"));
      const isClosed = !isFinite(size) || size === 0;

      set(s => {
        const existing = s.positions.filter(p => p.id !== productId);
        const positions = isClosed
          ? existing
          : [...existing, normalizeDeltaWsPosition(payload)];
        return { positions, lastSuccessfulPoll: Date.now() };
      });

      // Sync live PnL tracker with updated positions
      const updated = get().positions;
      _orchestrator?.updatePositions("delta", updated);
      return;
    }
  },

  handleBrokerEvent: (event: BrokerEvent) => {
    switch (event.kind) {
      case "tick": {
        break;
      }
      case "positions": {
        const { connectedBroker } = get();
        if (connectedBroker?.broker_id !== event.broker) break;
        set({ positions: event.positions, lastSuccessfulPoll: event.ts });
        _orchestrator?.updatePositions(event.broker as "delta" | "ctrader", event.positions);
        break;
      }
      case "orders": {
        const { connectedBroker } = get();
        if (connectedBroker?.broker_id !== event.broker) break;
        set({ orders: event.orders, lastSuccessfulPoll: event.ts });
        break;
      }
      case "balance": {
        const { connectedBroker } = get();
        if (connectedBroker?.broker_id !== event.broker) break;
        set({ ...syncBalance(event.balance), lastSuccessfulPoll: event.ts });
        break;
      }
      case "pnl": {
        set(s => ({
          livePnl: { ...s.livePnl, [event.symbol]: event.unrealisedPnl },
        }));
        break;
      }
      case "status": {
        const { connectedBroker } = get();
        if (connectedBroker?.broker_id !== event.broker) break;
        const statusMap: Record<string, import("@/types/broker").ConnectionStatus> = {
          connected:    "connected",
          connecting:   "connecting",
          reconnecting: "connecting",
          disconnected: "disconnected",
          error:        "error",
          idle:         "disconnected",
        };
        const mapped = statusMap[event.status] ?? "error";
        set({ ...syncStatus(mapped) });
        if (event.status === "error" || event.status === "disconnected") {
          get().reconnect();
        }
        break;
      }
      case "latency": {
        set({ connectionLatency: event.latencyMs });
        break;
      }
    }
  },

  setOrchestratorRef: (orch: BrokerWsOrchestrator | null) => {
    _orchestrator = orch;
    set({ wsClientStates: orch?.state ?? { delta: null, ctrader: null } });
  },

  setActiveSymbol: (s: string) => set({ activeSymbol: s }),
  setActiveTimeframe: (s: string) => set({ activeTimeframe: s }),

  openSelectModal: () => set({ showSelectModal: true }),
  closeSelectModal: () => set({ showSelectModal: false }),
  openAuthModal: (brokerId: BrokerId) => set({ showAuthModal: true, authBrokerId: brokerId, showSelectModal: false }),
  closeAuthModal: () => set({ showAuthModal: false, authBrokerId: null }),
  setShowPositions: (v) => set({ showPositions: v }),
  setShowOrders: (v) => set({ showOrders: v }),
  setShowPlaceOrder: (v) => set({ showPlaceOrder: v }),
}));
