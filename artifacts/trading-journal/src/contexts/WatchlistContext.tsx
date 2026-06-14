import {
  createContext, useContext, useEffect, useState,
  useCallback, useRef, type ReactNode,
} from "react";

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
  NAS100:  { tv: "OANDA:NAS100USD",  label: "NAS100",   badge: "NAS",  market: "Indices" },
  US30:    { tv: "OANDA:US30USD",    label: "US30",     badge: "DJI",  market: "Indices" },
  SPX500:  { tv: "OANDA:SPX500USD",  label: "S&P 500",  badge: "SPX",  market: "Indices" },
  DE40:    { tv: "OANDA:DE30EUR",    label: "DAX 40",   badge: "DAX",  market: "Indices" },
  XAUUSD:  { tv: "OANDA:XAUUSD",     label: "XAU/USD",  badge: "GOLD", market: "Commodities" },
  XAGUSD:  { tv: "OANDA:XAGUSD",     label: "XAG/USD",  badge: "SILV", market: "Commodities" },
  USOIL:   { tv: "TVC:USOIL",        label: "US Oil",   badge: "OIL",  market: "Commodities" },
  UKOIL:   { tv: "TVC:UKOIL",        label: "UK Oil",   badge: "BRENT",market: "Commodities" },
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
  // Use curated catalog first
  const catalogEntry = SYMBOL_CATALOG[s];
  if (catalogEntry) return catalogEntry;

  // Derive dynamically for symbols not in the curated catalog
  let market: string = "Other";
  let badge  = s.slice(0, 4);
  let label  = s;

  // Crypto: xyzUSDT or xyzUSD patterns
  if (/^[A-Z0-9]{2,12}USDT$/.test(s)) {
    const base = s.replace("USDT", "");
    market = "Crypto";
    badge  = base.slice(0, 5);
    label  = `${base}/USDT`;
  } else if (/^[A-Z0-9]{2,8}USD$/.test(s)) {
    const base = s.replace("USD", "");
    if (!["EUR","GBP","AUD","NZD","CAD","CHF","XAU","XAG"].includes(base)) {
      market = "Crypto";
      badge  = base.slice(0, 5);
      label  = `${base}/USD`;
    }
  }

  // Standard 6-letter forex
  if (market === "Other" && /^[A-Z]{6}$/.test(s)) {
    market = "Forex";
    badge  = s.slice(0, 3);
    label  = `${s.slice(0,3)}/${s.slice(3)}`;
  }

  // Metals
  if (["XAUUSD","XAGUSD","XPTUSD","XPDUSD"].includes(s)) {
    market = "Commodities";
    badge  = s.slice(0, 3);
    label  = s;
  }

  // Index patterns
  if (/^(US30|NAS|SPX|GER|UK1|JP2|AUS|DOW|DAX|CAC|FTSE|IBEX|DE4|FR4|IT4|ES3)/.test(s)) {
    market = "Indices";
    badge  = s.slice(0, 4);
    label  = s;
  }

  // Commodity patterns
  if (/^(OIL|GAS|WTI|BRENT|NGAS|USOIL|UKOIL|COPP|WHEAT|CORN|SUGAR|COFFEE)/.test(s)) {
    market = "Commodities";
    badge  = s.slice(0, 4);
    label  = s;
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
  addSymbol:      (symbol: string, isFavorite?: boolean) => Promise<{ ok: boolean; error?: string }>;
  removeSymbol:   (id: number) => Promise<void>;
  toggleFavorite: (id: number, current: boolean) => Promise<void>;
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
  const seeding = useRef(false);

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
        const r2   = await fetch("/api/watchlist");
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

  useEffect(() => { load(); }, [load]);

  const addSymbol = useCallback(async (symbol: string, isFavorite = false) => {
    const res = await fetch("/api/watchlist", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ symbol: symbol.toUpperCase(), isFavorite }),
    });
    if (res.ok) {
      const item = await res.json() as RawRow;
      setItems(prev => [...prev, toEntry(item)]);
      return { ok: true };
    }
    const data = await res.json().catch(() => ({})) as { error?: string };
    return { ok: false, error: data.error ?? "Failed to add symbol" };
  }, []);

  const removeSymbol = useCallback(async (id: number) => {
    const res = await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setItems(prev => prev.filter(i => i.id !== id));
    }
  }, []);

  const toggleFavorite = useCallback(async (id: number, current: boolean) => {
    const res = await fetch(`/api/watchlist/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ isFavorite: !current }),
    });
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, isFavorite: !current } : i));
    }
  }, []);

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
