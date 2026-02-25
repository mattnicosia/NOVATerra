// AnimateIn — Orchestrated mount animation wrapper
// Wraps children with cascading entrance animations.
// Each direct child gets an increasing delay for a stagger effect.
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
//   duration  — animation duration per child (default 400)
//   delay     — initial delay before first child (default 0)
//   animation — keyframe name (default 'staggerFadeUp')
//   once      — only animate on first mount (default true)
//   className — optional wrapper class
//   style     — optional wrapper style
//   tag       — wrapper element type (default 'div')
import { Children, cloneElement, isValidElement, useMemo, useRef, useState, useEffect } from 'react';

export default function AnimateIn({
  children,
  stagger = 50,
  duration = 400,
  delay = 0,
  animation = 'staggerFadeUp',
  once = true,
  className,
  style,
  tag: Tag = 'div',
}) {
  const [mounted, setMounted] = useState(false);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (once && hasAnimatedRef.current) return;
    setMounted(true);
    hasAnimatedRef.current = true;
  }, [once]);

  const childArray = useMemo(() => {
    return Children.toArray(children).filter(isValidElement);
  }, [children]);

  return (
    <Tag className={className} style={style}>
      {childArray.map((child, i) => {
        const childDelay = delay + i * stagger;
        const animStyle = mounted ? {
          animation: `${animation} ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) ${childDelay}ms both`,
        } : {
          opacity: 0,
        };

        return (
          <div key={child.key ?? i} style={animStyle}>
            {child}
          </div>
        );
      })}
    </Tag>
  );
}

// Variant: AnimateList — for dynamic lists where items can be added
// Each new item gets the entrance animation regardless of list position
export function AnimateList({
  children,
  duration = 350,
  animation = 'staggerFadeUp',
  className,
  style,
  tag: Tag = 'div',
}) {
  const prevKeysRef = useRef(new Set());

  const childArray = useMemo(() => {
    return Children.toArray(children).filter(isValidElement);
  }, [children]);

  const currentKeys = new Set(childArray.map((c, i) => c.key ?? i));

  // Determine which keys are new (not seen before)
  const newKeys = new Set();
  currentKeys.forEach(k => {
    if (!prevKeysRef.current.has(k)) newKeys.add(k);
  });

  // Update ref for next render
  useEffect(() => {
    prevKeysRef.current = currentKeys;
  });

  return (
    <Tag className={className} style={style}>
      {childArray.map((child, i) => {
        const key = child.key ?? i;
        const isNew = newKeys.has(key);

        const animStyle = isNew ? {
          animation: `${animation} ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
        } : {};

        return (
          <div key={key} style={animStyle}>
            {child}
          </div>
        );
      })}
    </Tag>
  );
}
