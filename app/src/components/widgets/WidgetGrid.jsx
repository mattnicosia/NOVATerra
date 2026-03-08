import React, { Suspense, useMemo, useCallback, useEffect, useRef } from "react";
import { ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useTheme } from "@/hooks/useTheme";
import { useWidgetStore } from "@/stores/widgetStore";
import { WIDGET_REGISTRY } from "@/constants/widgetRegistry";
import { WIDGET_COMPONENTS } from "./widgetComponentMap";
import WidgetWrapper from "./WidgetWrapper";

/* ────────────────────────────────────────────────────────
   WidgetGrid — responsive widget grid powered by react-grid-layout
   ──────────────────────────────────────────────────────── */

const BREAKPOINTS = { lg: 1200, md: 900, sm: 600 };
const COLS = { lg: 12, md: 8, sm: 4 };
const ROW_HEIGHT = 40;

// Inject RGL CSS overrides for glass-morphism theme
let cssInjected = false;
function injectOverrides() {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    .react-grid-placeholder {
      background: rgba(255,255,255,0.06) !important;
      border-radius: 20px !important;
      border: 1.5px dashed rgba(255,255,255,0.20) !important;
      opacity: 1 !important;
      backdrop-filter: blur(8px) !important;
    }
    .react-resizable-handle {
      opacity: 0;
      transition: opacity 0.3s ease;
      z-index: 10;
    }
    .react-grid-item:hover > .react-resizable-handle {
      opacity: 0.2;
    }
    .react-grid-item:hover > .react-resizable-handle:hover {
      opacity: 0.45;
    }
    /* Corner handle (se) — tiny rounded dot */
    .react-resizable-handle-se {
      bottom: 4px !important;
      right: 4px !important;
      cursor: nwse-resize !important;
    }
    .react-resizable-handle-se::after {
      border: none !important;
      width: 5px !important;
      height: 5px !important;
      right: 4px !important;
      bottom: 4px !important;
      border-radius: 1.5px !important;
      background: rgba(255,255,255,0.45) !important;
    }
    /* Bottom edge handle (s) — thin white pill */
    .react-resizable-handle-s {
      bottom: 0 !important;
      left: 20% !important;
      width: 60% !important;
      height: 8px !important;
      cursor: ns-resize !important;
    }
    .react-resizable-handle-s::after {
      content: '' !important;
      display: block !important;
      position: absolute !important;
      left: 50% !important;
      top: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: 28px !important;
      height: 2px !important;
      border: none !important;
      border-radius: 1px !important;
      background: rgba(255,255,255,0.35) !important;
    }
    /* Right edge handle (e) — thin white pill */
    .react-resizable-handle-e {
      right: 0 !important;
      top: 20% !important;
      height: 60% !important;
      width: 8px !important;
      cursor: ew-resize !important;
    }
    .react-resizable-handle-e::after {
      content: '' !important;
      display: block !important;
      position: absolute !important;
      left: 50% !important;
      top: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: 2px !important;
      height: 28px !important;
      border: none !important;
      border-radius: 1px !important;
      background: rgba(255,255,255,0.35) !important;
    }
    .react-grid-item {
      transition: transform 0.25s cubic-bezier(0.16,1,0.3,1),
                  width 0.3s cubic-bezier(0.16,1,0.3,1),
                  height 0.3s cubic-bezier(0.16,1,0.3,1) !important;
    }
    /* Kill transition during active drag/resize so it follows the cursor instantly */
    .react-grid-item.react-draggable-dragging,
    .react-grid-item.resizing {
      transition: none !important;
    }
    .react-grid-item.react-draggable-dragging {
      z-index: 100;
      opacity: 0.92;
      box-shadow: 0 20px 48px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(255,255,255,0.15) !important;
      border-radius: 20px;
    }
    .react-grid-item.widget-menu-open {
      z-index: 50 !important;
    }
  `;
  document.head.appendChild(s);
}

function WidgetSkeleton() {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(238,237,245,0.28)",
        fontSize: 10,
      }}
    >
      Loading...
    </div>
  );
}

export default function WidgetGrid({ onConfigure, onReplace }) {
  const C = useTheme();
  const layouts = useWidgetStore(s => s.layouts);
  const editMode = useWidgetStore(s => s.editMode);
  const movingWidgetId = useWidgetStore(s => s.movingWidgetId);
  const clearMovingWidget = useWidgetStore(s => s.clearMovingWidget);
  const clearActiveMenu = useWidgetStore(s => s.clearActiveMenu);
  const setLayouts = useWidgetStore(s => s.setLayouts);
  const activeMenuId = useWidgetStore(s => s.activeMenuId);
  const layoutsRef = useRef(layouts);
  layoutsRef.current = layouts;
  const { containerRef, width } = useContainerWidth();

  useEffect(() => {
    injectOverrides();
  }, []);

  // Exit move mode on outside click
  useEffect(() => {
    if (!movingWidgetId) return;
    const handler = e => {
      if (!e.target.closest(".react-grid-item")) {
        clearMovingWidget();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [movingWidgetId, clearMovingWidget]);

  // Close action menu on scroll
  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const handler = () => clearActiveMenu();
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [clearActiveMenu]);

  // Build RGL-compatible layouts (strip custom fields, add constraints)
  const rglLayouts = useMemo(() => {
    const result = {};
    for (const [bp, items] of Object.entries(layouts)) {
      if (!Array.isArray(items)) continue;
      result[bp] = items.map(item => {
        const reg = WIDGET_REGISTRY[item.widgetType] || {};
        return {
          i: item.i,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          minW: reg.minW,
          minH: reg.minH,
          maxW: reg.maxW,
          maxH: reg.maxH,
          isDraggable: true,
          isResizable: true,
          resizeHandles: ["se", "s", "e"],
        };
      });
    }
    return result;
  }, [layouts, editMode]);

  // Compact position fingerprint — only compare what matters (i, x, y, w, h)
  function posKey(items) {
    return items
      .map(item => `${item.i}:${item.x},${item.y},${item.w},${item.h}`)
      .sort()
      .join("|");
  }

  // Merge RGL position changes back into our layout items (preserve widgetType, config)
  // Uses layoutsRef to avoid re-creating this callback when layouts change (prevents RGL feedback loop)
  const handleLayoutChange = useCallback(
    (currentLayout, allLayouts) => {
      const curLayouts = layoutsRef.current;
      const newLayouts = {};
      for (const [bp, rglItems] of Object.entries(allLayouts)) {
        const existingItems = curLayouts[bp] || curLayouts.lg || [];
        newLayouts[bp] = rglItems.map(rglItem => {
          const existing = existingItems.find(e => e.i === rglItem.i);
          return {
            i: rglItem.i,
            x: rglItem.x,
            y: rglItem.y,
            w: rglItem.w,
            h: rglItem.h,
            widgetType: existing?.widgetType || "unknown",
            config: existing?.config || {},
          };
        });
      }

      // Only update if positions actually changed
      const curLg = curLayouts.lg || [];
      const newLg = newLayouts.lg || [];
      if (posKey(newLg) !== posKey(curLg)) {
        setLayouts(newLayouts);
      }
    },
    [setLayouts],
  );

  const currentItems = layouts.lg || [];

  return (
    <div ref={containerRef}>
      {width > 0 && (
        <ResponsiveGridLayout
          width={width}
          layouts={rglLayouts}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          onLayoutChange={handleLayoutChange}
          isDraggable={true}
          isResizable={true}
          resizeHandles={["se", "s", "e"]}
          draggableHandle=".widget-drag-handle"
          compactType="vertical"
          margin={[16, 16]}
          containerPadding={[20, 20]}
          useCSSTransforms
        >
          {currentItems.map(item => {
            const Component = WIDGET_COMPONENTS[item.widgetType];
            if (!Component) return null;
            return (
              <div key={item.i} className={activeMenuId === item.i ? "widget-menu-open" : undefined}>
                <WidgetWrapper
                  id={item.i}
                  widgetType={item.widgetType}
                  editMode={editMode}
                  movingWidgetId={movingWidgetId}
                  currentW={item.w}
                  onConfigure={onConfigure}
                  onReplace={onReplace}
                >
                  <Suspense fallback={<WidgetSkeleton />}>
                    <Component config={item.config} widgetId={item.i} />
                  </Suspense>
                </WidgetWrapper>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
