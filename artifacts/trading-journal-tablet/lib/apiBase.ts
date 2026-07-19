/**
 * lib/apiBase.ts — shared API base-URL helper for all stores.
 *
 * Mirrors the logic in app/_layout.tsx where EXPO_PUBLIC_API_BASE_URL is set
 * as the react-query base. Stores that call fetch() directly (brokerWatchlistStore,
 * marketStore.fetchSymbolCatalog) use this to construct absolute URLs so they
 * work in React Native where relative paths are not resolved.
 */

export function getApiBase(): string {
  const fromEnv =
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    (process.env.EXPO_PUBLIC_DOMAIN
      ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
      : "");
  return fromEnv.replace(/\/$/, "");
}
