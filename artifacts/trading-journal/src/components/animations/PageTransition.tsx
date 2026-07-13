/**
 * PageTransition — wraps page content with enter / exit animations.
 *
 * Place around route content. Use `key={route}` on each conditional so
 * AnimatePresence correctly tracks enter/exit per page.
 *
 * GPU-safe: opacity + transform (x, y, scale) only.
 *
 * By default (`fill=true`) variants use position:absolute;inset:0 so the page
 * fills the absolute container in Layout and layers correctly with the Charts
 * keep-alive layer. With AnimatePresence mode="wait" only one page is in the
 * DOM at a time, so there is never an overlap — but consistent absolute
 * positioning prevents any height/flow issues regardless.
 *
 * Pass `fill={false}` when using PageTransition as an INNER content wrapper
 * inside an already-scrollable container (e.g. StandardPageWrapper) rather
 * than as the top-level route wrapper. Absolutely-positioned content does not
 * contribute to its scroll-parent's scrollHeight, which silently breaks
 * scrolling — `fill={false}` keeps the element in normal document flow so its
 * height (and therefore the scroll container's scrollable height) is correct.
 *
 * variant="page"   — fade + subtle slide-up (sidebar / utility pages)
 * variant="detail" — fade + gentle zoom-in (drill-down pages, e.g. Portfolio)
 * variant="tab"    — direction-aware fade-shift (bottom-tab pages). Small x offset
 *                    (±28px) + opacity gives directional cues without full-width sliding.
 *                    Requires `custom` (direction int) forwarded from AnimatePresence.
 */
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { pageVariants, pageDetailVariants, tabPageVariants, pageSlideVariants } from "@/animations/motion";

interface PageTransitionProps {
  children:   React.ReactNode;
  className?: string;
  style?:     React.CSSProperties;
  variant?:   "page" | "detail" | "tab" | "slide";
  /** Direction integer — forwarded from AnimatePresence custom prop. */
  custom?:    number;
  /**
   * Whether to absolutely-position and stretch to fill the parent (default).
   * Set to false for inner/nested usage inside a scrollable wrapper so the
   * element stays in normal flow and doesn't break the ancestor's scrollHeight.
   */
  fill?:      boolean;
}

/** Base style applied when fill=true: stretches to fill the absolute container in Layout. */
const BASE_STYLE: React.CSSProperties = {
  position:    "absolute",
  inset:        0,
  willChange:  "transform, opacity",
};

export function PageTransition({ children, className, style, variant = "page", custom, fill = true }: PageTransitionProps) {
  const reduced = useReducedMotion();

  const combinedStyle = fill ? { ...BASE_STYLE, ...style } : { willChange: "transform, opacity", ...style };

  if (reduced) {
    return (
      <div className={className} style={combinedStyle}>
        {children}
      </div>
    );
  }

  const variants =
    variant === "tab"    ? tabPageVariants    :
    variant === "detail" ? pageDetailVariants :
    variant === "slide"  ? pageSlideVariants  :
                           pageVariants;

  return (
    <motion.div
      className={className}
      custom={custom}
      style={combinedStyle}
      variants={variants}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
