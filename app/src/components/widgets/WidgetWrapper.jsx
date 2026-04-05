import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useWidgetStore } from "@/stores/widgetStore";
import { WIDGET_REGISTRY } from "@/constants/widgetRegistry";
import { motion } from "framer-motion";
// widgetHover/widgetTap removed — NOVA 2.0 (Apple: no card bounce)
import WidgetActionMenu from "./WidgetActionMenu";

/* ────────────────────────────────────────────────────────
   WidgetWrapper — Material surface shell for each widget

   NOVA 2.0: Each widget type gets a distinct material treatment
   on its card surface. Inspired by Terzo Millennio — five dark
   materials differentiated by how they respond to light.

   Materials live ON the card, not behind it.
   ──────────────────────────────────────────────────────── */

// ── Per-widget material treatments (dark mode only) ──────
// Each returns { background, backgroundImage, border, boxShadow }
const CARD_MATERIALS = {
  // Carbon Fiber — hero widget, directional weave pattern
  "project-pulse": (C) => ({
    background: "#000000",
    backgroundImage: `
      repeating-linear-gradient(
        45deg,
        transparent, transparent 3px,
        rgba(255,255,255,0.02) 3px, rgba(255,255,255,0.02) 4px
      ),
      repeating-linear-gradient(
        -45deg,
        transparent, transparent 3px,
        rgba(255,255,255,0.015) 3px, rgba(255,255,255,0.015) 4px
      )
    `,
    border: `1px solid rgba(255,255,255,0.07)`,
    boxShadow: `0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`,
  }),

  // Brushed Aluminum — precision instrument, horizontal grain
  calendar: (C) => ({
    background: "#000000",
    backgroundImage: `
      repeating-linear-gradient(
        90deg,
        transparent, transparent 1px,
        rgba(255,255,255,0.018) 1px, rgba(255,255,255,0.018) 2px
      )
    `,
    border: `1px solid rgba(255,255,255,0.08)`,
    boxShadow: `0 1px 3px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07)`,
  }),

  // Obsidian Glass — deep reflective surface for market observation
  "market-intel": (C) => ({
    background: "#000000",
    backgroundImage: "none",
    border: `1px solid rgba(255,255,255,0.05)`,
    boxShadow: `0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(255,255,255,0.02)`,
  }),

  // Satin Titanium — instrument gauge, diagonal sheen
  benchmarks: (C) => ({
    background: "#000000",
    backgroundImage: "none",
    border: `1px solid rgba(255,255,255,0.07)`,
    boxShadow: `0 1px 4px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`,
  }),

  // Polished Slate — writing surface, slightly warm
  inbox: (C) => ({
    background: "#000000",
    backgroundImage: "none",
    border: `1px solid rgba(255,255,255,0.06)`,
    boxShadow: `0 1px 3px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05)`,
  }),

  // Matte Carbon — default workhorse, max text contrast
  _default: (C) => ({
    background: "#000000",
    backgroundImage: "none",
    border: `1px solid rgba(255,255,255,0.06)`,
    boxShadow: `0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)`,
  }),
};

// Map additional widget types to base materials
CARD_MATERIALS["map-radar"] = CARD_MATERIALS._default;
CARD_MATERIALS.projects = CARD_MATERIALS._default;
CARD_MATERIALS["live-feed"] = CARD_MATERIALS._default;
CARD_MATERIALS["carbon-breakdown"] = CARD_MATERIALS._default;
CARD_MATERIALS["carbon-benchmark"] = CARD_MATERIALS._default;
CARD_MATERIALS.estimate = CARD_MATERIALS._default;
CARD_MATERIALS["cost-breakdown"] = CARD_MATERIALS._default;
CARD_MATERIALS["estimate-health"] = CARD_MATERIALS._default;
CARD_MATERIALS["deadline-countdown"] = CARD_MATERIALS._default;
CARD_MATERIALS.spotify = CARD_MATERIALS._default;
CARD_MATERIALS.iframe = CARD_MATERIALS._default;
CARD_MATERIALS["pipeline-hero"] = (C) => ({
  background: "#000000",
  backgroundImage: `
    repeating-linear-gradient(45deg, rgba(255,255,255,0.016) 0 1px, transparent 1px 8px),
    repeating-linear-gradient(-45deg, rgba(0,0,0,0.22) 0 1px, transparent 1px 8px)
  `,
  backgroundSize: "8px 8px",
  border: `1px solid rgba(255,255,255,0.07)`,
  boxShadow: "none",
});

