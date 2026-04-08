// DetailOverlay — Resizable floating panel showing a referenced drawing detail
// Pinned to top-right of the drawing area. User can resize by dragging bottom-left corner.
import { useState, useCallback, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const MIN_SIZE = 200;
const MAX_SIZE = 600;
const DEFAULT_W = 350;
const DEFAULT_H = 350;

export default function DetailOverlay({ drawingId, onClose }) {
  const C = useTheme();
  const T = C.T;
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const pdfCanvases = useDrawingPipelineStore(s => s.pdfCanvases);

  const drawing = drawings.find(d => d.id === drawingId);
  const imgSrc = drawing ? (drawing.type === "pdf" ? pdfCanvases[drawing.id] || drawing.data : drawing.data) : null;

  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const dragRef = useRef(null);

  const onResizeStart = useCallback(
    e => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.w;
      const startH = size.h;

      const onMove = ev => {
        // Dragging bottom-left: decrease X = increase width, increase Y = increase height
        const dx = startX - ev.clientX;
        const dy = ev.clientY - startY;
        setSize({
          w: Math.max(MIN_SIZE, Math.min(MAX_SIZE, startW + dx)),
          h: Math.max(MIN_SIZE, Math.min(MAX_SIZE, startH + dy)),
        });
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [size],
  );

  if (!drawing || !imgSrc) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: size.w,
        height: size.h,
        zIndex: 50,
        borderRadius: T.radius.md,
        overflow: "hidden",
        background: C.bg,
        border: `1px solid ${C.border}`,
        boxShadow: T.shadow.lg || "0 8px 32px rgba(0,0,0,0.3)",
        display: "flex",
        flexDirection: "column",
        animation: "detailSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          background: C.bg1,
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {drawing.sheetNumber || ""} {drawing.sheetTitle || drawing.label || "Detail"}
        </span>
        <button
          onClick={onClose}
          style={{
            width: 20,
            height: 20,
            border: "none",
            background: "transparent",
            color: C.textDim,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ic d={I.x} size={10} color={C.textDim} />
        </button>
      </div>

      {/* Drawing image */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative", background: C.isDark ? "#1a1a1a" : "#f5f5f5" }}>
        <img
          src={imgSrc}
          alt={drawing.label || "Detail"}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
          draggable={false}
        />
      </div>

      {/* Resize handle — bottom-left corner */}
      <div
        ref={dragRef}
        onMouseDown={onResizeStart}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: 16,
          height: 16,
          cursor: "nesw-resize",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke={C.textDim} strokeWidth="1.2">
          <path d="M0 8L8 0" />
          <path d="M0 4L4 0" />
        </svg>
      </div>
      {/* Entrance animation */}
      <style>{`
        @keyframes detailSlideIn {
          from {
            opacity: 0;
            transform: scale(0.6) translateY(20px);
            box-shadow: 0 0 0 rgba(0,0,0,0);
          }
          60% {
            opacity: 1;
            transform: scale(1.02) translateY(-2px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          }
        }
      `}</style>
    </div>
  );
}
