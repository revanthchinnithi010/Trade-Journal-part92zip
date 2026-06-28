import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { pool } from "@workspace/db";
import { decrypt } from "../services/BrokerEncryption.js";
import { fetchSingleSymbolSpec } from "../lib/ctraderProtoOA.js";

const DELTA_INDIA_REST = "https://api.india.delta.exchange";
const CACHE_TTL_MS     = 5  * 60 * 1_000;
const SPEC_CACHE_TTL   = 10 * 60 * 1_000;

interface RawDeltaProduct {
  symbol:                  string;
  description?:            string;
  short_description?:      string;
  contract_type:           string;
  trading_status:          string;
  contract_value?:         string | number | null;
  contract_unit_currency?: string;
  tick_size?:              string | number | null;
  initial_margin?:         string | number;
  maintenance_margin?:     string | number;
  default_leverage?:       string | number;
  max_leverage?:           string | number;
  underlying_asset?:       { symbol: string };
  settling_asset?:         { symbol: string };
  spot_index?:             { symbol: string };
  position_size_limit?:    number | null;
}

interface RawTicker {
  symbol:        string;
  mark_price?:   string | number;
  spot_price?:   string | number;
  turnover_usd?: string | number;
  oi_value_usd?: string | number;
  funding_rate?: string | number;
}

export interface ContractInfo {
  symbol:             string;
  description:        string;
  type:               string;
  lotSize:            string;
  lotSizeNum:         number;
  tickSize:           string;
  settlementCurrency: string;
  initialMargin:      string;
  maintenanceMargin:  string;
  maxLeverage:        string;
  maxLeverageNum:     number;
  underlyingIndex:    string;
  positionLimit:      string;
  status:             string;
}

export interface ContractField {
  label:     string;
  value:     string;
  highlight?: boolean;
}

export interface BrokerContractSpec {
  broker:            "delta" | "ctrader";
  symbol:            string;
  fetchedAt:         number;
  description:       string;
  maxLeverageNum:    number;
  lotSizeNum:        number;
  settlementCurrency: string;
  partial?:          boolean;
  fields:            ContractField[];
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
  const lotSizeNum  = !isNaN(contractVal) && contractVal > 0 ? contractVal : 1;
  const lotSize     = `${lotSizeNum} ${unit}`;

  const tickVal  = parseFloat(String(p.tick_size ?? "0"));
  const tickSize = !isNaN(tickVal) && tickVal > 0 ? String(tickVal) : "—";

  const rawMaxLev = parseFloat(String(p.max_leverage  ?? "0"));
  const rawDefLev = parseFloat(String(p.default_leverage ?? "0"));
  const rawIM     = parseFloat(String(p.initial_margin ?? "0"));

  let maxLeverageNum = 0;
  if (!isNaN(rawMaxLev) && rawMaxLev > 0) {
    maxLeverageNum = Math.round(rawMaxLev);
  } else if (!isNaN(rawIM) && rawIM > 0) {
    maxLeverageNum = Math.round(100 / rawIM);
  } else if (!isNaN(rawDefLev) && rawDefLev > 0) {
    maxLeverageNum = Math.round(rawDefLev);
  }
  const maxLeverage = maxLeverageNum > 0 ? `${maxLeverageNum}x` : "—";

  const posLimit = (() => {
    const posLimitContracts = p.position_size_limit;
    if (!posLimitContracts) return "—";
    const cv = parseFloat(String(p.contract_value ?? "0"));
    if (!isNaN(cv) && cv > 0) return `${posLimitContracts * cv} ${unit}`;
    return `${posLimitContracts} contracts`;
  })();

  const underlyingIndex = p.spot_index?.symbol ?? `.DEX${underlying}${settling}`;

  const contractTypeLabel = CONTRACT_TYPE_LABELS[p.contract_type] ?? p.contract_type ?? "";
  const description = p.short_description
    ?? p.description
    ?? (`${underlying} ${contractTypeLabel}`.trim() || p.symbol);

  return {
    symbol:             p.symbol,
    description,
    type:               CONTRACT_TYPE_LABELS[p.contract_type] ?? p.contract_type ?? "—",
    lotSize,
    lotSizeNum,
    tickSize,
    settlementCurrency: settling,
    initialMargin:      toMarginPct(p.initial_margin),
    maintenanceMargin:  toMarginPct(p.maintenance_margin),
    maxLeverage,
    maxLeverageNum,
    underlyingIndex,
    positionLimit:      posLimit,
    status:             p.trading_status === "operational" ? "Operational" : (p.trading_status ?? "—"),
  };
}

