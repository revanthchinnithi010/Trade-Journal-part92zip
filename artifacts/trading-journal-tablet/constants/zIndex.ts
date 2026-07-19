/**
 * Z-index / elevation layer constants — React Native port of src/constants/zIndex.ts
 *
 * React Native stacking model
 * ───────────────────────────
 * • zIndex works on any <View> on both platforms and behaves like CSS z-index
 *   within the same stacking context (siblings within the same parent).
 * • Android additionally requires `elevation` to guarantee a View renders
 *   above siblings and casts a drop shadow.  Without elevation, Android may
 *   ignore zIndex for Views that cross stacking-context boundaries (e.g. a
 *   portal rendered via a Modal or absolute-positioned root View).
 * • iOS honours zIndex without elevation; elevation has no effect on iOS.
 *
 * Recommended usage
 * ─────────────────
 *   import { LAYERS, ELEVATION } from "@/constants/zIndex";
 *
 *   // zIndex only (iOS + Android same stacking context):
 *   <View style={{ zIndex: LAYERS.modal }}>…</View>
 *
 *   // zIndex + elevation (guaranteed cross-context stacking on Android):
 *   <View style={{ zIndex: LAYERS.modal, elevation: ELEVATION.modal }}>…</View>
 *
 * Values
 * ──────
 * All numeric values are RN-friendly integers.  No CSS-only concepts
 * (auto, inherit, unset) are used.  Position styles are NOT included here —
 * use StyleSheet in components.
 */

// ─────────────────────────────────────────────────────────────────────────────
// LAYERS — z-index values for every semantic UI layer
// ─────────────────────────────────────────────────────────────────────────────

export const LAYERS = {
  // ── Web-origin layers (public API preserved verbatim) ──────────────────────
  chart:          1,
  toolbar:        100,
  floatingWidget: 200,
  settingsPanel:  500,
  subPopup:       600,
  colorPicker:    700,
  modalOverlay:   2000,

  // ── React Native extended semantic layers ──────────────────────────────────
  /** Decorative backgrounds, chart canvas, map tiles. */
  background:     0,
  /** Main scrollable content area. */
  content:        1,
  /** Floating action buttons, persistent floating chips. */
  floating:       200,
  /** Inline dropdowns / select menus anchored to a field. */
  dropdown:       400,
  /** Tooltip bubbles shown on long-press or hover. */
  tooltip:        700,
  /** Full-screen or sheet modals. */
  modal:          2000,
  /** Bottom sheets (action sheets, pickers, drawer panels). */
  bottomSheet:    800,
  /** Ephemeral toasts / snackbars rendered above everything except overlays. */
  toast:          900,
  /** Semi-transparent screen overlays (dimming, blocking). */
  overlay:        1000,
  /** Full-screen takeovers (onboarding, camera, immersive views). */
  fullscreen:     3000,
} as const;

/** The union of all valid LAYERS values. */
export type LayerValue = (typeof LAYERS)[keyof typeof LAYERS];

// ─────────────────────────────────────────────────────────────────────────────
// ELEVATION — Android elevation values (dp) matching each semantic layer
//
// Rules of thumb:
//   • Elevation must be ≥ 0.
//   • Higher elevation = larger shadow + guaranteed rendering above lower views.
//   • On iOS these values are ignored; include them for cross-platform code
//     without branching.
//   • Values intentionally stay below 24 dp (Material Design ceiling for
//     floating elements) except for fullscreen which uses 0 (occupies the
//     whole screen, no siblings to compete with).
// ─────────────────────────────────────────────────────────────────────────────

export const ELEVATION = {
  background:     0,
  content:        0,
  chart:          1,
  toolbar:        4,
  floatingWidget: 6,
  floating:       6,
  dropdown:       8,
  settingsPanel:  8,
  subPopup:       10,
  tooltip:        12,
  colorPicker:    12,
  bottomSheet:    16,
  toast:          18,
  overlay:        20,
  modal:          24,
  modalOverlay:   24,
  fullscreen:     0,   // occupies full screen — no sibling competition
} as const satisfies Record<keyof typeof LAYERS, number>;

/** The union of all valid ELEVATION values. */
export type ElevationValue = (typeof ELEVATION)[keyof typeof ELEVATION];
