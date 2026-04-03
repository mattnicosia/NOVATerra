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
import ScaleNotSetBanner from "@/components/takeoffs/ScaleNotSetBanner";
import FloatingSpecsCard from "@/components/takeoffs/FloatingSpecsCard";
import SheetReferenceBadges from "@/components/takeoffs/SheetReferenceBadges";
import RefClickPopover from "@/components/takeoffs/RefClickPopover";
import MeasurementHUD from "@/components/takeoffs/MeasurementHUD";
import { extractPageData, isExtracted, detectMarkersFromText } from "@/utils/pdfExtractor";
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
  const predictionCanvasRef = useRef(null); // overlay for ghost predictions
  const tkTransformRef = useRef(null); // ref for transform div (zoom-to-cursor offset)
  const predScanAnimRef = useRef(null); // RAF handle for scan wave animation
  const predScanPhaseRef = useRef(0); // animation phase (0–1, repeating pulse)
  const predScanGenRef = useRef(0); // generation counter — prevents stale async results
  const predScanKeyRef = useRef(""); // tracks which takeoff+drawing combo is being scanned
  const snapAngleOnRef = useRef(false); // snap angle toggle (persistent, not keyboard-dependent)

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
  // Panel mode: "auto" = collapse on measure/reopen on stop, "open" = always open, "closed" = always closed
  const [tkPanelMode, _setTkPanelMode] = useState("open");
  // Left panel tab: matches EstimatePage tabs (estimate | scenarios | notes | rfis)
  const [leftPanelTab, setLeftPanelTab] = useState("estimate");

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

  // Takeoff group collapse state
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const toggleGroupCollapse = group => setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));

  // AI item lookup state for search dropdown
  // null = idle, "loading" = waiting for AI, { result } = AI returned data, { error } = AI failed
  const [aiLookup, setAiLookup] = useState(null);

  // Cross-sheet scan results
  const [crossSheetScan, setCrossSheetScan] = useState(null); // { tag, results: [{drawingId, sheetNumber, instanceCount}], scanning }

  // NOVA Chat state now managed internally by TakeoffNOVAPanel

  // + button mini-menu state
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef(null);
  const [actionMenuId, setActionMenuId] = useState(null); // which takeoff row's "more" menu is open
  const [actionConfirm, setActionConfirm] = useState(null); // "delete" | "clear" — two-step confirm
  const [actionMenuPos, setActionMenuPos] = useState(null); // { top, right } for fixed positioning
  const actionMenuRef = useRef(null);

  // Close plus menu on outside click
  useEffect(() => {
    if (!plusMenuOpen) return;
    const handler = e => {
      if (plusMenuOpen && plusMenuRef.current && !plusMenuRef.current.contains(e.target)) setPlusMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [plusMenuOpen]);

  // Close action menu on outside click
  useEffect(() => {
    if (!actionMenuId) return;
    const handler = e => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target)) {
        setActionMenuId(null);
        setActionConfirm(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [actionMenuId]);

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

  // ─── AI ITEM LOOKUP (NOVA) — manual trigger only ─────────────

  const lookupItemWithNova = async inputText => {
    if (!inputText?.trim()) return;
    const key = inputText.toLowerCase().trim().replace(/\s+/g, " ");

    // 1. Check session cache — instant hit
    const cached = _novaCache.get(key);
    if (cached?.result) {
      setAiLookup({ result: cached.result });
      return;
    }

    // 2. Fresh API call
    setAiLookup("loading");
    const userMsg = buildNovaUserMsg(inputText, project);
    try {
      const text = await callAnthropic({
        max_tokens: 1200,
        messages: [{ role: "user", content: userMsg }],
        system: NOVA_SYSTEM_PROMPT,
        temperature: 0.3,
      });
      const { result, error } = parseNovaResponse(text);
      if (result) {
        _novaCache.set(key, { result, timestamp: Date.now() });
        _novaCacheEvict();
        setAiLookup({ result });
      } else {
        setAiLookup({ error: error || "NOVA couldn't identify this item" });
      }
    } catch (err) {
      console.error("[NOVA Lookup] Error:", err);
      setAiLookup({ error: err.message || "AI lookup failed" });
    }
  };

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
    setAiLookup(null);
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
    setAiLookup(null);
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

  // Panel resize with snap tiers
  const TIER_SNAPS = [
    { name: "compact", target: 350, min: 280, max: 420 },
    { name: "standard", target: 550, min: 421, max: 700 },
    { name: "full", target: 900, min: 701, max: 1000 },
  ];
  const SNAP_MAGNETIC = 30;
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const isLargeScreen = typeof window !== "undefined" && window.innerWidth >= 1200;
  const maxPanelWidth = isLargeScreen ? 1000 : 420;

  const startTkDrag = useCallback(
    e => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = tkPanelWidth;
      setIsDraggingPanel(true);
      const onMove = ev => {
        let w = Math.max(280, Math.min(maxPanelWidth, startW + (ev.clientX - startX)));
        // Magnetic snap to tier targets on large screens
        if (isLargeScreen) {
          for (const tier of TIER_SNAPS) {
            if (Math.abs(w - tier.target) < SNAP_MAGNETIC) {
              w = tier.target;
              break;
            }
          }
        }
        setTkPanelWidth(w);
        const tierName = w <= 420 ? "compact" : w <= 700 ? "standard" : "full";
        if (tierName !== useTakeoffsStore.getState().tkPanelTier) {
          useTakeoffsStore.getState().setTkPanelTier(tierName);
        }
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setIsDraggingPanel(false);
        const finalW = useTakeoffsStore.getState().tkPanelWidth;
        sessionStorage.setItem("bldg-tkPanelWidth", String(finalW));
        sessionStorage.setItem("bldg-tkPanelTier", useTakeoffsStore.getState().tkPanelTier);
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TIER_SNAPS is a stable constant defined in render scope
    [tkPanelWidth, setTkPanelWidth, maxPanelWidth, isLargeScreen],
  );

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
      setAiLookup(null);
      return;
    }
    setAiLookup(null); // Reset AI lookup when input changes

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

      // Advance scan wave phase (0→1 over 2 seconds, repeating)
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
            ctx.fillText("✦", sz * 0.5 + 2, -sz * 0.5 - 2);
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
          // Ghost area polygon — semi-transparent fill with dashed border
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
  }, [tkPredictions, tkPredAccepted, tkPredRejected, tkActiveTakeoffId, takeoffs, tkPredContext, tkPredRefining]);

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

      {/* LEFT PANEL — Takeoffs drawer (overlay, hidden in estimate mode) */}
      {tkPanelOpen && tkPanelTier !== "estimate" && (
        <div
          onClick={() => {
            setTkPanelOpen(false);
            // Auto-engage selected takeoff so next canvas click places a measurement
            const sel = useTakeoffsStore.getState().tkSelectedTakeoffId;
            const ms = useTakeoffsStore.getState().tkMeasureState;
            if (sel && ms === "idle") engageMeasuring(sel);
          }}
          style={{
            position: "absolute",
            top: 0,
            left: RAIL_W,
            right: 0,
            bottom: 0,
            background: C.isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.15)",
            zIndex: 30,
            animation: "fadeIn 0.15s ease-out",
          }}
        />
      )}
      {tkPanelOpen && tkPanelTier !== "estimate" && (
        <div
          style={{
            position: "absolute",
            left: RAIL_W,
            top: 0,
            bottom: 0,
            width: tkPanelWidth,
            minWidth: 280,
            maxWidth: maxPanelWidth,
            background: C.bg1,
            borderRadius: "6px 0 0 6px",
            border: `1px solid ${C.border}`,
            borderRight: `1px solid ${C.border}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            flexShrink: 0,
            zIndex: 31,
            boxShadow: "4px 0 24px rgba(0,0,0,0.15)",
            animation: isDraggingPanel ? "none" : "slideInLeft 0.2s ease-out",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              borderBottom: `1px solid ${C.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* Panel mode tabs: Est | Scen | Notes | RFIs | NOVA */}
            {(() => {
              const allTabs = [
                { key: "estimate", label: "Est", icon: I.ruler },
                { key: "discovery", label: "Discovery", icon: I.search || I.scan || I.ai },
                { key: "scenarios", label: "Scenarios", icon: I.layers },
                { key: "notes", label: "Notes", icon: I.report },
                { key: "rfis", label: "RFIs", icon: I.send },
                { key: "nova", label: "NOVA", icon: I.ai },
              ];
              const isEstimateTier = tkPanelTier === "estimate";
              const row1 = isEstimateTier ? allTabs.slice(0, 3) : allTabs;
              const row2 = isEstimateTier ? [allTabs[4], allTabs[3]] : []; // NOVA first, then RFIs

              const renderTab = t => {
                const isActive = leftPanelTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => {
                      setLeftPanelTab(t.key);
                      setShowNotesPanel(t.key === "notes");
                    }}
                    style={{
                      padding: isEstimateTier ? "3px 10px" : "3px 8px",
                      fontSize: 10,
                      fontWeight: 600,
                      background: isActive
                        ? t.key === "nova"
                          ? "linear-gradient(135deg, #7C5CFC, #6D28D9)"
                          : C.accent
                        : "transparent",
                      color: isActive ? "#fff" : C.textDim,
                      border: isActive ? "none" : `1px solid ${C.border}`,
                      borderRadius: 999,
                      cursor: "pointer",
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Ic d={t.icon} size={11} color={isActive ? "#fff" : C.textDim} /> {t.label}
                  </button>
                );
              };

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>{row1.map(renderTab)}</div>
                  {row2.length > 0 && <div style={{ display: "flex", gap: 2 }}>{row2.map(renderTab)}</div>}
                </div>
              );
            })()}
            {/* Takeoffs sub-filters (only when Estimate tab active) */}
            {leftPanelTab === "estimate" && (
              <div style={{ display: "flex", gap: 2, background: C.bg2, borderRadius: 4, padding: 2 }}>
                <button
                  onClick={() => {
                    setPageFilter("all");
                    if (tkVisibility === "page") setTkVisibility("all");
                  }}
                  style={{
                    padding: "2px 8px",
                    fontSize: 9,
                    fontWeight: 600,
                    background: pageFilter === "all" ? C.accent : "transparent",
                    color: pageFilter === "all" ? "#fff" : C.textDim,
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  All
                </button>
                <button
                  onClick={() => {
                    setPageFilter("page");
                    setTkVisibility("page");
                  }}
                  style={{
                    padding: "2px 8px",
                    fontSize: 9,
                    fontWeight: 600,
                    background: pageFilter === "page" ? C.accent : "transparent",
                    color: pageFilter === "page" ? "#fff" : C.textDim,
                    border: "none",
                    borderRadius: 3,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  This Page{pageFilter === "page" ? ` (${filteredTakeoffs.length})` : ""}
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {/* Tier cycling button is now in the toolbar above */}
              {leftPanelTab === "estimate" && (
                <button
                  className="icon-btn"
                  onClick={() => {
                    const next = { all: "page", page: "active", active: "all" };
                    const nv = next[tkVisibility] || "all";
                    setTkVisibility(nv);
                    if (nv === "page") {
                      setPageFilter("page");
                      setActiveModule(null);
                    } else if (tkVisibility === "page") {
                      setPageFilter("all");
                    }
                  }}
                  title={
                    tkVisibility === "all"
                      ? "Showing all takeoffs"
                      : tkVisibility === "page"
                        ? "This page only"
                        : "Selected takeoff only"
                  }
                  style={{
                    width: 22,
                    height: 22,
                    border: `1px solid ${tkVisibility === "active" || tkVisibility === "page" ? C.accent + "60" : C.border}`,
                    background:
                      tkVisibility === "page"
                        ? C.accent + "18"
                        : tkVisibility === "active"
                          ? C.accent + "12"
                          : "transparent",
                    color: tkVisibility === "page" ? C.accent : tkVisibility === "active" ? C.accent : C.textDim,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {tkVisibility === "active" && (
                    <span
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: C.accent,
                        color: "#fff",
                        fontSize: 8,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: 1,
                      }}
                    >
                      1
                    </span>
                  )}
                  {tkVisibility === "page" && (
                    <span
                      style={{
                        position: "absolute",
                        top: -4,
                        right: -4,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: C.accent,
                        color: "#fff",
                        fontSize: 7,
                        fontWeight: 700,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: 1,
                      }}
                    >
                      P
                    </span>
                  )}
                </button>
              )}
              {/* Close panel chevron */}
              <button
                className="icon-btn"
                onClick={() => setTkPanelOpen(false)}
                title="Close panel"
                style={{
                  width: 22,
                  height: 22,
                  border: "none",
                  background: C.bg2,
                  color: C.textDim,
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 1L2 5l4 4" />
                </svg>
              </button>
            </div>
          </div>

          {(() => {
            // Non-estimate tabs: in "full" tier, render in left column only (keep estimate grid on right).
            // In standard/compact, render full width since there's no split.
            const isNonEstTab = leftPanelTab !== "estimate";
            const isFull = tkPanelTier === "full";
            const tabContent = isNonEstTab ? (
              leftPanelTab === "notes" ? (
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <NotesPanel inline />
                </div>
              ) : leftPanelTab === "scenarios" ? (
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <ScenariosPanel />
                </div>
              ) : leftPanelTab === "rfis" ? (
                <div style={{ flex: 1, overflowY: "auto" }}>
                  <RFIPanel />
                </div>
              ) : leftPanelTab === "discovery" ? (
                <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
                  <Suspense fallback={<div style={{ padding: 16, color: C.textDim, fontSize: 12 }}>Loading...</div>}>
                    <DiscoveryPanel
                      context="takeoffs"
                      onNavigateToSheet={drawingId => {
                        useDrawingsStore.getState().setSelectedDrawingId(drawingId);
                      }}
                    />
                  </Suspense>
                </div>
              ) : leftPanelTab === "nova" ? (
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <TakeoffNOVAPanel
                    aiDrawingAnalysis={aiDrawingAnalysis}
                    pdfSchedules={pdfSchedules}
                    runDrawingAnalysis={runDrawingAnalysis}
                    runPdfScheduleScan={runPdfScheduleScan}
                    crossSheetScan={crossSheetScan}
                    setCrossSheetScan={setCrossSheetScan}
                    context={tkPanelTier === "full" || tkPanelTier === "estimate" ? "estimate" : "takeoff"}
                  />
                </div>
              ) : null
            ) : null;

            // Non-estimate tab WITHOUT full tier → take full panel (no split)
            if (isNonEstTab && !isFull) return tabContent;

            // Non-estimate tab WITH full tier → render in left column of split
            // OR estimate tab → render takeoff list in left column of split
            return (
              <>
                {/* Full tier: split layout with estimate grid on right */}
                <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
                  {/* Left column: takeoff list OR tab content (full width in compact/standard, fixed 350px in full) */}
                  {isNonEstTab && isFull ? (
                    <div
                      style={{
                        width: 350,
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        borderRight: `1px solid ${C.border}`,
                      }}
                    >
                      {tabContent}
                    </div>
                  ) : (
                    <div
                      style={{
                        width: tkPanelTier === "full" ? 350 : "100%",
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        borderRight: tkPanelTier === "full" ? `1px solid ${C.border}` : "none",
                      }}
                    >
                      {/* Search bar */}
                      <div
                        style={{
                          padding: "6px 10px",
                          borderBottom: `1px solid ${C.border}`,
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                          position: "relative",
                        }}
                      >
                        <div style={{ position: "relative", flex: 1 }}>
                          <input
                            value={tkNewInput}
                            onChange={e => setTkNewInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter" && tkNewInput.trim()) {
                                // Smart Enter: NOVA single → add AI-priced, DB match → add first hit, else freeform
                                if (aiLookup?.result?.type === "single") {
                                  addTakeoffFromAI(aiLookup.result);
                                } else if (aiLookup?.result?.type === "multi") {
                                  insertAIGroupIntoTakeoffs(aiLookup.result);
                                } else if (tkDbResults.length > 0 && tkDbResults[0]._type === "item") {
                                  addTakeoffFromDb(tkDbResults[0]);
                                } else if (tkDbResults.length > 0 && tkDbResults[0]._type === "assembly") {
                                  insertAssemblyIntoTakeoffs(tkDbResults[0]);
                                } else {
                                  addTakeoffFreeform(tkNewInput);
                                }
                              }
                            }}
                            placeholder="Search or type item · Enter ⏎ to add · Tab ↹ navigate"
                            style={inp(C, { paddingLeft: 28, fontSize: 11, padding: "7px 10px 7px 28px" })}
                          />
                          <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>
                            <Ic d={I.search} size={12} color={C.textDim} />
                          </div>
                        </div>
                        <select
                          value={tkNewUnit}
                          onChange={e => setTkNewUnit(e.target.value)}
                          title="Measurement type"
                          style={inp(C, {
                            width: 56,
                            padding: "5px 2px",
                            fontSize: 9,
                            fontWeight: 600,
                            textAlign: "center",
                            flexShrink: 0,
                            color: ["EA", "SET", "PAIR"].includes(tkNewUnit)
                              ? C.green
                              : ["LF", "VLF"].includes(tkNewUnit)
                                ? C.blue
                                : C.accent,
                            background: C.bg2,
                          })}
                        >
                          <optgroup label="Count">
                            <option value="EA">EA</option>
                          </optgroup>
                          <optgroup label="Linear">
                            <option value="LF">LF</option>
                          </optgroup>
                          <optgroup label="Area">
                            <option value="SF">SF</option>
                            <option value="SY">SY</option>
                          </optgroup>
                          <optgroup label="Volume">
                            <option value="CY">CY</option>
                            <option value="CF">CF</option>
                          </optgroup>
                          <optgroup label="Other">
                            <option value="LS">LS</option>
                            <option value="HR">HR</option>
                          </optgroup>
                        </select>
                        <div ref={plusMenuRef} style={{ position: "relative", flexShrink: 0 }}>
                          <button
                            className="accent-btn"
                            onClick={() => {
                              if (tkNewInput.trim()) setPlusMenuOpen(v => !v);
                            }}
                            disabled={!tkNewInput.trim()}
                            title="Add item"
                            style={bt(C, {
                              background: tkNewInput.trim() ? C.accent : C.bg3,
                              color: tkNewInput.trim() ? "#fff" : C.textDim,
                              padding: "5px 8px",
                            })}
                          >
                            <Ic d={I.plus} size={12} color={tkNewInput.trim() ? "#fff" : C.textDim} sw={2.5} />
                          </button>
                          {plusMenuOpen && tkNewInput.trim() && (
                            <div
                              style={{
                                position: "absolute",
                                right: 0,
                                top: "calc(100% + 4px)",
                                zIndex: 60,
                                background: C.bg1,
                                border: `1px solid ${C.border}`,
                                borderRadius: 8,
                                boxShadow: "0 4px 20px rgba(0,0,0,0.30)",
                                minWidth: 210,
                                overflow: "hidden",
                              }}
                            >
                              <div
                                className="nav-item"
                                onClick={() => {
                                  addTakeoffFreeform(tkNewInput);
                                  setPlusMenuOpen(false);
                                }}
                                style={{
                                  padding: "8px 12px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  cursor: "pointer",
                                  borderBottom: `1px solid ${C.border}`,
                                }}
                              >
                                <Ic d={I.plus} size={11} color={C.textDim} sw={2} />
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Add as freeform</div>
                                  <div style={{ fontSize: 9, color: C.textDim }}>No pricing — measure only</div>
                                </div>
                              </div>
                              <div
                                className="nav-item"
                                onClick={() => {
                                  lookupItemWithNova(tkNewInput);
                                  setPlusMenuOpen(false);
                                }}
                                style={{
                                  padding: "8px 12px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  cursor: "pointer",
                                }}
                              >
                                <Ic d={I.ai} size={11} color={C.accent} />
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>
                                    Ask NOVA to price
                                  </div>
                                  <div style={{ fontSize: 9, color: C.textDim }}>Get code, description & pricing</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        {/* DB + Assembly search dropdown — show when there's input (for freeform/NOVA options) */}
                        {tkNewInput.trim() && (
                          <div
                            style={{
                              position: "absolute",
                              left: 10,
                              right: 10,
                              top: "100%",
                              zIndex: 50,
                              background: C.bg1,
                              border: `1px solid ${C.border}`,
                              borderRadius: "0 0 6px 6px",
                              boxShadow: "0 4px 16px rgba(0,0,0,0.30)",
                              maxHeight: 380,
                              overflowY: "auto",
                            }}
                          >
                            {tkDbResults.some(r => r._type === "assembly") && (
                              <>
                                <div
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: 8,
                                    fontWeight: 600,
                                    color: C.textDim,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.8,
                                    borderBottom: `1px solid ${C.border}`,
                                    background: C.bg2,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <Ic d={I.assembly} size={10} color={C.accent} /> Assemblies
                                </div>
                                {tkDbResults
                                  .filter(r => r._type === "assembly")
                                  .map(asm => {
                                    const totalPer = asm.elements.reduce(
                                      (s, el) => s + (nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor),
                                      0,
                                    );
                                    return (
                                      <div
                                        key={asm.id}
                                        className="nav-item"
                                        onClick={() => insertAssemblyIntoTakeoffs(asm)}
                                        style={{
                                          padding: "6px 10px",
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 8,
                                          borderBottom: `1px solid ${C.bg}`,
                                          cursor: "pointer",
                                        }}
                                      >
                                        <Ic d={I.assembly} size={12} color={C.accent} />
                                        <span
                                          style={{
                                            flex: 1,
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: C.text,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {asm.name}
                                        </span>
                                        <span
                                          style={{
                                            fontSize: 8,
                                            color: C.textMuted,
                                            background: C.bg2,
                                            padding: "1px 6px",
                                            borderRadius: 8,
                                          }}
                                        >
                                          {asm.elements.length} items
                                        </span>
                                        <span
                                          style={{
                                            fontFamily: T.font.sans,
                                            fontSize: 9,
                                            color: C.accent,
                                            fontWeight: 600,
                                          }}
                                        >
                                          {fmt2(totalPer)}
                                        </span>
                                      </div>
                                    );
                                  })}
                              </>
                            )}
                            {tkDbResults.some(r => r._type === "item") && (
                              <>
                                <div
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: 8,
                                    fontWeight: 600,
                                    color: C.textDim,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.8,
                                    borderBottom: `1px solid ${C.border}`,
                                    background: C.bg2,
                                  }}
                                >
                                  Database Items
                                </div>
                                {tkDbResults
                                  .filter(r => r._type === "item")
                                  .map(el => (
                                    <div
                                      key={el.id}
                                      className="nav-item"
                                      onClick={() => addTakeoffFromDb(el)}
                                      style={{
                                        padding: "6px 10px",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        borderBottom: `1px solid ${C.bg}`,
                                        cursor: "pointer",
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontFamily: T.font.sans,
                                          fontSize: 9,
                                          color: C.purple,
                                          fontWeight: 600,
                                          minWidth: 60,
                                        }}
                                      >
                                        {el.code}
                                      </span>
                                      <span
                                        style={{
                                          flex: 1,
                                          fontSize: 11,
                                          color: C.text,
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {el.name}
                                      </span>
                                      <span style={{ fontSize: 9, color: C.textDim }}>/{el.unit}</span>
                                      <span
                                        style={{
                                          fontFamily: T.font.sans,
                                          fontSize: 9,
                                          color: C.accent,
                                          fontWeight: 600,
                                        }}
                                      >
                                        {fmt2(nn(el.material) + nn(el.labor) + nn(el.equipment))}
                                      </span>
                                    </div>
                                  ))}
                              </>
                            )}
                            {/* NOVA AI Results Section */}
                            {aiLookup === "loading" && (
                              <div
                                style={{
                                  padding: "10px 10px",
                                  borderTop: `1px solid ${C.border}`,
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  background: `${C.accent}06`,
                                }}
                              >
                                <span
                                  style={{
                                    width: 14,
                                    height: 14,
                                    border: `2px solid ${C.border}`,
                                    borderTopColor: C.accent,
                                    borderRadius: "50%",
                                    animation: "spin 0.8s linear infinite",
                                    display: "inline-block",
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>
                                  NOVA is thinking...
                                </span>
                              </div>
                            )}
                            {aiLookup?.result?.type === "single" && (
                              <div style={{ borderTop: `1px solid ${C.border}` }}>
                                <div
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: 8,
                                    fontWeight: 600,
                                    color: C.accent,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.8,
                                    borderBottom: `1px solid ${C.border}`,
                                    background: `${C.accent}08`,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <Ic d={I.ai} size={10} color={C.accent} /> NOVA Suggestion
                                </div>
                                <div
                                  className="nav-item"
                                  onClick={() => addTakeoffFromAI(aiLookup.result)}
                                  style={{
                                    padding: "6px 10px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    cursor: "pointer",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: T.font.sans,
                                      fontSize: 9,
                                      color: C.purple,
                                      fontWeight: 600,
                                      minWidth: 60,
                                    }}
                                  >
                                    {aiLookup.result.code}
                                  </span>
                                  <span
                                    style={{
                                      flex: 1,
                                      fontSize: 11,
                                      color: C.text,
                                      fontWeight: 500,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {aiLookup.result.description}
                                  </span>
                                  <span style={{ fontSize: 9, color: C.textDim }}>/{aiLookup.result.unit}</span>
                                  <span
                                    style={{
                                      fontFamily: T.font.sans,
                                      fontSize: 9,
                                      color: C.green,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {fmt2(
                                      nn(aiLookup.result.material) +
                                        nn(aiLookup.result.labor) +
                                        nn(aiLookup.result.equipment) +
                                        nn(aiLookup.result.subcontractor),
                                    )}
                                  </span>
                                </div>
                              </div>
                            )}
                            {aiLookup?.result?.type === "multi" && (
                              <div style={{ borderTop: `1px solid ${C.border}` }}>
                                <div
                                  style={{
                                    padding: "4px 8px",
                                    fontSize: 8,
                                    fontWeight: 600,
                                    color: C.accent,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.8,
                                    borderBottom: `1px solid ${C.border}`,
                                    background: `${C.accent}08`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                  }}
                                >
                                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <Ic d={I.ai} size={10} color={C.accent} /> NOVA: {aiLookup.result.groupName} (
                                    {aiLookup.result.items.length} parts)
                                  </span>
                                </div>
                                {aiLookup.result.items.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className="nav-item"
                                    onClick={() => addTakeoffFromAI(item)}
                                    style={{
                                      padding: "4px 10px",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      cursor: "pointer",
                                      borderBottom:
                                        idx < aiLookup.result.items.length - 1 ? `1px solid ${C.bg2}` : "none",
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontFamily: T.font.sans,
                                        fontSize: 8,
                                        color: C.purple,
                                        fontWeight: 600,
                                        minWidth: 55,
                                      }}
                                    >
                                      {item.code}
                                    </span>
                                    <span
                                      style={{
                                        flex: 1,
                                        fontSize: 10,
                                        color: C.text,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {item.description}
                                    </span>
                                    <span style={{ fontSize: 8, color: C.textDim }}>/{item.unit}</span>
                                    <span
                                      style={{
                                        fontFamily: T.font.sans,
                                        fontSize: 8,
                                        color: C.green,
                                        fontWeight: 600,
                                      }}
                                    >
                                      {fmt2(
                                        nn(item.material) +
                                          nn(item.labor) +
                                          nn(item.equipment) +
                                          nn(item.subcontractor),
                                      )}
                                    </span>
                                  </div>
                                ))}
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 4,
                                    padding: "4px 10px",
                                    borderTop: `1px solid ${C.border}`,
                                  }}
                                >
                                  <div
                                    className="nav-item"
                                    onClick={() => insertAIGroupIntoTakeoffs(aiLookup.result)}
                                    style={{
                                      flex: 1,
                                      padding: "5px 8px",
                                      textAlign: "center",
                                      cursor: "pointer",
                                      fontSize: 10,
                                      fontWeight: 600,
                                      color: "#fff",
                                      background: C.accent,
                                      borderRadius: 4,
                                    }}
                                  >
                                    Add All as Group
                                  </div>
                                  <div
                                    className="nav-item"
                                    onClick={() => addTakeoffFromAIAsSingle(aiLookup.result)}
                                    style={{
                                      flex: 1,
                                      padding: "5px 8px",
                                      textAlign: "center",
                                      cursor: "pointer",
                                      fontSize: 10,
                                      fontWeight: 500,
                                      color: C.textDim,
                                      background: C.bg3,
                                      borderRadius: 4,
                                    }}
                                  >
                                    Add as single line
                                  </div>
                                </div>
                              </div>
                            )}
                            {aiLookup?.error && (
                              <div
                                style={{
                                  padding: "6px 10px",
                                  borderTop: `1px solid ${C.border}`,
                                  background: `rgba(231,76,60,0.06)`,
                                }}
                              >
                                <div style={{ fontSize: 10, color: "#E74C3C", marginBottom: 4 }}>{aiLookup.error}</div>
                                <span
                                  className="nav-item"
                                  onClick={() => lookupItemWithNova(tkNewInput)}
                                  style={{ fontSize: 9, color: C.accent, cursor: "pointer", fontWeight: 600 }}
                                >
                                  Retry
                                </span>
                              </div>
                            )}
                            {/* Footer: Freeform option */}
                            <div style={{ borderTop: `1px solid ${C.border}` }}>
                              <div
                                className="nav-item"
                                onClick={() => addTakeoffFreeform(tkNewInput)}
                                style={{
                                  padding: "5px 10px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  cursor: "pointer",
                                  color: C.textDim,
                                  fontSize: 10,
                                  fontWeight: 500,
                                }}
                              >
                                <Ic d={I.plus} size={10} color={C.textDim} sw={2} /> Add "{tkNewInput}" as freeform (no
                                pricing)
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Module selector — hidden when filtering to "This Page" */}
                      {pageFilter !== "page" && (
                        <div style={{ padding: "8px 10px 8px", borderBottom: `1px solid ${C.border}` }}>
                          {/* All / Modules toggle — equal visual weight */}
                          <div
                            style={{
                              display: "flex",
                              gap: 0,
                              background: C.bg2,
                              borderRadius: 5,
                              padding: 2,
                              marginBottom: activeModule ? 7 : 0,
                            }}
                          >
                            <button
                              onClick={() => setActiveModule(null)}
                              style={{
                                flex: 1,
                                padding: "4px 0",
                                fontSize: 10,
                                fontWeight: 600,
                                background: !activeModule ? C.accent : "transparent",
                                color: !activeModule ? "#fff" : C.textDim,
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                                transition: "all 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 4,
                              }}
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={!activeModule ? "#fff" : C.textDim}
                                strokeWidth="2"
                                strokeLinecap="round"
                              >
                                <path d="M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01" />
                              </svg>
                              All
                            </button>
                            <button
                              onClick={() => {
                                if (activeModule) return; // already in module mode
                                const last = lastModuleRef.current || MODULE_LIST.find(b => b.available)?.id || null;
                                if (last) setActiveModule(last);
                              }}
                              style={{
                                flex: 1,
                                padding: "4px 0",
                                fontSize: 10,
                                fontWeight: 600,
                                background: activeModule ? C.accent : "transparent",
                                color: activeModule ? "#fff" : C.textDim,
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                                transition: "all 0.15s",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 4,
                              }}
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={activeModule ? "#fff" : C.textDim}
                                strokeWidth="2"
                                strokeLinecap="round"
                              >
                                <rect x="3" y="3" width="7" height="7" />
                                <rect x="14" y="3" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" />
                                <rect x="14" y="14" width="7" height="7" />
                              </svg>
                              Modules
                            </button>
                          </div>
                          {/* Module pills — only when in module mode */}
                          {activeModule && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                              {MODULE_LIST.map(b => {
                                const isActive = activeModule === b.id;
                                return (
                                  <button
                                    key={b.id}
                                    onClick={() => b.available && setActiveModule(b.id)}
                                    style={{
                                      padding: "3px 9px",
                                      fontSize: 9,
                                      fontWeight: 600,
                                      border: `1px solid ${isActive ? C.accent + "60" : C.border}`,
                                      background: isActive ? C.accent + "15" : "transparent",
                                      color: isActive ? C.accent : b.available ? C.textMuted : C.textDimmer,
                                      borderRadius: 4,
                                      cursor: b.available ? "pointer" : "default",
                                      opacity: b.available ? 1 : 0.4,
                                      transition: "all 0.15s",
                                    }}
                                    title={b.available ? `${b.name} Module` : `${b.name} Module (Coming Soon)`}
                                  >
                                    {b.name}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Module panel + takeoff list — slide transition */}
                      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
                        <div
                          style={{
                            display: "flex",
                            width: "200%",
                            height: "100%",
                            transform: `translateX(${activeModule && pageFilter !== "page" ? "-50%" : "0"})`,
                            transition: "transform 0.2s ease",
                          }}
                        >
                          {/* Takeoff list (left) */}
                          <div style={{ width: "50%", height: "100%", overflowY: "auto", padding: "0 8px 8px" }}>
                            {Object.entries(takeoffGroups).map(([group, tos]) => {
                              const isGroupCollapsed = !!collapsedGroups[group];
                              return (
                                <div
                                  key={group}
                                  style={{
                                    marginBottom: T.space[3],
                                    background: C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                                    backdropFilter: "blur(20px)",
                                    WebkitBackdropFilter: "blur(20px)",
                                    border: `1px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"}`,
                                    borderRadius: T.radius.md,
                                    boxShadow: T.shadow.sm,
                                    transition: T.transition.base,
                                  }}
                                >
                                  {/* Card header */}
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "space-between",
                                      padding: `${T.space[2]}px ${T.space[3]}px`,
                                      background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                                      borderBottom: isGroupCollapsed
                                        ? "none"
                                        : `1px solid ${C.isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
                                      borderLeft:
                                        group !== "Ungrouped" ? `3px solid ${C.accent}` : "3px solid transparent",
                                    }}
                                  >
                                    <div
                                      style={{ display: "flex", alignItems: "center", gap: T.space[2], minWidth: 0 }}
                                    >
                                      <Ic
                                        d={group === "Ungrouped" ? I.layers : I.assembly}
                                        size={12}
                                        color={C.accent}
                                      />
                                      <span
                                        style={{
                                          fontSize: T.fontSize.sm,
                                          fontWeight: T.fontWeight.semibold,
                                          color: C.text,
                                          letterSpacing: -0.2,
                                          whiteSpace: "nowrap",
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                        }}
                                      >
                                        {group}
                                      </span>
                                      <span
                                        style={{
                                          fontSize: 9,
                                          color: C.textDim,
                                          fontWeight: T.fontWeight.medium,
                                          flexShrink: 0,
                                        }}
                                      >
                                        {tos.length}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => toggleGroupCollapse(group)}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        padding: 4,
                                        display: "flex",
                                        alignItems: "center",
                                        borderRadius: T.radius.sm,
                                        flexShrink: 0,
                                      }}
                                    >
                                      <Ic
                                        d={I.chevron}
                                        size={10}
                                        color={C.textDim}
                                        style={{
                                          transform: isGroupCollapsed ? "rotate(-90deg)" : "rotate(90deg)",
                                          transition: "transform 0.2s cubic-bezier(0.25,0.1,0.25,1)",
                                        }}
                                      />
                                    </button>
                                  </div>
                                  {!isGroupCollapsed && (
                                    <>
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 4,
                                          padding: `${T.space[1]}px ${T.space[3]}px`,
                                          fontSize: 8,
                                          fontWeight: T.fontWeight.semibold,
                                          color: C.textDim,
                                          textTransform: "uppercase",
                                          letterSpacing: 0.6,
                                          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"}`,
                                        }}
                                      >
                                        <div style={{ width: 12 }}></div>
                                        <div style={{ flex: 2, minWidth: 80 }}>Description</div>
                                        <div style={{ width: 55, textAlign: "right" }}>Qty</div>
                                        <div style={{ width: 36 }}>Unit</div>
                                        {tkPanelTier !== "compact" && (
                                          <>
                                            <div style={{ width: 55, textAlign: "right" }}>$/Unit</div>
                                            <div style={{ width: 65, textAlign: "right" }}>Total</div>
                                          </>
                                        )}
                                        <div style={{ width: 44 }}></div>
                                      </div>
                                      {tos.map(to => {
                                        const isActive = tkActiveTakeoffId === to.id;
                                        const isSelected = tkSelectedTakeoffId === to.id || isActive;
                                        const isMeasuring =
                                          isActive && (tkMeasureState === "measuring" || tkMeasureState === "paused");
                                        const isPaused = isActive && tkMeasureState === "paused";
                                        const isRevisionAffected = revisionAffectedIds.has(to.id);
                                        const _totalMCount = (to.measurements || []).length;
                                        const computedQty = getComputedQty(to);
                                        const measuredQty = getMeasuredQty(to);
                                        const hasMeasurements = (to.measurements || []).length > 0;
                                        const noScale =
                                          hasMeasurements && measuredQty === null && unitToTool(to.unit) !== "count";
                                        const hasFormula = !!(to.formula && to.formula.trim());
                                        const displayQty = hasMeasurements
                                          ? hasFormula && computedQty !== null
                                            ? computedQty
                                            : measuredQty !== null
                                              ? measuredQty
                                              : null
                                          : nn(to.quantity) || null;
                                        const _hasVars = (to.variables || []).length > 0;
                                        const ctrlBtnS = {
                                          width: 20,
                                          height: 20,
                                          border: "none",
                                          background: "transparent",
                                          borderRadius: 3,
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          cursor: "pointer",
                                        };
                                        return (
                                          <div key={to.id} data-takeoff-id={to.id}>
                                            <div
                                              className={`row${to._aiCosts ? " nova-priced" : ""}${isSelected ? " row-selected" : ""}${isMeasuring ? " row-measuring" : ""}`}
                                              draggable
                                              onDragStart={() => {
                                                tkDragTakeoff.current = to.id;
                                              }}
                                              onDragEnter={() => {
                                                tkDragOverTakeoff.current = to.id;
                                              }}
                                              onDragEnd={tkDragReorder}
                                              onDragOver={e => e.preventDefault()}
                                              onClick={() => {
                                                // Single click = select only (never auto-start measuring)
                                                setTkSelectedTakeoffId(to.id);
                                              }}
                                              style={{
                                                "--rc": to.color,
                                                position: "relative",
                                                zIndex: isSelected && !isMeasuring ? 2 : undefined,
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 4,
                                                padding: `${T.space[1]}px ${T.space[2]}px`,
                                                borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"}`,
                                                cursor: "grab",
                                                background: isMeasuring
                                                  ? `${to.color}18`
                                                  : isSelected
                                                    ? `${to.color}0A`
                                                    : isRevisionAffected
                                                      ? "rgba(245,158,11,0.06)"
                                                      : "transparent",
                                                borderLeft: isMeasuring
                                                  ? `3px solid ${to.color}`
                                                  : isRevisionAffected && !isSelected
                                                    ? "3px solid #F59E0B"
                                                    : isSelected
                                                      ? `3px solid ${to.color}80`
                                                      : "3px solid transparent",
                                                boxShadow: isMeasuring ? `inset 0 0 0 1px ${to.color}30` : "none",
                                                transition: "background 100ms ease-out",
                                              }}
                                            >
                                              {/* Play / Pause / Stop — left of color for faster engage */}
                                              <div
                                                style={{
                                                  width: isMeasuring || isPaused ? 38 : 20,
                                                  flexShrink: 0,
                                                  display: "flex",
                                                  alignItems: "center",
                                                  justifyContent: "center",
                                                  gap: 2,
                                                }}
                                                onClick={e => e.stopPropagation()}
                                              >
                                                {isActive && tkMeasureState === "measuring" ? (
                                                  <button
                                                    className="icon-btn"
                                                    onClick={() => pauseMeasuring()}
                                                    title="Pause"
                                                    style={ctrlBtnS}
                                                  >
                                                    <svg width="10" height="10" viewBox="0 0 10 10" fill={to.color}>
                                                      <rect x="1" y="1" width="3" height="8" rx="0.5" />
                                                      <rect x="6" y="1" width="3" height="8" rx="0.5" />
                                                    </svg>
                                                  </button>
                                                ) : isPaused ? (
                                                  <button
                                                    className="icon-btn"
                                                    onClick={() => setTkMeasureState("measuring")}
                                                    title="Resume"
                                                    style={ctrlBtnS}
                                                  >
                                                    <svg width="10" height="10" viewBox="0 0 10 10" fill={to.color}>
                                                      <polygon points="2,1 9,5 2,9" />
                                                    </svg>
                                                  </button>
                                                ) : (
                                                  <button
                                                    className="icon-btn"
                                                    onClick={() => engageMeasuring(to.id)}
                                                    title="Start measuring"
                                                    style={{ ...ctrlBtnS, opacity: selectedDrawing?.data ? 1 : 0.3 }}
                                                    disabled={!selectedDrawing?.data}
                                                  >
                                                    <svg
                                                      width="10"
                                                      height="10"
                                                      viewBox="0 0 10 10"
                                                      fill={selectedDrawing?.data ? to.color : C.textDim}
                                                    >
                                                      <polygon points="2,1 9,5 2,9" />
                                                    </svg>
                                                  </button>
                                                )}
                                                {/* Stop button — right next to play/pause */}
                                                {(isMeasuring || isPaused) && (
                                                  <button
                                                    className="icon-btn"
                                                    onClick={() => stopMeasuring()}
                                                    title="Stop"
                                                    style={ctrlBtnS}
                                                  >
                                                    <svg width="8" height="8" viewBox="0 0 8 8" fill={C.red}>
                                                      <rect width="8" height="8" rx="1" />
                                                    </svg>
                                                  </button>
                                                )}
                                              </div>
                                              <div
                                                style={{
                                                  width: 10,
                                                  height: 10,
                                                  borderRadius: 2,
                                                  background: to.color,
                                                  flexShrink: 0,
                                                  cursor: "pointer",
                                                  position: "relative",
                                                }}
                                                onClick={e => {
                                                  e.stopPropagation();
                                                  e.currentTarget.querySelector("input")?.click();
                                                }}
                                              >
                                                {isMeasuring && (
                                                  <div
                                                    style={{
                                                      position: "absolute",
                                                      inset: -2,
                                                      borderRadius: 3,
                                                      border: `2px solid ${to.color}`,
                                                      animation: "pulse 1.5s infinite",
                                                    }}
                                                  />
                                                )}
                                                <input
                                                  type="color"
                                                  value={to.color}
                                                  onChange={e => updateTakeoff(to.id, "color", e.target.value)}
                                                  onClick={e => e.stopPropagation()}
                                                  style={{
                                                    position: "absolute",
                                                    opacity: 0,
                                                    width: 0,
                                                    height: 0,
                                                    top: 0,
                                                    left: 0,
                                                  }}
                                                />
                                              </div>
                                              {/* Tier 1: Description */}
                                              <div
                                                style={{ flex: 2, minWidth: 80, minHeight: 0 }}
                                                onClick={e => e.stopPropagation()}
                                              >
                                                <input
                                                  value={to.description}
                                                  onChange={e => updateTakeoff(to.id, "description", e.target.value)}
                                                  placeholder="Description..."
                                                  style={inp(C, {
                                                    background: "transparent",
                                                    border: "1px solid transparent",
                                                    padding: "2px 4px",
                                                    fontSize: 10,
                                                    fontWeight: T.fontWeight.medium,
                                                  })}
                                                />
                                                {/* Tier 2: Code/NOVA badge — medium */}
                                                {(to.code || to._aiCosts) && (
                                                  <div
                                                    style={{
                                                      fontSize: 8,
                                                      color: `${C.purple}B0`,
                                                      fontFamily: T.font.mono,
                                                      paddingLeft: 4,
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: 3,
                                                      lineHeight: 1.2,
                                                      ...truncate(),
                                                    }}
                                                  >
                                                    {to.code || ""}
                                                    {to._aiCosts && (
                                                      <span
                                                        style={{
                                                          color: C.accent,
                                                          fontSize: 7,
                                                          fontWeight: T.fontWeight.bold,
                                                          display: "inline-flex",
                                                          alignItems: "center",
                                                          gap: 2,
                                                          background: `${C.accent}0A`,
                                                          padding: "0 3px",
                                                          borderRadius: 2,
                                                        }}
                                                        title={`NOVA: M $${fmt2(to._aiCosts.material)} · L $${fmt2(to._aiCosts.labor)} · E $${fmt2(to._aiCosts.equipment)}`}
                                                      >
                                                        ✦ NOVA
                                                      </span>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                              {/* Tier 1: Qty — LOUD */}
                                              <div style={{ width: 55 }} onClick={e => e.stopPropagation()}>
                                                {hasMeasurements ? (
                                                  noScale ? (
                                                    <div
                                                      style={{
                                                        fontSize: 8,
                                                        color: C.orange,
                                                        fontWeight: T.fontWeight.semibold,
                                                        padding: "2px 4px",
                                                        cursor: "help",
                                                      }}
                                                      title="Set a scale to see quantities"
                                                    >
                                                      ⚠ Scale
                                                    </div>
                                                  ) : (
                                                    <div
                                                      className={measureFlashId === to.id ? "measure-complete" : ""}
                                                      style={{
                                                        "--rc": to.color,
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        color: measureFlashId === to.id ? to.color : C.text,
                                                        padding: "2px 4px",
                                                        fontFamily: T.font.mono,
                                                        fontFeatureSettings: "'tnum'",
                                                        borderRadius: 3,
                                                        transition: "color 300ms ease",
                                                      }}
                                                    >
                                                      {displayQty}
                                                    </div>
                                                  )
                                                ) : (
                                                  <input
                                                    type="number"
                                                    value={to.quantity}
                                                    onChange={e => updateTakeoff(to.id, "quantity", e.target.value)}
                                                    placeholder="0"
                                                    style={nInp(C, {
                                                      background: "transparent",
                                                      border: "1px solid transparent",
                                                      padding: "2px 4px",
                                                      fontSize: 10,
                                                      fontWeight: 700,
                                                    })}
                                                  />
                                                )}
                                                {/* Formula whisper removed — displayQty now shows computed result */}
                                              </div>
                                              {/* Tier 3: Unit */}
                                              <div style={{ width: 36 }} onClick={e => e.stopPropagation()}>
                                                <select
                                                  value={to.unit}
                                                  onChange={e => {
                                                    updateTakeoff(to.id, "unit", e.target.value);
                                                    if (tkActiveTakeoffId === to.id) {
                                                      setTkTool(unitToTool(e.target.value));
                                                      setTkActivePoints([]);
                                                    }
                                                  }}
                                                  style={inp(C, {
                                                    background: "transparent",
                                                    border: "1px solid transparent",
                                                    padding: "2px 1px",
                                                    fontSize: 9,
                                                    color: C.textDim,
                                                  })}
                                                >
                                                  {["EA", "LF", "SF", "SY", "CY", "CF", "LS", "HR"].map(u => (
                                                    <option key={u} value={u}>
                                                      {u}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                              {/* Cost columns — Standard/Full tier, always render to maintain alignment */}
                                              {tkPanelTier !== "compact" &&
                                                (() => {
                                                  const linkedItem = itemById[to.linkedItemId];
                                                  if (!linkedItem || getItemTotal(linkedItem) <= 0) {
                                                    return (
                                                      <>
                                                        <div style={{ width: 55 }} />
                                                        <div style={{ width: 65 }} />
                                                      </>
                                                    );
                                                  }
                                                  const itemTotal = getItemTotal(linkedItem);
                                                  const itemQty = nn(linkedItem.quantity);
                                                  const unitCost = itemQty > 0 ? itemTotal / itemQty : 0;
                                                  return (
                                                    <>
                                                      <div
                                                        style={{
                                                          width: 55,
                                                          textAlign: "right",
                                                          fontSize: 9,
                                                          fontFeatureSettings: "'tnum'",
                                                          color: C.textDim,
                                                          padding: "2px 2px",
                                                        }}
                                                        onClick={e => {
                                                          e.stopPropagation();
                                                          setCostEditId(costEditId === to.id ? null : to.id);
                                                        }}
                                                        title={`M: $${fmt2(nn(linkedItem.material))} · L: $${fmt2(nn(linkedItem.labor))} · E: $${fmt2(nn(linkedItem.equipment))} · S: $${fmt2(nn(linkedItem.subcontractor))}`}
                                                      >
                                                        ${fmt2(unitCost)}
                                                      </div>
                                                      <div
                                                        style={{
                                                          width: 65,
                                                          textAlign: "right",
                                                          fontSize: 10,
                                                          fontWeight: 700,
                                                          fontFeatureSettings: "'tnum'",
                                                          color: C.green,
                                                          padding: "2px 2px",
                                                        }}
                                                        onClick={e => {
                                                          e.stopPropagation();
                                                          setCostEditId(costEditId === to.id ? null : to.id);
                                                        }}
                                                      >
                                                        {fmt(itemTotal)}
                                                      </div>
                                                    </>
                                                  );
                                                })()}
                                              {/* Sheet column removed — sheet info accessible via detail overlay */}
                                              <div
                                                style={{
                                                  width: 44,
                                                  display: "flex",
                                                  gap: 2,
                                                  alignItems: "center",
                                                  position: "relative",
                                                }}
                                                onClick={e => e.stopPropagation()}
                                              >
                                                {/* Formula button — always visible (shows state) */}
                                                <div
                                                  className="tk-row-actions"
                                                  style={{
                                                    display: "flex",
                                                    gap: 2,
                                                    alignItems: "center",
                                                  }}
                                                >
                                                  <button
                                                    className="icon-btn"
                                                    onClick={() => setTkShowVars(tkShowVars === to.id ? null : to.id)}
                                                    title="Variables & Formula"
                                                    style={{
                                                      minWidth: 24,
                                                      height: 22,
                                                      padding: hasFormula ? "0 5px" : "0 4px",
                                                      border: hasFormula
                                                        ? `1px solid ${C.accent}40`
                                                        : `1px solid ${C.border}`,
                                                      background: hasFormula ? `${C.accent}15` : C.bg2,
                                                      color: hasFormula ? C.accent : C.textMuted,
                                                      borderRadius: 5,
                                                      display: "flex",
                                                      alignItems: "center",
                                                      justifyContent: "center",
                                                      fontSize: hasFormula ? 9 : 11,
                                                      fontWeight: 700,
                                                      gap: 1,
                                                      transition: T.transition.fast,
                                                      boxShadow: hasFormula ? T.shadow.glowAccent || "none" : "none",
                                                    }}
                                                  >
                                                    {(() => {
                                                      if (!hasFormula) return "ƒ";
                                                      const vars = to.variables || [];
                                                      const hVar = vars.find(
                                                        v => (v.key || "").toLowerCase() === "height",
                                                      );
                                                      if (hVar) return `×${hVar.value}'`;
                                                      const fVar = vars.find(
                                                        v => (v.key || "").toLowerCase() === "factor",
                                                      );
                                                      if (fVar) return `×${fVar.value}`;
                                                      if (vars.length > 0) return `ƒ=`;
                                                      return "ƒ";
                                                    })()}
                                                  </button>
                                                  {/* More actions button */}
                                                  <button
                                                    className="icon-btn"
                                                    onClick={e => {
                                                      e.stopPropagation();
                                                      if (actionMenuId === to.id) {
                                                        setActionMenuId(null);
                                                      } else {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setActionMenuPos({
                                                          top: rect.bottom + 4,
                                                          right: window.innerWidth - rect.right,
                                                        });
                                                        setActionMenuId(to.id);
                                                      }
                                                      setActionConfirm(null);
                                                    }}
                                                    title="More actions"
                                                    style={{
                                                      width: 20,
                                                      height: 20,
                                                      border: "none",
                                                      background:
                                                        actionMenuId === to.id ? `${C.accent}18` : "transparent",
                                                      color: actionMenuId === to.id ? C.accent : C.textDim,
                                                      borderRadius: 3,
                                                      display: "flex",
                                                      alignItems: "center",
                                                      justifyContent: "center",
                                                      fontSize: 14,
                                                      fontWeight: 700,
                                                      letterSpacing: 1,
                                                      transition: "transform 0.15s ease",
                                                      cursor: "pointer",
                                                    }}
                                                    onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")}
                                                    onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
                                                  >
                                                    ⋯
                                                  </button>
                                                </div>
                                                {/* Floating action menu */}
                                                {actionMenuId === to.id && (
                                                  <div
                                                    ref={actionMenuRef}
                                                    style={{
                                                      position: "fixed",
                                                      top: actionMenuPos?.top || 0,
                                                      right: actionMenuPos?.right || 0,
                                                      zIndex: 9999,
                                                      minWidth: 170,
                                                      background: C.bg1,
                                                      border: `1px solid ${C.border}`,
                                                      borderRadius: 8,
                                                      boxShadow: T.shadow.lg,
                                                      padding: "4px 0",
                                                      overflow: "hidden",
                                                    }}
                                                    onClick={e => e.stopPropagation()}
                                                  >
                                                    {/* Auto Count — conditional */}
                                                    {unitToTool(to.unit) === "count" && selectedDrawing?.data && (
                                                      <button
                                                        onClick={() => {
                                                          startAutoCount(to.id);
                                                          setActionMenuId(null);
                                                          setActionConfirm(null);
                                                        }}
                                                        style={{
                                                          width: "100%",
                                                          padding: "7px 12px",
                                                          border: "none",
                                                          background: "transparent",
                                                          color: C.text,
                                                          display: "flex",
                                                          alignItems: "center",
                                                          gap: 8,
                                                          fontSize: 12,
                                                          cursor: "pointer",
                                                          transition: T.transition.fast,
                                                        }}
                                                        onMouseEnter={e =>
                                                          (e.currentTarget.style.background = `${C.accent}10`)
                                                        }
                                                        onMouseLeave={e =>
                                                          (e.currentTarget.style.background = "transparent")
                                                        }
                                                      >
                                                        <svg
                                                          width="13"
                                                          height="13"
                                                          viewBox="0 0 24 24"
                                                          fill="none"
                                                          stroke={C.purple}
                                                          strokeWidth="2.5"
                                                          strokeLinecap="round"
                                                          strokeLinejoin="round"
                                                        >
                                                          <path d="M12 20V10 M18 20v-4 M6 20v-6" />
                                                        </svg>
                                                        <span style={{ color: C.purple }}>Auto Count</span>
                                                      </button>
                                                    )}
                                                    {/* Duplicate */}
                                                    <button
                                                      onClick={() => {
                                                        const nt = {
                                                          ...takeoffs.find(t => t.id === to.id),
                                                          id: uid(),
                                                          linkedItemId: "",
                                                          measurements: [],
                                                        };
                                                        setTakeoffs([...takeoffs, nt]);
                                                        setActionMenuId(null);
                                                        setActionConfirm(null);
                                                      }}
                                                      style={{
                                                        width: "100%",
                                                        padding: "7px 12px",
                                                        border: "none",
                                                        background: "transparent",
                                                        color: C.text,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        fontSize: 12,
                                                        cursor: "pointer",
                                                        transition: T.transition.fast,
                                                      }}
                                                      onMouseEnter={e =>
                                                        (e.currentTarget.style.background = `${C.accent}10`)
                                                      }
                                                      onMouseLeave={e =>
                                                        (e.currentTarget.style.background = "transparent")
                                                      }
                                                    >
                                                      <Ic d={I.copy} size={11} color={C.textDim} />
                                                      <span>Duplicate</span>
                                                    </button>
                                                    {/* Clear Measurements — conditional, two-step confirm */}
                                                    {(to.measurements || []).length > 0 && (
                                                      <button
                                                        onClick={() => {
                                                          if (actionConfirm === "clear") {
                                                            const cnt = (to.measurements || []).length;
                                                            useTakeoffsStore.getState().clearMeasurements(to.id);
                                                            useUiStore
                                                              .getState()
                                                              .showToast(`Cleared ${cnt} measurements`);
                                                            setActionMenuId(null);
                                                            setActionConfirm(null);
                                                          } else {
                                                            setActionConfirm("clear");
                                                          }
                                                        }}
                                                        style={{
                                                          width: "100%",
                                                          padding: "7px 12px",
                                                          border: "none",
                                                          background:
                                                            actionConfirm === "clear" ? `${C.orange}15` : "transparent",
                                                          color: C.orange,
                                                          display: "flex",
                                                          alignItems: "center",
                                                          gap: 8,
                                                          fontSize: 12,
                                                          cursor: "pointer",
                                                          transition: T.transition.fast,
                                                        }}
                                                        onMouseEnter={e => {
                                                          if (actionConfirm !== "clear")
                                                            e.currentTarget.style.background = `${C.orange}10`;
                                                        }}
                                                        onMouseLeave={e => {
                                                          if (actionConfirm !== "clear")
                                                            e.currentTarget.style.background = "transparent";
                                                        }}
                                                      >
                                                        <svg
                                                          width="11"
                                                          height="11"
                                                          viewBox="0 0 24 24"
                                                          fill="none"
                                                          stroke="currentColor"
                                                          strokeWidth="2.5"
                                                          strokeLinecap="round"
                                                        >
                                                          <path d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6" />
                                                        </svg>
                                                        <span>
                                                          {actionConfirm === "clear"
                                                            ? `Clear ${(to.measurements || []).length} measurements?`
                                                            : `Clear (${(to.measurements || []).length})`}
                                                        </span>
                                                      </button>
                                                    )}
                                                    {/* Separator */}
                                                    <div
                                                      style={{ height: 1, background: C.border, margin: "4px 8px" }}
                                                    />
                                                    {/* Delete — two-step confirm */}
                                                    <button
                                                      onClick={() => {
                                                        if (actionConfirm === "delete") {
                                                          removeTakeoff(to.id);
                                                          setActionMenuId(null);
                                                          setActionConfirm(null);
                                                        } else {
                                                          setActionConfirm("delete");
                                                        }
                                                      }}
                                                      style={{
                                                        width: "100%",
                                                        padding: "7px 12px",
                                                        border: "none",
                                                        background:
                                                          actionConfirm === "delete" ? `${C.red}15` : "transparent",
                                                        color: C.red,
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        fontSize: 12,
                                                        cursor: "pointer",
                                                        transition: T.transition.fast,
                                                      }}
                                                      onMouseEnter={e => {
                                                        if (actionConfirm !== "delete")
                                                          e.currentTarget.style.background = `${C.red}10`;
                                                      }}
                                                      onMouseLeave={e => {
                                                        if (actionConfirm !== "delete")
                                                          e.currentTarget.style.background = "transparent";
                                                      }}
                                                    >
                                                      <Ic d={I.trash} size={11} color={C.red} />
                                                      <span>
                                                        {actionConfirm === "delete"
                                                          ? "Delete — are you sure?"
                                                          : "Delete"}
                                                      </span>
                                                    </button>
                                                  </div>
                                                )}
                                              </div>
                                              {/* Floating controls popover — absolute positioned, no layout shift */}
                                              {isSelected && !isMeasuring && (
                                                <div
                                                  style={{
                                                    position: "absolute",
                                                    top: "100%",
                                                    left: 0,
                                                    right: 0,
                                                    zIndex: T.z.dropdown,
                                                    padding: "8px 10px 8px 27px",
                                                    background: `linear-gradient(180deg, ${C.bg1}, ${C.bg2}30)`,
                                                    border: `1px solid ${C.border}`,
                                                    borderTop: "none",
                                                    borderRadius: "0 0 8px 8px",
                                                    boxShadow: T.shadow.md,
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: 5,
                                                  }}
                                                  onClick={e => e.stopPropagation()}
                                                >
                                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span
                                                      style={{
                                                        fontSize: 7,
                                                        color: C.textDim,
                                                        fontWeight: 700,
                                                        textTransform: "uppercase",
                                                        letterSpacing: 0.5,
                                                        minWidth: 28,
                                                      }}
                                                    >
                                                      Color
                                                    </span>
                                                    <div style={{ display: "flex", gap: 3 }}>
                                                      {TO_COLORS.map(c => (
                                                        <div
                                                          key={c}
                                                          onClick={() => updateTakeoff(to.id, "color", c)}
                                                          style={{
                                                            width: 14,
                                                            height: 14,
                                                            borderRadius: 3,
                                                            background: c,
                                                            cursor: "pointer",
                                                            border:
                                                              to.color === c
                                                                ? "2px solid #fff"
                                                                : "1px solid transparent",
                                                            boxShadow:
                                                              to.color === c
                                                                ? `0 0 0 1px ${c}, 0 0 6px ${c}40`
                                                                : "none",
                                                            transition: "all 100ms",
                                                          }}
                                                        />
                                                      ))}
                                                      <div
                                                        style={{
                                                          position: "relative",
                                                          width: 14,
                                                          height: 14,
                                                          borderRadius: 3,
                                                          background: `conic-gradient(red, yellow, lime, cyan, blue, magenta, red)`,
                                                          cursor: "pointer",
                                                        }}
                                                        onClick={e => {
                                                          e.stopPropagation();
                                                          e.currentTarget.querySelector("input")?.click();
                                                        }}
                                                      >
                                                        <input
                                                          type="color"
                                                          value={to.color}
                                                          onChange={e => updateTakeoff(to.id, "color", e.target.value)}
                                                          onClick={e => e.stopPropagation()}
                                                          style={{
                                                            position: "absolute",
                                                            opacity: 0,
                                                            width: 0,
                                                            height: 0,
                                                            top: 0,
                                                            left: 0,
                                                          }}
                                                        />
                                                      </div>
                                                    </div>
                                                  </div>
                                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span
                                                      style={{
                                                        fontSize: 7,
                                                        color: C.textDim,
                                                        fontWeight: 700,
                                                        textTransform: "uppercase",
                                                        letterSpacing: 0.5,
                                                        minWidth: 28,
                                                      }}
                                                    >
                                                      Stroke
                                                    </span>
                                                    <input
                                                      type="range"
                                                      min="1"
                                                      max="10"
                                                      step="1"
                                                      value={to.strokeWidth ?? 3}
                                                      onChange={e =>
                                                        updateTakeoff(to.id, "strokeWidth", Number(e.target.value))
                                                      }
                                                      style={{
                                                        width: 70,
                                                        height: 3,
                                                        accentColor: to.color,
                                                        cursor: "pointer",
                                                      }}
                                                    />
                                                    <span
                                                      style={{
                                                        fontSize: 8,
                                                        color: C.textDim,
                                                        fontFamily: T.font.sans,
                                                        minWidth: 18,
                                                      }}
                                                    >
                                                      {to.strokeWidth ?? 3}px
                                                    </span>
                                                  </div>
                                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                    <span
                                                      style={{
                                                        fontSize: 7,
                                                        color: C.textDim,
                                                        fontWeight: 700,
                                                        textTransform: "uppercase",
                                                        letterSpacing: 0.5,
                                                        minWidth: 28,
                                                      }}
                                                    >
                                                      Fill
                                                    </span>
                                                    <input
                                                      type="range"
                                                      min="5"
                                                      max="100"
                                                      step="5"
                                                      value={to.fillOpacity ?? 20}
                                                      onChange={e =>
                                                        updateTakeoff(to.id, "fillOpacity", Number(e.target.value))
                                                      }
                                                      style={{
                                                        width: 70,
                                                        height: 3,
                                                        accentColor: to.color,
                                                        cursor: "pointer",
                                                      }}
                                                    />
                                                    <span
                                                      style={{
                                                        fontSize: 8,
                                                        color: C.textDim,
                                                        fontFamily: T.font.sans,
                                                        minWidth: 24,
                                                      }}
                                                    >
                                                      {to.fillOpacity ?? 20}%
                                                    </span>
                                                  </div>
                                                </div>
                                              )}
                                              {/* Inline cost edit popover — Standard/Full tier */}
                                              {costEditId === to.id &&
                                                tkPanelTier !== "compact" &&
                                                (() => {
                                                  const li = itemById[to.linkedItemId];
                                                  if (!li)
                                                    return (
                                                      <div
                                                        style={{
                                                          position: "absolute",
                                                          top: "100%",
                                                          left: 0,
                                                          right: 0,
                                                          zIndex: T.z.dropdown + 1,
                                                          padding: "8px 12px",
                                                          background: C.bg1,
                                                          border: `1px solid ${C.border}`,
                                                          borderRadius: "0 0 8px 8px",
                                                          boxShadow: T.shadow.md,
                                                          fontSize: 9,
                                                          color: C.textDim,
                                                        }}
                                                        onClick={e => e.stopPropagation()}
                                                      >
                                                        No linked estimate item yet
                                                      </div>
                                                    );
                                                  const upd = (field, val) =>
                                                    useItemsStore.getState().updateItem(li.id, field, Number(val) || 0);
                                                  const costFields = [
                                                    { key: "material", label: "Material", short: "M" },
                                                    { key: "labor", label: "Labor", short: "L" },
                                                    { key: "equipment", label: "Equipment", short: "E" },
                                                    { key: "subcontractor", label: "Sub", short: "S" },
                                                  ];
                                                  return (
                                                    <div
                                                      style={{
                                                        position: "absolute",
                                                        top: "100%",
                                                        left: 0,
                                                        right: 0,
                                                        zIndex: T.z.dropdown + 1,
                                                        padding: "8px 10px",
                                                        background: `linear-gradient(180deg, ${C.bg1}, ${C.bg2}30)`,
                                                        border: `1px solid ${C.accent}30`,
                                                        borderTop: "none",
                                                        borderRadius: "0 0 8px 8px",
                                                        boxShadow: T.shadow.md,
                                                      }}
                                                      onClick={e => e.stopPropagation()}
                                                    >
                                                      <div
                                                        style={{
                                                          fontSize: 8,
                                                          fontWeight: 700,
                                                          color: C.accent,
                                                          textTransform: "uppercase",
                                                          letterSpacing: 0.8,
                                                          marginBottom: 4,
                                                        }}
                                                      >
                                                        Unit Costs
                                                      </div>
                                                      <div
                                                        style={{
                                                          display: "grid",
                                                          gridTemplateColumns: "1fr 1fr",
                                                          gap: 4,
                                                        }}
                                                      >
                                                        {costFields.map(f => (
                                                          <div
                                                            key={f.key}
                                                            style={{ display: "flex", alignItems: "center", gap: 4 }}
                                                          >
                                                            <span
                                                              style={{
                                                                fontSize: 8,
                                                                color: C.textDim,
                                                                fontWeight: 600,
                                                                width: 12,
                                                              }}
                                                            >
                                                              {f.short}
                                                            </span>
                                                            <input
                                                              type="number"
                                                              value={nn(li[f.key]) || ""}
                                                              onChange={e => upd(f.key, e.target.value)}
                                                              placeholder="0"
                                                              style={nInp(C, {
                                                                background: C.bg2,
                                                                border: `1px solid ${C.border}`,
                                                                padding: "3px 5px",
                                                                fontSize: 10,
                                                                fontWeight: 600,
                                                                borderRadius: 4,
                                                                width: "100%",
                                                                fontFeatureSettings: "'tnum'",
                                                              })}
                                                            />
                                                          </div>
                                                        ))}
                                                      </div>
                                                      <div
                                                        style={{
                                                          display: "flex",
                                                          justifyContent: "space-between",
                                                          alignItems: "center",
                                                          marginTop: 4,
                                                          paddingTop: 4,
                                                          borderTop: `1px solid ${C.border}`,
                                                        }}
                                                      >
                                                        <span style={{ fontSize: 8, color: C.textDim }}>
                                                          Total:{" "}
                                                          <strong style={{ color: C.green }}>
                                                            {fmt(getItemTotal(li))}
                                                          </strong>
                                                        </span>
                                                        <button
                                                          onClick={() => setCostEditId(null)}
                                                          style={{
                                                            fontSize: 8,
                                                            color: C.accent,
                                                            background: "none",
                                                            border: "none",
                                                            cursor: "pointer",
                                                            fontWeight: 600,
                                                          }}
                                                        >
                                                          Done
                                                        </button>
                                                      </div>
                                                    </div>
                                                  );
                                                })()}
                                            </div>

                                            {/* Inline formula expression — visible when formula is active */}
                                            {hasFormula &&
                                              computedQty !== null &&
                                              displayQty !== null &&
                                              tkShowVars !== to.id && (
                                                <FormulaExpressionRow
                                                  takeoff={to}
                                                  measuredQty={displayQty}
                                                  computedQty={computedQty}
                                                  updateTakeoff={updateTakeoff}
                                                  C={C}
                                                  T={T}
                                                />
                                              )}

                                            {/* Dimension Engine */}
                                            {tkShowVars === to.id && (
                                              <TakeoffDimensionEngine
                                                takeoff={to}
                                                updateTakeoff={updateTakeoff}
                                                measuredQty={measuredQty}
                                                computedQty={computedQty}
                                                measurements={to.measurements || []}
                                                computeMeasurementValue={computeMeasurementValue}
                                                selectedDrawingId={selectedDrawingId}
                                                removeMeasurement={removeMeasurement}
                                                drawingViewType={selectedDrawing?.viewType || null}
                                              />
                                            )}
                                          </div>
                                        );
                                      })}
                                      <button
                                        className="ghost-btn"
                                        onClick={() => addTakeoff(group)}
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: T.space[1],
                                          width: "100%",
                                          padding: `${T.space[2]}px ${T.space[3]}px`,
                                          background: "transparent",
                                          color: C.textDim,
                                          cursor: "pointer",
                                          fontSize: T.fontSize.xs,
                                          fontWeight: T.fontWeight.medium,
                                          border: "none",
                                          borderTop: `1px solid ${C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"}`,
                                        }}
                                      >
                                        <Ic d={I.plus} size={9} /> Add item
                                      </button>
                                    </>
                                  )}
                                </div>
                              );
                            })}

                            {takeoffs.length === 0 && (
                              <div
                                style={{
                                  textAlign: "center",
                                  padding: `${T.space[8]}px ${T.space[5]}px`,
                                  borderRadius: T.radius.lg,
                                  marginTop: T.space[3],
                                  background: `linear-gradient(180deg, ${C.accent}06, transparent)`,
                                  position: "relative",
                                  overflow: "hidden",
                                }}
                              >
                                {/* Decorative rings */}
                                <div
                                  style={{
                                    position: "absolute",
                                    top: -20,
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    width: 120,
                                    height: 120,
                                    borderRadius: "50%",
                                    border: `1px solid ${C.accent}08`,
                                    animation: "breathe 4s ease-in-out infinite",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    top: -10,
                                    left: "50%",
                                    transform: "translateX(-50%)",
                                    width: 100,
                                    height: 100,
                                    borderRadius: "50%",
                                    border: `1px solid ${C.accent}12`,
                                    animation: "breathe 4s ease-in-out infinite 0.5s",
                                  }}
                                />
                                <div
                                  style={{
                                    width: 56,
                                    height: 56,
                                    borderRadius: T.radius.full,
                                    margin: "0 auto",
                                    marginBottom: T.space[3],
                                    position: "relative",
                                    background: `linear-gradient(135deg, ${C.accent}18, ${C.accent}06)`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    boxShadow: `0 0 24px ${C.accent}12`,
                                  }}
                                >
                                  <Ic d={I.ruler} size={24} color={C.accent} sw={1.7} />
                                </div>
                                <div
                                  style={{
                                    fontSize: T.fontSize.md,
                                    fontWeight: T.fontWeight.bold,
                                    color: C.text,
                                    marginBottom: T.space[1],
                                  }}
                                >
                                  Ready to measure
                                </div>
                                <div
                                  style={{
                                    fontSize: T.fontSize.sm,
                                    color: C.textMuted,
                                    lineHeight: 1.5,
                                    maxWidth: 220,
                                    margin: "0 auto",
                                  }}
                                >
                                  Search for a scope item above, or type any description and press Enter to start.
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    gap: 12,
                                    marginTop: T.space[4],
                                    fontSize: 8,
                                    color: C.textDim,
                                  }}
                                >
                                  <span>⏎ Add item</span>
                                  <span>↹ Navigate</span>
                                  <span>⌘K Palette</span>
                                </div>
                              </div>
                            )}
                          </div>
                          {/* ModulePanel (right — slides in when active, hidden when "This Page") */}
                          <div style={{ width: "50%", height: "100%", overflowY: "auto" }}>
                            {pageFilter !== "page" && (
                              <ModulePanel
                                engageMeasuring={engageMeasuring}
                                selectedDrawingId={selectedDrawingId}
                                addTakeoff={addTakeoff}
                                updateTakeoff={updateTakeoff}
                                removeTakeoff={removeTakeoff}
                                pageFilter={pageFilter}
                                onDetectWallSchedule={runWallScheduleDetection}
                                wallScheduleLoading={wallSchedule.loading}
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* AI Scope Suggestions */}
                      {tkScopeSuggestions && (
                        <div
                          style={{
                            borderTop: `2px solid ${C.accent}`,
                            maxHeight: 260,
                            overflowY: "auto",
                            background: C.bg,
                          }}
                        >
                          <div
                            style={{
                              padding: "6px 10px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              borderBottom: `1px solid ${C.border}`,
                              position: "sticky",
                              top: 0,
                              background: C.bg,
                              zIndex: 2,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <Ic d={I.ai} size={12} color={C.accent} />
                              <span style={{ fontSize: 10, fontWeight: 700, color: C.accent }}>Scope Suggestions</span>
                              {tkScopeSuggestions.loading && (
                                <span style={{ fontSize: 9, color: C.textDim, fontStyle: "italic" }}>Analyzing...</span>
                              )}
                            </div>
                            <button
                              onClick={() => setTkScopeSuggestions(null)}
                              style={{
                                width: 16,
                                height: 16,
                                border: "none",
                                background: "transparent",
                                color: C.textDim,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Ic d={I.x} size={9} />
                            </button>
                          </div>
                          {tkScopeSuggestions.loading && (
                            <div style={{ padding: 20, textAlign: "center" }}>
                              <div
                                style={{
                                  width: 20,
                                  height: 20,
                                  border: `2px solid ${C.border}`,
                                  borderTopColor: C.accent,
                                  borderRadius: "50%",
                                  animation: "spin 0.8s linear infinite",
                                  margin: "0 auto 8px",
                                }}
                              />
                              <div style={{ fontSize: 10, color: C.textDim }}>
                                AI is reviewing your scope for gaps...
                              </div>
                            </div>
                          )}
                          {!tkScopeSuggestions.loading && tkScopeSuggestions.items.length === 0 && (
                            <div style={{ padding: 16, textAlign: "center", fontSize: 10, color: C.textDim }}>
                              No suggestions — your scope looks comprehensive.
                            </div>
                          )}
                          {tkScopeSuggestions.items.map((sg, i) => (
                            <div
                              key={i}
                              style={{
                                padding: "6px 10px",
                                borderBottom: `1px solid ${C.bg2}`,
                                display: "flex",
                                gap: 8,
                                alignItems: "flex-start",
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{sg.name}</div>
                                <div style={{ fontSize: 9, color: C.textMuted, lineHeight: 1.4, marginTop: 1 }}>
                                  {sg.desc}
                                </div>
                                {sg.code && (
                                  <span style={{ fontSize: 8, fontFamily: T.font.sans, color: C.purple }}>
                                    {sg.code}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 3, flexShrink: 0, paddingTop: 2 }}>
                                <button
                                  onClick={() => {
                                    addTakeoff("", sg.name, sg.unit || "SF", sg.code || "");
                                    setTkScopeSuggestions({
                                      ...tkScopeSuggestions,
                                      items: tkScopeSuggestions.items.filter((_, j) => j !== i),
                                    });
                                    showToast(`Added: ${sg.name}`);
                                  }}
                                  title="Add to takeoffs"
                                  style={bt(C, {
                                    padding: "3px 8px",
                                    fontSize: 8,
                                    fontWeight: 600,
                                    background: C.accent,
                                    color: "#fff",
                                    borderRadius: 3,
                                  })}
                                >
                                  + Add
                                </button>
                                <button
                                  onClick={() =>
                                    setTkScopeSuggestions({
                                      ...tkScopeSuggestions,
                                      items: tkScopeSuggestions.items.filter((_, j) => j !== i),
                                    })
                                  }
                                  title="Dismiss"
                                  style={bt(C, {
                                    padding: "3px 6px",
                                    fontSize: 8,
                                    background: "transparent",
                                    border: `1px solid ${C.border}`,
                                    color: C.textDim,
                                    borderRadius: 3,
                                  })}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Footer */}
                      {takeoffs.length > 0 && (
                        <div
                          style={{
                            padding: "5px 12px",
                            borderTop: `1px solid ${C.border}`,
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 10,
                          }}
                        >
                          <span style={{ color: C.textMuted }}>
                            <strong style={{ color: C.text }}>{takeoffs.length}</strong> items
                            {takeoffs.reduce((s, t) => (t.measurements || []).length + s, 0) > 0 && (
                              <>
                                {" "}
                                ·{" "}
                                <strong style={{ color: C.accent }}>
                                  {takeoffs.reduce((s, t) => (t.measurements || []).length + s, 0)}
                                </strong>{" "}
                                measurements
                              </>
                            )}
                          </span>
                          {tkPanelTier !== "compact" && getTotals().grand > 0 && (
                            <span
                              style={{
                                color: C.green,
                                fontWeight: 700,
                                fontFamily: T.font.sans,
                                fontFeatureSettings: "'tnum'",
                              }}
                            >
                              {fmt(getTotals().grand)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Right column: Estimate grid — Full tier only */}
                  {tkPanelTier === "full" && (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
                      <Suspense
                        fallback={
                          <div style={{ padding: 20, textAlign: "center", fontSize: 10, color: C.textDim }}>
                            Loading estimate...
                          </div>
                        }
                      >
                        <EstimatePanelView
                          onSelectItem={id => setEstSelectedItemId(prev => (prev === id ? null : id))}
                          selectedItemId={estSelectedItemId}
                        />
                      </Suspense>
                    </div>
                  )}
                </div>
                {/* end flex split container */}
              </>
            );
          })()}

          {/* Drag handle — right edge of panel */}
          <div
            onMouseDown={startTkDrag}
            style={{
              position: "absolute",
              right: -3,
              top: 0,
              bottom: 0,
              width: 6,
              cursor: "col-resize",
              zIndex: 32,
              background: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={e => (e.currentTarget.querySelector(".grip-bar").style.background = C.accent + "60")}
            onMouseLeave={e => (e.currentTarget.querySelector(".grip-bar").style.background = C.border)}
          >
            <div
              className="grip-bar"
              style={{ width: 3, height: 24, borderRadius: 2, background: C.border, transition: "background 0.15s" }}
            />
          </div>

          {/* Tier indicator during drag */}
          {isDraggingPanel && (
            <div
              style={{
                position: "absolute",
                right: -52,
                top: "50%",
                transform: "translateY(-50%)",
                background: C.bg1,
                border: `1px solid ${C.accent}`,
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 9,
                fontWeight: 700,
                color: C.accent,
                whiteSpace: "nowrap",
                zIndex: 100,
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                pointerEvents: "none",
              }}
            >
              {tkPanelTier === "compact" ? "Compact" : tkPanelTier === "standard" ? "Standard" : "Full"}
            </div>
          )}
        </div>
      )}

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
          transition: isDraggingPanel ? "none" : "margin-left 0.2s ease-out",
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
