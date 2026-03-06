// motion.js — Framer Motion configuration for NOVATerra
// Single source of truth for transitions, variants, and reduced-motion.
// Every component imports from here rather than defining its own timing.

import { useReducedMotion } from "framer-motion";

// ─── Transition Presets ───────────────────────────────────────────
// Map existing design token curves to framer-motion springs/tweens.

// The "snappy" curve used everywhere: cubic-bezier(0.16, 1, 0.3, 1)
export const springSnappy = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 1,
};

// The "overshoot" curve: cubic-bezier(0.34, 1.56, 0.64, 1)
// Used for T.transition.spring (300ms)
export const springBounce = {
  type: "spring",
  stiffness: 400,
  damping: 22,
  mass: 1,
};

// Fast tween for simple fades (no spring overshoot)
export const tweenFast = {
  type: "tween",
  duration: 0.15,
  ease: [0.16, 1, 0.3, 1],
};

// Slow tween matching T.transition.slow (250ms)
export const tweenSlow = {
  type: "tween",
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
};

// ─── Reduced Motion ──────────────────────────────────────────────
// Components call useMotionSafe() to get a boolean.
// When false, use instant transitions (duration: 0) instead of springs.
export function useMotionSafe() {
  const prefersReduced = useReducedMotion();
  return !prefersReduced;
}

export const instantTransition = { duration: 0 };

// Returns the given transition or instant if reduced motion preferred
export function safeTransition(transition, prefersMotion) {
  return prefersMotion ? transition : instantTransition;
}

// ─── Variant Libraries ───────────────────────────────────────────

// Page transitions (route-level)
export const pageVariants = {
  initial: { opacity: 0, y: 6, filter: "blur(1px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -4, filter: "blur(1px)" },
};
export const pageTransition = {
  type: "tween",
  duration: 0.3,
  ease: [0.16, 1, 0.3, 1],
};

// Modal overlay (backdrop)
export const backdropVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
export const backdropTransition = {
  duration: 0.2,
  ease: "easeOut",
};

// Modal panel (the card itself)
export const modalVariants = {
  initial: { opacity: 0, scale: 0.95, y: 8, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.97, y: 4, filter: "blur(2px)" },
};
export const modalTransition = springSnappy;

// Slide panel (AI chat, side panels)
export const slidePanelVariants = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
};
export const slidePanelTransition = springSnappy;

// Toast notifications
export const toastVariants = {
  initial: { opacity: 0, y: 20, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 10, scale: 0.97 },
};
export const toastTransition = springBounce;

// Command palette (drops from top)
export const paletteVariants = {
  initial: { opacity: 0, scale: 0.96, y: -8, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.97, y: -4, filter: "blur(2px)" },
};
export const paletteTransition = {
  type: "spring",
  stiffness: 500,
  damping: 32,
  mass: 0.8,
};

// Stagger children — used by AnimateIn
export const staggerContainer = (staggerMs = 50) => ({
  animate: {
    transition: {
      staggerChildren: staggerMs / 1000,
    },
  },
});

export const staggerChild = {
  initial: { opacity: 0, y: 12, scale: 0.97, filter: "blur(2px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
};
export const staggerChildTransition = {
  type: "tween",
  duration: 0.35,
  ease: [0.16, 1, 0.3, 1],
};

// Widget hover (for WidgetWrapper)
export const widgetHover = {
  scale: 1.008,
  transition: { type: "spring", stiffness: 400, damping: 25 },
};
export const widgetTap = {
  scale: 0.995,
};

// Sidebar active indicator
export const indicatorVariants = {
  initial: { scaleY: 0, opacity: 0 },
  animate: { scaleY: 1, opacity: 1 },
  exit: { scaleY: 0, opacity: 0 },
};
export const indicatorTransition = springSnappy;
