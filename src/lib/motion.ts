export const MOTION = {
  duration: {
    fast: 0.12,   // Hover effects, pressing actions, tooltips
    base: 0.22,   // Modal entry/exit, card transitions, drawer slides
    slow: 0.35,   // Expanded panel shifts, structural transformations
    page: 0.45,   // Entire page route changes
  },
  ease: {
    default: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
    bounce: [0.34, 1.56, 0.64, 1] as [number, number, number, number],
    spring: {
      type: "spring",
      stiffness: 420,
      damping: 32,
    },
    stagger: {
      fast: 0.04,
      base: 0.06,
      slow: 0.1,
    },
  },
} as const;
