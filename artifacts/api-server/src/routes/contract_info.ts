import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";

const DELTA_INDIA_REST = "https://api.india.delta.exchange";
const CACHE_TTL_MS = 5 * 60 * 1_000;

interface RawDeltaProduct {
  symbol:                  string;
  description?:            string;
  short_description?:      string;
  contract_type:           string;
  trading_status:          string;
  contract_value?:         string | number | null;
  contract_unit_currency?: string;
  initial_margin?:         string | number;
  maintenance_margin?:     string | number;
  default_leverage?:       string | number;
  underlying_asset?:       { symbol: string };
  settling_asset?:         { symbol: string };
  spot_index?:             { symbol: string };
  position_size_limit?:    number | null;
}

export interface ContractInfo {
  symbol:             string;
  type:               string;
  lotSize:            string;
  settlementCurrency: string;
  initialMargin:      string;
  maintenanceMargin:  string;
  maxLeverage:        string;
  underlyingIndex:    string;
  positionLimit:      string;
  status:             string;
}

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  perpetual_futures: "Linear Perpetual",
  futures:           "Linear Future",
  call_options:      "Call Option",
  put_options:       "Put Option",
  spot:              "Spot",
};

function toMarginPct(v: string | number | undefined): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n) || n === 0) return "—";
  return `${n}%`;
}

function formatProduct(p: RawDeltaProduct): ContractInfo {
  const underlying = p.underlying_asset?.symbol ?? p.symbol.replace(/USD.*$/, "");
  const settling   = p.settling_asset?.symbol ?? "USD";
  const unit       = p.contract_unit_currency ?? underlying;

  const contractVal = parseFloat(String(p.contract_value ?? "1"));
  const lotSize = !isNaN(contractVal) && contractVal > 0
    ? `${contractVal} ${unit}`
    : `1 ${unit}`;

  const defLev = parseFloat(String(p.default_leverage ?? "0"));
  const maxLeverage = !isNaN(defLev) && defLev > 0
    ? `${Math.round(defLev)}x`
    : (() => {
        const im = parseFloat(String(p.initial_margin ?? "0"));
        return (!isNaN(im) && im > 0) ? `${Math.round(100 / im)}x` : "—";
      })();

  const posLimit = (() => {
    const posLimitContracts = p.position_size_limit;
    if (!posLimitContracts) return "—";
    const cv = parseFloat(String(p.contract_value ?? "0"));
    if (!isNaN(cv) && cv > 0) {
      const totalUnits = posLimitContracts * cv;
      return `${totalUnits} ${unit}`;
    }
    return `${posLimitContracts} contracts`;
  })();

  const underlyingIndex = p.spot_index?.symbol
    ?? `.DEX${underlying}${settling}`;

  return {
    symbol:             p.symbol,
    type:               CONTRACT_TYPE_LABELS[p.contract_type] ?? p.contract_type ?? "—",
    lotSize,
    settlementCurrency: settling,
    initialMargin:      toMarginPct(p.initial_margin),
    maintenanceMargin:  toMarginPct(p.maintenance_margin),
    maxLeverage,
    underlyingIndex,
    positionLimit:      posLimit,
    status:             p.trading_status === "operational" ? "Operational" : (p.trading_status ?? "—"),
  };
}

const cache = new Map<string, { data: ContractInfo; fetchedAt: number }>();

export function createContractInfoRouter(): IRouter {
  const router = Router();

  router.get("/contract-info/:symbol", async (req, res): Promise<void> => {
    const symbol = (req.params["symbol"] ?? "").toUpperCase();
    if (!symbol) {
      res.status(400).json({ error: "Symbol is required" });
      return;
    }

    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(cached.data);
      return;
    }

    try {
      const url = `${DELTA_INDIA_REST}/v2/products?states=live`;
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json", "User-Agent": "TradeVault/1.0" },
      });
      if (!resp.ok) throw new Error(`Delta API HTTP ${resp.status}`);

      const body = await resp.json() as { result?: RawDeltaProduct[] };
      const products: RawDeltaProduct[] = Array.isArray(body.result) ? body.result : [];
      const product = products.find(p => p.symbol === symbol);

      if (!product) {
        res.status(404).json({ error: `No contract found for ${symbol}` });
        return;
      }

      const info = formatProduct(product);
      cache.set(symbol, { data: info, fetchedAt: Date.now() });
      logger.info({ symbol }, "contract-info: fetched from Delta Exchange");

      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, symbol }, "contract-info: fetch failed");
      if (cached) {
        res.json(cached.data);
        return;
      }
      res.status(502).json({ error: `Failed to fetch contract info: ${msg}` });
    }
  });

  return router;
}
