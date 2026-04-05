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
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useUiStore } from "@/stores/uiStore";
import { unitToTool } from "@/hooks/useMeasurementEngine";
import { uid } from "@/utils/format";
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
  // Cross-sheet scan
  setCrossSheetScan,
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
  pdfCanvases,
  // Geo analysis setter
  setGeoAnalysis,
}) {
  const showToast = useUiStore(s => s.showToast);

  // ─── Pan listeners ───
  useEffect(() => {
    const setTkPan = useTakeoffsStore.getState().setTkPan;
    const setTkContextMenu = useTakeoffsStore.getState().setTkContextMenu;
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
          setTkContextMenu({ x: e.clientX, y: e.clientY });
        }
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [tkMeasureState, tkPanning, tkPanStart]);

  // Reset pan on drawing change
  useEffect(() => {
    useTakeoffsStore.getState().setTkPan({ x: 0, y: 0 });
  }, [selectedDrawingId]);

  // ─── Proactive predictions ───
  useEffect(() => {
    const scanKey = `${tkActiveTakeoffId}::${selectedDrawingId}`;
    if (scanKey !== predScanKeyRef.current) {
      useTakeoffsStore.getState().clearPredictions();
      predScanKeyRef.current = scanKey;
    }
    if (!tkActiveTakeoffId || !selectedDrawingId) return;
    const currentMeasureState = useTakeoffsStore.getState().tkMeasureState;
    if (currentMeasureState !== "measuring" && currentMeasureState !== "paused") return;
    const to = useTakeoffsStore.getState().takeoffs.find(t => t.id === tkActiveTakeoffId);
    if (!to) return;
    const drawing = useDrawingsStore.getState().drawings.find(d => d.id === selectedDrawingId);
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
        const currentActiveId = useTakeoffsStore.getState().tkActiveTakeoffId;
        if (currentActiveId !== tkActiveTakeoffId) return;
        if (result.predictions.length > 0) {
          useTakeoffsStore.getState().setTkPredictions({
            tag: result.tag,
            predictions: result.predictions,
            scanning: false,
            totalInstances: result.totalInstances,
            source: result.source,
            strategy: result.strategy,
            takeoffId: result.takeoffId,
          });
          useTakeoffsStore.getState().initPredContext(result.tag, result.source, result.confidence);
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
        useTakeoffsStore.getState().setTkContextMenu(null);
        if (isTyping) {
          document.activeElement.blur();
          return;
        }
        if (tkMeasureState === "measuring" || tkMeasureState === "paused") {
          stopMeasuring();
        } else if (tkSelectedTakeoffId) {
          useTakeoffsStore.getState().setTkSelectedTakeoffId(null);
          useTakeoffsStore.getState().setTkActivePoints([]);
          if (tkTool !== "select") useTakeoffsStore.getState().setTkTool("select");
        } else {
          useTakeoffsStore.getState().setTkActivePoints([]);
          if (tkTool !== "select") useTakeoffsStore.getState().setTkTool("select");
        }
        return;
      }

      if (e.key === "Tab" && !isTyping) {
        const allTos = useTakeoffsStore.getState().takeoffs;
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
        useTakeoffsStore.getState().setTkSelectedTakeoffId(nextId);
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-takeoff-id="${nextId}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return;
      }

      if (e.key === "Enter" && !isTyping) {
        if (tkSelectedTakeoffId && tkMeasureState !== "measuring") {
          const drawingId = useDrawingsStore.getState().selectedDrawingId;
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
          useTakeoffsStore.getState().removeTakeoff(tkSelectedTakeoffId);
          useTakeoffsStore.getState().setTkSelectedTakeoffId(null);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "d" && !isTyping) {
        if (tkSelectedTakeoffId) {
          e.preventDefault();
          const allTos = useTakeoffsStore.getState().takeoffs;
          const src = allTos.find(t => t.id === tkSelectedTakeoffId);
          if (src) {
            const dup = { ...src, id: uid(), linkedItemId: "", measurements: [] };
            useTakeoffsStore.getState().setTakeoffs([...allTos, dup]);
          }
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tkTool, tkMeasureState, tkSelectedTakeoffId, stopMeasuring, engageMeasuring]);

  // ─── DB search ───
  useEffect(() => {
    if (!tkNewInput.trim()) {
      useTakeoffsStore.getState().setTkDbResults([]);
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
    useTakeoffsStore.getState().setTkDbResults(combined);
  }, [tkNewInput, elements, assemblies]);

  // ─── Auto-select first drawing + lazy PDF rendering ───
  useEffect(() => {
    if (drawings.length === 0) return;
    const withData = drawings.filter(d => d.data);
    if (withData.length === 0) return;

    const ds = useDrawingsStore.getState();
    if (!ds.selectedDrawingId || !withData.find(d => d.id === ds.selectedDrawingId)) {
      const savedId = sessionStorage.getItem("bldg-selectedDrawingId");
      const savedDrawing = savedId && withData.find(d => d.id === savedId);
      const target = savedDrawing || withData[0];
      ds.setSelectedDrawingId(target.id);
      if (target.type === "pdf") renderPdfPage(target);
    }

    let cancelled = false;
    (async () => {
      const current = useDrawingsStore.getState().pdfCanvases;
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
    const ds = useDrawingsStore.getState();
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
      useTakeoffsStore.getState().saveTkSheetView(prevId);
      try {
        const s = useTakeoffsStore.getState();
        if (s.tkActiveTakeoffId && s.tkPredictions) {
          const { autoRecordFromPredState } = require("@/utils/crossSheetLearning");
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
      const restored = useTakeoffsStore.getState().restoreTkSheetView(selectedDrawingId);
      if (!restored) {
        useTakeoffsStore.getState().setTkZoom(100);
        useTakeoffsStore.getState().setTkPan({ x: 0, y: 0 });
      }
    }
    prevDrawingIdRef.current = selectedDrawingId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDrawingId]);
}
