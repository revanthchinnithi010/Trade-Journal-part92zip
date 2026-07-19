/**
 * Unified theme constants — extends the color system in constants/colors.ts
 * with typography, z-index layers, animation durations and easing curves.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * What lives here vs constants/colors.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * colors.ts  — color palettes (dark/light), shadows, radius, spacing.
 * theme.ts   — re-exports colors + adds typography, zIndex, animation, easing.
 *              Use this file as the single import when you need the full system.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Usage
 * ─────────────────────────────────────────────────────────────────────────────
 *   import theme from "@/constants/theme";
 *
 *   theme.colors.dark.primary            // "#B0BCCE"
 *   theme.typography.fontSize.xl         // 20
 *   theme.typography.fontFamily.sansBold // "Inter_700Bold"
 *   theme.zIndex.modal                   // 1500
 *   theme.animation.duration.normal      // 200
 *   theme.animation.easing.easeOut       // [0, 0, 0.2, 1]
 *   Easing.bezier(...theme.animation.easing.easeOut)
 */

import { Platform } from "react-native";

import colors from "@/constants/colors";
import { LAYERS } from "@/constants/zIndex";

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports from colors.ts
// ─────────────────────────────────────────────────────────────────────────────

export type {
  ColorPalette,
  RadiusScale,
  ShadowPreset,
  ShadowScale,
  SpacingScale,
} from "@/constants/colors";
export { default as colors } from "@/constants/colors";

// ─────────────────────────────────────────────────────────────────────────────
// Typography
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Font families loaded in app/_layout.tsx via @expo-google-fonts/inter.
 * The `mono` key uses Platform.select so it resolves at runtime.
 */
const fontFamily = {
  /** Inter Regular 400 */
  sans:        "Inter_400Regular",
  /** Inter Medium 500 */
  sansMedium:  "Inter_500Medium",
  /** Inter SemiBold 600 */
  sansSemiBold:"Inter_600SemiBold",
  /** Inter Bold 700 */
  sansBold:    "Inter_700Bold",
  /**
   * Platform-native monospace — Menlo on iOS, `monospace` on Android/web.
   * Used for numeric data, code blocks, and stack traces.
   */
  mono: Platform.select<string>({
    ios:     "Menlo",
    android: "monospace",
    default: "monospace",
  })!,
} as const;

/** Font-size scale in pixels (matches Tailwind text-* steps). */
const fontSize = {
  "2xs":  10,
  xs:     11,
  sm:     13,
  base:   15,
  md:     16,
  lg:     18,
  xl:     20,
  "2xl":  24,
  "3xl":  30,
  "4xl":  36,
  "5xl":  48,
  "6xl":  60,
} as const;

/**
 * Line-height multipliers.
 * Apply as: `lineHeight: fontSize.lg * lineHeight.normal`
 * React Native expects an absolute pixel value, not a multiplier, so multiply
 * by the font size at the component level.
 */
const lineHeight = {
  none:    1,
  tight:   1.25,
  snug:    1.375,
  normal:  1.5,
  relaxed: 1.625,
  loose:   2,
} as const;

/**
 * Font-weight tokens as string literals accepted by React Native's `fontWeight`
 * style prop.  Use these instead of bare string literals to stay type-safe.
 */
const fontWeight = {
  normal:    "400",
  medium:    "500",
  semibold:  "600",
  bold:      "700",
  extrabold: "800",
} as const;

/**
 * Letter-spacing values in pixels.  Positive = expanded, negative = condensed.
 * React Native accepts a float in `letterSpacing`.
 */
const letterSpacing = {
  tighter: -0.5,
  tight:   -0.25,
  normal:   0,
  wide:     0.25,
  wider:    0.5,
  widest:   1.0,
} as const;

export const typography = {
  fontFamily,
  fontSize,
  lineHeight,
  fontWeight,
  letterSpacing,
} as const;

export type Typography = typeof typography;

// ─────────────────────────────────────────────────────────────────────────────
// Z-Index layer system
//
// Merges the app-specific LAYERS (from constants/zIndex.ts) with generic UI
// stacking names.  Use these instead of magic numbers in StyleSheet.
// ─────────────────────────────────────────────────────────────────────────────

