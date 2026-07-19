/**
 * brokerWatchlistStore — Zustand store for the watchlist / favorites.
 *
 * React Native port of src/store/brokerWatchlistStore.ts
 * ──────────────────────────────────────────────────────
 * RN compatibility changes vs the web original:
 *
 * 1. fetch() URLs — all relative paths (/api/watchlist, /api/watchlist/:id)
 *    are prefixed with getApiBase() so RN's fetch() resolves them against the
 *    configured API server instead of (non-existent) window.location.
 *
 * 2. No import.meta.env — __DEV__ replaces import.meta.env.DEV for debug logs.
 *
 * All business logic (deriveMeta, toEntry, seeding, optimistic updates) is
 * identical to the web original.
 */

import { create } from "zustand";
import { getApiBase } from "@/lib/apiBase";

// ── Symbol catalog — known symbols with pre-computed metadata ─────────────

export interface CatalogEntry {
  tv:     string;
  label:  string;
  badge:  string;
  market: string;
  description?: string;
}

export const SYMBOL_CATALOG: Record<string, CatalogEntry> = {
  BTCUSD:  { tv: "BINANCE:BTCUSDT",  label: "BTC/USD",  badge: "BTC",   market: "Crypto",      description: "Bitcoin Perpetual" },
  ETHUSD:  { tv: "BINANCE:ETHUSDT",  label: "ETH/USD",  badge: "ETH",   market: "Crypto",      description: "Ethereum Perpetual" },
  SOLUSD:  { tv: "BINANCE:SOLUSDT",  label: "SOL/USD",  badge: "SOL",   market: "Crypto",      description: "Solana Perpetual" },
  DOGEUSD: { tv: "BINANCE:DOGEUSDT", label: "DOGE/USD", badge: "DOGE",  market: "Crypto",      description: "Dogecoin Perpetual" },
  PEPEUSD: { tv: "BINANCE:PEPEUSDT", label: "PEPE/USD", badge: "PEPE",  market: "Crypto",      description: "Pepe Perpetual" },
  EURUSD:  { tv: "OANDA:EURUSD",     label: "EUR/USD",  badge: "EUR",   market: "Forex",       description: "Euro / US Dollar" },
  GBPUSD:  { tv: "OANDA:GBPUSD",     label: "GBP/USD",  badge: "GBP",   market: "Forex",       description: "British Pound / US Dollar" },
  GBPJPY:  { tv: "OANDA:GBPJPY",     label: "GBP/JPY",  badge: "GBJ",   market: "Forex",       description: "British Pound / Japanese Yen" },
  USDJPY:  { tv: "OANDA:USDJPY",     label: "USD/JPY",  badge: "JPY",   market: "Forex",       description: "US Dollar / Japanese Yen" },
  AUDUSD:  { tv: "OANDA:AUDUSD",     label: "AUD/USD",  badge: "AUD",   market: "Forex",       description: "Australian Dollar / US Dollar" },
  USDCAD:  { tv: "OANDA:USDCAD",     label: "USD/CAD",  badge: "CAD",   market: "Forex",       description: "US Dollar / Canadian Dollar" },
  USDCHF:  { tv: "OANDA:USDCHF",     label: "USD/CHF",  badge: "CHF",   market: "Forex",       description: "US Dollar / Swiss Franc" },
  NAS100:  { tv: "OANDA:NAS100USD",  label: "NAS100",   badge: "NAS",   market: "Indices",     description: "Nasdaq 100 Index" },
  US30:    { tv: "OANDA:US30USD",    label: "US 30",    badge: "DJI",   market: "Indices",     description: "Dow Jones Industrial" },
  US500:   { tv: "OANDA:SPX500USD",  label: "S&P 500",  badge: "SPX",   market: "Indices",     description: "S&P 500 Index" },
  SPX500:  { tv: "OANDA:SPX500USD",  label: "S&P 500",  badge: "SPX",   market: "Indices",     description: "S&P 500 Index" },
  GER40:   { tv: "OANDA:DE30EUR",    label: "GER 40",   badge: "DAX",   market: "Indices",     description: "Germany 40 Index" },
  DE40:    { tv: "OANDA:DE30EUR",    label: "DAX 40",   badge: "DAX",   market: "Indices",     description: "DAX 40 Index" },
  UK100:   { tv: "OANDA:UK100GBP",   label: "UK 100",   badge: "FTSE",  market: "Indices",     description: "FTSE 100 Index" },
  XAUUSD:  { tv: "OANDA:XAUUSD",     label: "XAU/USD",  badge: "GOLD",  market: "Commodities", description: "Gold / US Dollar" },
  XAGUSD:  { tv: "OANDA:XAGUSD",     label: "XAG/USD",  badge: "SILV",  market: "Commodities", description: "Silver / US Dollar" },
  USOIL:   { tv: "TVC:USOIL",        label: "US Oil",   badge: "OIL",   market: "Commodities", description: "US Crude Oil (WTI)" },
  UKOIL:   { tv: "TVC:UKOIL",        label: "UK Oil",   badge: "BRENT", market: "Commodities", description: "UK Crude Oil (Brent)" },
  NATGAS:  { tv: "TVC:NATGAS",       label: "Nat Gas",  badge: "GAS",   market: "Commodities", description: "Natural Gas" },
};

