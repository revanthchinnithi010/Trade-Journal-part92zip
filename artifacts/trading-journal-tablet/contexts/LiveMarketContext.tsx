/**
 * LiveMarketContext — React Native stub.
 *
 * On the web, LiveMarketContext manages the market WebSocket connection and
 * exposes wsStatus, subscribeToMessages, sendMessage, and alertEvents.
 *
 * On the tablet this full context is implemented separately (Phase 6.x).
 * This file exists so that brokerStore.ts can import WsStatus without
 * modification — the type contract is identical between web and RN.
 *
 * Only the WsStatus type is needed by brokerStore today; the full context
 * value interface is preserved here for future implementation.
 */

export type WsStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";
