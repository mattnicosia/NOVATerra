/**
 * useTakeoffActions — AI takeoff creation + measurement lifecycle for TakeoffsPage
 *
 * Extracted from TakeoffsPage.jsx to reduce file size.
 * Contains:
 * - addTakeoffFromAI, insertAIGroupIntoTakeoffs, addTakeoffFromAIAsSingle
 * - engageMeasuring, stopMeasuring, pauseMeasuring
 * - addMeasurement, removeMeasurement
 * - startAutoCount, finishCalibration
 * - handleOutlineClick
 * - scope suggestions (_runScopeSuggestions)
 * - variable/formula helpers + drag reorder
 * - renderPdfPage, handleSelectDrawing
 * - handleScanReferences, handlePdfRepairDrop
 */
import { useCallback, useRef, useEffect } from "react";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useUiStore } from "@/stores/uiStore";
import { unitToTool } from "@/hooks/useMeasurementEngine";
import { uid, nn } from "@/utils/format";
import { TO_COLORS, loadPdfJs } from "@/utils/takeoffHelpers";
import { outlineToFeet } from "@/utils/outlineDetector";
import { repairRawPdf } from "@/utils/uploadPipeline";
import { detectMarkersFromText } from "@/utils/pdfExtractor";
import { detectSheetReferences } from "@/utils/ai";
import { callAnthropicStream } from "@/utils/ai";
import { parsePartialJsonArray } from "@/utils/takeoffHelpers";
import { warmPredictions } from "@/utils/predictiveEngine";

