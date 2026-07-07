/**
 * PageTransition — wraps page content with enter / exit animations.
 *
 * Place around route content. Use `key={route}` on each conditional so
 * AnimatePresence correctly tracks enter/exit per page.
 *
 * GPU-safe: opacity + transform (x, y, scale) only.
 *
 * variant="page"   — default vertical lift + fade (top-level pages)
 * variant="detail" — horizontal slide-in from right (drill-down pages, e.g. Portfolio)
 */
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { pageVariants, pageDetailVariants } from "@/animations/motion";

interface PageTransitionProps {
  children:   React.ReactNode;
  className?: string;
  style?:     React.CSSProperties;
  variant?:   "page" | "detail";
}

export function PageTransition({ children, className, style, variant = "page" }: PageTransitionProps) {
  const reduced = useReducedMotion();

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
