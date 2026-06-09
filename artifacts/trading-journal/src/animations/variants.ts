import type { Variants } from "framer-motion";

export const SPRING_SMOOTH = { type: "spring", stiffness: 180, damping: 24, mass: 0.9 } as const;
export const SPRING_SNAPPY = { type: "spring", stiffness: 220, damping: 18 } as const;
export const SPRING_PANEL  = { type: "spring", stiffness: 140, damping: 22 } as const;
export const SPRING_MODAL  = { type: "spring", stiffness: 160, damping: 20 } as const;
export const EASE_PREMIUM  = [0.22, 1, 0.36, 1] as const;

export const bottomBarVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 100,
    scale: 0.92,
    filter: "blur(10px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: {
      ...SPRING_SMOOTH,
      staggerChildren: 0.04,
    },
  },
};

export const barItemVariants: Variants = {
  hidden:  { opacity: 0, y: 8, scale: 0.88 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SPRING_SMOOTH },
};

export const leftPanelVariants: Variants = {
  hidden:  { x: -80, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: SPRING_PANEL,
  },
  exit: {
    x: -80,
    opacity: 0,
    transition: { duration: 0.18, ease: EASE_PREMIUM },
  },
};

export const miniToolbarVariants: Variants = {
  hidden:  { scale: 0.8, opacity: 0, y: 10 },
  visible: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: SPRING_SNAPPY,
  },
  exit:    { scale: 0.88, opacity: 0, y: 6, transition: { duration: 0.14 } },
};

export const staggerItemVariants: Variants = {
  hidden:  { opacity: 0, x: -8, scale: 0.92 },
  visible: { opacity: 1, x: 0,  scale: 1, transition: SPRING_SNAPPY },
};

export const modalVariants: Variants = {
  hidden:  { opacity: 0, scale: 0.94, y: 16 },
  visible: { opacity: 1, scale: 1,    y: 0,  transition: SPRING_MODAL },
  exit:    { opacity: 0, scale: 0.96, y: 8,  transition: { duration: 0.16 } },
};

export const overlayVariants: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.22 } },
  exit:    { opacity: 0, transition: { duration: 0.18 } },
};

export const floatUpVariants: Variants = {
  hidden:  { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0,  scale: 1,    transition: SPRING_SMOOTH },
  exit:    { opacity: 0, y: 12, scale: 0.97, transition: { duration: 0.16 } },
};
