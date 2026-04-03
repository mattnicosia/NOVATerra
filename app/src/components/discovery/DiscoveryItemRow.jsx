// ═══════════════════════════════════════════════════════════════════════════════
// DiscoveryItemRow — Single row in the Discovery Panel dashboard
//
// Shows: tag badge, description, instance count, sheet count, confidence bar,
// measurement type icon, and action buttons (Create Takeoff / Dismiss).
// ═══════════════════════════════════════════════════════════════════════════════
import React, { useState, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { bt } from "@/utils/styles";
import { DISCOVERY_CATEGORIES } from "@/stores/discoveryStore";

// Category → color mapping
const CATEGORY_COLORS = {
  [DISCOVERY_CATEGORIES.OPENING]: "#3B82F6",     // blue
  [DISCOVERY_CATEGORIES.FINISH]: "#8B5CF6",       // purple
  [DISCOVERY_CATEGORIES.FIXTURE]: "#06B6D4",      // cyan
  [DISCOVERY_CATEGORIES.STRUCTURAL]: "#EF4444",   // red
  [DISCOVERY_CATEGORIES.EXTERIOR]: "#F97316",      // orange
  [DISCOVERY_CATEGORIES.EQUIPMENT]: "#10B981",     // green
  [DISCOVERY_CATEGORIES.SITE]: "#84CC16",          // lime
  [DISCOVERY_CATEGORIES.OTHER]: "#6B7280",         // gray
};

// Category → icon
const CATEGORY_ICONS = {
  [DISCOVERY_CATEGORIES.OPENING]: "\u{1F6AA}",     // door
  [DISCOVERY_CATEGORIES.FINISH]: "\u{1F3A8}",       // palette
  [DISCOVERY_CATEGORIES.FIXTURE]: "\u{1F6BF}",      // shower
  [DISCOVERY_CATEGORIES.STRUCTURAL]: "\u{1F3D7}",   // construction
  [DISCOVERY_CATEGORIES.EXTERIOR]: "\u{1F3E0}",     // house
  [DISCOVERY_CATEGORIES.EQUIPMENT]: "\u{2699}",     // gear
  [DISCOVERY_CATEGORIES.SITE]: "\u{1F33F}",         // seedling
  [DISCOVERY_CATEGORIES.OTHER]: "\u{1F4CB}",        // clipboard
};

// Measurement type labels
const MEASUREMENT_LABELS = {
  count: "Count",
  linear: "Linear",
  area: "Area",
};

export default function DiscoveryItemRow({ item, onCreateTakeoff, onDismiss, onRestore }) {
  const C = useTheme();
  const T = C.T;
  const [hovered, setHovered] = useState(false);

  const categoryColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.other;
  const isActioned = !!item.createdTakeoffId;
  const isDismissed = item.dismissed;

  const handleCreate = useCallback(() => {
    if (onCreateTakeoff) onCreateTakeoff(item);
  }, [item, onCreateTakeoff]);

  const handleDismiss = useCallback(() => {
    if (isDismissed && onRestore) onRestore(item.id);
    else if (onDismiss) onDismiss(item.id);
  }, [item.id, isDismissed, onDismiss, onRestore]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: T.space[3],
        padding: `${T.space[2]} ${T.space[3]}`,
        borderBottom: `1px solid ${C.border}`,
        background: hovered ? (C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)") : "transparent",
        opacity: isDismissed ? 0.45 : 1,
        transition: "background 120ms, opacity 200ms",
      }}
    >
      {/* Category icon */}
      <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>
        {CATEGORY_ICONS[item.category] || CATEGORY_ICONS.other}
      </span>

      {/* Tag badge */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 40,
          padding: `1px ${T.space[2]}`,
          borderRadius: T.radius.sm,
          background: `${categoryColor}22`,
          color: categoryColor,
          fontSize: T.fontSize.xs,
          fontWeight: T.fontWeight.bold,
          fontFamily: T.font.mono || "monospace",
          letterSpacing: "0.5px",
          flexShrink: 0,
        }}
      >
        {item.tag}
      </span>

      {/* Description */}
      <span
        style={{
          flex: 1,
          fontSize: T.fontSize.sm,
          color: C.text,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {item.description}
      </span>

      {/* Instance count */}
      <span
        style={{
          fontSize: T.fontSize.xs,
          color: C.textDim,
          fontWeight: T.fontWeight.semibold,
          minWidth: 32,
          textAlign: "right",
          flexShrink: 0,
        }}
        title={`${item.instanceCount} instances across ${item.sheets.length} sheet${item.sheets.length !== 1 ? "s" : ""}`}
      >
        {item.instanceCount}x
      </span>

      {/* Sheet count */}
      <span
        style={{
          fontSize: T.fontSize.xs,
          color: C.textDim,
          minWidth: 36,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {item.sheets.length} sht{item.sheets.length !== 1 ? "s" : ""}
      </span>

      {/* Measurement type */}
      <span
        style={{
          fontSize: 9,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          minWidth: 36,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {MEASUREMENT_LABELS[item.measurementType] || "Count"}
      </span>

      {/* Confidence bar */}
      <div
        style={{
          width: 40,
          height: 4,
          borderRadius: 2,
          background: C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          flexShrink: 0,
          overflow: "hidden",
        }}
        title={`${Math.round(item.confidence * 100)}% confidence`}
      >
        <div
          style={{
            width: `${Math.round(item.confidence * 100)}%`,
            height: "100%",
            borderRadius: 2,
            background: item.confidence > 0.7 ? "#10B981" : item.confidence > 0.4 ? "#F59E0B" : "#EF4444",
            transition: "width 300ms ease-out",
          }}
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: T.space[1], flexShrink: 0 }}>
        {!isActioned && !isDismissed && (
          <button
            onClick={handleCreate}
            style={{
              ...bt(C),
              padding: `2px ${T.space[2]}`,
              fontSize: 10,
              background: `${C.accent}18`,
              color: C.accent,
              fontWeight: T.fontWeight.bold,
            }}
            title="Create takeoff from this discovery"
          >
            + Takeoff
          </button>
        )}
        {isActioned && (
          <span
            style={{
              fontSize: 10,
              color: "#10B981",
              fontWeight: T.fontWeight.semibold,
              padding: `2px ${T.space[2]}`,
            }}
          >
            Created
          </span>
        )}
        <button
          onClick={handleDismiss}
          style={{
            ...bt(C),
            padding: `2px ${T.space[1]}`,
            fontSize: 10,
            background: "transparent",
            color: C.textDim,
            opacity: hovered ? 1 : 0.4,
            transition: "opacity 120ms",
          }}
          title={isDismissed ? "Restore this discovery" : "Dismiss"}
        >
          {isDismissed ? "Restore" : "\u00D7"}
        </button>
      </div>
    </div>
  );
}
