/**
 * useVirtualList — Lightweight virtualized list for large datasets
 *
 * Sprint 5.2: Renders only visible items + overscan buffer.
 * No external dependencies. Works with fixed-height rows.
 *
 * Usage:
 *   const { visibleItems, containerProps, spacerTopHeight, spacerBottomHeight }
 *     = useVirtualList({ items, rowHeight: 42, overscan: 5, containerRef });
 *
 * The consumer renders:
 *   <div ref={containerRef} {...containerProps}>
 *     <div style={{ height: spacerTopHeight }} />
 *     {visibleItems.map(item => <Row key={item.id} ... />)}
 *     <div style={{ height: spacerBottomHeight }} />
 *   </div>
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

export function useVirtualList({
  items = [],
  rowHeight = 40,
  overscan = 8,
  containerRef,
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const rafRef = useRef(null);

  // Observe container resize
  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;

    setContainerHeight(el.clientHeight);

    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [containerRef]);

  // Track scroll position with rAF throttle
  const handleScroll = useCallback(
    e => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setScrollTop(e.target.scrollTop);
      });
    },
    [],
  );

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [containerRef, handleScroll]);

  // Compute visible range
  const totalHeight = items.length * rowHeight;

  const result = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(containerHeight / rowHeight) + overscan * 2;
    const endIdx = Math.min(items.length, startIdx + visibleCount);

    return {
      visibleItems: items.slice(startIdx, endIdx),
      startIndex: startIdx,
      endIndex: endIdx,
      spacerTopHeight: startIdx * rowHeight,
      spacerBottomHeight: Math.max(0, (items.length - endIdx) * rowHeight),
      totalHeight,
    };
  }, [items, scrollTop, containerHeight, rowHeight, overscan, totalHeight]);

  const containerProps = {
    style: {
      overflow: "auto",
      position: "relative",
    },
  };

  return {
    ...result,
    containerProps,
  };
}

/**
 * VIRTUAL_THRESHOLD — Only virtualize when list exceeds this count.
 * Below this, plain .map() is faster (no overhead).
 */
export const VIRTUAL_THRESHOLD = 200;
