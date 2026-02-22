import { useRef, useCallback } from 'react';

export function useDragReorder(onReorder) {
  const listRef = useRef(null);
  const dragState = useRef(null);

  const onPointerDown = useCallback((e, index) => {
    // Only primary button
    if (e.button !== 0) return;

    // Don't start drag if clicking on interactive elements (buttons, toggles, inputs)
    const tag = e.target.tagName?.toLowerCase();
    if (tag === "button" || tag === "input" || tag === "select" || tag === "textarea") return;
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("[role='switch']")) return;

    const el = e.currentTarget;
    const list = listRef.current;
    if (!list) return;

    const rect = el.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();

    // Create floating clone
    const clone = el.cloneNode(true);
    clone.style.position = "fixed";
    clone.style.left = rect.left + "px";
    clone.style.top = rect.top + "px";
    clone.style.width = rect.width + "px";
    clone.style.height = rect.height + "px";
    clone.style.zIndex = "9999";
    clone.style.opacity = "0.9";
    clone.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
    clone.style.pointerEvents = "none";
    clone.style.borderRadius = "6px";
    clone.style.transition = "box-shadow 100ms ease";
    document.body.appendChild(clone);

    // Dim original
    el.style.opacity = "0.3";

    dragState.current = {
      index,
      currentIndex: index,
      clone,
      origEl: el,
      offsetY: e.clientY - rect.top,
      offsetX: e.clientX - rect.left,
      listTop: listRect.top,
    };

    el.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;

    // Move clone
    ds.clone.style.top = (e.clientY - ds.offsetY) + "px";
    ds.clone.style.left = (e.clientX - ds.offsetX) + "px";

    // Determine new index from children midpoints
    const list = listRef.current;
    if (!list) return;

    const children = Array.from(list.children);
    let newIdx = ds.index;
    for (let i = 0; i < children.length; i++) {
      const childRect = children[i].getBoundingClientRect();
      const midY = childRect.top + childRect.height / 2;
      if (e.clientY < midY) {
        newIdx = i;
        break;
      }
      newIdx = i + 1;
    }
    newIdx = Math.min(newIdx, children.length - 1);
    ds.currentIndex = newIdx;
  }, []);

  const onPointerUp = useCallback((e) => {
    const ds = dragState.current;
    if (!ds) return;

    // Cleanup
    ds.clone.remove();
    ds.origEl.style.opacity = "";
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (ds.index !== ds.currentIndex) {
      onReorder(ds.index, ds.currentIndex);
    }

    dragState.current = null;
  }, [onReorder]);

  return { listRef, onPointerDown, onPointerMove, onPointerUp };
}
