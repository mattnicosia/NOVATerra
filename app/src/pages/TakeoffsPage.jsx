import { useState, useRef, useCallback, useMemo, useEffect, lazy, Suspense } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useTakeoffsStore } from "@/stores/takeoffsStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import useMeasurementEngine, { unitToTool } from "@/hooks/useMeasurementEngine";
import useTakeoffCRUD from "@/hooks/useTakeoffCRUD";
import useTakeoffCanvasHandlers from "@/hooks/useTakeoffCanvasHandlers";
import useTakeoffAnalysis from "@/hooks/useTakeoffAnalysis";
import useTakeoffPredictions from "@/hooks/useTakeoffPredictions";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt, truncate } from "@/utils/styles";
import { uid, nn, fmt, fmt2 } from "@/utils/format";
import { hexAlpha } from "@/utils/fieldPhysics";
import {
  callAnthropic,
  callAnthropicStream,
  detectSheetReferences,
} from "@/utils/ai";
// optimizeImageForAI, imageBlock, cropImageRegion moved to useTakeoffCanvasHandlers
import DetailOverlay from "@/components/takeoffs/DetailOverlay";
import { useModuleStore } from "@/stores/moduleStore";
import { useModelStore } from "@/stores/modelStore";
// useUndoStore moved to TakeoffControlRail + TakeoffContextMenu
import { outlineToFeet } from "@/utils/outlineDetector";
import { inferViewType, repairRawPdf } from "@/utils/uploadPipeline";
import { MODULE_LIST, MODULES } from "@/constants/modules";
import ModulePanel from "@/components/takeoffs/ModulePanel";
import TakeoffDimensionEngine from "@/components/takeoffs/TakeoffDimensionEngine";
import FormulaExpressionRow from "@/components/takeoffs/FormulaExpressionRow";
import TakeoffCommandPalette from "@/components/takeoffs/TakeoffCommandPalette";
import TakeoffContextMenu from "@/components/takeoffs/TakeoffContextMenu";
import RevisionImpactCard from "@/components/takeoffs/RevisionImpactCard";
import TakeoffControlRail from "@/components/takeoffs/TakeoffControlRail";
import VectorScanResults from "@/components/takeoffs/VectorScanResults";
import WallScheduleModal from "@/components/takeoffs/WallScheduleModal";
import PdfScheduleModal from "@/components/takeoffs/PdfScheduleModal";
import DrawingAnalysisPanel from "@/components/takeoffs/DrawingAnalysisPanel";
import DrawingEmptyState from "@/components/takeoffs/DrawingEmptyState";
import CrossSheetScanBar from "@/components/takeoffs/CrossSheetScanBar";
import TakeoffLeftPanel from "@/components/takeoffs/TakeoffLeftPanel";
import ScaleNotSetBanner from "@/components/takeoffs/ScaleNotSetBanner";
import FloatingSpecsCard from "@/components/takeoffs/FloatingSpecsCard";
import SheetReferenceBadges from "@/components/takeoffs/SheetReferenceBadges";
import RefClickPopover from "@/components/takeoffs/RefClickPopover";
import MeasurementHUD from "@/components/takeoffs/MeasurementHUD";
import { detectMarkersFromText } from "@/utils/pdfExtractor";
import {
  runSmartPredictions,
  warmPredictions,
} from "@/utils/predictiveEngine";
// scanAllSheets, findNearbyPrediction, recordPredictionFeedback, smartCountFromClick moved to useTakeoffCanvasHandlers
// analyzeDrawingGeometry moved to useTakeoffAnalysis hook
// evalCondition moved to FloatingSpecsCard
const EstimatePanelView = lazy(() => import("@/components/estimate/EstimatePanelView"));
const EstimatePage = lazy(() => import("@/pages/EstimatePage"));
const ItemDetailPanel = lazy(() => import("@/components/estimate/ItemDetailPanel"));
import NotesPanel from "@/components/estimate/NotesPanel";
import ScenariosPanel from "@/components/estimate/ScenariosPanel";
import RFIPanel from "@/components/estimate/RFIPanel";
import TakeoffNOVAPanel from "@/components/takeoffs/TakeoffNOVAPanel";
const DiscoveryPanel = lazy(() => import("@/components/discovery/DiscoveryPanel"));
import {
  TO_COLORS,
  _novaCache,
  _novaCacheEvict,
  NOVA_SYSTEM_PROMPT,
  buildNovaUserMsg,
  parseNovaResponse,
  parsePartialJsonArray,
  loadPdfJs,
} from "@/utils/takeoffHelpers";

// ─── Utilities imported from @/utils/takeoffHelpers ──────────────────

const RAIL_W = 36; // px — navigation rail width

