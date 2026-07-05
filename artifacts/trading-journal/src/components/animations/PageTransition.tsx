/**
 * PageTransition — wraps page content with enter / exit animations.
 *
 * Place around route content. Use `key={location}` on the parent
 * AnimatePresence so the old page exits before the new one enters.
 *
 * GPU-safe: opacity + transform (y, scale) only.
 */
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { pageVariants } from "@/animations/motion";

interface PageTransitionProps {
  children:  React.ReactNode;
  className?: string;
  style?:    React.CSSProperties;
}

export function PageTransition({ children, className, style }: PageTransitionProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div className={className} style={style}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      style={{ ...style, willChange: "transform, opacity" }}
      variants={pageVariants}
      initial="initial"
      animate="enter"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
