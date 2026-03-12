import React, { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useWidgetStore } from "@/stores/widgetStore";
import { WIDGET_REGISTRY } from "@/constants/widgetRegistry";
import { motion } from "framer-motion";
import { widgetHover, widgetTap } from "@/utils/motion";
import WidgetActionMenu from "./WidgetActionMenu";

/* ────────────────────────────────────────────────────────
   WidgetWrapper — Liquid Glass shell for each widget
   Apple WWDC25-219: translucent glass panels with
   backdrop-filter blur, specular highlights, and luminous edges.
   ──────────────────────────────────────────────────────── */

export default function WidgetWrapper({
  id,
  widgetType,
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

  // Apple Liquid Glass — specular + hairline edge ONLY (no drop shadow on widgets)
  // Light mode: white speculars invisible on light bg — use dark-adapted shadows
  const glassShadow = isActive
    ? `0 0 0 1px ${C.accent}1A, 0 4px 16px rgba(0,0,0,0.10)`
    : dk
      ? hovered
        ? [T.glass.specularHover, T.glass.edgeHover].join(", ")
        : [T.glass.specular, T.glass.edge].join(", ")
      : hovered
        ? "inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 8px rgba(0,0,0,0.08), 0 6px 20px rgba(0,0,0,0.04)"
        : "inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.03)";

  return (
    <motion.div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileHover={!isActive ? widgetHover : undefined}
      whileTap={!isActive ? widgetTap : undefined}
      style={{
        height: "100%",
        borderRadius: T.radius.lg,
        // noGlass: solid opaque cards. Glass: translucent with blur.
        // Nova orb widget gets opaque black to hide video padding
        background: widgetType === "nova-orb" && !isActive
          ? "#050508"
          : C.noGlass
            ? (isActive ? C.bg2 : C.bg1)
            : isActive
              ? dk
                ? "rgba(255,255,255,0.06)"
                : "rgba(255,255,255,0.85)"
              : dk
                ? T.glass.bg
                : C.glassBg || "rgba(255,255,255,0.32)",
        backdropFilter: widgetType === "nova-orb" ? "none" : C.noGlass ? "none" : (isActive ? undefined : T.glass.blur),
        WebkitBackdropFilter: widgetType === "nova-orb" ? "none" : C.noGlass ? "none" : (isActive ? undefined : T.glass.blur),
        border: widgetType === "nova-orb" && !isActive
          ? "0.5px solid rgba(255,255,255,0.06)"
          : C.noGlass
            ? `1px solid ${isActive ? `${C.accent}4D` : C.border}`
            : `${dk ? "0.5" : "1"}px solid ${
                isActive
                  ? `${C.accent}4D`
                  : dk
                    ? hovered
                      ? T.glass.borderHover
                      : T.glass.border
                    : C.glassBorder || C.border || "rgba(0,0,0,0.08)"
              }`,
        boxShadow: widgetType === "nova-orb" && !isActive
          ? "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 4px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.2)"
          : C.noGlass ? "none" : glassShadow,
        display: "flex",
        flexDirection: "column",
        overflow: "visible",
        transition: "border-color 0.3s, box-shadow 0.3s, background 0.3s",
        position: "relative",
      }}
    >
      {/* ── Full edit mode chrome ─────────────────────── */}
      {showEditChrome && (
        <>
          <div
            className="widget-drag-handle"
            style={{
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "grab",
              borderBottom: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
              borderRadius: "14px 14px 0 0",
              flexShrink: 0,
              gap: 6,
            }}
          >
            <svg width="14" height="8" viewBox="0 0 14 8" fill="none" style={{ opacity: 0.4 }}>
              <circle cx="3" cy="2" r="1.2" fill={C.textMuted} />
              <circle cx="7" cy="2" r="1.2" fill={C.textMuted} />
              <circle cx="11" cy="2" r="1.2" fill={C.textMuted} />
              <circle cx="3" cy="6" r="1.2" fill={C.textMuted} />
              <circle cx="7" cy="6" r="1.2" fill={C.textMuted} />
              <circle cx="11" cy="6" r="1.2" fill={C.textMuted} />
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
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "grab",
              borderBottom: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
              borderRadius: "14px 14px 0 0",
              flexShrink: 0,
              gap: 6,
            }}
          >
            <svg width="14" height="8" viewBox="0 0 14 8" fill="none" style={{ opacity: 0.4 }}>
              <circle cx="3" cy="2" r="1.2" fill={C.textMuted} />
              <circle cx="7" cy="2" r="1.2" fill={C.textMuted} />
              <circle cx="11" cy="2" r="1.2" fill={C.textMuted} />
              <circle cx="3" cy="6" r="1.2" fill={C.textMuted} />
              <circle cx="7" cy="6" r="1.2" fill={C.textMuted} />
              <circle cx="11" cy="6" r="1.2" fill={C.textMuted} />
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
              borderRadius: "14px 14px 0 0",
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
          padding: isActive ? "6px 12px 12px" : "2px 14px 12px",
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
