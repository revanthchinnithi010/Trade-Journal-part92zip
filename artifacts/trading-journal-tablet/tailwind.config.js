// ─────────────────────────────────────────────────────────────────────────────
// Tailwind CSS v3 configuration for NativeWind v4
//
// Design tokens are sourced from artifacts/trading-journal/src/index.css.
// HSL custom properties have been converted to static hex/rgba values so
// NativeWind can emit them as atomic RN styles (CSS variables are web-only).
//
// Theme mapping:
//   Dark mode (default — app.json userInterfaceStyle: "dark") ← :root block
//   Light mode overrides are documented in comments
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 preset — provides RN-compatible layer utilities
  presets: [require("nativewind/preset")],

  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./screens/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    extend: {
      // ── Colors ─────────────────────────────────────────────────────────────
      // Source: :root block in index.css (dark mode defaults)
      //   hsl(220 38%  3%)  → #050709  background
      //   hsl(215 25% 96%)  → #EDF0F6  foreground
      //   hsl(220 20% 14%)  → #1C2233  border
      //   hsl(220 30%  7%)  → #0B1020  input
      //   hsl(220 12% 56%)  → #848EA0  ring
      //   hsl(220 25%  6%)  → #0A0E18  card
      //   hsl(220 30%  5%)  → #080C14  sidebar
      //   hsl(215 16% 74%)  → #AFBBCD  primary
      //   hsl(220 22% 10%)  → #13192A  secondary
      //   hsl(220 20%  9%)  → #111720  muted
      //   hsl(215 22% 73%)  → #B3BDD1  muted-foreground
      //   hsl(220 20% 12%)  → #171E2B  accent
      //   hsl(  0 72% 56%)  → #E44242  destructive
      //   hsl(163 100% 45%) → #00E5AA  chart-1  (teal / profit)
      //   hsl(212 100% 68%) → #5BAEFF  chart-2
      //   hsl( 38  90% 58%) → #F2AD2C  chart-4
      //   hsl(230  72% 62%) → #6B7FE8  chart-5
      colors: {
        // ── Base surfaces ───────────────────────────────────────────────────
        background:  "#050709",
        foreground:  "#EDF0F6",
        border:      "#1C2233",
        input:       "#0B1020",
        ring:        "#848EA0",

        // ── Card ────────────────────────────────────────────────────────────
        card: {
          DEFAULT:    "#0A0E18",
          foreground: "#EDF0F6",
          border:     "#1C2233",
        },

        // ── Popover ─────────────────────────────────────────────────────────
        popover: {
          DEFAULT:    "#080C14",
          foreground: "#EDF0F6",
          border:     "#1C2233",
        },

        // ── Primary — neutral cool slate ────────────────────────────────────
        // Light: hsl(263 83% 58%) → #7C3AED (purple)
        primary: {
          DEFAULT:    "#AFBBCD",
          foreground: "#0A0E18",
          border:     "#BEC7D4",
        },

        // ── Neutrals ────────────────────────────────────────────────────────
        secondary: {
          DEFAULT:    "#13192A",
          foreground: "#EDF0F6",
          border:     "#1C2436",
        },
        muted: {
          DEFAULT:    "#111720",
          foreground: "#B3BDD1",
          border:     "#1A2130",
        },
        accent: {
          DEFAULT:    "#171E2B",
          foreground: "#EDF0F6",
          border:     "#202A3A",
        },

        // ── Danger ──────────────────────────────────────────────────────────
        destructive: {
          DEFAULT:    "#E44242",
          foreground: "#FFFFFF",
          border:     "#E85555",
        },

        // ── Sidebar ─────────────────────────────────────────────────────────
        sidebar: {
          DEFAULT:              "#080C14",
          foreground:           "#EDF0F6",
          border:               "#141C2B",
          primary:              "#9EAABB",
          "primary-foreground": "#050709",
          "primary-border":     "#ADBAC9",
          accent:               "#0F1525",
          "accent-foreground":  "#EDF0F6",
          "accent-border":      "#172035",
          ring:                 "#848EA0",
        },

        // ── Chart / semantic ─────────────────────────────────────────────────
        // Source: --chart-* in :root
        chart: {
          1: "#00E5B0",  // hsl(163 100% 45%) — teal/mint  profit/buy
          2: "#5BAEFF",  // hsl(212 100% 68%) — blue       secondary
          3: "#E44242",  // hsl(  0  72% 56%) — red        loss/sell
          4: "#F2AD2C",  // hsl( 38  90% 58%) — amber
          5: "#6B7FE8",  // hsl(230  72% 62%) — blue-violet
        },

        // ── Profit / Loss semantic ────────────────────────────────────────────
        profit: "#00E5B0",   // --accent-teal-400 dark
        loss:   "#EF4444",

        // ── Teal accent (--accent-teal-400/500) ───────────────────────────────
        teal: {
          400: "#00E5B0",
          500: "#00CCA0",
        },

        // ── Light-mode purple accent ───────────────────────────────────────────
        // Used when light theme is active (--primary light = #7C3AED)
        purple: {
          400: "#A78BFA",
          500: "#7C3AED",
          600: "#6D28D9",
        },

        // ── Static surface constants ───────────────────────────────────────────
        "surface-header":   "#000000",
        "surface-backdrop": "rgba(0,0,0,0.70)",
        "body-bg":          "#05070A",

        // ── Balance value color (dark: light grey; light: dark ink) ───────────
        "balance-value": "#E6E6E6",
      },

      // ── Border Radius ─────────────────────────────────────────────────────
      // Source: --radius: 1rem (16px) + calc variants
      //   --radius-sm: calc(1rem - 6px) = 10px
      //   --radius-md: calc(1rem - 4px) = 12px
      //   --radius-lg: 1rem             = 16px
      //   --radius-xl: calc(1rem + 4px) = 20px
      borderRadius: {
        none: "0px",
        sm:   "10px",
        md:   "12px",
        DEFAULT: "16px",
        lg:   "16px",
        xl:   "20px",
        "2xl":"24px",
        "3xl":"28px",
        "4xl":"32px",
        full: "9999px",
      },

      // ── Font sizes ────────────────────────────────────────────────────────
      fontSize: {
        "2xs": ["10px", { lineHeight: "14px" }],
        xs:    ["12px", { lineHeight: "16px" }],
        sm:    ["14px", { lineHeight: "20px" }],
        base:  ["16px", { lineHeight: "24px" }],
        lg:    ["18px", { lineHeight: "28px" }],
        xl:    ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
        "3xl": ["30px", { lineHeight: "36px" }],
        "4xl": ["36px", { lineHeight: "40px" }],
        "5xl": ["48px", { lineHeight: "52px" }],
      },

      // ── Font families ─────────────────────────────────────────────────────
      // Source: --app-font-sans in :root
      fontFamily: {
        sans:     ["Inter_400Regular", "Inter", "System"],
        medium:   ["Inter_500Medium",  "Inter", "System"],
        semibold: ["Inter_600SemiBold","Inter", "System"],
        bold:     ["Inter_700Bold",    "Inter", "System"],
        mono:     ["JetBrains Mono", "Courier New", "monospace"],
      },

      // ── Spacing ───────────────────────────────────────────────────────────
      // Source: --spacing: 0.25rem = 4px base unit
      spacing: {
        0:    "0px",
        0.5:  "2px",
        1:    "4px",
        1.5:  "6px",
        2:    "8px",
        2.5:  "10px",
        3:    "12px",
        3.5:  "14px",
        4:    "16px",
        5:    "20px",
        6:    "24px",
        7:    "28px",
        8:    "32px",
        9:    "36px",
        10:   "40px",
        11:   "44px",
        12:   "48px",
        14:   "56px",
        16:   "64px",
        20:   "80px",
        24:   "96px",
        28:   "112px",
        32:   "128px",
        36:   "144px",
        40:   "160px",
        44:   "176px",
        48:   "192px",
        52:   "208px",
        56:   "224px",
        60:   "240px",
        64:   "256px",
        72:   "288px",
        80:   "320px",
        96:   "384px",
      },

      // ── Box Shadows (single-layer — RN supports one shadow per view) ──────
      // Source: --shadow-* in :root (dark mode values)
      boxShadow: {
        "2xs":  "0px 1px 3px rgba(0,0,0,0.60)",
        xs:     "0px 1px 5px rgba(0,0,0,0.62)",
        sm:     "0px 2px 10px rgba(0,0,0,0.64)",
        DEFAULT:"0px 4px 20px rgba(0,0,0,0.68)",
        md:     "0px 6px 28px rgba(0,0,0,0.70)",
        lg:     "0px 12px 40px rgba(0,0,0,0.74)",
        xl:     "0px 24px 64px rgba(0,0,0,0.78)",
        "2xl":  "0px 40px 90px rgba(0,0,0,0.82)",
        // Glow variants (source: --glow-teal-sm / --glow-cyan-sm)
        "glow-teal-sm": "0px 0px 16px rgba(255,255,255,0.05)",
        "glow-teal-md": "0px 0px 28px rgba(255,255,255,0.07)",
        "glow-cyan-sm": "0px 0px 14px rgba(93,169,255,0.14)",
        none: "none",
      },

      // ── Transition durations (mirrors CSS animation durations in index.css) ─
      transitionDuration: {
        DEFAULT: "150ms",
        75:      "75ms",
        100:     "100ms",
        150:     "150ms",
        200:     "200ms",
        220:     "220ms",   // used extensively in MobileBottomNav
        260:     "260ms",
        300:     "300ms",
        320:     "320ms",
        500:     "500ms",
        650:     "650ms",
        700:     "700ms",
        1000:    "1000ms",
      },

      // ── Opacity scale ─────────────────────────────────────────────────────
      opacity: {
        0:   "0",
        4:   "0.04",
        5:   "0.05",
        6:   "0.06",
        7:   "0.07",
        8:   "0.08",
        9:   "0.09",
        10:  "0.10",
        12:  "0.12",
        14:  "0.14",
        16:  "0.16",
        18:  "0.18",
        20:  "0.20",
        25:  "0.25",
        30:  "0.30",
        40:  "0.40",
        44:  "0.44",
        46:  "0.46",
        50:  "0.50",
        55:  "0.55",
        60:  "0.60",
        65:  "0.65",
        70:  "0.70",
        72:  "0.72",
        75:  "0.75",
        80:  "0.80",
        85:  "0.85",
        88:  "0.88",
        90:  "0.90",
        92:  "0.92",
        94:  "0.94",
        95:  "0.95",
        96:  "0.96",
        97:  "0.97",
        100: "1",
      },
    },
  },

  plugins: [],
};