const DEFAULT_SYMBOLS = [
  "NAS100", "US30", "XAUUSD", "EURUSD", "GBPJPY", "USOIL", "UKOIL",
  "BTCUSD", "ETHUSD", "SOLUSD", "DOGEUSD", "PEPEUSD",
];

export type Market = "Crypto" | "Forex" | "Indices" | "Commodities";

export interface WatchlistEntry {
  id:         number;
  symbol:     string;
  provider:   string;
  position:   number;
  isFavorite: boolean;
  createdAt:  string;
  label:      string;
  market:     string;
  tv:         string;
  badge:      string;
}

type RawRow = {
  id: number; symbol: string; provider: string;
  position: number; isFavorite: boolean; createdAt: string;
};

export function deriveMeta(symbol: string): { tv: string; label: string; badge: string; market: string } {
  const s = symbol.toUpperCase();
  const catalogEntry = SYMBOL_CATALOG[s];
  if (catalogEntry) return catalogEntry;

  let market: string = "Other";
  let badge  = s.slice(0, 4);
  let label  = s;

  if (/^[A-Z0-9]{2,12}USDT$/.test(s)) {
    const base = s.replace("USDT", "");
    market = "Crypto"; badge = base.slice(0, 5); label = `${base}/USDT`;
  } else if (/^[A-Z0-9]{2,8}USD$/.test(s)) {
    const base = s.replace("USD", "");
    if (!["EUR","GBP","AUD","NZD","CAD","CHF","XAU","XAG"].includes(base)) {
      market = "Crypto"; badge = base.slice(0, 5); label = `${base}/USD`;
    }
  }
  if (market === "Other" && /^[A-Z]{6}$/.test(s)) {
    market = "Forex"; badge = s.slice(0, 3); label = `${s.slice(0,3)}/${s.slice(3)}`;
  }
  if (["XAUUSD","XAGUSD","XPTUSD","XPDUSD"].includes(s)) {
    market = "Commodities"; badge = s.slice(0, 3); label = s;
  }
  if (/^(US30|NAS|SPX|GER|UK1|JP2|AUS|DOW|DAX|CAC|FTSE|IBEX|DE4|FR4|IT4|ES3)/.test(s)) {
    market = "Indices"; badge = s.slice(0, 4); label = s;
  }
  if (/^(OIL|GAS|WTI|BRENT|NGAS|USOIL|UKOIL|COPP|WHEAT|CORN|SUGAR|COFFEE)/.test(s)) {
    market = "Commodities"; badge = s.slice(0, 4); label = s;
  }
  return { tv: s, label, badge, market };
}

function toEntry(row: RawRow): WatchlistEntry {
  const meta = deriveMeta(row.symbol);
  return { ...row, ...meta };
}

