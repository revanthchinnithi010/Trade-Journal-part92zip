/**
 * ThemeContext — React Native / Expo Router port of the web ThemeContext.
 *
 * Web → RN replacements made here:
 *   localStorage              → @react-native-async-storage/async-storage
 *   window.matchMedia(...)    → Appearance.getColorScheme() (sync) +
 *                               Appearance.addChangeListener() (subscription)
 *   document.documentElement  → removed entirely (no DOM in RN)
 *   html.classList.*          → removed entirely (no CSS classes in RN)
 *   ReactNode import          → React.ReactNode (no separate import needed)
 *
 * Anti-flicker strategy
 * ─────────────────────
 * AsyncStorage is inherently async — there is no synchronous read API in RN.
 * To prevent a visible theme switch after mount we do:
 *
 *   1. Initialize `theme` synchronously from `Appearance.getColorScheme()` so
 *      the first render already shows the correct system color.
 *   2. Load the user's persisted preference from AsyncStorage in a `useEffect`.
 *      If the stored value matches what the system already returned, no repaint
 *      occurs.  If it differs (user explicitly chose a different mode) the
 *      update happens within the first ~10 ms — before the first frame of the
 *      splash screen has been dismissed — because the app already holds the
 *      splash screen open for font loading (see app/_layout.tsx).
 *   3. `isThemeReady` is exposed so callers can optionally keep the splash
 *      screen up until both fonts AND theme are resolved:
 *
 *        const { isThemeReady } = useTheme();
 *        if (!fontsReady || !isThemeReady) return null;
 *
 * AsyncStorage keys
 * ─────────────────
 * "tj-theme-mode"  — primary key  ("dark" | "light" | "system")
 * "tj-theme"       — legacy key   ("dark" | "light") — read-once for migration
 *
 * Both keys are identical to the web app so a shared backend (if ever added)
 * can round-trip the preference without a migration step.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance } from "react-native";

// ─────────────────────────────────────────────────────────────────────────────
// Types  (identical to the web ThemeContext so consuming code can be shared)
// ─────────────────────────────────────────────────────────────────────────────

/** The persisted user preference — "system" defers to the OS setting. */
export type ThemeMode = "dark" | "light" | "system";

/** The resolved, active theme — always either "dark" or "light". */
export type Theme = "dark" | "light";

// ─────────────────────────────────────────────────────────────────────────────
// AsyncStorage keys
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY_MODE   = "tj-theme-mode"; // primary
const STORAGE_KEY_LEGACY = "tj-theme";      // legacy fallback — migration only

// ─────────────────────────────────────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────────────────────────────────────

