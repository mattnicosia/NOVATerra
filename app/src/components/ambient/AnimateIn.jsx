// AnimateIn — Orchestrated mount animation wrapper (Framer Motion)
// Drop-in replacement: same props API, framer-motion internals.
//
// Usage:
//   <AnimateIn stagger={60}>
//     <KPI ... />
//     <KPI ... />
//     <KPI ... />
//   </AnimateIn>
//
// Props:
//   stagger   — ms between each child (default 50)
//   duration  — animation duration per child in ms (default 400)
//   delay     — initial delay before first child in ms (default 0)
//   animation — (ignored, kept for API compat)
//   once      — only animate on first mount (default true)
//   className — optional wrapper class
//   style     — optional wrapper style
//   tag       — wrapper element type (default 'div')
import { Children, isValidElement, useMemo } from "react";
import { motion } from "framer-motion";
import { staggerChild, staggerChildTransition, useMotionSafe } from "@/utils/motion";

export default function AnimateIn({
  children,
  stagger = 50,
  duration = 400,
  delay = 0,
  animation, // ignored — kept for API compat
  once = true,
  className,
  style,
  tag: Tag = "div",
}) {
  const motionSafe = useMotionSafe();
  const childArray = useMemo(() => Children.toArray(children).filter(isValidElement), [children]);

  const container = {
    animate: {
      transition: {
        delayChildren: delay / 1000,
        staggerChildren: stagger / 1000,
      },
    },
  };

  const item = {
    initial: motionSafe ? staggerChild.initial : {},
    animate: staggerChild.animate,
  };

  const itemTransition = motionSafe ? { ...staggerChildTransition, duration: duration / 1000 } : { duration: 0 };

  return (
    <motion.div className={className} style={style} variants={container} initial="initial" animate="animate">
      {childArray.map((child, i) => (
        <motion.div key={child.key ?? i} variants={item} transition={itemTransition}>
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}

// Variant: AnimateList — for dynamic lists where items can be added/removed
export function AnimateList({
  children,
  duration = 350,
  animation, // ignored
  className,
  style,
  tag: Tag = "div",
}) {
  const motionSafe = useMotionSafe();
  const childArray = useMemo(() => Children.toArray(children).filter(isValidElement), [children]);

  return (
    <Tag className={className} style={style}>
      {childArray.map((child, i) => (
        <motion.div
          key={child.key ?? i}
          initial={motionSafe ? staggerChild.initial : false}
          animate={staggerChild.animate}
          transition={motionSafe ? { ...staggerChildTransition, duration: duration / 1000 } : { duration: 0 }}
          layout
        >
          {child}
        </motion.div>
      ))}
    </Tag>
  );
}
