import {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, type ReactNode,
} from "react";
import { recordDb } from "@/lib/starDiag";

export interface WatchlistEntry {
  id:         number;
  symbol:     string;
  provider:   string;
  position:   number;
  isFavorite: boolean;
  createdAt:  string;
  tv:         string;
  label:      string;
  badge:      string;
  market:     string;
}

export type Market = "Crypto" | "Forex" | "Indices" | "Commodities";

export interface CatalogEntry {
  tv:     string;
  label:  string;
  badge:  string;
  market: Market;
}

export const SYMBOL_CATALOG: Record<string, CatalogEntry> = {
  BTCUSD:  { tv: "BINANCE:BTCUSDT",  label: "BTC/USD",  badge: "BTC",  market: "Crypto" },
  ETHUSD:  { tv: "BINANCE:ETHUSDT",  label: "ETH/USD",  badge: "ETH",  market: "Crypto" },
  SOLUSD:  { tv: "BINANCE:SOLUSDT",  label: "SOL/USD",  badge: "SOL",  market: "Crypto" },
  DOGEUSD: { tv: "BINANCE:DOGEUSDT", label: "DOGE/USD", badge: "DOGE", market: "Crypto" },
  PEPEUSD: { tv: "BINANCE:PEPEUSDT", label: "PEPE/USD", badge: "PEPE", market: "Crypto" },
  EURUSD:  { tv: "OANDA:EURUSD",     label: "EUR/USD",  badge: "EUR",  market: "Forex" },
  GBPUSD:  { tv: "OANDA:GBPUSD",     label: "GBP/USD",  badge: "GBP",  market: "Forex" },
  GBPJPY:  { tv: "OANDA:GBPJPY",     label: "GBP/JPY",  badge: "GBJ",  market: "Forex" },
  USDJPY:  { tv: "OANDA:USDJPY",     label: "USD/JPY",  badge: "JPY",  market: "Forex" },
  AUDUSD:  { tv: "OANDA:AUDUSD",     label: "AUD/USD",  badge: "AUD",  market: "Forex" },
  USDCAD:  { tv: "OANDA:USDCAD",     label: "USD/CAD",  badge: "CAD",  market: "Forex" },
  USDCHF:  { tv: "OANDA:USDCHF",     label: "USD/CHF",  badge: "CHF",  market: "Forex" },
  NAS100:  { tv: "OANDA:NAS100USD",  label: "NAS100",   badge: "NAS",  market: "Indices" },
  US30:    { tv: "OANDA:US30USD",    label: "US 30",    badge: "DJI",  market: "Indices" },
  US500:   { tv: "OANDA:SPX500USD",  label: "S&P 500",  badge: "SPX",  market: "Indices" },
  SPX500:  { tv: "OANDA:SPX500USD",  label: "S&P 500",  badge: "SPX",  market: "Indices" },
  GER40:   { tv: "OANDA:DE30EUR",    label: "GER 40",   badge: "DAX",  market: "Indices" },
  DE40:    { tv: "OANDA:DE30EUR",    label: "DAX 40",   badge: "DAX",  market: "Indices" },
  UK100:   { tv: "OANDA:UK100GBP",   label: "UK 100",   badge: "FTSE", market: "Indices" },
  XAUUSD:  { tv: "OANDA:XAUUSD",     label: "XAU/USD",  badge: "GOLD", market: "Commodities" },
  XAGUSD:  { tv: "OANDA:XAGUSD",     label: "XAG/USD",  badge: "SILV", market: "Commodities" },
  USOIL:   { tv: "TVC:USOIL",        label: "US Oil",   badge: "OIL",  market: "Commodities" },
  UKOIL:   { tv: "TVC:UKOIL",        label: "UK Oil",   badge: "BRENT",market: "Commodities" },
  NATGAS:  { tv: "TVC:NATGAS",       label: "Nat Gas",  badge: "GAS",  market: "Commodities" },
};

const DEFAULT_SYMBOLS = [
  "NAS100", "US30", "XAUUSD", "EURUSD", "GBPJPY", "USOIL", "UKOIL",
  "BTCUSD", "ETHUSD", "SOLUSD", "DOGEUSD", "PEPEUSD",
];

type RawRow = {
  id: number; symbol: string; provider: string;
  position: number; isFavorite: boolean; createdAt: string;
};

