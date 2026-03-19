import { useEffect, useRef } from "react";
import { COLORS } from "@/constants/designTokens";

export default function ProximityLight() {
  const ref = useRef(null);

  useEffect(() => {
    // Check reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const el = ref.current;
    if (!el) return;

    let mouseX = 0, mouseY = 0;
    let currentX = 0, currentY = 0;
    let rafId = null;

    const onMove = (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const loop = () => {
      // Lerp for inertia
      currentX += (mouseX - currentX) * 0.85;
      currentY += (mouseY - currentY) * 0.85;

      el.style.background = `radial-gradient(circle 350px at ${currentX}px ${currentY}px, rgba(124,107,240,0.06), transparent)`;

      rafId = requestAnimationFrame(loop);
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    rafId = requestAnimationFrame(loop);

    return () => {
      document.removeEventListener('mousemove', onMove);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
}