export default function TakeoffsPage() {
  const C = useTheme();

  const T = C.T;
  const showToast = useUiStore(s => s.showToast);
  const activeGroupId = useUiStore(s => s.activeGroupId);
  const revisionImpact = useUiStore(s => s.revisionImpact);
  const dismissRevisionImpact = useUiStore(s => s.dismissRevisionImpact);
  const setShowNotesPanel = useUiStore(s => s.setShowNotesPanel);
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const getItemTotal = useItemsStore(s => s.getItemTotal);
  const getTotals = useItemsStore(s => s.getTotals);
  const elements = useDatabaseStore(s => s.elements);
  const assemblies = useDatabaseStore(s => s.assemblies);

  // Drawings store
  const drawings = useDrawingsStore(s => s.drawings);
  const selectedDrawingId = useDrawingsStore(s => s.selectedDrawingId);
  const setSelectedDrawingId = useDrawingsStore(s => s.setSelectedDrawingId);
  const pdfCanvases = useDrawingsStore(s => s.pdfCanvases);
  const _setPdfCanvases = useDrawingsStore(s => s.setPdfCanvases);
  const drawingScales = useDrawingsStore(s => s.drawingScales);
  const setDrawingScales = useDrawingsStore(s => s.setDrawingScales);
  const drawingDpi = useDrawingsStore(s => s.drawingDpi);
  const _setDrawingDpi = useDrawingsStore(s => s.setDrawingDpi);
  const sheetIndex = useDrawingsStore(s => s.sheetIndex);
  const buildSheetIndex = useDrawingsStore(s => s.buildSheetIndex);
  const detectedReferences = useDrawingsStore(s => s.detectedReferences);
  const setDetectedReferences = useDrawingsStore(s => s.setDetectedReferences);
  const refScanLoading = useDrawingsStore(s => s.refScanLoading);
  const setRefScanLoading = useDrawingsStore(s => s.setRefScanLoading);

  // Takeoffs store
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const setTakeoffs = useTakeoffsStore(s => s.setTakeoffs);
  const tkTool = useTakeoffsStore(s => s.tkTool);
  const setTkTool = useTakeoffsStore(s => s.setTkTool);
  const tkActivePoints = useTakeoffsStore(s => s.tkActivePoints);
  const setTkActivePoints = useTakeoffsStore(s => s.setTkActivePoints);
  const tkActiveTakeoffId = useTakeoffsStore(s => s.tkActiveTakeoffId);
  const setTkActiveTakeoffId = useTakeoffsStore(s => s.setTkActiveTakeoffId);
  const tkSelectedTakeoffId = useTakeoffsStore(s => s.tkSelectedTakeoffId);
  const setTkSelectedTakeoffId = useTakeoffsStore(s => s.setTkSelectedTakeoffId);
  const tkMeasureState = useTakeoffsStore(s => s.tkMeasureState);
  const setTkMeasureState = useTakeoffsStore(s => s.setTkMeasureState);
  const tkCursorPt = useTakeoffsStore(s => s.tkCursorPt);
  const setTkCursorPt = useTakeoffsStore(s => s.setTkCursorPt);
  const _tkContextMenu = useTakeoffsStore(s => s.tkContextMenu);
  const setTkContextMenu = useTakeoffsStore(s => s.setTkContextMenu);
  const tkCalibrations = useTakeoffsStore(s => s.tkCalibrations);
  const setTkCalibrations = useTakeoffsStore(s => s.setTkCalibrations);
  const tkCalibInput = useTakeoffsStore(s => s.tkCalibInput);
  const setTkCalibInput = useTakeoffsStore(s => s.setTkCalibInput);
  const tkShowVars = useTakeoffsStore(s => s.tkShowVars);
  const setTkShowVars = useTakeoffsStore(s => s.setTkShowVars);
  const tkAutoCount = useTakeoffsStore(s => s.tkAutoCount);
  const setTkAutoCount = useTakeoffsStore(s => s.setTkAutoCount);
  const tkScopeSuggestions = useTakeoffsStore(s => s.tkScopeSuggestions);
  const setTkScopeSuggestions = useTakeoffsStore(s => s.setTkScopeSuggestions);
  const tkZoom = useTakeoffsStore(s => s.tkZoom);
  const setTkZoom = useTakeoffsStore(s => s.setTkZoom);
  const tkPan = useTakeoffsStore(s => s.tkPan);
  const setTkPan = useTakeoffsStore(s => s.setTkPan);
  const tkPanelWidth = useTakeoffsStore(s => s.tkPanelWidth);
  const setTkPanelWidth = useTakeoffsStore(s => s.setTkPanelWidth);
  const tkPanelTier = useTakeoffsStore(s => s.tkPanelTier);
  const _setTkPanelTier = useTakeoffsStore(s => s.setTkPanelTier);
  const tkPanelOpen = useTakeoffsStore(s => s.tkPanelOpen);
  const setTkPanelOpen = useTakeoffsStore(s => s.setTkPanelOpen);
  const _toFilter = useTakeoffsStore(s => s.toFilter);
  const tkVisibility = useTakeoffsStore(s => s.tkVisibility);
  const setTkVisibility = useTakeoffsStore(s => s.setTkVisibility);
  const tkNewInput = useTakeoffsStore(s => s.tkNewInput);
  const setTkNewInput = useTakeoffsStore(s => s.setTkNewInput);
  const tkNewUnit = useTakeoffsStore(s => s.tkNewUnit);
  const setTkNewUnit = useTakeoffsStore(s => s.setTkNewUnit);
  const tkDbResults = useTakeoffsStore(s => s.tkDbResults);
  const setTkDbResults = useTakeoffsStore(s => s.setTkDbResults);

  const activeModule = useModuleStore(s => s.activeModule);
  const setActiveModule = useModuleStore(s => s.setActiveModule);
  const moduleInstances = useModuleStore(s => s.moduleInstances);
  const lastModuleRef = useRef(null); // tracks last non-null module for "Modules" toggle

  // Restore activeModule from sessionStorage on mount
  useEffect(() => {
    const savedModule = sessionStorage.getItem("bldg-activeModule");
    if (savedModule && savedModule !== "null") {
      useModuleStore.getState().setActiveModule(savedModule);
      lastModuleRef.current = savedModule;
    }
  }, []);
  // Persist activeModule to sessionStorage + track last module
  useEffect(() => {
    sessionStorage.setItem("bldg-activeModule", activeModule || "");
    if (activeModule) lastModuleRef.current = activeModule;
  }, [activeModule]);

  // Predictive takeoff store
  const tkPredictions = useTakeoffsStore(s => s.tkPredictions);
  const tkPredAccepted = useTakeoffsStore(s => s.tkPredAccepted);
  const tkPredRejected = useTakeoffsStore(s => s.tkPredRejected);
  const tkPredContext = useTakeoffsStore(s => s.tkPredContext);
  const tkPredRefining = useTakeoffsStore(s => s.tkPredRefining);
  const setTkPredictions = useTakeoffsStore(s => s.setTkPredictions);
  const acceptPrediction = useTakeoffsStore(s => s.acceptPrediction);
  const _rejectPrediction = useTakeoffsStore(s => s.rejectPrediction);
  const _acceptAllPredictions = useTakeoffsStore(s => s.acceptAllPredictions);
  const clearPredictions = useTakeoffsStore(s => s.clearPredictions);
  const recordPredictionMiss = useTakeoffsStore(s => s.recordPredictionMiss);
  const initPredContext = useTakeoffsStore(s => s.initPredContext);
  const _setTkPredRefining = useTakeoffsStore(s => s.setTkPredRefining);
  const _tkNovaPanelOpen = useTakeoffsStore(s => s.tkNovaPanelOpen);
  const _setTkNovaPanelOpen = useTakeoffsStore(s => s.setTkNovaPanelOpen);

  // Detail overlay & reference detection
  const [detailOverlayId, setDetailOverlayId] = useState(null);
  const [refPopover, setRefPopover] = useState(null); // { ref, x, y } for click popover
  // hoveredRef moved to SheetReferenceBadges component

  // Build sheet index when drawings change
  useEffect(() => {
    buildSheetIndex();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand action is stable; trigger only on drawings.length
  }, [drawings.length]);

  // Scan current drawing for section/elevation/detail references
  // Gets image from pdfCanvases (for PDFs) or drawing.data, with fallback to on-screen canvas.
  // Downscales large images to stay under Vercel's 4.5 MB body limit.
  const handleScanReferences = useCallback(
    async drawingIdOverride => {
      const dId = drawingIdOverride || selectedDrawingId;
      if (!dId || refScanLoading) return;
      const drawing = drawings.find(d => d.id === dId);
      if (!drawing) return;
      setRefScanLoading(dId);
      try {
        // 1. Get the best available image source
        let imgData = null;
        // For PDFs, always prefer the rendered canvas image (JPEG data URL)
        if (drawing.type === "pdf") {
          imgData = pdfCanvases[drawing.id];
        }
        // For images or if PDF canvas not ready, use drawing.data
        if (!imgData && drawing.data) {
          imgData = drawing.data;
        }
        // Last resort: grab from the visible canvas element
        if (!imgData && canvasRef.current) {
          imgData = canvasRef.current.toDataURL("image/jpeg", 0.7);
        }
        if (!imgData) {
          showToast("Drawing image not available yet", "error");
          return;
        }

        // 2. Downscale if the base64 payload is too large (>3.5 MB)
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

        // Try vector/text extraction first (fast, no API call, accurate for native PDFs)
        let refs = await detectMarkersFromText(drawing);
        if (refs.length === 0) {
          // Fallback: VLM detection (for scanned/raster PDFs or if raw cache unavailable)
          refs = await detectSheetReferences(imgData);
        }
        setDetectedReferences(dId, refs);
        showToast(`Found ${refs.length} reference${refs.length !== 1 ? "s" : ""}`, "success");
      } catch (err) {
        console.error("[ScanRefs]", err);
        showToast("Reference scan failed", "error");
      } finally {
        setRefScanLoading(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions (setDetectedReferences, setRefScanLoading) are stable; showToast is stable
    [selectedDrawingId, refScanLoading, drawings, pdfCanvases],
  );

  // Auto-scan references when switching to a drawing that hasn't been scanned yet.
  // Uses a ref-based approach to avoid effect cleanup killing the pending scan.
  const scannedDrawingsRef = useRef(new Set());
  const autoScanTimerRef = useRef(null);
  const handleScanRef = useRef(handleScanReferences);
  handleScanRef.current = handleScanReferences;

  useEffect(() => {
    if (!selectedDrawingId) return;
    // Already scanned (with results) or already attempted
    const store = useDrawingsStore.getState();
    if (store.detectedReferences[selectedDrawingId]?.length > 0) return;
    if (store.refScanLoading) return;
    if (scannedDrawingsRef.current.has(selectedDrawingId)) return;
    // Need an image source — for PDFs wait until pdfCanvas is ready
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing) return;
    if (drawing.type === "pdf" && !pdfCanvases[drawing.id] && !canvasRef.current) return;
    if (drawing.type === "image" && !drawing.data && !canvasRef.current) return;

    scannedDrawingsRef.current.add(selectedDrawingId);
    // Clear any previous timer
    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    const dId = selectedDrawingId;
    autoScanTimerRef.current = setTimeout(() => {
      handleScanRef.current(dId);
    }, 2000);
  }, [selectedDrawingId, pdfCanvases, drawings]);

  // Measurement engine — scale conversion, distance/area calculations, formula evaluation
  const {
    getDrawingDpi: _getDrawingDpi,
    getPxPerUnit: _getPxPerUnit,
    pxToReal: _pxToReal,
    realToPx,
    getDisplayUnit,
    hasScale,
    calcPolylineLength,
    calcPolygonArea,
    computeMeasurementValue,
    getMeasuredQty,
    getComputedQty,
  } = useMeasurementEngine();

  // Takeoff CRUD — create, update, delete, assembly insert
  const { updateTakeoff, removeTakeoff, addTakeoff, addTakeoffFromDb, addTakeoffFreeform, insertAssemblyIntoTakeoffs } =
    useTakeoffCRUD();

  // Refs
  const drawingContainerRef = useRef(null);
  const drawingImgRef = useRef(null);
  const canvasRef = useRef(null);
  const tkPanning = useRef(false);
  const tkPanStart = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });
  const tkDragTakeoff = useRef(null);
  const tkDragOverTakeoff = useRef(null);
  const tkLastWheelX = useRef(0); // tracks recent deltaX to detect trackpad vs mouse
  const compactStripRef = useRef(null);
  const shiftHeldRef = useRef(false);
  const rafCursorRef = useRef(null);
  const pendingCursorRef = useRef(null);
  const cursorCanvasRef = useRef(null); // overlay canvas for cursor-dependent content
  const tkTransformRef = useRef(null); // ref for transform div (zoom-to-cursor offset)
  const predScanGenRef = useRef(0); // generation counter — prevents stale async results
  const predScanKeyRef = useRef(""); // tracks which takeoff+drawing combo is being scanned
  const snapAngleOnRef = useRef(false); // snap angle toggle (persistent, not keyboard-dependent)

  // Prediction effects (PDF pre-extraction + ghost overlay rendering)
  const { predictionCanvasRef } = useTakeoffPredictions({ canvasRef });

  // Snap angle toggle — persistent state + ref mirror
  const [snapAngleOn, setSnapAngleOn] = useState(() => sessionStorage.getItem("bldg-snapAngle") === "true");
  // Check Dim mode — measure without creating a takeoff (verification only)
  const [checkDimMode, setCheckDimMode] = useState(false);
  const checkDimRef = useRef(false);
  // Labels visibility toggle
  const [showMeasureLabels, setShowMeasureLabels] = useState(
    () => sessionStorage.getItem("bldg-showLabels") !== "false",
  );
  useEffect(() => {
    snapAngleOnRef.current = snapAngleOn;
    sessionStorage.setItem("bldg-snapAngle", snapAngleOn);
  }, [snapAngleOn]);
  useEffect(() => {
    checkDimRef.current = checkDimMode;
  }, [checkDimMode]);
  useEffect(() => {
    sessionStorage.setItem("bldg-showLabels", showMeasureLabels);
  }, [showMeasureLabels]);

  // Cleanup RAF cursor on unmount
  useEffect(
    () => () => {
      if (rafCursorRef.current) cancelAnimationFrame(rafCursorRef.current);
    },
    [],
  );

  // Track Shift key for snap-angle rendering feedback
  useEffect(() => {
    const onKey = e => {
      shiftHeldRef.current = e.shiftKey;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  // Page filter: "all" shows every takeoff, "page" shows only those with measurements on current drawing
  const [pageFilter, setPageFilter] = useState(() => sessionStorage.getItem("bldg-pageFilter") || "all");
  // Left panel tab: matches EstimatePage tabs (estimate | scenarios | notes | rfis | nova | discovery)
  const [leftPanelTab, setLeftPanelTab] = useState("estimate");
  // Panel mode: "auto" = collapse on measure/reopen on stop, "open" = always open, "closed" = always closed
  const [tkPanelMode, _setTkPanelMode] = useState("open");

  // Persist pageFilter to sessionStorage
  useEffect(() => {
    sessionStorage.setItem("bldg-pageFilter", pageFilter);
  }, [pageFilter]);

  // Restore tkVisibility from sessionStorage on mount
  useEffect(() => {
    const savedVis = sessionStorage.getItem("bldg-tkVisibility");
    if (savedVis && ["all", "page", "active"].includes(savedVis)) {
      useTakeoffsStore.getState().setTkVisibility(savedVis);
    }
  }, []);

  // Persist tkVisibility to sessionStorage when it changes
  useEffect(() => {
    sessionStorage.setItem("bldg-tkVisibility", tkVisibility);
  }, [tkVisibility]);

  // Restore panel width and tier from sessionStorage on mount
  useEffect(() => {
    const savedW = sessionStorage.getItem("bldg-tkPanelWidth");
    const savedTier = sessionStorage.getItem("bldg-tkPanelTier");
    if (savedW) {
      const w = Number(savedW);
      if (w >= 280 && w <= 1000) useTakeoffsStore.getState().setTkPanelWidth(w);
    }
    if (savedTier && ["compact", "standard", "full", "estimate"].includes(savedTier)) {
      useTakeoffsStore.getState().setTkPanelTier(savedTier);
      if (savedTier === "estimate") useTakeoffsStore.getState().setTkPanelOpen(false);
    }
  }, []);

  // One-time migration: infer viewType for existing drawings from sheetTitle
  useEffect(() => {
    const ds = useDrawingsStore.getState();
    ds.drawings.forEach(d => {
      if (d.sheetTitle && !d.viewType) {
        const vt = inferViewType(d.sheetTitle);
        if (vt) ds.updateDrawing(d.id, "viewType", vt);
      }
    });
  }, []);

  // Persist selected drawing to sessionStorage so refresh returns to same page
  const prevDrawingIdRef = useRef(selectedDrawingId);
  useEffect(() => {
    if (selectedDrawingId) sessionStorage.setItem("bldg-selectedDrawingId", selectedDrawingId);
    // Clear analysis results when drawing changes
    setGeoAnalysis({ loading: false, results: null });
    // Sprint 8: Save zoom/pan for previous sheet, restore for new sheet
    const prevId = prevDrawingIdRef.current;
    if (prevId && prevId !== selectedDrawingId) {
      useTakeoffsStore.getState().saveTkSheetView(prevId);

      // Record cross-sheet learning data for the sheet we're leaving
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
        // Reset to default for sheets we haven't visited
        setTkZoom(100);
        setTkPan({ x: 0, y: 0 });
      }
    }
    prevDrawingIdRef.current = selectedDrawingId;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions (setTkPan, setTkZoom) are stable
  }, [selectedDrawingId]);

  // Memoized item lookup by ID — avoids O(n) items.find() per takeoff row
  const itemById = useMemo(() => {
    const map = {};
    items.forEach(i => {
      map[i.id] = i;
    });
    return map;
  }, [items]);

  // Measurement micro-feedback — flash takeoff ID when measurement completes
  const [measureFlashId, setMeasureFlashId] = useState(null);
  const measureFlashTimer = useRef(null);
  const triggerMeasureFlash = useCallback(toId => {
    setMeasureFlashId(toId);
    if (measureFlashTimer.current) clearTimeout(measureFlashTimer.current);
    measureFlashTimer.current = setTimeout(() => setMeasureFlashId(null), 600);
  }, []);

  // Cost edit popover — Standard/Full tier inline editing
  const [costEditId, setCostEditId] = useState(null);
  // Full tier — selected estimate item for detail panel
  const [estSelectedItemId, setEstSelectedItemId] = useState(null);

  // Toolbar dropdowns
  // toolsFolderOpen / toolsBtnRef removed — tools are now individual rail buttons

  // Takeoff Command Palette
  const [tkCmdOpen, setTkCmdOpen] = useState(false);

  // NOVA Chat state now managed internally by TakeoffNOVAPanel

  // Cross-sheet scan results (shared between canvas handlers and left panel)
  const [crossSheetScan, setCrossSheetScan] = useState(null);

  // Cmd+K: open Takeoff Command Palette (capture phase to intercept global)
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setTkCmdOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  // Derived
  const revisionAffectedIds = useMemo(() => {
    if (!revisionImpact?.sheets) return new Set();
    return new Set(revisionImpact.sheets.flatMap(s => s.affectedTakeoffs.map(t => t.id)));
  }, [revisionImpact]);
  const selectedDrawing = useMemo(() => drawings.find(d => d.id === selectedDrawingId), [drawings, selectedDrawingId]);
  const filteredTakeoffs = useMemo(() => {
    const byGroup = takeoffs.filter(t => (t.bidContext || "base") === activeGroupId);
    if (pageFilter === "all") return byGroup;
    if (!selectedDrawingId) return byGroup;
    // Strict filter: only takeoffs that have measurements on the current drawing
    return byGroup.filter(t => (t.measurements || []).some(m => m.sheetId === selectedDrawingId));
  }, [takeoffs, pageFilter, selectedDrawingId, activeGroupId]);
  const takeoffGroups = useMemo(() => {
    const g = {};
    filteredTakeoffs.forEach(t => {
      const k = t.group || "Ungrouped";
      if (!g[k]) g[k] = [];
      g[k].push(t);
    });
    return g;
  }, [filteredTakeoffs]);

  // Build a map of takeoffId → { inches, tool } for scale-aware rendering
  // Looks up renderWidth metadata on module driving items and the linked spec value
  const moduleRenderWidths = useMemo(() => {
    const map = {};
    const addItem = (item, specs, itemTakeoffIds) => {
      if (!item.renderWidth) return;
      const toId = itemTakeoffIds?.[item.id];
      if (!toId) return;
      // Validate takeoff still exists (prevents stale refs after reload)
      if (!takeoffs.some(t => t.id === toId)) return;
      let rawVal = specs?.[item.renderWidth.spec];
      // Fallback to altSpec (e.g., MSStudSize for Metal Stud material)
      if (!rawVal && item.renderWidth.altSpec) rawVal = specs?.[item.renderWidth.altSpec];
      const specVal = item.renderWidth.specMap ? item.renderWidth.specMap[rawVal] || 0 : nn(rawVal);
      const rawH = item.renderWidth.specHeight ? specs?.[item.renderWidth.specHeight] : null;
      const specH =
        rawH !== null ? (item.renderWidth.specMap ? item.renderWidth.specMap[rawH] || specVal : nn(rawH)) : specVal;
      if (specVal > 0) {
        map[toId] = { inches: specVal, inchesH: specH || specVal, tool: item.tool };
      }
    };
    Object.entries(moduleInstances).forEach(([moduleId, inst]) => {
      const moduleDef = MODULES[moduleId];
      if (!moduleDef) return;
      moduleDef.categories.forEach(cat => {
        if (cat.multiInstance) {
          // Multi-instance: iterate each category instance
          const catInstances = inst.categoryInstances?.[cat.id] || [];
          catInstances.forEach(catInst => {
            cat.items.forEach(item => addItem(item, catInst.specs, catInst.itemTakeoffIds));
          });
        } else {
          // Single-instance: use top-level specs/itemTakeoffIds
          cat.items.forEach(item => addItem(item, inst.specs, inst.itemTakeoffIds));
        }
      });
    });
    return map;
  }, [moduleInstances, takeoffs]);

  // ─── HELPERS ────────────────────────

  // Snap angle: constrain point to nearest 45° increment from anchor (Shift key)
  const snapAngle = (anchor, pt) => {
    const dx = pt.x - anchor.x;
    const dy = pt.y - anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) return pt;
    const angle = Math.atan2(dy, dx);
    const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return { x: anchor.x + dist * Math.cos(snap), y: anchor.y + dist * Math.sin(snap) };
  };
  // ─── TAKEOFF CRUD — now provided by useTakeoffCRUD() hook above ─────────────

  // ─── AI ITEM LOOKUP (NOVA) — lookupItemWithNova moved to TakeoffLeftPanel ─────────────

  const addTakeoffFromAI = item => {
    const id = uid();
    const current = useTakeoffsStore.getState().takeoffs;
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    useTakeoffsStore.getState().setTakeoffs([
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
    clearPredictions();
    setTkNewInput("");
    setTkDbResults([]);
    // aiLookup now managed by TakeoffLeftPanel
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
    if (drawingId && hasScale(drawingId)) {
      showToast(`✦ Added: ${item.description} — AI priced — measuring`);
      setTkActiveTakeoffId(id);
      setTkTool(unitToTool(item.unit || "SF"));
      setTkMeasureState("measuring");
      setTkActivePoints([]);
      setTkContextMenu(null);
    } else if (drawingId) {
      showToast("Please calibrate this drawing first — set a scale before measuring", "error");
    } else {
      showToast(`✦ Added: ${item.description} — AI priced`);
    }
  };

  const insertAIGroupIntoTakeoffs = result => {
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    const current = useTakeoffsStore.getState().takeoffs;
    const groupName = result.groupName || "AI Group";
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
      _aiCosts: {
        material: nn(item.material),
        labor: nn(item.labor),
        equipment: nn(item.equipment),
        subcontractor: nn(item.subcontractor),
      },
    }));
    useTakeoffsStore.getState().setTakeoffs([...current, ...newTakeoffs]);
    clearPredictions();
    setTkNewInput("");
    setTkDbResults([]);
    // aiLookup now managed by TakeoffLeftPanel
    showToast(`✦ Added ${result.items.length} items as "${groupName}" — AI priced`);
  };

  const addTakeoffFromAIAsSingle = result => {
    // Collapse multi-part into one item with aggregated costs
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
  };

  // ─── MEASUREMENT ENGINE — now provided by useMeasurementEngine() hook above ─────────────

  // ─── MEASUREMENT ACTIONS ────────────
  const addMeasurement = useCallback(
    (takeoffId, measurement) => {
      useTakeoffsStore.getState().addMeasurement(takeoffId, measurement);
      triggerMeasureFlash(takeoffId);
    },
    [triggerMeasureFlash],
  );

  // AI Analysis (drawing analysis, wall schedule, PDF schedules, geometry)
  const {
    aiDrawingAnalysis, setAiDrawingAnalysis,
    wallSchedule, setWallSchedule,
    pdfSchedules, setPdfSchedules,
    geoAnalysis, setGeoAnalysis,
    runDrawingAnalysis,
    acceptDrawingItem, acceptAllDrawingItems, aiToCanvasCoords,
    runWallScheduleDetection, createWallInstances,
    runPdfScheduleScan,
    runGeometryAnalysis,
  } = useTakeoffAnalysis({ addTakeoff, updateTakeoff, addMeasurement, canvasRef });

  const removeMeasurement = useCallback((takeoffId, measurementId) => {
    const s = useTakeoffsStore.getState();
    s.setTakeoffs(
      s.takeoffs.map(t => {
        if (t.id !== takeoffId) return t;
        return { ...t, measurements: (t.measurements || []).filter(m => m.id !== measurementId) };
      }),
    );
  }, []);

  // ── PDF Repair Drop Handler — re-attaches raw PDF for prediction extraction ──
  const handlePdfRepairDrop = useCallback(async e => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) return;
    showToast("Repairing PDF data for predictions...", "info");
    try {
      const count = await repairRawPdf(file);
      if (count > 0) {
        showToast(`✦ Repaired ${count} drawing${count > 1 ? "s" : ""} — predictions now enabled!`, "success");
        // Re-trigger proactive predictions
        clearPredictions();
      } else {
        showToast("No drawings needed repair (file name didn't match)", "error");
      }
    } catch (err) {
      showToast("PDF repair failed: " + err.message, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions (clearPredictions) and showToast are stable
  }, []);

  const engageMeasuring = useCallback(
    toId => {
      const s = useTakeoffsStore.getState();
      const to = s.takeoffs.find(t => t.id === toId);
      if (!to) return;
      const drawingId = useDrawingsStore.getState().selectedDrawingId;
      // Block measurement on uncalibrated drawings — require scale first
      if (drawingId && !hasScale(drawingId)) {
        showToast("Please calibrate this drawing first — set a scale before measuring", "error");
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
      setTkSelectedTakeoffId(toId);
      setTkActiveTakeoffId(toId);
      setTkTool(unitToTool(to.unit));
      setTkMeasureState("measuring");
      setTkActivePoints([]);
      setTkContextMenu(null);
      setTkShowVars(null);
      // Collapse panel when measuring starts (unless pinned open)
      if (tkPanelMode !== "open") setTkPanelOpen(false);
      // Pre-warm prediction cache in background — predictions will be instant on first click
      const drawState = useDrawingsStore.getState();
      const warmDrawing = drawState.drawings.find(d => d.id === drawState.selectedDrawingId);
      if (warmDrawing && warmDrawing.type === "pdf" && (warmDrawing.data || warmDrawing.pdfRawBase64)) {
        warmPredictions(warmDrawing, to.description).catch(() => {});
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions (setTk*) are stable; tkPanelMode read from closure is intentional
    [addMeasurement],
  );

  const stopMeasuring = useCallback(() => {
    const s = useTakeoffsStore.getState();
    const pts = s.tkActivePoints || [];
    const tool = s.tkTool;
    const activeTo = s.tkActiveTakeoffId;
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
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
    // Keep tkSelectedTakeoffId so measurements stay visible after stopping
    setTkMeasureState("idle");
    setTkTool("select");
    setTkActivePoints([]);
    setTkActiveTakeoffId(null);
    setTkContextMenu(null);
    setTkCursorPt(null);
    clearPredictions();
    setCrossSheetScan(null);
    // Auto-reopen panel when measuring stops (only in "auto" mode)
    if (tkPanelMode === "auto") {
      // Restore tier if it was auto-collapsed during measuring
      const savedTier = sessionStorage.getItem("bldg-tkPanelTier");
      const savedW = sessionStorage.getItem("bldg-tkPanelWidth");
      if (savedTier === "estimate") {
        // Don't reopen panel in estimate mode
      } else {
        setTkPanelOpen(true);
        if (savedTier && savedTier !== useTakeoffsStore.getState().tkPanelTier) {
          useTakeoffsStore.getState().setTkPanelTier(savedTier);
          if (savedW) useTakeoffsStore.getState().setTkPanelWidth(Number(savedW));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions (setTk*, clearPredictions) are stable; reads fresh state via getState()
  }, [addMeasurement, tkPanelMode]);

  const pauseMeasuring = () => {
    setTkMeasureState("paused");
    setTkActivePoints([]);
    setTkCursorPt(null);
  };

  // Canvas interaction handlers — extracted to useTakeoffCanvasHandlers hook
  const { handleCanvasClick, handleDrawingWheel, handleDrawingMouseDown } = useTakeoffCanvasHandlers({
    canvasRef,
    drawingContainerRef,
    tkTransformRef,
    tkLastWheelX,
    tkPanning,
    tkPanStart,
    snapAngleOnRef,
    addMeasurement,
    updateTakeoff,
    pauseMeasuring,
    setCrossSheetScan,
    snapAngle,
    hasScale,
    calcPolylineLength,
    calcPolygonArea,
    getDisplayUnit,
  });

  const startAutoCount = takeoffId => {
    stopMeasuring();
    setTkAutoCount({ takeoffId, phase: "select", samplePt: null, results: [] });
    showToast("Click on a sample symbol to auto-count", "info");
  };

  const finishCalibration = () => {
    if (tkActivePoints.length < 2 || !nn(tkCalibInput.dist)) return;
    setTkCalibrations({
      ...tkCalibrations,
      [selectedDrawingId]: {
        p1: tkActivePoints[0],
        p2: tkActivePoints[1],
        realDist: nn(tkCalibInput.dist),
        unit: tkCalibInput.unit,
      },
    });
    setTkActivePoints([]);
    setTkCalibInput({ dist: "", unit: "ft" });
    setTkTool("select");
    showToast("Scale calibrated!");
  };

  // Variables & Formula
  const _addTakeoffVariable = id =>
    setTakeoffs(
      takeoffs.map(t => (t.id === id ? { ...t, variables: [...(t.variables || []), { key: "", value: "" }] } : t)),
    );
  const _updateTakeoffVariable = (id, idx, field, val) =>
    setTakeoffs(
      takeoffs.map(t => {
        if (t.id !== id) return t;
        const vars = [...(t.variables || [])];
        vars[idx] = { ...vars[idx], [field]: val };
        return { ...t, variables: vars };
      }),
    );
  const _removeTakeoffVariable = (id, idx) =>
    setTakeoffs(
      takeoffs.map(t => {
        if (t.id !== id) return t;
        const vars = [...(t.variables || [])];
        vars.splice(idx, 1);
        return { ...t, variables: vars };
      }),
    );

  // Drag reorder
  const tkDragReorder = () => {
    const fromId = tkDragTakeoff.current;
    const toId = tkDragOverTakeoff.current;
    if (!fromId || !toId || fromId === toId) return;
    const arr = [...takeoffs];
    const fromIdx = arr.findIndex(t => t.id === fromId);
    const toIdx = arr.findIndex(t => t.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    setTakeoffs(arr);
  };

  // Panel resize logic moved to TakeoffLeftPanel

  // Render PDF page
  const renderPdfPage = useCallback(async drawing => {
    // Check latest store state to avoid stale closure
    const current = useDrawingsStore.getState().pdfCanvases;
    if (current[drawing.id]) return current[drawing.id];
    // Pre-rendered PDF page — data is already a JPEG, cache and return
    if (drawing.pdfPreRendered && drawing.data) {
      useDrawingsStore.setState(s => ({ pdfCanvases: { ...s.pdfCanvases, [drawing.id]: drawing.data } }));
      return drawing.data;
    }
    if (drawing.type !== "pdf" || !drawing.data) return null;
    try {
      await loadPdfJs();
      // Fast base64 decode using fetch + arrayBuffer
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
      // Use functional update to avoid stale closure in batch renders
      useDrawingsStore.setState(s => ({ pdfCanvases: { ...s.pdfCanvases, [drawing.id]: url } }));
      return url;
    } catch (e) {
      console.error("renderPdfPage:", e);
      return null;
    }
  }, []);

  // Helper: select a drawing by ID (for command palette)
  const handleSelectDrawing = useCallback(
    id => {
      setSelectedDrawingId(id);
      const d = useDrawingsStore.getState().drawings.find(dr => dr.id === id);
      if (d?.type === "pdf" && d.data) renderPdfPage(d);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand action (setSelectedDrawingId) is stable
    [renderPdfPage],
  );

  // ─── OUTLINE TOOL — trace building perimeter for Model tab ────
  const _handleOutlineClick = useCallback(
    e => {
      if (tkTool !== "outline" || !selectedDrawingId) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      const pt = { x: cx, y: cy };

      const pts = tkActivePoints || [];

      // Close polygon: click near first point or double-click with ≥3 pts
      const finishOutline = vertices => {
        // Always save raw pixel polygon for canvas overlay rendering
        const pixelPoly = vertices.map(p => ({ x: p.x, y: p.y }));
        // Convert pixel polygon to feet via outlineToFeet for 3D rendering
        try {
          const feetPoly = outlineToFeet(pixelPoly, selectedDrawingId);
          useModelStore.getState().setOutline(selectedDrawingId, feetPoly, "manual", pixelPoly);
          showToast(`Building outline saved (${vertices.length} vertices)`);
        } catch (err) {
          // Fallback — save pixel coords mapped to {x, z}
          console.warn("outlineToFeet failed, using pixel coords:", err);
          useModelStore.getState().setOutline(
            selectedDrawingId,
            vertices.map(p => ({ x: p.x, z: p.y })),
            "manual",
            pixelPoly,
          );
          showToast(`Outline saved (${vertices.length} pts) — set scale for accurate 3D`);
        }
        setTkActivePoints([]);
        setTkTool("select");
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

      // Apply snap angle when Shift is held or snap toggle is on
      const snappedPt =
        (e.shiftKey || snapAngleOnRef.current) && pts.length >= 1 ? snapAngle(pts[pts.length - 1], pt) : pt;
      setTkActivePoints([...pts, snappedPt]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions (setTkActivePoints, setTkTool) are stable
    [tkTool, tkActivePoints, selectedDrawingId, showToast],
  );

  // ─── CANVAS CLICK / WHEEL / MOUSEDOWN handlers provided by useTakeoffCanvasHandlers hook above ──
  // (see useTakeoffCanvasHandlers.js for handleCanvasClick, handleDrawingWheel, handleDrawingMouseDown)

  // Pan listeners
  useEffect(() => {
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
  }, [tkMeasureState, setTkPan, setTkContextMenu]);

  // Reset pan on drawing change
  useEffect(() => {
    setTkPan({ x: 0, y: 0 });
  }, [selectedDrawingId, setTkPan]);

  // Proactively trigger predictions when switching takeoff items or sheets.
  // CRITICAL: Only depends on takeoffId + drawingId (NOT tkMeasureState).
  // Previous bug: tkMeasureState in deps caused this to re-fire on every state change,
  // calling clearPredictions() and wiping in-flight async results.
  useEffect(() => {
    const scanKey = `${tkActiveTakeoffId}::${selectedDrawingId}`;

    // Only clear predictions when the takeoff or drawing ACTUALLY changed
    if (scanKey !== predScanKeyRef.current) {
      clearPredictions();
      predScanKeyRef.current = scanKey;
    }

    if (!tkActiveTakeoffId || !selectedDrawingId) return;

    // Guard: only trigger predictions when actively measuring
    const currentMeasureState = useTakeoffsStore.getState().tkMeasureState;
    if (currentMeasureState !== "measuring" && currentMeasureState !== "paused") {
      return;
    }

    const to = useTakeoffsStore.getState().takeoffs.find(t => t.id === tkActiveTakeoffId);
    if (!to) return;
    const drawing = useDrawingsStore.getState().drawings.find(d => d.id === selectedDrawingId);
    if (!drawing || drawing.type !== "pdf" || !drawing.data) {
      console.log(`[NOVA] Proactive scan blocked: type=${drawing?.type} data=${!!drawing?.data}`);
      return;
    }

    // Increment generation counter — prevents stale async results from being applied
    const gen = ++predScanGenRef.current;

    const measureType = unitToTool(to.unit);

    // Use center of existing measurements on this sheet, or canvas center
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
    showToast(`✦ NOVA scanning for "${to.description?.slice(0, 30)}"...`, "info");
    runSmartPredictions(drawing, to, measureType, clickPt)
      .then(result => {
        // Stale check: if generation changed, a newer scan superseded this one
        if (predScanGenRef.current !== gen) {
          console.log("[NOVA] Stale result gen=" + gen + " (current=" + predScanGenRef.current + "), discarding");
          return;
        }
        console.log(
          "[NOVA] Result gen=" + gen + ":",
          result.source,
          result.strategy,
          result.tag,
          result.predictions.length,
          "predictions",
          result.message || "",
        );

        // Double-check: takeoff must still be active
        const currentActiveId = useTakeoffsStore.getState().tkActiveTakeoffId;
        if (currentActiveId !== tkActiveTakeoffId) return;

        if (result.predictions.length > 0) {
          setTkPredictions({
            tag: result.tag,
            predictions: result.predictions,
            scanning: false,
            totalInstances: result.totalInstances,
            source: result.source,
            strategy: result.strategy,
            takeoffId: result.takeoffId,
          });
          initPredContext(result.tag, result.source, result.confidence);
          showToast(`✦ Found ${result.predictions.length} "${result.tag || "items"}" — review predictions`, "success");
        } else {
          console.log("[NOVA] Proactive scan returned 0 predictions:", result.message || result.strategy);
          if (result.needsRepair && !window._novaRepairToastShown) {
            window._novaRepairToastShown = true;
            showToast("Drop the original PDF onto the drawing to enable NOVA predictions", "info");
          }
        }
      })
      .catch(err => {
        if (predScanGenRef.current !== gen) return; // stale — ignore
        console.warn("Proactive prediction failed:", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions (clearPredictions, initPredContext, setTkPredictions) and showToast are stable
  }, [tkActiveTakeoffId, selectedDrawingId]);

  // Auto-scroll filmstrip to active drawing
  useEffect(() => {
    if (selectedDrawingId && compactStripRef.current) {
      const el = compactStripRef.current.querySelector(`[data-drawing-id="${selectedDrawingId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedDrawingId]);

  // Attach wheel handler with { passive: false } for proper preventDefault
  useEffect(() => {
    const container = drawingContainerRef.current;
    if (!container) return;
    container.addEventListener("wheel", handleDrawingWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleDrawingWheel);
  }, [handleDrawingWheel]);

  // Keyboard flow — Escape / Tab / Enter for pro takeoff workflow
  useEffect(() => {
    const handler = e => {
      // Skip when user is typing in an input/textarea/select
      const tag = document.activeElement?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        setTkContextMenu(null);
        if (isTyping) {
          document.activeElement.blur();
          return;
        }
        if (tkMeasureState === "measuring" || tkMeasureState === "paused") {
          stopMeasuring(); // stops measuring but keeps tkSelectedTakeoffId
        } else if (tkSelectedTakeoffId) {
          setTkSelectedTakeoffId(null); // second Esc deselects
          setTkActivePoints([]);
          if (tkTool !== "select") setTkTool("select");
        } else {
          setTkActivePoints([]);
          if (tkTool !== "select") setTkTool("select");
        }
        return;
      }

      // Tab — navigate between takeoffs (skip when typing in inputs)
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
        // If currently measuring, stop first then move
        if (tkMeasureState === "measuring" || tkMeasureState === "paused") {
          stopMeasuring();
        }
        const nextId = allTos[nextIdx].id;
        setTkSelectedTakeoffId(nextId);
        // Scroll the selected row into view
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-takeoff-id="${nextId}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return;
      }

      // Enter — engage measuring on selected takeoff (skip when typing)
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
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Zustand actions (setTk*, engageMeasuring, stopMeasuring) are stable
  }, [tkTool, tkMeasureState, tkSelectedTakeoffId]);

  // DB search effect — search items + assemblies (NOVA only on explicit click)
  useEffect(() => {
    if (!tkNewInput.trim()) {
      setTkDbResults([]);
      // aiLookup now managed by TakeoffLeftPanel
      return;
    }
    // aiLookup now managed by TakeoffLeftPanel

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
    setTkDbResults(combined);
  }, [tkNewInput, elements, assemblies, setTkDbResults]);

  // Auto-select first drawing + render selected PDF immediately, then lazily render remaining thumbnails
  useEffect(() => {
    if (drawings.length === 0) return;
    const withData = drawings.filter(d => d.data);
    if (withData.length === 0) return;

    // Auto-select: restore from session or fall back to first drawing
    if (!selectedDrawingId || !withData.find(d => d.id === selectedDrawingId)) {
      const savedId = sessionStorage.getItem("bldg-selectedDrawingId");
      const savedDrawing = savedId && withData.find(d => d.id === savedId);
      const target = savedDrawing || withData[0];
      setSelectedDrawingId(target.id);
      if (target.type === "pdf") renderPdfPage(target);
    }

    // Lazily render remaining PDF thumbnails (one at a time, with small delay between each)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawings, renderPdfPage, selectedDrawingId, setSelectedDrawingId read via getState/ref; trigger only on drawings.length
  }, [drawings.length]);

  // Static canvas: committed measurements (expensive — only re-renders when takeoff data changes, NOT on cursor move)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedDrawingId) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing measurements (selected takeoff at full opacity, others dimmed)
    // tkVisibility: "all" = show all, "page" = this page only, "active" = selected/active only
    // pageFilter: "page" syncs canvas to only show takeoffs with measurements on this drawing
    const toFillHex = pct =>
      Math.round(Math.min(100, Math.max(5, pct)) * 2.55)
        .toString(16)
        .padStart(2, "0");
    const canvasTakeoffs = pageFilter === "page" ? filteredTakeoffs : takeoffs;
    canvasTakeoffs.forEach(to => {
      if (tkVisibility === "active" && to.id !== tkSelectedTakeoffId && to.id !== tkActiveTakeoffId) return;
      const isSelectedTo = to.id === tkSelectedTakeoffId || to.id === tkActiveTakeoffId;
      const fillHex = toFillHex(to.fillOpacity ?? 75);
      const sw = to.strokeWidth ?? 3;
      (to.measurements || []).forEach(m => {
        if (m.sheetId !== selectedDrawingId) return;
        ctx.save();
        ctx.globalAlpha = isSelectedTo ? 1.0 : 0.28;
        const color = m.color || to.color || "#5b8def";
        if (m.type === "count") {
          const p = m.points[0];
          const brw = moduleRenderWidths[to.id];
          const scaledW = brw ? realToPx(selectedDrawingId, brw.inches) : null;
          const scaledH = brw ? realToPx(selectedDrawingId, brw.inchesH || brw.inches) : null;
          if (scaledW && scaledW >= 6) {
            // Scaled rectangle for module items (e.g., spread footings)
            const hw = scaledW / 2,
              hh = (scaledH || scaledW) / 2;
            ctx.fillStyle = color + fillHex;
            ctx.fillRect(p.x - hw, p.y - hh, scaledW, scaledH || scaledW);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x - hw, p.y - hh, scaledW, scaledH || scaledW);
          } else {
            // Diamond gem marker for count items
            const sz = 14;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.PI / 4); // 45° rotation → diamond shape
            // Outer glow
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            // Filled diamond with inner gradient effect
            ctx.fillStyle = color + "CC";
            ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
            // Lighter center highlight
            const innerSz = sz * 0.5;
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.fillRect(-innerSz / 2, -innerSz / 2, innerSz, innerSz);
            // Border
            ctx.shadowBlur = 0;
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
            ctx.restore();
          }
        }
        if (m.type === "linear" && m.points.length >= 2) {
          const brw = moduleRenderWidths[to.id];
          const scaledW = brw ? realToPx(selectedDrawingId, brw.inches) : null;
          const useScaledWidth = scaledW && scaledW >= 2;
          // Draw path
          ctx.beginPath();
          ctx.moveTo(m.points[0].x, m.points[0].y);
          for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y);
          if (useScaledWidth) {
            // Wide semi-transparent band at real-world width
            ctx.strokeStyle = color + fillHex;
            ctx.lineWidth = scaledW;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.stroke();
            // Thin centerline on top
            ctx.beginPath();
            ctx.moveTo(m.points[0].x, m.points[0].y);
            for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.stroke();
          } else {
            ctx.strokeStyle = color;
            ctx.lineWidth = sw;
            ctx.stroke();
          }
          ctx.lineCap = "butt";
          ctx.lineJoin = "miter"; // reset
        }
        if (m.type === "area" && m.points.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(m.points[0].x, m.points[0].y);
          for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y);
          ctx.closePath();
          ctx.fillStyle = color + fillHex;
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth = sw;
          ctx.stroke();
        }
        ctx.restore();
      });
    });
    // Draw existing building outlines (from modelStore) as dashed overlays
    const outlines = useModelStore.getState().outlines;
    const outline = outlines[selectedDrawingId];
    const pxPoly = outline?.pixelPolygon; // raw pixel coordinates for canvas rendering
    if (pxPoly?.length >= 3) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = "#6366F1"; // indigo — distinct from measurement colors
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(pxPoly[0].x, pxPoly[0].y);
      for (let i = 1; i < pxPoly.length; i++) {
        ctx.lineTo(pxPoly[i].x, pxPoly[i].y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      // Label at centroid
      const cx0 = pxPoly.reduce((s, p) => s + p.x, 0) / pxPoly.length;
      const cy0 = pxPoly.reduce((s, p) => s + p.y, 0) / pxPoly.length;
      ctx.font = "bold 14px sans-serif";
      ctx.fillStyle = "#6366F1";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`Building Outline (${outline.source})`, cx0, cy0);
      ctx.restore();
    }

    // Draw geometry analysis results (detected walls + rooms)
    if (geoAnalysis.results) {
      const geo = geoAnalysis.results;
      ctx.save();
      ctx.globalAlpha = 0.4;

      // Draw detected walls as thin teal lines
      geo.walls.forEach(wall => {
        ctx.beginPath();
        ctx.moveTo(wall.centerline.x1, wall.centerline.y1);
        ctx.lineTo(wall.centerline.x2, wall.centerline.y2);
        ctx.strokeStyle = "#10B981";
        ctx.lineWidth = Math.max(1, wall.width * 0.3);
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Draw detected rooms as shaded polygons
      ctx.globalAlpha = 0.08;
      geo.rooms.forEach(room => {
        if (room.polygon.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(room.polygon[0].x, room.polygon[0].y);
        for (let i = 1; i < room.polygon.length; i++) {
          ctx.lineTo(room.polygon[i].x, room.polygon[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = C.accent;
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.08;
      });

      // Draw detected openings as small markers
      ctx.globalAlpha = 0.5;
      geo.openings.forEach(op => {
        ctx.beginPath();
        ctx.arc(op.position.x, op.position.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = op.type === "door" ? "#F59E0B" : "#3B82F6";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- realToPx is derived from drawingScales/drawingDpi already in deps
  }, [
    takeoffs,
    filteredTakeoffs,
    pageFilter,
    selectedDrawingId,
    tkSelectedTakeoffId,
    tkActiveTakeoffId,
    moduleRenderWidths,
    tkVisibility,
    drawingScales,
    drawingDpi,
    geoAnalysis,
    activeModule,
  ]);

  // Overlay canvas: cursor-dependent content + calibration + AI analysis (lightweight — OK to re-render on cursor move)
  useEffect(() => {
    const overlay = cursorCanvasRef.current;
    const mainCanvas = canvasRef.current;
    if (!overlay || !mainCanvas || !selectedDrawingId) return;
    // Match overlay size to main canvas
    if (overlay.width !== mainCanvas.width || overlay.height !== mainCanvas.height) {
      overlay.width = mainCanvas.width;
      overlay.height = mainCanvas.height;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Draw active points (in-progress measurement) with filled preview + running value
    if (tkActivePoints.length > 0 && tkActiveTakeoffId) {
      const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
      const color = to?.color || "#5b8def";
      const brwPreview = moduleRenderWidths[tkActiveTakeoffId];
      const scaledPreviewW = brwPreview ? realToPx(selectedDrawingId, brwPreview.inches) : null;
      ctx.save();

      // Filled polygon preview for area tool
      if (tkTool === "area" && tkActivePoints.length >= 2 && tkCursorPt) {
        ctx.beginPath();
        ctx.moveTo(tkActivePoints[0].x, tkActivePoints[0].y);
        for (let i = 1; i < tkActivePoints.length; i++) ctx.lineTo(tkActivePoints[i].x, tkActivePoints[i].y);
        ctx.lineTo(tkCursorPt.x, tkCursorPt.y);
        ctx.closePath();
        ctx.fillStyle = color + "20";
        ctx.fill();
      }

      // Scale-aware wide band preview for linear tool
      if (tkTool === "linear" && scaledPreviewW && scaledPreviewW >= 2 && tkActivePoints.length >= 1) {
        ctx.beginPath();
        ctx.moveTo(tkActivePoints[0].x, tkActivePoints[0].y);
        for (let i = 1; i < tkActivePoints.length; i++) ctx.lineTo(tkActivePoints[i].x, tkActivePoints[i].y);
        if (tkCursorPt) ctx.lineTo(tkCursorPt.x, tkCursorPt.y);
        ctx.strokeStyle = color + "25";
        ctx.lineWidth = scaledPreviewW;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
      }

      // Dashed outline from points to cursor (+ close for area)
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(tkActivePoints[0].x, tkActivePoints[0].y);
      for (let i = 1; i < tkActivePoints.length; i++) ctx.lineTo(tkActivePoints[i].x, tkActivePoints[i].y);
      if (tkCursorPt) ctx.lineTo(tkCursorPt.x, tkCursorPt.y);
      if (tkTool === "area" && tkActivePoints.length >= 2 && tkCursorPt)
        ctx.lineTo(tkActivePoints[0].x, tkActivePoints[0].y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertex dots
      tkActivePoints.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
      if (tkCursorPt) {
        ctx.beginPath();
        ctx.arc(tkCursorPt.x, tkCursorPt.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color + "80";
        ctx.fill();
      }

      // Snap angle guide line + badge (when Shift is held)
      if (
        (shiftHeldRef.current || snapAngleOnRef.current) &&
        tkCursorPt &&
        tkActivePoints.length >= 1 &&
        (tkTool === "linear" || tkTool === "area")
      ) {
        const anchor = tkActivePoints[tkActivePoints.length - 1];
        const dx = tkCursorPt.x - anchor.x;
        const dy = tkCursorPt.y - anchor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
          const angle = Math.atan2(dy, dx);
          const snapAngleVal = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          // Extended guide line along snap axis
          const extLen = Math.max(dist * 1.5, 200);
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(anchor.x - extLen * Math.cos(snapAngleVal), anchor.y - extLen * Math.sin(snapAngleVal));
          ctx.lineTo(anchor.x + extLen * Math.cos(snapAngleVal), anchor.y + extLen * Math.sin(snapAngleVal));
          ctx.stroke();
          ctx.setLineDash([]);
          // Angle badge
          const degVal = Math.round(((((snapAngleVal * 180) / Math.PI) % 360) + 360) % 360);
          const badgeLabel = degVal + "\u00B0";
          ctx.font = "bold 11px 'Switzer', sans-serif";
          const bw = ctx.measureText(badgeLabel).width + 10;
          const bx = tkCursorPt.x + 18,
            by = tkCursorPt.y + 16;
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bx - 2, by - 8, bw, 16, 3);
          else ctx.rect(bx - 2, by - 8, bw, 16);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(badgeLabel, bx + 3, by);
          ctx.restore();
        }
      }

      // Running value label near cursor
      if (tkCursorPt && hasScale(selectedDrawingId)) {
        const previewPts = [...tkActivePoints, tkCursorPt];
        let liveVal = null,
          unitLbl = "";
        if (tkTool === "area" && previewPts.length >= 3) {
          liveVal = calcPolygonArea(previewPts, selectedDrawingId);
          unitLbl = getDisplayUnit(selectedDrawingId) + "²";
        } else if (tkTool === "linear" && previewPts.length >= 2) {
          liveVal = calcPolylineLength(previewPts, selectedDrawingId);
          unitLbl = getDisplayUnit(selectedDrawingId);
        }
        if (liveVal !== null) {
          const formatted =
            liveVal >= 1000 ? Math.round(liveVal).toLocaleString() : (Math.round(liveVal * 100) / 100).toString();
          const label = `${formatted} ${unitLbl}`;
          const lx = tkCursorPt.x + 18,
            ly = tkCursorPt.y - 18;
          ctx.font = "bold 14px 'Switzer', sans-serif";
          const tw = ctx.measureText(label).width;
          const px = 8,
            py = 4,
            bgW = tw + px * 2,
            bgH = 20 + py * 2;
          ctx.fillStyle = color;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(lx - px, ly - bgH / 2, bgW, bgH, 4);
          } else {
            ctx.rect(lx - px, ly - bgH / 2, bgW, bgH);
          }
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(label, lx, ly);
        }
      }

      ctx.restore();
    }

    // Calibration points
    if (tkTool === "calibrate" && tkActivePoints.length >= 1) {
      ctx.save();
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      tkActivePoints.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "#dc262660";
        ctx.fill();
        ctx.stroke();
      });
      if (tkActivePoints.length === 2) {
        ctx.beginPath();
        ctx.moveTo(tkActivePoints[0].x, tkActivePoints[0].y);
        ctx.lineTo(tkActivePoints[1].x, tkActivePoints[1].y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // AI Drawing Analysis — preview annotations (dashed outlines for detected elements)
    if (
      aiDrawingAnalysis &&
      !aiDrawingAnalysis.loading &&
      aiDrawingAnalysis.results?.length > 0 &&
      aiDrawingAnalysis.aiW &&
      overlay.width
    ) {
      const scaleX = overlay.width / aiDrawingAnalysis.aiW;
      const scaleY = overlay.height / (aiDrawingAnalysis.aiH || aiDrawingAnalysis.aiW);
      ctx.save();
      ctx.globalAlpha = 0.6;
      aiDrawingAnalysis.results.forEach((item, _idx) => {
        const pts = (item.locations || []).map(p => ({ x: Math.round(p.x * scaleX), y: Math.round(p.y * scaleY) }));
        if (pts.length === 0) return;
        const aiColor = item.type === "count" ? "#22c55e" : item.type === "linear" ? "#3b82f6" : "#a855f7";
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = aiColor;
        ctx.lineWidth = 2;
        if (item.type === "count") {
          pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = aiColor + "20";
            ctx.fill();
            ctx.stroke();
          });
          // Label near first point
          if (pts[0]) {
            const lbl = item.name?.length > 25 ? item.name.slice(0, 22) + "..." : item.name;
            ctx.font = "bold 10px 'Switzer', sans-serif";
            const tw = ctx.measureText(lbl).width;
            ctx.fillStyle = aiColor + "D0";
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(pts[0].x + 14, pts[0].y - 8, tw + 10, 16, 3);
            else ctx.rect(pts[0].x + 14, pts[0].y - 8, tw + 10, 16);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(lbl, pts[0].x + 19, pts[0].y);
          }
        } else if (item.type === "linear" && pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
          pts.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = aiColor;
            ctx.fill();
          });
          const mid = pts[Math.floor(pts.length / 2)];
          const lbl = item.name?.length > 25 ? item.name.slice(0, 22) + "..." : item.name;
          ctx.font = "bold 10px 'Switzer', sans-serif";
          const tw = ctx.measureText(lbl).width;
          ctx.fillStyle = aiColor + "D0";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(mid.x - tw / 2 - 5, mid.y - 20, tw + 10, 16, 3);
          else ctx.rect(mid.x - tw / 2 - 5, mid.y - 20, tw + 10, 16);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(lbl, mid.x, mid.y - 12);
        } else if (item.type === "area" && pts.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fillStyle = aiColor + "15";
          ctx.fill();
          ctx.stroke();
          // Centroid label
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          const lbl = item.name?.length > 25 ? item.name.slice(0, 22) + "..." : item.name;
          ctx.font = "bold 10px 'Switzer', sans-serif";
          const tw = ctx.measureText(lbl).width;
          ctx.fillStyle = aiColor + "D0";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(cx - tw / 2 - 5, cy - 8, tw + 10, 16, 3);
          else ctx.rect(cx - tw / 2 - 5, cy - 8, tw + 10, 16);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(lbl, cx, cy);
        }
        ctx.setLineDash([]);
      });
      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measurement fns (calcPolygonArea, etc.) and realToPx are derived from drawingScales/drawingDpi already in deps
  }, [
    takeoffs,
    tkActivePoints,
    tkCursorPt,
    selectedDrawingId,
    tkTool,
    tkCalibrations,
    drawingScales,
    drawingDpi,
    tkActiveTakeoffId,
    tkSelectedTakeoffId,
    moduleRenderWidths,
    aiDrawingAnalysis,
    tkVisibility,
    showMeasureLabels,
  ]);

  // AI Scope Suggestions
  const _runScopeSuggestions = async () => {
    if (takeoffs.length === 0) return showToast("Add some takeoffs first", "error");
    setTkScopeSuggestions({ loading: true, items: [] });
    try {
      const tkList = takeoffs
        .map(t => {
          const q = getMeasuredQty(t);
          return `${t.description} (${q !== null ? q : "no scale"} ${t.unit})${t.code ? ` [${t.code}]` : ""}`;
        })
        .join("\n");
      const estItems = items.map(i => `${i.description} (${i.quantity} ${i.unit})`).join("\n");
      const prompt = `You are an expert construction estimator. The estimator is working on: "${project.name || "a project"}" (${project.type || "commercial"}).

Current takeoffs:
${tkList}

${estItems ? `Current estimate scope items:\n${estItems}\n` : ""}
Analyze this scope and identify 5-10 items that are commonly MISSING. Think about associated/dependent items, prep work, accessories, related trades.

Respond ONLY with a JSON array. Each object: {"name":"Item Name","desc":"Why this is likely needed","unit":"SF","code":"09 30 00"}`;
      let lastParsedCount = 0;
      const fullText = await callAnthropicStream({
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
        onText: accumulated => {
          const objects = parsePartialJsonArray(accumulated);
          if (objects.length > lastParsedCount) {
            lastParsedCount = objects.length;
            setTkScopeSuggestions({ loading: true, items: objects });
          }
        },
      });
      // Final parse of complete response
      const clean = fullText.replace(/```json|```/g, "").trim();
      try {
        const parsed = JSON.parse(clean);
        setTkScopeSuggestions({ loading: false, items: Array.isArray(parsed) ? parsed : [] });
      } catch {
        setTkScopeSuggestions(prev => ({ loading: false, items: prev?.items || [] }));
      }
    } catch (e) {
      console.error("Scope suggestion error:", e);
      setTkScopeSuggestions({ loading: false, items: [] });
      showToast("AI suggestion failed", "error");
    }
  };

  // ─── RENDER ─────────────────────────

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 120px)", position: "relative" }}>
      {/* ── Revision Impact Card ── */}
      <RevisionImpactCard
        revisionImpact={revisionImpact}
        onDismiss={dismissRevisionImpact}
        onReviewSheet={newId => {
          setSelectedDrawingId(newId);
          dismissRevisionImpact();
        }}
      />
      {/* ── Vertical Control Rail ── */}
      <TakeoffControlRail
        checkDimMode={checkDimMode}
        setCheckDimMode={setCheckDimMode}
        snapAngleOn={snapAngleOn}
        setSnapAngleOn={setSnapAngleOn}
        showMeasureLabels={showMeasureLabels}
        setShowMeasureLabels={setShowMeasureLabels}
      />

      {/* LEFT PANEL — extracted to TakeoffLeftPanel */}
      <TakeoffLeftPanel
        crud={{
          addTakeoff,
          updateTakeoff,
          removeTakeoff,
          addTakeoffFreeform,
          addTakeoffFromDb,
          insertAssemblyIntoTakeoffs,
          addTakeoffFromAI,
          insertAIGroupIntoTakeoffs,
          addTakeoffFromAIAsSingle,
        }}
        measurement={{
          engageMeasuring,
          stopMeasuring,
          pauseMeasuring,
          removeMeasurement,
          hasScale,
          computeMeasurementValue,
          getMeasuredQty,
          getComputedQty,
          startAutoCount,
        }}
        analysis={{
          aiDrawingAnalysis,
          pdfSchedules,
          runDrawingAnalysis,
          runWallScheduleDetection,
          runPdfScheduleScan,
          wallScheduleLoading: wallSchedule.loading,
        }}
        pageFilter={pageFilter}
        setPageFilter={setPageFilter}
        leftPanelTab={leftPanelTab}
        setLeftPanelTab={setLeftPanelTab}
        crossSheetScan={crossSheetScan}
        setCrossSheetScan={setCrossSheetScan}
        estSelectedItemId={estSelectedItemId}
        setEstSelectedItemId={setEstSelectedItemId}
        measureFlashId={measureFlashId}
        itemById={itemById}
        revisionAffectedIds={revisionAffectedIds}
        filteredTakeoffs={filteredTakeoffs}
        takeoffGroups={takeoffGroups}
        tkDragTakeoff={tkDragTakeoff}
        tkDragOverTakeoff={tkDragOverTakeoff}
        tkDragReorder={tkDragReorder}
      />


      {/* Item Detail Panel — Full tier, slides in from right over drawing viewer */}
      {estSelectedItemId && tkPanelTier === "full" && (
        <Suspense fallback={null}>
          <ItemDetailPanel
            itemId={estSelectedItemId}
            onClose={() => setEstSelectedItemId(null)}
            onNavigate={dir => {
              const currentItems = useItemsStore.getState().items;
              const idx = currentItems.findIndex(i => i.id === estSelectedItemId);
              if (idx === -1) return;
              const nextIdx = idx + dir;
              if (nextIdx >= 0 && nextIdx < currentItems.length) setEstSelectedItemId(currentItems[nextIdx].id);
            }}
          />
        </Suspense>
      )}

      {/* DRAWING VIEWER — full width, zIndex above backdrop so canvas is always interactive */}
      <div
        style={{
          flex: 1,
          minWidth: 300,
          background: C.bg1,
          borderRadius: "6px",
          border: `1px solid ${C.border}`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          marginLeft: tkPanelTier === "estimate" ? 0 : tkPanelOpen ? tkPanelWidth : 0,
          transition: "margin-left 0.2s ease-out",
          position: "relative",
          zIndex: 35,
        }}
      >
        {/* Toolbar */}
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          {/* Toolbar: Drawing nav + zoom + scale + tools */}
          <div style={{ padding: "6px 10px", display: "flex", gap: 6, alignItems: "center", overflow: "hidden" }}>
            {/* Drawing controls — hidden in estimate mode */}
            {tkPanelTier !== "estimate" && (
              <>
                {/* Tools now live as individual buttons in the vertical rail */}
                <button
                  className="icon-btn"
                  title="Previous"
                  onClick={() => {
                    const idx = drawings.findIndex(d => d.id === selectedDrawingId);
                    if (idx > 0) {
                      setSelectedDrawingId(drawings[idx - 1].id);
                      if (drawings[idx - 1].type === "pdf" && drawings[idx - 1].data) renderPdfPage(drawings[idx - 1]);
                    }
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    border: "none",
                    background: C.bg2,
                    color: C.textMuted,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  ◀
                </button>
                <div
                  ref={compactStripRef}
                  className="hide-scrollbar"
                  style={{ display: "flex", gap: 4, overflowX: "auto", flex: 1, minWidth: 0, padding: "2px 0" }}
                >
                  {drawings.length === 0 ? (
                    <div style={{ fontSize: 10, color: C.textDim, padding: "4px 8px", fontStyle: "italic" }}>
                      No drawings
                    </div>
                  ) : (
                    drawings.map(d => {
                      const thumb = d.type === "pdf" ? pdfCanvases[d.id] : d.data;
                      const isAct = selectedDrawingId === d.id;
                      const hasMeas = takeoffs.some(to => (to.measurements || []).some(m => m.sheetId === d.id));
                      return (
                        <div
                          key={d.id}
                          data-drawing-id={d.id}
                          className="icon-btn"
                          onClick={() => {
                            setSelectedDrawingId(d.id);
                            if (d.type === "pdf" && d.data) renderPdfPage(d);
                          }}
                          title={`${d.sheetNumber || d.pageNumber || "?"} — ${d.sheetTitle || d.label || ""}`}
                          style={{
                            width: 60,
                            height: 40,
                            flexShrink: 0,
                            borderRadius: 4,
                            overflow: "hidden",
                            cursor: "pointer",
                            position: "relative",
                            border: isAct
                              ? `2px solid ${C.accent}`
                              : hasMeas
                                ? `1.5px solid ${C.accent}60`
                                : `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)"}`,
                            boxShadow: isAct ? `0 0 8px ${C.accent}30` : hasMeas ? `0 0 6px ${C.accent}18` : "none",
                            background: C.bg2,
                          }}
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              style={{ width: "100%", height: "100%", objectFit: "cover", opacity: d.data ? 1 : 0.4 }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 8,
                                color: C.textDim,
                              }}
                            >
                              {d.sheetNumber || "?"}
                            </div>
                          )}
                          {/* Revision badge */}
                          {d.supersedes && (
                            <div
                              style={{
                                position: "absolute",
                                top: 1,
                                right: 1,
                                fontSize: 6,
                                fontWeight: 800,
                                fontFamily: T.font.sans,
                                padding: "0 3px",
                                borderRadius: 3,
                                lineHeight: "12px",
                                background: "#F59E0B",
                                color: "#000",
                              }}
                            >
                              Rev {d.revision || ""}
                            </div>
                          )}
                          {/* Superseded overlay */}
                          {d.superseded && (
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                background: "rgba(0,0,0,0.45)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                pointerEvents: "none",
                              }}
                            >
                              <span style={{ fontSize: 6, color: "#F59E0B", fontWeight: 700, fontFamily: T.font.sans }}>
                                SUPERSEDED
                              </span>
                            </div>
                          )}
                          {/* Takeoff-complete tint overlay */}
                          {hasMeas && !isAct && (
                            <div
                              style={{
                                position: "absolute",
                                inset: 0,
                                background: `${C.accent}18`,
                                pointerEvents: "none",
                              }}
                            />
                          )}
                          <div
                            style={{
                              position: "absolute",
                              bottom: 0,
                              left: 0,
                              right: 0,
                              padding: "0 2px",
                              background: isAct ? `${C.accent}D0` : hasMeas ? `${C.accent}90` : "rgba(0,0,0,0.55)",
                              fontSize: 7,
                              fontWeight: 700,
                              color: "#fff",
                              textAlign: "center",
                              lineHeight: "14px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {d.sheetNumber || d.pageNumber || "?"}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <button
                  className="icon-btn"
                  title="Next"
                  onClick={() => {
                    const idx = drawings.findIndex(d => d.id === selectedDrawingId);
                    if (idx < drawings.length - 1) {
                      setSelectedDrawingId(drawings[idx + 1].id);
                      if (drawings[idx + 1].type === "pdf" && drawings[idx + 1].data) renderPdfPage(drawings[idx + 1]);
                    }
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    border: "none",
                    background: C.bg2,
                    color: C.textMuted,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  ▶
                </button>
                <div
                  style={{
                    display: "flex",
                    gap: 2,
                    alignItems: "center",
                    borderLeft: `1px solid ${C.border}`,
                    paddingLeft: 6,
                    flexShrink: 0,
                  }}
                >
                  <button
                    onClick={() => setTkZoom(Math.max(25, tkZoom - 25))}
                    style={{
                      width: 22,
                      height: 22,
                      border: "none",
                      background: C.bg2,
                      color: C.textMuted,
                      borderRadius: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    −
                  </button>
                  <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600, width: 32, textAlign: "center" }}>
                    {tkZoom}%
                  </span>
                  <button
                    onClick={() => setTkZoom(Math.min(400, tkZoom + 25))}
                    style={{
                      width: 22,
                      height: 22,
                      border: "none",
                      background: C.bg2,
                      color: C.textMuted,
                      borderRadius: 3,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    +
                  </button>
                  <button
                    onClick={() => {
                      setTkZoom(100);
                      setTkPan({ x: 0, y: 0 });
                    }}
                    style={{
                      padding: "2px 6px",
                      border: "none",
                      background: C.bg2,
                      color: C.textDim,
                      borderRadius: 3,
                      cursor: "pointer",
                      fontSize: 8,
                      fontWeight: 600,
                    }}
                  >
                    Fit
                  </button>
                </div>
                {/* Scale dropdown */}
                {selectedDrawing && (
                  <>
                    <div style={{ width: 1, height: 20, background: C.border, margin: "0 2px" }} />
                    <span style={{ fontWeight: 600, color: C.textDim, fontSize: 9 }}>Scale:</span>
                    <select
                      value={drawingScales[selectedDrawingId] || ""}
                      onChange={e => {
                        if (e.target.value === "custom") {
                          setTkTool("calibrate");
                          setTkActivePoints([]);
                          setTkMeasureState("idle");
                          setDrawingScales({ ...drawingScales, [selectedDrawingId]: "custom" });
                        } else {
                          setDrawingScales({ ...drawingScales, [selectedDrawingId]: e.target.value });
                        }
                      }}
                      style={inp(C, { width: 120, padding: "3px 6px", fontSize: 9 })}
                    >
                      <option value="">Not Set</option>
                      <optgroup label="Architectural">
                        <option value="full">1"=1' (Full)</option>
                        <option value="half">1/2"=1'</option>
                        <option value="3-8">3/8"=1'</option>
                        <option value="quarter">1/4"=1'</option>
                        <option value="3-16">3/16"=1'</option>
                        <option value="eighth">1/8"=1'</option>
                        <option value="3-32">3/32"=1'</option>
                        <option value="sixteenth">1/16"=1'</option>
                      </optgroup>
                      <optgroup label="Engineering">
                        <option value="eng10">1"=10'</option>
                        <option value="eng20">1"=20'</option>
                        <option value="eng30">1"=30'</option>
                        <option value="eng40">1"=40'</option>
                        <option value="eng50">1"=50'</option>
                        <option value="eng100">1"=100'</option>
                      </optgroup>
                      <optgroup label="Metric">
                        <option value="1:1">1:1</option>
                        <option value="1:5">1:5</option>
                        <option value="1:10">1:10</option>
                        <option value="1:20">1:20</option>
                        <option value="1:50">1:50</option>
                        <option value="1:100">1:100</option>
                        <option value="1:200">1:200</option>
                        <option value="1:500">1:500</option>
                      </optgroup>
                      <optgroup label="─────────">
                        <option value="custom">Custom (Calibrate)</option>
                      </optgroup>
                    </select>
                    {drawingScales[selectedDrawingId] && drawingScales[selectedDrawingId] !== "custom" && (
                      <span style={{ color: C.accent, fontWeight: 600, fontSize: 8 }}>✓</span>
                    )}
                    {drawingScales[selectedDrawingId] === "custom" && tkCalibrations[selectedDrawingId] && (
                      <span style={{ color: C.green, fontWeight: 600, fontSize: 8 }}>✓ Cal</span>
                    )}
                    {!drawingScales[selectedDrawingId] && !tkCalibrations[selectedDrawingId] && (
                      <span style={{ fontSize: 7, color: C.orange, fontWeight: 500 }} title="No scale set">
                        ⚠ No scale
                      </span>
                    )}
                  </>
                )}
                {/* Scan References button */}
                {selectedDrawing && (
                  <>
                    <div style={{ width: 1, height: 20, background: C.border, margin: "0 2px" }} />
                    <button
                      onClick={() => handleScanReferences()}
                      disabled={!!refScanLoading}
                      title="AI detects section/elevation/detail callout symbols"
                      style={{
                        padding: "3px 8px",
                        fontSize: 9,
                        fontWeight: 600,
                        border: `1px solid ${C.accent}40`,
                        background: `${C.accent}10`,
                        color: refScanLoading ? C.textDim : C.accent,
                        borderRadius: 4,
                        cursor: refScanLoading ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Ic d={I.search} size={9} color={refScanLoading ? C.textDim : C.accent} />
                      {refScanLoading === selectedDrawingId ? "Scanning..." : "Scan Refs"}
                      {detectedReferences[selectedDrawingId]?.length > 0 && !refScanLoading && (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            background: C.accent,
                            color: "#fff",
                            borderRadius: 99,
                            padding: "0 4px",
                            minWidth: 14,
                            textAlign: "center",
                          }}
                        >
                          {detectedReferences[selectedDrawingId].length}
                        </span>
                      )}
                    </button>
                  </>
                )}
                {/* Undo last point button — visible during active measurement */}
                {tkActivePoints.length > 0 && (
                  <button
                    className="icon-btn"
                    onClick={() => setTkActivePoints(tkActivePoints.slice(0, -1))}
                    title="Undo last point (removes the most recent click)"
                    style={{
                      width: 24,
                      height: 24,
                      border: `1px solid ${C.border}`,
                      background: C.bg2,
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={C.textMuted}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 4v6h6 M3.51 15a9 9 0 105.64-12.36L1 10" />
                    </svg>
                  </button>
                )}
                {/* Tools folder moved to left side of toolbar */}
                {/* Settings gear removed */}
              </>
            )}
            {/* ── Running estimate total — always visible ── */}
            {(() => {
              const totals = getTotals();
              const grand = nn(totals.grand);
              if (grand <= 0) return null;
              return (
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    paddingLeft: 8,
                    borderLeft: `1px solid ${C.border}`,
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 8, fontWeight: 600, color: C.textDim, letterSpacing: "0.04em" }}>EST</span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: C.accent,
                      fontVariantNumeric: "tabular-nums",
                      animation: "subtlePulse 3s ease-in-out infinite",
                    }}
                  >
                    {fmt(grand)}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── Estimate mode: render full EstimatePage ── */}
        {tkPanelTier === "estimate" && (
          <div style={{ flex: 1, overflow: "auto" }}>
            <Suspense fallback={<div style={{ padding: 40, color: C.textMuted }}>Loading estimate...</div>}>
              <EstimatePage />
            </Suspense>
          </div>
        )}

        {/* ── Unified Measurement HUD (hidden in estimate mode) ── */}
        {tkPanelTier !== "estimate" && (
          <MeasurementHUD
            selectedDrawing={selectedDrawing}
            stopMeasuring={stopMeasuring}
            finishCalibration={finishCalibration}
            addMeasurement={addMeasurement}
            leftPanelTab={leftPanelTab}
            setLeftPanelTab={setLeftPanelTab}
          />
        )}

        {/* ── Drawing-only content (hidden in estimate mode) ── */}
        {tkPanelTier !== "estimate" && (
          <>
            {/* Scale-not-set banner */}
            <ScaleNotSetBanner selectedDrawingId={selectedDrawingId} hasScale={hasScale} tkMeasureState={tkMeasureState} drawingScales={drawingScales} setDrawingScales={setDrawingScales} setTkTool={setTkTool} setTkActivePoints={setTkActivePoints} setTkMeasureState={setTkMeasureState} />

            {/* AI Drawing Analysis Results */}
            <DrawingAnalysisPanel aiDrawingAnalysis={aiDrawingAnalysis} setAiDrawingAnalysis={setAiDrawingAnalysis} acceptAllDrawingItems={acceptAllDrawingItems} acceptDrawingItem={acceptDrawingItem} />

            {/* AI Wall Schedule Preview Modal */}
            <WallScheduleModal wallSchedule={wallSchedule} setWallSchedule={setWallSchedule} createWallInstances={createWallInstances} />

            {/* PDF Schedule Scan Results Modal */}
            <PdfScheduleModal pdfSchedules={pdfSchedules} setPdfSchedules={setPdfSchedules} />

            {/* Drawing display area */}
            <div
              ref={drawingContainerRef}
              onMouseDown={handleDrawingMouseDown}
              onContextMenu={e => e.preventDefault()}
              style={{
                flex: 1,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: C.isDark ? "#1a1d24" : "#e5e7eb",
                position: "relative",
              }}
            >
              {!selectedDrawing ? (
                <DrawingEmptyState drawings={drawings} pdfCanvases={pdfCanvases} setSelectedDrawingId={setSelectedDrawingId} renderPdfPage={renderPdfPage} />
              ) : !selectedDrawing.data ? (
                <div style={{ color: C.orange, fontSize: 12, textAlign: "center", padding: 20 }}>
                  <Ic d={I.upload} size={24} color={C.orange} />
                  <br />
                  <span style={{ marginTop: 6, display: "block" }}>File needs re-upload</span>
                  <span style={{ fontSize: 10, color: C.textDim }}>
                    Drawing data is not stored between sessions.
                    <br />
                    Go to <strong>Discovery</strong> to re-attach the file.
                  </span>
                </div>
              ) : (
                <div
                  ref={tkTransformRef}
                  style={{
                    transform: `translate(${tkPan.x}px,${tkPan.y}px) scale(${tkZoom / 100})`,
                    transformOrigin: "0 0",
                    position: "relative",
                  }}
                >
                  {selectedDrawing.type === "image" ? (
                    <img
                      ref={drawingImgRef}
                      src={selectedDrawing.data}
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                      onLoad={e => {
                        const w = e.target.naturalWidth,
                          h = e.target.naturalHeight;
                        if (canvasRef.current) {
                          canvasRef.current.width = w;
                          canvasRef.current.height = h;
                        }
                        if (cursorCanvasRef.current) {
                          cursorCanvasRef.current.width = w;
                          cursorCanvasRef.current.height = h;
                        }
                        if (predictionCanvasRef.current) {
                          predictionCanvasRef.current.width = w;
                          predictionCanvasRef.current.height = h;
                        }
                      }}
                    />
                  ) : pdfCanvases[selectedDrawing.id] ? (
                    <img
                      ref={drawingImgRef}
                      src={pdfCanvases[selectedDrawing.id]}
                      style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                      onLoad={e => {
                        const w = e.target.naturalWidth,
                          h = e.target.naturalHeight;
                        if (canvasRef.current) {
                          canvasRef.current.width = w;
                          canvasRef.current.height = h;
                        }
                        if (cursorCanvasRef.current) {
                          cursorCanvasRef.current.width = w;
                          cursorCanvasRef.current.height = h;
                        }
                        if (predictionCanvasRef.current) {
                          predictionCanvasRef.current.width = w;
                          predictionCanvasRef.current.height = h;
                        }
                      }}
                    />
                  ) : (
                    <div style={{ color: C.textDim, fontSize: 11 }}>Loading PDF page...</div>
                  )}
                  {/* Canvas overlay */}
                  <canvas
                    ref={canvasRef}
                    className={`tk-canvas-cursor${tkMeasureState === "measuring" || tkActiveTakeoffId ? " tk-measuring" : ""}`}
                    onDrop={handlePdfRepairDrop}
                    onDragOver={e => e.preventDefault()}
                    onClick={handleCanvasClick}
                    onMouseMove={e => {
                      const rect = e.target.getBoundingClientRect();
                      const sx = (canvasRef.current?.width || 1) / rect.width;
                      const sy = (canvasRef.current?.height || 1) / rect.height;
                      const pt = { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };

                      // Idle/stopped: show pointer cursor when hovering over clickable measurements
                      if (tkMeasureState !== "measuring" && tkMeasureState !== "paused") {
                        const zs = Math.max(1, sx);
                        const cr = Math.max(30, 30 * zs),
                          lr = Math.max(12, 15 * zs);
                        let hovering = false;
                        for (const to of useTakeoffsStore.getState().takeoffs) {
                          for (const m of to.measurements || []) {
                            if (m.sheetId !== selectedDrawingId) continue;
                            if (m.type === "count") {
                              if (Math.sqrt((pt.x - m.points[0].x) ** 2 + (pt.y - m.points[0].y) ** 2) < cr)
                                hovering = true;
                            } else if (m.type === "linear" && m.points.length >= 2) {
                              for (let i = 0; i < m.points.length - 1; i++) {
                                const a = m.points[i],
                                  b = m.points[i + 1];
                                const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
                                if (len < 1) continue;
                                const t2 = Math.max(
                                  0,
                                  Math.min(1, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (len * len)),
                                );
                                const proj = { x: a.x + t2 * (b.x - a.x), y: a.y + t2 * (b.y - a.y) };
                                if (Math.sqrt((pt.x - proj.x) ** 2 + (pt.y - proj.y) ** 2) < lr) hovering = true;
                              }
                            } else if (m.type === "area" && m.points.length >= 3) {
                              let inside = false;
                              const pts2 = m.points;
                              for (let i = 0, j = pts2.length - 1; i < pts2.length; j = i++) {
                                const xi = pts2[i].x,
                                  yi = pts2[i].y,
                                  xj = pts2[j].x,
                                  yj = pts2[j].y;
                                if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
                                  inside = !inside;
                              }
                              if (inside) hovering = true;
                            }
                            if (hovering) break;
                          }
                          if (hovering) break;
                        }
                        // Idle — NovaCursor teal orb handles cursor display
                        return;
                      }

                      // Measuring: update cursor position for live preview (RAF throttled)
                      if (tkActivePoints.length === 0) return;
                      let snapped = pt;
                      if ((e.shiftKey || snapAngleOnRef.current) && tkActivePoints.length >= 1) {
                        snapped = snapAngle(tkActivePoints[tkActivePoints.length - 1], pt);
                      }
                      shiftHeldRef.current = e.shiftKey || snapAngleOnRef.current;
                      pendingCursorRef.current = snapped;
                      if (!rafCursorRef.current) {
                        rafCursorRef.current = requestAnimationFrame(() => {
                          rafCursorRef.current = null;
                          if (pendingCursorRef.current) setTkCursorPt(pendingCursorRef.current);
                        });
                      }
                    }}
                    onMouseLeave={() => setTkCursorPt(null)}
                    onMouseDown={e => {
                      if (e.button === 2 || e.button === 1) handleDrawingMouseDown(e);
                    }}
                    onContextMenu={e => e.preventDefault()}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "auto",
                    }}
                  />
                  {/* Prediction ghost overlay canvas — animated ghost markers */}
                  <canvas
                    ref={predictionCanvasRef}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  />
                  {/* Cursor overlay canvas — lightweight layer for cursor-dependent rendering */}
                  <canvas
                    ref={cursorCanvasRef}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  />
                  {/* ── Vector Scan Results Panel ── */}
                  {geoAnalysis.results && (
                    <VectorScanResults
                      result={geoAnalysis.results}
                      onClose={() => setGeoAnalysis({ loading: false, results: null })}
                      scalePxPerFt={selectedDrawingId ? (drawingScales[selectedDrawingId] || 1) : 1}
                    />
                  )}
                  {/* ── Sheet Reference Badges ── */}
                  <SheetReferenceBadges selectedDrawingId={selectedDrawingId} detectedReferences={detectedReferences} setRefPopover={setRefPopover} refPopover={refPopover} />
                </div>
              )}

              {/* Reference click popover */}
              <RefClickPopover refPopover={refPopover} setRefPopover={setRefPopover} setSelectedDrawingId={setSelectedDrawingId} setDetailOverlayId={setDetailOverlayId} />

              {/* Detail Overlay — floating resizable panel showing referenced drawing */}
              {detailOverlayId && (
                <DetailOverlay drawingId={detailOverlayId} onClose={() => setDetailOverlayId(null)} />
              )}

              {/* Floating specs card — shows when measuring OR when module is active */}
              <FloatingSpecsCard detectedReferences={detectedReferences} setDetailOverlayId={setDetailOverlayId} />

              {/* (Prediction approval strip moved to unified HUD above toolbar) */}

              {/* Cross-sheet scan results bar */}
              <CrossSheetScanBar crossSheetScan={crossSheetScan} setCrossSheetScan={setCrossSheetScan} selectedDrawingId={selectedDrawingId} setSelectedDrawingId={setSelectedDrawingId} drawings={drawings} renderPdfPage={renderPdfPage} />

              {/* Right-click context menu — available in any mode */}
              <TakeoffContextMenu
                addMeasurement={addMeasurement}
                pauseMeasuring={pauseMeasuring}
                stopMeasuring={stopMeasuring}
                snapAngleOn={snapAngleOn}
                setSnapAngleOn={setSnapAngleOn}
                showMeasureLabels={showMeasureLabels}
                setShowMeasureLabels={setShowMeasureLabels}
                removeTakeoff={removeTakeoff}
              />
            </div>
          </>
        )}
      </div>

      {/* NOVA panel now lives in the left panel tabs — no longer rendered as right panel */}

      {/* Takeoff Command Palette (Cmd+K) */}
      <TakeoffCommandPalette
        open={tkCmdOpen}
        onClose={() => setTkCmdOpen(false)}
        takeoffs={takeoffs}
        drawings={drawings}
        onSelectTool={setTkTool}
        onSelectDrawing={handleSelectDrawing}
        onStartMeasuring={engageMeasuring}
        onRunAnalysis={runDrawingAnalysis}
        onRunSchedules={runPdfScheduleScan}
        onRunGeometry={runGeometryAnalysis}
        onAutoCount={() => setTkAutoCount({ phase: "select" })}
        getMeasuredQty={getMeasuredQty}
      />
    </div>
  );
}
