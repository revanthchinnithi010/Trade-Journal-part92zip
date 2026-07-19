/**
 * Drawing type definitions — React Native port of src/types/drawing.ts
 *
 * Modifications vs the web original
 * ──────────────────────────────────
 * None.  This file contains only pure TypeScript business-domain types,
 * runtime constants, and pure-JS helper functions.  There are no DOM APIs,
 * no browser event types, no HTMLElement references, and no HTML-specific
 * interfaces.  Every type, constant, and function is copied verbatim.
 */

// ---------------------------------------------------------------------------
// ToolType — union of every available chart drawing / annotation tool
// ---------------------------------------------------------------------------

export type ToolType =
  | "cursor"
  | "trendline"
  | "extended"
  | "ray"
  | "hline"
  | "hray"
  | "vline"
  | "channel"
  | "rect"
  | "ellipse"
  | "fib"
  | "fib_channel"
  | "arrow"
  | "brush"
  | "highlighter"
  | "path"
  | "curve"
  | "text"
  | "note"
  | "position_long"
  | "position_short"
  | "ruler"
  | "date_range"
  | "price_range"
  | "eraser";

// ---------------------------------------------------------------------------
// DrawingPoint — a single anchor on the chart (chart-time × price space)
// ---------------------------------------------------------------------------

export interface DrawingPoint {
  time:  number;
  price: number;
}

// ---------------------------------------------------------------------------
// DrawingStyle — visual properties for a drawing
// ---------------------------------------------------------------------------

export interface DrawingStyle {
  color:       string;
  thickness:   number;
  lineStyle:   "solid" | "dashed" | "dotted";
  fillOpacity: number;
  opacity?:    number;
  text?:       string;
  extendLeft?:         boolean;
  extendRight?:        boolean;
  showMiddlePoint?:    boolean;
  showPriceLabels?:    boolean;
  textColor?:          string;
  fontSize?:           number;
  fontBold?:           boolean;
  fontItalic?:         boolean;
  textAlignH?:         "left" | "center" | "right";
  textAlignV?:         "top" | "middle" | "bottom";
  visibleTimeframes?:  string[];
  /** Position tool profit zone colour (hex, e.g. "#089981"). */
  profitColor?: string;
  /** Position tool stop zone colour (hex, e.g. "#F23645"). */
  stopColor?:   string;
  /** Label / text colour for drawings that render a label. */
  labelColor?:  string;
}

// ---------------------------------------------------------------------------
// DEFAULT_STYLE — baseline DrawingStyle applied to newly created drawings
// ---------------------------------------------------------------------------

export const DEFAULT_STYLE: DrawingStyle = {
  color:       "#B7FF5A",
  thickness:   2,
  lineStyle:   "solid",
  fillOpacity: 0.1,
};

// ---------------------------------------------------------------------------
// Drawing — a fully-persisted chart annotation
// ---------------------------------------------------------------------------

export interface Drawing {
  id:        number;
  symbol:    string;
  timeframe: string;
  toolType:  ToolType;
  points:    DrawingPoint[];
  style:     DrawingStyle;
  isLocked:  boolean;
  isVisible: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Returns true for freehand tools (brush, highlighter) whose point arrays
 *  grow continuously during a stroke rather than snapping to N fixed anchors. */
export function isFreehand(tool: ToolType): boolean {
  return tool === "brush" || tool === "highlighter";
}

/** Returns the number of anchor points a tool requires before it is
 *  considered fully placed.  Freehand tools return Infinity. */
export function pointsNeeded(tool: ToolType): number {
  if (
    tool === "hline"  ||
    tool === "hray"   ||
    tool === "vline"  ||
    tool === "eraser" ||
    tool === "text"   ||
    tool === "note"
  ) return 1;
  if (isFreehand(tool)) return Infinity;
  return 2;
}
