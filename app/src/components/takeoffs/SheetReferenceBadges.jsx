import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";

export default function SheetReferenceBadges({
  selectedDrawingId,
  detectedReferences,
  setRefPopover,
  refPopover,
  setDetailOverlay,
}) {
  const C = useTheme();
  const T = C.T;
  const [hoveredRef, setHoveredRef] = useState(null);
  const [menuRef, setMenuRef] = useState(null); // { idx, x, y }
  const menuPopRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuRef) return;
    const handler = e => {
      if (menuPopRef.current && !menuPopRef.current.contains(e.target)) setMenuRef(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuRef]);
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const pdfCanvases = useDrawingPipelineStore(s => s.pdfCanvases);
  const sheetIndex = useDrawingPipelineStore(s => s.sheetIndex);

  const refs = detectedReferences[selectedDrawingId];
  if (!selectedDrawingId || !refs || refs.length === 0) return null;

  return (
    <>
      {refs.map((ref, ri) => {
        const targetDId =
          sheetIndex[ref.targetSheet] || sheetIndex[ref.targetSheet?.replace(/[-\s]/g, "")];
        const targetDrawing = targetDId ? drawings.find(d => d.id === targetDId) : null;
        const thumbSrc = targetDrawing
          ? targetDrawing.type === "pdf"
            ? pdfCanvases[targetDrawing.id]
            : targetDrawing.data
          : null;
        const isHovered = hoveredRef === ri;

        // Darker purple for better visibility
        const badgeColor = "#7C3AED";

        return (
          <div
            key={ri}
            onMouseEnter={() => setHoveredRef(ri)}
            onMouseLeave={() => setHoveredRef(null)}
            onClick={e => {
              e.stopPropagation();
              if (menuRef?.idx === ri) {
                setMenuRef(null);
              } else {
                setMenuRef({ idx: ri, x: e.clientX, y: e.clientY });
              }
            }}
            style={{
              position: "absolute",
              left: `${ref.xPct}%`,
              top: `${ref.yPct}%`,
              transform: "translate(-50%, -50%)",
              width: isHovered ? 28 : 22,
              height: isHovered ? 28 : 22,
              borderRadius: "50%",
              background: `${badgeColor}35`,
              border: `2px solid ${badgeColor}80`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              zIndex: 20,
              pointerEvents: "auto",
              boxShadow: isHovered
                ? `0 0 0 4px ${badgeColor}30, 0 0 16px ${badgeColor}40`
                : `0 0 8px ${badgeColor}25`,
              transition: "all 0.2s ease",
            }}
          >
            {/* Hover tooltip */}
            {isHovered && !menuRef && (
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
                  <div style={{ fontSize: 8, color: C.textDim }}>
                    Sheet {ref.targetSheet} not in set
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 3-option action menu */}
      {menuRef && (() => {
        const ref = refs[menuRef.idx];
        const targetDId =
          sheetIndex[ref.targetSheet] || sheetIndex[ref.targetSheet?.replace(/[-\s]/g, "")];
        const targetDrawing = targetDId ? drawings.find(d => d.id === targetDId) : null;
        const hasTarget = !!targetDId;
        const badgeColor = "#7C3AED";

        const menuBtnStyle = (disabled) => ({
          width: "100%",
          padding: "8px 12px",
          border: "none",
          background: "transparent",
          color: disabled ? C.textDim : C.text,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.4 : 1,
          transition: "background 100ms",
          textAlign: "left",
          borderRadius: 4,
        });

        return (
          <div
            ref={menuPopRef}
            style={{
              position: "fixed",
              top: menuRef.y + 8,
              left: menuRef.x - 80,
              zIndex: 9999,
              width: 200,
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              boxShadow: T.shadow.lg || "0 8px 24px rgba(0,0,0,0.4)",
              overflow: "hidden",
              animation: "refMenuIn 0.15s ease-out",
            }}
            onClick={e => e.stopPropagation()}
            onMouseLeave={() => setMenuRef(null)}
          >
            {/* Header */}
            <div style={{
              padding: "8px 12px 4px",
              fontSize: 9,
              fontWeight: 700,
              color: badgeColor,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              borderBottom: `1px solid ${C.border}`,
              paddingBottom: 6,
            }}>
              {ref.type} — {ref.label}
              {targetDrawing && (
                <span style={{ color: C.textDim, fontWeight: 500, marginLeft: 4 }}>
                  → {targetDrawing.sheetNumber}
                </span>
              )}
            </div>

            {/* Option 1: Go to Page */}
            <button
              disabled={!hasTarget}
              onClick={() => {
                if (!hasTarget) return;
                useDrawingPipelineStore.getState().setSelectedDrawingId(targetDId);
                setMenuRef(null);
              }}
              style={menuBtnStyle(!hasTarget)}
              onMouseEnter={e => hasTarget && (e.currentTarget.style.background = `${C.accent}10`)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <div>
                <div style={{ fontWeight: 600 }}>Go to Page</div>
                <div style={{ fontSize: 9, color: C.textDim }}>Navigate to {ref.targetSheet}</div>
              </div>
            </button>

            {/* Option 2: Open in New Tab */}
            <button
              disabled={!hasTarget}
              onClick={() => {
                if (!hasTarget) return;
                // Open the target drawing in a new browser tab via hash route
                const url = `${window.location.origin}${window.location.pathname}#sheet=${targetDId}`;
                window.open(url, "_blank");
                setMenuRef(null);
              }}
              style={menuBtnStyle(!hasTarget)}
              onMouseEnter={e => hasTarget && (e.currentTarget.style.background = `${C.accent}10`)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              <div>
                <div style={{ fontWeight: 600 }}>Open New Tab</div>
                <div style={{ fontSize: 9, color: C.textDim }}>Side-by-side reference</div>
              </div>
            </button>

            {/* Option 3: Plot on Canvas */}
            <button
              disabled={!hasTarget}
              onClick={() => {
                if (!hasTarget || !setDetailOverlay) return;
                setDetailOverlay({ drawingId: targetDId, x: menuRef.x, y: menuRef.y });
                setMenuRef(null);
              }}
              style={menuBtnStyle(!hasTarget)}
              onMouseEnter={e => hasTarget && (e.currentTarget.style.background = `${badgeColor}12`)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={badgeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <div>
                <div style={{ fontWeight: 600, color: badgeColor }}>Plot on Canvas</div>
                <div style={{ fontSize: 9, color: C.textDim }}>Overlay on current drawing</div>
              </div>
            </button>

            {!hasTarget && (
              <div style={{ padding: "4px 12px 8px", fontSize: 9, color: C.red }}>
                Sheet {ref.targetSheet} not found in drawing set
              </div>
            )}
          </div>
        );
      })()}

      {/* Animation keyframes */}
      <style>{`
        @keyframes refMenuIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