interface ThemeCtx {
  /** Resolved active theme — use this to select a color palette. */
  theme: Theme;
  /** The persisted user preference (may be "system"). */
  themeMode: ThemeMode;
  /**
   * False while AsyncStorage is still loading the persisted preference.
   * Use this in _layout.tsx alongside font-loading to keep the splash screen
   * up until both are ready, preventing any theme flicker.
   */
  isThemeReady: boolean;
  /** Toggle between dark ↔ light and persist the choice. */
  toggleTheme: () => void;
  /** Explicitly set the resolved theme and persist it. */
  setTheme: (t: Theme) => void;
  /** Set the theme mode (including "system") and persist it. */
  setThemeMode: (m: ThemeMode) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Read the OS color scheme synchronously. Falls back to "dark". */
function getSystemTheme(): Theme {
  const scheme = Appearance.getColorScheme();
  return scheme === "light" ? "light" : "dark";
}

/** Resolve a ThemeMode to a concrete Theme. */
function resolveTheme(mode: ThemeMode): Theme {
  if (mode === "system") return getSystemTheme();
  return mode;
}

/** Fire-and-forget AsyncStorage write — errors are swallowed intentionally. */
function persistMode(mode: ThemeMode, resolved: Theme): void {
  AsyncStorage.setItem(STORAGE_KEY_MODE, mode).catch(() => {});
  // Also write the legacy key so the web app (localStorage) stays in sync
  // if the user ever opens it on the same account.
  AsyncStorage.setItem(STORAGE_KEY_LEGACY, resolved).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Context + default value
// ─────────────────────────────────────────────────────────────────────────────

const defaultCtx: ThemeCtx = {
  theme: "dark",
  themeMode: "dark",
  isThemeReady: false,
  toggleTheme: () => {},
  setTheme: () => {},
  setThemeMode: () => {},
};

const ThemeCtx = createContext<ThemeCtx>(defaultCtx);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Synchronous initial value — guaranteed to match the system on first render.
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [theme, setThemeState]         = useState<Theme>(getSystemTheme);
  const [isThemeReady, setIsThemeReady] = useState(false);

  // ── Step 1: Load persisted preference from AsyncStorage ─────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY_MODE);

        if (stored === "dark" || stored === "light" || stored === "system") {
          // Primary key found — use it directly.
          if (!cancelled) {
            setThemeModeState(stored);
            setThemeState(resolveTheme(stored));
          }
        } else {
          // Primary key absent — attempt legacy migration from "tj-theme".
          const legacy = await AsyncStorage.getItem(STORAGE_KEY_LEGACY);
          if ((legacy === "dark" || legacy === "light") && !cancelled) {
            setThemeModeState(legacy);
            setThemeState(legacy);
            // Promote the legacy key to the new primary key.
            AsyncStorage.setItem(STORAGE_KEY_MODE, legacy).catch(() => {});
          }
          // If neither key exists, keep the system default (already set).
        }
      } catch {
        // AsyncStorage unavailable — system default is already applied; just
        // mark ready so the app is not permanently blocked.
      } finally {
        if (!cancelled) setIsThemeReady(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  // ── Step 2: Track OS appearance changes when mode is "system" ───────────
  useEffect(() => {
    if (themeMode !== "system") return;

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setThemeState(colorScheme === "light" ? "light" : "dark");
    });

    return () => subscription.remove();
  }, [themeMode]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const setThemeMode = useCallback((m: ThemeMode) => {
    const resolved = resolveTheme(m);
    setThemeModeState(m);
    setThemeState(resolved);
    persistMode(m, resolved);
  }, []);

  const toggleTheme = useCallback(() => {
    // Toggling always locks to an explicit color — exits "system" mode.
    const next: Theme = theme === "dark" ? "light" : "dark";
    setThemeModeState(next);
    setThemeState(next);
    persistMode(next, next);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    // Explicit set also locks to a color — exits "system" mode.
    setThemeModeState(t);
    setThemeState(t);
    persistMode(t, t);
  }, []);

  // ── Memoised value ────────────────────────────────────────────────────────

  const value = useMemo<ThemeCtx>(
    () => ({ theme, themeMode, isThemeReady, toggleTheme, setTheme, setThemeMode }),
    [theme, themeMode, isThemeReady, toggleTheme, setTheme, setThemeMode],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hooks  (same names as web — drop-in compatible)
// ─────────────────────────────────────────────────────────────────────────────

/** Full theme context — theme, themeMode, isThemeReady and all actions. */
export const useTheme = () => useContext(ThemeCtx);

/**
 * Returns the resolved `Theme` ("dark" | "light") — the concrete color
 * scheme that is actually applied right now.
 *
 * Unlike `themeMode`, this is never "system" — it is always a concrete value
 * that can be used directly to pick a color palette:
 *
 *   const theme = useResolvedTheme();
 *   const colors = theme === "dark" ? darkPalette : lightPalette;
 *
 * Use `useTheme().themeMode` when you need to know whether the user chose
 * "system" vs an explicit override.
 */
export function useResolvedTheme(): Theme {
  return useContext(ThemeCtx).theme;
}

/**
 * Convenience hook — returns only the resolved `Theme` ("dark" | "light").
 * Alias for `useResolvedTheme()` — provided so components migrated from the
 * web can keep using the same hook name they used there.
 *
 * Equivalent to `useTheme().theme`.
 */
export function useColorScheme(): Theme {
  return useContext(ThemeCtx).theme;
}
