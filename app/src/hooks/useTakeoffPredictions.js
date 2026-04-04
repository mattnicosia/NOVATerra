import { useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { hexAlpha } from "@/utils/fieldPhysics";
import { extractPageData, isExtracted } from "@/utils/pdfExtractor";
import { runSmartPredictions } from "@/utils/predictiveEngine";

/**
 * useTakeoffPredictions
 *
 * Owns the two prediction-related useEffect blocks that were in TakeoffsPage:
 *   1. Background PDF extraction when drawing changes (pre-extract adjacent pages)
 *   2. Ghost prediction rendering (animated overlay on predictionCanvasRef)
 *
 * @param {Object} params
 * @param {React.RefObject} params.canvasRef - main measurement canvas (for size matching)
 * @returns {{ predictionCanvasRef: React.RefObject }}
 */
export default function useTakeoffPredictions({ canvasRef }) {
  const C = useTheme();

  // Refs owned by this hook
  const predictionCanvasRef = useRef(null);
  const predScanAnimRef = useRef(null);
  const predScanPhaseRef = useRef(0);

  // Store subscriptions — used as effect dependencies to trigger re-runs
  const drawings = useDrawingsStore(s => s.drawings);
  const selectedDrawingId = useDrawingsStore(s => s.selectedDrawingId);

  const tkPredictions = useTakeoffsStore(s => s.tkPredictions);
  const tkPredAccepted = useTakeoffsStore(s => s.tkPredAccepted);
  const tkPredRejected = useTakeoffsStore(s => s.tkPredRejected);
  const tkPredContext = useTakeoffsStore(s => s.tkPredContext);
  const tkPredRefining = useTakeoffsStore(s => s.tkPredRefining);
  const tkActiveTakeoffId = useTakeoffsStore(s => s.tkActiveTakeoffId);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const tkRefinementPending = useTakeoffsStore(s => s.tkRefinementPending);
  const tkTool = useTakeoffsStore(s => s.tkTool);

  // ─── PREDICTIVE TAKEOFF: Refinement re-fire after consecutive misses ───
  useEffect(() => {
    if (!tkRefinementPending) return;
    // Clear the flag immediately to prevent loops
    useTakeoffsStore.getState().clearRefinementPending();

    // Gather current context from stores (fresh reads to avoid stale closures)
    const { tkActiveTakeoffId: toId, takeoffs: tks, tkTool: tool } = useTakeoffsStore.getState();
    const { selectedDrawingId: dwgId, drawings: dwgs } = useDrawingsStore.getState();
    const activeTo = tks.find(t => t.id === toId);
    const drawing = dwgs.find(d => d.id === dwgId);
    if (!activeTo || !drawing) return;

    const measureType = tool === "count" ? "count" : tool === "area" ? "area" : "linear";

    // Re-run smart predictions with updated context
    runSmartPredictions(drawing, activeTo, measureType, null)
      .then(result => {
        if (result && result.predictions?.length > 0) {
          useTakeoffsStore.getState().setTkPredictions(result);
        } else {
          // No new predictions found — clear refining state
          useTakeoffsStore.getState().setTkPredRefining(false);
        }
      })
      .catch(() => {
        useTakeoffsStore.getState().setTkPredRefining(false);
      });
  }, [tkRefinementPending]);

  // ─── PREDICTIVE TAKEOFF: Background PDF extraction when drawing changes ───
  // Extracts selected drawing immediately, then pre-extracts adjacent drawings (next/prev)
  useEffect(() => {
    if (!selectedDrawingId) return;
    const pdfDrawings = drawings.filter(d => d.type === "pdf" && d.data);
    const drawing = pdfDrawings.find(d => d.id === selectedDrawingId);
    if (!drawing) return;

    // Extract selected drawing (immediate)
    if (!isExtracted(drawing.id)) {
      extractPageData(drawing).catch(err => console.warn("PDF extraction failed:", err));
    }

    // Pre-extract adjacent drawings (staggered, non-blocking)
    const idx = pdfDrawings.findIndex(d => d.id === selectedDrawingId);
    if (idx !== -1 && pdfDrawings.length > 1) {
      const nextIdx = (idx + 1) % pdfDrawings.length;
      const prevIdx = (idx - 1 + pdfDrawings.length) % pdfDrawings.length;
      const adjacent = [pdfDrawings[nextIdx], pdfDrawings[prevIdx]].filter(d => d && !isExtracted(d.id));
      let cancelled = false;
      const timers = adjacent.map((d, i) =>
        setTimeout(
          () => {
            if (!cancelled) extractPageData(d).catch(() => {});
          },
          300 + i * 200,
        ),
      ); // stagger: 300ms, 500ms
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }
  }, [selectedDrawingId, drawings]);

  // ─── PREDICTIVE TAKEOFF: Ghost prediction rendering (animated) ───
  useEffect(() => {
    const canvas = predictionCanvasRef.current;
    const mainCanvas = canvasRef.current;
    if (!canvas || !mainCanvas) return;
    if (canvas.width !== mainCanvas.width || canvas.height !== mainCanvas.height) {
      canvas.width = mainCanvas.width;
      canvas.height = mainCanvas.height;
    }

    if (!tkPredictions || !tkPredictions.predictions || tkPredictions.predictions.length === 0) {
      // Clear prediction overlay
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (predScanAnimRef.current) {
        cancelAnimationFrame(predScanAnimRef.current);
        predScanAnimRef.current = null;
      }
      return;
    }

    const activeTo = takeoffs.find(t => t.id === tkActiveTakeoffId);
    const predColor = activeTo?.color || C.accent;
    const predictions = tkPredictions.predictions;
    const waveCenterX = predictions.reduce((s, p) => s + (p.point?.x || p.points?.[0]?.x || 0), 0) / predictions.length;
    const waveCenterY = predictions.reduce((s, p) => s + (p.point?.y || p.points?.[0]?.y || 0), 0) / predictions.length;

    // Progressive confidence scaling
    const confidence = tkPredContext?.confidence || 0.7;
    const isRefining = tkPredRefining;

    // Confidence-based visual parameters (progressive reveal)
    const confLevel = confidence < 0.5 ? "low" : confidence < 0.75 ? "med" : "high";
    const ghostBaseOpacity = confLevel === "low" ? 0.2 : confLevel === "med" ? 0.35 : 0.5;
    const ghostPulseRange = confLevel === "low" ? 0.08 : confLevel === "med" ? 0.12 : 0.18;
    const ghostSize = confLevel === "low" ? 10 : confLevel === "med" ? 12 : 14;
    const ghostGlow = confLevel === "low" ? 6 : confLevel === "med" ? 10 : 14;

    // Animated render loop for ghost predictions + scan wave
    let lastTime = 0;
    const renderFrame = time => {
      if (!predictionCanvasRef.current) return;
      const ctx = predictionCanvasRef.current.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Advance scan wave phase (0->1 over 2 seconds, repeating)
      const dt = lastTime ? (time - lastTime) / 1000 : 0.016;
      lastTime = time;
      predScanPhaseRef.current = (predScanPhaseRef.current + dt * 0.5) % 1;
      const phase = predScanPhaseRef.current;

      const acceptedSet = new Set(tkPredAccepted);
      const rejectedSet = new Set(tkPredRejected);
      predictions.forEach((pred, idx) => {
        const isAccepted = acceptedSet.has(pred.id);
        const isRejected = rejectedSet.has(pred.id);
        if (isRejected) return;

        // Stagger each prediction's appearance with a cascade delay
        const cascadeDelay = idx * 0.08;
        const localPhase = Math.max(0, phase * 3 - cascadeDelay);

        ctx.save();

        if (isRefining && !isAccepted) {
          // Refining state: very dim
          ctx.globalAlpha = 0.12;
        } else if (isAccepted) {
          ctx.globalAlpha = 0.85;
        } else {
          // Progressive ghost pulse
          const pulse = ghostBaseOpacity + ghostPulseRange * Math.sin(phase * Math.PI * 2);
          ctx.globalAlpha = Math.min(pulse, localPhase > 0 ? 1 : 0);
        }

        // Vision predictions always have a single `point` — render as dot marker
        // regardless of type (count, linear, area). Multi-point predictions (wall, area
        // with points array) use their own specialized renderers below.
        if (
          pred.point &&
          (pred.type === "count" ||
            pred.type === "wall-tag" ||
            pred.type === "linear" ||
            (pred.type === "area" && !pred.points))
        ) {
          const p = pred.point;
          const sz = isAccepted ? 16 : ghostSize;
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.shadowColor = isAccepted ? predColor : C.accent;
          ctx.shadowBlur = isAccepted ? 16 : ghostGlow;
          ctx.fillStyle = isAccepted ? predColor + "DD" : predColor + "66";
          ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
          const innerSz = sz * 0.45;
          ctx.fillStyle = isAccepted ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)";
          ctx.fillRect(-innerSz / 2, -innerSz / 2, innerSz, innerSz);
          ctx.shadowBlur = 0;
          ctx.strokeStyle = isAccepted ? predColor : predColor + "AA";
          ctx.lineWidth = isAccepted ? 2 : 1.5;
          ctx.setLineDash(isAccepted ? [] : [3, 2]);
          ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
          ctx.setLineDash([]);

          // NOVA sparkle badge on ghost predictions
          if (!isAccepted && confLevel !== "low") {
            ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transform
            ctx.translate(p.x, p.y);
            ctx.font = `${isAccepted ? 10 : 8}px sans-serif`;
            ctx.fillStyle = hexAlpha(C.accent, isAccepted ? 0.9 : 0.6);
            ctx.fillText("\u2726", sz * 0.5 + 2, -sz * 0.5 - 2);
          }
        } else if (pred.type === "wall" && pred.points?.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pred.points[0].x, pred.points[0].y);
          for (let i = 1; i < pred.points.length; i++) {
            ctx.lineTo(pred.points[i].x, pred.points[i].y);
          }
          ctx.shadowColor = isAccepted ? predColor : C.accent;
          ctx.shadowBlur = isAccepted ? 12 : ghostGlow;
          ctx.strokeStyle = isAccepted ? predColor : predColor + "88";
          ctx.lineWidth = isAccepted ? 3 : 2;
          ctx.setLineDash(isAccepted ? [] : [8, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          pred.points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, isAccepted ? 4 : 3, 0, Math.PI * 2);
            ctx.fillStyle = isAccepted ? predColor : predColor + "AA";
            ctx.shadowBlur = 0;
            ctx.fill();
          });
        } else if (pred.type === "area" && pred.points?.length >= 3) {
          // Ghost area polygon -- semi-transparent fill with dashed border
          ctx.beginPath();
          ctx.moveTo(pred.points[0].x, pred.points[0].y);
          for (let i = 1; i < pred.points.length; i++) {
            ctx.lineTo(pred.points[i].x, pred.points[i].y);
          }
          ctx.closePath();
          ctx.shadowColor = isAccepted ? predColor : C.accent;
          ctx.shadowBlur = isAccepted ? 8 : ghostGlow * 0.5;
          ctx.fillStyle = isAccepted ? predColor + "25" : hexAlpha(C.accent, 0.08);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = isAccepted ? predColor : hexAlpha(C.accent, 0.5);
          ctx.lineWidth = isAccepted ? 2 : 1.5;
          ctx.setLineDash(isAccepted ? [] : [6, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          // Room label at centroid
          if (pred.point) {
            ctx.font = "bold 10px 'Switzer', sans-serif";
            ctx.fillStyle = isAccepted ? predColor : hexAlpha(C.accent, 0.7);
            ctx.textAlign = "center";
            ctx.fillText(pred.tag || "Room", pred.point.x, pred.point.y + 4);
          }
        }
        ctx.restore();
      });

      // Scan wave ripple
      if (!tkPredAccepted.length && predictions.length > 0 && !isRefining) {
        const centerX = waveCenterX;
        const centerY = waveCenterY;
        const maxR = Math.max(canvas.width, canvas.height) * 0.6;
        const waveR = phase * maxR;
        const waveAlpha = Math.max(0, 0.12 * (1 - phase));
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, waveR, 0, Math.PI * 2);
        ctx.strokeStyle = hexAlpha(C.accent, waveAlpha);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      predScanAnimRef.current = requestAnimationFrame(renderFrame);
    };

    predScanAnimRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (predScanAnimRef.current) cancelAnimationFrame(predScanAnimRef.current);
    };
  }, [tkPredictions, tkPredAccepted, tkPredRejected, tkActiveTakeoffId, takeoffs, tkPredContext, tkPredRefining, C.accent, canvasRef]);

  return { predictionCanvasRef };
}
