/**
 * useColors — returns the full design-token palette for the current theme.
 *
 * Web → RN replacements made here:
 *   useColorScheme() from react-native  → useTheme() from ThemeContext
 *     The old hook read the OS color-scheme directly and had no awareness of
 *     the user's persisted preference ("always dark", "always light",
 *     "follow system").  useTheme() provides the *resolved* theme that already
 *     accounts for the stored preference, system changes, and async load.
 *
 * Return shape
 * ────────────
 * Everything from ColorPalette (all color tokens) plus:
 *   radius   — RadiusScale  (sm | md | lg | xl | 2xl | full)
 *   spacing  — SpacingScale (0 … 96, in px)
 *   shadows  — ShadowScale  (2xs … 2xl, as RN shadow objects)
 *
 * Usage
 * ─────
 *   const { background, primary, radius, shadows } = useColors();
 *   <View style={{ backgroundColor: background, ...shadows.sm }} />
 *
 * The hook is safe to call before ThemeProvider has finished loading
 * AsyncStorage — the default context value resolves to "dark" so the first
 * render is always consistent.
 */

import colors from "@/constants/colors";
import type { ColorPalette, RadiusScale, ShadowScale, SpacingScale } from "@/constants/colors";
import { useTheme } from "@/contexts/ThemeContext";

export type { ColorPalette, RadiusScale, ShadowScale, SpacingScale };

export interface UseColorsResult extends ColorPalette {
  /** Border-radius scale — numeric pixel values. */
  radius: RadiusScale;
  /** Spacing scale — numeric pixel values (1 unit = 4 px). */
  spacing: SpacingScale;
  /** Shadow presets — RN-compatible shadow objects for the active theme. */
  shadows: ShadowScale;
}

export function useColors(): UseColorsResult {
  const { theme } = useTheme();

  return {
    // Spread all color tokens for the active palette
    ...colors[theme],
    // Append theme-independent scale tokens
    radius:  colors.radius,
    spacing: colors.spacing,
    // Shadow scale is theme-specific (dark shadows are heavier than light)
    shadows: colors.shadows[theme],
  };
}
