/**
 * Z-index / elevation layer constants — React Native port of src/constants/zIndex.ts
 *
 * Replacements made vs the web original
 * ──────────────────────────────────────
 * None — the object is identical to the web source.
 *
 * React Native honours `zIndex` inside a `StyleSheet` on both platforms and
 * its semantics match the web: higher values render on top of lower values
 * within the same stacking context.  The numeric values are therefore
 * unchanged from the web version.
 *
 * Platform notes
 * ──────────────
 * iOS   — zIndex works on any View; no extra config needed.
 * Android — zIndex requires `elevation` to be set on the same View when
 *           the component needs to render above its siblings AND cast a
 *           shadow.  For purely logical stacking (no shadow needed) zIndex
 *           alone is sufficient on Android as of RN 0.65+.
 *
 * Usage
 * ─────
 *   import { LAYERS } from "@/constants/zIndex";
 *
 *   <View style={{ zIndex: LAYERS.modalOverlay }}>…</View>
 *
 *   // With elevation (Android shadow + guaranteed stacking):
 *   <View style={{ zIndex: LAYERS.modalOverlay, elevation: LAYERS.modalOverlay }}>…</View>
 */

export const LAYERS = {
  chart:          1,
  toolbar:        100,
  floatingWidget: 200,
  settingsPanel:  500,
  subPopup:       600,
  colorPicker:    700,
  modalOverlay:   2000,
} as const;

/** Convenience type — the union of all valid layer values. */
export type LayerValue = (typeof LAYERS)[keyof typeof LAYERS];
