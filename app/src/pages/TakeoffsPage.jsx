import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { useTakeoffsStore } from '@/stores/takeoffsStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSpecsStore } from '@/stores/specsStore';
import { useUiStore } from '@/stores/uiStore';
import { useDatabaseStore } from '@/stores/databaseStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt, truncate } from '@/utils/styles';
import { uid, nn, fmt2, nowStr } from '@/utils/format';
import { UNITS } from '@/constants/units';
import { PDF_RENDER_DPI, DEFAULT_IMAGE_DPI } from '@/constants/scales';
import { callAnthropic, callAnthropicStream, optimizeImageForAI, imageBlock, cropImageRegion, buildProjectContext } from '@/utils/ai';
import { useModuleStore } from '@/stores/moduleStore';
import { useModelStore } from '@/stores/modelStore';
import { outlineToFeet, detectBuildingOutline, ensureDrawingImage } from '@/utils/outlineDetector';
import { MODULE_LIST, MODULES } from '@/constants/modules';
import ModulePanel from '@/components/takeoffs/ModulePanel';
import TakeoffDimensionEngine from '@/components/takeoffs/TakeoffDimensionEngine';
import TakeoffCommandPalette from '@/components/takeoffs/TakeoffCommandPalette';
import GroupBar from '@/components/shared/GroupBar';
import { extractPageData, isExtracted } from '@/utils/pdfExtractor';
import { runSmartPredictions, scanAllSheets, findNearbyPrediction, warmPredictions, recordPredictionFeedback } from '@/utils/predictiveEngine';
import { extractSchedules, scanAllDrawingsForSchedules } from '@/utils/scheduleParser';
import { analyzeDrawingGeometry, generateAutoMeasurements } from '@/utils/geometryEngine';
import { evalCondition } from '@/utils/moduleCalc';
import { autoTradeFromCode } from '@/constants/tradeGroupings';
import NotesPanel from '@/components/estimate/NotesPanel';
import NovaOrb from '@/components/dashboard/NovaOrb';
import { MessageBubble, ActionCards, QUICK_ACTIONS } from '@/components/ai/AIChatPanel';
import { NOVA_TOOLS, executeNovaTool } from '@/utils/novaTools';

const TO_COLORS = ["#E53E3E", "#38A169", "#3182CE", "#DD6B20", "#805AD5", "#D53F8C", "#2B6CB0", "#C53030"];

// ─── NOVA Prefetch + Session Cache ──────────────────────────────────────
const _novaCache = new Map();          // key (lowercase trimmed) → { result | error, timestamp }

function _novaCacheEvict() {
  if (_novaCache.size <= 10) return;
  let oldest = null, oldestKey = null;
  _novaCache.forEach((v, k) => { if (!oldest || v.timestamp < oldest) { oldest = v.timestamp; oldestKey = k; } });
  if (oldestKey) _novaCache.delete(oldestKey);
}

const NOVA_SYSTEM_PROMPT = `You are a construction cost estimator. Given an item description, return a JSON object with CSI code, description, unit, and unit pricing.

Determine if the item is a SINGLE item or MULTI-PART scope item:
- SINGLE: Items with a single unit rate (e.g., "fire extinguisher cabinet", "black metal siding", "carpet tile")
- MULTI: Items that are typically composed of multiple sub-components (e.g., "drywall partition" = studs + GWB + taping + insulation)

Return ONLY valid JSON (no markdown fences, no explanation):

For SINGLE items:
{ "type": "single", "code": "07.46.23", "description": "Black Metal Siding - 24ga Standing Seam", "unit": "SF", "division": "07 - Thermal & Moisture Protection", "material": 8.50, "labor": 4.25, "equipment": 0.50, "subcontractor": 0 }

For MULTI-PART items:
{ "type": "multi", "groupName": "Drywall Partition", "items": [
  { "code": "09.22.16", "description": "Metal Studs 3-5/8\\" 25ga", "unit": "SF", "division": "09 - Finishes", "material": 1.85, "labor": 2.10, "equipment": 0, "subcontractor": 0 },
  { "code": "09.29.10", "description": "5/8\\" Type X GWB Both Sides", "unit": "SF", "division": "09 - Finishes", "material": 1.20, "labor": 1.50, "equipment": 0, "subcontractor": 0 }
]}

Rules:
- Use standard CSI MasterFormat codes (XX.XX.XX format)
- Include division name as "XX - Name"
- Be specific in descriptions
- Base pricing on current US market UNIT rates (cost per unit)
- Set subcontractor > 0 for trades typically subbed out (electrical, plumbing, HVAC, fire protection)
- For multi-part, include 2-6 component items
- Return ONLY the JSON object, nothing else`;

function buildNovaUserMsg(inputText, project) {
  const contextLines = [
    project.name && project.name !== "New Estimate" && `Project: ${project.name}`,
    project.client && `Client: ${project.client}`,
    project.buildingType && `Building Type: ${project.buildingType}`,
    project.workType && `Work Type: ${project.workType}`,
    project.projectSF && `Project SF: ${nn(project.projectSF).toLocaleString()}`,
    project.floorCount && `Floors: ${project.floorCount}`,
    project.jobType && `Job Type: ${project.jobType}`,
    project.address && `Location: ${project.address}`,
    project.zipCode && `Zip: ${project.zipCode}`,
  ].filter(Boolean);
  return inputText.trim() + (contextLines.length > 0
    ? "\n\nProject context:\n" + contextLines.join("\n")
    : "");
}

function parseNovaResponse(text) {
  const clean = text.replace(/```json\n?|```/g, "").trim();
  const parsed = JSON.parse(clean);
  if (parsed.type === "single" && parsed.code && parsed.description) return { result: parsed };
  if (parsed.type === "multi" && Array.isArray(parsed.items) && parsed.items.length > 0) return { result: parsed };
  return { error: "NOVA couldn't identify this item" };
}

// Parse complete JSON objects from a partial/streaming JSON array string
function parsePartialJsonArray(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const objects = [];
  let depth = 0, inString = false, escape = false, objStart = -1;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { objects.push(JSON.parse(clean.slice(objStart, i + 1))); } catch { /* incomplete */ }
        objStart = -1;
      }
    }
  }
  return objects;
}

// Load pdf.js from CDN
const loadPdfJs = () => new Promise((resolve, reject) => {
  if (window.pdfjsLib) { resolve(); return; }
  const s = document.createElement("script");
  s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  s.onload = () => { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; resolve(); } catch (e) { reject(e); } };
  s.onerror = () => reject(new Error("Failed to load PDF.js"));
  document.head.appendChild(s);
  setTimeout(() => reject(new Error("PDF.js timeout")), 15000);
});