export default function WidgetWrapper({
  id,
  widgetType,
  config,
  editMode,
  movingWidgetId,
  currentW,
  children,
  onConfigure,
  onReplace,
}) {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const removeWidget = useWidgetStore(s => s.removeWidget);
  const activeMenuId = useWidgetStore(s => s.activeMenuId);
  const setActiveMenu = useWidgetStore(s => s.setActiveMenu);
  const clearActiveMenu = useWidgetStore(s => s.clearActiveMenu);
  const clearMovingWidget = useWidgetStore(s => s.clearMovingWidget);
  const reg = WIDGET_REGISTRY[widgetType] || {};
  const isRemovable = reg.removable !== false;

  const isMoving = movingWidgetId === id;
  const showMenu = activeMenuId === id;
  const showEditChrome = editMode;
  const showMoveChrome = !editMode && isMoving;
  const showDotButton = !editMode && !isMoving;
  const [hovered, setHovered] = useState(false);

  const isActive = showEditChrome || showMoveChrome;

  // NOVA 2.0 — simplified card shadow: subtle drop + top-edge inner highlight
  const glassShadow = isActive
    ? `0 0 0 1px ${C.accent}1A, 0 4px 16px rgba(0,0,0,0.10)`
    : "0 1px 3px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)";

  // ── Per-widget material surface (NOVA 2.0 dark mode only) ──
  const materialFn = C.cardMaterials && dk
    ? (CARD_MATERIALS[widgetType] || CARD_MATERIALS._default)
    : null;
  const mat = materialFn ? materialFn(C) : null;

  // Active-state override for material cards
  const matActiveOverrides = mat && isActive
    ? {
        border: `1px solid ${C.accent}4D`,
        boxShadow: `0 0 0 1px ${C.accent}1A, 0 4px 16px rgba(0,0,0,0.10)`,
      }
    : {};

  return (
    <motion.div
      className="widget-card"
      data-widget-type={widgetType}
      data-color-combo={config?.colorCombo || "1"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      /* NOVA 2.0: no hover/tap scale — Apple doesn't bounce cards */
      style={{
        height: "100%",
        borderRadius: T.radius.lg,
        // Material system: opaque PBR-inspired surfaces per widget type
        ...(mat
          ? {
              background: mat.background,
              backgroundImage: mat.backgroundImage,
              ...(mat.backgroundSize ? { backgroundSize: mat.backgroundSize } : {}),
              backdropFilter: "none",
              WebkitBackdropFilter: "none",
              border: mat.border,
              boxShadow: mat.boxShadow,
              ...matActiveOverrides,
            }
          : {
              // noGlass: solid opaque cards. Glass: translucent with blur.
              background: C.noGlass
                ? isActive
                  ? C.bg2
                  : C.bg1
                : isActive
                  ? dk
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(255,255,255,0.85)"
                  : dk
                    ? T.glass.bg
                    : C.glassBg || "rgba(255,255,255,0.32)",
              backdropFilter: C.noGlass ? "none" : isActive ? undefined : T.glass.blur,
              WebkitBackdropFilter: C.noGlass ? "none" : isActive ? undefined : T.glass.blur,
              border: `1px solid ${isActive ? `${C.accent}4D` : C.border || "rgba(255,255,255,0.06)"}`,
              boxShadow: C.noGlass ? "none" : glassShadow,
            }
        ),
        display: "flex",
        flexDirection: "column",
        overflow: "visible",
        transition: "border-color 0.2s, background 0.2s",
        position: "relative",
      }}
    >
      {/* ── Full edit mode chrome ─────────────────────── */}
      {showEditChrome && (
        <>
          <div
            className="widget-drag-handle"
            style={{
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "grab",
              borderBottom: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
              borderRadius: "12px 12px 0 0",
              flexShrink: 0,
              gap: 6,
            }}
          >
            <svg width="14" height="8" viewBox="0 0 14 8" fill="none" style={{ opacity: 0.4 }}>
              <circle cx="3" cy="2" r="1" fill={C.textMuted} />
              <circle cx="7" cy="2" r="1" fill={C.textMuted} />
              <circle cx="11" cy="2" r="1" fill={C.textMuted} />
              <circle cx="3" cy="6" r="1" fill={C.textMuted} />
              <circle cx="7" cy="6" r="1" fill={C.textMuted} />
              <circle cx="11" cy="6" r="1" fill={C.textMuted} />
            </svg>
            <span
              style={{
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: C.textDim,
                fontFamily: C.T.font.display,
              }}
            >
              {reg.label || widgetType}
            </span>
          </div>

          {isRemovable && (
            <button
              onClick={e => {
                e.stopPropagation();
                removeWidget(id);
              }}
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                zIndex: 2,
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                background: `${C.red}33`,
                color: C.red,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                lineHeight: 1,
                padding: 0,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = `${C.red}59`)}
              onMouseLeave={e => (e.currentTarget.style.background = `${C.red}33`)}
            >
              &times;
            </button>
          )}

          {reg.configFields && onConfigure && (
            <button
              onClick={e => {
                e.stopPropagation();
                onConfigure(id, widgetType);
              }}
              style={{
                position: "absolute",
                top: 4,
                right: 28,
                zIndex: 2,
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                background: ov(0.08),
                color: C.textMuted,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                lineHeight: 1,
                padding: 0,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = ov(0.15))}
              onMouseLeave={e => (e.currentTarget.style.background = ov(0.08))}
            >
              &#9881;
            </button>
          )}
        </>
      )}

      {/* ── Single-widget move mode chrome ────────────── */}
      {showMoveChrome && (
        <>
          <div
            className="widget-drag-handle"
            style={{
              height: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "grab",
              borderBottom: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
              borderRadius: "12px 12px 0 0",
              flexShrink: 0,
              gap: 6,
            }}
          >
            <svg width="14" height="8" viewBox="0 0 14 8" fill="none" style={{ opacity: 0.4 }}>
              <circle cx="3" cy="2" r="1" fill={C.textMuted} />
              <circle cx="7" cy="2" r="1" fill={C.textMuted} />
              <circle cx="11" cy="2" r="1" fill={C.textMuted} />
              <circle cx="3" cy="6" r="1" fill={C.textMuted} />
              <circle cx="7" cy="6" r="1" fill={C.textMuted} />
              <circle cx="11" cy="6" r="1" fill={C.textMuted} />
            </svg>
            <span
              style={{
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: C.accent,
                fontFamily: C.T.font.display,
              }}
            >
              Drag to move
            </span>
          </div>

          <button
            onClick={e => {
              e.stopPropagation();
              clearMovingWidget();
            }}
            style={{
              position: "absolute",
              top: 4,
              right: 6,
              zIndex: 2,
              padding: "2px 10px",
              borderRadius: 6,
              border: `1px solid ${C.accent}4D`,
              background: `${C.accent}26`,
              color: C.accent,
              fontSize: 8,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: C.T.font.display,
              lineHeight: "16px",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}40`)}
            onMouseLeave={e => (e.currentTarget.style.background = `${C.accent}26`)}
          >
            Done
          </button>
        </>
      )}

      {/* ── Normal mode: drag handle bar + three-dot button ─── */}
      {showDotButton && (
        <>
          <div
            className="widget-drag-handle"
            style={{
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "grab",
              borderRadius: "12px 12px 0 0",
              flexShrink: 0,
              opacity: hovered ? 0.5 : 0,
              transition: "opacity 0.2s",
            }}
          >
            <svg width="20" height="4" viewBox="0 0 20 4" fill="none" style={{ display: "block" }}>
              <rect x="0" y="0" width="20" height="1.5" rx="0.75" fill={C.textMuted} />
              <rect x="0" y="2.5" width="20" height="1.5" rx="0.75" fill={C.textMuted} />
            </svg>
          </div>

          <button
            onClick={e => {
              e.stopPropagation();
              setActiveMenu(id);
            }}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              zIndex: 3,
              width: 22,
              height: 22,
              borderRadius: 6,
              border: `1px solid ${showMenu ? (dk ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)") : "transparent"}`,
              cursor: "pointer",
              background: showMenu ? (dk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)") : "transparent",
              color: showMenu ? C.text : C.textMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              opacity: showMenu ? 1 : hovered ? 0.7 : 0,
              transition: "opacity 0.2s, background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.background = dk ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
              e.currentTarget.style.borderColor = dk ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)";
            }}
            onMouseLeave={e => {
              if (!showMenu) {
                e.currentTarget.style.opacity = hovered ? "0.7" : "0";
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "transparent";
              }
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="3.5" cy="7" r="1.3" fill="currentColor" />
              <circle cx="7" cy="7" r="1.3" fill="currentColor" />
              <circle cx="10.5" cy="7" r="1.3" fill="currentColor" />
            </svg>
          </button>
        </>
      )}

      {/* ── Action menu popover ───────────────────────── */}
      {showMenu && (
        <WidgetActionMenu
          widgetId={id}
          widgetType={widgetType}
          config={config}
          currentW={currentW}
          onClose={clearActiveMenu}
          onConfigure={onConfigure}
          onReplace={onReplace}
        />
      )}

      {/* ── Widget content ────────────────────────────── */}
      <div
        style={{
          flex: 1,
          padding: isActive ? "6px 12px 12px" : "4px 16px 14px",
          overflow: "hidden",
          pointerEvents: isActive ? "none" : "auto",
          minHeight: 0,
        }}
      >
        {children}
      </div>
    </motion.div>
  );
}
