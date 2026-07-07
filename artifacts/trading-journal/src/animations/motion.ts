/**
 * Motion.dev (motion/react) — shared animation configs, spring presets, and
 * variant definitions. Import from here rather than hard-coding values inline.
 *
 * GPU rule: all variants animate ONLY `opacity`, `transform` properties
 * (x, y, scale, rotate). No layout-triggering props (width, height, margin, etc.).
 */
import type { Transition, Variants } from "motion/react";

// ── Easing curves ─────────────────────────────────────────────────────────
export const EASE_OUT_EXPO   = [0.16, 1, 0.3, 1]       as const;
export const EASE_IN_OUT     = [0.4, 0, 0.2, 1]         as const;
export const EASE_PREMIUM    = [0.22, 1, 0.36, 1]       as const;
export const EASE_BACK_OUT   = [0.34, 1.56, 0.64, 1]    as const;

// ── Spring physics presets ────────────────────────────────────────────────
/** Quick snappy response — buttons, badges */
export const SPRING_FAST: Transition = {
  type: "spring", stiffness: 480, damping: 30, mass: 0.8,
};

/** Default smooth spring — most UI elements */
export const SPRING_SMOOTH: Transition = {
  type: "spring", stiffness: 240, damping: 26, mass: 0.9,
};

/** Heavier, stately — sidebars, large panels */
export const SPRING_PANEL: Transition = {
  type: "spring", stiffness: 200, damping: 30, mass: 1,
};

/** Subtle bounce — cards, lists */
export const SPRING_BOUNCY: Transition = {
  type: "spring", stiffness: 300, damping: 20, mass: 0.8,
};

/** Ultra-gentle float — subtle reveals */
export const SPRING_GENTLE: Transition = {
  type: "spring", stiffness: 120, damping: 20, mass: 1.2,
};

/** Modal pop */
export const SPRING_MODAL: Transition = {
  type: "spring", stiffness: 320, damping: 28, mass: 0.9,
};

// ── Page transitions ──────────────────────────────────────────────────────
// Pure opacity — the only property guaranteed to work correctly inside
// overflow:hidden containers with simultaneously-switching layout wrappers.
// y/scale movements fight against the instant container-switch in Layout
// and produce visual snaps; plain opacity masks them cleanly.

/** Default page swap — fast cross-fade. */
export const pageVariants: Variants = {
  initial: { opacity: 0 },
  enter:   { opacity: 1, transition: { duration: 0.2,  ease: [0.0, 0.0, 0.2, 1] } },
  exit:    { opacity: 0, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } },
};

/**
 * Detail page (e.g. Portfolio) — fade + gentle zoom-in.
 * Scale stays within container bounds (0.97 < 1) so overflow:hidden never clips.
 * The subtle scale gives a distinct "expanding into detail" feel vs plain pages.
 */
export const pageDetailVariants: Variants = {
  initial: { opacity: 0, scale: 0.97 },
  enter:   { opacity: 1, scale: 1, transition: { duration: 0.24, ease: [0.0, 0.0, 0.2, 1] } },
  exit:    { opacity: 0, scale: 0.98, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
};

// ── Sidebar ───────────────────────────────────────────────────────────────
export const sidebarVariants: Variants = {
  closed: {
    x: -280,
    transition: { ...SPRING_PANEL, duration: 0.22 },
  },
  open: {
    x: 0,
    transition: { ...SPRING_PANEL },
  },
};

export const sidebarBackdropVariants: Variants = {
  closed: { opacity: 0, transition: { duration: 0.18 } },
  open:   { opacity: 1, transition: { duration: 0.22 } },
};

/** Staggered sidebar nav items */
export const sidebarItemVariants: Variants = {
  closed: { x: -12, opacity: 0 },
  open:   (i: number) => ({
    x: 0, opacity: 1,
    transition: { ...SPRING_SMOOTH, delay: i * 0.03 },
  }),
};

// ── Modals / Sheets ───────────────────────────────────────────────────────
export const backdropVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22 } },
  exit:    { opacity: 0, transition: { duration: 0.18 } },
};

/** Bottom sheet / drawer */
export const sheetVariants: Variants = {
  hidden:  { y: "100%", opacity: 0.5 },
  visible: { y: "0%",   opacity: 1, transition: { ...SPRING_PANEL } },
  exit:    { y: "100%", opacity: 0.3, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } },
};

/** Centered dialog */
export const dialogVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.90, y: 20 },
  visible: { opacity: 1, scale: 1,    y: 0,  transition: { ...SPRING_MODAL } },
  exit:    { opacity: 0, scale: 0.96, y: 10, transition: { duration: 0.16 } },
};

// ── Cards ─────────────────────────────────────────────────────────────────
export const cardVariants: Variants = {
  hidden:  { opacity: 0, y: 20, scale: 0.96 },
  visible: (i: number = 0) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { ...SPRING_BOUNCY, delay: i * 0.055 },
  }),
};

// ── Lists ─────────────────────────────────────────────────────────────────
export const listContainerVariants: Variants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.065, delayChildren: 0.04 } },
  exit:    { transition: { staggerChildren: 0.03, staggerDirection: -1 } },
};

export const listItemVariants: Variants = {
  hidden:  { opacity: 0, x: -14, scale: 0.96 },
  visible: { opacity: 1, x: 0,   scale: 1,    transition: { ...SPRING_SMOOTH } },
  exit:    { opacity: 0, x: -8,  scale: 0.97, transition: { duration: 0.14 } },
};

// ── Generic reveal variants ───────────────────────────────────────────────
export const fadeVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.28 } },
  exit:    { opacity: 0, transition: { duration: 0.18 } },
};

export const slideUpVariants: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0,  transition: { ...SPRING_SMOOTH } },
  exit:    { opacity: 0, y: 12, transition: { duration: 0.16 } },
};

export const slideDownVariants: Variants = {
  hidden:  { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0,   transition: { ...SPRING_SMOOTH } },
  exit:    { opacity: 0, y: -10, transition: { duration: 0.16 } },
};

export const slideLeftVariants: Variants = {
  hidden:  { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0,  transition: { ...SPRING_SMOOTH } },
  exit:    { opacity: 0, x: 12, transition: { duration: 0.16 } },
};

export const slideRightVariants: Variants = {
  hidden:  { opacity: 0, x: -24 },
  visible: { opacity: 1, x: 0,   transition: { ...SPRING_SMOOTH } },
  exit:    { opacity: 0, x: -12, transition: { duration: 0.16 } },
};

export const scaleVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.86 },
  visible: { opacity: 1, scale: 1,    transition: { ...SPRING_BOUNCY } },
  exit:    { opacity: 0, scale: 0.94, transition: { duration: 0.15 } },
};

// ── Buttons ───────────────────────────────────────────────────────────────
export const buttonConfig = {
  whileTap:   { scale: 0.93 },
  whileHover: { scale: 1.04 },
  transition: SPRING_FAST as Transition,
};

export const iconButtonConfig = {
  whileTap:   { scale: 0.88 },
  whileHover: { scale: 1.08, rotate: 4 },
  transition: SPRING_FAST as Transition,
};
