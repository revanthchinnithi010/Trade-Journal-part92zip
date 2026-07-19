/**
 * marketStore.ts — live market data + provider status Zustand store.
 *
 * React Native port of src/store/marketStore.ts
 * ─────────────────────────────────────────────
 * Two browser-specific APIs replaced; all business logic, state shape,
 * action names, selectors, and exported types are preserved exactly.
 *
 * Replacements made
 * ─────────────────
 * 1. localStorage (synchronous browser storage)
 *      Web:  loadLS() / saveLS() read+write localStorage synchronously at
 *            store-creation time and inside action handlers.
 *      RN:   Zustand `persist` middleware with `zustandStorage` (AsyncStorage).
 *            Only the three user-preference fields (activeBroker, activeSymbol,
 *            activeTimeframe) are persisted via `partialize`; all runtime
 *            state (wsStatus, latency, ticks, candles, etc.) is intentionally
 *            excluded and starts fresh each session.  The saveLS() calls
 *            inside setActiveBroker / setActiveSymbol / setActiveTimeframe are
 *            removed — persist handles saves automatically on every relevant
 *            state change.
 *            AsyncStorage is async; on cold start the store initialises with
 *            the fallback defaults ("BTCUSD", "60", null broker) and hydrates
 *            from disk once the first read resolves.  This matches the
 *            observable behaviour of the web version after a hard reload.
 *
 * 2. MessageEvent (browser DOM type)
 *      Web:  useSyncMarketStore returns (event: MessageEvent) => void,
 *            reading event.data (a string).
 *      RN:   The DOM MessageEvent type is not available in React Native.
 *            Replaced with a local WsMessageEvent interface { data: string }
 *            which is structurally identical to the shape the handler reads.
 *            React Native WebSocket message events satisfy this interface.
 *
 * 3. fetch with cache option
 *      Web:  fetch(url, { cache: "no-store" })
 *      RN:   Hermes / React Native fetch supports the Fetch API but ignores
 *            or throws on the `cache` init option.  The option is removed;
 *            behaviour is identical — the request always goes to the network.
 *
 * 4. Relative URL in fetchSymbolCatalog
 *      Web:  Relative paths ("/api/symbols") work because the browser resolves
 *            them against window.location.origin.
 *      RN:   No window.location; relative URLs throw on React Native's fetch.
 *            TODO: configure baseUrl from the api-client-react setBaseUrl
 *            mechanism or an environment variable, then prefix it here.
 *            The method body catches all errors silently, so a misconfigured
 *            URL is non-fatal — the catalog simply stays empty.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

import { zustandStorage } from "@/lib/rnStorage";

// ─────────────────────────────────────────────────────────────────────────────
// Types — identical to web
// ─────────────────────────────────────────────────────────────────────────────

export type BrokerName = "delta" | "ctrader";
export type WsStatus   = "connected" | "reconnecting" | "disconnected" | "error";

export interface LiveTick {
  symbol:     string;
  price:      number;
  volume:     number;
  timestamp:  number;
  receivedAt: number;
  provider:   string;
}

export interface OHLCBar {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
}

export interface SymbolInfo {
  symbol:       string;
  name:         string;
  contractType: string;
  broker:       string;
  underlying:   string;
  quoteAsset:   string;
  active:       boolean;
}

export interface ProviderStatus {
  name:           string;
  displayName:    string;
  status:         WsStatus;
  tickCount:      number;
  reconnectCount: number;
  lastTickAt:     number | null;
  latencyMs:      number | null;
  subscriptions:  string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Store state interface — identical to web
// ─────────────────────────────────────────────────────────────────────────────

interface MarketStoreState {
  activeBroker:    BrokerName | null;
  activeSymbol:    string;
  activeTimeframe: string;

  wsStatus:     Record<string, WsStatus>;
  latency:      Record<string, number | null>;
  reconnecting: Record<string, boolean>;

  ticks:   Record<string, LiveTick>;
  candles: OHLCBar[];

  symbolCatalog: Record<string, SymbolInfo[]>;
  catalogLoaded: Record<string, boolean>;

  providers: ProviderStatus[];

  setActiveBroker:    (broker: BrokerName | null) => void;
  setActiveSymbol:    (symbol: string) => void;
  setActiveTimeframe: (tf: string) => void;

  updateProviderStatus: (name: string, status: WsStatus) => void;
  updateLatency:        (name: string, ms: number | null) => void;
  setReconnecting:      (name: string, val: boolean) => void;

  updateTick:       (tick: LiveTick) => void;
  clearTicks:       () => void;
  setCandles:       (bars: OHLCBar[]) => void;
  appendCandle:     (bar: OHLCBar) => void;
  updateLastCandle: (bar: OHLCBar) => void;

  setSymbolCatalog: (broker: string, symbols: SymbolInfo[]) => void;
  setProviders:     (providers: ProviderStatus[]) => void;

  fetchSymbolCatalog: (broker?: string) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store — persist wraps only the three user-preference fields
// ─────────────────────────────────────────────────────────────────────────────

export const useMarketStore = create<MarketStoreState>()(
  persist(
    (set, get) => ({
      // ── Persisted initial state (hydrated from AsyncStorage on startup) ──
      activeBroker:    null,
      activeSymbol:    "BTCUSD",
      activeTimeframe: "60",

      // ── Runtime state (always starts fresh) ─────────────────────────────
      wsStatus:     {},
      latency:      {},
      reconnecting: {},

      ticks:   {},
      candles: [],

      symbolCatalog: {},
      catalogLoaded: {},

      providers: [],

      // ── Actions ──────────────────────────────────────────────────────────

      setActiveBroker: (broker) => {
        // persist middleware handles saving to AsyncStorage automatically
        set({ activeBroker: broker });
      },

      setActiveSymbol: (symbol) => {
        set({ activeSymbol: symbol, candles: [] });
      },

      setActiveTimeframe: (tf) => {
        set({ activeTimeframe: tf, candles: [] });
      },

      updateProviderStatus: (name, status) => {
        set(state => ({
          wsStatus: { ...state.wsStatus, [name]: status },
          reconnecting: {
            ...state.reconnecting,
            [name]: status === "reconnecting",
          },
        }));
      },

      updateLatency: (name, ms) => {
        set(state => ({ latency: { ...state.latency, [name]: ms } }));
      },

      setReconnecting: (name, val) => {
        set(state => ({ reconnecting: { ...state.reconnecting, [name]: val } }));
      },

      updateTick: (tick) => {
        set(state => ({
          ticks: {
            ...state.ticks,
            [tick.symbol]: tick,
          },
        }));
      },

      clearTicks: () => set({ ticks: {} }),

      setCandles: (bars) => set({ candles: bars }),

      appendCandle: (bar) => {
        set(state => {
          const prev = state.candles;
          if (prev.length === 0) return { candles: [bar] };
          const last = prev[prev.length - 1];
          if (last.time === bar.time) {
            return { candles: [...prev.slice(0, -1), bar] };
          }
          return { candles: [...prev, bar] };
        });
      },

      updateLastCandle: (bar) => {
        set(state => {
          const prev = state.candles;
          if (prev.length === 0) return { candles: [bar] };
          const last = prev[prev.length - 1];
          if (last.time === bar.time) {
            return { candles: [...prev.slice(0, -1), bar] };
          }
          return state;
        });
      },

      setSymbolCatalog: (broker, symbols) => {
        set(state => ({
          symbolCatalog: { ...state.symbolCatalog, [broker]: symbols },
          catalogLoaded: { ...state.catalogLoaded, [broker]: true },
        }));
      },

      setProviders: (providers) => set({ providers }),

      fetchSymbolCatalog: async (broker) => {
        // TODO: prefix with the configured API base URL (no window.location in RN).
        // The catch block below makes this non-fatal — the catalog stays empty
        // until a proper base URL is configured via the api-client-react layer.
        const url = broker ? `/api/symbols?broker=${broker}` : "/api/symbols";
        try {
          // `cache: "no-store"` removed — unsupported in React Native's fetch.
          const res  = await fetch(url);
          if (!res.ok) return;
          const data = await res.json() as Record<string, unknown>;

          if (broker) {
            const symbols = (data["symbols"] as SymbolInfo[] | undefined) ?? [];
            get().setSymbolCatalog(broker, symbols);
          } else {
            if (data["delta"]) {
              const d = data["delta"] as { symbols: SymbolInfo[] };
              get().setSymbolCatalog("delta", d.symbols);
            }
          }
        } catch { /* non-fatal — catalog is a convenience feature */ }
      },
    }),
    {
      name:    "market-store",
      storage: zustandStorage,
      // Only persist user preferences — runtime WS/tick/candle state is
      // always rebuilt from live sources and must not be restored from disk.
      partialize: (state) => ({
        activeBroker:    state.activeBroker,
        activeSymbol:    state.activeSymbol,
        activeTimeframe: state.activeTimeframe,
      }),
    },
  ),
);

