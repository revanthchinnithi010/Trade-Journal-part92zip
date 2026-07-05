/**
 * AnimatedList — staggered list container + item using Motion.dev.
 * Wraps any list structure; children receive the item variant automatically.
 *
 * GPU-safe: opacity + transform only.
 */
import { motion, AnimatePresence } from "motion/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { listContainerVariants, listItemVariants } from "@/animations/motion";

interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof HTMLElementTagNameMap;
}

/** Wrap your `<ul>` / `<div>` container in this to get stagger enter. */
export function AnimatedList({
  children,
  className,
  style,
  as = "div",
}: AnimatedListProps) {
  const reduced = useReducedMotion();
  const Tag = as as "div";

  if (reduced) {
    return <Tag className={className} style={style}>{children}</Tag>;
  }

  const MotionTag = motion[as as "div"] ?? motion.div;

  return (
    <MotionTag
      className={className}
      style={style}
      variants={listContainerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </MotionTag>
  );
}

interface AnimatedListItemProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof HTMLElementTagNameMap;
  onClick?: () => void;
  /** Show a tap-scale feedback */
  tappable?: boolean;
}

/** Wrap each list item in this — works inside AnimatedList or standalone. */
export function AnimatedListItem({
  children,
  className,
  style,
  as = "div",
  onClick,
  tappable = false,
}: AnimatedListItemProps) {
  const reduced = useReducedMotion();
  const Tag = as as "div";

  if (reduced) {
    return <Tag className={className} style={style} onClick={onClick}>{children}</Tag>;
  }

  const MotionTag = motion[as as "div"] ?? motion.div;

  return (
    <MotionTag
      className={className}
      style={{ ...style, willChange: "transform, opacity" }}
      variants={listItemVariants}
      onClick={onClick}
      whileTap={tappable ? { scale: 0.97 } : undefined}
    >
      {children}
    </MotionTag>
  );
}

// ── Presence-aware list (for add/remove animations) ───────────────────────
interface PresenceListProps<T> {
  items:         T[];
  keyExtractor:  (item: T) => string | number;
  renderItem:    (item: T, index: number) => React.ReactNode;
  className?:    string;
  style?:        React.CSSProperties;
  emptyState?:   React.ReactNode;
}

/**
 * Renders a list with AnimatePresence so items animate in/out individually.
 * Each item must have a stable key via `keyExtractor`.
 */
export function AnimatedPresenceList<T>({
  items,
  keyExtractor,
  renderItem,
  className,
  style,
  emptyState,
}: PresenceListProps<T>) {
  const reduced = useReducedMotion();

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  if (reduced) {
    return (
      <div className={className} style={style}>
        {items.map((item, i) => renderItem(item, i))}
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      <AnimatePresence mode="popLayout" initial={false}>
        {items.map((item, i) => (
          <motion.div
            key={keyExtractor(item)}
            variants={listItemVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            layout
            style={{ willChange: "transform, opacity" }}
          >
            {renderItem(item, i)}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
