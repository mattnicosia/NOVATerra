import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingsStore } from "@/stores/drawingsStore";

export default function SheetReferenceBadges({ selectedDrawingId, detectedReferences, setRefPopover, refPopover }) {
  const C = useTheme();
  const [hoveredRef, setHoveredRef] = useState(null);
  const drawings = useDrawingsStore(s => s.drawings);
  const pdfCanvases = useDrawingsStore(s => s.pdfCanvases);
  const sheetIndex = useDrawingsStore(s => s.sheetIndex);

  const refs = detectedReferences[selectedDrawingId];
  if (!selectedDrawingId || !refs || refs.length === 0) return null;

  return refs.map((ref, ri) => {
    const targetDId =
      sheetIndex[ref.targetSheet] || sheetIndex[ref.targetSheet?.replace(/[-\s]/g, "")];
    const targetDrawing = targetDId ? drawings.find(d => d.id === targetDId) : null;
    const thumbSrc = targetDrawing
      ? targetDrawing.type === "pdf"
        ? pdfCanvases[targetDrawing.id]
        : targetDrawing.data
      : null;
    const isHovered = hoveredRef === ri;

    // Light purple circle for all ref types — click to navigate to target sheet
    const badgeColor = "#A78BFA"; // light purple

    return (
      <div
        key={ri}
        onMouseEnter={() => setHoveredRef(ri)}
        onMouseLeave={() => setHoveredRef(null)}
        onClick={e => {
          e.stopPropagation();
          // Navigate to the target drawing sheet
          if (targetDId) {
            useDrawingsStore.getState().setSelectedDrawingId(targetDId);
          } else {
            // No target found — show popover
            setRefPopover(
              refPopover?.idx === ri ? null : { idx: ri, ref, targetDId, x: e.clientX, y: e.clientY },
            );
          }
        }}
        style={{
          position: "absolute",
          left: `${ref.xPct}%`,
          top: `${ref.yPct}%`,
          transform: "translate(-50%, -50%)",
          width: isHovered ? 26 : 20,
          height: isHovered ? 26 : 20,
          borderRadius: "50%",
          background: `${badgeColor}25`,
          border: `2px solid ${badgeColor}60`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 20,
          pointerEvents: "auto",
          boxShadow: isHovered ? `0 0 0 4px ${badgeColor}20, 0 0 12px ${badgeColor}30` : `0 0 6px ${badgeColor}15`,
          transition: "all 0.2s ease",
        }}
      >

        {/* Hover tooltip */}
        {isHovered && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 30,
              pointerEvents: "none",
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: 6,
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
              minWidth: 140,
              maxWidth: 220,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: badgeColor, marginBottom: 2 }}>
              {ref.type?.toUpperCase()} — {ref.label}
            </div>
            {targetDrawing && (
              <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 4 }}>
                {targetDrawing.sheetNumber} {targetDrawing.sheetTitle || ""}
              </div>
            )}
            {thumbSrc && (
              <img
                src={thumbSrc}
                alt=""
                style={{
                  width: "100%",
                  height: 80,
                  objectFit: "contain",
                  borderRadius: 3,
                  background: "#111",
                }}
              />
            )}
            {!targetDrawing && (
              <div style={{ fontSize: 8, color: C.textDim }}>Sheet {ref.targetSheet} not in set</div>
            )}
          </div>
        )}
      </div>
    );
  });
}
