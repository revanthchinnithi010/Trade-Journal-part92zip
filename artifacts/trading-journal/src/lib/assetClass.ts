export type AssetClass = "crypto" | "forex" | "metal" | "index" | "commodity" | "unknown";
export type DataProvider = "delta" | "ctrader" | "unknown";

// ── Pattern-based asset classification ────────────────────────────────────────
// These sets cover well-known symbols and are used as a fast path.
// They do NOT gate routing — routing comes entirely from the live server.

const METALS      = new Set(["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD"]);
const INDICES     = new Set([
  "US30", "NAS100", "SPX500", "GER40", "UK100", "JP225", "AUS200", "STOXX50",
  "HK50", "CN50", "USTECH", "USTEC", "US500", "US2000", "EU50",
  "DE40", "FR40", "IT40", "ES35", "CH20", "NETH25", "SE30",
]);
const COMMODITIES = new Set([
  "USOIL", "UKOIL", "NGAS", "COPPER", "WHEAT", "CORN", "SUGAR", "COFFEE",
  "COCOA", "COTTON", "SOYBEANS", "LUMBER",
]);
const FOREX_PAIRS = new Set([
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF",
  "EURGBP", "GBPJPY", "EURJPY", "EURAUD", "GBPAUD", "NZDUSD",
  "USDSGD", "USDHKD", "USDMXN", "USDZAR", "USDNOK", "USDSEK",
  "AUDCAD", "AUDCHF", "AUDNZD", "CADCHF", "CADJPY", "CHFJPY",
  "EURNZD", "EURCAD", "EURCHF", "GBPCAD", "GBPCHF", "GBPNZD",
  "NZDCAD", "NZDCHF", "NZDJPY",
]);

// ── Runtime routing map ───────────────────────────────────────────────────────
// Updated from /api/feed/diagnostics (symbolRouting) on every diagnostics poll.
// Keys are uppercase symbol names, values are "delta" | "ctrader" | "finnhub".
let runtimeRouting: Record<string, string> = {};

/**
 * Called by FeedDiagnostics (and any other component that polls diagnostics)
 * to keep the module-level routing cache in sync with the live server routing.
 */
export function updateSymbolProviderRouting(routing: Record<string, string>): void {
  runtimeRouting = routing;
}

export function getAssetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase().replace(/\.(pro|raw|ecn|std)$/i, "");
  if (METALS.has(s))      return "metal";
  if (INDICES.has(s))     return "index";
  if (COMMODITIES.has(s)) return "commodity";
  if (FOREX_PAIRS.has(s)) return "forex";
  // Crypto: USDT-quoted perpetuals from Delta Exchange India
  if (/^[A-Z0-9]{2,12}USDT$/.test(s)) return "crypto";
  // Legacy USD-suffix crypto (BTCUSD, ETHUSD etc.)
  if (/^[A-Z0-9]{2,8}USD$/.test(s) && !FOREX_PAIRS.has(s) && !METALS.has(s)) return "crypto";
  // cTrader 6-letter forex pairs not in our set
  if (/^[A-Z]{6}$/.test(s) && runtimeRouting[s] === "ctrader") return "forex";
  // Index-like names from cTrader
  if (runtimeRouting[s] === "ctrader" && !FOREX_PAIRS.has(s) && !METALS.has(s)) {
    const ct = _guessCTraderClass(s);
    if (ct !== "unknown") return ct;
  }
  return "unknown";
}

function _guessCTraderClass(s: string): AssetClass {
  if (/^(US30|NAS|SPX|GER|UK1|JP2|AUS|DOW|DAX|CAC|FTSE|IBEX|HAN|SMI|OMX|BEL|EU5|IT4|FR4|ES3|CH2|SE3|DE4|NETH)/.test(s)) return "index";
  if (/^(OIL|GAS|WTI|BRENT|NGAS|COPP|WHEAT|CORN|SUGAR|COFFEE|COCOA|COTTON)/.test(s)) return "commodity";
  if (/^[A-Z]{6}$/.test(s)) return "forex";
  return "unknown";
}

export function getDataProvider(symbol: string): DataProvider {
  const s = symbol.toUpperCase();

  // 1. Check live server routing (most authoritative)
  const live = runtimeRouting[s];
  if (live === "delta")   return "delta";
  if (live === "ctrader") return "ctrader";

  // 2. Pattern-based fallback
  if (/^[A-Z0-9]+USDT$/.test(s))      return "delta";
  if (/^[A-Z0-9]{2,8}USD$/.test(s) && !FOREX_PAIRS.has(s) && !METALS.has(s)) return "delta";
  if (FOREX_PAIRS.has(s) || METALS.has(s) || INDICES.has(s) || COMMODITIES.has(s)) return "ctrader";

  return "unknown";
}

export function getAssetClassLabel(cls: AssetClass): string {
  switch (cls) {
    case "crypto":    return "Crypto";
    case "forex":     return "Forex";
    case "metal":     return "Metal";
    case "index":     return "Index";
    case "commodity": return "Commodity";
    default:          return "Unknown";
  }
}

export function getProviderLabel(provider: DataProvider): string {
  switch (provider) {
    case "delta":   return "Delta Exchange";
    case "ctrader": return "Fusion Markets";
    default:        return "Unknown";
  }
}

export function getProviderFullLabel(provider: DataProvider): string {
  switch (provider) {
    case "delta":   return "Delta Exchange India";
    case "ctrader": return "Fusion Markets · cTrader Open API";
    default:        return "Unknown";
  }
}
