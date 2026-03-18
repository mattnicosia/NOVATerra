/**
 * DrawingOverlay — Revision comparison with smart overlay modes
 *
 * Modes:
 *   1. Wipe Slider — animated side-by-side reveal
 *   2. Opacity Blend — adjustable transparency between revisions
 *   3. Difference Highlight — pixel-diff with change density heat map
 *   4. Side by Side — synchronized pan/zoom comparison
 *
 * Phase 2 enhancements:
 *   - Synced pan/zoom across all modes (wheel + drag)
 *   - Drawing picker dropdowns to select any two drawings
 *   - Takeoff overlay toggle (renders measurements on comparison)
 */

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card, inp } from "@/utils/styles";

const MODES = [
  { id: "wipe", label: "Wipe Slider", icon: I.compare || I.layers },
  { id: "blend", label: "Opacity Blend", icon: I.layers },
  { id: "diff", label: "Difference", icon: I.search || I.ai },
  { id: "side", label: "Side by Side", icon: I.grid || I.columns },
];

export default function DrawingOverlay({ drawingA: initialA, drawingB: initialB, drawings, onClose }) {
  const C = useTheme();
  const T = C.T;
  const [mode, setMode] = useState("wipe");
  const [wipePos, setWipePos] = useState(50);
  const [blendOpacity, setBlendOpacity] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [showTakeoffs, setShowTakeoffs] = useState(false);
  const containerRef = useRef(null);

  // Drawing picker state
  const [selectedA, setSelectedA] = useState(initialA);
  const [selectedB, setSelectedB] = useState(initialB);
  const drawingA = selectedA;
  const drawingB = selectedB;

  // Synced pan/zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // Get canvas data for both drawings
  const pdfCanvases = useDrawingsStore(s => s.pdfCanvases);
  const canvasA = pdfCanvases[drawingA?.id];
  const canvasB = pdfCanvases[drawingB?.id];

  // Get takeoffs for overlay
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const takeoffsA = useMemo(() => {
    if (!showTakeoffs || !drawingA) return [];
    return takeoffs.filter(t => t.drawingRef === drawingA.id && t.measurements?.some(m => m.points?.length > 0));
  }, [showTakeoffs, drawingA, takeoffs]);
  const takeoffsB = useMemo(() => {
    if (!showTakeoffs || !drawingB) return [];
    return takeoffs.filter(t => t.drawingRef === drawingB.id && t.measurements?.some(m => m.points?.length > 0));
  }, [showTakeoffs, drawingB, takeoffs]);

  // Available drawings list
  const allDrawings = useMemo(() => {
    if (drawings?.length > 0) return drawings;
    return useDrawingsStore.getState().drawings.filter(d => d.data || pdfCanvases[d.id]);
  }, [drawings, pdfCanvases]);

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

      const tempA = document.createElement("canvas");
      tempA.width = w;
      tempA.height = h;
      const ctxA = tempA.getContext("2d");
      ctxA.drawImage(canvasA, 0, 0, w, h);
      const dataA = ctxA.getImageData(0, 0, w, h);

      const tempB = document.createElement("canvas");
      tempB.width = w;
      tempB.height = h;
      const ctxB = tempB.getContext("2d");
      ctxB.drawImage(canvasB, 0, 0, w, h);
      const dataB = ctxB.getImageData(0, 0, w, h);

      const diffData = ctx.createImageData(w, h);
      const threshold = 30;

      for (let i = 0; i < dataA.data.length; i += 4) {
        const dr = Math.abs(dataA.data[i] - dataB.data[i]);
        const dg = Math.abs(dataA.data[i + 1] - dataB.data[i + 1]);
        const db = Math.abs(dataA.data[i + 2] - dataB.data[i + 2]);
        const diff = (dr + dg + db) / 3;

        if (diff > threshold) {
          const intensity = Math.min(255, diff * 3);
          const isNewContent =
            dataB.data[i] + dataB.data[i + 1] + dataB.data[i + 2] <
            dataA.data[i] + dataA.data[i + 1] + dataA.data[i + 2];
          if (isNewContent) {
            diffData.data[i] = 0;
            diffData.data[i + 1] = intensity;
            diffData.data[i + 2] = 0;
          } else {
            diffData.data[i] = intensity;
            diffData.data[i + 1] = Math.round(intensity * 0.3);
            diffData.data[i + 2] = 0;
          }
          diffData.data[i + 3] = 200;
        } else {
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

  // ── Pan/zoom handlers ──
  const handleWheel = useCallback(e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.25, Math.min(5, z * delta)));
  }, []);

  const handlePanStart = useCallback(
    e => {
      // Don't start pan if in wipe mode (wipe uses drag for slider)
      if (e.button === 1 || e.ctrlKey || e.metaKey) {
        // Middle-click or Ctrl+click always pans
      } else if (mode === "wipe") {
        setIsDragging(true);
        return;
      }
      setIsPanning(true);
      const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
      const clientY = e.clientY || e.touches?.[0]?.clientY || 0;
      panStart.current = { x: clientX, y: clientY, panX: pan.x, panY: pan.y };
    },
    [mode, pan],
  );

  const handlePanMove = useCallback(
    e => {
      if (isPanning) {
        const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
        const clientY = e.clientY || e.touches?.[0]?.clientY || 0;
        const dx = clientX - panStart.current.x;
        const dy = clientY - panStart.current.y;
        setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
      }
      if (isDragging && mode === "wipe") {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
        const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setWipePos(pct);
      }
    },
    [isPanning, isDragging, mode],
  );

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isPanning && !isDragging) return;
    window.addEventListener("mousemove", handlePanMove);
    window.addEventListener("mouseup", handlePanEnd);
    window.addEventListener("touchmove", handlePanMove);
    window.addEventListener("touchend", handlePanEnd);
    return () => {
      window.removeEventListener("mousemove", handlePanMove);
      window.removeEventListener("mouseup", handlePanEnd);
      window.removeEventListener("touchmove", handlePanMove);
      window.removeEventListener("touchend", handlePanEnd);
    };
  }, [isPanning, isDragging, handlePanMove, handlePanEnd]);

  // Attach wheel listener (passive: false for preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Reset zoom/pan on drawing change
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [drawingA?.id, drawingB?.id]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  if (!drawingA || !drawingB) {
    return (
      <div style={{ ...card(C), padding: T.space[5], textAlign: "center" }}>
        <div style={{ color: C.textDim, fontSize: 12 }}>Select two drawing revisions to compare.</div>
      </div>
    );
  }

  const hasCanvases = canvasA && canvasB;
  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: "center center",
    transition: isPanning || isDragging ? "none" : "transform 0.1s ease-out",
  };

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
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <Ic d={I.layers || I.compare} size={16} color={C.accent} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Compare</span>

          {/* Drawing picker A */}
          {allDrawings.length > 2 && (
            <>
              <select
                value={drawingA.id}
                onChange={e => {
                  const d = allDrawings.find(d => d.id === e.target.value);
                  if (d) setSelectedA(d);
                }}
                style={{ ...inp(C), padding: "2px 6px", fontSize: 9, maxWidth: 140 }}
              >
                {allDrawings.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.label || d.sheetNumber || d.id.slice(0, 8)}
                    {d.addendumNumber ? ` (Add.${d.addendumNumber})` : ""}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 9, color: C.textDim }}>vs</span>
              <select
                value={drawingB.id}
                onChange={e => {
                  const d = allDrawings.find(d => d.id === e.target.value);
                  if (d) setSelectedB(d);
                }}
                style={{ ...inp(C), padding: "2px 6px", fontSize: 9, maxWidth: 140 }}
              >
                {allDrawings.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.label || d.sheetNumber || d.id.slice(0, 8)}
                    {d.addendumNumber ? ` (Add.${d.addendumNumber})` : ""}
                  </option>
                ))}
              </select>
            </>
          )}
          {allDrawings.length <= 2 && (
            <span style={{ fontSize: 9, color: C.textDim }}>
              {drawingA.label || drawingA.sheetNumber || "Rev A"} → {drawingB.label || drawingB.sheetNumber || "Rev B"}
            </span>
          )}
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

          {/* Takeoff overlay toggle */}
          <button
            onClick={() => setShowTakeoffs(v => !v)}
            title="Show takeoff measurements"
            style={bt(C, {
              padding: "4px 8px",
              fontSize: 9,
              fontWeight: 600,
              background: showTakeoffs ? `${C.accent}15` : "transparent",
              color: showTakeoffs ? C.accent : C.textDim,
              border: `1px solid ${showTakeoffs ? C.accent + "40" : C.border}`,
              borderRadius: T.radius.full,
            })}
          >
            TO
          </button>

          {/* Zoom controls */}
          <span style={{ fontSize: 9, color: C.textDim, marginLeft: 4, minWidth: 32, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={resetView}
            title="Reset view"
            style={bt(C, {
              padding: "4px 8px",
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textDim,
              fontSize: 9,
            })}
          >
            Fit
          </button>

          {/* Close button */}
          {onClose && (
            <button
              onClick={onClose}
              style={bt(C, {
                padding: "4px 8px",
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textDim,
                marginLeft: 4,
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
              background: "rgba(0,200,0,0.15)",
              color: C.green,
              fontWeight: 700,
            }}
          >
            New / Added
          </span>
          <span
            style={{
              fontSize: 8,
              padding: "2px 8px",
              borderRadius: 3,
              background: "rgba(255,100,0,0.15)",
              color: C.orange || C.red,
              fontWeight: 700,
            }}
          >
            Removed / Changed
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
            cursor: isPanning ? "grabbing" : mode === "wipe" ? "ew-resize" : "grab",
            background: "#1a1a2e",
          }}
          onMouseDown={handlePanStart}
          onTouchStart={handlePanStart}
        >
          {/* ── Wipe Slider Mode ── */}
          {mode === "wipe" && (
            <div style={{ position: "absolute", inset: 0, ...transformStyle }}>
              {/* Full drawing B (bottom layer) */}
              <CanvasImage canvas={canvasB} style={{ position: "absolute", inset: 0 }} />
              {showTakeoffs && <TakeoffOverlay takeoffs={takeoffsB} C={C} />}

              {/* Drawing A clipped by wipe position */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  clipPath: `inset(0 ${100 - wipePos}% 0 0)`,
                }}
              >
                <CanvasImage canvas={canvasA} style={{ position: "absolute", inset: 0 }} />
                {showTakeoffs && <TakeoffOverlay takeoffs={takeoffsA} C={C} />}
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
                  border: "2px solid #fff",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
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
              <RevLabel side="left" drawing={drawingA} label="Rev A" />
              <RevLabel side="right" drawing={drawingB} label="Rev B" />
            </div>
          )}

          {/* ── Opacity Blend Mode ── */}
          {mode === "blend" && (
            <div style={{ position: "absolute", inset: 0, ...transformStyle }}>
              <CanvasImage
                canvas={canvasA}
                style={{ position: "absolute", inset: 0, opacity: 1 - blendOpacity / 100 }}
              />
              {showTakeoffs && <TakeoffOverlay takeoffs={takeoffsA} C={C} opacity={1 - blendOpacity / 100} />}
              <CanvasImage canvas={canvasB} style={{ position: "absolute", inset: 0, opacity: blendOpacity / 100 }} />
              {showTakeoffs && <TakeoffOverlay takeoffs={takeoffsB} C={C} opacity={blendOpacity / 100} />}
            </div>
          )}

          {/* ── Difference Mode ── */}
          {mode === "diff" && (
            <div style={{ position: "absolute", inset: 0, ...transformStyle }}>
              {diffCanvas ? (
                <>
                  <CanvasImage canvas={diffCanvas} style={{ position: "absolute", inset: 0 }} />
                  {showTakeoffs && <TakeoffOverlay takeoffs={takeoffsB} C={C} />}
                </>
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
            </div>
          )}

          {/* ── Side by Side Mode ── */}
          {mode === "side" && (
            <div style={{ display: "flex", height: "100%", gap: 2 }}>
              <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, ...transformStyle }}>
                  <CanvasImage canvas={canvasA} style={{ position: "absolute", inset: 0 }} />
                  {showTakeoffs && <TakeoffOverlay takeoffs={takeoffsA} C={C} />}
                </div>
                <RevLabel side="left" drawing={drawingA} label="Rev A" />
              </div>
              <div style={{ width: 2, background: C.accent, flexShrink: 0 }} />
              <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, ...transformStyle }}>
                  <CanvasImage canvas={canvasB} style={{ position: "absolute", inset: 0 }} />
                  {showTakeoffs && <TakeoffOverlay takeoffs={takeoffsB} C={C} />}
                </div>
                <RevLabel side="right" drawing={drawingB} label="Rev B" />
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
          {showTakeoffs && (takeoffsA.length > 0 || takeoffsB.length > 0) && (
            <span style={{ color: C.accent, marginLeft: 8 }}>
              {takeoffsA.length + takeoffsB.length} takeoff{takeoffsA.length + takeoffsB.length !== 1 ? "s" : ""} shown
            </span>
          )}
        </div>
        <div style={{ fontSize: 9, color: C.accent, fontWeight: 600 }}>
          {mode === "wipe" && `Wipe: ${Math.round(wipePos)}%`}
          {mode === "blend" && `Blend: ${blendOpacity}% Rev B`}
          {mode === "diff" && "Pixel Difference"}
          {mode === "side" && "Side by Side"}
          {zoom !== 1 && ` · ${Math.round(zoom * 100)}%`}
        </div>
      </div>
    </div>
  );
}

