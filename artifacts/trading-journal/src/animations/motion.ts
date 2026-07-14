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
// GPU-safe: only opacity + transform (x, y, scale).
// All transitions favour opacity-led cross-fades to avoid the "page shifting"
// feel of full-width slides. Directional cues come from small x offsets (≤28px)
// rather than viewport-width travel, keeping content visually stable.

/**
 * Default page swap — fade + subtle slide-up.
 * Used for sidebar / non-tab pages (mode="wait").
 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter:   { opacity: 1, y: 0,  transition: { duration: 0.22, ease: EASE_OUT_EXPO } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] } },
};

/**
 * Tab page — direction-aware fade-shift for bottom-tab navigation.
 *
 * `custom` is the direction integer forwarded from AnimatePresence:
 *   > 0  → higher-index tab  (enter fades in from +28px right, exits to -28px left)
 *   < 0  → lower-index tab   (enter fades in from -28px left,  exits to +28px right)
 *   = 0  → non-tab cross-nav → plain opacity cross-fade
 *
 * Small x offset (28px) instead of full viewport width — gives directionality
 * without the jarring slide-across effect.
 */
const TAB_X = 28;
export const tabPageVariants: Variants = {
  initial: (dir: number) => ({
    x:       dir === 0 ? 0 : (dir > 0 ? TAB_X : -TAB_X),
    opacity: 0,
  }),
  enter: (_dir: number) => ({
    x:          0,
    opacity:    1,
    transition: { duration: 0.22, ease: EASE_OUT_EXPO },
  }),
  exit: (dir: number) => ({
    x:          dir === 0 ? 0 : (dir > 0 ? -TAB_X : TAB_X),
    opacity:    0,
    transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
  }),
};

/**
 * Detail page (e.g. Portfolio) — fade + gentle zoom-in.
 * Scale stays within container bounds (0.97–1) so overflow:hidden never clips.
 */
export const pageDetailVariants: Variants = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  enter:   { opacity: 1, scale: 1,    y: 0, transition: { duration: 0.26, ease: EASE_PREMIUM } },
  exit:    { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } },
};

/**
 * Cover-detail page (e.g. Portfolio when rendered position:fixed over keep-alive
 * pages). Identical feel to pageDetailVariants but starts fully opaque so it
 * immediately occludes the Layout header and any keep-alive content below it —
 * a page that starts at opacity:0 lets lower z-index elements show through
 * during the fade-in, causing a visible "header-over-new-page" flash.
 */
export const pageDetailCoverVariants: Variants = {
  initial: { scale: 0.97, y: 8 },         // no opacity:0 — covers immediately
  enter:   { scale: 1,    y: 0, transition: { duration: 0.24, ease: EASE_PREMIUM } },
  exit:    { opacity: 0,  scale: 0.98, y: 4, transition: { duration: 0.15, ease: [0.4, 0, 1, 1] } },
};

/**
 * Full-screen slide page (e.g. Position Detail) — native mobile push/pop.
 * Enters by sliding in from the right; exits by sliding back to the right.
 * This gives the standard iOS/Android push-navigation feel.
 */
export const pageSlideVariants: Variants = {
  initial: { x: "100%", opacity: 0 },
  enter:   { x: 0,      opacity: 1, transition: { duration: 0.30, ease: EASE_PREMIUM } },
  exit:    { x: "100%", opacity: 0, transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } },
};

/** Staggered sidebar nav items */
export const sidebarItemVariants: Variants = {
  closed: { x: -12, opacity: 0 },
  open:   (i: number) => ({
    x: 0, opacity: 1,
    transition: { ...SPRING_SMOOTH, delay: i * 0.03 },
  }),
};

// ── Compositor CSS-transition system ─────────────────────────────────────
/**
 * The shared full-screen-overlay animation system: pure CSS transitions on
 * `opacity` + `transform` only, run entirely on the GPU compositor thread —
 * NOT framer-motion's JS-driven `animate()`. Chart tick engines / RAF loops
 * running on the main thread can never block or stutter these.
 *
 * Originally authored for ProfileMenu's dropdown; this is the single source
 * of truth so every full-screen/overlay panel (Profile dropdown, Navigation
 * Drawer, Notification sheet, …) that wants "the same feel" imports these
 * exact values instead of re-deriving its own durations/easing.
 *
 * Panel:    opacity + transform · 180ms open / 120ms close · EASE_PREMIUM
 * Backdrop: opacity only        · 140ms open / 120ms close · browser "ease"
 */
export const COMPOSITOR_EASE = "cubic-bezier(0.22,1,0.36,1)";

export const COMPOSITOR_PANEL_DURATION_OPEN  = "0.18s";
export const COMPOSITOR_PANEL_DURATION_CLOSE = "0.12s";
export const COMPOSITOR_FADE_DURATION_OPEN   = "0.14s";
export const COMPOSITOR_FADE_DURATION_CLOSE  = "0.12s";

/** `transition` string for the animated opacity+transform panel layer. */
export function compositorPanelTransition(open: boolean): string {
  const dur = open ? COMPOSITOR_PANEL_DURATION_OPEN : COMPOSITOR_PANEL_DURATION_CLOSE;
  return `opacity ${dur} ${COMPOSITOR_EASE}, transform ${dur} ${COMPOSITOR_EASE}`;
}

/** `transition` string for the opacity-only backdrop / static blur layer. */
export function compositorFadeTransition(open: boolean): string {
  const dur = open ? COMPOSITOR_FADE_DURATION_OPEN : COMPOSITOR_FADE_DURATION_CLOSE;
  return `opacity ${dur} ease`;
}

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
