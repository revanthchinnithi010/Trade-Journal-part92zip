export type AssetClass = "crypto" | "forex" | "metal" | "index" | "commodity" | "unknown";
export type DataProvider = "delta" | "ctrader" | "unknown";

const METALS      = new Set(["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD"]);
const INDICES     = new Set(["US30", "NAS100", "SPX500", "GER40", "UK100", "JP225", "AUS200", "STOXX50", "HK50", "CN50"]);
const COMMODITIES = new Set(["USOIL", "UKOIL", "NGAS", "COPPER", "WHEAT", "CORN", "SUGAR", "COFFEE"]);
const FOREX_PAIRS = new Set([
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF",
  "EURGBP", "GBPJPY", "EURJPY", "EURAUD", "GBPAUD", "NZDUSD",
  "USDSGD", "USDHKD", "USDMXN", "USDZAR", "USDNOK", "USDSEK",
  "AUDCAD", "AUDCHF", "AUDNZD", "CADCHF", "CADJPY", "CHFJPY",
  "EURNZD", "EURCAD", "EURCHF", "GBPCAD", "GBPCHF", "GBPNZD",
  "NZDCAD", "NZDCHF", "NZDJPY",
]);

const CTRADER_SYMBOLS = new Set([
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF",
  "EURGBP", "GBPJPY", "EURJPY",
  "XAUUSD", "XAGUSD",
  "US30", "NAS100", "SPX500", "GER40", "UK100",
  "USOIL", "UKOIL",
]);

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
  return "unknown";
}

export function getDataProvider(symbol: string): DataProvider {
  const s = symbol.toUpperCase();
  if (CTRADER_SYMBOLS.has(s))         return "ctrader";
  if (/^[A-Z0-9]+USDT$/.test(s))      return "delta";
  if (/^[A-Z0-9]{2,8}USD$/.test(s) && !FOREX_PAIRS.has(s) && !METALS.has(s)) return "delta";
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
