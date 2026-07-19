/**
 * React Native AsyncStorage adapter for Zustand persist middleware.
 *
 * Exports
 * ───────
 *   storage        — Raw StateStorage adapter (string key/value).
 *                    Use with `createJSONStorage(() => storage)` when you
 *                    need control over the JSON options.
 *
 *   zustandStorage — JSON-serialising PersistStorage ready for Zustand's
 *                    `persist()` middleware.  Use in the `storage` field of
 *                    `PersistOptions`:
 *
 *                      import { zustandStorage } from "@/lib/rnStorage";
 *                      persist(fn, { name: KEY, storage: zustandStorage })
 *
 *   persistStorage — Semantic alias for zustandStorage; prefer this name
 *                    outside of Zustand-specific contexts.
 *
 * Error recovery
 * ──────────────
 *   • AsyncStorage read/write failures  → silently return null / no-op
 *   • Missing values                    → return null (store uses initialState)
 *   • Corrupted / invalid JSON          → return null, log warning in __DEV__
 *   • Partial StorageValue shapes       → return null (safe fallback)
 *
 * The app never crashes due to storage failures.  The store simply starts
 * with its `initialState` and will persist correctly on the next write.
 *
 * TypeScript note
 * ───────────────
 * `PersistStorage<S>` is generic over the store state.  Pre-creating a single
 * instance for all stores requires `PersistStorage<any>`:
 *   • `PersistStorage<unknown>` fails because `StorageValue<unknown>` is not
 *     structurally assignable to `StorageValue<SomeConcreteState>`.
 *   • `PersistStorage<any>` is assignable to `PersistStorage<S>` for any S
 *     because TypeScript's `any` bypasses assignability checks in both
 *     covariant and contravariant positions.
 * The explicit `any` here is intentional and safe — at runtime the store
 * state's concrete type is always honoured by Zustand's own middleware.
 *
 * Platform compatibility
 * ──────────────────────
 * AsyncStorage v2.x is available on iOS, Android, and Expo Go.
 * No DOM APIs, no window, no localStorage are used anywhere in this file.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PersistStorage, StateStorage, StorageValue } from "zustand/middleware";

// ─────────────────────────────────────────────────────────────────────────────
// Raw StateStorage adapter
//
// Implements Zustand's StateStorage<R> interface against AsyncStorage.
// All values are raw strings — JSON serialisation is the caller's concern.
//
// Typed as StateStorage<Promise<void>> because AsyncStorage.setItem /
// removeItem return Promise<void>, which is assignable to the default
// R = unknown so stores can use `createJSONStorage(() => storage)` directly.
// ─────────────────────────────────────────────────────────────────────────────

export const storage: StateStorage = {
  /**
   * Read a raw string value.
   * Returns null if the key is absent or on any storage error.
   */
  getItem: async (name: string): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(name);
    } catch (err) {
      if (__DEV__) {
        console.warn(`[rnStorage] getItem("${name}") failed:`, err);
      }
      return null;
    }
  },

  /**
   * Persist a raw string value.
   * Silently no-ops on any storage error — the in-memory store stays intact.
   */
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (err) {
      if (__DEV__) {
        console.warn(`[rnStorage] setItem("${name}") failed:`, err);
      }
    }
  },

  /**
   * Delete a stored value.
   * Silently no-ops if the key is absent or on any storage error.
   */
  removeItem: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (err) {
      if (__DEV__) {
        console.warn(`[rnStorage] removeItem("${name}") failed:`, err);
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// JSON-capable Zustand PersistStorage
//
// Implements PersistStorage<any> directly so:
//   1. JSON parse errors are caught and gracefully return null (store
//      falls back to initialState) rather than throwing.
//   2. A pre-created instance can be shared across all stores without
//      the type-parameter binding required by createJSONStorage.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const zustandStorage: PersistStorage<any> = {
  /**
   * Read and JSON-parse a persisted StorageValue.
   *
   * Returns null when:
   *  - the key does not exist in AsyncStorage
   *  - AsyncStorage throws
   *  - the stored string is not valid JSON
   *  - the parsed value is missing the required `state` property
   */
  getItem: async (name: string): Promise<StorageValue<unknown> | null> => {
    try {
      const raw = await AsyncStorage.getItem(name);

      // Key absent — not an error, just no persisted state yet.
      if (raw == null) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Stored value is not valid JSON (corruption, truncation, etc.)
        if (__DEV__) {
          console.warn(
            `[rnStorage] getItem("${name}") — invalid JSON, discarding:`,
            raw.slice(0, 120),
          );
        }
        return null;
      }

      // Validate the minimum StorageValue shape: { state: ... }
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        !("state" in (parsed as object))
      ) {
        if (__DEV__) {
          console.warn(
            `[rnStorage] getItem("${name}") — malformed StorageValue, discarding.`,
          );
        }
        return null;
      }

      return parsed as StorageValue<unknown>;
    } catch (err) {
      if (__DEV__) {
        console.warn(`[rnStorage] getItem("${name}") failed:`, err);
      }
      return null;
    }
  },

  /**
   * JSON-serialise and persist a StorageValue.
   * Silently no-ops on JSON.stringify failure or AsyncStorage error.
   */
  setItem: async (name: string, value: StorageValue<unknown>): Promise<void> => {
    try {
      const serialised = JSON.stringify(value);
      await AsyncStorage.setItem(name, serialised);
    } catch (err) {
      if (__DEV__) {
        console.warn(`[rnStorage] setItem("${name}") failed:`, err);
      }
    }
  },

  /**
   * Remove a persisted store slice.
   * Silently no-ops if the key is absent or AsyncStorage throws.
   */
  removeItem: async (name: string): Promise<void> => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (err) {
      if (__DEV__) {
        console.warn(`[rnStorage] removeItem("${name}") failed:`, err);
      }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Alias — semantic name for non-Zustand consumers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Alias for `zustandStorage`.  Prefer this name in application code that
 * is not tightly coupled to Zustand (e.g. a shared data layer that may
 * support multiple state-management libraries in the future).
 */
export const persistStorage = zustandStorage;
