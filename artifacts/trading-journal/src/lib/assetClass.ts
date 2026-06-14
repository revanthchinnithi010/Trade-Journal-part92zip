export type AssetClass = "crypto" | "forex" | "metal" | "index" | "commodity" | "unknown";
export type DataProvider = "delta" | "ctrader" | "unknown";

// ── Static classification sets ────────────────────────────────────────────────
// Used as a fast path for well-known symbols.
// These do NOT gate routing — provider priority is determined by asset class.

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
  "EURUSD","GBPUSD","USDJPY","AUDUSD","USDCAD","USDCHF",
  "EURGBP","GBPJPY","EURJPY","EURAUD","GBPAUD","NZDUSD",
  "USDSGD","USDHKD","USDMXN","USDZAR","USDNOK","USDSEK",
  "AUDCAD","AUDCHF","AUDNZD","CADCHF","CADJPY","CHFJPY",
  "EURNZD","EURCAD","EURCHF","GBPCAD","GBPCHF","GBPNZD",
  "NZDCAD","NZDCHF","NZDJPY",
]);

// ── Runtime routing state (updated from /api/feed/diagnostics) ────────────────
// Used only as a fallback — priority rules derived from asset class take precedence.
let runtimeRouting: Record<string, string>       = {};
let runtimeClasses: Record<string, string>       = {};
let runtimeReasons: Record<string, string>       = {};

/**
 * Called by FeedDiagnostics every time it polls /api/feed/diagnostics.
 * Keeps the module-level cache in sync for components that call getDataProvider()
 * before the diagnostics fetch completes, and for unknown-class symbols.
 */
export function updateSymbolProviderRouting(
  routing: Record<string, string>,
  classes?: Record<string, string>,
  reasons?: Record<string, string>,
): void {
  runtimeRouting = routing;
  if (classes) runtimeClasses = classes;
  if (reasons) runtimeReasons = reasons;
}

// ── Classification ─────────────────────────────────────────────────────────────

export function getAssetClass(symbol: string): AssetClass {
  const s = symbol.toUpperCase().replace(/\.(pro|raw|ecn|std)$/i, "");

  // Server-side classification (already done) — prefer it for unknown patterns
  const serverClass = runtimeClasses[s] as AssetClass | undefined;

  if (METALS.has(s))      return "metal";
  if (INDICES.has(s))     return "index";
  if (COMMODITIES.has(s)) return "commodity";
  if (FOREX_PAIRS.has(s)) return "forex";
  if (/^[A-Z0-9]{2,12}USDT$/.test(s)) return "crypto";
  if (/^[A-Z0-9]{2,8}USD$/.test(s) && !FOREX_PAIRS.has(s) && !METALS.has(s)) return "crypto";
  // Any 6-letter alphabetic pair → forex (cTrader standard)
  if (/^[A-Z]{6}$/.test(s)) return "forex";
  // Index-like names from cTrader
  if (/^(US30|NAS|SPX|GER|UK1|JP2|AUS|DOW|DAX|CAC|FTSE|IBEX|DE4|FR4|IT4|ES3|EU5|CH2|SE3|NETH)/.test(s)) return "index";
  // Commodity patterns
  if (/^(OIL|GAS|WTI|BRENT|NGAS|USOIL|UKOIL|COPP|WHEAT|CORN|SUGAR|COFFEE|COCOA|COTTON)/.test(s)) return "commodity";

  return serverClass ?? "unknown";
}

// ── Provider priority (mirrors server-side priorityProviderFor()) ─────────────
/**
 * Deterministic provider selection based solely on asset class:
 *
 *   crypto              → Delta Exchange  (best liquidity, correct price source)
 *   forex / metal /
 *   index / commodity   → Fusion Markets (cTrader)
 *   unknown             → check runtime routing, then fall back to "unknown"
 *
 * A symbol ALWAYS routes to the same provider regardless of which providers
 * happen to have it in their catalog.  Duplicate presence is ignored.
 */
export function getDataProvider(symbol: string): DataProvider {
  const cls = getAssetClass(symbol);

  // Priority rules are class-driven — no ambiguity
  if (cls === "crypto")    return "delta";
  if (cls === "forex")     return "ctrader";
  if (cls === "metal")     return "ctrader";
  if (cls === "index")     return "ctrader";
  if (cls === "commodity") return "ctrader";

  // Unknown class — check server-side routing as fallback
  const s    = symbol.toUpperCase();
  const live = runtimeRouting[s];
  if (live === "delta")   return "delta";
  if (live === "ctrader") return "ctrader";

  return "unknown";
}

/**
 * Returns the human-readable reason this symbol is routed to its provider.
 * Uses the server-side reason when available; falls back to a client-derived one.
 */
export function getRoutingReason(symbol: string): string {
  const s = symbol.toUpperCase();

  // Prefer the server-generated reason (most accurate)
  const serverReason = runtimeReasons[s];
  if (serverReason) return serverReason;

  // Derive locally from asset class
  const cls = getAssetClass(s);
  switch (cls) {
    case "crypto":    return "Crypto symbols always use Delta Exchange";
    case "forex":     return "Forex symbols always use Fusion Markets";
    case "metal":     return "Metals always use Fusion Markets";
    case "index":     return "Indices always use Fusion Markets";
    case "commodity": return "Commodities always use Fusion Markets";
    default:          return "Unknown — no provider matched";
  }
}

// ── Labels ────────────────────────────────────────────────────────────────────

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