export const zIndex = {
  // ── Generic UI layers ─────────────────────────────────────────────────────
  /** Behind everything — negative stacking */
  behind:   -1,
  /** Ground level */
  base:      0,
  /** Slightly raised — e.g. a focused input */
  raised:    10,
  /** Inline dropdowns / select menus */
  dropdown:  300,
  /** Sticky headers / tab bars */
  sticky:    400,
  /** Popover / tooltip overlay */
  overlay:  1000,
  /** Full-screen modal overlay */
  modal:    1500,
  /** Toast / snackbar — always above modals */
  toast:    1800,
  // ── App-specific layers (inherited from constants/zIndex.ts LAYERS) ───────
  /** Chart canvas base layer */
  chart:          LAYERS.chart,
  /** Floating toolbar above the chart */
  toolbar:        LAYERS.toolbar,
  /** Floating widget panel */
  floatingWidget: LAYERS.floatingWidget,
  /** Settings / config panel */
  settingsPanel:  LAYERS.settingsPanel,
  /** Sub-popup (e.g. line-style picker) */
  subPopup:       LAYERS.subPopup,
  /** Color picker */
  colorPicker:    LAYERS.colorPicker,
  /** Full-screen modal backdrop */
  modalOverlay:   LAYERS.modalOverlay,
} as const;

export type ZIndex = typeof zIndex;
export type ZIndexValue = (typeof zIndex)[keyof typeof zIndex];

// ─────────────────────────────────────────────────────────────────────────────
// Animation durations  (milliseconds)
// ─────────────────────────────────────────────────────────────────────────────

const duration = {
  /** 0 ms — no animation */
  instant:  0,
  /** 50 ms — micro-interaction (ripple, flash) */
  fastest:  50,
  /** 100 ms — fast response (button press feedback) */
  faster:   100,
  /** 150 ms — snappy UI action */
  fast:     150,
  /** 200 ms — default React Native Animated value */
  normal:   200,
  /** 300 ms — standard transition (most panels, drawers) */
  slow:     300,
  /** 400 ms — deliberate reveal */
  slower:   400,
  /** 500 ms — slow entrance / exit */
  slowest:  500,
  /** 350 ms — recommended page/screen transition */
  page:     350,
  /** 600 ms — splash / onboarding reveal */
  splash:   600,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Easing curves
//
// Stored as cubic bezier control points [x1, y1, x2, y2].
// Consume as: `Easing.bezier(...theme.animation.easing.easeOut)`
// where `Easing` is imported from `react-native` or `react-native-reanimated`.
// ─────────────────────────────────────────────────────────────────────────────

const easing = {
  /** Constant velocity — no acceleration */
  linear:    [0,    0,    1,    1   ] as readonly [number, number, number, number],
  /** Accelerate in, constant out */
  easeIn:    [0.4,  0,    1,    1   ] as readonly [number, number, number, number],
  /** Constant in, decelerate out (most natural for exits + reveals) */
  easeOut:   [0,    0,    0.2,  1   ] as readonly [number, number, number, number],
  /** Accelerate in, decelerate out (material standard) */
  easeInOut: [0.4,  0,    0.2,  1   ] as readonly [number, number, number, number],
  /** Subtle overshoot — spring-like bounce at the end */
  overshoot: [0.34, 1.56, 0.64, 1   ] as readonly [number, number, number, number],
  /** Fast out, slow in — snappy iOS-style feel */
  snappy:    [0.25, 0.46, 0.45, 0.94] as readonly [number, number, number, number],
  /** Anticipation — slight pull-back before moving forward */
  anticipate:[0.36, 0,    0.66, -0.56] as readonly [number, number, number, number],
} as const;

export const animation = { duration, easing } as const;
export type Animation = typeof animation;

// ─────────────────────────────────────────────────────────────────────────────
// Default export — full theme object
//
// Prefer named imports for tree-shaking; the default export is provided as a
// convenience for components that need the whole system.
// ─────────────────────────────────────────────────────────────────────────────

const theme = {
  colors,
  typography,
  zIndex,
  animation,
} as const;

export type Theme = typeof theme;
export default theme;