const cache     = new Map<string, { data: ContractInfo;       fetchedAt: number }>();
const specCache = new Map<string, { data: BrokerContractSpec; fetchedAt: number }>();

// ── Helpers shared by Delta spec builder ──────────────────────────────────────

function fmtDeltaPrice(v: unknown): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n) || n === 0) return "—";
  if (n >= 10_000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (n >= 1_000)  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (n >= 1)      return n.toFixed(4);
  return n.toPrecision(4);
}

function fmtFunding(v: unknown): string {
  const n = parseFloat(String(v ?? "0"));
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(4)}%`;
}

function nextFundingCountdown(): string {
  const now        = new Date();
  const currMins   = now.getUTCHours() * 60 + now.getUTCMinutes();
  const dayMins    = 24 * 60;
  const funding    = [0, 8 * 60, 16 * 60]; // 00:00, 08:00, 16:00 UTC
  const remaining  = Math.min(
    ...funding.map(fm => ((fm - currMins + dayMins) % dayMins) || dayMins),
  );
  const h = Math.floor(remaining / 60);
  const m = remaining % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Delta spec builder ────────────────────────────────────────────────────────

async function buildDeltaSpec(symbol: string): Promise<BrokerContractSpec> {
  const [prodRes, tickRes] = await Promise.allSettled([
    fetch(`${DELTA_INDIA_REST}/v2/products?states=live`, {
      signal:  AbortSignal.timeout(10_000),
      headers: { Accept: "application/json", "User-Agent": "TradeVault/1.0" },
    }),
    fetch(`${DELTA_INDIA_REST}/v2/tickers`, {
      signal:  AbortSignal.timeout(8_000),
      headers: { Accept: "application/json", "User-Agent": "TradeVault/1.0" },
    }),
  ]);

  let product: RawDeltaProduct | undefined;
  if (prodRes.status === "fulfilled" && prodRes.value.ok) {
    const body = await prodRes.value.json() as { result?: RawDeltaProduct[] };
    product = (body.result ?? []).find(p => p.symbol === symbol);
    if (product) cache.set(symbol, { data: formatProduct(product), fetchedAt: Date.now() });
  }
  if (!product) {
    const stale = cache.get(symbol);
    if (stale) product = stale.data as unknown as RawDeltaProduct;
    else throw new Error(`Delta: product not found for ${symbol}`);
  }

  const info = formatProduct(product);

  const liveFields: ContractField[] = [];
  if (tickRes.status === "fulfilled" && tickRes.value.ok) {
    const tbody = await tickRes.value.json() as { result?: RawTicker[] };
    const r = (tbody.result ?? []).find(t => t.symbol === symbol);
    if (r) {
      const mark    = fmtDeltaPrice(r.mark_price);
      const index   = fmtDeltaPrice(r.spot_price);
      const funding = fmtFunding(r.funding_rate);
      if (mark    !== "—") liveFields.push({ label: "Mark Price",        value: mark });
      if (index   !== "—") liveFields.push({ label: "Index Price",       value: index });
      if (funding !== "—") {
        liveFields.push({ label: "Funding Rate (8h)", value: funding });
        liveFields.push({ label: "Next Funding In",   value: nextFundingCountdown() });
      }
    }
  }

  const fields: ContractField[] = [
    { label: "Contract Type",       value: info.type },
    { label: "Description",         value: info.description },
    { label: "Lot Size",            value: info.lotSize },
    { label: "Tick Size",           value: info.tickSize },
    { label: "Settlement Currency", value: info.settlementCurrency },
    { label: "Initial Margin",      value: info.initialMargin },
    { label: "Maintenance Margin",  value: info.maintenanceMargin },
    { label: "Max Leverage",        value: info.maxLeverage },
    { label: "Underlying Index",    value: info.underlyingIndex },
    { label: "Position Limit",      value: info.positionLimit },
    { label: "Trading Status",      value: info.status, highlight: info.status === "Operational" },
    ...liveFields,
  ].filter(f => f.value && f.value !== "—");

  return {
    broker:             "delta",
    symbol,
    fetchedAt:          Date.now(),
    description:        info.description,
    maxLeverageNum:     info.maxLeverageNum,
    lotSizeNum:         info.lotSizeNum,
    settlementCurrency: info.settlementCurrency,
    fields,
  };
}

// ── cTrader spec builder ──────────────────────────────────────────────────────

async function buildCtraderSpec(symbol: string): Promise<BrokerContractSpec> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ctrader_symbols (
      symbol_id   INT, symbol_name TEXT, description TEXT,
      pip_position INT, digits INT, fetched_at TIMESTAMPTZ DEFAULT NOW()
    )`);

  const symRow = await pool.query<{
    symbol_id: number; symbol_name: string; description: string;
    pip_position: number; digits: number;
  }>(
    "SELECT symbol_id, symbol_name, description, pip_position, digits FROM ctrader_symbols WHERE UPPER(symbol_name) = $1 LIMIT 1",
    [symbol.toUpperCase()],
  );

  if (!symRow.rows.length) {
    // No cTrader account connected or symbol not synced yet — return a minimal placeholder
    return {
      broker: "ctrader",
      symbol,
      fetchedAt: Date.now(),
      description: symbol,
      maxLeverageNum: 0,
      lotSizeNum: 0.01,
      settlementCurrency: "USD",
      partial: true,
      fields: [
        { label: "Symbol", value: symbol },
        { label: "Status", value: "Connect a cTrader account to load contract details" },
      ],
    };
  }

  const db   = symRow.rows[0];
  const desc = db.description || db.symbol_name;

  const baseFields: ContractField[] = [
    { label: "Symbol",       value: db.symbol_name },
    { label: "Description",  value: desc },
    { label: "Digits",       value: String(db.digits) },
    { label: "Pip Position", value: String(db.pip_position) },
  ];

  const extFields: ContractField[] = [];
  let maxLeverageNum = 0;
  let lotSizeNum     = 0.01;

  try {
    const [tokRow, cfgRow] = await Promise.all([
      pool.query<{ access_token_enc: string }>(
        "SELECT access_token_enc FROM ctrader_tokens ORDER BY id DESC LIMIT 1",
      ),
      pool.query<{ account_id: number; is_live: boolean }>(
        "SELECT account_id, is_live FROM ctrader_spot_config WHERE id=1",
      ),
    ]);

    if (!tokRow.rows.length || !cfgRow.rows.length) {
      throw new Error("cTrader credentials not configured");
    }

    const accessToken = decrypt(tokRow.rows[0].access_token_enc);
    if (!accessToken) throw new Error("cTrader token decrypt failed");

    const cfg          = cfgRow.rows[0];
    const clientId     = process.env["CTRADER_CLIENT_ID"];
    const clientSecret = process.env["CTRADER_CLIENT_SECRET"];
    if (!clientId || !clientSecret) throw new Error("CTRADER_CLIENT_ID/SECRET not set");

    const spec = await fetchSingleSymbolSpec({
      ctidTraderAccountId: cfg.account_id,
      isLive:              Boolean(cfg.is_live),
      accessToken,
      clientId,
      clientSecret,
      symbolId: db.symbol_id,
    });

    const TRADE_MODES: Record<number, string> = { 0: "Enabled", 1: "Disabled", 2: "Close Only" };
    const SWAP_TYPES:  Record<number, string>  = { 0: "Points / Day", 1: "% / Year" };

    if (spec.minVolume !== null) {
      lotSizeNum = spec.minVolume / 100;
      extFields.push({ label: "Min Volume",  value: `${lotSizeNum} lot${lotSizeNum !== 1 ? "s" : ""}` });
    }
    if (spec.maxVolume  !== null) extFields.push({ label: "Max Volume",  value: `${spec.maxVolume  / 100} lots` });
    if (spec.stepVolume !== null) extFields.push({ label: "Volume Step", value: `${spec.stepVolume / 100} lots` });

    if (spec.initialMarginPct !== null && spec.initialMarginPct > 0) {
      maxLeverageNum = Math.round(100 / spec.initialMarginPct);
      extFields.push({ label: "Initial Margin",  value: `${spec.initialMarginPct.toFixed(2)}%` });
      extFields.push({ label: "Max Leverage",    value: `${maxLeverageNum}x` });
    }
    if (spec.maintenancePct !== null && spec.maintenancePct > 0) {
      extFields.push({ label: "Maintenance Margin", value: `${spec.maintenancePct.toFixed(2)}%` });
    }
    if (spec.tradeMode !== null) {
      extFields.push({
        label:     "Trade Mode",
        value:     TRADE_MODES[spec.tradeMode] ?? String(spec.tradeMode),
        highlight: spec.tradeMode === 0,
      });
    }
    if (spec.swapType !== null) {
      extFields.push({ label: "Swap Type", value: SWAP_TYPES[spec.swapType] ?? String(spec.swapType) });
    }
    if (spec.scheduleTimeZone) {
      extFields.push({ label: "Timezone", value: spec.scheduleTimeZone });
    }
    if (spec.description && spec.description !== db.symbol_name) {
      baseFields[1] = { label: "Description", value: spec.description };
    }

    logger.info({ symbol, maxLeverageNum, lotSizeNum, extCount: extFields.length }, "contract-spec/ctrader: ProtoOA ✓");
  } catch (err) {
    logger.warn({ symbol, err: String(err) }, "contract-spec/ctrader: ProtoOA fetch skipped, using DB only");
  }

  return {
    broker:             "ctrader",
    symbol,
    fetchedAt:          Date.now(),
    description:        desc,
    maxLeverageNum,
    lotSizeNum,
    settlementCurrency: "USD",
    partial:            extFields.length === 0,
    fields:             [...baseFields, ...extFields].filter(f => f.value && f.value !== "—"),
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createContractInfoRouter(): IRouter {
  const router = Router();

  // ── Legacy Delta-only endpoint (kept for backwards compat) ─────────────────
  router.get("/contract-info/:symbol", async (req, res): Promise<void> => {
    const symbol = (req.params["symbol"] ?? "").toUpperCase();
    if (!symbol) { res.status(400).json({ error: "Symbol is required" }); return; }

    const cached = cache.get(symbol);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(cached.data);
      return;
    }

    try {
      const url  = `${DELTA_INDIA_REST}/v2/products?states=live`;
      const resp = await fetch(url, {
        signal:  AbortSignal.timeout(10_000),
        headers: { Accept: "application/json", "User-Agent": "TradeVault/1.0" },
      });
      if (!resp.ok) throw new Error(`Delta API HTTP ${resp.status}`);

      const body     = await resp.json() as { result?: RawDeltaProduct[] };
      const products = Array.isArray(body.result) ? body.result : [];
      const product  = products.find(p => p.symbol === symbol);

      if (!product) { res.status(404).json({ error: `No contract found for ${symbol}` }); return; }

      const info = formatProduct(product);
      cache.set(symbol, { data: info, fetchedAt: Date.now() });
      logger.info({ symbol, maxLeverageNum: info.maxLeverageNum, lotSizeNum: info.lotSizeNum }, "contract-info: fetched from Delta Exchange");

      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, symbol }, "contract-info: fetch failed");
      if (cached) { res.json(cached.data); return; }
      res.status(502).json({ error: `Failed to fetch contract info: ${msg}` });
    }
  });

  // ── Broker-aware unified spec ──────────────────────────────────────────────
  // GET /api/contract-spec/:symbol?broker=delta|ctrader
  router.get("/contract-spec/:symbol", async (req, res): Promise<void> => {
    const symbol = (req.params["symbol"] ?? "").toUpperCase();
    const broker = ((req.query["broker"] as string | undefined) ?? "delta").toLowerCase();

    if (!symbol) { res.status(400).json({ error: "Symbol is required" }); return; }
    if (broker !== "delta" && broker !== "ctrader") {
      res.status(400).json({ error: "broker must be 'delta' or 'ctrader'" });
      return;
    }

    const cacheKey = `${broker}:${symbol}`;
    const hit      = specCache.get(cacheKey);
    if (hit && Date.now() - hit.fetchedAt < SPEC_CACHE_TTL) {
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(hit.data);
      return;
    }

    try {
      const spec = broker === "ctrader"
        ? await buildCtraderSpec(symbol)
        : await buildDeltaSpec(symbol);

      specCache.set(cacheKey, { data: spec, fetchedAt: Date.now() });
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(spec);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ symbol, broker, err: msg }, "contract-spec: build failed");
      if (hit) { res.json(hit.data); return; }
      res.status(502).json({ error: `Failed to build contract spec: ${msg}` });
    }
  });

  return router;
}
