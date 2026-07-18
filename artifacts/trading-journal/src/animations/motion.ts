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
// GPU-safe: only opacity + transform (y).
//
// Single premium motion system — Instagram philosophy.
// Enter: opacity 0.98 → 1, y 9px → 0, 220ms smooth ease-out.
// The transition is almost imperceptible: content materialises in place
// rather than performing a visible animation. No scale, no bounce, no slide.
//
// cover-detail stays fully opaque on enter so it immediately occludes
// the Layout header and any keep-alive content below (opacity:0 start
// lets lower z-index elements bleed through during the fade, causing a flash).

const PAGE_EASE   = [0.25, 0.46, 0.45, 0.94] as const;
const PAGE_ENTER  = { duration: 0.22, ease: PAGE_EASE };
const PAGE_EXIT   = { duration: 0.14, ease: [0.4, 0, 1, 1] as const };

/** Standard page — sidebar and utility pages (non-tab). */
export const pageVariants: Variants = {
  initial: { opacity: 0.98, y: 9 },
  enter:   { opacity: 1,    y: 0,  transition: PAGE_ENTER },
  exit:    { opacity: 0,    y: -4, transition: PAGE_EXIT  },
};

/**
 * Tab pages — pure Instagram-style opacity crossfade. No y translate.
 *
 * Deliberately separated from pageVariants because tab pages (Markets, Trades,
 * Alerts, …) sit inside a Layout whose header height changes between them
 * (e.g. /trades hides the 60px Layout header; /markets does not). Any y offset
 * on the entering or exiting page would interact with that height change and
 * produce the "header moves upward / page enters from bottom" artefact. Pure
 * opacity (0.98 → 1 enter, 1 → 0.98 exit) eliminates all positional movement
 * from the page layer; the only remaining motion is the instant header resize,
 * which is a single imperceptible frame rather than an animated shift.
 */
export const tabPageVariants: Variants = {
  initial: { opacity: 0.98 },
  enter:   { opacity: 1,    transition: PAGE_ENTER },
  exit:    { opacity: 0.98, transition: PAGE_EXIT  },
};

/** Detail pages — same premium system. */
export const pageDetailVariants: Variants = pageVariants;

/**
 * Cover-detail pages (Portfolio / Balances / Net-PnL — position:fixed overlay).
 *
 * Starts fully opaque AND at y:0 — the overlay occupies the entire viewport
 * from the very first frame. No y translate here because:
 *   - A y offset on a position:fixed, inset:0 element creates a gap at the top
 *     of the viewport for the duration of the enter animation.
 *   - That gap exposes the Layout header, which used to trigger a height
 *     collapse animation on the same tick — the combination looked like the
 *     Dashboard header sliding upward before the page arrived.
 *
 * The shared element on the tapped card provides the visual transition context;
 * the cover page itself just needs to be present and opaque immediately.
 * A subtle opacity ramp (0.96 → 1) keeps the arrival from feeling abrupt while
 * contributing zero positional movement.
 */
export const pageDetailCoverVariants: Variants = {
  initial: { opacity: 0.96, y: 0 },
  enter:   { opacity: 1,    y: 0, transition: PAGE_ENTER },
  exit:    { opacity: 0,    y: 0, transition: PAGE_EXIT  },
};

/** Slide pages — full-screen slide removed, unified to premium system. */
export const pageSlideVariants: Variants = pageVariants;

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
  hidden:  { opacity: 0, scale: 0.985, y: 20 },
  visible: { opacity: 1, scale: 1,     y: 0,  transition: { type: "tween", duration: 0.22, ease: "easeOut" } },
  exit:    { opacity: 0, scale: 0.96,  y: 10, transition: { duration: 0.16 } },
};

// ── Cards ─────────────────────────────────────────────────────────────────
export const cardVariants: Variants = {
  hidden:  { opacity: 0, y: 20, scale: 0.96 },
  visible: (i: number = 0) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 32, mass: 0.9, delay: i * 0.055 },
  }),
};

// ── Lists ─────────────────────────────────────────────────────────────────
export const listContainerVariants: Variants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
  exit:    { opacity: 0,       transition: { duration: 0.15 } },
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
/** 90 ms ease-out tween — press (whileTap) only; hover keeps its spring. */
export const TAP_TRANSITION: Transition = { type: "tween", duration: 0.09, ease: "easeOut" };

export const buttonConfig = {
  whileTap:   { scale: 0.97 },
  whileHover: { scale: 1.04 },
  transition: { ...SPRING_FAST, tap: TAP_TRANSITION } as Transition,
};

export const iconButtonConfig = {
  whileTap:   { scale: 0.97 },
  whileHover: { scale: 1.08, rotate: 4 },
  transition: { ...SPRING_FAST, tap: TAP_TRANSITION } as Transition,
};