export default function TakeoffsPage() {
  const C = useTheme();

  const T = C.T;
  const showToast = useUiStore(s => s.showToast);
  const activeGroupId = useUiStore(s => s.activeGroupId);
  const showNotesPanel = useUiStore(s => s.showNotesPanel);
  const setShowNotesPanel = useUiStore(s => s.setShowNotesPanel);
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const elements = useDatabaseStore(s => s.elements);
  const assemblies = useDatabaseStore(s => s.assemblies);

  // Model store — outline state for current drawing
  const modelOutlines = useModelStore(s => s.outlines);

  // Drawings store
  const drawings = useDrawingsStore(s => s.drawings);
  const selectedDrawingId = useDrawingsStore(s => s.selectedDrawingId);
  const setSelectedDrawingId = useDrawingsStore(s => s.setSelectedDrawingId);
  const pdfCanvases = useDrawingsStore(s => s.pdfCanvases);
  const setPdfCanvases = useDrawingsStore(s => s.setPdfCanvases);
  const drawingScales = useDrawingsStore(s => s.drawingScales);
  const setDrawingScales = useDrawingsStore(s => s.setDrawingScales);
  const drawingDpi = useDrawingsStore(s => s.drawingDpi);
  const setDrawingDpi = useDrawingsStore(s => s.setDrawingDpi);

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
  const tkContextMenu = useTakeoffsStore(s => s.tkContextMenu);
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
  const tkPanelOpen = useTakeoffsStore(s => s.tkPanelOpen);
  const setTkPanelOpen = useTakeoffsStore(s => s.setTkPanelOpen);
  const toFilter = useTakeoffsStore(s => s.toFilter);
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

  // Predictive takeoff store
  const tkPredictions = useTakeoffsStore(s => s.tkPredictions);
  const tkPredAccepted = useTakeoffsStore(s => s.tkPredAccepted);
  const tkPredRejected = useTakeoffsStore(s => s.tkPredRejected);
  const tkPredContext = useTakeoffsStore(s => s.tkPredContext);
  const tkPredRefining = useTakeoffsStore(s => s.tkPredRefining);
  const setTkPredictions = useTakeoffsStore(s => s.setTkPredictions);
  const acceptPrediction = useTakeoffsStore(s => s.acceptPrediction);
  const rejectPrediction = useTakeoffsStore(s => s.rejectPrediction);
  const acceptAllPredictions = useTakeoffsStore(s => s.acceptAllPredictions);
  const clearPredictions = useTakeoffsStore(s => s.clearPredictions);
  const recordPredictionMiss = useTakeoffsStore(s => s.recordPredictionMiss);
  const initPredContext = useTakeoffsStore(s => s.initPredContext);
  const setTkPredRefining = useTakeoffsStore(s => s.setTkPredRefining);
  const tkNovaPanelOpen = useTakeoffsStore(s => s.tkNovaPanelOpen);
  const setTkNovaPanelOpen = useTakeoffsStore(s => s.setTkNovaPanelOpen);

  // Refs
  const drawingContainerRef = useRef(null);
  const drawingImgRef = useRef(null);
  const canvasRef = useRef(null);
  const tkPanning = useRef(false);
  const tkPanStart = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });
  const tkDragTakeoff = useRef(null);
  const tkDragOverTakeoff = useRef(null);
  const tkLastWheelX = useRef(0);  // tracks recent deltaX to detect trackpad vs mouse
  const compactStripRef = useRef(null);
  const shiftHeldRef = useRef(false);
  const rafCursorRef = useRef(null);
  const pendingCursorRef = useRef(null);
  const cursorCanvasRef = useRef(null); // overlay canvas for cursor-dependent content
  const predictionCanvasRef = useRef(null); // overlay for ghost predictions
  const predScanAnimRef = useRef(null); // RAF handle for scan wave animation
  const predScanPhaseRef = useRef(0); // animation phase (0–1, repeating pulse)

  // Cleanup RAF cursor on unmount
  useEffect(() => () => { if (rafCursorRef.current) cancelAnimationFrame(rafCursorRef.current); }, []);

  // Track Shift key for snap-angle rendering feedback
  useEffect(() => {
    const onKey = (e) => { shiftHeldRef.current = e.shiftKey; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);

  // Page filter: "all" shows every takeoff, "page" shows only those with measurements on current drawing
  const [pageFilter, setPageFilter] = useState("page");
  // Panel mode: "auto" = collapse on measure/reopen on stop, "open" = always open, "closed" = always closed
  const [tkPanelMode, setTkPanelMode] = useState("auto");

  // Persist selected drawing to sessionStorage so refresh returns to same page
  useEffect(() => {
    if (selectedDrawingId) sessionStorage.setItem("bldg-selectedDrawingId", selectedDrawingId);
    // Clear analysis results when drawing changes
    setGeoAnalysis({ loading: false, results: null });
  }, [selectedDrawingId]);


  // AI Drawing Analysis
  const [aiDrawingAnalysis, setAiDrawingAnalysis] = useState(null); // { loading, results: [] }

  // AI Wall Schedule Detection
  const [wallSchedule, setWallSchedule] = useState({ loading: false, results: null, error: null });

  // PDF-native Schedule Scan (no API calls — reads embedded text)
  const [pdfSchedules, setPdfSchedules] = useState({ loading: false, results: null });

  // Geometry Analysis (wall/room detection from vectors)
  const [geoAnalysis, setGeoAnalysis] = useState({ loading: false, results: null });

  // Measurement micro-feedback — flash takeoff ID when measurement completes
  const [measureFlashId, setMeasureFlashId] = useState(null);
  const measureFlashTimer = useRef(null);
  const triggerMeasureFlash = useCallback((toId) => {
    setMeasureFlashId(toId);
    if (measureFlashTimer.current) clearTimeout(measureFlashTimer.current);
    measureFlashTimer.current = setTimeout(() => setMeasureFlashId(null), 600);
  }, []);

  // Toolbar dropdowns
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef(null);

  // Takeoff Command Palette
  const [tkCmdOpen, setTkCmdOpen] = useState(false);

  // Takeoff group collapse state
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const toggleGroupCollapse = (group) =>
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));

  // AI item lookup state for search dropdown
  // null = idle, "loading" = waiting for AI, { result } = AI returned data, { error } = AI failed
  const [aiLookup, setAiLookup] = useState(null);

  // Cross-sheet scan results
  const [crossSheetScan, setCrossSheetScan] = useState(null); // { tag, results: [{drawingId, sheetNumber, instanceCount}], scanning }

  // NOVA Chat — inline state (reuses uiStore for persistence)
  const novaChatMessages = useUiStore(s => s.aiChatMessages);
  const setNovaChatMessages = useUiStore(s => s.setAiChatMessages);
  const [novaChatInput, setNovaChatInput] = useState("");
  const [novaChatLoading, setNovaChatLoading] = useState(false);
  const novaChatScrollRef = useRef(null);
  const novaChatInputRef = useRef(null);

  // + button mini-menu state
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef(null);

  // Close AI menu / settings popover on outside click
  useEffect(() => {
    if (!settingsOpen && !plusMenuOpen) return;
    const handler = (e) => {
      if (settingsOpen && settingsBtnRef.current && !settingsBtnRef.current.contains(e.target)) setSettingsOpen(false);
      if (plusMenuOpen && plusMenuRef.current && !plusMenuRef.current.contains(e.target)) setPlusMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [settingsOpen, plusMenuOpen]);

  // Cmd+K: open Takeoff Command Palette (capture phase to intercept global)
  useEffect(() => {
    const handler = (e) => {
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
  const selectedDrawing = useMemo(() => drawings.find(d => d.id === selectedDrawingId), [drawings, selectedDrawingId]);
  const filteredTakeoffs = useMemo(() => {
    const byGroup = takeoffs.filter(t => (t.bidContext || "base") === activeGroupId);
    if (pageFilter === "all") return byGroup;
    if (!selectedDrawingId) return byGroup;
    // Strict filter: only takeoffs that have measurements on the current drawing
    return byGroup.filter(t =>
      (t.measurements || []).some(m => m.sheetId === selectedDrawingId)
    );
  }, [takeoffs, pageFilter, selectedDrawingId, activeGroupId]);
  const takeoffGroups = useMemo(() => {
    const g = {};
    filteredTakeoffs.forEach(t => { const k = t.group || "Ungrouped"; if (!g[k]) g[k] = []; g[k].push(t); });
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
      const specVal = item.renderWidth.specMap ? (item.renderWidth.specMap[rawVal] || 0) : nn(rawVal);
      const rawH = item.renderWidth.specHeight ? specs?.[item.renderWidth.specHeight] : null;
      const specH = rawH !== null ? (item.renderWidth.specMap ? (item.renderWidth.specMap[rawH] || specVal) : nn(rawH)) : specVal;
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
  const unitToTool = (unit) => {
    const u = (unit || "SF").toUpperCase();
    if (["EA", "SET", "PAIR", "BOX", "ROLL", "PALLET", "BAG"].includes(u)) return "count";
    if (["LF", "VLF"].includes(u)) return "linear";
    return "area";
  };

  // All takeoff CRUD uses getState() to avoid stale closures (syncDerivedToTakeoffs also mutates store directly)
  const updateTakeoff = useCallback((id, f, v) => {
    const s = useTakeoffsStore.getState();
    s.setTakeoffs(s.takeoffs.map(t => t.id === id ? { ...t, [f]: v } : t));
  }, []);

  const removeTakeoff = useCallback((id) => {
    const s = useTakeoffsStore.getState();
    const toRemove = s.takeoffs.find(t => t.id === id);
    s.setTakeoffs(s.takeoffs.filter(t => t.id !== id));
    if (s.tkActiveTakeoffId === id) { setTkActiveTakeoffId(null); setTkMeasureState("idle"); setTkTool("select"); }

    // Clean up module links if this was a module-linked takeoff
    if (toRemove?.moduleId) {
      const bs = useModuleStore.getState();
      const inst = bs.moduleInstances?.[toRemove.moduleId];
      if (!inst) return;
      const moduleDef = MODULES[toRemove.moduleId];
      if (!moduleDef) return;

      // Check multi-instance categories first
      let found = false;
      moduleDef.categories.forEach(cat => {
        if (!cat.multiInstance || found) return;
        const catInstances = inst.categoryInstances?.[cat.id] || [];
        catInstances.forEach(catInst => {
          Object.entries(catInst.itemTakeoffIds || {}).forEach(([itemId, toId]) => {
            if (toId === id) {
              bs.linkCatInstanceItem(toRemove.moduleId, cat.id, catInst.id, itemId, null);
              bs.setCatInstanceItemStatus(toRemove.moduleId, cat.id, catInst.id, itemId, "pending");
              found = true;
            }
          });
        });
      });

      // Check single-instance items
      if (!found) {
        Object.entries(inst.itemTakeoffIds || {}).forEach(([itemId, toId]) => {
          if (toId === id) {
            bs.linkItemToTakeoff(toRemove.moduleId, itemId, null);
            bs.setItemStatus(toRemove.moduleId, itemId, "pending");
          }
        });
      }
    }
  }, []);

  const addTakeoff = useCallback((group = "", desc = "", unit = "SF", code = "", opts = {}) => {
    const id = uid();
    const current = useTakeoffsStore.getState().takeoffs;
    const { noMeasure, quantity, ...extraFields } = opts;
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    useTakeoffsStore.getState().setTakeoffs([...current, { id, description: desc || "New Takeoff", quantity: quantity || "", unit, color: TO_COLORS[Math.floor(Math.random() * TO_COLORS.length)], drawingRef: "", group, linkedItemId: "", code, variables: [], formula: "", measurements: [], bidContext: bidCtx, ...extraFields }]);
    clearPredictions(); // Immediately clear stale predictions from previous takeoff
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
    if (drawingId && desc && !opts.noMeasure) {
      setTkActiveTakeoffId(id); setTkTool(unitToTool(unit)); setTkMeasureState("measuring"); setTkActivePoints([]); setTkContextMenu(null);
    }
    return id;
  }, []);

  const addTakeoffFromDb = useCallback((el) => {
    const id = uid();
    const current = useTakeoffsStore.getState().takeoffs;
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    useTakeoffsStore.getState().setTakeoffs([...current, { id, description: el.name, quantity: "", unit: el.unit || "SF", color: TO_COLORS[Math.floor(Math.random() * TO_COLORS.length)], drawingRef: "", group: "", linkedItemId: "", code: el.code, variables: [], formula: "", measurements: [], bidContext: bidCtx }]);
    clearPredictions(); // Immediately clear stale predictions from previous takeoff
    setTkNewInput(""); setTkDbResults([]);
    showToast(`Added: ${el.name} — measuring`);
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
    if (drawingId) { setTkActiveTakeoffId(id); setTkTool(unitToTool(el.unit || "SF")); setTkMeasureState("measuring"); setTkActivePoints([]); setTkContextMenu(null); }
  }, []);

  const addTakeoffFreeform = (desc) => {
    if (!desc?.trim()) return;
    const id = uid();
    const unit = tkNewUnit || "SF";
    const bidCtx = activeGroupId || "base";
    setTakeoffs([...takeoffs, { id, description: desc.trim(), quantity: "", unit, color: TO_COLORS[takeoffs.length % TO_COLORS.length], drawingRef: "", group: "", linkedItemId: "", code: "", variables: [], formula: "", measurements: [], bidContext: bidCtx }]);
    clearPredictions(); // Immediately clear stale predictions from previous takeoff
    setTkNewInput(""); setTkDbResults([]);
    showToast(`Added: ${desc.trim()} — measuring`);
    if (selectedDrawingId) { setTimeout(() => { setTkActiveTakeoffId(id); setTkTool(unitToTool(unit)); setTkMeasureState("measuring"); setTkActivePoints([]); setTkContextMenu(null); }, 50); }
  };

  const insertAssemblyIntoTakeoffs = (asm) => {
    const bidCtx = activeGroupId || "base";
    const newTakeoffs = asm.elements.map((el, i) => ({
      id: uid(),
      description: el.desc,
      quantity: "",
      unit: el.unit || "SF",
      color: TO_COLORS[(takeoffs.length + i) % TO_COLORS.length],
      drawingRef: "",
      group: asm.name,
      linkedItemId: "",
      code: el.code,
      variables: [],
      formula: "",
      measurements: [],
      bidContext: bidCtx,
    }));
    setTakeoffs([...takeoffs, ...newTakeoffs]);
    setTkNewInput("");
    setTkDbResults([]);
    showToast(`Inserted ${asm.elements.length} takeoff items from "${asm.name}"`);
  };

  // ─── AI ITEM LOOKUP (NOVA) — manual trigger only ─────────────

  const lookupItemWithNova = async (inputText) => {
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
        _novaCache.set(key, { result, timestamp: Date.now() }); _novaCacheEvict();
        setAiLookup({ result });
      } else {
        setAiLookup({ error: error || "NOVA couldn't identify this item" });
      }
    } catch (err) {
      console.error("[NOVA Lookup] Error:", err);
      setAiLookup({ error: err.message || "AI lookup failed" });
    }
  };

  const addTakeoffFromAI = (item) => {
    const id = uid();
    const current = useTakeoffsStore.getState().takeoffs;
    const bidCtx = useUiStore.getState().activeGroupId || "base";
    useTakeoffsStore.getState().setTakeoffs([...current, {
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
    }]);
    clearPredictions();
    setTkNewInput(""); setTkDbResults([]); setAiLookup(null);
    showToast(`✦ Added: ${item.description} — AI priced — measuring`);
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
    if (drawingId) {
      setTkActiveTakeoffId(id); setTkTool(unitToTool(item.unit || "SF")); setTkMeasureState("measuring"); setTkActivePoints([]); setTkContextMenu(null);
    }
  };

  const insertAIGroupIntoTakeoffs = (result) => {
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
    setTkNewInput(""); setTkDbResults([]); setAiLookup(null);
    showToast(`✦ Added ${result.items.length} items as "${groupName}" — AI priced`);
  };

  const addTakeoffFromAIAsSingle = (result) => {
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

  // ─── MEASUREMENT ENGINE ─────────────
  const getDrawingDpi = (drawingId) => {
    if (drawingDpi[drawingId]) return drawingDpi[drawingId];
    const d = drawings.find(dr => dr.id === drawingId);
    return d?.type === "pdf" ? PDF_RENDER_DPI : DEFAULT_IMAGE_DPI;
  };

  const scaleCodeToPxPerUnit = (code, dpi) => {
    const archMap = { full: 1, half: 0.5, "3-8": 3 / 8, quarter: 1 / 4, "3-16": 3 / 16, eighth: 1 / 8, "3-32": 3 / 32, sixteenth: 1 / 16 };
    if (archMap[code] !== undefined) return dpi * archMap[code];
    const engMatch = code.match(/^eng(\d+)$/);
    if (engMatch) return dpi / parseInt(engMatch[1]);
    const metricMatch = code.match(/^1:(\d+)$/);
    if (metricMatch) {
      const ratio = parseInt(metricMatch[1]);
      return (dpi / 25.4) * 1000 / ratio;
    }
    return null;
  };

  const getPxPerUnit = (drawingId) => {
    const cal = tkCalibrations[drawingId];
    if (cal?.p1 && cal?.p2 && cal?.realDist) {
      const calPxDist = Math.sqrt((cal.p2.x - cal.p1.x) ** 2 + (cal.p2.y - cal.p1.y) ** 2);
      if (calPxDist > 0) return calPxDist / nn(cal.realDist);
    }
    const scaleCode = drawingScales[drawingId];
    if (scaleCode && scaleCode !== "custom") {
      return scaleCodeToPxPerUnit(scaleCode, getDrawingDpi(drawingId));
    }
    return null;
  };

  const pxToReal = (drawingId, px) => {
    const ppu = getPxPerUnit(drawingId);
    if (!ppu) return null;
    return px / ppu;
  };

  // Convert real-world inches to canvas pixels at the drawing's scale
  const realToPx = (drawingId, realInches) => {
    const ppu = getPxPerUnit(drawingId);
    if (!ppu) return null;
    const displayUnit = getDisplayUnit(drawingId);
    // PPU is pixels-per-displayUnit, so convert inches to that unit
    const realUnits = displayUnit === "m" ? realInches * 0.0254 : realInches / 12;
    return realUnits * ppu;
  };

  const getDisplayUnit = (drawingId) => {
    const cal = tkCalibrations[drawingId];
    if (cal?.unit) return cal.unit;
    const sc = drawingScales[drawingId];
    if (sc && sc !== "custom") {
      if (sc.startsWith("1:")) return "m";
      return "ft";
    }
    return "px";
  };

  const hasScale = (drawingId) => !!getPxPerUnit(drawingId);

  const calcPolylineLength = (points, drawingId) => {
    let totalPx = 0;
    for (let i = 1; i < points.length; i++) {
      totalPx += Math.sqrt((points[i].x - points[i - 1].x) ** 2 + (points[i].y - points[i - 1].y) ** 2);
    }
    const real = pxToReal(drawingId, totalPx);
    return real !== null ? real : totalPx;
  };

  const calcPolygonArea = (points, drawingId) => {
    let areaPx = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      areaPx += points[i].x * points[j].y;
      areaPx -= points[j].x * points[i].y;
    }
    areaPx = Math.abs(areaPx) / 2;
    const ppu = getPxPerUnit(drawingId);
    if (!ppu) return areaPx;
    return areaPx / (ppu * ppu);
  };

  const computeMeasurementValue = (m, drawingId) => {
    const did = m.sheetId || drawingId;
    if (!hasScale(did) && m.type !== "count") return null;
    if (m.type === "count") return nn(m.value) || 1;
    if (m.type === "linear" && m.points?.length >= 2) return Math.round(calcPolylineLength(m.points, did) * 100) / 100;
    if (m.type === "area" && m.points?.length >= 3) return Math.round(calcPolygonArea(m.points, did) * 100) / 100;
    return null;
  };

  const getMeasuredQty = (to) => {
    if (!to?.measurements?.length) return to?.quantity ? nn(to.quantity) : null;
    const tool = unitToTool(to.unit);
    if (tool === "count") {
      return to.measurements.reduce((s, m) => s + nn(m.value || 1), 0);
    }
    let total = 0;
    let anyNull = false;
    for (const m of to.measurements) {
      const v = computeMeasurementValue(m, selectedDrawingId);
      if (v === null) { anyNull = true; continue; }
      total += v;
    }
    if (anyNull && total === 0) return null;
    return Math.round(total * 100) / 100;
  };

  // Formula evaluation
  const evalFormula = (formula, variables, measured) => {
    if (!formula || !formula.trim()) return measured;
    try {
      let expr = formula.trim();
      const vars = [{ key: "Measured", value: measured }, { key: "Qty", value: measured }, ...(variables || [])];
      vars.sort((a, b) => (b.key || "").length - (a.key || "").length);
      vars.forEach(v => { if (v.key) { const re = new RegExp(v.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"); expr = expr.replace(re, String(nn(v.value))); } });
      const safe = expr.replace(/[^0-9.+\-*/()% ]/g, "");
      if (!safe.trim()) return measured;
      return Function('"use strict";return (' + safe + ")")();
    } catch (e) { return measured; }
  };

  const getComputedQty = (to) => {
    const measured = getMeasuredQty(to);
    if (measured === null) return null;
    if (!to.formula) return measured;
    return evalFormula(to.formula, to.variables, measured);
  };

  // ─── MEASUREMENT ACTIONS ────────────
  const addMeasurement = useCallback((takeoffId, measurement) => {
    const s = useTakeoffsStore.getState();
    s.setTakeoffs(s.takeoffs.map(t => {
      if (t.id !== takeoffId) return t;
      return { ...t, measurements: [...(t.measurements || []), { id: uid(), ...measurement }] };
    }));
    triggerMeasureFlash(takeoffId);
  }, [triggerMeasureFlash]);

  const removeMeasurement = useCallback((takeoffId, measurementId) => {
    const s = useTakeoffsStore.getState();
    s.setTakeoffs(s.takeoffs.map(t => {
      if (t.id !== takeoffId) return t;
      return { ...t, measurements: (t.measurements || []).filter(m => m.id !== measurementId) };
    }));
  }, []);

  const engageMeasuring = useCallback((toId) => {
    const s = useTakeoffsStore.getState();
    const to = s.takeoffs.find(t => t.id === toId);
    if (!to) return;
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
    const activeTo = s.tkActiveTakeoffId;
    if (activeTo && activeTo !== toId && s.tkMeasureState === "measuring") {
      const pts = s.tkActivePoints || [];
      const tool = s.tkTool;
      if (pts.length >= 2 && tool === "linear") {
        addMeasurement(activeTo, { type: "linear", points: [...pts], value: 0, sheetId: drawingId, color: s.takeoffs.find(t => t.id === activeTo)?.color || "#5b8def" });
      }
      if (pts.length >= 3 && tool === "area") {
        addMeasurement(activeTo, { type: "area", points: [...pts], value: 0, sheetId: drawingId, color: s.takeoffs.find(t => t.id === activeTo)?.color || "#5b8def" });
      }
    }
    setTkSelectedTakeoffId(toId);
    setTkActiveTakeoffId(toId);
    setTkTool(unitToTool(to.unit));
    setTkMeasureState("measuring");
    setTkActivePoints([]);
    setTkContextMenu(null);
    setTkShowVars(null);
    // Always collapse panel when measuring starts — drawing area needs full focus
    setTkPanelOpen(false);
    // Pre-warm prediction cache in background — predictions will be instant on first click
    const drawState = useDrawingsStore.getState();
    const warmDrawing = drawState.drawings.find(d => d.id === drawState.selectedDrawingId);
    if (warmDrawing && warmDrawing.type === "pdf" && warmDrawing.data) {
      warmPredictions(warmDrawing, to.description).catch(() => {});
    }
  }, [addMeasurement]);

  const stopMeasuring = useCallback(() => {
    const s = useTakeoffsStore.getState();
    const pts = s.tkActivePoints || [];
    const tool = s.tkTool;
    const activeTo = s.tkActiveTakeoffId;
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
    if (pts.length >= 2 && tool === "linear" && activeTo) {
      addMeasurement(activeTo, { type: "linear", points: [...pts], value: 0, sheetId: drawingId, color: s.takeoffs.find(t => t.id === activeTo)?.color || "#5b8def" });
    }
    if (pts.length >= 3 && tool === "area" && activeTo) {
      addMeasurement(activeTo, { type: "area", points: [...pts], value: 0, sheetId: drawingId, color: s.takeoffs.find(t => t.id === activeTo)?.color || "#5b8def" });
    }
    // Keep tkSelectedTakeoffId so measurements stay visible after stopping
    setTkMeasureState("idle"); setTkTool("select"); setTkActivePoints([]); setTkActiveTakeoffId(null); setTkContextMenu(null); setTkCursorPt(null);
    // Auto-reopen panel when measuring stops (only in "auto" mode)
    if (tkPanelMode === "auto") setTkPanelOpen(true);
  }, [addMeasurement, tkPanelMode]);

  const pauseMeasuring = () => {
    setTkMeasureState("paused"); setTkActivePoints([]); setTkCursorPt(null);
  };

  const startAutoCount = (takeoffId) => {
    stopMeasuring();
    setTkAutoCount({ takeoffId, phase: "select", samplePt: null, results: [] });
    showToast("Click on a sample symbol to auto-count", "info");
  };

  // ─── AI Auto-Detect (Drawing Analysis) ──────────────────────────────────────
  const runDrawingAnalysis = async () => {
    if (!selectedDrawingId) return;
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing) return;
    const imgSrc = drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId];
    if (!imgSrc) { showToast("Drawing image not available — re-upload in Documents", "error"); return; }

    setAiDrawingAnalysis({ loading: true, results: [] });
    try {
      const { base64 } = await optimizeImageForAI(imgSrc, 1400);
      const sheetInfo = `${drawing.sheetNumber || "Unknown"} — ${drawing.sheetTitle || drawing.label || "Untitled"}`;

      const result = await callAnthropic({
        max_tokens: 4000,
        system: "You are a construction drawing analysis AI. You analyze architectural, structural, and MEP drawings to identify measurable elements for quantity takeoff. Focus on accurate identification and counting — do NOT attempt to provide pixel coordinates.",
        messages: [{ role: "user", content: [
          { type: "text", text: `Analyze this construction drawing sheet: "${sheetInfo}"

Identify all measurable elements visible on this drawing. For each element type, provide:
- name: specific element name (e.g., "Interior Door 3'-0\\"", "GWB Partition Wall", "Vinyl Floor Tile")
- type: "count" | "linear" | "area"
- quantity: ONLY for count items — provide the exact number of instances visible (doors, windows, fixtures, equipment). For linear and area items, set quantity to 0.
- unit: EA for count, LF for linear, SF for area
- code: CSI code if identifiable (e.g., "08 11 13")
- confidence: "high" | "medium" | "low"
- notes: any relevant detail (dimensions, specs, callouts visible on the drawing)

FOCUS ON CLEARLY IDENTIFIABLE ITEMS:
- Count items: doors (look for swing arcs/door marks), windows, plumbing fixtures, electrical panels, HVAC units, light fixtures, fire devices, columns
- Linear items: walls (partition types), baseboards, casework runs, railings — do NOT guess at LF quantities
- Area items: floor finishes, ceiling types, roofing — do NOT guess at SF quantities
- Do NOT count walls (use linear), do NOT count rooms (use area)
- Skip anything ambiguous or unclear

Return ONLY a JSON array of objects.` },
          imageBlock(base64),
        ] }],
      });

      let parsed;
      try { parsed = JSON.parse(result.replace(/```json|```/g, "").trim()); } catch { parsed = null; }
      if (parsed && Array.isArray(parsed)) {
        // Filter out low-confidence results
        const filtered = parsed.filter(item => item.confidence !== "low");
        if (filtered.length === 0) {
          setAiDrawingAnalysis({ loading: false, results: [] });
          showToast("No high-confidence elements detected on this sheet", "info");
          return;
        }

        // Auto-create takeoff items from AI results
        const group = drawing.sheetNumber || "";
        let countItems = 0, measureItems = 0;
        filtered.forEach(item => {
          const colorIdx = useTakeoffsStore.getState().takeoffs.length;
          const color = TO_COLORS[colorIdx % TO_COLORS.length];
          addTakeoff(group, item.name, item.unit || "EA", item.code || "", { noMeasure: true, aiDetected: true });
          const newTo = useTakeoffsStore.getState().takeoffs;
          const last = newTo[newTo.length - 1];
          if (!last) return;
          if (item.type === "count" && item.quantity) {
            updateTakeoff(last.id, "quantity", item.quantity);
            countItems++;
          } else {
            measureItems++;
          }
        });

        setAiDrawingAnalysis({ loading: false, results: filtered });
        const msg = `AI detected ${filtered.length} elements — ${countItems} counted, ${measureItems} need measuring`;
        showToast(msg);
      } else {
        setAiDrawingAnalysis({ loading: false, results: [] });
        showToast("Failed to parse drawing analysis", "error");
      }
    } catch (err) {
      setAiDrawingAnalysis({ loading: false, results: [] });
      showToast(`Analysis error: ${err.message}`, "error");
    }
  };

  // Convert AI pixel coords to canvas pixel coords
  const aiToCanvasCoords = (locations) => {
    if (!locations?.length || !aiDrawingAnalysis?.aiW || !canvasRef.current) return [];
    const cw = canvasRef.current.width;
    const ch = canvasRef.current.height;
    const scaleX = cw / aiDrawingAnalysis.aiW;
    const scaleY = ch / aiDrawingAnalysis.aiH;
    return locations.map(p => ({ x: Math.round(p.x * scaleX), y: Math.round(p.y * scaleY) }));
  };

  const acceptDrawingItem = (item) => {
    const group = drawings.find(d => d.id === selectedDrawingId)?.sheetNumber || "";
    const colorIdx = useTakeoffsStore.getState().takeoffs.length;
    const color = TO_COLORS[colorIdx % TO_COLORS.length];
    addTakeoff(group, item.name, item.unit, item.code);
    const newTo = useTakeoffsStore.getState().takeoffs;
    const last = newTo[newTo.length - 1];
    if (!last) return;

    // Only set quantity for count items — linear/area must be measured by the user
    if (item.type === "count" && item.quantity) {
      updateTakeoff(last.id, "quantity", item.quantity);
    }

    // Create measurements on the drawing from AI-detected locations
    const pts = aiToCanvasCoords(item.locations || []);
    if (pts.length > 0 && selectedDrawingId) {
      if (item.type === "count") {
        // Each point is a count marker
        pts.forEach(p => {
          addMeasurement(last.id, {
            type: "count", sheetId: selectedDrawingId,
            points: [p], value: 1, color,
          });
        });
      } else if (item.type === "linear" && pts.length >= 2) {
        // Reference marker — user will re-measure with calibrated tools for accurate LF
        addMeasurement(last.id, {
          type: "linear", sheetId: selectedDrawingId,
          points: pts.slice(0, 2), value: null, color,
        });
      } else if (item.type === "area" && pts.length >= 3) {
        // Reference marker — user will re-measure with calibrated tools for accurate SF
        addMeasurement(last.id, {
          type: "area", sheetId: selectedDrawingId,
          points: pts, value: null, color,
        });
      } else if (pts.length === 1) {
        // Single point fallback — count marker
        addMeasurement(last.id, {
          type: "count", sheetId: selectedDrawingId,
          points: [pts[0]], value: item.type === "count" ? (item.quantity || 1) : 1, color,
        });
      }
      // Select this takeoff so it renders at full opacity
      setTkSelectedTakeoffId(last.id);
    }

    const hint = item.type !== "count" ? " — measure for accurate qty" : "";
    showToast(`Added: ${item.name}${hint}`);
    setAiDrawingAnalysis(prev => prev ? { ...prev, results: prev.results.filter(r => r !== item) } : null);
  };

  const acceptAllDrawingItems = () => {
    if (!aiDrawingAnalysis?.results) return;
    const group = drawings.find(d => d.id === selectedDrawingId)?.sheetNumber || "";
    let countItems = 0, measureItems = 0;
    aiDrawingAnalysis.results.forEach(item => {
      const colorIdx = useTakeoffsStore.getState().takeoffs.length;
      const color = TO_COLORS[colorIdx % TO_COLORS.length];
      addTakeoff(group, item.name, item.unit, item.code);
      const newTo = useTakeoffsStore.getState().takeoffs;
      const last = newTo[newTo.length - 1];
      if (!last) return;

      // Only set quantity for count items
      if (item.type === "count" && item.quantity) {
        updateTakeoff(last.id, "quantity", item.quantity);
        countItems++;
      } else {
        measureItems++;
      }

      // Create measurements on the drawing
      const pts = aiToCanvasCoords(item.locations || []);
      if (pts.length > 0 && selectedDrawingId) {
        if (item.type === "count") {
          pts.forEach(p => {
            addMeasurement(last.id, {
              type: "count", sheetId: selectedDrawingId,
              points: [p], value: 1, color,
            });
          });
        } else if (item.type === "linear" && pts.length >= 2) {
          addMeasurement(last.id, {
            type: "linear", sheetId: selectedDrawingId,
            points: pts.slice(0, 2), value: null, color,
          });
        } else if (item.type === "area" && pts.length >= 3) {
          addMeasurement(last.id, {
            type: "area", sheetId: selectedDrawingId,
            points: pts, value: null, color,
          });
        } else if (pts.length === 1) {
          addMeasurement(last.id, {
            type: "count", sheetId: selectedDrawingId,
            points: [pts[0]], value: item.type === "count" ? (item.quantity || 1) : 1, color,
          });
        }
      }
    });
    const msg = `Added ${aiDrawingAnalysis.results.length} items` + (measureItems > 0 ? ` — ${measureItems} need measuring` : "");
    showToast(msg);
    setAiDrawingAnalysis(null);
  };

  // ─── AI Wall Schedule Detection ─────────────────────────────────
  const mapWallTypeToModuleSpecs = (wallType) => {
    const catId = wallType.category === "exterior" ? "ext-walls" : "int-walls";
    const catDef = MODULES.walls?.categories?.find(c => c.id === catId);
    if (!catDef) return null;

    const mappedSpecs = {};
    const warnings = [];

    // Map Material
    if (wallType.material) {
      const materialSpec = catDef.specs.find(s => s.id === "Material");
      if (materialSpec?.options?.includes(wallType.material)) {
        mappedSpecs.Material = wallType.material;
      } else if (materialSpec?.options) {
        const fuzzy = materialSpec.options.find(o => o.toLowerCase() === String(wallType.material).toLowerCase());
        if (fuzzy) mappedSpecs.Material = fuzzy;
        else warnings.push(`Material "${wallType.material}" not recognized`);
      }
    }

    // Map WallHeight
    if (wallType.wallHeight) {
      mappedSpecs.WallHeight = Number(wallType.wallHeight);
    }

    // Map each AI-detected spec
    if (wallType.specs) {
      for (const [specId, value] of Object.entries(wallType.specs)) {
        const specDef = catDef.specs.find(s => s.id === specId);
        if (!specDef) { warnings.push(`Unknown spec: ${specId} = "${value}"`); continue; }
        if (specDef.options) {
          if (specDef.options.includes(value)) {
            mappedSpecs[specId] = value;
          } else {
            // Fuzzy match: normalize whitespace/casing
            const norm = v => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');
            const match = specDef.options.find(o => norm(o) === norm(value));
            if (match) mappedSpecs[specId] = match;
            else warnings.push(`${specDef.label || specId}: "${value}" not in options`);
          }
        } else {
          mappedSpecs[specId] = value;
        }
      }
    }

    return {
      catId,
      label: `Type ${wallType.typeLabel}`,
      specs: mappedSpecs,
      warnings,
      wallType,
    };
  };

  // Crop a region of an image at high resolution for AI reading
  const cropDrawingRegion = (imgSrc, bbox) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // bbox is {x, y, width, height} as fractions 0-1 of image dimensions
        const srcX = Math.max(0, Math.floor(bbox.x * img.width));
        const srcY = Math.max(0, Math.floor(bbox.y * img.height));
        const srcW = Math.min(img.width - srcX, Math.ceil(bbox.width * img.width));
        const srcH = Math.min(img.height - srcY, Math.ceil(bbox.height * img.height));
        if (srcW <= 0 || srcH <= 0) { resolve(null); return; }

        // Render at high resolution — up to 2000px on longest side
        const maxDim = 2000;
        const scale = Math.min(maxDim / srcW, maxDim / srcH, 3);
        const outW = Math.round(srcW * scale);
        const outH = Math.round(srcH * scale);

        const canvas = document.createElement("canvas");
        canvas.width = outW; canvas.height = outH;
        canvas.getContext("2d").drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
        resolve(dataUrl.split(",")[1]);
      };
      img.onerror = () => resolve(null);
      img.src = imgSrc;
    });
  };

  // ─── PDF-native Schedule Scan (instant, no API) ─────
  // AI vision fallback for schedule detection on scanned/raster PDFs
  const aiScheduleScan = async (imgSrc) => {
    const { base64 } = await optimizeImageForAI(imgSrc, 1400);
    const result = await callAnthropic({
      max_tokens: 4000,
      system: "You analyze construction drawings to find and extract schedule tables (door schedules, window schedules, wall type schedules, finish schedules, equipment schedules, etc.). Return structured JSON.",
      messages: [{ role: "user", content: [
        { type: "text", text: `Find all schedule tables on this drawing. For each schedule found, return:
- title: schedule title (e.g., "Door Schedule", "Window Schedule", "Wall Type Schedule")
- type: "door" | "window" | "wall" | "finish" | "equipment" | "other"
- columns: array of column header names
- rows: array of objects, each representing one row with column values
- itemCount: number of rows/items in the schedule

If no schedules are visible, return an empty array.
Return ONLY a JSON array of schedule objects.` },
        imageBlock(base64),
      ] }],
    });
    let parsed;
    try { parsed = JSON.parse(result.replace(/```json|```/g, "").trim()); } catch { parsed = null; }
    return Array.isArray(parsed) ? parsed : [];
  };

  const runPdfScheduleScan = useCallback(async () => {
    setPdfSchedules({ loading: true, results: null });
    try {
      const schedules = await scanAllDrawingsForSchedules(drawings.filter(d => d.data && d.type === "pdf"));
      if (schedules.length > 0) {
        setPdfSchedules({ loading: false, results: schedules });
        const totalItems = schedules.reduce((s, sc) => s + sc.itemCount, 0);
        showToast(`Found ${schedules.length} schedule(s) with ${totalItems} items`);
      } else {
        // Native scan found nothing — fall back to AI vision on current drawing
        const drawing = selectedDrawingId && drawings.find(d => d.id === selectedDrawingId);
        const imgSrc = drawing && (drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId]);
        if (imgSrc) {
          showToast("No text-based schedules found — trying AI vision...", "info");
          try {
            const aiResults = await aiScheduleScan(imgSrc);
            if (aiResults.length > 0) {
              setPdfSchedules({ loading: false, results: aiResults });
              const totalItems = aiResults.reduce((s, sc) => s + (sc.itemCount || sc.rows?.length || 0), 0);
              showToast(`AI found ${aiResults.length} schedule(s) with ${totalItems} items`);
            } else {
              setPdfSchedules({ loading: false, results: [] });
              showToast("No schedules found on this sheet");
            }
          } catch (aiErr) {
            console.warn("AI schedule scan failed:", aiErr);
            setPdfSchedules({ loading: false, results: [] });
            showToast("No schedules found in PDF text or via AI");
          }
        } else {
          setPdfSchedules({ loading: false, results: [] });
          showToast("No schedules found. Select a drawing to try AI detection.");
        }
      }
    } catch (err) {
      console.error("Schedule scan error:", err);
      setPdfSchedules({ loading: false, results: null });
      showToast("Schedule scan failed: " + (err.message || "unknown error"), "error");
    }
  }, [drawings, selectedDrawingId, pdfCanvases, showToast]);

  // ─── Geometry Analysis (wall/room detection from vectors) ─────
  const runGeometryAnalysis = useCallback(async () => {
    if (!selectedDrawingId) return;
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing || drawing.type !== "pdf" || !drawing.data) {
      showToast("Select a PDF drawing to analyze geometry", "error");
      return;
    }
    setGeoAnalysis({ loading: true, results: null });
    try {
      const result = await analyzeDrawingGeometry(drawing);
      setGeoAnalysis({ loading: false, results: result });
      const s = result.stats;
      showToast(`Detected ${s.totalWalls} walls, ${s.totalRooms} rooms, ${s.totalOpenings} openings`);
    } catch (err) {
      console.error("Geometry analysis error:", err);
      setGeoAnalysis({ loading: false, results: null });
      showToast("Geometry analysis failed: " + (err.message || "unknown error"), "error");
    }
  }, [selectedDrawingId, drawings, showToast]);

  const runWallScheduleDetection = async () => {
    if (!selectedDrawingId) return;
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing) return;
    const imgSrc = drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId];
    if (!imgSrc) { showToast("Drawing image not available", "error"); return; }

    setWallSchedule({ loading: true, results: null, error: null });
    try {
      // ── PASS 1: Locate the schedule on the full page ──
      const { base64: fullBase64 } = await optimizeImageForAI(imgSrc, 1400);

      const locateResult = await callAnthropic({
        max_tokens: 500,
        system: "You locate schedule tables on architectural drawings. Return only JSON.",
        messages: [{ role: "user", content: [
          { type: "text", text: `Find the WALL TYPE SCHEDULE on this architectural drawing sheet.

Return a JSON object with:
- "found": true/false
- "bbox": {"x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0}
  (bounding box as fractions of image width/height)
- "title": The exact title of the schedule as printed

If no wall schedule is found, return: {"found": false}
Return ONLY the JSON object, nothing else.` },
          imageBlock(fullBase64),
        ] }],
      });

      let locateData;
      try { locateData = JSON.parse(locateResult.replace(/```json|```/g, "").trim()); } catch {
        const m = locateResult.match(/\{[\s\S]*\}/);
        if (m) try { locateData = JSON.parse(m[0]); } catch { locateData = null; }
      }

      if (!locateData?.found || !locateData?.bbox) {
        setWallSchedule({ loading: false, results: null, error: "No wall type schedule found on this sheet." });
        showToast("No wall type schedule found on this sheet", "error");
        return;
      }

      // ── PASS 2: Crop and parse at high resolution ──
      // Add padding around the detected bbox
      const pad = 0.02;
      const bbox = {
        x: Math.max(0, locateData.bbox.x - pad),
        y: Math.max(0, locateData.bbox.y - pad),
        width: Math.min(1 - Math.max(0, locateData.bbox.x - pad), locateData.bbox.width + pad * 2),
        height: Math.min(1 - Math.max(0, locateData.bbox.y - pad), locateData.bbox.height + pad * 2),
      };

      const croppedBase64 = await cropDrawingRegion(imgSrc, bbox);
      if (!croppedBase64) {
        setWallSchedule({ loading: false, results: null, error: "Failed to crop schedule region" });
        showToast("Failed to crop schedule region", "error");
        return;
      }

      showToast("Schedule located — reading details...");

      const result = await callAnthropic({
        max_tokens: 4096,
        system: "You are a construction estimating AI that reads wall type schedules from architectural drawings. You extract precise, structured data. You are meticulous about reading EXACT type designators and spec values as printed.",
        messages: [{ role: "user", content: [
          { type: "text", text: `This is a cropped, high-resolution view of a wall type schedule from an architectural drawing.

Read EVERY wall type in this schedule and extract the following for each:

- "typeLabel": The EXACT type designator/identifier as printed (e.g., "A", "W1", "WT-1", "P2", "1A").
  Read this EXACTLY from the drawing — do not rename or reformat.
- "description": Full written description from the schedule
- "category": "interior" or "exterior"
- "material": One of: "Wood", "Metal Stud", "CMU", "Concrete", "ICF", "Tilt-Up", "Precast", "SIP", "3D Printed"
- "wallHeight": Height in feet as a number (only if specified)
- "specs": Object with applicable keys:

  For Metal Stud walls (most common in commercial):
    "MSStudSize": EXACT stud depth — "1-5/8\\"", "2-1/2\\"", "3-5/8\\"", "4\\"", "6\\"", "8\\"", or "10\\""
    "MSGauge": "25 ga", "22 ga", "20 ga", "18 ga", "16 ga", "14 ga", or "12 ga"
    "MSSpacing": "12\\" OC", "16\\" OC", or "24\\" OC"

  For Wood walls:
    "StudSize": "2x4", "2x6", "2x8", etc.
    "PlanSpacing": "12\\" OC", "16\\" OC", or "24\\" OC"
    "TopPlates": "Single", "Double", or "Triple"
    "BotPlates": "Single" or "Double"

  For CMU walls:
    "CMUWidth": "6\\"", "8\\"", "10\\"", or "12\\""
    "CMUGrout": "Rebar Cells Only" or "Solid Grouted"

  For Concrete walls:
    "ConcThickness": "6\\"", "8\\"", "10\\"", or "12\\""

  Drywall (applies to ALL material types):
    "DwType": "None", "1/2\\" Standard", "5/8\\" Standard", "5/8\\" Type X", "5/8\\" Type C", "1/2\\" Moisture Resistant", "5/8\\" Moisture Resistant", or "5/8\\" Abuse Resistant"
    "DwLayers": "1", "2", or "3"
    "DwHeight": Height in feet as a number (only if different from wall height, otherwise omit)

- "finishes": {"interior": "...", "exterior": "...", "insulation": "..."}
- "confidence": "high", "medium", or "low"
- "notes": Fire rating, STC, UL assembly, any other data from the schedule

IMPORTANT:
- Metal studs use sizes like 1-5/8", 2-1/2", 3-5/8", 6" — NOT lumber sizes like 2x4.
- Read typeLabel EXACTLY as printed — common formats: circled letters, column headers, bold labels.
- Return ONLY a valid JSON array: [{...}, {...}, ...]` },
          imageBlock(croppedBase64),
        ] }],
      });

      // Robust JSON parsing
      let parsed = null;
      const cleaned = result.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      try { parsed = JSON.parse(cleaned); } catch {
        const arrMatch = cleaned.match(/\[[\s\S]*\]/);
        if (arrMatch) try { parsed = JSON.parse(arrMatch[0]); } catch { /* fall through */ }
        if (!parsed) {
          const objMatch = cleaned.match(/\{[\s\S]*\}/);
          if (objMatch) try { parsed = JSON.parse(objMatch[0]); } catch { /* fall through */ }
        }
      }

      if (parsed && parsed.error) {
        setWallSchedule({ loading: false, results: null, error: parsed.error });
        showToast(parsed.error, "error");
        return;
      }

      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        const mapped = parsed.map(wt => mapWallTypeToModuleSpecs(wt)).filter(Boolean);
        setWallSchedule({ loading: false, results: mapped, error: null });
        showToast(`Found ${mapped.length} wall types on this sheet`);
      } else {
        setWallSchedule({ loading: false, results: null, error: "Could not parse wall schedule data" });
        showToast("Failed to parse wall schedule", "error");
      }
    } catch (err) {
      setWallSchedule({ loading: false, results: null, error: err.message });
      showToast(`Wall schedule error: ${err.message}`, "error");
    }
  };

  const createWallInstances = (selectedItems) => {
    const store = useModuleStore.getState();
    if (store.activeModule !== "walls") {
      useModuleStore.getState().setActiveModule("walls");
    }

    let created = 0;
    selectedItems.forEach(mapped => {
      // Check for existing instance with same label
      const existing = (store.moduleInstances?.walls?.categoryInstances?.[mapped.catId] || []);
      if (existing.some(inst => inst.label === mapped.label)) return; // skip duplicate

      // Add new instance
      useModuleStore.getState().addCategoryInstance("walls", mapped.catId);

      // Get the newly created instance (last in array)
      const updatedState = useModuleStore.getState();
      const catInstances = updatedState.moduleInstances?.walls?.categoryInstances?.[mapped.catId] || [];
      const newInstance = catInstances[catInstances.length - 1];
      if (!newInstance) return;

      // Set label
      useModuleStore.getState().renameCategoryInstance("walls", mapped.catId, newInstance.id, mapped.label);

      // Set each spec
      for (const [specId, value] of Object.entries(mapped.specs)) {
        useModuleStore.getState().setCatInstanceSpec("walls", mapped.catId, newInstance.id, specId, value);
      }
      created++;
    });

    showToast(`Created ${created} wall type instance${created !== 1 ? "s" : ""}`);
    setWallSchedule({ loading: false, results: null, error: null });
  };

  const finishCalibration = () => {
    if (tkActivePoints.length < 2 || !nn(tkCalibInput.dist)) return;
    setTkCalibrations({ ...tkCalibrations, [selectedDrawingId]: { p1: tkActivePoints[0], p2: tkActivePoints[1], realDist: nn(tkCalibInput.dist), unit: tkCalibInput.unit } });
    setTkActivePoints([]); setTkCalibInput({ dist: "", unit: "ft" }); setTkTool("select");
    showToast("Scale calibrated!");
  };

  // Variables & Formula
  const addTakeoffVariable = (id) => setTakeoffs(takeoffs.map(t => t.id === id ? { ...t, variables: [...(t.variables || []), { key: "", value: "" }] } : t));
  const updateTakeoffVariable = (id, idx, field, val) => setTakeoffs(takeoffs.map(t => {
    if (t.id !== id) return t;
    const vars = [...(t.variables || [])]; vars[idx] = { ...vars[idx], [field]: val }; return { ...t, variables: vars };
  }));
  const removeTakeoffVariable = (id, idx) => setTakeoffs(takeoffs.map(t => {
    if (t.id !== id) return t;
    const vars = [...(t.variables || [])]; vars.splice(idx, 1); return { ...t, variables: vars };
  }));

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

  // Panel resize
  const startTkDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX; const startW = tkPanelWidth;
    const onMove = (ev) => { setTkPanelWidth(Math.max(280, Math.min(700, startW + (ev.clientX - startX)))); };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [tkPanelWidth, setTkPanelWidth]);

  // Render PDF page
  const renderPdfPage = useCallback(async (drawing) => {
    // Check latest store state to avoid stale closure
    const current = useDrawingsStore.getState().pdfCanvases;
    if (current[drawing.id]) return current[drawing.id];
    if (drawing.type !== "pdf" || !drawing.data) return null;
    try {
      await loadPdfJs();
      // Fast base64 decode using fetch + arrayBuffer
      const resp = await fetch(`data:application/pdf;base64,${drawing.data}`);
      const buf = await resp.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      const pg = await pdf.getPage(drawing.pdfPage || 1);
      const scale = 1.5; const vp = pg.getViewport({ scale });
      const canvas = document.createElement("canvas"); canvas.width = vp.width; canvas.height = vp.height;
      await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      const url = canvas.toDataURL("image/jpeg", 0.8);
      // Use functional update to avoid stale closure in batch renders
      useDrawingsStore.setState(s => ({ pdfCanvases: { ...s.pdfCanvases, [drawing.id]: url } }));
      return url;
    } catch (e) { console.error("renderPdfPage:", e); return null; }
  }, []);

  // Helper: select a drawing by ID (for command palette)
  const handleSelectDrawing = useCallback((id) => {
    setSelectedDrawingId(id);
    const d = useDrawingsStore.getState().drawings.find(dr => dr.id === id);
    if (d?.type === "pdf" && d.data) renderPdfPage(d);
  }, [renderPdfPage]);

  // ─── OUTLINE TOOL — trace building perimeter for Model tab ────
  const handleOutlineClick = useCallback((e) => {
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
    const finishOutline = (vertices) => {
      // Always save raw pixel polygon for canvas overlay rendering
      const pixelPoly = vertices.map(p => ({ x: p.x, y: p.y }));
      // Convert pixel polygon to feet via outlineToFeet for 3D rendering
      try {
        const feetPoly = outlineToFeet(pixelPoly, selectedDrawingId);
        useModelStore.getState().setOutline(selectedDrawingId, feetPoly, 'manual', pixelPoly);
        showToast(`Building outline saved (${vertices.length} vertices)`);
      } catch (err) {
        // Fallback — save pixel coords mapped to {x, z}
        console.warn('outlineToFeet failed, using pixel coords:', err);
        useModelStore.getState().setOutline(selectedDrawingId, vertices.map(p => ({ x: p.x, z: p.y })), 'manual', pixelPoly);
        showToast(`Outline saved (${vertices.length} pts) — set scale for accurate 3D`);
      }
      setTkActivePoints([]);
      setTkTool("select");
    };

    if (pts.length >= 3) {
      const first = pts[0];
      const dist = Math.sqrt((cx - first.x) ** 2 + (cy - first.y) ** 2);
      if (dist < 15 || e.detail === 2) { finishOutline(pts); return; }
    }
    if (e.detail === 2 && pts.length >= 3) { finishOutline(pts); return; }

    // Apply snap angle when Shift is held
    const snappedPt = (e.shiftKey && pts.length >= 1)
      ? snapAngle(pts[pts.length - 1], pt)
      : pt;
    setTkActivePoints([...pts, snappedPt]);
  }, [tkTool, tkActivePoints, selectedDrawingId, showToast]);

  // ─── CANVAS CLICK HANDLER ──────────
  const handleCanvasClick = useCallback((e) => {
    if (!canvasRef.current || !selectedDrawingId) return;
    setTkContextMenu(null);

    // Read fresh state from store to avoid stale closure after engageMeasuring
    const freshState = useTakeoffsStore.getState();
    const currentMeasureState = freshState.tkMeasureState;
    const currentActiveTakeoffId = freshState.tkActiveTakeoffId;
    const currentTool = freshState.tkTool;

    const rect = canvasRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    const pt = { x: cx, y: cy };

    // ── Count prediction helpers (shared by paused handler and main count path) ──
    const handleCountPredictions = (clickPt, to) => {
      const s = useTakeoffsStore.getState();
      const currentActiveId = s.tkActiveTakeoffId;
      const { tkPredictions: preds, tkPredAccepted: accepted, tkPredRejected: rejected } = s;
      if (preds && preds.predictions.length > 0) {
        const nearbyPred = findNearbyPrediction(preds.predictions, clickPt, accepted, rejected, 30);
        if (nearbyPred) {
          acceptPrediction(nearbyPred.id);
          recordPredictionFeedback(preds.tag, preds.strategy, true);
          addMeasurement(currentActiveId, {
            type: "count", points: [nearbyPred.point || clickPt], value: 1,
            sheetId: useDrawingsStore.getState().selectedDrawingId, color: to.color, predicted: true, tag: preds.tag,
          });
          return true;
        }
        recordPredictionMiss();
        const ctx = useTakeoffsStore.getState().tkPredContext;
        if (ctx && ctx.consecutiveMisses >= 3) {
          clearPredictions();
          const drawingId = useDrawingsStore.getState().selectedDrawingId;
          const drawing = useDrawingsStore.getState().drawings.find(d => d.id === drawingId);
          if (drawing && drawing.type === "pdf" && drawing.data) {
            runSmartPredictions(drawing, to, "count", clickPt).then(result => {
              if (useTakeoffsStore.getState().tkActiveTakeoffId !== currentActiveId) return;
              if (result.predictions.length > 0) {
                setTkPredictions({ tag: result.tag, predictions: result.predictions, scanning: false, totalInstances: result.totalInstances, source: result.source });
                initPredContext(result.tag, result.source, result.confidence);
              }
            }).catch(err => console.warn("Prediction re-scan failed:", err));
          }
        }
      }
      return false;
    };

    const triggerCountPredictions = (clickPt, to) => {
      const { tkPredictions: preds } = useTakeoffsStore.getState();
      if (!preds) {
        const drawing = useDrawingsStore.getState().drawings.find(d => d.id === selectedDrawingId);
        if (drawing && drawing.type === "pdf" && drawing.data) {
          runSmartPredictions(drawing, to, "count", clickPt).then(result => {
            if (useTakeoffsStore.getState().tkActiveTakeoffId !== tkActiveTakeoffId) return;
            if (result.predictions.length > 0) {
              setTkPredictions({ tag: result.tag, predictions: result.predictions, scanning: false, totalInstances: result.totalInstances, source: result.source });
              initPredContext(result.tag, result.source, result.confidence);
              showToast(`Found ${result.predictions.length} more "${result.tag || "items"}" — review predictions`);
            }
            // Silently skip — no toast when predictions find nothing, user can still count manually
          }).catch(err => console.warn("Prediction scan failed:", err));
        }
      }
    };

    // Auto-count sample selection — capture sample, then run AI vision
    if (tkAutoCount?.phase === "select") {
      setTkAutoCount({ ...tkAutoCount, phase: "scanning", samplePt: pt });
      // Get the drawing image for AI analysis
      const drawing = drawings.find(d => d.id === selectedDrawingId);
      if (!drawing) { setTkAutoCount(null); return; }
      const imgSrc = drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId];
      if (!imgSrc) {
        showToast("Drawing image not available", "error");
        setTkAutoCount(null); return;
      }
      // Run AI vision in background
      (async () => {
        try {
          const to = takeoffs.find(t => t.id === tkAutoCount.takeoffId);
          const { base64: fullImg } = await optimizeImageForAI(imgSrc, 1400);
          // Crop a sample region around the click point (200x200 px region)
          const cropSize = 120;
          const cropX = Math.max(0, pt.x - cropSize / 2);
          const cropY = Math.max(0, pt.y - cropSize / 2);
          const sampleImg = await cropImageRegion(imgSrc, cropX, cropY, cropSize, cropSize, 300);

          const result = await callAnthropic({
            max_tokens: 1500,
            system: "You are a construction drawing symbol detection AI. You analyze architectural/engineering drawings to find and count repeated symbols.",
            messages: [{ role: "user", content: [
              { type: "text", text: `I've selected a sample symbol on this construction drawing. The sample is from the area I clicked. The takeoff item is: "${to?.description || "Symbol"}".

TASK: Look at the SAMPLE IMAGE to understand what symbol/element I selected. Then look at the FULL DRAWING and count ALL instances of that same symbol or very similar symbols across the entire sheet.

Return ONLY a JSON object like: {"count": 12, "description": "door swing symbols", "confidence": "high"}
Where confidence is "high", "medium", or "low".` },
              { type: "text", text: "SAMPLE (the symbol I clicked on):" },
              imageBlock(sampleImg),
              { type: "text", text: "FULL DRAWING (count all similar symbols):" },
              imageBlock(fullImg),
            ] }],
          });

          let parsed;
          try { parsed = JSON.parse(result.replace(/```json|```/g, "").trim()); } catch { parsed = null; }
          if (parsed?.count) {
            setTkAutoCount(prev => ({ ...prev, phase: "done", results: Array.from({ length: parsed.count }, (_, i) => ({ id: i })) }));
            // Update the takeoff quantity
            const existingQty = nn(to?.quantity || 0);
            const currentMeasurements = (to?.measurements || []).filter(m => m.sheetId === selectedDrawingId);
            const newCount = parsed.count;
            updateTakeoff(tkAutoCount.takeoffId, "quantity", existingQty + newCount);
            showToast(`AI detected ${newCount} ${parsed.description || "symbols"} (${parsed.confidence || "medium"} confidence)`);
          } else {
            setTkAutoCount(prev => ({ ...prev, phase: "done", results: [] }));
            showToast("AI couldn't reliably detect symbols — try a clearer sample", "error");
          }
        } catch (err) {
          setTkAutoCount(prev => prev ? { ...prev, phase: "done", results: [] } : null);
          showToast(`Auto-count error: ${err.message}`, "error");
        }
      })();
      return;
    }

    // Calibrate mode
    if (currentTool === "calibrate") {
      if (tkActivePoints.length === 0) { setTkActivePoints([pt]); } else { setTkActivePoints([tkActivePoints[0], pt]); }
      return;
    }

    // Paused — re-engage
    if (currentMeasureState === "paused" && currentActiveTakeoffId) {
      setTkMeasureState("measuring");
      if (currentTool === "count") {
        const to = takeoffs.find(t => t.id === currentActiveTakeoffId);
        if (to) {
          if (handleCountPredictions(pt, to)) {
            if (e.detail === 2) pauseMeasuring();
            return;
          }
          addMeasurement(currentActiveTakeoffId, { type: "count", points: [pt], value: 1, sheetId: selectedDrawingId, color: to.color });
          triggerCountPredictions(pt, to);
          if (e.detail === 2) pauseMeasuring();
        }
        return;
      }
      setTkActivePoints([pt]);
      return;
    }

    if (currentMeasureState !== "measuring" || !currentActiveTakeoffId) {
      // Auto-engage: if a takeoff is selected but not engaged, clicking the canvas starts measuring
      const selectedId = freshState.tkSelectedTakeoffId;
      if (selectedId && selectedDrawingId) {
        const selTo = freshState.takeoffs.find(t => t.id === selectedId);
        if (selTo) {
          engageMeasuring(selectedId);
          // Use this click as the first measurement point
          const tool = unitToTool(selTo.unit);
          if (tool === "count") {
            addMeasurement(selectedId, { type: "count", points: [pt], value: 1, sheetId: selectedDrawingId, color: selTo.color });
          } else {
            setTkActivePoints([pt]);
          }
          return;
        }
      }

      // Hit-test: click on existing measurement → select that takeoff
      // Scale thresholds by inverse zoom so they stay consistent in screen pixels
      const zoomScale = Math.max(1, (canvasRef.current?.width || 1) / (canvasRef.current?.getBoundingClientRect().width || 1));
      const countRadius = Math.max(30, 30 * zoomScale);
      const lineRadius = Math.max(12, 15 * zoomScale);
      for (const to of takeoffs) {
        for (const m of (to.measurements || [])) {
          if (m.sheetId !== selectedDrawingId) continue;
          if (m.type === "count") {
            const d = Math.sqrt((pt.x - m.points[0].x) ** 2 + (pt.y - m.points[0].y) ** 2);
            if (d < countRadius) { setTkSelectedTakeoffId(to.id); return; }
          } else if (m.type === "linear" && m.points.length >= 2) {
            for (let i = 0; i < m.points.length - 1; i++) {
              const a = m.points[i], b = m.points[i + 1];
              const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
              if (len < 1) continue;
              const t = Math.max(0, Math.min(1, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (len * len)));
              const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
              const dist = Math.sqrt((pt.x - proj.x) ** 2 + (pt.y - proj.y) ** 2);
              if (dist < lineRadius) { setTkSelectedTakeoffId(to.id); return; }
            }
          } else if (m.type === "area" && m.points.length >= 3) {
            // Point-in-polygon test (ray casting) — no threshold needed
            let inside = false;
            const pts = m.points;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
              const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
              if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) inside = !inside;
            }
            if (inside) { setTkSelectedTakeoffId(to.id); return; }
          }
        }
      }
      return;
    }
    const to = takeoffs.find(t => t.id === currentActiveTakeoffId);
    if (!to) return;

    // Apply snap angle when Shift is held (not for count tool or first point)
    const snappedPt = (e.shiftKey && tkActivePoints.length >= 1)
      ? snapAngle(tkActivePoints[tkActivePoints.length - 1], pt)
      : pt;

    // COUNT
    if (currentTool === "count") {
      // ── Proximity auto-accept: if clicking near a ghost prediction, accept it instead ──
      if (handleCountPredictions(pt, to)) {
        if (e.detail === 2) { pauseMeasuring(); }
        return;
      }

      addMeasurement(currentActiveTakeoffId, { type: "count", points: [pt], value: 1, sheetId: selectedDrawingId, color: to.color });

      // Predictive takeoff: run smart predictions whenever none exist
      triggerCountPredictions(pt, to);
      if (e.detail === 2) { pauseMeasuring(); }
      return;
    }

    // LINEAR
    if (currentTool === "linear") {
      if (e.detail === 2 && tkActivePoints.length >= 2) {
        addMeasurement(currentActiveTakeoffId, { type: "linear", points: [...tkActivePoints], value: 0, sheetId: selectedDrawingId, color: to.color });
        if (hasScale(selectedDrawingId)) {
          const len = calcPolylineLength(tkActivePoints, selectedDrawingId);
          showToast(`Linear: ${Math.round(len * 100) / 100} ${getDisplayUnit(selectedDrawingId)}`);
        } else { showToast("Linear measurement saved — set scale to see value"); }
        // Track prediction match/miss for linear measurements
        const { tkPredictions: linPreds, tkPredAccepted: linAccepted, tkPredRejected: linRejected } = useTakeoffsStore.getState();
        if (linPreds && linPreds.predictions.length > 0) {
          const nearbyPred = findNearbyPrediction(linPreds.predictions, tkActivePoints[0], linAccepted, linRejected, 50);
          if (nearbyPred) {
            acceptPrediction(nearbyPred.id);
            recordPredictionFeedback(linPreds.tag, linPreds.strategy, true);
          } else {
            recordPredictionMiss();
            const ctx = useTakeoffsStore.getState().tkPredContext;
            if (ctx && ctx.consecutiveMisses >= 3) {
              clearPredictions();
              // Re-analyze below
            }
          }
        }

        // Predictive takeoff: run smart predictions whenever none exist
        if (!linPreds) {
          const drawing = useDrawingsStore.getState().drawings.find(d => d.id === selectedDrawingId);
          if (drawing && drawing.type === "pdf" && drawing.data) {
            (async () => {
              try {
                const result = await runSmartPredictions(drawing, to, "linear", tkActivePoints[0]);
                if (result.predictions.length > 0) {
                  setTkPredictions({ tag: result.tag, predictions: result.predictions, scanning: false, totalInstances: result.totalInstances, source: result.source });
                  initPredContext(result.tag, result.source, result.confidence);
                  showToast(`Found ${result.predictions.length} more "${result.tag || "walls"}" — review predictions`);
                }
              } catch (err) { console.warn("Prediction scan failed:", err); }
            })();
          }
        }
        pauseMeasuring();
        return;
      }
      setTkActivePoints([...tkActivePoints, snappedPt]);
      return;
    }

    // AREA
    if (currentTool === "area") {
      if (tkActivePoints.length >= 3) {
        const first = tkActivePoints[0];
        const dist = Math.sqrt((cx - first.x) ** 2 + (cy - first.y) ** 2);
        if (dist < 15) {
          addMeasurement(currentActiveTakeoffId, { type: "area", points: [...tkActivePoints], value: 0, sheetId: selectedDrawingId, color: to.color });
          if (hasScale(selectedDrawingId)) {
            const area = calcPolygonArea(tkActivePoints, selectedDrawingId);
            showToast(`Area: ${Math.round(area * 100) / 100} ${getDisplayUnit(selectedDrawingId)}²`);
          } else { showToast("Area measurement saved — set scale to see value"); }
          // Area predictions: run smart predictions whenever none exist
          const { tkPredictions: areaPreds } = useTakeoffsStore.getState();
          if (!areaPreds) {
            const drawing = useDrawingsStore.getState().drawings.find(d => d.id === selectedDrawingId);
            if (drawing && drawing.type === "pdf" && drawing.data) {
              (async () => {
                try {
                  const result = await runSmartPredictions(drawing, to, "area", tkActivePoints[0]);
                  if (result.predictions.length > 0) {
                    setTkPredictions({ tag: result.tag, predictions: result.predictions, scanning: false, totalInstances: result.totalInstances, source: result.source });
                    initPredContext(result.tag, result.source, result.confidence);
                    showToast(`Found ${result.predictions.length} room predictions — review`);
                  }
                } catch (err) { console.warn("Area prediction scan failed:", err); }
              })();
            }
          }
          pauseMeasuring();
          return;
        }
      }
      if (e.detail === 2 && tkActivePoints.length >= 3) {
        addMeasurement(currentActiveTakeoffId, { type: "area", points: [...tkActivePoints], value: 0, sheetId: selectedDrawingId, color: to.color });
        if (hasScale(selectedDrawingId)) {
          const area = calcPolygonArea(tkActivePoints, selectedDrawingId);
          showToast(`Area: ${Math.round(area * 100) / 100} ${getDisplayUnit(selectedDrawingId)}²`);
        } else { showToast("Area measurement saved — set scale to see value"); }
        // Area predictions: run smart predictions whenever none exist
        const { tkPredictions: areaPredsDbl } = useTakeoffsStore.getState();
        if (!areaPredsDbl) {
          const drawing = useDrawingsStore.getState().drawings.find(d => d.id === selectedDrawingId);
          if (drawing && drawing.type === "pdf" && drawing.data) {
            (async () => {
              try {
                const result = await runSmartPredictions(drawing, to, "area", tkActivePoints[0]);
                if (result.predictions.length > 0) {
                  setTkPredictions({ tag: result.tag, predictions: result.predictions, scanning: false, totalInstances: result.totalInstances, source: result.source });
                  initPredContext(result.tag, result.source, result.confidence);
                  showToast(`Found ${result.predictions.length} room predictions — review`);
                }
              } catch (err) { console.warn("Area prediction scan failed:", err); }
            })();
          }
        }
        pauseMeasuring();
        return;
      }
      setTkActivePoints([...tkActivePoints, snappedPt]);
    }
  }, [tkTool, tkActivePoints, tkActiveTakeoffId, selectedDrawingId, takeoffs, tkCalibrations, tkMeasureState, tkAutoCount, drawingScales, drawingDpi, setTkSelectedTakeoffId, engageMeasuring, addMeasurement]);

  // ─── ZOOM / PAN ─────────────────────
  // Pinch (ctrlKey) = zoom, trackpad two-finger = pan, mouse wheel = zoom
  // Heuristic: trackpad produces deltaX (finger imprecision); mouse wheel = deltaX:0 only
  const handleDrawingWheel = useCallback((e) => {
    e.preventDefault();
    const container = drawingContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Track deltaX: trackpads almost always produce some lateral movement
    if (Math.abs(e.deltaX) > 0.5) tkLastWheelX.current = Date.now();

    // Determine zoom vs pan:
    // 1) Pinch gesture (trackpad sends ctrlKey=true) → zoom
    // 2) Line-mode scroll (deltaMode=1, e.g. old mouse wheels) → zoom
    // 3) Has lateral movement (deltaX) or had recent lateral → trackpad → pan
    // 4) Pure vertical pixel scroll with no recent lateral → mouse wheel → zoom
    const isPinch = e.ctrlKey || e.metaKey;
    const isLineMode = e.deltaMode === 1;
    const hadRecentLateral = (Date.now() - tkLastWheelX.current) < 500;
    const hasLateral = Math.abs(e.deltaX) > 0.5;
    const isTrackpadPan = !isPinch && !isLineMode && (hasLateral || hadRecentLateral);
    const isZoom = isPinch || isLineMode || (!isTrackpadPan && !hasLateral);

    if (isZoom) {
      // ZOOM at cursor position — read state directly (Zustand setters don't support functional updaters)
      const sensitivity = isPinch ? 0.006 : 0.003;
      const zoomFactor = Math.pow(2, -e.deltaY * sensitivity);
      const { tkZoom: prevZoom, tkPan: prevPan } = useTakeoffsStore.getState();
      const newZoom = Math.max(10, Math.min(800, Math.round(prevZoom * zoomFactor)));
      if (newZoom !== prevZoom) {
        const scaleChange = newZoom / prevZoom;
        setTkPan({ x: mx - scaleChange * (mx - prevPan.x), y: my - scaleChange * (my - prevPan.y) });
        setTkZoom(newZoom);
      }
    } else {
      // PAN: trackpad two-finger scroll
      const { tkPan: prevPan } = useTakeoffsStore.getState();
      setTkPan({ x: prevPan.x - e.deltaX, y: prevPan.y - e.deltaY });
    }
  }, [setTkZoom, setTkPan]);

  const handleDrawingMouseDown = useCallback((e) => {
    if (e.button === 2 || e.button === 1) {
      e.preventDefault();
      setTkContextMenu(null);
      tkPanning.current = true;
      tkPanStart.current = { x: e.clientX, y: e.clientY, panX: tkPan.x, panY: tkPan.y, moved: false };
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }
  }, [tkPan, setTkContextMenu]);

  // Pan listeners
  useEffect(() => {
    const onMove = (e) => {
      if (!tkPanning.current) return;
      const dx = e.clientX - tkPanStart.current.x;
      const dy = e.clientY - tkPanStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) tkPanStart.current.moved = true;
      setTkPan({ x: tkPanStart.current.panX + dx, y: tkPanStart.current.panY + dy });
    };
    const onUp = (e) => {
      if ((e.button === 2 || e.button === 1) && tkPanning.current) {
        const didMove = tkPanStart.current.moved;
        tkPanning.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (e.button === 2 && !didMove && (tkMeasureState === "measuring" || tkMeasureState === "paused")) {
          setTkContextMenu({ x: e.clientX, y: e.clientY });
        }
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [tkMeasureState, setTkPan, setTkContextMenu]);

  // Reset pan on drawing change
  useEffect(() => { setTkPan({ x: 0, y: 0 }); }, [selectedDrawingId, setTkPan]);

  // Clear + proactively trigger predictions when switching takeoff items or sheets
  // Only fires when actively measuring (not idle/selected-but-not-measuring)
  useEffect(() => {
    clearPredictions();
    if (!tkActiveTakeoffId || !selectedDrawingId) return;

    // Guard: only trigger predictions when actively measuring
    const currentMeasureState = useTakeoffsStore.getState().tkMeasureState;
    if (currentMeasureState !== "measuring" && currentMeasureState !== "paused") return;

    const to = useTakeoffsStore.getState().takeoffs.find(t => t.id === tkActiveTakeoffId);
    if (!to) return;
    const drawing = useDrawingsStore.getState().drawings.find(d => d.id === selectedDrawingId);
    if (!drawing || drawing.type !== "pdf" || !drawing.data) return;

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

    console.log("[NOVA] Proactive scan:", to.description, measureType, "at", clickPt);
    runSmartPredictions(drawing, to, measureType, clickPt).then(result => {
      console.log("[NOVA] Result:", result.source, result.strategy, result.tag, result.predictions.length, "predictions", result.message || "");
      // Double-check: takeoff must still be active AND result must be for this takeoff
      const currentActiveId = useTakeoffsStore.getState().tkActiveTakeoffId;
      if (currentActiveId !== tkActiveTakeoffId) return;
      if (result.takeoffId && result.takeoffId !== tkActiveTakeoffId) return;
      if (result.predictions.length > 0) {
        setTkPredictions({ tag: result.tag, predictions: result.predictions, scanning: false, totalInstances: result.totalInstances, source: result.source, strategy: result.strategy, takeoffId: result.takeoffId });
        initPredContext(result.tag, result.source, result.confidence);
      } else if (result.message) {
        // Store the message so NOVA panel can show contextual guidance
        setTkPredictions({ tag: null, predictions: [], scanning: false, totalInstances: 0, source: "none", strategy: result.strategy, message: result.message, takeoffId: result.takeoffId });
      }
    }).catch(err => console.warn("Proactive prediction failed:", err));
  }, [tkActiveTakeoffId, selectedDrawingId, tkMeasureState]);

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
    container.addEventListener('wheel', handleDrawingWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleDrawingWheel);
  }, [handleDrawingWheel]);

  // Keyboard flow — Escape / Tab / Enter for pro takeoff workflow
  useEffect(() => {
    const handler = (e) => {
      // Skip when user is typing in an input/textarea/select
      const tag = document.activeElement?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        setTkContextMenu(null);
        if (isTyping) { document.activeElement.blur(); return; }
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
  }, [tkTool, tkMeasureState, tkSelectedTakeoffId]);

  // DB search effect — search items + assemblies (NOVA only on explicit click)
  useEffect(() => {
    if (!tkNewInput.trim()) {
      setTkDbResults([]); setAiLookup(null);
      return;
    }
    setAiLookup(null); // Reset AI lookup when input changes

    const q = tkNewInput.toLowerCase();
    const itemResults = elements.filter(el =>
      (el.name || "").toLowerCase().includes(q) || (el.code || "").toLowerCase().includes(q)
    ).slice(0, 8);
    const asmResults = (assemblies || []).filter(a =>
      (a.name || "").toLowerCase().includes(q) || (a.code || "").toLowerCase().includes(q) || (a.description || "").toLowerCase().includes(q)
    ).slice(0, 4);
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
    return () => { cancelled = true; };
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
      const timers = adjacent.map((d, i) => setTimeout(() => {
        if (!cancelled) extractPageData(d).catch(() => {});
      }, 300 + i * 200)); // stagger: 300ms, 500ms
      return () => { cancelled = true; timers.forEach(clearTimeout); };
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
      if (predScanAnimRef.current) { cancelAnimationFrame(predScanAnimRef.current); predScanAnimRef.current = null; }
      return;
    }

    const activeTo = takeoffs.find(t => t.id === tkActiveTakeoffId);
    const predColor = activeTo?.color || "#8B5CF6";
    const predictions = tkPredictions.predictions;

    // Progressive confidence scaling
    const confidence = tkPredContext?.confidence || 0.7;
    const isRefining = tkPredRefining;

    // Confidence-based visual parameters (progressive reveal)
    const confLevel = confidence < 0.5 ? "low" : confidence < 0.75 ? "med" : "high";
    const ghostBaseOpacity = confLevel === "low" ? 0.20 : confLevel === "med" ? 0.35 : 0.50;
    const ghostPulseRange = confLevel === "low" ? 0.15 : confLevel === "med" ? 0.15 : 0.15;
    const ghostSize = confLevel === "low" ? 10 : confLevel === "med" ? 12 : 14;
    const ghostGlow = confLevel === "low" ? 6 : confLevel === "med" ? 10 : 14;

    // Animated render loop for ghost predictions + scan wave
    let lastTime = 0;
    const renderFrame = (time) => {
      if (!predictionCanvasRef.current) return;
      const ctx = predictionCanvasRef.current.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Advance scan wave phase (0→1 over 2 seconds, repeating)
      const dt = lastTime ? (time - lastTime) / 1000 : 0.016;
      lastTime = time;
      predScanPhaseRef.current = (predScanPhaseRef.current + dt * 0.5) % 1;
      const phase = predScanPhaseRef.current;

      predictions.forEach((pred, idx) => {
        const isAccepted = tkPredAccepted.includes(pred.id);
        const isRejected = tkPredRejected.includes(pred.id);
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

        if (pred.type === "count" || pred.type === "wall-tag") {
          const p = pred.point;
          const sz = isAccepted ? 16 : ghostSize;
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.PI / 4);
          ctx.shadowColor = isAccepted ? predColor : "#8B5CF6";
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
            ctx.fillStyle = `rgba(139, 92, 246, ${isAccepted ? 0.9 : 0.6})`;
            ctx.fillText("✦", sz * 0.5 + 2, -sz * 0.5 - 2);
          }
        } else if (pred.type === "wall" && pred.points?.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pred.points[0].x, pred.points[0].y);
          for (let i = 1; i < pred.points.length; i++) {
            ctx.lineTo(pred.points[i].x, pred.points[i].y);
          }
          ctx.shadowColor = isAccepted ? predColor : "#8B5CF6";
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
          ctx.shadowColor = isAccepted ? predColor : "#8B5CF6";
          ctx.shadowBlur = isAccepted ? 8 : ghostGlow * 0.5;
          ctx.fillStyle = isAccepted ? predColor + "25" : `rgba(139, 92, 246, 0.08)`;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = isAccepted ? predColor : `rgba(139, 92, 246, 0.5)`;
          ctx.lineWidth = isAccepted ? 2 : 1.5;
          ctx.setLineDash(isAccepted ? [] : [6, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          // Room label at centroid
          if (pred.point) {
            ctx.font = "bold 10px 'DM Sans', sans-serif";
            ctx.fillStyle = isAccepted ? predColor : `rgba(139, 92, 246, 0.7)`;
            ctx.textAlign = "center";
            ctx.fillText(pred.tag || "Room", pred.point.x, pred.point.y + 4);
          }
        }
        ctx.restore();
      });

      // Scan wave ripple
      if (!tkPredAccepted.length && predictions.length > 0 && !isRefining) {
        const centerX = predictions.reduce((s, p) => s + (p.point?.x || p.points?.[0]?.x || 0), 0) / predictions.length;
        const centerY = predictions.reduce((s, p) => s + (p.point?.y || p.points?.[0]?.y || 0), 0) / predictions.length;
        const maxR = Math.max(canvas.width, canvas.height) * 0.6;
        const waveR = phase * maxR;
        const waveAlpha = Math.max(0, 0.12 * (1 - phase));
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, waveR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(139, 92, 246, ${waveAlpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      predScanAnimRef.current = requestAnimationFrame(renderFrame);
    };

    predScanAnimRef.current = requestAnimationFrame(renderFrame);
    return () => { if (predScanAnimRef.current) cancelAnimationFrame(predScanAnimRef.current); };
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
    const toFillHex = (pct) => Math.round(Math.min(100, Math.max(5, pct)) * 2.55).toString(16).padStart(2, '0');
    const canvasTakeoffs = pageFilter === "page" ? filteredTakeoffs : takeoffs;
    canvasTakeoffs.forEach(to => {
      if (tkVisibility === "active" && to.id !== tkSelectedTakeoffId && to.id !== tkActiveTakeoffId) return;
      const isSelectedTo = to.id === tkSelectedTakeoffId || to.id === tkActiveTakeoffId;
      const fillHex = toFillHex(to.fillOpacity ?? 20);
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
            const hw = scaledW / 2, hh = (scaledH || scaledW) / 2;
            ctx.fillStyle = color + fillHex;
            ctx.fillRect(p.x - hw, p.y - hh, scaledW, scaledH || scaledW);
            ctx.strokeStyle = color; ctx.lineWidth = 2;
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
          ctx.beginPath(); ctx.moveTo(m.points[0].x, m.points[0].y);
          for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y);
          if (useScaledWidth) {
            // Wide semi-transparent band at real-world width
            ctx.strokeStyle = color + fillHex; ctx.lineWidth = scaledW;
            ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
            // Thin centerline on top
            ctx.beginPath(); ctx.moveTo(m.points[0].x, m.points[0].y);
            for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y);
            ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
          } else {
            ctx.strokeStyle = color; ctx.lineWidth = sw; ctx.stroke();
          }
          ctx.lineCap = "butt"; ctx.lineJoin = "miter"; // reset
        }
        if (m.type === "area" && m.points.length >= 3) {
          ctx.beginPath(); ctx.moveTo(m.points[0].x, m.points[0].y);
          for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y);
          ctx.closePath();
          ctx.fillStyle = color + fillHex; ctx.fill();
          ctx.strokeStyle = color; ctx.lineWidth = sw; ctx.stroke();
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
      ctx.strokeStyle = '#6366F1'; // indigo — distinct from measurement colors
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
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#6366F1';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
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
        ctx.fillStyle = "#8B5CF6";
        ctx.fill();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = "#8B5CF6";
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

  }, [takeoffs, filteredTakeoffs, pageFilter, selectedDrawingId, tkSelectedTakeoffId, tkActiveTakeoffId, moduleRenderWidths, tkVisibility, drawingScales, drawingDpi, geoAnalysis]);

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
        ctx.strokeStyle = color + "25"; ctx.lineWidth = scaledPreviewW;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        ctx.stroke();
        ctx.lineCap = "butt"; ctx.lineJoin = "miter";
      }

      // Dashed outline from points to cursor (+ close for area)
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(tkActivePoints[0].x, tkActivePoints[0].y);
      for (let i = 1; i < tkActivePoints.length; i++) ctx.lineTo(tkActivePoints[i].x, tkActivePoints[i].y);
      if (tkCursorPt) ctx.lineTo(tkCursorPt.x, tkCursorPt.y);
      if (tkTool === "area" && tkActivePoints.length >= 2 && tkCursorPt) ctx.lineTo(tkActivePoints[0].x, tkActivePoints[0].y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertex dots
      tkActivePoints.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); });
      if (tkCursorPt) { ctx.beginPath(); ctx.arc(tkCursorPt.x, tkCursorPt.y, 3, 0, Math.PI * 2); ctx.fillStyle = color + "80"; ctx.fill(); }

      // Snap angle guide line + badge (when Shift is held)
      if (shiftHeldRef.current && tkCursorPt && tkActivePoints.length >= 1 && (tkTool === "linear" || tkTool === "area")) {
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
          ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(anchor.x - extLen * Math.cos(snapAngleVal), anchor.y - extLen * Math.sin(snapAngleVal));
          ctx.lineTo(anchor.x + extLen * Math.cos(snapAngleVal), anchor.y + extLen * Math.sin(snapAngleVal));
          ctx.stroke();
          ctx.setLineDash([]);
          // Angle badge
          const degVal = Math.round(((snapAngleVal * 180 / Math.PI) % 360 + 360) % 360);
          const badgeLabel = degVal + "\u00B0";
          ctx.font = "bold 11px 'DM Sans', sans-serif";
          const bw = ctx.measureText(badgeLabel).width + 10;
          const bx = tkCursorPt.x + 18, by = tkCursorPt.y + 16;
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bx - 2, by - 8, bw, 16, 3);
          else ctx.rect(bx - 2, by - 8, bw, 16);
          ctx.fill();
          ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.fillText(badgeLabel, bx + 3, by);
          ctx.restore();
        }
      }

      // Running value label near cursor
      if (tkCursorPt && hasScale(selectedDrawingId)) {
        const previewPts = [...tkActivePoints, tkCursorPt];
        let liveVal = null, unitLbl = "";
        if (tkTool === "area" && previewPts.length >= 3) {
          liveVal = calcPolygonArea(previewPts, selectedDrawingId);
          unitLbl = getDisplayUnit(selectedDrawingId) + "²";
        } else if (tkTool === "linear" && previewPts.length >= 2) {
          liveVal = calcPolylineLength(previewPts, selectedDrawingId);
          unitLbl = getDisplayUnit(selectedDrawingId);
        }
        if (liveVal !== null) {
          const formatted = liveVal >= 1000 ? Math.round(liveVal).toLocaleString() : (Math.round(liveVal * 100) / 100).toString();
          const label = `${formatted} ${unitLbl}`;
          const lx = tkCursorPt.x + 18, ly = tkCursorPt.y - 18;
          ctx.font = "bold 14px 'DM Sans', sans-serif";
          const tw = ctx.measureText(label).width;
          const px = 8, py = 4, bgW = tw + px * 2, bgH = 20 + py * 2;
          ctx.fillStyle = color;
          ctx.beginPath();
          if (ctx.roundRect) { ctx.roundRect(lx - px, ly - bgH / 2, bgW, bgH, 4); } else { ctx.rect(lx - px, ly - bgH / 2, bgW, bgH); }
          ctx.fill();
          ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.fillText(label, lx, ly);
        }
      }

      ctx.restore();
    }

    // Calibration points
    if (tkTool === "calibrate" && tkActivePoints.length >= 1) {
      ctx.save();
      ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      tkActivePoints.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fillStyle = "#dc262660"; ctx.fill(); ctx.stroke(); });
      if (tkActivePoints.length === 2) {
        ctx.beginPath(); ctx.moveTo(tkActivePoints[0].x, tkActivePoints[0].y); ctx.lineTo(tkActivePoints[1].x, tkActivePoints[1].y); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.restore();
    }

    // AI Drawing Analysis — preview annotations (dashed outlines for detected elements)
    if (aiDrawingAnalysis && !aiDrawingAnalysis.loading && aiDrawingAnalysis.results?.length > 0 && aiDrawingAnalysis.aiW && overlay.width) {
      const scaleX = overlay.width / aiDrawingAnalysis.aiW;
      const scaleY = overlay.height / (aiDrawingAnalysis.aiH || aiDrawingAnalysis.aiW);
      ctx.save();
      ctx.globalAlpha = 0.6;
      aiDrawingAnalysis.results.forEach((item, idx) => {
        const pts = (item.locations || []).map(p => ({ x: Math.round(p.x * scaleX), y: Math.round(p.y * scaleY) }));
        if (pts.length === 0) return;
        const aiColor = item.type === "count" ? "#22c55e" : item.type === "linear" ? "#3b82f6" : "#a855f7";
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = aiColor; ctx.lineWidth = 2;
        if (item.type === "count") {
          pts.forEach(p => {
            ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = aiColor + "20"; ctx.fill();
            ctx.stroke();
          });
          // Label near first point
          if (pts[0]) {
            const lbl = item.name?.length > 25 ? item.name.slice(0, 22) + "..." : item.name;
            ctx.font = "bold 10px 'DM Sans', sans-serif";
            const tw = ctx.measureText(lbl).width;
            ctx.fillStyle = aiColor + "D0";
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(pts[0].x + 14, pts[0].y - 8, tw + 10, 16, 3);
            else ctx.rect(pts[0].x + 14, pts[0].y - 8, tw + 10, 16);
            ctx.fill();
            ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
            ctx.fillText(lbl, pts[0].x + 19, pts[0].y);
          }
        } else if (item.type === "linear" && pts.length >= 2) {
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
          pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = aiColor; ctx.fill(); });
          const mid = pts[Math.floor(pts.length / 2)];
          const lbl = item.name?.length > 25 ? item.name.slice(0, 22) + "..." : item.name;
          ctx.font = "bold 10px 'DM Sans', sans-serif";
          const tw = ctx.measureText(lbl).width;
          ctx.fillStyle = aiColor + "D0";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(mid.x - tw / 2 - 5, mid.y - 20, tw + 10, 16, 3);
          else ctx.rect(mid.x - tw / 2 - 5, mid.y - 20, tw + 10, 16);
          ctx.fill();
          ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(lbl, mid.x, mid.y - 12);
        } else if (item.type === "area" && pts.length >= 3) {
          ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fillStyle = aiColor + "15"; ctx.fill();
          ctx.stroke();
          // Centroid label
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          const lbl = item.name?.length > 25 ? item.name.slice(0, 22) + "..." : item.name;
          ctx.font = "bold 10px 'DM Sans', sans-serif";
          const tw = ctx.measureText(lbl).width;
          ctx.fillStyle = aiColor + "D0";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(cx - tw / 2 - 5, cy - 8, tw + 10, 16, 3);
          else ctx.rect(cx - tw / 2 - 5, cy - 8, tw + 10, 16);
          ctx.fill();
          ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(lbl, cx, cy);
        }
        ctx.setLineDash([]);
      });
      ctx.restore();
    }
  }, [takeoffs, tkActivePoints, tkCursorPt, selectedDrawingId, tkTool, tkCalibrations, drawingScales, drawingDpi, tkActiveTakeoffId, tkSelectedTakeoffId, moduleRenderWidths, aiDrawingAnalysis, tkVisibility]);

  // AI Scope Suggestions
  const runScopeSuggestions = async () => {
    if (takeoffs.length === 0) return showToast("Add some takeoffs first", "error");
    setTkScopeSuggestions({ loading: true, items: [] });
    try {
      const tkList = takeoffs.map(t => { const q = getMeasuredQty(t); return `${t.description} (${q !== null ? q : "no scale"} ${t.unit})${t.code ? ` [${t.code}]` : ""}`; }).join("\n");
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
        onText: (accumulated) => {
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
      {/* LEFT PANEL — Takeoffs drawer (overlay) */}
      {tkPanelOpen && (
        <div onClick={() => {
          setTkPanelOpen(false);
          // Auto-engage selected takeoff so next canvas click places a measurement
          const sel = useTakeoffsStore.getState().tkSelectedTakeoffId;
          const ms = useTakeoffsStore.getState().tkMeasureState;
          if (sel && ms === "idle") engageMeasuring(sel);
        }} style={{
          position: "absolute", inset: 0, background: C.isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.15)",
          zIndex: 30, animation: "fadeIn 0.15s ease-out",
        }} />
      )}
      {tkPanelOpen && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: Math.min(tkPanelWidth, 420), minWidth: 280, maxWidth: 420, background: C.bg1, borderRadius: "6px 0 0 6px", border: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0, zIndex: 31, boxShadow: "4px 0 24px rgba(0,0,0,0.15)", animation: "slideInLeft 0.2s ease-out" }}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            {/* Panel mode tabs: Takeoffs | Notes */}
            <div style={{ display: "flex", gap: 0, background: C.bg2, borderRadius: 5, padding: 2 }}>
              <button onClick={() => setShowNotesPanel(false)}
                style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, background: !showNotesPanel ? C.accent : "transparent", color: !showNotesPanel ? "#fff" : C.textDim, border: "none", borderRadius: 4, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4 }}>
                <Ic d={I.ruler} size={10} color={!showNotesPanel ? "#fff" : C.textDim} /> Takeoffs
              </button>
              <button onClick={() => setShowNotesPanel(true)}
                style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, background: showNotesPanel ? C.accent : "transparent", color: showNotesPanel ? "#fff" : C.textDim, border: "none", borderRadius: 4, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4 }}>
                <Ic d={I.report} size={10} color={showNotesPanel ? "#fff" : C.textDim} /> Notes
              </button>
            </div>
            {/* Takeoffs sub-filters (only when Takeoffs tab active) */}
            {!showNotesPanel && (
            <div style={{ display: "flex", gap: 2, background: C.bg2, borderRadius: 4, padding: 2 }}>
              <button onClick={() => { setPageFilter("all"); if (tkVisibility === "page") setTkVisibility("all"); }}
                style={{ padding: "2px 8px", fontSize: 9, fontWeight: 600, background: pageFilter === "all" ? C.accent : "transparent", color: pageFilter === "all" ? "#fff" : C.textDim, border: "none", borderRadius: 3, cursor: "pointer", transition: "all 0.15s" }}>
                All
              </button>
              <button onClick={() => { setPageFilter("page"); setActiveModule(null); setTkVisibility("page"); }}
                style={{ padding: "2px 8px", fontSize: 9, fontWeight: 600, background: pageFilter === "page" ? C.accent : "transparent", color: pageFilter === "page" ? "#fff" : C.textDim, border: "none", borderRadius: 3, cursor: "pointer", transition: "all 0.15s" }}>
                This Page{pageFilter === "page" ? ` (${filteredTakeoffs.length})` : ""}
              </button>
            </div>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {!showNotesPanel && (
              <button className="icon-btn"
                onClick={() => {
                  const next = { all: "page", page: "active", active: "all" };
                  const nv = next[tkVisibility] || "all";
                  setTkVisibility(nv);
                  if (nv === "page") { setPageFilter("page"); setActiveModule(null); }
                  else if (tkVisibility === "page") { setPageFilter("all"); }
                }}
                title={tkVisibility === "all" ? "Showing all takeoffs" : tkVisibility === "page" ? "This page only" : "Selected takeoff only"}
                style={{ width: 22, height: 22, border: `1px solid ${(tkVisibility === "active" || tkVisibility === "page") ? C.accent + "60" : C.border}`, background: tkVisibility === "page" ? C.accent + "18" : tkVisibility === "active" ? C.accent + "12" : "transparent", color: tkVisibility === "page" ? C.accent : tkVisibility === "active" ? C.accent : C.textDim, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {tkVisibility === "active" && <span style={{ position: "absolute", top: -4, right: -4, width: 12, height: 12, borderRadius: "50%", background: C.accent, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>1</span>}
                {tkVisibility === "page" && <span style={{ position: "absolute", top: -4, right: -4, width: 12, height: 12, borderRadius: "50%", background: C.accent, color: "#fff", fontSize: 7, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>P</span>}
              </button>
              )}
              <button className="icon-btn" onClick={() => setTkPanelOpen(false)} title="Collapse panel" style={{ width: 22, height: 22, border: "none", background: C.bg2, color: C.textDim, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 1L2 5l4 4" /></svg>
              </button>
            </div>
          </div>

          {showNotesPanel ? (
            <div style={{ flex: 1, overflowY: "auto" }}>
              <NotesPanel inline />
            </div>
          ) : (<>
          {/* Group Bar (bid context tabs) */}
          <div style={{ padding: "4px 8px", borderBottom: `1px solid ${C.border}` }}>
            <GroupBar />
          </div>

          {/* Search bar */}
            <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 6, alignItems: "center", position: "relative" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input value={tkNewInput} onChange={e => setTkNewInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && tkNewInput.trim()) {
                      // Smart Enter: NOVA single → add AI-priced, DB match → add first hit, else freeform
                      if (aiLookup?.result?.type === "single") { addTakeoffFromAI(aiLookup.result); }
                      else if (aiLookup?.result?.type === "multi") { insertAIGroupIntoTakeoffs(aiLookup.result); }
                      else if (tkDbResults.length > 0 && tkDbResults[0]._type === "item") { addTakeoffFromDb(tkDbResults[0]); }
                      else if (tkDbResults.length > 0 && tkDbResults[0]._type === "assembly") { insertAssemblyIntoTakeoffs(tkDbResults[0]); }
                      else { addTakeoffFreeform(tkNewInput); }
                    }
                  }}
                  placeholder="Search or type item · Enter ⏎ to add · Tab ↹ navigate"
                  style={inp(C, { paddingLeft: 28, fontSize: 11, padding: "7px 10px 7px 28px" })} />
                <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}><Ic d={I.search} size={12} color={C.textDim} /></div>
              </div>
              <select value={tkNewUnit} onChange={e => setTkNewUnit(e.target.value)} title="Measurement type"
                style={inp(C, { width: 56, padding: "5px 2px", fontSize: 9, fontWeight: 600, textAlign: "center", flexShrink: 0,
                  color: ["EA", "SET", "PAIR"].includes(tkNewUnit) ? C.green : ["LF", "VLF"].includes(tkNewUnit) ? C.blue : C.accent,
                  background: C.bg2 })}>
                <optgroup label="Count (EA)"><option value="EA">EA</option><option value="SET">SET</option><option value="PAIR">PAIR</option></optgroup>
                <optgroup label="Linear"><option value="LF">LF</option><option value="VLF">VLF</option></optgroup>
                <optgroup label="Area"><option value="SF">SF</option><option value="SY">SY</option></optgroup>
                <optgroup label="Volume"><option value="CY">CY</option><option value="CF">CF</option></optgroup>
                <optgroup label="Other"><option value="TON">TON</option><option value="GAL">GAL</option><option value="LS">LS</option><option value="ROLL">ROLL</option><option value="BAG">BAG</option></optgroup>
              </select>
              <div ref={plusMenuRef} style={{ position: "relative", flexShrink: 0 }}>
                <button className="accent-btn" onClick={() => { if (tkNewInput.trim()) setPlusMenuOpen(v => !v); }} disabled={!tkNewInput.trim()} title="Add item" style={bt(C, { background: tkNewInput.trim() ? C.accent : C.bg3, color: tkNewInput.trim() ? "#fff" : C.textDim, padding: "5px 8px" })}>
                  <Ic d={I.plus} size={12} color={tkNewInput.trim() ? "#fff" : C.textDim} sw={2.5} />
                </button>
                {plusMenuOpen && tkNewInput.trim() && (
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 60, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.30)", minWidth: 210, overflow: "hidden" }}>
                    <div className="nav-item" onClick={() => { addTakeoffFreeform(tkNewInput); setPlusMenuOpen(false); }}
                      style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderBottom: `1px solid ${C.border}` }}>
                      <Ic d={I.plus} size={11} color={C.textDim} sw={2} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Add as freeform</div>
                        <div style={{ fontSize: 9, color: C.textDim }}>No pricing — measure only</div>
                      </div>
                    </div>
                    <div className="nav-item" onClick={() => { lookupItemWithNova(tkNewInput); setPlusMenuOpen(false); }}
                      style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <Ic d={I.ai} size={11} color={C.accent} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>Ask NOVA to price</div>
                        <div style={{ fontSize: 9, color: C.textDim }}>Get code, description & pricing</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {/* DB + Assembly search dropdown — show when there's input (for freeform/NOVA options) */}
              {tkNewInput.trim() && (
                <div style={{ position: "absolute", left: 10, right: 10, top: "100%", zIndex: 50, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "0 0 6px 6px", boxShadow: "0 4px 16px rgba(0,0,0,0.30)", maxHeight: 380, overflowY: "auto" }}>
                  {tkDbResults.some(r => r._type === "assembly") && (
                    <>
                      <div style={{ padding: "4px 8px", fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}`, background: C.bg2, display: "flex", alignItems: "center", gap: 4 }}>
                        <Ic d={I.assembly} size={10} color={C.accent} /> Assemblies
                      </div>
                      {tkDbResults.filter(r => r._type === "assembly").map(asm => {
                        const totalPer = asm.elements.reduce((s, el) => s + (nn(el.m) + nn(el.l) + nn(el.e)) * nn(el.factor), 0);
                        return (
                          <div key={asm.id} className="nav-item" onClick={() => insertAssemblyIntoTakeoffs(asm)}
                            style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.bg}`, cursor: "pointer" }}>
                            <Ic d={I.assembly} size={12} color={C.accent} />
                            <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{asm.name}</span>
                            <span style={{ fontSize: 8, color: C.textMuted, background: C.bg2, padding: "1px 6px", borderRadius: 8 }}>{asm.elements.length} items</span>
                            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.accent, fontWeight: 600 }}>{fmt2(totalPer)}</span>
                          </div>
                        );
                      })}
                    </>
                  )}
                  {tkDbResults.some(r => r._type === "item") && (
                    <>
                      <div style={{ padding: "4px 8px", fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>Database Items</div>
                      {tkDbResults.filter(r => r._type === "item").map(el => (
                        <div key={el.id} className="nav-item" onClick={() => addTakeoffFromDb(el)}
                          style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.bg}`, cursor: "pointer" }}>
                          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.purple, fontWeight: 600, minWidth: 60 }}>{el.code}</span>
                          <span style={{ flex: 1, fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{el.name}</span>
                          <span style={{ fontSize: 9, color: C.textDim }}>/{el.unit}</span>
                          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.accent, fontWeight: 600 }}>{fmt2(nn(el.material) + nn(el.labor) + nn(el.equipment))}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {/* NOVA AI Results Section */}
                  {aiLookup === "loading" && (
                    <div style={{ padding: "10px 10px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, background: `${C.accent}06` }}>
                      <span style={{ width: 14, height: 14, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block", flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>NOVA is thinking...</span>
                    </div>
                  )}
                  {aiLookup?.result?.type === "single" && (
                    <div style={{ borderTop: `1px solid ${C.border}` }}>
                      <div style={{ padding: "4px 8px", fontSize: 8, fontWeight: 600, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}`, background: `${C.accent}08`, display: "flex", alignItems: "center", gap: 4 }}>
                        <Ic d={I.ai} size={10} color={C.accent} /> NOVA Suggestion
                      </div>
                      <div className="nav-item" onClick={() => addTakeoffFromAI(aiLookup.result)}
                        style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.purple, fontWeight: 600, minWidth: 60 }}>{aiLookup.result.code}</span>
                        <span style={{ flex: 1, fontSize: 11, color: C.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{aiLookup.result.description}</span>
                        <span style={{ fontSize: 9, color: C.textDim }}>/{aiLookup.result.unit}</span>
                        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.green, fontWeight: 600 }}>{fmt2(nn(aiLookup.result.material) + nn(aiLookup.result.labor) + nn(aiLookup.result.equipment) + nn(aiLookup.result.subcontractor))}</span>
                      </div>
                    </div>
                  )}
                  {aiLookup?.result?.type === "multi" && (
                    <div style={{ borderTop: `1px solid ${C.border}` }}>
                      <div style={{ padding: "4px 8px", fontSize: 8, fontWeight: 600, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}`, background: `${C.accent}08`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Ic d={I.ai} size={10} color={C.accent} /> NOVA: {aiLookup.result.groupName} ({aiLookup.result.items.length} parts)
                        </span>
                      </div>
                      {aiLookup.result.items.map((item, idx) => (
                        <div key={idx} className="nav-item" onClick={() => addTakeoffFromAI(item)}
                          style={{ padding: "4px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderBottom: idx < aiLookup.result.items.length - 1 ? `1px solid ${C.bg2}` : "none" }}>
                          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 8, color: C.purple, fontWeight: 600, minWidth: 55 }}>{item.code}</span>
                          <span style={{ flex: 1, fontSize: 10, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description}</span>
                          <span style={{ fontSize: 8, color: C.textDim }}>/{item.unit}</span>
                          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 8, color: C.green, fontWeight: 600 }}>{fmt2(nn(item.material) + nn(item.labor) + nn(item.equipment) + nn(item.subcontractor))}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 4, padding: "4px 10px", borderTop: `1px solid ${C.border}` }}>
                        <div className="nav-item" onClick={() => insertAIGroupIntoTakeoffs(aiLookup.result)}
                          style={{ flex: 1, padding: "5px 8px", textAlign: "center", cursor: "pointer", fontSize: 10, fontWeight: 600, color: "#fff", background: C.accent, borderRadius: 4 }}>
                          Add All as Group
                        </div>
                        <div className="nav-item" onClick={() => addTakeoffFromAIAsSingle(aiLookup.result)}
                          style={{ flex: 1, padding: "5px 8px", textAlign: "center", cursor: "pointer", fontSize: 10, fontWeight: 500, color: C.textDim, background: C.bg3, borderRadius: 4 }}>
                          Add as single line
                        </div>
                      </div>
                    </div>
                  )}
                  {aiLookup?.error && (
                    <div style={{ padding: "6px 10px", borderTop: `1px solid ${C.border}`, background: `rgba(231,76,60,0.06)` }}>
                      <div style={{ fontSize: 10, color: "#E74C3C", marginBottom: 4 }}>{aiLookup.error}</div>
                      <span className="nav-item" onClick={() => lookupItemWithNova(tkNewInput)}
                        style={{ fontSize: 9, color: C.accent, cursor: "pointer", fontWeight: 600 }}>Retry</span>
                    </div>
                  )}
                  {/* Footer: Freeform option */}
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    <div className="nav-item" onClick={() => addTakeoffFreeform(tkNewInput)}
                      style={{ padding: "5px 10px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.textDim, fontSize: 10, fontWeight: 500 }}>
                      <Ic d={I.plus} size={10} color={C.textDim} sw={2} /> Add "{tkNewInput}" as freeform (no pricing)
                    </div>
                  </div>
                </div>
              )}
            </div>

          {/* Module selector — hidden when filtering to "This Page" */}
          {pageFilter !== "page" && (
          <div style={{ padding: "10px 10px 8px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(180deg, ${C.bg2}, ${C.bg1})` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 12px", borderRadius: 5, background: `linear-gradient(135deg, #8B5CF6, #6D28D9, #1a1025)`, color: "#fff", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(139,92,246,0.4)" }}>MODULES</span>
              <div style={{ flex: 1, height: 1, background: C.gradientSubtle }} />
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={() => setActiveModule(null)}
                style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, border: !activeModule ? "none" : `1px solid ${C.accent}20`, background: !activeModule ? C.gradient : C.bg3, color: !activeModule ? "#fff" : C.textMuted, borderRadius: 4, cursor: "pointer", transition: "all 0.15s", boxShadow: !activeModule ? "0 1px 6px rgba(139,92,246,0.3)" : "none" }}
              >All</button>
              {MODULE_LIST.map(b => {
                const isActive = activeModule === b.id;
                return (
                <button
                  key={b.id}
                  onClick={() => b.available && setActiveModule(b.id)}
                  style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, border: isActive ? "none" : `1px solid ${C.accent}20`, background: isActive ? C.gradient : C.bg3, color: isActive ? "#fff" : b.available ? C.textMuted : C.textDimmer, borderRadius: 4, cursor: b.available ? "pointer" : "default", opacity: b.available ? 1 : 0.5, transition: "all 0.15s", boxShadow: isActive ? "0 1px 6px rgba(139,92,246,0.3)" : "none" }}
                  title={b.available ? `${b.name} Module` : `${b.name} Module (Coming Soon)`}
                >{b.name}</button>
              )})}
            </div>
          </div>
          )}

          {/* Module panel + takeoff list — slide transition */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            <div style={{ display: "flex", width: "200%", height: "100%", transform: `translateX(${activeModule && pageFilter !== "page" ? '-50%' : '0'})`, transition: "transform 0.2s ease" }}>
              {/* Takeoff list (left) */}
              <div style={{ width: "50%", height: "100%", overflowY: "auto", padding: "0 8px 8px" }}>
            {Object.entries(takeoffGroups).map(([group, tos]) => {
              const isGroupCollapsed = !!collapsedGroups[group];
              return (
              <div key={group} style={{
                marginBottom: T.space[3],
                background: C.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
                border: `1px solid ${C.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'}`,
                borderRadius: T.radius.md,
                overflow: "hidden",
                boxShadow: T.shadow.sm,
                transition: T.transition.base,
              }}>
                {/* Card header */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: `${T.space[2]}px ${T.space[3]}px`,
                  background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                  borderBottom: isGroupCollapsed ? "none" : `1px solid ${C.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                  borderLeft: group !== "Ungrouped" ? `3px solid ${C.accent}` : "3px solid transparent",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: T.space[2], minWidth: 0 }}>
                    <Ic d={group === "Ungrouped" ? I.layers : I.assembly} size={12} color={C.accent} />
                    <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.text, letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group}</span>
                    <span style={{ fontSize: 9, color: C.textDim, fontWeight: T.fontWeight.medium, flexShrink: 0 }}>{tos.length}</span>
                  </div>
                  <button onClick={() => toggleGroupCollapse(group)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", borderRadius: T.radius.sm, flexShrink: 0 }}>
                    <Ic d={I.chevron} size={10} color={C.textDim} style={{ transform: isGroupCollapsed ? "rotate(-90deg)" : "rotate(90deg)", transition: "transform 0.2s cubic-bezier(0.25,0.1,0.25,1)" }} />
                  </button>
                </div>
                {!isGroupCollapsed && <>
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: `${T.space[1]}px ${T.space[3]}px`, fontSize: 8, fontWeight: T.fontWeight.semibold, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.6, borderBottom: `1px solid ${C.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)'}` }}>
                  <div style={{ width: 12 }}></div>
                  <div style={{ flex: 2, minWidth: 80 }}>Description</div>
                  <div style={{ width: 55, textAlign: "right" }}>Qty</div>
                  <div style={{ width: 36 }}>Unit</div>
                  <div style={{ width: 50 }}>Sheet</div>
                  <div style={{ width: 52 }}></div>
                </div>
                {tos.map(to => {
                  const isActive = tkActiveTakeoffId === to.id;
                  const isSelected = tkSelectedTakeoffId === to.id || isActive;
                  const isMeasuring = isActive && (tkMeasureState === "measuring" || tkMeasureState === "paused");
                  const isPaused = isActive && tkMeasureState === "paused";
                  const totalMCount = (to.measurements || []).length;
                  const computedQty = getComputedQty(to);
                  const measuredQty = getMeasuredQty(to);
                  const hasMeasurements = (to.measurements || []).length > 0;
                  const noScale = hasMeasurements && measuredQty === null && unitToTool(to.unit) !== "count";
                  const displayQty = hasMeasurements ? (measuredQty !== null ? measuredQty : null) : nn(to.quantity) || null;
                  const hasFormula = !!(to.formula && to.formula.trim());
                  const hasVars = (to.variables || []).length > 0;
                  const ctrlBtnS = { width: 20, height: 20, border: "none", background: "transparent", borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
                  return (
                    <div key={to.id} data-takeoff-id={to.id}>
                      <div className={`row${to._aiCosts ? ' nova-priced' : ''}${isSelected ? ' row-selected' : ''}${isMeasuring ? ' row-measuring' : ''}`} draggable
                        onDragStart={() => { tkDragTakeoff.current = to.id; }}
                        onDragEnter={() => { tkDragOverTakeoff.current = to.id; }}
                        onDragEnd={tkDragReorder}
                        onDragOver={e => e.preventDefault()}
                        onClick={() => {
                          // Single click = select only (never auto-start measuring)
                          setTkSelectedTakeoffId(to.id);
                        }}
                        style={{ '--rc': to.color, position: "relative", zIndex: isSelected && !isMeasuring ? 2 : undefined, display: "flex", alignItems: "center", gap: 4, padding: `${T.space[1]}px ${T.space[2]}px`,
                          borderBottom: `1px solid ${C.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)'}`, cursor: "grab",
                          background: isMeasuring ? `${to.color}18` : isSelected ? `${to.color}0A` : "transparent",
                          borderLeft: isMeasuring ? `3px solid ${to.color}` : isSelected ? `3px solid ${to.color}80` : "3px solid transparent",
                          boxShadow: isMeasuring ? `inset 0 0 0 1px ${to.color}30` : "none",
                          transition: "background 100ms ease-out" }}>
                        {/* Play / Pause / Resume — left of color for faster engage */}
                        <div style={{ width: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => e.stopPropagation()}>
                          {isActive && tkMeasureState === "measuring" ? (
                            <button className="icon-btn" onClick={() => pauseMeasuring()} title="Pause" style={ctrlBtnS}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill={to.color}><rect x="1" y="1" width="3" height="8" rx="0.5"/><rect x="6" y="1" width="3" height="8" rx="0.5"/></svg>
                            </button>
                          ) : isPaused ? (
                            <button className="icon-btn" onClick={() => setTkMeasureState("measuring")} title="Resume" style={ctrlBtnS}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill={to.color}><polygon points="2,1 9,5 2,9"/></svg>
                            </button>
                          ) : (
                            <button className="icon-btn" onClick={() => engageMeasuring(to.id)} title="Start measuring" style={{ ...ctrlBtnS, opacity: selectedDrawing?.data ? 1 : 0.3 }} disabled={!selectedDrawing?.data}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill={selectedDrawing?.data ? to.color : C.textDim}><polygon points="2,1 9,5 2,9"/></svg>
                            </button>
                          )}
                        </div>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: to.color, flexShrink: 0, cursor: "pointer", position: "relative" }} onClick={e => { e.stopPropagation(); e.currentTarget.querySelector('input')?.click(); }}>
                          {isMeasuring && <div style={{ position: "absolute", inset: -2, borderRadius: 3, border: `2px solid ${to.color}`, animation: "pulse 1.5s infinite" }} />}
                          <input type="color" value={to.color} onChange={e => updateTakeoff(to.id, "color", e.target.value)} onClick={e => e.stopPropagation()} style={{ position: "absolute", opacity: 0, width: 0, height: 0, top: 0, left: 0 }} />
                        </div>
                        {/* Tier 1: Description — LOUD */}
                        <div style={{ flex: 2, minWidth: 80, minHeight: 0 }} onClick={e => e.stopPropagation()}>
                          <input value={to.description} onChange={e => updateTakeoff(to.id, "description", e.target.value)} placeholder="Description..." style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "2px 4px", fontSize: T.fontSize.base, fontWeight: T.fontWeight.medium })} />
                          {/* Tier 2: Code/NOVA badge — medium */}
                          {(to.code || to._aiCosts) && <div style={{ fontSize: 8, color: `${C.purple}B0`, fontFamily: T.font.mono, paddingLeft: 4, display: "flex", alignItems: "center", gap: 3, lineHeight: 1.2, ...truncate() }}>
                            {to.code || ""}
                            {to._aiCosts && <span style={{ color: C.accent, fontSize: 7, fontWeight: T.fontWeight.bold, display: "inline-flex", alignItems: "center", gap: 2, background: `${C.accent}0A`, padding: "0 3px", borderRadius: 2 }} title={`NOVA: M $${fmt2(to._aiCosts.material)} · L $${fmt2(to._aiCosts.labor)} · E $${fmt2(to._aiCosts.equipment)}`}>✦ NOVA</span>}
                          </div>}
                        </div>
                        {/* Tier 1: Qty — LOUD */}
                        <div style={{ width: 55 }} onClick={e => e.stopPropagation()}>
                          {hasMeasurements ? (
                            noScale ? <div style={{ fontSize: 8, color: C.orange, fontWeight: T.fontWeight.semibold, padding: "2px 4px", cursor: "help" }} title="Set a scale to see quantities">⚠ Scale</div>
                              : <div className={measureFlashId === to.id ? "measure-complete" : ""} style={{ '--rc': to.color, fontSize: T.fontSize.base, fontWeight: T.fontWeight.heavy || 800, color: measureFlashId === to.id ? to.color : C.text, padding: "2px 4px", fontFamily: T.font.mono, fontFeatureSettings: "'tnum'", borderRadius: 3, transition: "color 300ms ease" }}>{displayQty}</div>
                          ) : (
                            <input type="number" value={to.quantity} onChange={e => updateTakeoff(to.id, "quantity", e.target.value)} placeholder="0" style={nInp(C, { background: "transparent", border: "1px solid transparent", padding: "2px 4px", fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold })} />
                          )}
                          {/* Tier 3: Formula result — whisper */}
                          {hasFormula && computedQty !== null && <div style={{ fontSize: 7, color: `${C.accent}90`, fontFamily: T.font.mono, paddingLeft: 2 }}>={Math.round(computedQty * 100) / 100}</div>}
                        </div>
                        {/* Tier 3: Unit — whisper */}
                        <div style={{ width: 36 }} onClick={e => e.stopPropagation()}>
                          <select value={to.unit} onChange={e => { updateTakeoff(to.id, "unit", e.target.value); if (tkActiveTakeoffId === to.id) { setTkTool(unitToTool(e.target.value)); setTkActivePoints([]); } }} style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "2px 1px", fontSize: 8, color: C.textDim })}>
                            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <div style={{ width: 50, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
                          {(() => {
                            const mSheets = [...new Set((to.measurements || []).map(m => m.sheetId).filter(Boolean))];
                            if (mSheets.length === 0) {
                              return (
                                <select value={to.drawingRef} onChange={e => { updateTakeoff(to.id, "drawingRef", e.target.value); const d = drawings.find(d => (d.sheetNumber || d.pageNumber) === e.target.value); if (d) { setSelectedDrawingId(d.id); if (d.type === "pdf" && d.data) renderPdfPage(d); } }} style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "2px 1px", fontSize: 8 })}>
                                  <option value="">—</option>
                                  {drawings.map(d => <option key={d.id} value={d.sheetNumber || d.pageNumber || d.id}>{d.sheetNumber || d.pageNumber || "?"}</option>)}
                                </select>
                              );
                            }
                            const labels = mSheets.map(sid => { const d = drawings.find(d => d.id === sid); return d ? (d.sheetNumber || d.pageNumber || "?") : "?"; });
                            return (
                              <div title={`Measured on: ${labels.join(", ")}`}
                                style={{ fontSize: 8, color: C.accent, fontWeight: 600, padding: "2px 2px", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                                onClick={() => { const d = drawings.find(d => d.id === mSheets[0]); if (d) { setSelectedDrawingId(d.id); if (d.type === "pdf" && d.data) renderPdfPage(d); } }}>
                                {labels.join(",")}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ width: 52, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }} onClick={e => e.stopPropagation()}>
                          {/* Always visible: Stop button + measurement count */}
                          {(isActive && tkMeasureState === "measuring") || isPaused ? (
                            <button className="icon-btn" onClick={() => stopMeasuring()} title="Stop" style={ctrlBtnS}>
                              <svg width="8" height="8" viewBox="0 0 8 8" fill={C.red}><rect width="8" height="8" rx="1"/></svg>
                            </button>
                          ) : null}
                          {totalMCount > 0 && <span className={measureFlashId === to.id ? "badge-bump" : ""} style={{ fontSize: 7, fontWeight: T.fontWeight.bold, color: to.color, background: `${to.color}18`, borderRadius: 3, padding: "1px 3px", minWidth: 14, textAlign: "center", fontFeatureSettings: "'tnum'" }}>{totalMCount}</span>}
                          {/* Hover-reveal: Formula, Auto-count, Duplicate, Delete */}
                          <div className="tk-row-actions" style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                            <button className="icon-btn" onClick={() => setTkShowVars(tkShowVars === to.id ? null : to.id)} title="Variables & Formula" style={{ width: 20, height: 20, border: "none", background: hasVars || hasFormula ? `${C.accent}18` : "transparent", color: hasVars || hasFormula ? C.accent : C.textDim, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>ƒ</button>
                            {unitToTool(to.unit) === "count" && selectedDrawing?.data && (
                              <button className="icon-btn" onClick={e => { e.stopPropagation(); startAutoCount(to.id); }} title="Auto Count"
                                style={{ width: 20, height: 20, border: "none", background: tkAutoCount?.takeoffId === to.id ? "rgba(168,126,230,0.2)" : "transparent", color: C.purple, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10 M18 20v-4 M6 20v-6" /></svg>
                              </button>
                            )}
                            <button className="icon-btn" onClick={() => { const nt = { ...takeoffs.find(t => t.id === to.id), id: uid(), linkedItemId: "", measurements: [] }; setTakeoffs([...takeoffs, nt]); }} title="Duplicate" style={{ width: 20, height: 20, border: "none", background: "transparent", color: C.textDim, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}><Ic d={I.copy} size={10} /></button>
                            <button className="icon-btn" onClick={() => removeTakeoff(to.id)} title="Delete" style={{ width: 20, height: 20, border: "none", background: "transparent", color: C.red, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}><Ic d={I.trash} size={10} /></button>
                          </div>
                        </div>
                        {/* Floating controls popover — absolute positioned, no layout shift */}
                        {isSelected && !isMeasuring && (
                          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: T.z.dropdown, padding: "8px 10px 8px 27px", background: `linear-gradient(180deg, ${C.bg1}, ${C.bg2}30)`, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 8px 8px", boxShadow: T.shadow.md, display: "flex", flexDirection: "column", gap: 5 }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 7, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 28 }}>Color</span>
                              <div style={{ display: "flex", gap: 3 }}>
                                {TO_COLORS.map(c => (
                                  <div key={c} onClick={() => updateTakeoff(to.id, "color", c)}
                                    style={{ width: 14, height: 14, borderRadius: 3, background: c, cursor: "pointer", border: to.color === c ? "2px solid #fff" : "1px solid transparent", boxShadow: to.color === c ? `0 0 0 1px ${c}, 0 0 6px ${c}40` : "none", transition: "all 100ms" }} />
                                ))}
                                <div style={{ position: "relative", width: 14, height: 14, borderRadius: 3, background: `conic-gradient(red, yellow, lime, cyan, blue, magenta, red)`, cursor: "pointer" }}
                                  onClick={e => { e.stopPropagation(); e.currentTarget.querySelector('input')?.click(); }}>
                                  <input type="color" value={to.color} onChange={e => updateTakeoff(to.id, "color", e.target.value)} onClick={e => e.stopPropagation()} style={{ position: "absolute", opacity: 0, width: 0, height: 0, top: 0, left: 0 }} />
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 7, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 28 }}>Stroke</span>
                              <input type="range" min="1" max="10" step="1"
                                value={to.strokeWidth ?? 3}
                                onChange={e => updateTakeoff(to.id, "strokeWidth", Number(e.target.value))}
                                style={{ width: 70, height: 3, accentColor: to.color, cursor: "pointer" }} />
                              <span style={{ fontSize: 8, color: C.textDim, fontFamily: "'DM Sans',sans-serif", minWidth: 18 }}>{to.strokeWidth ?? 3}px</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 7, color: C.textDim, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, minWidth: 28 }}>Fill</span>
                              <input type="range" min="5" max="100" step="5"
                                value={to.fillOpacity ?? 20}
                                onChange={e => updateTakeoff(to.id, "fillOpacity", Number(e.target.value))}
                                style={{ width: 70, height: 3, accentColor: to.color, cursor: "pointer" }} />
                              <span style={{ fontSize: 8, color: C.textDim, fontFamily: "'DM Sans',sans-serif", minWidth: 24 }}>{to.fillOpacity ?? 20}%</span>
                            </div>
                          </div>
                        )}
                      </div>

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
                        />
                      )}
                    </div>
                  );
                })}
                <button className="ghost-btn" onClick={() => addTakeoff(group)} style={{ display: "flex", alignItems: "center", gap: T.space[1], width: "100%", padding: `${T.space[2]}px ${T.space[3]}px`, background: "transparent", color: C.textDim, cursor: "pointer", fontSize: T.fontSize.xs, fontWeight: T.fontWeight.medium, border: "none", borderTop: `1px solid ${C.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)'}` }}><Ic d={I.plus} size={9} /> Add item</button>
                </>}
              </div>
              );
            })}

            {takeoffs.length === 0 && (
              <div style={{ textAlign: "center", padding: `${T.space[8]}px ${T.space[5]}px`, borderRadius: T.radius.lg, marginTop: T.space[3], background: `linear-gradient(180deg, ${C.accent}06, transparent)`, position: "relative", overflow: "hidden" }}>
                {/* Decorative rings */}
                <div style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", width: 120, height: 120, borderRadius: "50%", border: `1px solid ${C.accent}08`, animation: "breathe 4s ease-in-out infinite" }} />
                <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", width: 100, height: 100, borderRadius: "50%", border: `1px solid ${C.accent}12`, animation: "breathe 4s ease-in-out infinite 0.5s" }} />
                <div style={{
                  width: 56, height: 56, borderRadius: T.radius.full, margin: "0 auto",
                  marginBottom: T.space[3], position: "relative",
                  background: `linear-gradient(135deg, ${C.accent}18, ${C.accent}06)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 0 24px ${C.accent}12`,
                }}>
                  <Ic d={I.ruler} size={24} color={C.accent} sw={1.7} />
                </div>
                <div style={{ fontSize: T.fontSize.md, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[1] }}>Ready to measure</div>
                <div style={{ fontSize: T.fontSize.sm, color: C.textMuted, lineHeight: 1.5, maxWidth: 220, margin: "0 auto" }}>Search for a scope item above, or type any description and press Enter to start.</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: T.space[4], fontSize: 8, color: C.textDim }}>
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
                  <ModulePanel engageMeasuring={engageMeasuring} selectedDrawingId={selectedDrawingId} addTakeoff={addTakeoff} updateTakeoff={updateTakeoff} removeTakeoff={removeTakeoff} pageFilter={pageFilter} onDetectWallSchedule={runWallScheduleDetection} wallScheduleLoading={wallSchedule.loading} />
                )}
              </div>
            </div>
          </div>

          {/* AI Scope Suggestions */}
          {tkScopeSuggestions && (
            <div style={{ borderTop: `2px solid ${C.accent}`, maxHeight: 260, overflowY: "auto", background: C.bg }}>
              <div style={{ padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: C.bg, zIndex: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Ic d={I.ai} size={12} color={C.accent} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.accent }}>Scope Suggestions</span>
                  {tkScopeSuggestions.loading && <span style={{ fontSize: 9, color: C.textDim, fontStyle: "italic" }}>Analyzing...</span>}
                </div>
                <button onClick={() => setTkScopeSuggestions(null)} style={{ width: 16, height: 16, border: "none", background: "transparent", color: C.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Ic d={I.x} size={9} /></button>
              </div>
              {tkScopeSuggestions.loading && (
                <div style={{ padding: 20, textAlign: "center" }}>
                  <div style={{ width: 20, height: 20, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 8px" }} />
                  <div style={{ fontSize: 10, color: C.textDim }}>AI is reviewing your scope for gaps...</div>
                </div>
              )}
              {!tkScopeSuggestions.loading && tkScopeSuggestions.items.length === 0 && (
                <div style={{ padding: 16, textAlign: "center", fontSize: 10, color: C.textDim }}>No suggestions — your scope looks comprehensive.</div>
              )}
              {tkScopeSuggestions.items.map((sg, i) => (
                <div key={i} style={{ padding: "6px 10px", borderBottom: `1px solid ${C.bg2}`, display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{sg.name}</div>
                    <div style={{ fontSize: 9, color: C.textMuted, lineHeight: 1.4, marginTop: 1 }}>{sg.desc}</div>
                    {sg.code && <span style={{ fontSize: 8, fontFamily: "'DM Sans',sans-serif", color: C.purple }}>{sg.code}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 3, flexShrink: 0, paddingTop: 2 }}>
                    <button onClick={() => {
                      addTakeoff("", sg.name, sg.unit || "SF", sg.code || "");
                      setTkScopeSuggestions({ ...tkScopeSuggestions, items: tkScopeSuggestions.items.filter((_, j) => j !== i) });
                      showToast(`Added: ${sg.name}`);
                    }} title="Add to takeoffs" style={bt(C, { padding: "3px 8px", fontSize: 8, fontWeight: 600, background: C.accent, color: "#fff", borderRadius: 3 })}>+ Add</button>
                    <button onClick={() => setTkScopeSuggestions({ ...tkScopeSuggestions, items: tkScopeSuggestions.items.filter((_, j) => j !== i) })} title="Dismiss" style={bt(C, { padding: "3px 6px", fontSize: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 3 })}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          {takeoffs.length > 0 && (
            <div style={{ padding: "6px 12px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10 }}>
              <span style={{ color: C.textMuted }}>
                <strong style={{ color: C.text }}>{takeoffs.length}</strong> items
                {takeoffs.reduce((s, t) => (t.measurements || []).length + s, 0) > 0 &&
                  <> · <strong style={{ color: C.accent }}>{takeoffs.reduce((s, t) => (t.measurements || []).length + s, 0)}</strong> measurements</>}
              </span>
              <button onClick={runScopeSuggestions} disabled={tkScopeSuggestions?.loading} title="AI: What am I missing?"
                style={bt(C, { padding: "3px 8px", fontSize: 8, fontWeight: 600, background: tkScopeSuggestions?.loading ? C.bg3 : "linear-gradient(135deg,#2563eb,#1d4ed8)", color: tkScopeSuggestions?.loading ? C.textDim : "#fff", borderRadius: 4, display: "flex", alignItems: "center", gap: 4 })}>
                <Ic d={I.ai} size={9} color={tkScopeSuggestions?.loading ? C.textDim : "#fff"} /> What's Missing?
              </button>
            </div>
          )}
          </>)}
        </div>
      )}

      {/* DRAWING VIEWER — full width */}
      <div style={{ flex: 1, minWidth: 300, background: C.bg1, borderRadius: "6px", border: `1px solid ${C.border}`, overflow: "hidden", display: "flex", flexDirection: "column", marginLeft: tkPanelOpen ? Math.min(tkPanelWidth, 420) : 0, transition: "margin-left 0.2s ease-out" }}>
        {/* Toolbar */}
        <div style={{ borderBottom: `1px solid ${C.border}` }}>
          {/* Toolbar: Drawing nav + zoom + scale + tools */}
          <div style={{ padding: "6px 10px", display: "flex", gap: 6, alignItems: "center", overflow: "hidden" }}>
          {/* Panel toggle + mode selector */}
          <button className="icon-btn"
            onClick={() => setTkPanelOpen(v => !v)}
            onContextMenu={e => {
              e.preventDefault();
              const next = { auto: "open", open: "closed", closed: "auto" };
              const nv = next[tkPanelMode];
              setTkPanelMode(nv);
              if (nv === "open") setTkPanelOpen(true);
              else if (nv === "closed") setTkPanelOpen(false);
              showToast(`Panel: ${nv === "auto" ? "Auto (hide when measuring)" : nv === "open" ? "Always open" : "Always closed"}`);
            }}
            title={`${tkPanelOpen ? "Hide" : "Show"} panel · Right-click: ${tkPanelMode === "auto" ? "Auto mode" : tkPanelMode === "open" ? "Always open" : "Always closed"}`}
            style={{ width: 26, height: 26, border: `1px solid ${tkPanelOpen ? C.accent + '60' : C.border}`, background: tkPanelOpen ? C.accent + '12' : C.bg2, color: tkPanelOpen ? C.accent : C.textMuted, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, position: "relative" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={tkPanelOpen ? C.accent : C.textMuted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="18" rx="1" /><path d="M14 3h7M14 9h7M14 15h5" /></svg>
            {takeoffs.length > 0 && !tkPanelOpen && (
              <span style={{ position: "absolute", top: -4, right: -4, minWidth: 14, height: 14, borderRadius: 7, background: C.accent, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>{takeoffs.length}</span>
            )}
            {tkPanelMode !== "auto" && (
              <span style={{ position: "absolute", bottom: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: tkPanelMode === "open" ? C.green : C.orange, border: `1px solid ${C.bg1}` }} />
            )}
          </button>
          {/* Drawing filmstrip */}
          <button className="icon-btn" title="Previous" onClick={() => { const idx = drawings.findIndex(d => d.id === selectedDrawingId); if (idx > 0) { setSelectedDrawingId(drawings[idx - 1].id); if (drawings[idx - 1].type === "pdf" && drawings[idx - 1].data) renderPdfPage(drawings[idx - 1]); } }} style={{ width: 24, height: 24, border: "none", background: C.bg2, color: C.textMuted, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 11, flexShrink: 0 }}>◀</button>
          <div ref={compactStripRef} className="hide-scrollbar" style={{ display: "flex", gap: 3, overflowX: "auto", flex: 1, minWidth: 0, padding: "2px 0" }}>
            {drawings.length === 0 ? (
              <div style={{ fontSize: 10, color: C.textDim, padding: "4px 8px", fontStyle: "italic" }}>No drawings</div>
            ) : drawings.map(d => {
              const thumb = d.type === "pdf" ? pdfCanvases[d.id] : d.data;
              const isAct = selectedDrawingId === d.id;
              const hasMeas = takeoffs.some(to => (to.measurements || []).some(m => m.sheetId === d.id));
              const labelBg = isAct ? `${C.accent}D0` : hasMeas ? `${C.accent}90` : "rgba(0,0,0,0.65)";
              return (
                <div key={d.id} data-drawing-id={d.id} className="icon-btn" onClick={() => { setSelectedDrawingId(d.id); if (d.type === "pdf" && d.data) renderPdfPage(d); }}
                  title={`${d.sheetNumber || d.pageNumber || "?"} — ${d.sheetTitle || d.label || ""}`}
                  style={{
                    width: 48, height: 32, flexShrink: 0, borderRadius: 4,
                    overflow: "hidden", cursor: "pointer", position: "relative",
                    border: isAct ? `2px solid ${C.accent}` : `1px solid ${C.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.10)'}`,
                    boxShadow: isAct ? `0 0 8px ${C.accent}30` : "none",
                    background: C.bg2,
                  }}>
                  {thumb ? <img src={thumb} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: d.data ? 1 : 0.4 }} />
                    : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: C.textDim }}>{d.sheetNumber || "?"}</div>}
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 2px", background: labelBg, fontSize: 6, fontWeight: 700, color: "#fff", textAlign: "center", lineHeight: "12px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.sheetNumber || d.pageNumber || "?"}</div>
                </div>
              );
            })}
          </div>
          <button className="icon-btn" title="Next" onClick={() => { const idx = drawings.findIndex(d => d.id === selectedDrawingId); if (idx < drawings.length - 1) { setSelectedDrawingId(drawings[idx + 1].id); if (drawings[idx + 1].type === "pdf" && drawings[idx + 1].data) renderPdfPage(drawings[idx + 1]); } }} style={{ width: 24, height: 24, border: "none", background: C.bg2, color: C.textMuted, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 11, flexShrink: 0 }}>▶</button>
          <div style={{ display: "flex", gap: 2, alignItems: "center", borderLeft: `1px solid ${C.border}`, paddingLeft: 6, flexShrink: 0 }}>
            <button onClick={() => setTkZoom(Math.max(25, tkZoom - 25))} style={{ width: 22, height: 22, border: "none", background: C.bg2, color: C.textMuted, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 }}>−</button>
            <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600, width: 32, textAlign: "center" }}>{tkZoom}%</span>
            <button onClick={() => setTkZoom(Math.min(400, tkZoom + 25))} style={{ width: 22, height: 22, border: "none", background: C.bg2, color: C.textMuted, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 }}>+</button>
            <button onClick={() => { setTkZoom(100); setTkPan({ x: 0, y: 0 }); }} style={{ padding: "2px 6px", border: "none", background: C.bg2, color: C.textDim, borderRadius: 3, cursor: "pointer", fontSize: 8, fontWeight: 600 }}>Fit</button>
          </div>
          {/* Scale dropdown */}
          {selectedDrawing && (<>
            <div style={{ width: 1, height: 20, background: C.border, margin: "0 2px" }} />
            <span style={{ fontWeight: 600, color: C.textDim, fontSize: 9 }}>Scale:</span>
            <select value={drawingScales[selectedDrawingId] || ""} onChange={e => {
              if (e.target.value === "custom") {
                setTkTool("calibrate"); setTkActivePoints([]); setTkMeasureState("idle");
                setDrawingScales({ ...drawingScales, [selectedDrawingId]: "custom" });
              } else {
                setDrawingScales({ ...drawingScales, [selectedDrawingId]: e.target.value });
              }
            }} style={inp(C, { width: 120, padding: "3px 6px", fontSize: 9 })}>
              <option value="">Not Set</option>
              <optgroup label="Architectural">
                <option value="full">1"=1' (Full)</option><option value="half">1/2"=1'</option><option value="3-8">3/8"=1'</option><option value="quarter">1/4"=1'</option><option value="3-16">3/16"=1'</option><option value="eighth">1/8"=1'</option><option value="3-32">3/32"=1'</option><option value="sixteenth">1/16"=1'</option>
              </optgroup>
              <optgroup label="Engineering">
                <option value="eng10">1"=10'</option><option value="eng20">1"=20'</option><option value="eng30">1"=30'</option><option value="eng40">1"=40'</option><option value="eng50">1"=50'</option><option value="eng100">1"=100'</option>
              </optgroup>
              <optgroup label="Metric">
                <option value="1:1">1:1</option><option value="1:5">1:5</option><option value="1:10">1:10</option><option value="1:20">1:20</option><option value="1:50">1:50</option><option value="1:100">1:100</option><option value="1:200">1:200</option><option value="1:500">1:500</option>
              </optgroup>
              <optgroup label="─────────"><option value="custom">Custom (Calibrate)</option></optgroup>
            </select>
            {drawingScales[selectedDrawingId] && drawingScales[selectedDrawingId] !== "custom" && <span style={{ color: C.accent, fontWeight: 600, fontSize: 8 }}>✓</span>}
            {drawingScales[selectedDrawingId] === "custom" && tkCalibrations[selectedDrawingId] && <span style={{ color: C.green, fontWeight: 600, fontSize: 8 }}>✓ Cal</span>}
            {!drawingScales[selectedDrawingId] && !tkCalibrations[selectedDrawingId] && <span style={{ fontSize: 7, color: C.orange, fontWeight: 500 }} title="No scale set">⚠ No scale</span>}
          </>)}
          {/* Divider + Settings gear + NOVA orb toggle */}
          {selectedDrawing && (<>
            <div style={{ width: 1, height: 20, background: C.border, margin: "0 2px", flexShrink: 0 }} />
                {/* NOVA Orb — always-present panel toggle */}
                <div style={{ position: "relative", flexShrink: 0, display: "flex", alignItems: "center" }} title="Toggle NOVA">
                  <NovaOrb size={30} onClick={() => setTkNovaPanelOpen(v => !v)} />
                  {tkPredictions?.predictions?.length > 0 && !tkNovaPanelOpen && (
                    <span style={{ position: "absolute", top: -2, right: -4, background: C.accent, color: "#fff", fontSize: 7, fontWeight: 800, padding: "1px 4px", borderRadius: 6, minWidth: 14, textAlign: "center", pointerEvents: "none" }}>
                      {tkPredictions.predictions.filter(p => !tkPredAccepted.includes(p.id) && !tkPredRejected.includes(p.id)).length}
                    </span>
                  )}
                </div>
                {/* Settings gear popover (DPI + future settings) */}
                <div ref={settingsBtnRef} style={{ position: "relative", flexShrink: 0 }}>
                  <button onClick={() => setSettingsOpen(v => !v)} title="Drawing settings"
                    style={{ width: 24, height: 24, border: `1px solid ${settingsOpen ? C.accent + '60' : C.border}`, background: settingsOpen ? C.accent + '12' : C.bg2, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                    <Ic d={I.settings} size={11} color={settingsOpen ? C.accent : C.textMuted} />
                  </button>
                  {settingsOpen && (() => {
                    const r = settingsBtnRef.current?.getBoundingClientRect();
                    return (
                      <div style={{ position: "fixed", top: (r?.bottom || 0) + 4, right: Math.max(8, window.innerWidth - (r?.right || 0)), width: 200, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: T.shadow.lg, zIndex: T.z.dropdown, padding: 12, animation: "fadeIn 0.1s ease-out" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Drawing Settings</div>
                        {selectedDrawing?.type === "image" && drawingScales[selectedDrawingId] && drawingScales[selectedDrawingId] !== "custom" && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 10, color: C.text, fontWeight: 500 }}>DPI</span>
                            <input type="number" value={drawingDpi[selectedDrawingId] || DEFAULT_IMAGE_DPI}
                              onChange={e => setDrawingDpi({ ...drawingDpi, [selectedDrawingId]: parseInt(e.target.value) || 150 })}
                              style={{ flex: 1, width: 60, padding: "4px 6px", fontSize: 10, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 4, background: C.bg2, color: C.text, textAlign: "center" }}
                              title="Image scan DPI" />
                          </div>
                        )}
                        {!(selectedDrawing?.type === "image" && drawingScales[selectedDrawingId] && drawingScales[selectedDrawingId] !== "custom") && (
                          <div style={{ fontSize: 10, color: C.textDim }}>No additional settings for this drawing type.</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
          </>)}
          </div>
        </div>

        {/* ── Unified Measurement HUD ── */}
        {(() => {
          // Determine HUD mode
          const hudCalibrating = tkTool === "calibrate" && tkActivePoints.length === 2;
          const hudAutoCount = !!tkAutoCount;
          const hudMeasuring = selectedDrawing?.data && tkMeasureState !== "idle" && tkActiveTakeoffId;
          const hudPredictions = tkPredictions && tkPredictions.predictions.length > 0;
          const hudActive = hudCalibrating || hudAutoCount || hudMeasuring || hudPredictions;
          if (!hudActive) return null;

          const activeTo = hudMeasuring ? takeoffs.find(t => t.id === tkActiveTakeoffId) : null;
          const mQty = activeTo ? getMeasuredQty(activeTo) : 0;
          const scaleSet = hasScale(selectedDrawingId);
          const calUnit = getDisplayUnit(selectedDrawingId);
          const toolLabel = tkTool === "count" ? "Count" : tkTool === "linear" ? "Linear" : "Area";
          const predColor = activeTo?.color || "#8B5CF6";

          // Prediction helpers
          const preds = hudPredictions ? tkPredictions.predictions : [];
          const pending = preds.filter(p => !tkPredAccepted.includes(p.id) && !tkPredRejected.includes(p.id));
          const accepted = preds.filter(p => tkPredAccepted.includes(p.id));
          const rejected = preds.filter(p => tkPredRejected.includes(p.id));
          const ctxConfidence = tkPredContext?.confidence || 0;
          const confPct = Math.round(ctxConfidence * 100);
          const isHighConf = ctxConfidence >= 0.75;
          const isMedConf = ctxConfidence >= 0.5;

          // One-click: accept all pending predictions and immediately create measurements
          const handleAcceptAllAndConfirm = () => {
            const toAdd = preds.filter(p => !tkPredRejected.includes(p.id));
            if (tkActiveTakeoffId && toAdd.length > 0) {
              toAdd.forEach(() => recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, true));
              toAdd.forEach(pred => {
                if (pred.type === "count" || pred.type === "wall-tag") {
                  addMeasurement(tkActiveTakeoffId, {
                    type: "count", points: [pred.point], value: 1,
                    sheetId: selectedDrawingId, color: activeTo?.color || "#5b8def",
                    predicted: true, tag: tkPredictions.tag,
                  });
                } else if (pred.type === "wall" && pred.points?.length >= 2) {
                  addMeasurement(tkActiveTakeoffId, {
                    type: "linear", points: pred.points, value: 0,
                    sheetId: selectedDrawingId, color: activeTo?.color || "#5b8def",
                    predicted: true, tag: tkPredictions.tag,
                  });
                } else if (pred.type === "area" && pred.points?.length >= 3) {
                  addMeasurement(tkActiveTakeoffId, {
                    type: "area", points: pred.points, value: 0,
                    sheetId: selectedDrawingId, color: activeTo?.color || "#5b8def",
                    predicted: true, tag: pred.tag || tkPredictions.tag,
                  });
                }
              });
              showToast(`Added ${toAdd.length} predicted measurements`);
            }
            clearPredictions();
          };
          // Individual accept: immediately add measurement for a single prediction
          const handleAcceptOne = (pred) => {
            acceptPrediction(pred.id);
            recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, true);
            if (tkActiveTakeoffId) {
              if (pred.type === "count" || pred.type === "wall-tag") {
                addMeasurement(tkActiveTakeoffId, {
                  type: "count", points: [pred.point], value: 1,
                  sheetId: selectedDrawingId, color: activeTo?.color || "#5b8def",
                  predicted: true, tag: tkPredictions.tag,
                });
              } else if (pred.type === "wall" && pred.points?.length >= 2) {
                addMeasurement(tkActiveTakeoffId, {
                  type: "linear", points: pred.points, value: 0,
                  sheetId: selectedDrawingId, color: activeTo?.color || "#5b8def",
                  predicted: true, tag: tkPredictions.tag,
                });
              } else if (pred.type === "area" && pred.points?.length >= 3) {
                addMeasurement(tkActiveTakeoffId, {
                  type: "area", points: pred.points, value: 0,
                  sheetId: selectedDrawingId, color: activeTo?.color || "#5b8def",
                  predicted: true, tag: pred.tag || tkPredictions.tag,
                });
              }
            }
          };
          const handleDismiss = () => clearPredictions();

          return (
            <div style={{ height: 32, padding: "0 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8, background: hudCalibrating ? "rgba(220,38,38,0.05)" : hudAutoCount ? "rgba(168,126,230,0.06)" : activeTo ? `${activeTo.color}08` : C.bg1, transition: "background 0.2s ease", flexShrink: 0, animation: "fadeIn 0.15s ease-out", position: "relative" }}>

              {/* ─ Calibrating mode ─ */}
              {hudCalibrating && (<>
                <span style={{ fontSize: 13 }}>📐</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#dc2626" }}>Set scale:</span>
                <input type="number" value={tkCalibInput.dist} onChange={e => setTkCalibInput({ ...tkCalibInput, dist: e.target.value })} placeholder="Distance..." autoFocus
                  style={nInp(C, { width: 80, padding: "4px 6px", fontSize: 11, fontWeight: 600, border: "1px solid #dc2626" })} />
                <select value={tkCalibInput.unit} onChange={e => setTkCalibInput({ ...tkCalibInput, unit: e.target.value })}
                  style={inp(C, { width: 50, padding: "4px 3px", fontSize: 9 })}>
                  <option value="ft">ft</option><option value="in">in</option><option value="m">m</option><option value="cm">cm</option>
                </select>
                <button className="accent-btn" onClick={finishCalibration} disabled={!nn(tkCalibInput.dist)}
                  style={bt(C, { background: nn(tkCalibInput.dist) ? "#dc2626" : C.bg3, color: nn(tkCalibInput.dist) ? "#fff" : C.textDim, padding: "4px 12px", fontSize: 9 })}>
                  ✓ Set
                </button>
                <button onClick={() => { setTkActivePoints([]); setTkTool("select"); }} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "4px 8px", fontSize: 9 })}>✕</button>
              </>)}

              {/* ─ Auto Count mode ─ */}
              {!hudCalibrating && hudAutoCount && (<>
                <span style={{ fontSize: 13 }}>🔢</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: C.purple }}>Auto Count</span>
                {tkAutoCount.phase === "select" && <span style={{ fontSize: 9, color: C.text }}>Click a <strong>sample symbol</strong> to count matches</span>}
                {tkAutoCount.phase === "scanning" && <span style={{ fontSize: 9, color: C.text, display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 12 }}>⟳</span> Scanning...</span>}
                {tkAutoCount.phase === "done" && <span style={{ fontSize: 9, color: C.green, fontWeight: 600 }}>Found {tkAutoCount.results?.length || 0} matches</span>}
                <button onClick={() => setTkAutoCount(null)} style={bt(C, { marginLeft: "auto", background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "3px 10px", fontSize: 8 })}>✕</button>
              </>)}

              {/* ─ Measuring mode (compact) ─ */}
              {!hudCalibrating && !hudAutoCount && hudMeasuring && activeTo && (<>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: tkMeasureState === "measuring" ? activeTo.color : C.orange, animation: tkMeasureState === "measuring" ? "pulse 1.5s infinite" : "none" }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: activeTo.color, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeTo.description.substring(0, 30)}</span>
                <button onClick={stopMeasuring} title="Stop (Esc)"
                  style={bt(C, { padding: "3px 10px", fontSize: 8, fontWeight: 600, borderRadius: 4, background: C.red, color: "#fff", display: "flex", alignItems: "center", gap: 3 })}>
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="#fff"><rect width="8" height="8" rx="1" /></svg> Stop
                </button>
                <div style={{ width: 1, height: 16, background: C.border }} />
                <span style={{ fontSize: 9, fontWeight: 600, color: C.text }}>{toolLabel}:</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>
                  {tkTool === "count" ? `${mQty ?? 0} EA` : (!scaleSet ? <span style={{ color: C.orange, fontSize: 9 }}>⚠ Set scale</span> : `${mQty ?? 0} ${tkTool === "area" ? calUnit + "²" : calUnit}`)}
                </span>
                <span style={{ fontSize: 8, color: C.textDim }}>
                  {tkMeasureState === "measuring" ? "click to measure" : "paused"}
                </span>

                {/* NOVA Vision — compact HUD badge toggles right panel */}
                {hudPredictions && pending.length > 0 && !tkPredRefining && (
                  <button onClick={() => setTkNovaPanelOpen(v => !v)}
                    style={bt(C, { marginLeft: "auto", background: "linear-gradient(135deg, #6366F115, #8B5CF615)", color: "#8B5CF6", border: "1px solid #8B5CF630", padding: "2px 8px", fontSize: 8, fontWeight: 700, borderRadius: 3 })}>
                    <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: 0.5 }}>NOVA</span> {pending.length} {tkNovaPanelOpen ? "◂" : "▸"}
                  </button>
                )}
                {hudPredictions && tkPredRefining && (
                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: C.orange, marginLeft: "auto" }}>
                    <span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 10 }}>⟳</span> Scanning
                  </span>
                )}
              </>)}

              {/* ─ Predictions only (not measuring) — compact badge opens panel ─ */}
              {!hudCalibrating && !hudAutoCount && !hudMeasuring && hudPredictions && (<>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: tkPredRefining ? C.orange : pending.length > 0 ? "#8B5CF6" : C.green, boxShadow: `0 0 8px ${tkPredRefining ? C.orange : pending.length > 0 ? "#8B5CF6" : C.green}`, animation: tkPredRefining ? "spin 1s linear infinite" : pending.length > 0 ? "pulse 1.5s infinite" : "none" }} />
                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.8, color: "#8B5CF6", background: "linear-gradient(135deg, #6366F115, #8B5CF615)", padding: "2px 6px", borderRadius: 3 }}>NOVA VISION</span>
                {tkPredRefining ? (
                  <span style={{ fontSize: 10, color: C.orange, fontWeight: 600 }}>Scanning...</span>
                ) : (<>
                  <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${predColor}20`, color: predColor, fontFamily: "'DM Sans',sans-serif", border: `1px solid ${predColor}30` }}>{tkPredictions.tag || "—"}</span>
                  <span style={{ fontSize: 10, color: C.text, fontWeight: 500 }}>
                    {pending.length > 0 ? `${preds.length} found` : `${accepted.length} accepted`}
                  </span>
                </>)}
                <div style={{ flex: 1 }} />
                <button onClick={() => setTkNovaPanelOpen(v => !v)}
                  style={bt(C, { background: `${predColor}15`, color: predColor, border: `1px solid ${predColor}30`, padding: "2px 8px", fontSize: 8, fontWeight: 700, borderRadius: 3 })}>
                  {tkNovaPanelOpen ? "Hide Panel ◂" : `Review ${pending.length} ▸`}
                </button>
                <button onClick={handleDismiss} title="Dismiss" style={{ width: 22, height: 22, border: `1px solid ${C.border}`, borderRadius: 4, background: C.bg2, color: C.textDim, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={C.textDim} strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg>
                </button>
              </>)}
            </div>
          );
        })()}

        {/* Scale-not-set banner */}
        {selectedDrawingId && !hasScale(selectedDrawingId) && (tkMeasureState === "measuring" || tkMeasureState === "paused") && (
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, background: "#FEF3C7", borderLeft: "3px solid #F59E0B" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#92400E" }}>⚠ No scale set for this drawing. Measurements saved but quantities won't calculate until you set a scale.</span>
            <select value="" onChange={e => {
              if (e.target.value === "custom") {
                setTkTool("calibrate"); setTkActivePoints([]); setTkMeasureState("idle");
                setDrawingScales({ ...drawingScales, [selectedDrawingId]: "custom" });
              } else if (e.target.value) {
                setDrawingScales({ ...drawingScales, [selectedDrawingId]: e.target.value });
              }
            }} style={inp(C, { width: 110, padding: "3px 6px", fontSize: 9, fontWeight: 600, background: "#fff", border: "1px solid #F59E0B" })}>
              <option value="">Set Scale ▼</option>
              <option value="quarter">1/4"=1'</option><option value="eighth">1/8"=1'</option><option value="half">1/2"=1'</option><option value="3-8">3/8"=1'</option>
              <option value="eng20">1"=20'</option><option value="eng50">1"=50'</option>
              <option value="custom">Calibrate...</option>
            </select>
            <button onClick={() => {
              setTkTool("calibrate"); setTkActivePoints([]); setTkMeasureState("idle");
              setDrawingScales({ ...drawingScales, [selectedDrawingId]: "custom" });
            }} style={bt(C, { padding: "3px 10px", fontSize: 8, fontWeight: 700, borderRadius: 4, background: "#F59E0B", color: "#fff" })}>
              📐 Calibrate
            </button>
          </div>
        )}

        {/* AI Drawing Analysis Results */}
        {aiDrawingAnalysis && !aiDrawingAnalysis.loading && aiDrawingAnalysis.results.length > 0 && (
          <div style={{ borderBottom: `1px solid ${C.accent}30`, background: `${C.accent}06`, maxHeight: 200, overflowY: "auto" }}>
            <div style={{ padding: "5px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.accent}15` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.accent }}><Ic d={I.ai} size={10} color={C.accent} /> {aiDrawingAnalysis.results.length} Elements Detected</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={acceptAllDrawingItems} style={bt(C, { background: C.green, color: "#fff", padding: "2px 8px", fontSize: 8, fontWeight: 600 })}>Add All</button>
                <button onClick={() => setAiDrawingAnalysis(null)} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "2px 6px", fontSize: 8 })}>✕</button>
              </div>
            </div>
            {aiDrawingAnalysis.results.map((item, i) => {
              const isCount = item.type === "count";
              const hasLocs = (item.locations || []).length > 0;
              return (
                <div key={i} style={{ padding: "3px 10px", display: "flex", gap: 6, alignItems: "center", borderBottom: `1px solid ${C.bg2}`, fontSize: 10 }}>
                  <span style={{
                    fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                    background: item.type === "count" ? `${C.green}15` : item.type === "linear" ? `${C.blue}15` : `${C.purple}15`,
                    color: item.type === "count" ? C.green : item.type === "linear" ? C.blue : C.purple,
                  }}>{item.type?.toUpperCase()}</span>
                  <span style={{ flex: 1, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={item.notes || item.name}>{item.name}</span>
                  {isCount ? (
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 9, color: C.accent, fontWeight: 600, flexShrink: 0 }}>
                      {item.quantity || (item.locations || []).length} {item.unit}
                    </span>
                  ) : (
                    <span style={{ fontSize: 8, color: C.orange, fontWeight: 500, flexShrink: 0, fontStyle: "italic" }}>
                      needs measuring
                    </span>
                  )}
                  <span style={{ fontSize: 7, color: item.confidence === "high" ? C.green : item.confidence === "low" ? C.orange : C.textDim, fontWeight: 600, flexShrink: 0 }}>
                    {item.confidence}
                  </span>
                  {hasLocs && <span style={{ fontSize: 7, color: C.accent, flexShrink: 0 }} title="Located on drawing">📍</span>}
                  <button onClick={() => acceptDrawingItem(item)} title={isCount ? "Add to takeoffs" : "Add to takeoffs — measure for accurate qty"}
                    style={bt(C, { background: `${C.green}15`, border: `1px solid ${C.green}30`, color: C.green, padding: "1px 6px", fontSize: 8, fontWeight: 600, flexShrink: 0 })}>+</button>
                </div>
              );
            })}
          </div>
        )}

        {/* AI Wall Schedule Preview Modal */}
        {wallSchedule.results && wallSchedule.results.length > 0 && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setWallSchedule({ loading: false, results: null, error: null }); }}>
            <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, width: 580, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 16px 48px rgba(0,0,0,0.3)" }}
              onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Ic d={I.ai} size={16} color={C.accent} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Wall Types Detected</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.accent, background: `${C.accent}15`, padding: "2px 8px", borderRadius: 10 }}>{wallSchedule.results.length} found</span>
                </div>
                <button onClick={() => setWallSchedule({ loading: false, results: null, error: null })}
                  style={{ width: 28, height: 28, border: "none", background: C.bg2, color: C.textDim, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
              {/* Wall Types List */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                {wallSchedule.results.map((mapped, i) => {
                  const wt = mapped.wallType;
                  const specSummary = [];
                  if (mapped.specs.Material) specSummary.push(mapped.specs.Material);
                  if (mapped.specs.StudSize) specSummary.push(mapped.specs.StudSize);
                  if (mapped.specs.MSStudSize) specSummary.push(mapped.specs.MSStudSize);
                  if (mapped.specs.MSGauge) specSummary.push(mapped.specs.MSGauge);
                  if (mapped.specs.CMUWidth) specSummary.push(`${mapped.specs.CMUWidth} CMU`);
                  if (mapped.specs.ConcThickness) specSummary.push(`${mapped.specs.ConcThickness} Conc`);
                  if (mapped.specs.PlanSpacing) specSummary.push(mapped.specs.PlanSpacing);
                  if (mapped.specs.MSSpacing) specSummary.push(mapped.specs.MSSpacing);
                  if (mapped.specs.WallHeight) specSummary.push(`${mapped.specs.WallHeight}' Ht`);
                  const confColor = wt.confidence === "high" ? C.green : wt.confidence === "low" ? C.orange : C.textDim;
                  return (
                    <div key={i} style={{ padding: "10px 20px", borderBottom: `1px solid ${C.bg2}`, display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, minWidth: 60 }}>{mapped.label}</span>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                          background: wt.category === "exterior" ? `${C.orange}15` : `${C.blue}15`,
                          color: wt.category === "exterior" ? C.orange : C.blue,
                          textTransform: "uppercase",
                        }}>{wt.category}</span>
                        <span style={{ flex: 1, fontSize: 10, color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wt.description || ""}</span>
                        <span style={{ fontSize: 8, fontWeight: 600, color: confColor }}>{wt.confidence}</span>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {specSummary.map((s, j) => (
                          <span key={j} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: `${C.accent}10`, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>{s}</span>
                        ))}
                      </div>
                      {wt.finishes && (
                        <div style={{ fontSize: 9, color: C.textDim }}>
                          {wt.finishes.interior && <span>Int: {wt.finishes.interior} </span>}
                          {wt.finishes.exterior && <span>Ext: {wt.finishes.exterior} </span>}
                          {wt.finishes.insulation && <span>Insul: {wt.finishes.insulation}</span>}
                        </div>
                      )}
                      {wt.notes && <div style={{ fontSize: 9, color: C.textDim, fontStyle: "italic" }}>{wt.notes}</div>}
                      {mapped.warnings.length > 0 && (
                        <div style={{ fontSize: 8, color: C.orange }}>⚠ {mapped.warnings.join(" | ")}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Modal Footer */}
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setWallSchedule({ loading: false, results: null, error: null })}
                  style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "8px 16px", fontSize: 11, fontWeight: 600, borderRadius: 6 })}>Cancel</button>
                <button onClick={() => createWallInstances(wallSchedule.results)}
                  style={bt(C, { background: C.accent, color: "#fff", padding: "8px 20px", fontSize: 11, fontWeight: 700, borderRadius: 6 })}>
                  Create All ({wallSchedule.results.length})
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PDF Schedule Scan Results Modal */}
        {pdfSchedules.results && pdfSchedules.results.length > 0 && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}
            onClick={(e) => { if (e.target === e.currentTarget) setPdfSchedules({ loading: false, results: null }); }}>
            <div style={{ background: C.bg, borderRadius: 12, border: `1px solid ${C.border}`, width: 640, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 16px 48px rgba(0,0,0,0.3)" }}
              onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round"><path d="M3 12h4l3-9 4 18 3-9h4" /></svg>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Schedules Detected</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#10B981", background: "#10B98115", padding: "2px 8px", borderRadius: 10 }}>
                    {pdfSchedules.results.length} schedule{pdfSchedules.results.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <button onClick={() => setPdfSchedules({ loading: false, results: null })}
                  style={{ width: 28, height: 28, border: "none", background: C.bg2, color: C.textDim, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
              {/* Schedule List */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                {pdfSchedules.results.map((sched, i) => {
                  const typeColors = { wall: C.accent, door: C.orange, window: C.blue, finish: C.purple || "#8B5CF6", fixture: C.green, equipment: C.textDim };
                  const typeColor = typeColors[sched.type] || C.textDim;
                  return (
                    <div key={i} style={{ borderBottom: `1px solid ${C.bg2}` }}>
                      {/* Schedule header */}
                      <div style={{ padding: "10px 20px", display: "flex", alignItems: "center", gap: 8, background: `${typeColor}08` }}>
                        <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: `${typeColor}15`, color: typeColor, textTransform: "uppercase" }}>{sched.type}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{sched.title}</span>
                        <span style={{ fontSize: 9, color: C.textDim }}>Sheet {sched.sheetNumber}</span>
                        <span style={{ fontSize: 9, color: C.textDim, fontFamily: "'DM Sans',sans-serif" }}>{sched.itemCount} items</span>
                      </div>
                      {/* Schedule rows */}
                      {sched.data.slice(0, 8).map((row, j) => (
                        <div key={j} style={{ padding: "6px 20px 6px 36px", display: "flex", alignItems: "center", gap: 8, fontSize: 10 }}>
                          <span style={{ fontWeight: 700, color: typeColor, minWidth: 40, fontFamily: "'DM Sans',sans-serif" }}>
                            {row.typeLabel || row.mark || row.roomNo || "—"}
                          </span>
                          <span style={{ flex: 1, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.description || row.roomName || row.type || ""}
                          </span>
                          {row.material && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: `${C.accent}10`, color: C.text }}>{row.material}</span>}
                          {row.MSStudSize && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: `${C.accent}10`, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>{row.MSStudSize}</span>}
                          {row.MSGauge && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: `${C.accent}10`, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>{row.MSGauge}</span>}
                          {row.confidence && (
                            <span style={{ fontSize: 7, fontWeight: 600, color: row.confidence === "high" ? C.green : row.confidence === "low" ? C.orange : C.textDim }}>
                              {row.confidence}
                            </span>
                          )}
                        </div>
                      ))}
                      {sched.data.length > 8 && (
                        <div style={{ padding: "4px 36px", fontSize: 9, color: C.textDim }}>+ {sched.data.length - 8} more...</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Modal Footer */}
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 9, color: C.textDim }}>
                  {pdfSchedules.results.reduce((s, sc) => s + sc.itemCount, 0)} total items across {pdfSchedules.results.length} schedule(s)
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setPdfSchedules({ loading: false, results: null })}
                    style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "8px 16px", fontSize: 11, fontWeight: 600, borderRadius: 6 })}>Close</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sheet info bar */}
        {selectedDrawing && (
          <div style={{ padding: "3px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 9, color: C.textDim, background: C.bg }}>
            {selectedDrawing.sheetNumber || selectedDrawing.pageNumber || "—"} | {selectedDrawing.sheetTitle || selectedDrawing.label || "Untitled"} | Rev {selectedDrawing.revision || "0"}
          </div>
        )}

        {/* Drawing display area */}
        <div ref={drawingContainerRef} onMouseDown={handleDrawingMouseDown} onContextMenu={e => e.preventDefault()}
          style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: C.isDark ? "#1a1d24" : "#e5e7eb", position: "relative", cursor: tkPanning.current ? "grabbing" : "default" }}>
          {!selectedDrawing ? (
            <div style={{ color: C.textDim, textAlign: "center", padding: 40, maxWidth: 400, animation: "fadeIn 0.3s ease-out" }}>
              {drawings.length === 0 ? (<>
                {/* Workflow stepper empty state — confident & beautiful */}
                <div style={{ position: "relative", display: "inline-block", marginBottom: 20 }}>
                  <div style={{ position: "absolute", inset: -16, borderRadius: "50%", border: `1px solid ${C.accent}10`, animation: "breathe 4s ease-in-out infinite" }} />
                  <div style={{ position: "absolute", inset: -8, borderRadius: "50%", border: `1px solid ${C.accent}15`, animation: "breathe 4s ease-in-out infinite 0.4s" }} />
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg, ${C.accent}18, ${C.accent}06)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 32px ${C.accent}15`, position: "relative" }}>
                    <Ic d={I.plans} size={26} color={C.accent} sw={1.5} />
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6, letterSpacing: -0.3 }}>Start your takeoff</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, marginBottom: 24 }}>Upload drawings in the <strong style={{ color: C.text }}>Discovery</strong> tab to begin.</div>
                <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  {[
                    { step: 1, label: "Upload drawings", desc: "Go to Discovery tab to add PDFs or images", icon: I.upload },
                    { step: 2, label: "Set scale", desc: "Calibrate or select a preset scale", icon: I.ruler },
                    { step: 3, label: "Create takeoffs", desc: "Add items to measure from the left panel", icon: I.plus },
                    { step: 4, label: "Measure", desc: "Click on drawings to record quantities", icon: I.polygon },
                  ].map(s => (
                    <div key={s.step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ width: 24, height: 24, borderRadius: 12, background: `${C.accent}15`, color: C.accent, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{s.step}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12, color: C.text }}>{s.label}</div>
                        <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", fontSize: 9, color: C.textDim }}>
                  <span><kbd style={{ padding: "1px 4px", borderRadius: 3, background: C.bg2, border: `1px solid ${C.border}`, fontSize: 9, fontFamily: "'DM Sans',sans-serif" }}>⌘K</kbd> Command palette</span>
                  <span><kbd style={{ padding: "1px 4px", borderRadius: 3, background: C.bg2, border: `1px solid ${C.border}`, fontSize: 9, fontFamily: "'DM Sans',sans-serif" }}>Esc</kbd> Stop measuring</span>
                </div>
              </>) : (<>
                {/* Select a drawing — confident with thumbnails */}
                <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
                  <div style={{ position: "absolute", inset: -8, borderRadius: "50%", border: `1px solid ${C.accent}10`, animation: "breathe 3s ease-in-out infinite" }} />
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `linear-gradient(135deg, ${C.accent}12, ${C.accent}06)`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                    <Ic d={I.plans} size={22} color={C.accent} sw={1.5} />
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4, letterSpacing: -0.2 }}>Choose a drawing</div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 6 }}>{drawings.length} drawing{drawings.length !== 1 ? "s" : ""} ready to measure</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, marginBottom: 12 }}>
                  {drawings.filter(d => d.data).slice(0, 3).map(d => {
                    const thumb = d.type === "pdf" ? pdfCanvases[d.id] : d.data;
                    return (
                      <div key={d.id} onClick={() => { setSelectedDrawingId(d.id); if (d.type === "pdf" && d.data) renderPdfPage(d); }}
                        style={{ width: 80, height: 60, borderRadius: 6, overflow: "hidden", cursor: "pointer", background: C.bg2, border: `1px solid ${C.border}`, transition: "all 0.15s", position: "relative" }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                        onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                        {thumb ? <img src={thumb} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: C.textDim }}>...</div>}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "1px 3px", background: "rgba(0,0,0,0.7)", fontSize: 7, fontWeight: 600, color: "#fff", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.sheetNumber || d.pageNumber || "?"}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>Use ◀ ▶ arrows or click thumbnails above</div>
              </>)}
            </div>
          ) : !selectedDrawing.data ? (
            <div style={{ color: C.orange, fontSize: 12, textAlign: "center", padding: 20 }}>
              <Ic d={I.upload} size={24} color={C.orange} /><br />
              <span style={{ marginTop: 6, display: "block" }}>File needs re-upload</span>
              <span style={{ fontSize: 10, color: C.textDim }}>Drawing data is not stored between sessions.<br />Go to <strong>Discovery</strong> to re-attach the file.</span>
            </div>
          ) : (
            <div style={{ transform: `translate(${tkPan.x}px,${tkPan.y}px) scale(${tkZoom / 100})`, transformOrigin: "0 0", position: "relative" }}>
              {selectedDrawing.type === "image" ? (
                <img ref={drawingImgRef} src={selectedDrawing.data} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                  onLoad={e => { const w = e.target.naturalWidth, h = e.target.naturalHeight; if (canvasRef.current) { canvasRef.current.width = w; canvasRef.current.height = h; } if (cursorCanvasRef.current) { cursorCanvasRef.current.width = w; cursorCanvasRef.current.height = h; } if (predictionCanvasRef.current) { predictionCanvasRef.current.width = w; predictionCanvasRef.current.height = h; } }} />
              ) : pdfCanvases[selectedDrawing.id] ? (
                <img ref={drawingImgRef} src={pdfCanvases[selectedDrawing.id]} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                  onLoad={e => { const w = e.target.naturalWidth, h = e.target.naturalHeight; if (canvasRef.current) { canvasRef.current.width = w; canvasRef.current.height = h; } if (cursorCanvasRef.current) { cursorCanvasRef.current.width = w; cursorCanvasRef.current.height = h; } if (predictionCanvasRef.current) { predictionCanvasRef.current.width = w; predictionCanvasRef.current.height = h; } }} />
              ) : <div style={{ color: C.textDim, fontSize: 11 }}>Loading PDF page...</div>}
              {/* Canvas overlay */}
              <canvas ref={canvasRef} className="tk-canvas-cursor" onClick={handleCanvasClick}
                onMouseMove={e => {
                  const rect = e.target.getBoundingClientRect();
                  const sx = (canvasRef.current?.width || 1) / rect.width;
                  const sy = (canvasRef.current?.height || 1) / rect.height;
                  const pt = { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };

                  // Idle/stopped: show pointer cursor when hovering over clickable measurements
                  if (tkMeasureState !== "measuring" && tkMeasureState !== "paused") {
                    const zs = Math.max(1, sx);
                    const cr = Math.max(30, 30 * zs), lr = Math.max(12, 15 * zs);
                    let hovering = false;
                    for (const to of useTakeoffsStore.getState().takeoffs) {
                      for (const m of (to.measurements || [])) {
                        if (m.sheetId !== selectedDrawingId) continue;
                        if (m.type === "count") {
                          if (Math.sqrt((pt.x - m.points[0].x) ** 2 + (pt.y - m.points[0].y) ** 2) < cr) hovering = true;
                        } else if (m.type === "linear" && m.points.length >= 2) {
                          for (let i = 0; i < m.points.length - 1; i++) {
                            const a = m.points[i], b = m.points[i + 1];
                            const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
                            if (len < 1) continue;
                            const t2 = Math.max(0, Math.min(1, ((pt.x - a.x) * (b.x - a.x) + (pt.y - a.y) * (b.y - a.y)) / (len * len)));
                            const proj = { x: a.x + t2 * (b.x - a.x), y: a.y + t2 * (b.y - a.y) };
                            if (Math.sqrt((pt.x - proj.x) ** 2 + (pt.y - proj.y) ** 2) < lr) hovering = true;
                          }
                        } else if (m.type === "area" && m.points.length >= 3) {
                          let inside = false;
                          const pts2 = m.points;
                          for (let i = 0, j = pts2.length - 1; i < pts2.length; j = i++) {
                            const xi = pts2[i].x, yi = pts2[i].y, xj = pts2[j].x, yj = pts2[j].y;
                            if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) inside = !inside;
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
                  if (e.shiftKey && tkActivePoints.length >= 1) {
                    snapped = snapAngle(tkActivePoints[tkActivePoints.length - 1], pt);
                  }
                  shiftHeldRef.current = e.shiftKey;
                  pendingCursorRef.current = snapped;
                  if (!rafCursorRef.current) {
                    rafCursorRef.current = requestAnimationFrame(() => {
                      rafCursorRef.current = null;
                      if (pendingCursorRef.current) setTkCursorPt(pendingCursorRef.current);
                    });
                  }
                }}
                onMouseLeave={() => setTkCursorPt(null)}
                onMouseDown={e => { if (e.button === 2 || e.button === 1) handleDrawingMouseDown(e); }}
                onContextMenu={e => e.preventDefault()}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                  cursor: tkAutoCount?.phase === "select" ? "crosshair" : tkTool === "calibrate" ? "crosshair" : "none",
                  pointerEvents: "auto" }} />
              {/* Prediction ghost overlay canvas — animated ghost markers */}
              <canvas ref={predictionCanvasRef}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
              {/* Cursor overlay canvas — lightweight layer for cursor-dependent rendering */}
              <canvas ref={cursorCanvasRef}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
            </div>
          )}

          {/* Floating specs card — shows module specs during measuring */}
          {tkMeasureState === "measuring" && tkActiveTakeoffId && (() => {
            const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
            if (!to?.linkedItemId) return null;
            // Find the module/category/instance that owns this takeoff
            for (const modId of Object.keys(moduleInstances)) {
              const inst = moduleInstances[modId];
              const mod = MODULES[modId];
              if (!mod || !inst) continue;
              for (const cat of mod.categories) {
                if (!cat.multiInstance) continue;
                const catInstances = inst.categoryInstances?.[cat.id] || [];
                for (const ci of catInstances) {
                  const linked = ci.itemTakeoffIds || {};
                  if (Object.values(linked).includes(to.id)) {
                    // Found it — render compact specs card
                    const material = ci.specs?.Material || cat.specs?.find(s => s.id === "Material")?.default || "";
                    const keySpecs = cat.specs
                      .filter(s => s.id !== "Material" && (!s.condition || (() => {
                        const ctx = { ...ci.specs };
                        cat.specs.forEach(ss => { if (ctx[ss.id] === undefined) ctx[ss.id] = ss.default; });
                        return evalCondition(s.condition, ctx);
                      })()))
                      .slice(0, 4)
                      .map(s => ({ label: s.label, value: ci.specs?.[s.id] || s.default, unit: s.unit }));
                    return (
                      <div style={{
                        position: "absolute", top: 10, left: 10, zIndex: 30,
                        width: 200, background: `${C.bg1}E8`, backdropFilter: "blur(8px)",
                        border: `1px solid ${C.border}`, borderRadius: 8,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.2)", padding: "8px 10px",
                        pointerEvents: "auto", transition: "opacity 0.2s", fontSize: 9,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: to.color || C.accent }} />
                          <span style={{ fontWeight: 700, color: C.text, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ci.label || cat.name}
                          </span>
                          <span style={{ fontSize: 8, fontWeight: 600, color: "#fff", background: to.color || C.accent, padding: "1px 5px", borderRadius: 3 }}>{material}</span>
                        </div>
                        {keySpecs.map((s, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderTop: i === 0 ? `1px solid ${C.border}40` : "none" }}>
                            <span style={{ color: C.textDim, fontSize: 8 }}>{s.label}</span>
                            <span style={{ fontWeight: 600, color: C.text, fontFamily: "'DM Sans',sans-serif" }}>{s.value}{s.unit ? ` ${s.unit}` : ""}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                }
              }
            }
            return null;
          })()}

          {/* (Prediction approval strip moved to unified HUD above toolbar) */}

          {/* Cross-sheet scan results bar */}
          {crossSheetScan && crossSheetScan.results.length > 0 && (
            <div style={{
              padding: "6px 14px", borderTop: `1px solid ${C.blue}20`,
              background: `${C.blue}06`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
              fontSize: 9,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" strokeLinecap="round"><path d="M4 4h6v6H4z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6H4z" /><path d="M14 14h6v6h-6z" /></svg>
              <span style={{ color: C.text, fontWeight: 600 }}>
                "{crossSheetScan.tag}" found on {crossSheetScan.results.length} other sheet{crossSheetScan.results.length !== 1 ? "s" : ""}:
              </span>
              <div style={{ display: "flex", gap: 4, flex: 1, overflow: "hidden" }}>
                {crossSheetScan.results.map((r, i) => (
                  <button key={i} onClick={() => {
                    setSelectedDrawingId(r.drawingId);
                    const d = drawings.find(d => d.id === r.drawingId);
                    if (d?.type === "pdf" && d.data) renderPdfPage(d);
                  }}
                    style={bt(C, {
                      padding: "2px 8px", fontSize: 8, fontWeight: 600, borderRadius: 3, cursor: "pointer",
                      background: r.drawingId === selectedDrawingId ? `${C.blue}20` : C.bg2,
                      color: r.drawingId === selectedDrawingId ? C.blue : C.text,
                      border: `1px solid ${r.drawingId === selectedDrawingId ? C.blue + "40" : C.border}`,
                    })}>
                    {r.sheetNumber} ({r.instanceCount})
                  </button>
                ))}
              </div>
              <button onClick={() => setCrossSheetScan(null)} style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 10 }}>✕</button>
            </div>
          )}

          {/* Right-click context menu */}
          {tkContextMenu && (<>
            <div onClick={() => setTkContextMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
            <div style={{ position: "fixed", left: tkContextMenu.x, top: tkContextMenu.y, zIndex: 200, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.35)", minWidth: 160, overflow: "hidden", animation: "fadeIn 0.1s" }}>
              {tkActivePoints.length > 0 && (
                <div className="nav-item" onClick={() => { setTkActivePoints(tkActivePoints.slice(0, -1)); setTkContextMenu(null); }}
                  style={{ padding: "7px 12px", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: C.text, borderBottom: `1px solid ${C.bg2}` }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6 M3.51 15a9 9 0 105.64-12.36L1 10" /></svg>
                  Undo Last Point
                </div>
              )}
              {tkActivePoints.length >= 2 && tkTool === "linear" && (
                <div className="nav-item" onClick={() => {
                  const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
                  if (to && tkActivePoints.length >= 2) {
                    addMeasurement(tkActiveTakeoffId, { type: "linear", points: [...tkActivePoints], value: 0, sheetId: selectedDrawingId, color: to.color });
                  }
                  pauseMeasuring(); setTkContextMenu(null);
                }} style={{ padding: "7px 12px", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: C.accent, borderBottom: `1px solid ${C.bg2}` }}>
                  <Ic d={I.check} size={12} color={C.accent} /> Finish Segment
                </div>
              )}
              {tkActivePoints.length >= 3 && tkTool === "area" && (
                <div className="nav-item" onClick={() => {
                  const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
                  if (to && tkActivePoints.length >= 3) {
                    addMeasurement(tkActiveTakeoffId, { type: "area", points: [...tkActivePoints], value: 0, sheetId: selectedDrawingId, color: to.color });
                  }
                  pauseMeasuring(); setTkContextMenu(null);
                }} style={{ padding: "7px 12px", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: C.accent, borderBottom: `1px solid ${C.bg2}` }}>
                  <Ic d={I.check} size={12} color={C.accent} /> Close & Finish Area
                </div>
              )}
              <div className="nav-item" onClick={() => { stopMeasuring(); setTkContextMenu(null); }}
                style={{ padding: "8px 12px", fontSize: 10, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, color: C.red, borderTop: `1px solid ${C.border}` }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill={C.red}><rect width="10" height="10" rx="1.5" /></svg>
                Stop Measuring
              </div>
            </div>
          </>)}
        </div>
      </div>

      {/* ═══ Unified NOVA Right Panel — Vision / Tools / Chat ═══ */}
      {tkNovaPanelOpen && (() => {
        const novaPreds = tkPredictions?.predictions || [];
        const novaPending = novaPreds.filter(p => !tkPredAccepted.includes(p.id) && !tkPredRejected.includes(p.id));
        const novaAccepted = novaPreds.filter(p => tkPredAccepted.includes(p.id));
        const novaActiveTo = takeoffs.find(t => t.id === tkActiveTakeoffId);
        const novaPredColor = novaActiveTo?.color || "#8B5CF6";
        const novaAvgConf = novaPreds.length > 0 ? Math.round((novaPreds.reduce((s, p) => s + (p.confidence || 0), 0) / novaPreds.length) * 100) : 0;

        const novaAcceptOne = (pred) => {
          acceptPrediction(pred.id);
          recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, true);
          if (tkActiveTakeoffId) {
            if (pred.type === "count" || pred.type === "wall-tag") {
              addMeasurement(tkActiveTakeoffId, { type: "count", points: [pred.point], value: 1, sheetId: selectedDrawingId, color: novaActiveTo?.color || "#5b8def", predicted: true, tag: tkPredictions.tag });
            } else if (pred.type === "wall" && pred.points?.length >= 2) {
              addMeasurement(tkActiveTakeoffId, { type: "linear", points: pred.points, value: 0, sheetId: selectedDrawingId, color: novaActiveTo?.color || "#5b8def", predicted: true, tag: tkPredictions.tag });
            } else if (pred.type === "area" && pred.points?.length >= 3) {
              addMeasurement(tkActiveTakeoffId, { type: "area", points: pred.points, value: 0, sheetId: selectedDrawingId, color: novaActiveTo?.color || "#5b8def", predicted: true, tag: pred.tag || tkPredictions.tag });
            }
          }
        };
        const novaAcceptAll = () => {
          const toAdd = novaPreds.filter(p => !tkPredRejected.includes(p.id) && !tkPredAccepted.includes(p.id));
          if (tkActiveTakeoffId && toAdd.length > 0) {
            toAdd.forEach(() => recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, true));
            toAdd.forEach(pred => {
              if (pred.type === "count" || pred.type === "wall-tag") addMeasurement(tkActiveTakeoffId, { type: "count", points: [pred.point], value: 1, sheetId: selectedDrawingId, color: novaActiveTo?.color || "#5b8def", predicted: true, tag: tkPredictions.tag });
              else if (pred.type === "wall" && pred.points?.length >= 2) addMeasurement(tkActiveTakeoffId, { type: "linear", points: pred.points, value: 0, sheetId: selectedDrawingId, color: novaActiveTo?.color || "#5b8def", predicted: true, tag: tkPredictions.tag });
              else if (pred.type === "area" && pred.points?.length >= 3) addMeasurement(tkActiveTakeoffId, { type: "area", points: pred.points, value: 0, sheetId: selectedDrawingId, color: novaActiveTo?.color || "#5b8def", predicted: true, tag: pred.tag || tkPredictions.tag });
            });
            showToast(`Added ${toAdd.length} predicted measurements`);
          }
          clearPredictions();
        };
        const novaRejectAll = () => { novaPending.forEach(p => { rejectPrediction(p.id); recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, false); }); };

        // NOVA Chat handler
        const handleNovaChat = async (text) => {
          const msg = (text || novaChatInput).trim();
          if (!msg || novaChatLoading) return;
          const userMsg = { role: "user", text: msg };
          const updated = [...novaChatMessages, userMsg];
          setNovaChatMessages(updated);
          setNovaChatInput("");
          setNovaChatLoading(true);
          try {
            const ctx = buildProjectContext({ project, items: useItemsStore.getState().items, takeoffs, specs: useSpecsStore.getState().specs, drawings });
            const apiMsgs = updated.map((m, i) => {
              if (m.actions) return { role: "assistant", content: m.text || "Done." };
              if (i === 0 && m.role === "user") return { role: "user", content: `[Project Context]\n${ctx}\n\n[Question]\n${m.text}` };
              return { role: m.role, content: m.text };
            });
            const CHAT_SYS = `You are NOVA, an expert construction estimating AI. Be concise and direct. Reference CSI codes when relevant. You have tools to modify the estimate.`;
            const resp = await callAnthropic({ system: CHAT_SYS, max_tokens: 2000, messages: apiMsgs, tools: NOVA_TOOLS });
            if (typeof resp === "string") {
              setNovaChatMessages([...updated, { role: "assistant", text: resp }]);
            } else if (resp?.content) {
              const textParts = []; const toolCalls = [];
              for (const b of resp.content) { if (b.type === "text") textParts.push(b.text); else if (b.type === "tool_use") toolCalls.push(b); }
              const toolResults = toolCalls.map(tc => { try { return { tool_use_id: tc.id, ...executeNovaTool(tc.name, tc.input) }; } catch (err) { return { tool_use_id: tc.id, success: false, message: err.message }; } });
              const actionMsg = { role: "assistant", text: textParts.join("\n") || "", actions: toolResults };
              setNovaChatMessages([...updated, actionMsg]);
            }
          } catch (err) {
            setNovaChatMessages([...updated, { role: "assistant", text: `⚠️ ${err.message}` }]);
          } finally { setNovaChatLoading(false); }
        };

        return (
          <div style={{
            width: 340, flexShrink: 0, display: "flex", flexDirection: "column",
            background: C.bg1, borderLeft: `1px solid ${C.border}`,
            backdropFilter: T.glass.blur, WebkitBackdropFilter: T.glass.blur,
            animation: "slideIn 0.2s ease-out", boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
          }}>
            {/* ── NOVA Header — Orb + Title ── */}
            <div style={{
              padding: "14px 16px 10px", borderBottom: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: `linear-gradient(135deg, ${C.accent}06, ${C.purple || C.accent}04)`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible" }}>
                  <div style={{ transform: "scale(0.22)", transformOrigin: "center" }}><NovaOrb /></div>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.5, color: C.text, fontFamily: T.font.display }}>NOVA</div>
                  <div style={{ fontSize: 9, color: C.textDim, fontWeight: 500 }}>Powered by AI</div>
                </div>
              </div>
              <button onClick={() => setTkNovaPanelOpen(false)}
                style={{ width: 24, height: 24, border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg2, color: C.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={C.textDim} strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg>
              </button>
            </div>

            {/* ═══ Unified Scrollable Content ═══ */}
            <div ref={novaChatScrollRef} style={{ flex: 1, overflowY: "auto" }}>

              {/* ── Predictions Section (when active) ── */}
              {novaPreds.length > 0 && (<>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, background: C.bg }}>
                  <span style={{ padding: "3px 10px", borderRadius: 5, fontSize: 11, fontWeight: 700, background: `${novaPredColor}15`, color: novaPredColor, border: `1px solid ${novaPredColor}25`, fontFamily: T.font.mono }}>{tkPredictions?.tag || "—"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{novaPending.length > 0 ? `${novaPending.length} found` : `${novaAccepted.length} accepted`}</div>
                    <div style={{ fontSize: 9, color: C.textDim }}>avg {novaAvgConf}% confidence</div>
                  </div>
                </div>
                {novaPending.length > 0 && (
                  <div style={{ padding: "8px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
                    <button onClick={novaAcceptAll} style={bt(C, { flex: 1, background: C.green, color: "#fff", padding: "7px 0", fontSize: 11, fontWeight: 700, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 })}>
                      <Ic d={I.check} size={11} color="#fff" sw={2.5} /> Accept All ({novaPending.length})
                    </button>
                    <button onClick={novaRejectAll} style={bt(C, { flex: 1, background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "7px 0", fontSize: 11, fontWeight: 600, borderRadius: 6 })}>Reject All</button>
                  </div>
                )}
                <div style={{ padding: "4px 0" }}>
                  {novaPreds.map(pred => {
                    const isAccepted = tkPredAccepted.includes(pred.id);
                    const isRejected = tkPredRejected.includes(pred.id);
                    const isPending = !isAccepted && !isRejected;
                    const predConf = Math.round((pred.confidence || 0) * 100);
                    const confColor = predConf >= 80 ? C.green : predConf >= 50 ? C.blue : C.orange;
                    return (
                      <div key={pred.id} style={{ margin: "2px 8px", padding: "8px 12px", borderRadius: 8, background: isAccepted ? `${C.green}08` : isRejected ? `${C.red}05` : C.bg, border: `1px solid ${isAccepted ? C.green + "20" : isRejected ? C.red + "15" : C.border}`, opacity: isRejected ? 0.5 : 1, transition: T.transition.fast }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: isAccepted ? C.green : isRejected ? C.red : novaPredColor }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pred.tag || pred.type || "Prediction"}</span>
                          {isAccepted && <span style={{ fontSize: 8, fontWeight: 700, color: C.green }}>Added</span>}
                          {isRejected && <span style={{ fontSize: 8, fontWeight: 700, color: C.red }}>Dismissed</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isPending ? 8 : 0 }}>
                          <div style={{ flex: 1, height: 3, borderRadius: 2, background: C.bg3 }}><div style={{ width: `${predConf}%`, height: "100%", borderRadius: 2, background: confColor, transition: "width 0.3s ease" }} /></div>
                          <span style={{ fontSize: 9, fontWeight: 700, color: confColor, fontFamily: T.font.mono, minWidth: 28, textAlign: "right" }}>{predConf}%</span>
                        </div>
                        {isPending && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => novaAcceptOne(pred)} style={bt(C, { flex: 1, padding: "4px 0", fontSize: 10, fontWeight: 600, borderRadius: 5, background: `${C.green}15`, color: C.green, border: `1px solid ${C.green}25`, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 })}><Ic d={I.check} size={9} color={C.green} sw={2.5} /> Accept</button>
                            <button onClick={() => { rejectPrediction(pred.id); recordPredictionFeedback(tkPredictions?.tag, tkPredictions?.strategy, false); }} style={bt(C, { flex: 1, padding: "4px 0", fontSize: 10, fontWeight: 600, borderRadius: 5, background: "transparent", color: C.textDim, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 })}>
                              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke={C.textDim} strokeWidth="2" strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {drawings.filter(d => d.data && d.type === "pdf").length > 1 && (
                  <div style={{ padding: "8px 16px", borderTop: `1px solid ${C.border}` }}>
                    {crossSheetScan?.scanning ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 0", fontSize: 10, color: C.blue }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid #3B82F640", borderTop: "2px solid #3B82F6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Scanning other sheets...
                      </div>
                    ) : (
                      <button onClick={async () => {
                        setCrossSheetScan({ tag: tkPredictions.tag, results: [], scanning: true });
                        try {
                          const pdfDrawings = drawings.filter(d => d.data && d.type === "pdf" && d.id !== selectedDrawingId);
                          const results = await scanAllSheets(pdfDrawings, tkPredictions.tag, tkTool === "count" ? "count" : "linear");
                          setCrossSheetScan({ tag: tkPredictions.tag, results, scanning: false });
                          const total = results.reduce((s, r) => s + r.instanceCount, 0);
                          if (total > 0) showToast(`Found "${tkPredictions.tag}" on ${results.length} other sheet(s)`); else showToast(`Not found on other sheets`);
                        } catch (err) { setCrossSheetScan(null); }
                      }} style={bt(C, { width: "100%", padding: "8px 0", fontSize: 10, fontWeight: 600, borderRadius: 6, background: `${C.blue}10`, color: C.blue, border: `1px solid ${C.blue}20`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 })}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2.5" strokeLinecap="round"><path d="M4 4h6v6H4z" /><path d="M14 4h6v6h-6z" /><path d="M4 14h6v6H4z" /><path d="M14 14h6v6h-6z" /></svg> Scan All Pages
                      </button>
                    )}
                  </div>
                )}
                {tkPredRefining && <div style={{ padding: "8px 16px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: `${C.orange}06`, fontSize: 10, color: C.orange, fontWeight: 600 }}><span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 12 }}>⟳</span> Refining...</div>}
              </>)}

              {/* ── NOVA Features ── */}
              <div style={{ padding: 12 }}>
                {[
                  { label: "NOVA Vision", desc: novaPreds.length > 0 ? `${novaPending.length} predictions pending` : !tkActiveTakeoffId ? "Select a takeoff to start" : tkMeasureState === "idle" ? "Start measuring — NOVA predicts matches" : "Measure near a tag to generate predictions", icon: I.ai, action: null, color: C.accent, status: novaPreds.length > 0 ? "active" : "info" },
                  { label: "Auto-Detect", desc: "Scan drawing for all measurable elements", icon: I.ai, loading: aiDrawingAnalysis?.loading, hasResults: aiDrawingAnalysis?.results?.length > 0, resultLabel: aiDrawingAnalysis?.results ? `${aiDrawingAnalysis.results.length} found` : null, action: () => runDrawingAnalysis(), color: C.accent },
                  { label: "Scan Schedules", desc: "Find schedules in PDFs", icon: I.insights, loading: pdfSchedules.loading, hasResults: pdfSchedules.results?.length > 0, resultLabel: pdfSchedules.results ? `${pdfSchedules.results.length} schedules` : null, action: () => runPdfScheduleScan(), color: "#10B981" },
                ].map(item => (
                  <button key={item.label} onClick={item.action} disabled={item.loading || !item.action}
                    style={{ width: "100%", padding: "10px 12px", background: item.status === "active" ? `${item.color}06` : C.bg, border: `1px solid ${item.status === "active" ? item.color + "25" : C.border}`, borderRadius: 8, display: "flex", alignItems: "center", gap: 10, cursor: item.action ? (item.loading ? "wait" : "pointer") : "default", textAlign: "left", transition: "all 0.15s", marginBottom: 6, opacity: item.action ? 1 : 0.8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: `${item.color}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {item.loading ? <span style={{ display: "inline-block", width: 12, height: 12, border: `2px solid ${item.color}30`, borderTop: `2px solid ${item.color}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> : <Ic d={item.icon} size={14} color={item.color} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.label}</div>
                      <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{item.desc}</div>
                    </div>
                    {item.hasResults && item.resultLabel && <span style={{ fontSize: 8, fontWeight: 700, color: item.color, background: `${item.color}15`, padding: "2px 6px", borderRadius: 10, flexShrink: 0 }}>{item.resultLabel}</span>}
                  </button>
                ))}
              </div>

              {/* ── Chat Section ── */}
              <div style={{ padding: "0 12px 12px", borderTop: `1px solid ${C.border}` }}>
                {novaChatMessages.length === 0 && !novaChatLoading && (
                  <div style={{ padding: "12px 0 4px" }}>
                    <div style={{ textAlign: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2 }}>Chat with NOVA</div>
                      <div style={{ fontSize: 9, color: C.textDim }}>Ask about scope, pricing, or specs</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {QUICK_ACTIONS.slice(0, 3).map((qa, i) => (
                        <button key={i} onClick={() => handleNovaChat(qa.label)}
                          style={{ background: `${C.accent}06`, border: `1px solid ${C.accent}15`, borderRadius: 6, padding: "7px 10px", cursor: "pointer", textAlign: "left", fontSize: 10, color: C.text, fontWeight: 500, display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}>
                          <span style={{ fontSize: 11 }}>{qa.icon}</span> {qa.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {novaChatMessages.map((msg, i) => (
                  <div key={i} style={{ paddingTop: i === 0 ? 8 : 0 }}>
                    <MessageBubble msg={msg} C={C} />
                    {msg.actions && <ActionCards actions={msg.actions} C={C} />}
                  </div>
                ))}
                {novaChatLoading && (
                  <div style={{ display: "flex", gap: 4, padding: "8px 0", alignItems: "center" }}>
                    {[0, 1, 2].map(n => (<div key={n} style={{ width: 5, height: 5, borderRadius: 3, background: C.accent, opacity: 0.4, animation: `novaPulse 1.2s ${n * 0.2}s infinite` }} />))}
                    <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 4 }}>Thinking...</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Chat Input (pinned at bottom) ── */}
            <div style={{ padding: "8px 12px 12px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, padding: "6px 10px" }}>
                <textarea ref={novaChatInputRef} value={novaChatInput} onChange={e => setNovaChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleNovaChat(); } }}
                  placeholder="Ask NOVA..." rows={1}
                  style={{ flex: 1, border: "none", outline: "none", resize: "none", background: "transparent", color: C.text, fontSize: 12, fontFamily: "inherit", lineHeight: 1.4, maxHeight: 80, padding: 0 }}
                  onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px"; }} />
                <button onClick={() => handleNovaChat()} disabled={!novaChatInput.trim() || novaChatLoading}
                  style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: novaChatInput.trim() && !novaChatLoading ? C.accent : `${C.text}10`, color: novaChatInput.trim() && !novaChatLoading ? "#fff" : C.textDim, cursor: novaChatInput.trim() && !novaChatLoading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ic d={I.send} size={12} color={novaChatInput.trim() && !novaChatLoading ? "#fff" : C.textDim} />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
