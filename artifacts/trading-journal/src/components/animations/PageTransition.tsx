/**
 * PageTransition — wraps page content with enter / exit animations.
 *
 * Place around route content. Use `key={route}` on each conditional so
 * AnimatePresence correctly tracks enter/exit per page.
 *
 * GPU-safe: opacity + transform (x, y, scale) only.
 *
 * variant="page"   — default opacity cross-fade (sidebar pages)
 * variant="detail" — fade + gentle zoom-in (drill-down pages, e.g. Portfolio)
 * variant="tab"    — direction-aware horizontal slide (bottom-tab pages).
 *                    Requires `custom` (direction int) forwarded from AnimatePresence.
 *                    Renders position:absolute;inset:0 so two pages can coexist
 *                    side-by-side during AnimatePresence mode="sync" transitions.
 */
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { pageVariants, pageDetailVariants, tabPageVariants } from "@/animations/motion";

interface PageTransitionProps {
  children:   React.ReactNode;
  className?: string;
  style?:     React.CSSProperties;
  variant?:   "page" | "detail" | "tab";
  /** Direction integer for variant="tab" — forwarded from AnimatePresence custom prop. */
  custom?:    number;
}

export function PageTransition({ children, className, style, variant = "page", custom }: PageTransitionProps) {
  const reduced = useReducedMotion();

  // Tab variant: absolute overlay so both entering/exiting pages fit side-by-side.
  if (variant === "tab") {
    if (reduced) {
      return (
        <div className={className} style={{ position: "absolute", inset: 0, ...style }}>
          {children}
        </div>
      );
    }
    return (
      <motion.div
        className={className}
        custom={custom}
        style={{ position: "absolute", inset: 0, willChange: "transform, opacity", ...style }}
        variants={tabPageVariants}
        initial="initial"
        animate="enter"
        exit="exit"
      >
        {children}
      </motion.div>
    );
  }

  if (reduced) {
    return <div className={className} style={style}>{children}</div>;
  }

  const variants = variant === "detail" ? pageDetailVariants : pageVariants;

  return (
    <motion.div
      className={className}
      style={{ ...style, willChange: "transform, opacity" }}
      variants={variants}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
