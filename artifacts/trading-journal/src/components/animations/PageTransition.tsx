/**
 * PageTransition — wraps page content with enter / exit animations.
 *
 * Place around route content. Use `key={route}` on each conditional so
 * AnimatePresence correctly tracks enter/exit per page.
 *
 * GPU-safe: opacity + transform (y) only — no scale, no x-slide.
 *
 * All variants share the same premium motion system: opacity 0.98→1 + 9px
 * translate-Y, 220ms smooth ease-out. The transition is almost imperceptible —
 * content materialises in place rather than performing a visible animation.
 *
 * variant="page" | "tab" | "detail" | "slide"
 *   Standard premium enter/exit. `custom` is accepted but unused (kept for
 *   API compatibility with AnimatePresence).
 *
 * variant="cover-detail"
 *   Same motion but starts fully opaque so it immediately occludes Layout's
 *   header and any keep-alive content below (used for position:fixed overlays
 *   such as Portfolio, Balances, Net-PnL).
 *
 * By default (`fill=true`) variants use position:absolute;inset:0 so the page
 * fills the absolute container in Layout. Pass `fill={false}` for inner/nested
 * usage inside a scrollable container to keep the element in normal flow.
 */
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { pageVariants, pageDetailVariants, pageDetailCoverVariants, tabPageVariants, pageSlideVariants } from "@/animations/motion";

interface PageTransitionProps {
  children:   React.ReactNode;
  className?: string;
  style?:     React.CSSProperties;
  variant?:   "page" | "detail" | "cover-detail" | "tab" | "slide";
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
    variant === "tab"          ? tabPageVariants          :
    variant === "detail"       ? pageDetailVariants       :
    variant === "cover-detail" ? pageDetailCoverVariants  :
    variant === "slide"        ? pageSlideVariants        :
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
