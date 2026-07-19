/**
 * Design token system for the Trading Journal Tablet app.
 *
 * All color values are converted from the web app's CSS custom-property
 * palette (index.css `:root` dark + `.light` overrides) into plain hex /
 * rgba strings that React Native StyleSheet can consume directly.
 *
 * HSL → hex conversions use the same computed values visible in the web
 * app's DevTools — every comment referencing a hex is taken from the CSS
 * source comment or verified by computation.
 *
 * DO NOT use CSS variables, Tailwind classes, or `em`/`rem` units here —
 * React Native uses numeric pixels everywhere.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single React Native–compatible shadow preset.
 * Use shadowColor/Offset/Opacity/Radius on iOS and elevation on Android.
 */
export interface ShadowPreset {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

/** Full shadow scale — one preset per CSS --shadow-* step. */
export interface ShadowScale {
  "2xs": ShadowPreset;
  xs: ShadowPreset;
  sm: ShadowPreset;
  base: ShadowPreset;
  md: ShadowPreset;
  lg: ShadowPreset;
  xl: ShadowPreset;
  "2xl": ShadowPreset;
}

/** Complete set of design tokens for one color palette (dark or light). */
export interface ColorPalette {
  // ── Core semantic ───────────────────────────────────────────────────────
  /** Page / screen background */
  background: string;
  /** Primary text color */
  foreground: string;
  /** Default divider / border */
  border: string;
  /** Form input background */
  input: string;
  /** Focus ring */
  ring: string;

  // ── Cards / panels ──────────────────────────────────────────────────────
  card: string;
  cardForeground: string;
  cardBorder: string;

  // ── Popovers / bottom sheets / modals ───────────────────────────────────
  popover: string;
  popoverForeground: string;
  popoverBorder: string;

  // ── Primary action (buttons, selected states) ───────────────────────────
  /** Dark: neutral cool slate #B0BCCE  |  Light: purple #7C3AED */
  primary: string;
  primaryForeground: string;

  // ── Secondary ───────────────────────────────────────────────────────────
  secondary: string;
  secondaryForeground: string;

  // ── Muted ───────────────────────────────────────────────────────────────
  muted: string;
  mutedForeground: string;

  // ── Accent ──────────────────────────────────────────────────────────────
  accent: string;
  accentForeground: string;

  // ── Danger / destructive ────────────────────────────────────────────────
  destructive: string;
  destructiveForeground: string;

  // ── Chart / data series palette ─────────────────────────────────────────
  /** Profit / buy  — mint (#00E5B0) in dark, green (#16A34A) in light */
  chart1: string;
  /** Secondary series — blue */
  chart2: string;
  /** Loss / sell — red */
  chart3: string;
  /** Amber / breakeven */
  chart4: string;
  /** Blue-violet */
  chart5: string;

  // ── Profit/loss accent (--accent-teal-400 / 500) ────────────────────────
  /** Dark: #00E5B0 mint  |  Light: #16A34A green */
  accentTeal400: string;
  accentTeal500: string;

  // ── Sidebar ─────────────────────────────────────────────────────────────
  sidebar: string;
  sidebarForeground: string;
  sidebarBorder: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarRing: string;

  // ── Surface tokens (glassmorphism / elevation helpers) ──────────────────
  /** App header bar background */
  surfaceHeader: string;
  /** App header bar bottom border */
  surfaceHeaderBorder: string;
  /** Modal/sheet backdrop overlay */
  surfaceBackdrop: string;
  surfaceBtnBorder: string;
  surfaceBtnActiveBorder: string;
  surfaceBtnHover: string;
  surfaceBtnActiveBg: string;
  surfaceInputBg: string;
  surfaceInputBorder: string;
  surfaceInputFocus: string;
  surfaceDivider: string;
  surfaceAvatarBorder: string;
  surfaceAvatarText: string;
  surfaceSidebarBorder: string;
  surfaceSidebarLogoBorder: string;
  /** Body / root background (matches --body-bg) */
  bodyBg: string;
  /** Notification badge border color */
  notificationBadgeBorder: string;

