/**
 * Broker type definitions — React Native port of src/types/broker.ts
 *
 * Modifications vs the web original
 * ──────────────────────────────────
 * None.  This file contains only pure TypeScript business-domain types and
 * runtime constants (strings, numbers, booleans).  There are no DOM APIs,
 * no browser event types, and no HTML-specific interfaces.
 *
 * The `BrokerInfo.image` field carries web-relative asset paths
 * (e.g. "/broker-delta.png").  The *type* (`string | undefined`) is correct
 * for React Native — resolution of the asset (require() vs URI string vs
 * expo-image source) is a component-level concern, not a type concern.
 */

// ---------------------------------------------------------------------------
// Identifiers & auth
// ---------------------------------------------------------------------------

export type BrokerId = "delta" | "mt5" | "ctrader";
export type BrokerAuthType = "api_key" | "oauth" | "credentials";

// ---------------------------------------------------------------------------
// BrokerInfo — static metadata shown in the broker-connect UI
// ---------------------------------------------------------------------------

export interface BrokerInfo {
  id: BrokerId;
  name: string;
  /**
   * Short text or symbol rendered when a logo image is unavailable
   * (e.g. "Δ", "M5", "cT").
   */
  logo: string;
  /** Optional asset path / URI for a full broker logo image. */
  image?: string;
  description: string;
  /** Hex brand colour used for accent elements. */
  color: string;
  authType: BrokerAuthType;
}

// ---------------------------------------------------------------------------
// BROKERS — canonical list of supported broker integrations
// ---------------------------------------------------------------------------

export const BROKERS: BrokerInfo[] = [
  {
    id: "delta",
    name: "Delta Exchange",
    logo: "Δ",
    image: "/broker-delta.png",
    description: "Crypto derivatives exchange — BTC, ETH, SOL perpetuals",
    color: "#F97316",
    authType: "api_key",
  },
  {
    id: "mt5",
    name: "MetaTrader 5",
    logo: "M5",
    image: "/broker-mt5.png",
    description: "Multi-asset platform — Forex, Stocks, Futures & Crypto",
    color: "#22C55E",
    authType: "credentials",
  },
  {
    id: "ctrader",
    name: "cTrader",
    logo: "cT",
    description: "Forex & CFD platform — OAuth 2.0 via Spotware",
    color: "#3B82F6",
    authType: "oauth",
  },
];

// ---------------------------------------------------------------------------
// BrokerAccount — a persisted, user-owned brokerage account record
// ---------------------------------------------------------------------------

export interface BrokerAccount {
  id: number;
  broker_id: BrokerId;
  label: string;
  is_active: boolean;
  api_token: string;
  created_at: string;
  ws_url?: string;
  base_url?: string;
  env_name?: string;
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

// ---------------------------------------------------------------------------
// Live account data
// ---------------------------------------------------------------------------

export interface BrokerBalance {
  coin: string;
  equity: string;
  availableToWithdraw: string;
  unrealisedPnl: string;
  walletBalance: string;
}

export interface BrokerPosition {
  id: string;
  symbol: string;
  side: "Long" | "Short";
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealisedPnl: number;
  leverage: string;
  raw: unknown;
}

export interface BrokerOrder {
  id: string;
  symbol: string;
  side: "Buy" | "Sell";
  orderType: string;
  price: number;
  qty: number;
  status: string;
  createdAt: string;
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Order placement
// ---------------------------------------------------------------------------

export interface PlaceOrderRequest {
  symbol: string;
  side: "Buy" | "Sell";
  orderType: "Market" | "Limit";
  qty: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  productId?: number;
  category?: string;
}