// ── Store ──────────────────────────────────────────────────────────────────

export interface BrokerWatchlistState {
  items:          WatchlistEntry[];
  loading:        boolean;
  symbols:        string[];
  addSymbol:      (symbol: string, isFavorite?: boolean, tapAt?: number) => Promise<{ ok: boolean; error?: string }>;
  removeSymbol:   (id: number) => Promise<void>;
  toggleFavorite: (id: number, current: boolean, tapAt?: number) => Promise<void>;
  refresh:        () => Promise<void>;
}

let _seeding = false;

export const useBrokerWatchlistStore = create<BrokerWatchlistState>((set, get) => ({
  items:   [],
  loading: true,
  symbols: [],

  refresh: async () => {
    const base = getApiBase();
    try {
      const res = await fetch(`${base}/api/watchlist`);
      if (!res.ok) return;
      const rows = await res.json() as RawRow[];

      if (rows.length === 0 && !_seeding) {
        _seeding = true;
        await Promise.all(
          DEFAULT_SYMBOLS.map(sym =>
            fetch(`${base}/api/watchlist`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ symbol: sym, isFavorite: false }),
            })
          )
        );
        const r2    = await fetch(`${base}/api/watchlist`);
        const rows2 = await r2.json() as RawRow[];
        const items = rows2.map(toEntry);
        set({ items, loading: false, symbols: items.map(i => i.symbol) });
        _seeding = false;
      } else {
        const items = rows.map(toEntry);
        set({ items, loading: false, symbols: items.map(i => i.symbol) });
      }
    } catch {
      set({ loading: false });
    }
  },

  addSymbol: async (symbol, isFavorite = false) => {
    const base   = getApiBase();
    const sym    = symbol.toUpperCase();
    const tempId = -(Date.now());
    const meta   = deriveMeta(sym);
    const { items } = get();

    if (items.some(i => i.symbol === sym)) {
      return { ok: false, error: "Symbol already in watchlist" };
    }

    const tempEntry: WatchlistEntry = {
      id: tempId, symbol: sym, provider: "pending",
      position: items.length, isFavorite: isFavorite ?? false,
      createdAt: new Date().toISOString(), ...meta,
    };

    set(state => {
      if (state.items.some(i => i.symbol === sym)) return state;
      const next = [...state.items, tempEntry];
      return { items: next, symbols: next.map(i => i.symbol) };
    });

    try {
      const res = await fetch(`${base}/api/watchlist`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ symbol: sym, isFavorite }),
      });
      if (res.ok) {
        const item = await res.json() as RawRow;
        set(state => {
          const next = state.items.map(i => i.id === tempId ? toEntry(item) : i);
          return { items: next, symbols: next.map(i => i.symbol) };
        });
        return { ok: true };
      }
      set(state => {
        const next = state.items.filter(i => i.id !== tempId);
        return { items: next, symbols: next.map(i => i.symbol) };
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      return { ok: false, error: data.error ?? "Failed to add symbol" };
    } catch {
      set(state => {
        const next = state.items.filter(i => i.id !== tempId);
        return { items: next, symbols: next.map(i => i.symbol) };
      });
      return { ok: false, error: "Network error" };
    }
  },

  removeSymbol: async (id) => {
    const base = getApiBase();
    const res  = await fetch(`${base}/api/watchlist/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      set(state => {
        const next = state.items.filter(i => i.id !== id);
        return { items: next, symbols: next.map(i => i.symbol) };
      });
    }
  },

  toggleFavorite: async (id, current) => {
    const base = getApiBase();
    // Optimistic update
    set(state => ({
      items: state.items.map(i => i.id === id ? { ...i, isFavorite: !current } : i),
    }));
    try {
      await fetch(`${base}/api/watchlist/${id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ isFavorite: !current }),
      });
    } catch {
      // Roll back optimistic update on network error
      set(state => ({
        items: state.items.map(i => i.id === id ? { ...i, isFavorite: current } : i),
      }));
    }
  },
}));