  // ── Glassmorphism card surfaces ──────────────────────────────────────────
  /** Semi-transparent card background for blur layers */
  glassBg: string;
  /** Glass card border */
  glassBorder: string;
  /** Blur radius to pass to expo-blur BlurView */
  glassBlurRadius: number;
  /** Elevated glass surface (modal, popover) */
  glassElevatedBg: string;

  // ── Numeric / balance display ────────────────────────────────────────────
  /** Dense fintech terminal numeric text color */
  balanceValueColor: string;

  // ── Elevation overlay tints ──────────────────────────────────────────────
  buttonOutline: string;
  badgeOutline: string;
  /** Subtle 1-level elevation tint */
  elevate1: string;
  /** Subtle 2-level elevation tint */
  elevate2: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Radius scale  (--radius: 1rem = 16px in the web CSS)
// ─────────────────────────────────────────────────────────────────────────────

export interface RadiusScale {
  /** --radius-sm  calc(1rem - 6px) = 10 */
  sm: number;
  /** --radius-md  calc(1rem - 4px) = 12 */
  md: number;
  /** --radius-lg  1rem             = 16 */
  lg: number;
  /** --radius-xl  calc(1rem + 4px) = 20 */
  xl: number;
  /** Extra large — pill buttons / full-round inputs */
  "2xl": number;
  /** Full circle / pill */
  full: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spacing scale  (--spacing: 0.25rem = 4px, matching Tailwind default)
// ─────────────────────────────────────────────────────────────────────────────

export interface SpacingScale {
  0: number;
  0.5: number;
  1: number;
  1.5: number;
  2: number;
  2.5: number;
  3: number;
  3.5: number;
  4: number;
  5: number;
  6: number;
  7: number;
  8: number;
  9: number;
  10: number;
  11: number;
  12: number;
  14: number;
  16: number;
  20: number;
  24: number;
  28: number;
  32: number;
  36: number;
  40: number;
  44: number;
  48: number;
  56: number;
  60: number;
  64: number;
  72: number;
  80: number;
  96: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// DARK palette
// Deep navy-black · #05070A / #0B0E14 surfaces · Teal + cyan accent
// Source: :root block in index.css
// ─────────────────────────────────────────────────────────────────────────────

const dark: ColorPalette = {
  // Core — hsl(220 38% 3%) → #05070A
  background: "#05070A",
  // hsl(215 25% 96%) — "rgba(255,255,255,0.94)" in CSS comment
  foreground: "#F0F2F5",
  // hsl(220 20% 14%) → #1D2129
  border: "#1D2129",
  // hsl(220 30% 7%) → #0B0F17
  input: "#0B0F17",
  // hsl(220 12% 56%) — comment: #858FA0
  ring: "#858FA0",

  // Cards — hsl(220 25% 6%) → #0B0E14
  card: "#0B0E14",
  cardForeground: "#F0F2F5",
  cardBorder: "#1D2129",

  // Popovers — hsl(220 30% 5%) → #090B10
  popover: "#090B10",
  popoverForeground: "#F0F2F5",
  popoverBorder: "#1D2129",

  // Primary — hsl(215 16% 74%) — comment: #B0BCCE  (neutral cool slate)
  primary: "#B0BCCE",
  // hsl(220 25% 6%)
  primaryForeground: "#0B0E14",

  // Secondary — hsl(220 22% 10%) → #141820
  secondary: "#141820",
  secondaryForeground: "#F0F2F5",

  // Muted — hsl(220 20% 9%) → #12151C
  muted: "#12151C",
  // hsl(215 22% 73%) — comment: "rgba(180,190,210,0.72)"
  mutedForeground: "#ABB8C9",

  // Accent — hsl(220 20% 12%) → #181D25
  accent: "#181D25",
  accentForeground: "#F0F2F5",

  // Destructive — hsl(0 72% 56%) → #E03E3E
  destructive: "#E03E3E",
  destructiveForeground: "#FFFFFF",

  // Chart palette — hsl values from CSS
  // hsl(163 100% 45%) — "#00E5B0 mint — profit / buy"
  chart1: "#00E5B0",
  // hsl(212 100% 68%) — comment: #5DA9FF
  chart2: "#5DA9FF",
  // hsl(0 72% 56%) — loss / sell
  chart3: "#E03E3E",
  // hsl(38 90% 58%) — amber
  chart4: "#F4AE34",
  // hsl(230 72% 62%) — blue-violet
  chart5: "#5870E4",

  // Accent teal — profit remap (--accent-teal-*)
  accentTeal400: "#00E5B0",
  accentTeal500: "#00CCA0",

  // Sidebar — hsl(220 30% 5%) → #090B10
  sidebar: "#090B10",
  sidebarForeground: "#F0F2F5",
  // hsl(220 20% 11%) → #161A22
  sidebarBorder: "#161A22",
  // hsl(215 14% 68%) — comment: #9eaabb
  sidebarPrimary: "#9EAABB",
  sidebarPrimaryForeground: "#05070A",
  // hsl(220 25% 9%) → #0F1218
  sidebarAccent: "#0F1218",
  sidebarAccentForeground: "#F0F2F5",
  sidebarRing: "#858FA0",

  // Surface tokens — taken verbatim from CSS :root / .dark
  surfaceHeader: "#000000",
  surfaceHeaderBorder: "rgba(255, 255, 255, 0.05)",
  surfaceBackdrop: "rgba(0, 0, 0, 0.70)",
  surfaceBtnBorder: "rgba(255, 255, 255, 0.06)",
  surfaceBtnActiveBorder: "rgba(255, 255, 255, 0.16)",
  surfaceBtnHover: "rgba(10, 14, 20, 0.80)",
  surfaceBtnActiveBg: "rgba(255, 255, 255, 0.06)",
  surfaceInputBg: "rgba(8, 10, 16, 0.80)",
  surfaceInputBorder: "rgba(255, 255, 255, 0.06)",
  surfaceInputFocus: "rgba(255, 255, 255, 0.20)",
  surfaceDivider: "rgba(255, 255, 255, 0.06)",
  surfaceAvatarBorder: "rgba(255, 255, 255, 0.12)",
  surfaceAvatarText: "#94A3B8",
  surfaceSidebarBorder: "rgba(255, 255, 255, 0.04)",
  surfaceSidebarLogoBorder: "rgba(255, 255, 255, 0.05)",
  bodyBg: "#05070A",
  notificationBadgeBorder: "#05070A",

  // Glassmorphism — "rgba(12,14,18,0.82) + blur(18px)" from CSS comment
  glassBg: "rgba(12, 14, 18, 0.82)",
  glassBorder: "rgba(255, 255, 255, 0.06)",
  glassBlurRadius: 18,
  glassElevatedBg: "rgba(20, 24, 32, 0.88)",

  // Balance numerics — fintech terminal register
  balanceValueColor: "#E6E6E6",

  // Elevation tints
  buttonOutline: "rgba(255, 255, 255, 0.06)",
  badgeOutline: "rgba(255, 255, 255, 0.04)",
  elevate1: "rgba(255, 255, 255, 0.018)",
  elevate2: "rgba(255, 255, 255, 0.042)",
};

// ─────────────────────────────────────────────────────────────────────────────
// LIGHT palette
// F5F7FA page · White cards · Purple #7C3AED accent
// Source: .light block in index.css
// ─────────────────────────────────────────────────────────────────────────────

const light: ColorPalette = {
  // Core — hsl(216 33% 97%) — comment: #F5F7FA
  background: "#F5F7FA",
  // hsl(221 39% 11%) — comment: #111827
  foreground: "#111827",
  // hsl(220 13% 91%) — comment: #E5E7EB
  border: "#E5E7EB",
  // hsl(0 0% 100%) — pure white
  input: "#FFFFFF",
  // hsl(263 83% 58%) — comment: #7C3AED purple
  ring: "#7C3AED",

  // Cards — hsl(0 0% 100%)
  card: "#FFFFFF",
  cardForeground: "#111827",
  cardBorder: "#E5E7EB",

  // Popovers — pure white
  popover: "#FFFFFF",
  popoverForeground: "#111827",
  popoverBorder: "#E5E7EB",

  // Primary — hsl(263 83% 58%) — purple
  primary: "#7C3AED",
  primaryForeground: "#FFFFFF",

  // Secondary — hsl(220 14% 96%) — comment: #F3F4F6
  secondary: "#F3F4F6",
  secondaryForeground: "#111827",

  // Muted — hsl(210 20% 98%) — comment: #F9FAFB
  muted: "#F9FAFB",
  // hsl(220 9% 46%) — comment: #6B7280
  mutedForeground: "#6B7280",

  // Accent — hsl(216 16% 94%) — comment: #ECEFF3
  accent: "#ECEFF3",
  accentForeground: "#111827",

  // Destructive — hsl(0 72% 50%) — comment: #DC2626
  destructive: "#DC2626",
  destructiveForeground: "#FFFFFF",

  // Chart palette
  // hsl(142 76% 36%) — comment: #16A34A profit green
  chart1: "#16A34A",
  // hsl(221 83% 53%) — comment: #3B82F6
  chart2: "#3B82F6",
  // hsl(0 72% 50%) — comment: #DC2626
  chart3: "#DC2626",
  // hsl(38 91% 50%) — comment: #F59E0B amber
  chart4: "#F59E0B",
  // hsl(263 83% 58%) — purple
  chart5: "#7C3AED",

  // Accent teal remapped to green in light mode
  accentTeal400: "#16A34A",
  accentTeal500: "#15803D",

  // Sidebar — pure white
  sidebar: "#FFFFFF",
  sidebarForeground: "#111827",
  sidebarBorder: "#E5E7EB",
  // hsl(263 83% 58%) — purple active
  sidebarPrimary: "#7C3AED",
  sidebarPrimaryForeground: "#FFFFFF",
  // hsl(220 14% 96%) — hover bg
  sidebarAccent: "#F3F4F6",
  sidebarAccentForeground: "#111827",
  sidebarRing: "#7C3AED",

  // Surface tokens — taken verbatim from CSS .light
  surfaceHeader: "rgba(255, 255, 255, 1.0)",
  surfaceHeaderBorder: "rgba(0, 0, 0, 0.08)",
  surfaceBackdrop: "rgba(0, 0, 0, 0.30)",
  surfaceBtnBorder: "rgba(0, 0, 0, 0.08)",
  surfaceBtnActiveBorder: "rgba(124, 58, 237, 0.30)",
  surfaceBtnHover: "rgba(0, 0, 0, 0.04)",
  surfaceBtnActiveBg: "rgba(124, 58, 237, 0.06)",
  surfaceInputBg: "rgba(255, 255, 255, 1.0)",
  surfaceInputBorder: "rgba(0, 0, 0, 0.09)",
  surfaceInputFocus: "rgba(124, 58, 237, 0.45)",
  surfaceDivider: "#ECEFF3",
  surfaceAvatarBorder: "rgba(124, 58, 237, 0.20)",
  surfaceAvatarText: "#7C3AED",
  surfaceSidebarBorder: "rgba(0, 0, 0, 0.05)",
  surfaceSidebarLogoBorder: "rgba(0, 0, 0, 0.07)",
  bodyBg: "#F5F7FA",
  notificationBadgeBorder: "#F5F7FA",

  // Glassmorphism — white NeoMorph cards (light mode variant)
  glassBg: "rgba(255, 255, 255, 0.75)",
  glassBorder: "rgba(229, 231, 235, 0.80)",
  glassBlurRadius: 20,
  glassElevatedBg: "rgba(255, 255, 255, 0.92)",

  // Balance numerics — dark ink for white card surfaces
  balanceValueColor: "#1A1A1A",

  // Elevation tints
  buttonOutline: "rgba(0, 0, 0, 0.07)",
  badgeOutline: "rgba(0, 0, 0, 0.04)",
  elevate1: "rgba(0, 0, 0, 0.015)",
  elevate2: "rgba(0, 0, 0, 0.030)",
};

// ─────────────────────────────────────────────────────────────────────────────
// Shadow scales
// Each preset is RN-compatible: use iOS shadow props + Android elevation.
// Values are derived from the CSS --shadow-* custom properties.
// ─────────────────────────────────────────────────────────────────────────────

const darkShadows: ShadowScale = {
  // --shadow-2xs: 0 1px 3px rgba(0,0,0,0.60)
  "2xs": { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.60, shadowRadius: 3, elevation: 1 },
  // --shadow-xs:  0 1px 5px rgba(0,0,0,0.62)
  xs:   { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.62, shadowRadius: 5, elevation: 2 },
  // --shadow-sm:  0 2px 10px rgba(0,0,0,0.64)
  sm:   { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.64, shadowRadius: 10, elevation: 4 },
  // --shadow:     0 4px 20px rgba(0,0,0,0.68)
  base: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.68, shadowRadius: 20, elevation: 6 },
  // --shadow-md:  0 6px 28px rgba(0,0,0,0.70)
  md:   { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.70, shadowRadius: 28, elevation: 10 },
  // --shadow-lg:  0 12px 40px rgba(0,0,0,0.74)
  lg:   { shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.74, shadowRadius: 40, elevation: 16 },
  // --shadow-xl:  0 24px 64px rgba(0,0,0,0.78)
  xl:   { shadowColor: "#000", shadowOffset: { width: 0, height: 24 }, shadowOpacity: 0.78, shadowRadius: 64, elevation: 24 },
  // --shadow-2xl: 0 40px 90px rgba(0,0,0,0.82)
  "2xl":{ shadowColor: "#000", shadowOffset: { width: 0, height: 40 }, shadowOpacity: 0.82, shadowRadius: 90, elevation: 32 },
};

const lightShadows: ShadowScale = {
  // --shadow-2xs: 0 1px 2px  rgba(0,0,0,0.05)
  "2xs": { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  // --shadow-xs:  0 1px 4px  rgba(0,0,0,0.06)
  xs:   { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  // --shadow-sm:  0 2px 8px  rgba(0,0,0,0.06)
  sm:   { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  // --shadow:     0 4px 16px rgba(0,0,0,0.07)
  base: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 16, elevation: 4 },
  // --shadow-md:  0 6px 20px rgba(0,0,0,0.08)
  md:   { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 6 },
  // --shadow-lg:  0 10px 32px rgba(0,0,0,0.09)
  lg:   { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.09, shadowRadius: 32, elevation: 10 },
  // --shadow-xl:  0 20px 48px rgba(0,0,0,0.10)
  xl:   { shadowColor: "#000", shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.10, shadowRadius: 48, elevation: 14 },
  // --shadow-2xl: 0 32px 72px rgba(0,0,0,0.12)
  "2xl":{ shadowColor: "#000", shadowOffset: { width: 0, height: 32 }, shadowOpacity: 0.12, shadowRadius: 72, elevation: 20 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Radius scale  (--radius: 1rem = 16px)
// ─────────────────────────────────────────────────────────────────────────────

const radius: RadiusScale = {
  sm:   10,  // calc(1rem - 6px)
  md:   12,  // calc(1rem - 4px)
  lg:   16,  // 1rem
  xl:   20,  // calc(1rem + 4px)
  "2xl":24,
  full: 9999,
};

// ─────────────────────────────────────────────────────────────────────────────
// Spacing scale  (1 unit = 4px, matching Tailwind / --spacing: 0.25rem)
// ─────────────────────────────────────────────────────────────────────────────

const spacing: SpacingScale = {
  0:    0,
  0.5:  2,
  1:    4,
  1.5:  6,
  2:    8,
  2.5:  10,
  3:    12,
  3.5:  14,
  4:    16,
  5:    20,
  6:    24,
  7:    28,
  8:    32,
  9:    36,
  10:   40,
  11:   44,
  12:   48,
  14:   56,
  16:   64,
  20:   80,
  24:   96,
  28:   112,
  32:   128,
  36:   144,
  40:   160,
  44:   176,
  48:   192,
  56:   224,
  60:   240,
  64:   256,
  72:   288,
  80:   320,
  96:   384,
};

// ─────────────────────────────────────────────────────────────────────────────
// Exported colors object
//
// Usage:
//   import colors from "@/constants/colors";
//   colors.dark.background   // "#05070A"
//   colors.light.primary     // "#7C3AED"
//   colors.radius.lg         // 16
//   colors.spacing[4]        // 16
//   colors.shadows.dark.md   // ShadowPreset
// ─────────────────────────────────────────────────────────────────────────────

const colors = {
  dark,
  light,
  radius,
  spacing,
  shadows: {
    dark: darkShadows,
    light: lightShadows,
  },
} as const;

export type Theme = keyof typeof colors extends "dark" | "light" | "radius" | "spacing" | "shadows"
  ? "dark" | "light"
  : never;

export default colors;