export default function useTakeoffActions({
  canvasRef,
  snapAngleOnRef,
  // From hooks
  hasScale,
  addTakeoff,
  updateTakeoff,
  // Measurement flash
  triggerMeasureFlash,
  // Panel mode
  tkPanelMode,
}) {
  const showToast = useUiStore(s => s.showToast);

  // ─── addMeasurement ───
  const addMeasurement = useCallback(
    (takeoffId, measurement) => {
      useDrawingPipelineStore.getState().addMeasurement(takeoffId, measurement);
      triggerMeasureFlash(takeoffId);
    },
    [triggerMeasureFlash],
  );

  const removeMeasurement = useCallback((takeoffId, measurementId) => {
    const s = useDrawingPipelineStore.getState();
    s.setTakeoffs(
      s.takeoffs.map(t => {
        if (t.id !== takeoffId) return t;
        return { ...t, measurements: (t.measurements || []).filter(m => m.id !== measurementId) };
      }),
    );
  }, []);

  // ─── AI Takeoff helpers ───
  const addTakeoffFromAI = useCallback(item => {
    const id = uid();
    const current = useDrawingPipelineStore.getState().takeoffs;
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    useDrawingPipelineStore.getState().setTakeoffs([
      ...current,
      {
        id,
        description: item.description,
        quantity: "",
        unit: item.unit || "SF",
        color: TO_COLORS[Math.floor(Math.random() * TO_COLORS.length)],
        drawingRef: "",
        group: "",
        linkedItemId: "",
        code: item.code || "",
        variables: [],
        formula: "",
        measurements: [],
        bidContext: bidCtx,
        _aiCosts: {
          material: nn(item.material),
          labor: nn(item.labor),
          equipment: nn(item.equipment),
          subcontractor: nn(item.subcontractor),
        },
      },
    ]);
    useDrawingPipelineStore.getState().clearPredictions();
    useDrawingPipelineStore.getState().setTkNewInput("");
    useDrawingPipelineStore.getState().setTkDbResults([]);
    const drawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    if (drawingId && hasScale(drawingId)) {
      showToast(`\u2726 Added: ${item.description} \u2014 AI priced \u2014 measuring`);
      useDrawingPipelineStore.getState().setTkActiveTakeoffId(id);
      useDrawingPipelineStore.getState().setTkTool(unitToTool(item.unit || "SF"));
      useDrawingPipelineStore.getState().setTkMeasureState("measuring");
      useDrawingPipelineStore.getState().setTkActivePoints([]);
      useDrawingPipelineStore.getState().setTkContextMenu(null);
    } else if (drawingId) {
      showToast("Please calibrate this drawing first \u2014 set a scale before measuring", "error");
    } else {
      showToast(`\u2726 Added: ${item.description} \u2014 AI priced`);
    }
  }, [hasScale, showToast]);

  const insertAIGroupIntoTakeoffs = useCallback(result => {
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    const current = useDrawingPipelineStore.getState().takeoffs;
    const groupName = result.groupName || "AI Group";
    const asmId = uid(); // shared assembly ID for all items in this group
    const newTakeoffs = result.items.map((item, i) => ({
      id: uid(),
      description: item.description,
      quantity: "",
      unit: item.unit || "SF",
      color: TO_COLORS[(current.length + i) % TO_COLORS.length],
      drawingRef: "",
      group: groupName,
      linkedItemId: "",
      code: item.code || "",
      variables: [],
      formula: "",
      measurements: [],
      bidContext: bidCtx,
      assemblyId: asmId,
      assemblyLabel: groupName,
      _aiCosts: {
        material: nn(item.material),
        labor: nn(item.labor),
        equipment: nn(item.equipment),
        subcontractor: nn(item.subcontractor),
      },
    }));
    useDrawingPipelineStore.getState().setTakeoffs([...current, ...newTakeoffs]);
    useDrawingPipelineStore.getState().clearPredictions();
    useDrawingPipelineStore.getState().setTkNewInput("");
    useDrawingPipelineStore.getState().setTkDbResults([]);
    showToast(`\u2726 Added ${result.items.length} items as "${groupName}" \u2014 AI priced`);
  }, [showToast]);

  const addTakeoffFromAIAsSingle = useCallback(result => {
    const totalM = result.items.reduce((s, it) => s + nn(it.material), 0);
    const totalL = result.items.reduce((s, it) => s + nn(it.labor), 0);
    const totalE = result.items.reduce((s, it) => s + nn(it.equipment), 0);
    const totalS = result.items.reduce((s, it) => s + nn(it.subcontractor), 0);
    const firstItem = result.items[0];
    addTakeoffFromAI({
      code: firstItem.code || "",
      description: result.groupName || firstItem.description,
      unit: firstItem.unit || "SF",
      material: Math.round(totalM * 100) / 100,
      labor: Math.round(totalL * 100) / 100,
      equipment: Math.round(totalE * 100) / 100,
      subcontractor: Math.round(totalS * 100) / 100,
    });
  }, [addTakeoffFromAI]);

  // ─── Measurement lifecycle ───
  const engageMeasuring = useCallback(
    toId => {
      const s = useDrawingPipelineStore.getState();
      const to = s.takeoffs.find(t => t.id === toId);
      if (!to) return;
      const drawingId = useDrawingPipelineStore.getState().selectedDrawingId;
      if (drawingId && !hasScale(drawingId)) {
        showToast("Please calibrate this drawing first \u2014 set a scale before measuring", "error");
        return;
      }
      const activeTo = s.tkActiveTakeoffId;
      if (activeTo && activeTo !== toId && s.tkMeasureState === "measuring") {
        const pts = s.tkActivePoints || [];
        const tool = s.tkTool;
        if (pts.length >= 2 && tool === "linear") {
          addMeasurement(activeTo, {
            type: "linear",
            points: [...pts],
            value: 0,
            sheetId: drawingId,
            color: s.takeoffs.find(t => t.id === activeTo)?.color || "#5b8def",
          });
        }
        if (pts.length >= 3 && tool === "area") {
          addMeasurement(activeTo, {
            type: "area",
            points: [...pts],
            value: 0,
            sheetId: drawingId,
            color: s.takeoffs.find(t => t.id === activeTo)?.color || "#5b8def",
          });
        }
      }
      s.setTkSelectedTakeoffId(toId);
      s.setTkActiveTakeoffId(toId);
      s.setTkTool(unitToTool(to.unit));
      s.setTkMeasureState("measuring");
      s.setTkActivePoints([]);
      s.setTkContextMenu(null);
      s.setTkShowVars(null);
      if (tkPanelMode !== "open") s.setTkPanelOpen(false);
      const drawState = useDrawingPipelineStore.getState();
      const warmDrawing = drawState.drawings.find(d => d.id === drawState.selectedDrawingId);
      if (warmDrawing && warmDrawing.type === "pdf" && (warmDrawing.data || warmDrawing.pdfRawBase64)) {
        warmPredictions(warmDrawing, to.description).catch(() => {});
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addMeasurement, hasScale, showToast, tkPanelMode],
  );

  const stopMeasuring = useCallback(() => {
    const s = useDrawingPipelineStore.getState();
    const pts = s.tkActivePoints || [];
    const tool = s.tkTool;
    const activeTo = s.tkActiveTakeoffId;
    const drawingId = useDrawingPipelineStore.getState().selectedDrawingId;
    if (pts.length >= 2 && tool === "linear" && activeTo) {
      addMeasurement(activeTo, {
        type: "linear",
        points: [...pts],
        value: 0,
        sheetId: drawingId,
        color: s.takeoffs.find(t => t.id === activeTo)?.color || "#5b8def",
      });
    }
    if (pts.length >= 3 && tool === "area" && activeTo) {
      addMeasurement(activeTo, {
        type: "area",
        points: [...pts],
        value: 0,
        sheetId: drawingId,
        color: s.takeoffs.find(t => t.id === activeTo)?.color || "#5b8def",
      });
    }
    s.setTkMeasureState("idle");
    s.setTkTool("select");
    s.setTkActivePoints([]);
    s.setTkActiveTakeoffId(null);
    s.setTkContextMenu(null);
    s.setTkCursorPt(null);
    s.clearPredictions();
    // Auto-reopen panel when measuring stops (only in "auto" mode)
    if (tkPanelMode === "auto") {
      const savedTier = sessionStorage.getItem("bldg-tkPanelTier");
      const savedW = sessionStorage.getItem("bldg-tkPanelWidth");
      if (savedTier === "estimate") {
        // Don't reopen panel in estimate mode
      } else {
        s.setTkPanelOpen(true);
        if (savedTier && savedTier !== s.tkPanelTier) {
          s.setTkPanelTier(savedTier);
          if (savedW) s.setTkPanelWidth(Number(savedW));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMeasurement, tkPanelMode]);

  const pauseMeasuring = useCallback(() => {
    useDrawingPipelineStore.getState().setTkMeasureState("paused");
    useDrawingPipelineStore.getState().setTkActivePoints([]);
    useDrawingPipelineStore.getState().setTkCursorPt(null);
  }, []);

  // ─── Auto-count ───
  const startAutoCount = useCallback(takeoffId => {
    stopMeasuring();
    useDrawingPipelineStore.getState().setTkAutoCount({ takeoffId, phase: "select", samplePt: null, results: [] });
    showToast("Click on a sample symbol to auto-count", "info");
  }, [stopMeasuring, showToast]);

  // ─── Calibration ───
  const finishCalibration = useCallback(() => {
    const s = useDrawingPipelineStore.getState();
    const ds = useDrawingPipelineStore.getState();
    if (s.tkActivePoints.length < 2 || !nn(s.tkCalibInput.dist)) return;
    s.setTkCalibrations({
      ...s.tkCalibrations,
      [ds.selectedDrawingId]: {
        p1: s.tkActivePoints[0],
        p2: s.tkActivePoints[1],
        realDist: nn(s.tkCalibInput.dist),
        unit: s.tkCalibInput.unit,
      },
    });
    s.setTkActivePoints([]);
    s.setTkCalibInput({ dist: "", unit: "ft" });
    s.setTkTool("select");
    showToast("Scale calibrated!");
  }, [showToast]);

  // ─── Outline tool ───
  const handleOutlineClick = useCallback(
    e => {
      const s = useDrawingPipelineStore.getState();
      const ds = useDrawingPipelineStore.getState();
      if (s.tkTool !== "outline" || !ds.selectedDrawingId) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      const pt = { x: cx, y: cy };
      const pts = s.tkActivePoints || [];

      const finishOutline = vertices => {
        const pixelPoly = vertices.map(p => ({ x: p.x, y: p.y }));
        try {
          const feetPoly = outlineToFeet(pixelPoly, ds.selectedDrawingId);
          useDrawingPipelineStore.getState().setOutline(ds.selectedDrawingId, feetPoly, "manual", pixelPoly);
          showToast(`Building outline saved (${vertices.length} vertices)`);
        } catch (err) {
          console.warn("outlineToFeet failed, using pixel coords:", err);
          useDrawingPipelineStore.getState().setOutline(
            ds.selectedDrawingId,
            vertices.map(p => ({ x: p.x, z: p.y })),
            "manual",
            pixelPoly,
          );
          showToast(`Outline saved (${vertices.length} pts) \u2014 set scale for accurate 3D`);
        }
        s.setTkActivePoints([]);
        s.setTkTool("select");
      };

      if (pts.length >= 3) {
        const first = pts[0];
        const dist = Math.sqrt((cx - first.x) ** 2 + (cy - first.y) ** 2);
        if (dist < 15 || e.detail === 2) {
          finishOutline(pts);
          return;
        }
      }
      if (e.detail === 2 && pts.length >= 3) {
        finishOutline(pts);
        return;
      }

      const snapAngle = (anchor, ptArg) => {
        const dx = ptArg.x - anchor.x;
        const dy = ptArg.y - anchor.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1) return ptArg;
        const angle = Math.atan2(dy, dx);
        const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        return { x: anchor.x + d * Math.cos(snap), y: anchor.y + d * Math.sin(snap) };
      };

      const snappedPt =
        (e.shiftKey || snapAngleOnRef.current) && pts.length >= 1 ? snapAngle(pts[pts.length - 1], pt) : pt;
      s.setTkActivePoints([...pts, snappedPt]);
    },
    [canvasRef, snapAngleOnRef, showToast],
  );

  // ─── Drag reorder ───
  const tkDragTakeoff = useRef(null);
  const tkDragOverTakeoff = useRef(null);
  const tkDragReorder = useCallback(() => {
    const fromId = tkDragTakeoff.current;
    const toId = tkDragOverTakeoff.current;
    if (!fromId || !toId || fromId === toId) return;
    const s = useDrawingPipelineStore.getState();
    const arr = [...s.takeoffs];
    const fromIdx = arr.findIndex(t => t.id === fromId);
    const toIdx = arr.findIndex(t => t.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    s.setTakeoffs(arr);
  }, []);

  // ─── Render PDF page ───
  const renderPdfPage = useCallback(async drawing => {
    const current = useDrawingPipelineStore.getState().pdfCanvases;
    if (current[drawing.id]) return current[drawing.id];
    if (drawing.pdfPreRendered && drawing.data) {
      useDrawingPipelineStore.setState(s => ({ pdfCanvases: { ...s.pdfCanvases, [drawing.id]: drawing.data } }));
      return drawing.data;
    }
    if (drawing.type !== "pdf" || !drawing.data) return null;
    try {
      await loadPdfJs();
      const resp = await fetch(`data:application/pdf;base64,${drawing.data}`);
      const buf = await resp.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      const pg = await pdf.getPage(drawing.pdfPage || 1);
      const scale = 1.5;
      const vp = pg.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      const url = canvas.toDataURL("image/jpeg", 0.8);
      useDrawingPipelineStore.setState(s => ({ pdfCanvases: { ...s.pdfCanvases, [drawing.id]: url } }));
      return url;
    } catch (e) {
      console.error("renderPdfPage:", e);
      return null;
    }
  }, []);

  const handleSelectDrawing = useCallback(
    id => {
      useDrawingPipelineStore.getState().setSelectedDrawingId(id);
      const d = useDrawingPipelineStore.getState().drawings.find(dr => dr.id === id);
      if (d?.type === "pdf" && d.data) renderPdfPage(d);
    },
    [renderPdfPage],
  );

  // ─── Reference scanning ───
  const scannedDrawingsRef = useRef(new Set());
  const autoScanTimerRef = useRef(null);
  const handleScanRef = useRef(null);

  const handleScanReferences = useCallback(
    async drawingIdOverride => {
      const ds = useDrawingPipelineStore.getState();
      const dId = drawingIdOverride || ds.selectedDrawingId;
      if (!dId || ds.refScanLoading) return;
      const drawing = ds.drawings.find(d => d.id === dId);
      if (!drawing) return;
      ds.setRefScanLoading(dId);
      try {
        let imgData = null;
        if (drawing.type === "pdf") {
          imgData = ds.pdfCanvases[drawing.id];
        }
        if (!imgData && drawing.data) {
          imgData = drawing.data;
        }
        if (!imgData && canvasRef.current) {
          imgData = canvasRef.current.toDataURL("image/jpeg", 0.7);
        }
        if (!imgData) {
          showToast("Drawing image not available yet", "error");
          return;
        }
        const b64Length = imgData.length;
        if (b64Length > 3_500_000) {
          const img = new Image();
          const loaded = new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
          });
          img.src = imgData;
          await loaded;
          const maxDim = 2000;
          let w = img.naturalWidth,
            h = img.naturalHeight;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          imgData = c.toDataURL("image/jpeg", 0.85);
        }
        let refs = await detectMarkersFromText(drawing);
        if (refs.length === 0) {
          refs = await detectSheetReferences(imgData);
        }
        ds.setDetectedReferences(dId, refs);
        showToast(`Found ${refs.length} reference${refs.length !== 1 ? "s" : ""}`, "success");
      } catch (err) {
        console.error("[ScanRefs]", err);
        showToast("Reference scan failed", "error");
      } finally {
        useDrawingPipelineStore.getState().setRefScanLoading(null);
      }
    },
    [canvasRef, showToast],
  );

  handleScanRef.current = handleScanReferences;

  // Auto-scan effect
  useEffect(() => {
    const ds = useDrawingPipelineStore.getState();
    const selectedDrawingId = ds.selectedDrawingId;
    if (!selectedDrawingId) return;
    if (ds.detectedReferences[selectedDrawingId]?.length > 0) return;
    if (ds.refScanLoading) return;
    if (scannedDrawingsRef.current.has(selectedDrawingId)) return;
    const drawing = ds.drawings.find(d => d.id === selectedDrawingId);
    if (!drawing) return;
    if (drawing.type === "pdf" && !ds.pdfCanvases[drawing.id] && !canvasRef.current) return;
    if (drawing.type === "image" && !drawing.data && !canvasRef.current) return;

    scannedDrawingsRef.current.add(selectedDrawingId);
    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    const dId = selectedDrawingId;
    autoScanTimerRef.current = setTimeout(() => {
      handleScanRef.current(dId);
    }, 2000);
  });

  // ─── PDF Repair Drop Handler ───
  const handlePdfRepairDrop = useCallback(async e => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    showToast("Repairing PDF data for predictions...", "info");
    try {
      const count = await repairRawPdf(file);
      if (count > 0) {
        showToast(`\u2726 Repaired ${count} drawing${count > 1 ? "s" : ""} \u2014 predictions now enabled!`, "success");
        useDrawingPipelineStore.getState().clearPredictions();
      } else {
        showToast("No drawings needed repair (file name didn't match)", "error");
      }
    } catch (err) {
      showToast("PDF repair failed: " + err.message, "error");
    }
  }, [showToast]);

  // ─── Snap angle helper ───
  const snapAngle = (anchor, pt) => {
    const dx = pt.x - anchor.x;
    const dy = pt.y - anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return pt;
    const angle = Math.atan2(dy, dx);
    const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return { x: anchor.x + dist * Math.cos(snap), y: anchor.y + dist * Math.sin(snap) };
  };

  return {
    addMeasurement,
    removeMeasurement,
    addTakeoffFromAI,
    insertAIGroupIntoTakeoffs,
    addTakeoffFromAIAsSingle,
    engageMeasuring,
    stopMeasuring,
    pauseMeasuring,
    startAutoCount,
    finishCalibration,
    handleOutlineClick,
    tkDragTakeoff,
    tkDragOverTakeoff,
    tkDragReorder,
    renderPdfPage,
    handleSelectDrawing,
    handleScanReferences,
    handlePdfRepairDrop,
    snapAngle,
  };
}