/**
 * RevLabel — Floating revision label badge
 */
function RevLabel({ side, drawing, label }) {
  const pos = side === "left" ? { top: 8, left: 8 } : { top: 8, right: 8 };
  return (
    <div
      style={{
        position: "absolute",
        ...pos,
        padding: "3px 8px",
        borderRadius: 4,
        background: "rgba(0,0,0,0.6)",
        color: "#fff",
        fontSize: 9,
        fontWeight: 700,
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      {label}: {drawing.label || drawing.sheetNumber || "Drawing"}
    </div>
  );
}

/**
 * TakeoffOverlay — Renders takeoff measurements as SVG polygons/polylines
 * on top of the drawing viewport. Points are in normalized 0-1 coords.
 */
function TakeoffOverlay({ takeoffs, C, opacity = 1 }) {
  if (!takeoffs || takeoffs.length === 0) return null;

  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity,
        zIndex: 4,
      }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {takeoffs.map(tk =>
        tk.measurements
          .filter(m => m.points?.length > 0)
          .map(m => {
            const pts = m.points.map(p => `${p[0] * 100},${p[1] * 100}`).join(" ");
            const color = tk.color || C.accent;

            if (m.type === "area" && m.points.length >= 3) {
              return (
                <polygon
                  key={m.id}
                  points={pts}
                  fill={`${color}20`}
                  stroke={color}
                  strokeWidth="0.3"
                  vectorEffect="non-scaling-stroke"
                />
              );
            }
            return (
              <polyline
                key={m.id}
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth="0.3"
                vectorEffect="non-scaling-stroke"
              />
            );
          }),
      )}
    </svg>
  );
}

/**
 * CanvasImage — Renders an HTML canvas element as an <img>.
 */
function CanvasImage({ canvas, style }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!canvas) return;
    try {
      setSrc(canvas.toDataURL("image/jpeg", 0.85));
    } catch {
      setSrc(null);
    }
  }, [canvas]);

  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        userSelect: "none",
        ...style,
      }}
    />
  );
}
