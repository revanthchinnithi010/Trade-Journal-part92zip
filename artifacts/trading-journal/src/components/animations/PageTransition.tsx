/**
 * PageTransition — wraps page content with enter / exit animations.
 *
 * Place around route content. Use `key={route}` on each conditional so
 * AnimatePresence correctly tracks enter/exit per page.
 *
 * GPU-safe: opacity + transform (x, y, scale) only.
 *
 * All variants use position:absolute;inset:0 so every page fills the absolute
 * container in Layout and layers correctly with the Charts keep-alive layer.
 * With AnimatePresence mode="wait" only one page is in the DOM at a time, so
 * there is never an overlap — but consistent absolute positioning prevents any
 * height/flow issues regardless.
 *
 * variant="page"   — fade + subtle slide-up (sidebar / utility pages)
 * variant="detail" — fade + gentle zoom-in (drill-down pages, e.g. Portfolio)
 * variant="tab"    — direction-aware fade-shift (bottom-tab pages). Small x offset
 *                    (±28px) + opacity gives directional cues without full-width sliding.
 *                    Requires `custom` (direction int) forwarded from AnimatePresence.
 */
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { pageVariants, pageDetailVariants, tabPageVariants } from "@/animations/motion";

interface PageTransitionProps {
  children:   React.ReactNode;
  className?: string;
  style?:     React.CSSProperties;
  variant?:   "page" | "detail" | "tab";
  /** Direction integer — forwarded from AnimatePresence custom prop. */
  custom?:    number;
}

/** Base style applied to every variant: fills the absolute container in Layout. */
const BASE_STYLE: React.CSSProperties = {
  position:    "absolute",
  inset:        0,
  willChange:  "transform, opacity",
};

export function PageTransition({ children, className, style, variant = "page", custom }: PageTransitionProps) {
  const reduced = useReducedMotion();

  const combinedStyle = { ...BASE_STYLE, ...style };

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
