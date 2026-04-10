/**
 * useTakeoffEffects — Side effects for TakeoffsPage
 *
 * Extracted from TakeoffsPage.jsx to reduce file size.
 * Contains:
 * - Keyboard shortcuts (Escape, Tab, Enter, Delete, Ctrl+D)
 * - Proactive predictions effect
 * - Pan listeners
 * - DB search effect
 * - Auto-select first drawing + lazy PDF rendering
 * - Auto-scroll filmstrip
 * - Wheel handler attachment
 * - Session persistence effects
 */
import { useEffect, useRef } from "react";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useUiStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { unitToTool } from "@/hooks/useMeasurementEngine";
import { uid } from "@/utils/format";
import { autoRecordFromPredState } from "@/utils/crossSheetLearning";
import { runSmartPredictions } from "@/utils/predictiveEngine";
import { inferViewType } from "@/utils/uploadPipeline";

export default function useTakeoffEffects({
  // Refs
  drawingContainerRef,
  tkPanning,
  tkPanStart,
  compactStripRef,
  canvasRef,
  predScanGenRef,
  predScanKeyRef,
  // Handlers
  handleDrawingWheel,
  stopMeasuring,
  engageMeasuring,
  renderPdfPage,
  // State values for keyboard handler deps
  tkTool,
  tkMeasureState,
  tkSelectedTakeoffId,
  // DB search deps
  tkNewInput,
  elements,
  assemblies,
  // State for prediction deps
  tkActiveTakeoffId,
  selectedDrawingId,
  drawings,
  // Geo analysis setter
  setGeoAnalysis,
}) {
  const showToast = useUiStore(s => s.showToast);

  // ─── Pan listeners ───
  useEffect(() => {
    const setTkPan = useDrawingPipelineStore.getState().setTkPan;
    const setTkContextMenu = useDrawingPipelineStore.getState().setTkContextMenu;
    const onMove = e => {
      if (!tkPanning.current) return;
      const dx = e.clientX - tkPanStart.current.x;
      const dy = e.clientY - tkPanStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) tkPanStart.current.moved = true;
      setTkPan({ x: tkPanStart.current.panX + dx, y: tkPanStart.current.panY + dy });
    };
    const onUp = e => {
      if ((e.button === 2 || e.button === 1) && tkPanning.current) {
        const didMove = tkPanStart.current.moved;
        tkPanning.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (e.button === 2 && !didMove) {
          // Hit-test measurements at right-click position
          let hitMeasurement = null;
          const canvas = canvasRef?.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const pt = { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
            const { takeoffs, selectedDrawingId: sheetId } = useDrawingPipelineStore.getState();
            const zoomScale = Math.max(1, canvas.width / rect.width);
            const countRadius = Math.max(30, 30 * zoomScale);
            const lineRadius = Math.max(12, 15 * zoomScale);
            outer: for (const to of takeoffs) {
              for (const m of to.measurements || []) {
                if (m.sheetId !== sheetId) continue;
                if (m.type === "count") {
                  const d = Math.sqrt((pt.x - m.points[0].x) ** 2 + (pt.y - m.points[0].y) ** 2);
                  if (d < countRadius) { hitMeasurement = { takeoffId: to.id, measurementId: m.id, desc: to.description }; break outer; }
                } else if (m.type === "linear" && m.points.length >= 2) {
                  for (let i = 0; i < m.points.length - 1; i++) {
                    const a = m.points[i], b = m.points[i + 1];
                    const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
                    if (len < 1) continue;
                    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (len * len)));
                    const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
                    const dist = Math.sqrt((pt.x - proj.x) ** 2 + (pt.y - proj.y) ** 2);
                    if (dist < lineRadius) { hitMeasurement = { takeoffId: to.id, measurementId: m.id, desc: to.description }; break outer; }
                  }
                } else if (m.type === "area" && m.points.length >= 3) {
                  let inside = false;
                  const pts = m.points;
                  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
                    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
                    if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
                  }
                  if (inside) { hitMeasurement = { takeoffId: to.id, measurementId: m.id, desc: to.description }; break outer; }
                }
              }
            }
          }
          setTkContextMenu({ x: e.clientX, y: e.clientY, hitMeasurement });
        }
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [canvasRef, tkMeasureState, tkPanning, tkPanStart]);

  // Reset pan on drawing change
  useEffect(() => {
    useDrawingPipelineStore.getState().setTkPan({ x: 0, y: 0 });
  }, [selectedDrawingId]);

  // ─── Proactive predictions ───
  useEffect(() => {
    const scanKey = `${tkActiveTakeoffId}::${selectedDrawingId}`;
    if (scanKey !== predScanKeyRef.current) {
      useDrawingPipelineStore.getState().clearPredictions();
      predScanKeyRef.current = scanKey;
    }
    if (!tkActiveTakeoffId || !selectedDrawingId) return;
    const currentMeasureState = useDrawingPipelineStore.getState().tkMeasureState;
    if (currentMeasureState !== "measuring" && currentMeasureState !== "paused") return;
    const to = useDrawingPipelineStore.getState().takeoffs.find(t => t.id === tkActiveTakeoffId);
    if (!to) return;
    const drawing = useDrawingPipelineStore.getState().drawings.find(d => d.id === selectedDrawingId);
    if (!drawing || drawing.type !== "pdf" || !drawing.data) {
      console.log(`[NOVA] Proactive scan blocked: type=${drawing?.type} data=${!!drawing?.data}`);
      return;
    }
    const gen = ++predScanGenRef.current;
    const measureType = unitToTool(to.unit);
    const sheetMs = (to.measurements || []).filter(m => m.sheetId === selectedDrawingId);
    let clickPt;
    if (sheetMs.length > 0) {
      const pts = sheetMs.flatMap(m => m.points || []);
      clickPt = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    } else {
      const c = canvasRef.current;
      clickPt = c ? { x: c.width / 2, y: c.height / 2 } : { x: 500, y: 400 };
    }
    console.log("[NOVA] Proactive scan gen=" + gen + ":", to.description, measureType, "at", clickPt);
    showToast(`\u2726 NOVA scanning for "${to.description?.slice(0, 30)}"...`, "info");
    runSmartPredictions(drawing, to, measureType, clickPt)
      .then(result => {
        if (predScanGenRef.current !== gen) {
          console.log("[NOVA] Stale result gen=" + gen + " (current=" + predScanGenRef.current + "), discarding");
          return;
        }
        console.log(
          "[NOVA] Result gen=" + gen + ":",
          result.source, result.strategy, result.tag,
          result.predictions.length, "predictions", result.message || "",
        );
        const currentActiveId = useDrawingPipelineStore.getState().tkActiveTakeoffId;
        if (currentActiveId !== tkActiveTakeoffId) return;
        if (result.predictions.length > 0) {
          useDrawingPipelineStore.getState().setTkPredictions({
            tag: result.tag,
            predictions: result.predictions,
            scanning: false,
            totalInstances: result.totalInstances,
            source: result.source,
            strategy: result.strategy,
            takeoffId: result.takeoffId,
          });
          useDrawingPipelineStore.getState().initPredContext(result.tag, result.source, result.confidence);
          showToast(`\u2726 Found ${result.predictions.length} "${result.tag || "items"}" \u2014 review predictions`, "success");
        } else {
          console.log("[NOVA] Proactive scan returned 0 predictions:", result.message || result.strategy);
          if (result.needsRepair && !window._novaRepairToastShown) {
            window._novaRepairToastShown = true;
            showToast("Drop the original PDF onto the drawing to enable NOVA predictions", "info");
          }
        }
      })
      .catch(err => {
        if (predScanGenRef.current !== gen) return;
        console.warn("Proactive prediction failed:", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tkActiveTakeoffId, selectedDrawingId]);

  // ─── Auto-scroll filmstrip ───
  useEffect(() => {
    if (selectedDrawingId && compactStripRef.current) {
      const el = compactStripRef.current.querySelector(`[data-drawing-id="${selectedDrawingId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedDrawingId, compactStripRef]);

  // ─── Wheel handler ───
  useEffect(() => {
    const container = drawingContainerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleDrawingWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleDrawingWheel);
  }, [handleDrawingWheel, drawingContainerRef]);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handler = e => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        useDrawingPipelineStore.getState().setTkContextMenu(null);
        if (isTyping) {
          document.activeElement.blur();
          return;
        }
        if (tkMeasureState === "measuring" || tkMeasureState === "paused") {
          stopMeasuring();
        } else if (tkSelectedTakeoffId) {
          useDrawingPipelineStore.getState().setTkSelectedTakeoffId(null);
          useDrawingPipelineStore.getState().setTkActivePoints([]);
          if (tkTool !== "select") useDrawingPipelineStore.getState().setTkTool("select");
        } else {
          useDrawingPipelineStore.getState().setTkActivePoints([]);
          if (tkTool !== "select") useDrawingPipelineStore.getState().setTkTool("select");
        }
        return;
      }

      if (e.key === "Tab" && !isTyping) {
        const allTos = useDrawingPipelineStore.getState().takeoffs;
        if (allTos.length === 0) return;
        e.preventDefault();
        const currentIdx = allTos.findIndex(t => t.id === tkSelectedTakeoffId);
        let nextIdx;
        if (e.shiftKey) {
          nextIdx = currentIdx <= 0 ? allTos.length - 1 : currentIdx - 1;
        } else {
          nextIdx = currentIdx < allTos.length - 1 ? currentIdx + 1 : 0;
        }
        if (tkMeasureState === "measuring" || tkMeasureState === "paused") {
          stopMeasuring();
        }
        const nextId = allTos[nextIdx].id;
        useDrawingPipelineStore.getState().setTkSelectedTakeoffId(nextId);
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-takeoff-id="${nextId}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return;
      }

      if (e.key === "Enter" && !isTyping) {
        if (tkSelectedTakeoffId && tkMeasureState !== "measuring") {
          const drawingId = useDrawingPipelineStore.getState().selectedDrawingId;
          if (drawingId) {
            e.preventDefault();
            engageMeasuring(tkSelectedTakeoffId);
          }
        }
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && !isTyping) {
        if (tkSelectedTakeoffId && tkMeasureState !== "measuring") {
          e.preventDefault();
          useDrawingPipelineStore.getState().removeTakeoff(tkSelectedTakeoffId);
          useDrawingPipelineStore.getState().setTkSelectedTakeoffId(null);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !isTyping) {
        e.preventDefault();
        if (tkMeasureState === "measuring") {
          // During active measurement: undo last click point
          const points = useDrawingPipelineStore.getState().tkActivePoints;
          if (points.length > 0) {
            useDrawingPipelineStore.getState().setTkActivePoints(points.slice(0, -1));
            return;
          }
        }
        // Not measuring (or no points left): undo last store action (measurement, edit, etc.)
        const actionName = useUndoStore.getState().undo();
        if (actionName) {
          useUiStore.getState().showToast(`Undone: ${actionName}`, "info");
        }
        return;
      }

      // O key: toggle circle tool
      if (e.key === "o" && !isTyping && !e.metaKey && !e.ctrlKey) {
        const s = useDrawingPipelineStore.getState();
        if (s.tkTool === "circle") {
          s.setTkTool(s.tkActiveTakeoffId ? "area" : "select");
          s.setTkActivePoints([]);
        } else if (s.tkActiveTakeoffId && s.tkMeasureState === "measuring") {
          s.setTkTool("circle");
          s.setTkActivePoints([]);
        } else if (s.tkSelectedTakeoffId) {
          s.setTkActiveTakeoffId(s.tkSelectedTakeoffId);
          s.setTkTool("circle");
          s.setTkMeasureState("measuring");
          s.setTkActivePoints([]);
        }
        return;
      }

      // R key: toggle rect tool
      if (e.key === "r" && !isTyping && !e.metaKey && !e.ctrlKey) {
        const s = useDrawingPipelineStore.getState();
        if (s.tkTool === "rect") {
          // Toggle off
          s.setTkTool(s.tkActiveTakeoffId ? "area" : "select");
          s.setTkActivePoints([]);
        } else if (s.tkActiveTakeoffId && s.tkMeasureState === "measuring") {
          s.setTkTool("rect");
          s.setTkActivePoints([]);
        } else if (s.tkSelectedTakeoffId) {
          s.setTkActiveTakeoffId(s.tkSelectedTakeoffId);
          s.setTkTool("rect");
          s.setTkMeasureState("measuring");
          s.setTkActivePoints([]);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "d" && !isTyping) {
        if (tkSelectedTakeoffId) {
          e.preventDefault();
          const allTos = useDrawingPipelineStore.getState().takeoffs;
          const src = allTos.find(t => t.id === tkSelectedTakeoffId);
          if (src) {
            const dup = { ...src, id: uid(), linkedItemId: "", measurements: [] };
            useDrawingPipelineStore.getState().setTakeoffs([...allTos, dup]);
          }
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tkTool, tkMeasureState, tkSelectedTakeoffId, stopMeasuring, engageMeasuring]);

  // ─── DB search ───
  useEffect(() => {
    if (!tkNewInput.trim()) {
      useDrawingPipelineStore.getState().setTkDbResults([]);
      return;
    }
    const q = tkNewInput.toLowerCase();
    const itemResults = elements
      .filter(el => (el.name || "").toLowerCase().includes(q) || (el.code || "").toLowerCase().includes(q))
      .slice(0, 8);
    const asmResults = (assemblies || [])
      .filter(
        a =>
          (a.name || "").toLowerCase().includes(q) ||
          (a.code || "").toLowerCase().includes(q) ||
          (a.description || "").toLowerCase().includes(q),
      )
      .slice(0, 4);
    const combined = [
      ...asmResults.map(a => ({ ...a, _type: "assembly" })),
      ...itemResults.map(el => ({ ...el, _type: "item" })),
    ];
    useDrawingPipelineStore.getState().setTkDbResults(combined);
  }, [tkNewInput, elements, assemblies]);

  // ─── Auto-select first drawing + lazy PDF rendering ───
  useEffect(() => {
    if (drawings.length === 0) return;
    const withData = drawings.filter(d => d.data);
    if (withData.length === 0) return;

    const ds = useDrawingPipelineStore.getState();
    if (!ds.selectedDrawingId || !withData.find(d => d.id === ds.selectedDrawingId)) {
      const savedId = sessionStorage.getItem("bldg-selectedDrawingId");
      const savedDrawing = savedId && withData.find(d => d.id === savedId);
      const target = savedDrawing || withData[0];
      ds.setSelectedDrawingId(target.id);
      if (target.type === "pdf") renderPdfPage(target);
    }

    let cancelled = false;
    (async () => {
      const current = useDrawingPipelineStore.getState().pdfCanvases;
      const pending = withData.filter(d => d.type === "pdf" && !current[d.id]);
      for (const d of pending) {
        if (cancelled) break;
        await renderPdfPage(d);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawings.length]);

  // ─── One-time migration: infer viewType ───
  useEffect(() => {
    const ds = useDrawingPipelineStore.getState();
    ds.drawings.forEach(d => {
      if (d.sheetTitle && !d.viewType) {
        const vt = inferViewType(d.sheetTitle);
        if (vt) ds.updateDrawing(d.id, "viewType", vt);
      }
    });
  }, []);

  // ─── Persist selected drawing + cross-sheet learning ───
  const prevDrawingIdRef = useRef(selectedDrawingId);
  useEffect(() => {
    if (selectedDrawingId) sessionStorage.setItem("bldg-selectedDrawingId", selectedDrawingId);
    setGeoAnalysis({ loading: false, results: null });
    const prevId = prevDrawingIdRef.current;
    if (prevId && prevId !== selectedDrawingId) {
      useDrawingPipelineStore.getState().saveTkSheetView(prevId);
      try {
        const s = useDrawingPipelineStore.getState();
        if (s.tkActiveTakeoffId && s.tkPredictions) {
          const manualCount = (s.takeoffs.find(t => t.id === s.tkActiveTakeoffId)?.measurements || [])
            .filter(m => m.sheetId === prevId && !m.predicted).length;
          autoRecordFromPredState(
            s.tkActiveTakeoffId, prevId,
            s.tkPredContext, s.tkPredictions,
            s.tkPredAccepted, s.tkPredRejected,
            manualCount,
          );
        }
      } catch { /* cross-sheet learning non-critical */ }
    }
    if (selectedDrawingId && selectedDrawingId !== prevId) {
      const restored = useDrawingPipelineStore.getState().restoreTkSheetView(selectedDrawingId);
      if (!restored) {
        useDrawingPipelineStore.getState().setTkZoom(100);
        useDrawingPipelineStore.getState().setTkPan({ x: 0, y: 0 });
      }
    }
    prevDrawingIdRef.current = selectedDrawingId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDrawingId]);
}
