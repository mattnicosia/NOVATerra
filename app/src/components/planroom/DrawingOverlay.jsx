/**
 * DrawingOverlay — Revision comparison with smart overlay modes
 *
 * Sprint 3.2: Upload revision set, align drawings, smart comparison.
 * NOT blue-over-red. Instead:
 *   1. Wipe Slider — animated side-by-side reveal
 *   2. Opacity Blend — adjustable transparency between revisions
 *   3. Difference Highlight — pixel-diff with change density heat map
 *   4. Side by Side — synchronized pan/zoom comparison
 *
 * Future (AI-powered, requires backend):
 *   - AI semantic deltas ("Wall moved 2'-6\" east")
 *   - Trade-filtered diff view
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingsStore } from "@/stores/drawingsStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";

const MODES = [
  { id: "wipe", label: "Wipe Slider", icon: I.compare || I.layers },
  { id: "blend", label: "Opacity Blend", icon: I.layers },
  { id: "diff", label: "Difference", icon: I.search || I.ai },
  { id: "side", label: "Side by Side", icon: I.grid || I.columns },
];

export default function DrawingOverlay({ drawingA, drawingB, onClose }) {
  const C = useTheme();
  const T = C.T;
  const [mode, setMode] = useState("wipe");
  const [wipePos, setWipePos] = useState(50); // 0-100 percentage
  const [blendOpacity, setBlendOpacity] = useState(50); // 0-100
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  // Get canvas data for both drawings
  const pdfCanvases = useDrawingsStore(s => s.pdfCanvases);
  const canvasA = pdfCanvases[drawingA?.id];
  const canvasB = pdfCanvases[drawingB?.id];

  // Compute pixel difference on a canvas
  const diffCanvas = useMemo(() => {
    if (mode !== "diff" || !canvasA || !canvasB) return null;

    try {
      const w = Math.min(canvasA.width, canvasB.width);
      const h = Math.min(canvasA.height, canvasB.height);
      if (w === 0 || h === 0) return null;

      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext("2d");

      // Draw A
      const tempA = document.createElement("canvas");
      tempA.width = w;
      tempA.height = h;
      const ctxA = tempA.getContext("2d");
      ctxA.drawImage(canvasA, 0, 0, w, h);
      const dataA = ctxA.getImageData(0, 0, w, h);

      // Draw B
      const tempB = document.createElement("canvas");
      tempB.width = w;
      tempB.height = h;
      const ctxB = tempB.getContext("2d");
      ctxB.drawImage(canvasB, 0, 0, w, h);
      const dataB = ctxB.getImageData(0, 0, w, h);

      // Compute difference
      const diffData = ctx.createImageData(w, h);
      const threshold = 30; // Pixel difference threshold

      for (let i = 0; i < dataA.data.length; i += 4) {
        const dr = Math.abs(dataA.data[i] - dataB.data[i]);
        const dg = Math.abs(dataA.data[i + 1] - dataB.data[i + 1]);
        const db = Math.abs(dataA.data[i + 2] - dataB.data[i + 2]);
        const diff = (dr + dg + db) / 3;

        if (diff > threshold) {
          // Changed pixel — show as heat color
          const intensity = Math.min(255, diff * 3);
          // Old content in red, new content in green
          const isNewContent =
            dataB.data[i] + dataB.data[i + 1] + dataB.data[i + 2] <
            dataA.data[i] + dataA.data[i + 1] + dataA.data[i + 2];
          if (isNewContent) {
            // New content (darker in B) → green
            diffData.data[i] = 0;
            diffData.data[i + 1] = intensity;
            diffData.data[i + 2] = 0;
          } else {
            // Removed content (darker in A) → red/orange
            diffData.data[i] = intensity;
            diffData.data[i + 1] = Math.round(intensity * 0.3);
            diffData.data[i + 2] = 0;
          }
          diffData.data[i + 3] = 200;
        } else {
          // Unchanged — show faded original
          diffData.data[i] = dataB.data[i];
          diffData.data[i + 1] = dataB.data[i + 1];
          diffData.data[i + 2] = dataB.data[i + 2];
          diffData.data[i + 3] = 60;
        }
      }

      ctx.putImageData(diffData, 0, 0);
      return offscreen;
    } catch {
      return null;
    }
  }, [mode, canvasA, canvasB]);

  // Wipe slider drag handler
  const handleWipeDrag = useCallback(
    e => {
      if (!isDragging || mode !== "wipe") return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setWipePos(pct);
    },
    [isDragging, mode],
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleUp = () => setIsDragging(false);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchend", handleUp);
    window.addEventListener("mousemove", handleWipeDrag);
    window.addEventListener("touchmove", handleWipeDrag);
    return () => {
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchend", handleUp);
      window.removeEventListener("mousemove", handleWipeDrag);
      window.removeEventListener("touchmove", handleWipeDrag);
    };
  }, [isDragging, handleWipeDrag]);

  if (!drawingA || !drawingB) {
    return (
      <div style={{ ...card(C), padding: T.space[5], textAlign: "center" }}>
        <div style={{ color: C.textDim, fontSize: 12 }}>Select two drawing revisions to compare.</div>
      </div>
    );
  }

  const hasCanvases = canvasA && canvasB;

  return (
    <div
      style={{
        ...card(C),
        padding: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: `${T.space[2]}px ${T.space[4]}px`,
          borderBottom: `1px solid ${C.border}`,
          background: C.bg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <Ic d={I.layers || I.compare} size={16} color={C.accent} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Revision Comparison</span>
          <span style={{ fontSize: 9, color: C.textDim }}>
            {drawingA.label || drawingA.sheetNumber || "Rev A"} → {drawingB.label || drawingB.sheetNumber || "Rev B"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {/* Mode selector */}
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={bt(C, {
                padding: "4px 10px",
                fontSize: 9,
                fontWeight: 600,
                background: mode === m.id ? `${C.accent}15` : "transparent",
                color: mode === m.id ? C.accent : C.textDim,
                border: `1px solid ${mode === m.id ? C.accent + "40" : C.border}`,
                borderRadius: T.radius.full,
              })}
            >
              {m.label}
            </button>
          ))}

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              style={bt(C, {
                padding: "4px 8px",
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textDim,
                marginLeft: 8,
              })}
            >
              <Ic d={I.close} size={10} color={C.textDim} />
            </button>
          )}
        </div>
      </div>

      {/* Mode-specific controls */}
      {mode === "blend" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: T.space[3],
            padding: `${T.space[2]}px ${T.space[4]}px`,
            borderBottom: `1px solid ${C.border}06`,
            background: C.bg2,
          }}
        >
          <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600, minWidth: 50 }}>Rev A</span>
          <input
            type="range"
            min={0}
            max={100}
            value={blendOpacity}
            onChange={e => setBlendOpacity(Number(e.target.value))}
            style={{ flex: 1, accentColor: C.accent }}
          />
          <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600, minWidth: 50, textAlign: "right" }}>
            Rev B
          </span>
        </div>
      )}

      {mode === "diff" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: T.space[3],
            padding: `${T.space[2]}px ${T.space[4]}px`,
            borderBottom: `1px solid ${C.border}06`,
            background: C.bg2,
          }}
        >
          <span
            style={{
              fontSize: 8,
              padding: "2px 8px",
              borderRadius: 3,
              background: `rgba(0,200,0,0.15)`,
              color: C.green,
              fontWeight: 700,
            }}
          >
            ● New / Added
          </span>
          <span
            style={{
              fontSize: 8,
              padding: "2px 8px",
              borderRadius: 3,
              background: `rgba(255,100,0,0.15)`,
              color: C.orange || C.red,
              fontWeight: 700,
            }}
          >
            ● Removed / Changed
          </span>
          <span style={{ fontSize: 8, color: C.textDim }}>Unchanged areas are dimmed</span>
        </div>
      )}

      {/* Drawing viewport */}
      {!hasCanvases ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.textDim,
            fontSize: 12,
            padding: T.space[5],
          }}
        >
          <div style={{ textAlign: "center" }}>
            <Ic d={I.image || I.file} size={32} color={C.textDim} />
            <div style={{ marginTop: 8 }}>Drawing canvases not loaded. Open both drawings in the plan room first.</div>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            cursor: mode === "wipe" ? "ew-resize" : "default",
            background: "#1a1a2e",
          }}
          onMouseDown={_e => mode === "wipe" && setIsDragging(true)}
          onTouchStart={_e => mode === "wipe" && setIsDragging(true)}
        >
          {/* ── Wipe Slider Mode ── */}
          {mode === "wipe" && (
            <>
              {/* Full drawing B (bottom layer) */}
              <CanvasImage canvas={canvasB} style={{ position: "absolute", inset: 0 }} />

              {/* Drawing A clipped by wipe position */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  clipPath: `inset(0 ${100 - wipePos}% 0 0)`,
                }}
              >
                <CanvasImage canvas={canvasA} style={{ position: "absolute", inset: 0 }} />
              </div>

              {/* Wipe line */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${wipePos}%`,
                  width: 2,
                  background: C.accent,
                  boxShadow: `0 0 8px ${C.accent}60`,
                  zIndex: 10,
                  transform: "translateX(-1px)",
                }}
              />
              {/* Wipe handle */}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${wipePos}%`,
                  transform: "translate(-50%, -50%)",
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: C.accent,
                  border: `2px solid #fff`,
                  boxShadow: `0 2px 8px rgba(0,0,0,0.4)`,
                  zIndex: 11,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                ↔
              </div>

              {/* Labels */}
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  zIndex: 5,
                }}
              >
                Rev A: {drawingA.label || drawingA.sheetNumber || "Original"}
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  padding: "3px 8px",
                  borderRadius: 4,
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  zIndex: 5,
                }}
              >
                Rev B: {drawingB.label || drawingB.sheetNumber || "Revision"}
              </div>
            </>
          )}

          {/* ── Opacity Blend Mode ── */}
          {mode === "blend" && (
            <>
              <CanvasImage
                canvas={canvasA}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: 1 - blendOpacity / 100,
                }}
              />
              <CanvasImage
                canvas={canvasB}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: blendOpacity / 100,
                }}
              />
            </>
          )}

          {/* ── Difference Mode ── */}
          {mode === "diff" && (
            <>
              {diffCanvas ? (
                <CanvasImage canvas={diffCanvas} style={{ position: "absolute", inset: 0 }} />
              ) : (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.textDim,
                    fontSize: 12,
                  }}
                >
                  Computing difference...
                </div>
              )}
            </>
          )}

          {/* ── Side by Side Mode ── */}
          {mode === "side" && (
            <div style={{ display: "flex", height: "100%", gap: 2 }}>
              <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                <CanvasImage canvas={canvasA} style={{ position: "absolute", inset: 0 }} />
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 8,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  Rev A: {drawingA.label || drawingA.sheetNumber || "Original"}
                </div>
              </div>
              <div
                style={{
                  width: 2,
                  background: C.accent,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                <CanvasImage canvas={canvasB} style={{ position: "absolute", inset: 0 }} />
                <div
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                    fontSize: 9,
                    fontWeight: 700,
                  }}
                >
                  Rev B: {drawingB.label || drawingB.sheetNumber || "Revision"}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer stats */}
      <div
        style={{
          padding: `${T.space[2]}px ${T.space[4]}px`,
          borderTop: `1px solid ${C.border}`,
          background: C.bg,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 9, color: C.textDim }}>
          {drawingA.label || drawingA.sheetNumber || "Drawing A"}
          {drawingA.addendumNumber ? ` (Add. ${drawingA.addendumNumber})` : ""}
          {" → "}
          {drawingB.label || drawingB.sheetNumber || "Drawing B"}
          {drawingB.addendumNumber ? ` (Add. ${drawingB.addendumNumber})` : ""}
        </div>
        <div style={{ fontSize: 9, color: C.accent, fontWeight: 600 }}>
          {mode === "wipe" && `Wipe: ${Math.round(wipePos)}%`}
          {mode === "blend" && `Blend: ${blendOpacity}% Rev B`}
          {mode === "diff" && "Pixel Difference"}
          {mode === "side" && "Side by Side"}
        </div>
      </div>
    </div>
  );
}

/**
 * CanvasImage — Renders an HTML canvas element as an <img>.
 * Converts the canvas to a data URL for display.
 */
function CanvasImage({ canvas, style }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!canvas) return;
    try {
      setSrc(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      // Canvas may be tainted (cross-origin)
      setSrc(null);
    }
  }, [canvas]);

  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        ...style,
      }}
    />
  );
}
