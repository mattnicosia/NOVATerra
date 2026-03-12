/**
 * useResponsive — Breakpoint detection hook for tablet/desktop layouts
 *
 * Sprint 5.1: iPad is the field device. This hook provides responsive
 * state for components that need to adapt their layout.
 *
 * Breakpoints:
 *   - Desktop: >= 1024px
 *   - Tablet:  700px – 1023px (iPad Mini landscape through iPad Pro portrait)
 *   - Mobile:  < 700px (blocked by MobileGuard)
 *
 * iPad dimensions (landscape):
 *   iPad Mini:      1024 x 768
 *   iPad Air:       1180 x 820
 *   iPad Pro 11":   1194 x 834
 *   iPad Pro 12.9": 1366 x 1024
 *
 * iPad dimensions (portrait):
 *   iPad Mini:      768 x 1024
 *   iPad Air:       820 x 1180
 *   iPad Pro 11":   834 x 1194
 *   iPad Pro 12.9": 1024 x 1366
 */

import { useState, useEffect } from "react";

const TABLET_MIN = 700;
const DESKTOP_MIN = 1024;

function getBreakpoint(w) {
  if (w >= DESKTOP_MIN) return "desktop";
  if (w >= TABLET_MIN) return "tablet";
  return "mobile";
}

export function useResponsive() {
  const [breakpoint, setBreakpoint] = useState(() =>
    typeof window !== "undefined" ? getBreakpoint(window.innerWidth) : "desktop"
  );

  useEffect(() => {
    let raf;
    const handleResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setBreakpoint(getBreakpoint(window.innerWidth));
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return {
    breakpoint,
    isTablet: breakpoint === "tablet",
    isDesktop: breakpoint === "desktop",
    isMobile: breakpoint === "mobile",
    isTabletOrSmaller: breakpoint !== "desktop",
  };
}

// Breakpoint constants for CSS-in-JS
export const BREAKPOINTS = {
  tablet: TABLET_MIN,
  desktop: DESKTOP_MIN,
};
