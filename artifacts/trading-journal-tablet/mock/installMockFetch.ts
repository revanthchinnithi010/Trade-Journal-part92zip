/**
 * Mock fetch interceptor — React Native port of src/mock/installMockFetch.ts
 *
 * Installs a thin `global.fetch` interceptor that serves deterministic mock
 * JSON for a known set of `/api/*` GET routes (see mockApi.ts), and passes
 * everything else straight through to the real network.
 *
 * This is the single interception point for BOTH:
 *  - react-query hooks generated from the OpenAPI spec (they all funnel
 *    through `customFetch`, which itself calls the global `fetch`)
 *  - direct `fetch()` calls made by screens/stores
 *
 * To remove: delete this file's call site in `app/_layout.tsx` (and this
 * whole `mock/` folder). Nothing else in the app needs to change — mutation
 * requests (POST/PATCH/DELETE) are left untouched and go to the real API.
 *
 * RN compatibility changes vs the web original
 * ─────────────────────────────────────────────
 * • `window.fetch` / `window.fetch.bind(window)` → `globalThis.fetch`
 *   React Native has no `window` object. `fetch` is a global provided by
 *   the Hermes engine (via Expo's polyfill). Patching `globalThis.fetch`
 *   is safe and idiomatic in RN.
 *
 * • `window.location.origin` (base for URL parsing) → `"http://localhost"`
 *   RN has no `window.location`. In practice all API calls from the tablet
 *   use absolute URLs (the api-client sets the base URL from the env var),
 *   so the base is only used as a fallback for relative-path edge cases.
 *
 * • `input instanceof Request` (method extraction) → duck-typed `.method`
 *   The `Request` class is available in Expo's fetch polyfill but relying
 *   on `instanceof` across module boundaries can fail in Hermes; duck-typing
 *   the `.method` property is safer and semantically identical.
 *
 * • Never overwrite fetch twice — the `installed` guard is identical to the
 *   web original. Safe to call installMockFetch() multiple times (no-op
 *   after the first call).
 */
import { DEV_MODE } from "./config";
import { matchMockRoute } from "./mockApi";

let installed = false;

/**
 * Resolves the pathname and search params from any fetch input type.
 *
 * Uses `"http://localhost"` as the base for relative-path inputs so that
 * `new URL(path, base)` succeeds.  All real tablet API calls use absolute
 * URLs, so the base is only relevant for unlikely edge cases.
 *
 * Returns null if the input cannot be parsed (triggers pass-through).
 */
function resolvePath(
  input: RequestInfo | URL,
): { path: string; search: URLSearchParams } | null {
  try {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : // Duck-type Request-like objects (avoids `instanceof Request` fragility)
            (input as { url?: string }).url ?? "";
    const parsed = new URL(url, "http://localhost");
    return { path: parsed.pathname, search: parsed.searchParams };
  } catch {
    return null;
  }
}

export function installMockFetch(): void {
  if (installed || !DEV_MODE) return;
  installed = true;

  // Patch globalThis.fetch — the canonical way to intercept fetch in RN/Hermes.
  // `globalThis` is the same object as `global` in Hermes and is the correct
  // place to patch since that is where Expo registers the fetch polyfill.
  const g = globalThis as typeof globalThis & { fetch: typeof fetch };
  const realFetch = g.fetch;

  g.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // Only intercept GET requests — mutations go to the real API.
    const method = (
      init?.method ??
      (input as { method?: string }).method ??
      "GET"
    ).toUpperCase();
    if (method !== "GET") return realFetch(input, init);

    const resolved = resolvePath(input);
    if (!resolved) return realFetch(input, init);

    const mockBody = matchMockRoute(method, resolved.path, resolved.search);
    if (mockBody === undefined) return realFetch(input, init);

    return Promise.resolve(
      new Response(JSON.stringify(mockBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };

  // eslint-disable-next-line no-console
  console.info("[mock-data] DEV_MODE is on — serving deterministic mock data for known /api/* GET routes.");
}