function deriveMeta(symbol: string): { tv: string; label: string; badge: string; market: string } {
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

interface WatchlistContextValue {
  items:          WatchlistEntry[];
  loading:        boolean;
  symbols:        string[];
  addSymbol:      (symbol: string, isFavorite?: boolean, tapAt?: number) => Promise<{ ok: boolean; error?: string }>;
  removeSymbol:   (id: number) => Promise<void>;
  toggleFavorite: (id: number, current: boolean, tapAt?: number) => Promise<void>;
  refresh:        () => Promise<void>;
}

const WatchlistContext = createContext<WatchlistContextValue>({
  items: [], loading: true, symbols: [],
  addSymbol:      async () => ({ ok: false }),
  removeSymbol:   async () => {},
  toggleFavorite: async () => {},
  refresh:        async () => {},
});

export function useWatchlist() {
  return useContext(WatchlistContext);
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [items,   setItems]   = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const seeding   = useRef(false);

  // Ref so callbacks stay stable without depending on items
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist");
      if (!res.ok) return;
      const rows = await res.json() as RawRow[];

      if (rows.length === 0 && !seeding.current) {
        seeding.current = true;
        await Promise.all(
          DEFAULT_SYMBOLS.map(sym =>
            fetch("/api/watchlist", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ symbol: sym, isFavorite: false }),
            })
          )
        );
        const r2    = await fetch("/api/watchlist");
        const rows2 = await r2.json() as RawRow[];
        setItems(rows2.map(toEntry));
        seeding.current = false;
      } else {
        setItems(rows.map(toEntry));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => { load(); }, 1500);
    return () => clearTimeout(id);
  }, [load]);

  /**
   * Optimistic add: inserts a temp entry immediately so the UI reflects the
   * change in the same frame as the tap. The API call runs in the background;
   * on success the temp entry is replaced with the real one, on failure it is
   * removed (rollback).
   */
  const addSymbol = useCallback(async (
    symbol: string,
    isFavorite = false,
    tapAt?: number,
  ) => {
    const sym    = symbol.toUpperCase();
    const tempId = -(Date.now());          // negative → clearly a temp entry
    const meta   = deriveMeta(sym);
    const tempEntry: WatchlistEntry = {
      id: tempId, symbol: sym, provider: "pending",
      position: itemsRef.current.length,
      isFavorite, createdAt: new Date().toISOString(), ...meta,
    };

    // ── Optimistic update — fires synchronously before the await ─────────────
    setItems(prev => {
      if (prev.some(i => i.symbol === sym)) return prev;   // already present
      return [...prev, tempEntry];
    });

    // ── Background: persist to DB ─────────────────────────────────────────────
    try {
      const res = await fetch("/api/watchlist", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ symbol: sym, isFavorite }),
      });
      if (res.ok) {
        const item = await res.json() as RawRow;
        setItems(prev => prev.map(i => i.id === tempId ? toEntry(item) : i));
        if (tapAt !== undefined) recordDb(tapAt, true);
        return { ok: true };
      }
      // Rollback
      setItems(prev => prev.filter(i => i.id !== tempId));
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (tapAt !== undefined) recordDb(tapAt, false);
      return { ok: false, error: data.error ?? "Failed to add symbol" };
    } catch {
      setItems(prev => prev.filter(i => i.id !== tempId));
      if (tapAt !== undefined) recordDb(tapAt, false);
      return { ok: false, error: "Network error" };
    }
  }, []);   // stable — no deps

  const removeSymbol = useCallback(async (id: number) => {
    const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setItems(prev => prev.filter(i => i.id !== id));
    }
  }, []);

  /**
   * Optimistic toggle: flips isFavorite immediately so the star responds
   * in the same frame as the tap, then confirms with the API. Rolls back
   * if the request fails.
   */
  const toggleFavorite = useCallback(async (
    id: number,
    current: boolean,
    tapAt?: number,
  ) => {
    // ── Optimistic flip ───────────────────────────────────────────────────────
    setItems(prev => prev.map(i => i.id === id ? { ...i, isFavorite: !current } : i));

    // ── Background: confirm with DB ───────────────────────────────────────────
    const res = await fetch(`/api/watchlist/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ isFavorite: !current }),
    });
    if (tapAt !== undefined) recordDb(tapAt, res.ok);
    if (!res.ok) {
      // Rollback
      setItems(prev => prev.map(i => i.id === id ? { ...i, isFavorite: current } : i));
    }
  }, []);   // stable — no deps

  const symbols = items.map(i => i.symbol);

  return (
    <WatchlistContext.Provider value={{
      items, loading, symbols,
      addSymbol, removeSymbol, toggleFavorite, refresh: load,
    }}>
      {children}
    </WatchlistContext.Provider>
  );
}
