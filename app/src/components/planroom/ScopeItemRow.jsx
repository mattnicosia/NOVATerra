import { memo } from "react";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { SCOPE_SOURCE_META } from "@/constants/scopeSources";

const confidenceColor = (conf) => {
  if (conf >= 0.8) return "#22c55e";
  if (conf >= 0.6) return "#f59e0b";
  return "#ef4444";
};

const confidenceLabel = (conf) => {
  if (conf >= 0.8) return "High";
  if (conf >= 0.6) return "Medium";
  return "Low";
};

function ScopeItemRow({ item, T, onToggle, onDrawingRefClick }) {
  const isGap = item.source === "ai-gap" || item.source === "nova-chat";
  const conf = item.confidence || 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderBottom: `1px solid ${T.border}22`,
        opacity: isGap && !item.pushed ? 0.75 : 1,
        background: item.pushed ? `${T.accent}08` : "transparent",
      }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={item.selected}
        disabled={item.pushed}
        onChange={() => onToggle?.(item.id)}
        style={{ accentColor: T.accent, cursor: item.pushed ? "default" : "pointer" }}
      />

      {/* CSI Code */}
      <span
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 11,
          color: T.accent,
          minWidth: 52,
          flexShrink: 0,
        }}
      >
        {item.code || "—"}
      </span>

      {/* Description */}
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: T.fg,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.description}
      </span>

      {/* Confidence badge */}
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          padding: "1px 6px",
          borderRadius: 4,
          background: `${confidenceColor(conf)}18`,
          color: confidenceColor(conf),
          flexShrink: 0,
        }}
      >
        {Math.round(conf * 100)}%
      </span>

      {/* Quantity + Unit */}
      <span
        style={{
          fontSize: 11,
          color: T.fg + "88",
          minWidth: 48,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {item.quantity > 0 ? `${item.quantity} ${item.unit || ""}` : "---"}
      </span>

      {/* Source badge */}
      {(() => {
        const meta = SCOPE_SOURCE_META[item.source];
        if (!meta?.badge) return null;
        return (
          <span
            title={meta.label}
            style={{
              fontSize: 7.5, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
              background: `${meta.color}18`, color: meta.color, flexShrink: 0,
            }}
          >
            {meta.badge}
          </span>
        );
      })()}

      {/* Drawing ref link */}
      {item.drawingRef && (
        <span
          onClick={() => onDrawingRefClick?.(item.drawingRef)}
          style={{
            fontSize: 10,
            color: T.accent,
            cursor: "pointer",
            textDecoration: "underline",
            flexShrink: 0,
          }}
        >
          {item.drawingRef}
        </span>
      )}

      {/* Pushed badge */}
      {item.pushed && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: "1px 5px",
            borderRadius: 3,
            background: `${T.accent}20`,
            color: T.accent,
          }}
        >
          In estimate
        </span>
      )}
    </div>
  );
}

export default memo(ScopeItemRow, (prev, next) => (
  prev.item.selected === next.item.selected &&
  prev.item.pushed === next.item.pushed &&
  prev.item.quantity === next.item.quantity &&
  prev.item.description === next.item.description &&
  prev.item.confidence === next.item.confidence
));