// ─────────────────────────────────────────────────────────────────────────────
// useSyncMarketStore
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal WebSocket message event shape consumed by the handler.
 *
 * Replaces the browser's `MessageEvent` type (not available in React Native).
 * React Native's WebSocket `onmessage` event satisfies this interface — its
 * `data` property is a string (for text frames) or ArrayBuffer (binary).
 * The handler only processes text frames, so the `string` type is correct.
 */
export interface WsMessageEvent {
  data: string;
}

/**
 * Hook: subscribe to live provider status events from the backend WS.
 * Call once at the app root (e.g. in the root layout).
 *
 * Returns a message-handler function to attach to a WebSocket:
 *   const handle = useSyncMarketStore();
 *   ws.onmessage = handle;
 *
 * Usage (identical to web):
 *   import { useSyncMarketStore } from "@/store/marketStore";
 *   function Layout() { useSyncMarketStore(); ... }
 */
export function useSyncMarketStore() {
  const store = useMarketStore.getState();

  // Web: (event: MessageEvent) => void
  // RN:  (event: WsMessageEvent) => void  — structurally equivalent for data: string
  const handleWsMessage = (event: WsMessageEvent) => {
    try {
      const msg = JSON.parse(event.data) as Record<string, unknown>;

      if (msg["type"] === "provider_status" || msg["type"] === "feed_status") {
        const name    = String(msg["provider"] ?? "");
        const status  = String(msg["status"]   ?? "disconnected") as WsStatus;
        const latency = typeof msg["latencyMs"] === "number" ? msg["latencyMs"] : null;
        if (name) {
          store.updateProviderStatus(name, status);
          if (latency !== null) store.updateLatency(name, latency);
        }
      }

      if (msg["type"] === "tick") {
        const tick: LiveTick = {
          symbol:     String(msg["symbol"]     ?? ""),
          price:      Number(msg["price"]      ?? 0),
          volume:     Number(msg["volume"]     ?? 0),
          timestamp:  Number(msg["timestamp"]  ?? Date.now()),
          receivedAt: Number(msg["receivedAt"] ?? Date.now()),
          provider:   String(msg["provider"]   ?? ""),
        };
        if (tick.symbol && tick.price > 0) store.updateTick(tick);
      }

      if (msg["type"] === "candle_update") {
        const { symbol, interval, bar } = msg as {
          symbol: string; interval: string; bar: OHLCBar;
        };
        const { activeSymbol, activeTimeframe } = useMarketStore.getState();
        if (symbol === activeSymbol && interval === activeTimeframe && bar) {
          store.updateLastCandle(bar);
        }
      }
    } catch { /* ignore malformed messages */ }
  };

  return handleWsMessage;
}
