import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { useTakeoffsStore } from '@/stores/takeoffsStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore } from '@/stores/uiStore';
import { useDatabaseStore } from '@/stores/databaseStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';
import { uid, nn, fmt2, nowStr } from '@/utils/format';
import { UNITS } from '@/constants/units';
import { PDF_RENDER_DPI, DEFAULT_IMAGE_DPI } from '@/constants/scales';
import { callAnthropic, callAnthropicStream, optimizeImageForAI, imageBlock, cropImageRegion } from '@/utils/ai';
import { useBuilderStore } from '@/stores/builderStore';
import { BUILDER_LIST, BUILDERS } from '@/constants/builders';
import BuilderPanel from '@/components/takeoffs/BuilderPanel';
import TakeoffDimensionEngine from '@/components/takeoffs/TakeoffDimensionEngine';

const TO_COLORS = ["#e05555", "#4caf7d", "#5b8def", "#e0873a", "#a87ee6", "#5ec4c4", "#e0c55a", "#cf6bbd"];

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
  const showNotesPanel = useUiStore(s => s.showNotesPanel);
  const setShowNotesPanel = useUiStore(s => s.setShowNotesPanel);
  const apiKey = useUiStore(s => s.appSettings.apiKey);
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const elements = useDatabaseStore(s => s.elements);
  const assemblies = useDatabaseStore(s => s.assemblies);

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

  const activeBuilder = useBuilderStore(s => s.activeBuilder);
  const setActiveBuilder = useBuilderStore(s => s.setActiveBuilder);
  const builderInstances = useBuilderStore(s => s.builderInstances);

  // Refs
  const drawingContainerRef = useRef(null);
  const drawingImgRef = useRef(null);
  const canvasRef = useRef(null);
  const tkPanning = useRef(false);
  const tkPanStart = useRef({ x: 0, y: 0, panX: 0, panY: 0, moved: false });
  const tkDragTakeoff = useRef(null);
  const tkDragOverTakeoff = useRef(null);
  const tkLastWheelX = useRef(0);  // tracks recent deltaX to detect trackpad vs mouse
  const thumbnailStripRef = useRef(null);
  const shiftHeldRef = useRef(false);

  // Track Shift key for snap-angle rendering feedback
  useEffect(() => {
    const onKey = (e) => { shiftHeldRef.current = e.shiftKey; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, []);

  // Page filter: "all" shows every takeoff, "page" shows only those with measurements on current drawing
  const [pageFilter, setPageFilter] = useState("all");

  // Persist selected drawing to sessionStorage so refresh returns to same page
  useEffect(() => {
    if (selectedDrawingId) sessionStorage.setItem("bldg-selectedDrawingId", selectedDrawingId);
  }, [selectedDrawingId]);


  // AI Drawing Analysis
  const [aiDrawingAnalysis, setAiDrawingAnalysis] = useState(null); // { loading, results: [] }

  // AI Wall Schedule Detection
  const [wallSchedule, setWallSchedule] = useState({ loading: false, results: null, error: null });

  // Derived
  const selectedDrawing = useMemo(() => drawings.find(d => d.id === selectedDrawingId), [drawings, selectedDrawingId]);
  const filteredTakeoffs = useMemo(() => {
    if (pageFilter === "all") return takeoffs;
    if (!selectedDrawingId) return takeoffs;
    // Build set of takeoff IDs that have measurements on the current drawing
    const idsOnPage = new Set();
    takeoffs.forEach(t => {
      if ((t.measurements || []).some(m => m.sheetId === selectedDrawingId)) idsOnPage.add(t.id);
    });
    // For builder-derived takeoffs (no measurements), check if their driving item's takeoff is on this page
    const addCatItemsOnPage = (cat, itemTakeoffIds) => {
      const drivingToId = cat.drivingItemId ? itemTakeoffIds?.[cat.drivingItemId] : null;
      if (drivingToId && idsOnPage.has(drivingToId)) {
        cat.items.forEach(item => {
          const toId = itemTakeoffIds?.[item.id];
          if (toId) idsOnPage.add(toId);
        });
      }
    };
    Object.entries(builderInstances).forEach(([builderId, inst]) => {
      const builderDef = BUILDERS[builderId];
      if (!builderDef) return;
      builderDef.categories.forEach(cat => {
        if (cat.multiInstance) {
          (inst.categoryInstances?.[cat.id] || []).forEach(catInst => addCatItemsOnPage(cat, catInst.itemTakeoffIds));
        } else {
          addCatItemsOnPage(cat, inst.itemTakeoffIds);
        }
      });
    });
    return takeoffs.filter(t => idsOnPage.has(t.id));
  }, [takeoffs, pageFilter, selectedDrawingId, builderInstances]);
  const takeoffGroups = useMemo(() => {
    const g = {};
    filteredTakeoffs.forEach(t => { const k = t.group || "Ungrouped"; if (!g[k]) g[k] = []; g[k].push(t); });
    return g;
  }, [filteredTakeoffs]);

  // Build a map of takeoffId → { inches, tool } for scale-aware rendering
  // Looks up renderWidth metadata on builder driving items and the linked spec value
  const builderRenderWidths = useMemo(() => {
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
    Object.entries(builderInstances).forEach(([builderId, inst]) => {
      const builderDef = BUILDERS[builderId];
      if (!builderDef) return;
      builderDef.categories.forEach(cat => {
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
  }, [builderInstances, takeoffs]);

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

    // Clean up builder links if this was a builder-linked takeoff
    if (toRemove?.builderId) {
      const bs = useBuilderStore.getState();
      const inst = bs.builderInstances?.[toRemove.builderId];
      if (!inst) return;
      const builderDef = BUILDERS[toRemove.builderId];
      if (!builderDef) return;

      // Check multi-instance categories first
      let found = false;
      builderDef.categories.forEach(cat => {
        if (!cat.multiInstance || found) return;
        const catInstances = inst.categoryInstances?.[cat.id] || [];
        catInstances.forEach(catInst => {
          Object.entries(catInst.itemTakeoffIds || {}).forEach(([itemId, toId]) => {
            if (toId === id) {
              bs.linkCatInstanceItem(toRemove.builderId, cat.id, catInst.id, itemId, null);
              bs.setCatInstanceItemStatus(toRemove.builderId, cat.id, catInst.id, itemId, "pending");
              found = true;
            }
          });
        });
      });

      // Check single-instance items
      if (!found) {
        Object.entries(inst.itemTakeoffIds || {}).forEach(([itemId, toId]) => {
          if (toId === id) {
            bs.linkItemToTakeoff(toRemove.builderId, itemId, null);
            bs.setItemStatus(toRemove.builderId, itemId, "pending");
          }
        });
      }
    }
  }, []);

  const addTakeoff = useCallback((group = "", desc = "", unit = "SF", code = "", opts = {}) => {
    const id = uid();
    const current = useTakeoffsStore.getState().takeoffs;
    const { noMeasure, quantity, ...extraFields } = opts;
    useTakeoffsStore.getState().setTakeoffs([...current, { id, description: desc || "New Takeoff", quantity: quantity || "", unit, color: TO_COLORS[current.length % TO_COLORS.length], drawingRef: "", group, linkedItemId: "", code, variables: [], formula: "", measurements: [], ...extraFields }]);
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
    if (drawingId && desc && !opts.noMeasure) {
      setTkActiveTakeoffId(id); setTkTool(unitToTool(unit)); setTkMeasureState("measuring"); setTkActivePoints([]); setTkContextMenu(null);
    }
    return id;
  }, []);

  const addTakeoffFromDb = useCallback((el) => {
    const id = uid();
    const current = useTakeoffsStore.getState().takeoffs;
    useTakeoffsStore.getState().setTakeoffs([...current, { id, description: el.name, quantity: "", unit: el.unit || "SF", color: TO_COLORS[current.length % TO_COLORS.length], drawingRef: "", group: "", linkedItemId: "", code: el.code, variables: [], formula: "", measurements: [] }]);
    setTkNewInput(""); setTkDbResults([]);
    showToast(`Added: ${el.name} — measuring`);
    const drawingId = useDrawingsStore.getState().selectedDrawingId;
    if (drawingId) { setTkActiveTakeoffId(id); setTkTool(unitToTool(el.unit || "SF")); setTkMeasureState("measuring"); setTkActivePoints([]); setTkContextMenu(null); }
  }, []);

  const addTakeoffFreeform = (desc) => {
    if (!desc?.trim()) return;
    const id = uid();
    const unit = tkNewUnit || "SF";
    setTakeoffs([...takeoffs, { id, description: desc.trim(), quantity: "", unit, color: TO_COLORS[takeoffs.length % TO_COLORS.length], drawingRef: "", group: "", linkedItemId: "", code: "", variables: [], formula: "", measurements: [] }]);
    setTkNewInput(""); setTkDbResults([]);
    showToast(`Added: ${desc.trim()} — measuring`);
    if (selectedDrawingId) { setTimeout(() => { setTkActiveTakeoffId(id); setTkTool(unitToTool(unit)); setTkMeasureState("measuring"); setTkActivePoints([]); setTkContextMenu(null); }, 50); }
  };

  const insertAssemblyIntoTakeoffs = (asm) => {
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
    }));
    setTakeoffs([...takeoffs, ...newTakeoffs]);
    setTkNewInput("");
    setTkDbResults([]);
    showToast(`Inserted ${asm.elements.length} takeoff items from "${asm.name}"`);
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
  }, []);

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
  }, [addMeasurement]);

  const pauseMeasuring = () => {
    setTkMeasureState("paused"); setTkActivePoints([]); setTkCursorPt(null);
  };

  const startAutoCount = (takeoffId) => {
    stopMeasuring();
    setTkAutoCount({ takeoffId, phase: "select", samplePt: null, results: [] });
    showToast("Click on a sample symbol to auto-count", "info");
  };

  // ─── AI Drawing Analysis ──────────────────────────────────────
  const runDrawingAnalysis = async () => {
    if (!selectedDrawingId || !apiKey) return;
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing) return;
    const imgSrc = drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId];
    if (!imgSrc) { showToast("Drawing image not available — re-upload in Plan Room", "error"); return; }

    setAiDrawingAnalysis({ loading: true, results: [] });
    try {
      const { base64, width: aiW, height: aiH } = await optimizeImageForAI(imgSrc, 1400);
      const sheetInfo = `${drawing.sheetNumber || "Unknown"} — ${drawing.sheetTitle || drawing.label || "Untitled"}`;

      const result = await callAnthropic({
        apiKey, max_tokens: 4000,
        system: "You are a construction drawing analysis AI. You analyze architectural, structural, and MEP drawings to identify measurable elements for quantity takeoff. You also identify the LOCATION of each element on the drawing.",
        messages: [{ role: "user", content: [
          { type: "text", text: `Analyze this construction drawing sheet: "${sheetInfo}"
The image is ${aiW}x${aiH} pixels.

Identify ALL measurable elements visible on this drawing. For each element, provide:
- name: descriptive name (e.g., "Interior Door 3'-0\\"", "Concrete Slab on Grade", "GWB Partition Wall")
- type: "count" | "linear" | "area"
- quantity: For COUNT items ONLY, provide the exact number of instances you can see. For LINEAR and AREA items, set quantity to 0 — you CANNOT accurately measure LF or SF from an image, so leave those for the user to measure with calibrated tools.
- unit: appropriate unit (EA for count, LF for linear, SF for area)
- code: CSI code if identifiable (e.g., "08.110")
- confidence: "high" | "medium" | "low"
- notes: any relevant detail (dimensions, specs, callouts you can read from the drawing)
- locations: array of {x, y} pixel coordinates (relative to the ${aiW}x${aiH} image) marking where each instance of this element appears on the drawing. For "count" items, provide one {x,y} per instance you counted. For "linear" items, provide start and end {x,y} points for one representative segment. For "area" items, provide 3-4 corner {x,y} points outlining one representative region.

CRITICAL RULES:
- The locations array is essential — it lets us place visual markers on the drawing. Estimate pixel coordinates as accurately as possible.
- NEVER guess at LF or SF quantities — you cannot measure real-world dimensions from a drawing image. Only provide counts for countable discrete items (doors, windows, fixtures, etc.).
- If you see dimension callouts on the drawing (e.g., "24'-0\\""), include them in the notes field, NOT as a quantity.

Be thorough — identify doors, windows, walls, rooms/areas, fixtures, equipment, structural elements, and any callout or schedule data visible.

Return ONLY a JSON array of objects.` },
          imageBlock(base64),
        ] }],
      });

      let parsed;
      try { parsed = JSON.parse(result.replace(/```json|```/g, "").trim()); } catch { parsed = null; }
      if (parsed && Array.isArray(parsed)) {
        // Store the AI image dimensions so we can scale locations to canvas coordinates
        setAiDrawingAnalysis({ loading: false, results: parsed, aiW, aiH });
        showToast(`AI found ${parsed.length} elements on this sheet`);
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
  const mapWallTypeToBuilderSpecs = (wallType) => {
    const catId = wallType.category === "exterior" ? "ext-walls" : "int-walls";
    const catDef = BUILDERS.walls?.categories?.find(c => c.id === catId);
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

  const runWallScheduleDetection = async () => {
    if (!selectedDrawingId || !apiKey) return;
    const drawing = drawings.find(d => d.id === selectedDrawingId);
    if (!drawing) return;
    const imgSrc = drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId];
    if (!imgSrc) { showToast("Drawing image not available", "error"); return; }

    setWallSchedule({ loading: true, results: null, error: null });
    try {
      // ── PASS 1: Locate the schedule on the full page ──
      const { base64: fullBase64 } = await optimizeImageForAI(imgSrc, 1400);

      const locateResult = await callAnthropic({
        apiKey, max_tokens: 500,
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
        apiKey, max_tokens: 4096,
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
        const mapped = parsed.map(wt => mapWallTypeToBuilderSpecs(wt)).filter(Boolean);
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
    const store = useBuilderStore.getState();
    if (store.activeBuilder !== "walls") {
      useBuilderStore.getState().setActiveBuilder("walls");
    }

    let created = 0;
    selectedItems.forEach(mapped => {
      // Check for existing instance with same label
      const existing = (store.builderInstances?.walls?.categoryInstances?.[mapped.catId] || []);
      if (existing.some(inst => inst.label === mapped.label)) return; // skip duplicate

      // Add new instance
      useBuilderStore.getState().addCategoryInstance("walls", mapped.catId);

      // Get the newly created instance (last in array)
      const updatedState = useBuilderStore.getState();
      const catInstances = updatedState.builderInstances?.walls?.categoryInstances?.[mapped.catId] || [];
      const newInstance = catInstances[catInstances.length - 1];
      if (!newInstance) return;

      // Set label
      useBuilderStore.getState().renameCategoryInstance("walls", mapped.catId, newInstance.id, mapped.label);

      // Set each spec
      for (const [specId, value] of Object.entries(mapped.specs)) {
        useBuilderStore.getState().setCatInstanceSpec("walls", mapped.catId, newInstance.id, specId, value);
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

  // ─── CANVAS CLICK HANDLER ──────────
  const handleCanvasClick = useCallback((e) => {
    if (!canvasRef.current || !selectedDrawingId) return;
    setTkContextMenu(null);
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    const pt = { x: cx, y: cy };

    // Auto-count sample selection — capture sample, then run AI vision
    if (tkAutoCount?.phase === "select") {
      setTkAutoCount({ ...tkAutoCount, phase: "scanning", samplePt: pt });
      // Get the drawing image for AI analysis
      const drawing = drawings.find(d => d.id === selectedDrawingId);
      if (!drawing) { setTkAutoCount(null); return; }
      const imgSrc = drawing.type === "image" ? drawing.data : pdfCanvases[selectedDrawingId];
      if (!imgSrc || !apiKey) {
        showToast(apiKey ? "Drawing image not available" : "Add API key in Settings", "error");
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
            apiKey, max_tokens: 1500,
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
    if (tkTool === "calibrate") {
      if (tkActivePoints.length === 0) { setTkActivePoints([pt]); } else { setTkActivePoints([tkActivePoints[0], pt]); }
      return;
    }

    // Paused — re-engage
    if (tkMeasureState === "paused" && tkActiveTakeoffId) {
      setTkMeasureState("measuring");
      if (tkTool === "count") {
        const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
        if (to) { addMeasurement(tkActiveTakeoffId, { type: "count", points: [pt], value: 1, sheetId: selectedDrawingId, color: to.color }); }
        return;
      }
      setTkActivePoints([pt]);
      return;
    }

    if (tkMeasureState !== "measuring" || !tkActiveTakeoffId) {
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
    const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
    if (!to) return;

    // Apply snap angle when Shift is held (not for count tool or first point)
    const snappedPt = (e.shiftKey && tkActivePoints.length >= 1)
      ? snapAngle(tkActivePoints[tkActivePoints.length - 1], pt)
      : pt;

    // COUNT
    if (tkTool === "count") {
      addMeasurement(tkActiveTakeoffId, { type: "count", points: [pt], value: 1, sheetId: selectedDrawingId, color: to.color });
      if (e.detail === 2) { pauseMeasuring(); }
      return;
    }

    // LINEAR
    if (tkTool === "linear") {
      if (e.detail === 2 && tkActivePoints.length >= 2) {
        addMeasurement(tkActiveTakeoffId, { type: "linear", points: [...tkActivePoints], value: 0, sheetId: selectedDrawingId, color: to.color });
        if (hasScale(selectedDrawingId)) {
          const len = calcPolylineLength(tkActivePoints, selectedDrawingId);
          showToast(`Linear: ${Math.round(len * 100) / 100} ${getDisplayUnit(selectedDrawingId)}`);
        } else { showToast("Linear measurement saved — set scale to see value"); }
        pauseMeasuring();
        return;
      }
      setTkActivePoints([...tkActivePoints, snappedPt]);
      return;
    }

    // AREA
    if (tkTool === "area") {
      if (tkActivePoints.length >= 3) {
        const first = tkActivePoints[0];
        const dist = Math.sqrt((cx - first.x) ** 2 + (cy - first.y) ** 2);
        if (dist < 15) {
          addMeasurement(tkActiveTakeoffId, { type: "area", points: [...tkActivePoints], value: 0, sheetId: selectedDrawingId, color: to.color });
          if (hasScale(selectedDrawingId)) {
            const area = calcPolygonArea(tkActivePoints, selectedDrawingId);
            showToast(`Area: ${Math.round(area * 100) / 100} ${getDisplayUnit(selectedDrawingId)}²`);
          } else { showToast("Area measurement saved — set scale to see value"); }
          pauseMeasuring();
          return;
        }
      }
      if (e.detail === 2 && tkActivePoints.length >= 3) {
        addMeasurement(tkActiveTakeoffId, { type: "area", points: [...tkActivePoints], value: 0, sheetId: selectedDrawingId, color: to.color });
        if (hasScale(selectedDrawingId)) {
          const area = calcPolygonArea(tkActivePoints, selectedDrawingId);
          showToast(`Area: ${Math.round(area * 100) / 100} ${getDisplayUnit(selectedDrawingId)}²`);
        } else { showToast("Area measurement saved — set scale to see value"); }
        pauseMeasuring();
        return;
      }
      setTkActivePoints([...tkActivePoints, snappedPt]);
    }
  }, [tkTool, tkActivePoints, tkActiveTakeoffId, selectedDrawingId, takeoffs, tkCalibrations, tkMeasureState, tkAutoCount, drawingScales, drawingDpi, setTkSelectedTakeoffId]);

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

  // Auto-scroll thumbnail strip to active drawing
  useEffect(() => {
    if (thumbnailStripRef.current && selectedDrawingId) {
      const el = thumbnailStripRef.current.querySelector(`[data-drawing-id="${selectedDrawingId}"]`);
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

  // Escape key — first Esc stops measuring (keeps selection), second deselects
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        setTkContextMenu(null);
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
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tkTool, tkMeasureState, tkSelectedTakeoffId]);

  // DB search effect — includes assemblies
  useEffect(() => {
    if (!tkNewInput.trim()) { setTkDbResults([]); return; }
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

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedDrawingId) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw existing measurements (selected takeoff at full opacity, others dimmed)
    // tkVisibility: "all" = show all, "active" = selected only, "none" = hide all
    const toFillHex = (pct) => Math.round(Math.min(100, Math.max(5, pct)) * 2.55).toString(16).padStart(2, '0');
    if (tkVisibility !== "none") takeoffs.forEach(to => {
      if (tkVisibility === "active" && to.id !== tkSelectedTakeoffId && to.id !== tkActiveTakeoffId) return;
      const isSelectedTo = to.id === tkSelectedTakeoffId || to.id === tkActiveTakeoffId;
      const fillHex = toFillHex(to.fillOpacity ?? 25);
      (to.measurements || []).forEach(m => {
        if (m.sheetId !== selectedDrawingId) return;
        ctx.save();
        ctx.globalAlpha = isSelectedTo ? 1.0 : 0.35;
        const color = m.color || to.color || "#5b8def";
        if (m.type === "count") {
          const p = m.points[0];
          const brw = builderRenderWidths[to.id];
          const scaledW = brw ? realToPx(selectedDrawingId, brw.inches) : null;
          const scaledH = brw ? realToPx(selectedDrawingId, brw.inchesH || brw.inches) : null;
          if (scaledW && scaledW >= 6) {
            // Scaled rectangle for builder items (e.g., spread footings)
            const hw = scaledW / 2, hh = (scaledH || scaledW) / 2;
            ctx.fillStyle = color + fillHex;
            ctx.fillRect(p.x - hw, p.y - hh, scaledW, scaledH || scaledW);
            ctx.strokeStyle = color; ctx.lineWidth = 2;
            ctx.strokeRect(p.x - hw, p.y - hh, scaledW, scaledH || scaledW);
          } else {
            // Default circle for non-builder count markers
            ctx.beginPath(); ctx.arc(p.x, p.y, 25, 0, Math.PI * 2);
            ctx.fillStyle = color; ctx.fill();
            ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = "#fff"; ctx.font = "bold 10px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("●", p.x, p.y);
          }
        }
        if (m.type === "linear" && m.points.length >= 2) {
          const brw = builderRenderWidths[to.id];
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
            ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
          }
          ctx.lineCap = "butt"; ctx.lineJoin = "miter"; // reset
          m.points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); });
          const mid = m.points[Math.floor(m.points.length / 2)];
          const dUnit = getDisplayUnit(selectedDrawingId);
          const derivedLen = computeMeasurementValue(m, selectedDrawingId);
          if (derivedLen !== null) {
            const lbl = String(derivedLen) + " " + dUnit;
            ctx.fillStyle = color; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "center";
            ctx.fillRect(mid.x - lbl.length * 3.5 - 4, mid.y - 18, lbl.length * 7 + 8, 16);
            ctx.fillStyle = "#fff"; ctx.fillText(lbl, mid.x, mid.y - 10);
          }
        }
        if (m.type === "area" && m.points.length >= 3) {
          ctx.beginPath(); ctx.moveTo(m.points[0].x, m.points[0].y);
          for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y);
          ctx.closePath();
          ctx.fillStyle = color + fillHex; ctx.fill();
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
          m.points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); });
        }
        ctx.restore();
      });
    });

    // Draw active points (in-progress measurement) with filled preview + running value
    if (tkActivePoints.length > 0 && tkActiveTakeoffId) {
      const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
      const color = to?.color || "#5b8def";
      const brwPreview = builderRenderWidths[tkActiveTakeoffId];
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
    if (aiDrawingAnalysis && !aiDrawingAnalysis.loading && aiDrawingAnalysis.results?.length > 0 && aiDrawingAnalysis.aiW && canvas.width) {
      const scaleX = canvas.width / aiDrawingAnalysis.aiW;
      const scaleY = canvas.height / (aiDrawingAnalysis.aiH || aiDrawingAnalysis.aiW);
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
  }, [takeoffs, tkActivePoints, tkCursorPt, selectedDrawingId, tkTool, tkCalibrations, drawingScales, drawingDpi, tkActiveTakeoffId, tkSelectedTakeoffId, builderRenderWidths, aiDrawingAnalysis, tkVisibility]);

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
        apiKey, max_tokens: 1000,
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
    <div style={{ animation: "fadeIn 0.15s ease-out", display: "flex", gap: 0, height: "calc(100vh - 120px)" }}>
      {/* LEFT PANEL — Takeoffs list */}
      {tkPanelOpen && (
        <div style={{ width: tkPanelWidth, minWidth: 280, maxWidth: 700, background: C.bg1, borderRadius: "6px 0 0 6px", border: `1px solid ${C.border}`, borderRight: "none", display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Takeoffs</span>
            <div style={{ display: "flex", gap: 2, background: C.bg2, borderRadius: 4, padding: 2 }}>
              <button onClick={() => setPageFilter("all")}
                style={{ padding: "2px 8px", fontSize: 9, fontWeight: 600, background: pageFilter === "all" ? C.accent : "transparent", color: pageFilter === "all" ? "#fff" : C.textDim, border: "none", borderRadius: 3, cursor: "pointer", transition: "all 0.15s" }}>
                All
              </button>
              <button onClick={() => setPageFilter("page")}
                style={{ padding: "2px 8px", fontSize: 9, fontWeight: 600, background: pageFilter === "page" ? C.accent : "transparent", color: pageFilter === "page" ? "#fff" : C.textDim, border: "none", borderRadius: 3, cursor: "pointer", transition: "all 0.15s" }}>
                This Page{pageFilter === "page" ? ` (${filteredTakeoffs.length})` : ""}
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button className="icon-btn"
                onClick={() => { const next = { all: "active", active: "none", none: "all" }; setTkVisibility(next[tkVisibility]); }}
                title={tkVisibility === "all" ? "Showing all takeoffs" : tkVisibility === "active" ? "Selected takeoff only" : "Takeoffs hidden"}
                style={{ width: 22, height: 22, border: `1px solid ${tkVisibility === "active" ? C.accent + "60" : C.border}`, background: tkVisibility === "active" ? C.accent + "12" : tkVisibility === "none" ? C.bg2 : "transparent", color: tkVisibility === "active" ? C.accent : tkVisibility === "none" ? C.textDimmer : C.textDim, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
                {tkVisibility === "none" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
                {tkVisibility === "active" && <span style={{ position: "absolute", top: -4, right: -4, width: 12, height: 12, borderRadius: "50%", background: C.accent, color: "#fff", fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>1</span>}
              </button>
              <button className="ghost-btn" onClick={() => setShowNotesPanel(!showNotesPanel)} style={bt(C, { background: showNotesPanel ? "rgba(91,141,239,0.08)" : "transparent", border: `1px solid ${showNotesPanel ? C.blue : C.border}`, color: showNotesPanel ? C.blue : C.textMuted, padding: "4px 8px", fontSize: 9 })}><Ic d={I.report} size={10} color={showNotesPanel ? C.blue : C.textMuted} /> Notes</button>
              <button className="icon-btn" onClick={() => setTkPanelOpen(false)} title="Collapse panel" style={{ width: 22, height: 22, border: "none", background: C.bg2, color: C.textDim, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 1L2 5l4 4" /></svg>
              </button>
            </div>
          </div>

          {/* Builder selector */}
          <div style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button
              onClick={() => setActiveBuilder(null)}
              style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, border: `1px solid ${!activeBuilder ? C.accent + "60" : C.border}`, background: !activeBuilder ? `${C.accent}12` : "transparent", color: !activeBuilder ? C.accent : C.textDim, borderRadius: 4, cursor: "pointer" }}
            >All Takeoffs</button>
            {BUILDER_LIST.map(b => (
              <button
                key={b.id}
                onClick={() => b.available && setActiveBuilder(b.id)}
                style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, border: `1px solid ${activeBuilder === b.id ? C.accent + "60" : C.border}`, background: activeBuilder === b.id ? `${C.accent}12` : "transparent", color: activeBuilder === b.id ? C.accent : b.available ? C.textMuted : C.textDimmer, borderRadius: 4, cursor: b.available ? "pointer" : "default", opacity: b.available ? 1 : 0.5 }}
                title={b.available ? b.name : `${b.name} (Coming Soon)`}
              >{b.name}</button>
            ))}
          </div>

          {/* Builder panel OR normal takeoff list */}
          {activeBuilder ? (
            <BuilderPanel engageMeasuring={engageMeasuring} selectedDrawingId={selectedDrawingId} addTakeoff={addTakeoff} updateTakeoff={updateTakeoff} removeTakeoff={removeTakeoff} pageFilter={pageFilter} onDetectWallSchedule={runWallScheduleDetection} wallScheduleLoading={wallSchedule.loading} />
          ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
            {Object.entries(takeoffGroups).map(([group, tos]) => (
              <div key={group} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.accent, marginBottom: 4, padding: "3px 8px", background: C.accentBg, borderRadius: 4, display: "inline-block" }}>{group}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", fontSize: 7, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.7, borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 12 }}></div>
                  <div style={{ flex: 2, minWidth: 80 }}>Description</div>
                  <div style={{ width: 55, textAlign: "right" }}>Qty</div>
                  <div style={{ width: 36 }}>Unit</div>
                  <div style={{ width: 50 }}>Sheet</div>
                  <div style={{ width: 56 }}></div>
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
                    <div key={to.id}>
                      <div className="row" draggable
                        onDragStart={() => { tkDragTakeoff.current = to.id; }}
                        onDragEnter={() => { tkDragOverTakeoff.current = to.id; }}
                        onDragEnd={tkDragReorder}
                        onDragOver={e => e.preventDefault()}
                        onClick={() => {
                          // Single click = select only (never auto-start measuring)
                          setTkSelectedTakeoffId(to.id);
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 6px", borderBottom: `1px solid ${C.bg2}`, cursor: "grab",
                          background: isMeasuring ? `${to.color}18` : isSelected ? `${to.color}0C` : "transparent",
                          borderLeft: isMeasuring ? `3px solid ${to.color}` : isSelected ? `3px solid ${to.color}80` : "3px solid transparent",
                          boxShadow: isMeasuring ? `inset 0 0 0 1px ${to.color}40` : "none" }}>
                        <div style={{ width: 12, height: 12, borderRadius: 2, background: to.color, flexShrink: 0, cursor: "pointer", position: "relative" }} onClick={e => { e.stopPropagation(); e.currentTarget.querySelector('input')?.click(); }}>
                          {isMeasuring && <div style={{ position: "absolute", inset: -2, borderRadius: 3, border: `2px solid ${to.color}`, animation: "pulse 1.5s infinite" }} />}
                          <input type="color" value={to.color} onChange={e => updateTakeoff(to.id, "color", e.target.value)} onClick={e => e.stopPropagation()} style={{ position: "absolute", opacity: 0, width: 0, height: 0, top: 0, left: 0 }} />
                        </div>
                        <div style={{ flex: 2, minWidth: 80 }} onClick={e => e.stopPropagation()}>
                          <input value={to.description} onChange={e => updateTakeoff(to.id, "description", e.target.value)} placeholder="Description..." style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "2px 4px", fontSize: 11 })} />
                          {to.code && <div style={{ fontSize: 8, color: C.purple, fontFamily: "'DM Mono',monospace", paddingLeft: 4 }}>{to.code}</div>}
                        </div>
                        <div style={{ width: 55 }} onClick={e => e.stopPropagation()}>
                          {hasMeasurements ? (
                            noScale ? <div style={{ fontSize: 8, color: C.orange, fontWeight: 600, padding: "2px 4px", cursor: "help" }} title="Set a scale to see quantities">⚠ Scale</div>
                              : <div style={{ fontSize: 11, fontWeight: 700, color: C.text, padding: "2px 4px", fontFamily: "'DM Mono',monospace" }}>{displayQty}</div>
                          ) : (
                            <input type="number" value={to.quantity} onChange={e => updateTakeoff(to.id, "quantity", e.target.value)} placeholder="0" style={nInp(C, { background: "transparent", border: "1px solid transparent", padding: "2px 4px", fontSize: 11, fontWeight: 600 })} />
                          )}
                          {hasFormula && computedQty !== null && <div style={{ fontSize: 7, color: C.accent, fontFamily: "'DM Mono',monospace", paddingLeft: 2 }}>={Math.round(computedQty * 100) / 100}</div>}
                        </div>
                        <div style={{ width: 36 }} onClick={e => e.stopPropagation()}>
                          <select value={to.unit} onChange={e => { updateTakeoff(to.id, "unit", e.target.value); if (tkActiveTakeoffId === to.id) { setTkTool(unitToTool(e.target.value)); setTkActivePoints([]); } }} style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "2px 1px", fontSize: 8 })}>
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
                        <div style={{ width: 72, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }} onClick={e => e.stopPropagation()}>
                          {/* Play / Pause / Stop controls */}
                          {isActive && tkMeasureState === "measuring" ? (<>
                            <button className="icon-btn" onClick={() => pauseMeasuring()} title="Pause" style={ctrlBtnS}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill={to.color}><rect x="1" y="1" width="3" height="8" rx="0.5"/><rect x="6" y="1" width="3" height="8" rx="0.5"/></svg>
                            </button>
                            <button className="icon-btn" onClick={() => stopMeasuring()} title="Stop" style={ctrlBtnS}>
                              <svg width="8" height="8" viewBox="0 0 8 8" fill={C.red}><rect width="8" height="8" rx="1"/></svg>
                            </button>
                          </>) : isPaused ? (<>
                            <button className="icon-btn" onClick={() => setTkMeasureState("measuring")} title="Resume" style={ctrlBtnS}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill={to.color}><polygon points="2,1 9,5 2,9"/></svg>
                            </button>
                            <button className="icon-btn" onClick={() => stopMeasuring()} title="Stop" style={ctrlBtnS}>
                              <svg width="8" height="8" viewBox="0 0 8 8" fill={C.red}><rect width="8" height="8" rx="1"/></svg>
                            </button>
                          </>) : (
                            <button className="icon-btn" onClick={() => engageMeasuring(to.id)} title="Start measuring" style={{ ...ctrlBtnS, opacity: selectedDrawing?.data ? 1 : 0.3 }} disabled={!selectedDrawing?.data}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill={selectedDrawing?.data ? to.color : C.textDim}><polygon points="2,1 9,5 2,9"/></svg>
                            </button>
                          )}
                          {totalMCount > 0 && <span style={{ fontSize: 7, fontWeight: 700, color: to.color, background: `${to.color}18`, borderRadius: 3, padding: "1px 3px", minWidth: 14, textAlign: "center" }}>{totalMCount}</span>}
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

                      {/* Color & opacity controls when selected */}
                      {isSelected && !isMeasuring && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 25px", background: `${to.color}06`, borderBottom: `1px solid ${C.bg2}` }} onClick={e => e.stopPropagation()}>
                          <span style={{ fontSize: 8, color: C.textDim, fontWeight: 600 }}>Fill</span>
                          <input type="range" min="5" max="100" step="5"
                            value={to.fillOpacity ?? 25}
                            onChange={e => updateTakeoff(to.id, "fillOpacity", Number(e.target.value))}
                            style={{ width: 60, height: 3, accentColor: to.color, cursor: "pointer" }} />
                          <span style={{ fontSize: 8, color: C.textDim, fontFamily: "'DM Mono',monospace", minWidth: 24 }}>{to.fillOpacity ?? 25}%</span>
                        </div>
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
                        />
                      )}
                    </div>
                  );
                })}
                <button className="ghost-btn" onClick={() => addTakeoff(group)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", background: "transparent", color: C.textDim, cursor: "pointer", fontSize: 9, border: "none", marginTop: 2 }}><Ic d={I.plus} size={9} /> Add to {group}</button>
              </div>
            ))}

            {takeoffs.length === 0 && (
              <div style={{ textAlign: "center", padding: T.space[8], border: `1px dashed ${C.border}`, borderRadius: T.radius.md, marginTop: T.space[2] }}>
                <div style={{
                  width: 64, height: 64, borderRadius: T.radius.full, margin: "0 auto",
                  marginBottom: T.space[3],
                  background: `linear-gradient(135deg, ${C.accent}20, ${C.accent}08)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Ic d={I.ruler} size={28} color={C.accent} sw={1.7} />
                </div>
                <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.semibold, color: C.text, marginBottom: T.space[1] }}>No takeoffs yet</div>
                <div style={{ fontSize: T.fontSize.base, color: C.textMuted }}>Search scope items above or add measurements from your drawings.</div>
              </div>
            )}
          </div>
          )}

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
                    {sg.code && <span style={{ fontSize: 8, fontFamily: "'DM Mono',monospace", color: C.purple }}>{sg.code}</span>}
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
        </div>
      )}

      {/* Drag resize handle */}
      {tkPanelOpen && (
        <div onMouseDown={startTkDrag} style={{ width: 5, cursor: "col-resize", background: C.border, flexShrink: 0, transition: "background 0.15s", position: "relative", zIndex: 5 }}
          onMouseEnter={e => e.currentTarget.style.background = C.accent} onMouseLeave={e => e.currentTarget.style.background = C.border}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 3, height: 24, borderRadius: 2, background: "rgba(0,0,0,0.15)" }} />
        </div>
      )}

      {/* Collapsed panel toggle */}
      {!tkPanelOpen && (
        <div style={{ width: 32, flexShrink: 0, background: C.bg1, borderRadius: "6px 0 0 6px", border: `1px solid ${C.border}`, borderRight: "none", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 8 }}>
          <button className="icon-btn" onClick={() => setTkPanelOpen(true)} title="Expand takeoffs" style={{ width: 24, height: 24, border: "none", background: C.bg2, color: C.accent, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 1l4 4-4 4" /></svg>
          </button>
          <div style={{ writingMode: "vertical-rl", fontSize: 9, fontWeight: 600, color: C.textDim, marginTop: 12, letterSpacing: 1 }}>TAKEOFFS ({takeoffs.length})</div>
        </div>
      )}

      {/* RIGHT PANEL — Drawing Viewer */}
      <div style={{ flex: 1, minWidth: 300, background: C.bg1, borderRadius: tkPanelOpen ? "0 6px 6px 0" : "6px", border: `1px solid ${C.border}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Search bar */}
        <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 6, alignItems: "center", position: "relative" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input value={tkNewInput} onChange={e => setTkNewInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTakeoffFreeform(tkNewInput); }}
              placeholder="Search database or type new item..."
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
          <button className="accent-btn" onClick={() => addTakeoffFreeform(tkNewInput)} disabled={!tkNewInput.trim()} title="Add as freeform" style={bt(C, { background: tkNewInput.trim() ? C.accent : C.bg3, color: tkNewInput.trim() ? "#fff" : C.textDim, padding: "5px 8px", flexShrink: 0 })}>
            <Ic d={I.plus} size={12} color={tkNewInput.trim() ? "#fff" : C.textDim} sw={2.5} />
          </button>
          {/* DB + Assembly search dropdown */}
          {tkDbResults.length > 0 && (
            <div style={{ position: "absolute", left: 10, right: 10, top: "100%", zIndex: 50, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: "0 0 6px 6px", boxShadow: "0 4px 16px rgba(0,0,0,0.30)", maxHeight: 320, overflowY: "auto" }}>
              {/* Assembly results */}
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
                        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.accent, fontWeight: 600 }}>{fmt2(totalPer)}</span>
                      </div>
                    );
                  })}
                </>
              )}
              {/* Database item results */}
              {tkDbResults.some(r => r._type === "item") && (
                <>
                  <div style={{ padding: "4px 8px", fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}`, background: C.bg2 }}>Database Items</div>
                  {tkDbResults.filter(r => r._type === "item").map(el => (
                    <div key={el.id} className="nav-item" onClick={() => addTakeoffFromDb(el)}
                      style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${C.bg}`, cursor: "pointer" }}>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.purple, fontWeight: 600, minWidth: 60 }}>{el.code}</span>
                      <span style={{ flex: 1, fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{el.name}</span>
                      <span style={{ fontSize: 9, color: C.textDim }}>/{el.unit}</span>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.accent, fontWeight: 600 }}>{fmt2(nn(el.material) + nn(el.labor) + nn(el.equipment))}</span>
                    </div>
                  ))}
                </>
              )}
              {/* Freeform add option */}
              <div className="nav-item" onClick={() => addTakeoffFreeform(tkNewInput)}
                style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.accent, fontSize: 10, fontWeight: 500, borderTop: `1px solid ${C.border}` }}>
                <Ic d={I.plus} size={10} color={C.accent} sw={2} /> Add "{tkNewInput}" as new item
              </div>
            </div>
          )}
        </div>

        {/* Toolbar: drawing selection + zoom */}
        <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 6, alignItems: "center", overflow: "hidden" }}>
          <select value={selectedDrawingId || ""} onChange={e => { setSelectedDrawingId(e.target.value); const d = drawings.find(d => d.id === e.target.value); if (d?.type === "pdf" && d.data) renderPdfPage(d); }} style={inp(C, { width: 220, minWidth: 160, flexShrink: 1, padding: "5px 8px", fontSize: 11 })}>
            <option value="">— Select Drawing —</option>
            {drawings.map(d => <option key={d.id} value={d.id}>{d.sheetNumber || d.pageNumber || "?"} — {d.sheetTitle || d.label}{!d.data ? " (needs re-upload)" : ""}</option>)}
          </select>
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            <button className="icon-btn" title="Previous" onClick={() => { const idx = drawings.findIndex(d => d.id === selectedDrawingId); if (idx > 0) { setSelectedDrawingId(drawings[idx - 1].id); if (drawings[idx - 1].type === "pdf" && drawings[idx - 1].data) renderPdfPage(drawings[idx - 1]); } }} style={{ width: 24, height: 24, border: "none", background: C.bg2, color: C.textMuted, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 11 }}>◀</button>
            <button className="icon-btn" title="Next" onClick={() => { const idx = drawings.findIndex(d => d.id === selectedDrawingId); if (idx < drawings.length - 1) { setSelectedDrawingId(drawings[idx + 1].id); if (drawings[idx + 1].type === "pdf" && drawings[idx + 1].data) renderPdfPage(drawings[idx + 1]); } }} style={{ width: 24, height: 24, border: "none", background: C.bg2, color: C.textMuted, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 11 }}>▶</button>
          </div>
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
            <div style={{ width: 1, height: 20, background: C.border, margin: "0 2px" }} />
            <button onClick={runDrawingAnalysis} disabled={aiDrawingAnalysis?.loading || !apiKey}
              title="AI: Analyze this drawing for measurable elements"
              style={bt(C, {
                padding: "3px 8px", fontSize: 8, fontWeight: 600, borderRadius: 4, display: "flex", alignItems: "center", gap: 4,
                background: aiDrawingAnalysis?.loading ? C.bg3 : `linear-gradient(135deg, ${C.accent}, ${C.purple || C.accent})`,
                color: aiDrawingAnalysis?.loading ? C.textDim : "#fff",
                boxShadow: aiDrawingAnalysis?.loading ? "none" : `0 1px 4px ${C.accent}30`,
              })}>
              {aiDrawingAnalysis?.loading
                ? <><span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid #fff3", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Analyzing...</>
                : <><Ic d={I.ai} size={9} color="#fff" /> AI Analyze</>}
            </button>
            {selectedDrawing?.type === "image" && drawingScales[selectedDrawingId] && drawingScales[selectedDrawingId] !== "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 2, borderLeft: `1px solid ${C.border}`, paddingLeft: 4 }}>
                <span style={{ fontSize: 8, color: C.textDim }}>DPI:</span>
                <input type="number" value={drawingDpi[selectedDrawingId] || DEFAULT_IMAGE_DPI}
                  onChange={e => setDrawingDpi({ ...drawingDpi, [selectedDrawingId]: parseInt(e.target.value) || 150 })}
                  style={{ width: 38, padding: "2px 3px", fontSize: 9, fontWeight: 600, border: `1px solid ${C.border}`, borderRadius: 3, background: C.bg2, color: C.text, textAlign: "center" }}
                  title="Image scan DPI" />
              </div>
            )}
          </>)}
        </div>

        {/* Thumbnail strip for drawing navigation */}
        {drawings.filter(d => d.data).length > 1 && (
          <div ref={thumbnailStripRef} style={{
            padding: "4px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 4,
            alignItems: "center", overflowX: "auto", overflowY: "hidden", flexShrink: 0,
            background: C.bg, height: 68,
          }}>
            {drawings.filter(d => d.data).map(d => {
              const isActiveDrw = d.id === selectedDrawingId;
              const thumb = d.type === "pdf" ? pdfCanvases[d.id] : d.data;
              const hasMeas = takeoffs.some(to => (to.measurements || []).some(m => m.sheetId === d.id));
              return (
                <div key={d.id} data-drawing-id={d.id}
                  onClick={() => { setSelectedDrawingId(d.id); if (d.type === "pdf" && d.data && !pdfCanvases[d.id]) renderPdfPage(d); }}
                  title={`${d.sheetNumber || "?"} — ${d.sheetTitle || d.label || ""}`}
                  style={{
                    flexShrink: 0, width: 72, height: 56, borderRadius: 4, overflow: "hidden",
                    cursor: "pointer", position: "relative", background: C.bg2,
                    border: isActiveDrw ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                    boxShadow: isActiveDrw ? `0 0 0 1px ${C.accent}40` : "none",
                    opacity: isActiveDrw ? 1 : 0.75, transition: "all 0.15s ease",
                  }}>
                  {thumb ? (
                    <img src={thumb} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: C.textDim }}>...</div>
                  )}
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, right: 0, padding: "1px 3px",
                    background: "rgba(0,0,0,0.7)", fontSize: 7, fontWeight: 600, color: "#fff",
                    textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{d.sheetNumber || d.pageNumber || "?"}</div>
                  {hasMeas && (
                    <div style={{ position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: "50%", background: C.accent, border: "1px solid rgba(0,0,0,0.3)" }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Measuring status bar */}
        {selectedDrawing?.data && tkMeasureState !== "idle" && tkActiveTakeoffId && (() => {
          const to = takeoffs.find(t => t.id === tkActiveTakeoffId);
          if (!to) return null;
          const mQty = getMeasuredQty(to);
          const scaleSet = hasScale(selectedDrawingId);
          const calUnit = getDisplayUnit(selectedDrawingId);
          const toolLabel = tkTool === "count" ? "Count" : tkTool === "linear" ? "Linear" : "Area";
          return (
            <div style={{ padding: "5px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 6, alignItems: "center", background: `${to.color}08` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: tkMeasureState === "measuring" ? to.color : C.orange, animation: tkMeasureState === "measuring" ? "pulse 1.5s infinite" : "none" }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: to.color }}>{to.description.substring(0, 30)}</span>
              <span style={{ fontSize: 8, fontWeight: 700, color: "#fff", background: to.color, padding: "1px 6px", borderRadius: 3 }}>{toolLabel}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: "'DM Mono',monospace", background: C.bg2, padding: "1px 6px", borderRadius: 3 }}>
                {tkTool === "count" ? `${mQty !== null ? mQty : 0} EA` :
                  (!scaleSet ? <span style={{ color: C.orange, fontSize: 9 }}>⚠ Set scale</span> :
                    `${mQty !== null ? mQty : 0} ${tkTool === "area" ? calUnit + "²" : calUnit}`)}
              </span>
              <span style={{ fontSize: 8, color: C.textDim, fontStyle: "italic" }}>
                {tkMeasureState === "measuring" ? "click to measure, dbl-click to finish" : "paused — click to continue, Esc to stop"}
              </span>
              <button onClick={stopMeasuring} title="Stop measuring (Esc)"
                style={bt(C, { marginLeft: "auto", padding: "3px 10px", fontSize: 8, fontWeight: 600, borderRadius: 4, background: C.red, color: "#fff", display: "flex", alignItems: "center", gap: 3 })}>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="#fff"><rect width="8" height="8" rx="1" /></svg> Stop
              </button>
            </div>
          );
        })()}

        {/* Calibration input bar */}
        {tkTool === "calibrate" && tkActivePoints.length === 2 && (
          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", background: "rgba(220,38,38,0.05)" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "#dc2626" }}>Enter real distance between the two points:</span>
            <input type="number" value={tkCalibInput.dist} onChange={e => setTkCalibInput({ ...tkCalibInput, dist: e.target.value })} placeholder="Distance..." autoFocus
              style={nInp(C, { width: 90, padding: "5px 8px", fontSize: 12, fontWeight: 600, border: "1px solid #dc2626" })} />
            <select value={tkCalibInput.unit} onChange={e => setTkCalibInput({ ...tkCalibInput, unit: e.target.value })}
              style={inp(C, { width: 55, padding: "5px 4px", fontSize: 10 })}>
              <option value="ft">ft</option><option value="in">in</option><option value="m">m</option><option value="cm">cm</option>
            </select>
            <button className="accent-btn" onClick={finishCalibration} disabled={!nn(tkCalibInput.dist)}
              style={bt(C, { background: nn(tkCalibInput.dist) ? "#dc2626" : C.bg3, color: nn(tkCalibInput.dist) ? "#fff" : C.textDim, padding: "5px 14px", fontSize: 10 })}>
              Set Scale
            </button>
            <button onClick={() => { setTkActivePoints([]); setTkTool("select"); }} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "5px 10px", fontSize: 10 })}>Cancel</button>
          </div>
        )}

        {/* Auto Count status bar */}
        {tkAutoCount && (
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8, alignItems: "center", background: "rgba(168,126,230,0.06)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.purple} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10 M18 20v-4 M6 20v-6" /></svg>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.purple }}>Auto Count</span>
            {tkAutoCount.phase === "select" && <span style={{ fontSize: 10, color: C.text }}>Click on a <strong>sample symbol</strong> to count all similar ones</span>}
            {tkAutoCount.phase === "scanning" && <span style={{ fontSize: 10, color: C.text, display: "flex", alignItems: "center", gap: 6 }}><span style={{ display: "inline-block", animation: "spin 1s linear infinite", fontSize: 14 }}>⟳</span> Scanning drawing for matches...</span>}
            {tkAutoCount.phase === "done" && <span style={{ fontSize: 10, color: C.green, fontWeight: 600 }}>Found {tkAutoCount.results?.length || 0} matches</span>}
            <button onClick={() => setTkAutoCount(null)} style={bt(C, { marginLeft: "auto", background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "3px 10px", fontSize: 9 })}>Cancel</button>
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
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.accent, fontWeight: 600, flexShrink: 0 }}>
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
                          <span key={j} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: `${C.accent}10`, color: C.text, fontFamily: "'DM Mono',monospace" }}>{s}</span>
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

        {/* Sheet info bar */}
        {selectedDrawing && (
          <div style={{ padding: "3px 10px", borderBottom: `1px solid ${C.border}`, fontSize: 9, color: C.textDim, background: C.bg }}>
            {selectedDrawing.sheetNumber || selectedDrawing.pageNumber || "—"} | {selectedDrawing.sheetTitle || selectedDrawing.label || "Untitled"} | Rev {selectedDrawing.revision || "0"}
          </div>
        )}

        {/* Drawing display area */}
        <div ref={drawingContainerRef} onMouseDown={handleDrawingMouseDown} onContextMenu={e => e.preventDefault()}
          style={{ flex: 1, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#e5e7eb", position: "relative", cursor: tkPanning.current ? "grabbing" : "default" }}>
          {!selectedDrawing ? (
            <div style={{ color: C.textDim, fontSize: 12, textAlign: "center", padding: 20 }}>
              {drawings.length === 0 ? (<><Ic d={I.plans} size={28} color={C.textDim} /><br /><span style={{ marginTop: 8, display: "block" }}>No drawings uploaded</span><span style={{ fontSize: 10, color: C.textDim }}>Upload in Plan Room tab</span></>) :
                (<><span>Select a drawing above</span><br /><span style={{ fontSize: 10 }}>Navigate with ◀ ▶ or dropdown</span></>)}
            </div>
          ) : !selectedDrawing.data ? (
            <div style={{ color: C.orange, fontSize: 12, textAlign: "center", padding: 20 }}>
              <Ic d={I.upload} size={24} color={C.orange} /><br />
              <span style={{ marginTop: 6, display: "block" }}>File needs re-upload</span>
              <span style={{ fontSize: 10, color: C.textDim }}>Drawing data is not stored between sessions.<br />Go to <strong>Plan Room</strong> to re-attach the file.</span>
            </div>
          ) : (
            <div style={{ transform: `translate(${tkPan.x}px,${tkPan.y}px) scale(${tkZoom / 100})`, transformOrigin: "0 0", position: "relative" }}>
              {selectedDrawing.type === "image" ? (
                <img ref={drawingImgRef} src={selectedDrawing.data} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                  onLoad={e => { if (canvasRef.current) { canvasRef.current.width = e.target.naturalWidth; canvasRef.current.height = e.target.naturalHeight; } }} />
              ) : pdfCanvases[selectedDrawing.id] ? (
                <img ref={drawingImgRef} src={pdfCanvases[selectedDrawing.id]} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                  onLoad={e => { if (canvasRef.current) { canvasRef.current.width = e.target.naturalWidth; canvasRef.current.height = e.target.naturalHeight; } }} />
              ) : <div style={{ color: C.textDim, fontSize: 11 }}>Loading PDF page...</div>}
              {/* Canvas overlay */}
              <canvas ref={canvasRef} onClick={handleCanvasClick}
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
                    e.target.style.cursor = hovering ? "pointer" : "default";
                    return;
                  }

                  // Measuring: update cursor position for live preview
                  if (tkActivePoints.length === 0) return;
                  let snapped = pt;
                  if (e.shiftKey && tkActivePoints.length >= 1) {
                    snapped = snapAngle(tkActivePoints[tkActivePoints.length - 1], pt);
                  }
                  shiftHeldRef.current = e.shiftKey;
                  setTkCursorPt(snapped);
                }}
                onMouseLeave={() => setTkCursorPt(null)}
                onMouseDown={e => { if (e.button === 2 || e.button === 1) handleDrawingMouseDown(e); }}
                onContextMenu={e => e.preventDefault()}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                  cursor: tkAutoCount?.phase === "select" ? "crosshair" : tkMeasureState === "paused" ? "pointer" : (tkMeasureState === "idle" || tkMeasureState === undefined) ? "default" : tkTool === "calibrate" ? "crosshair" : tkTool === "count" ? "cell" : "crosshair",
                  pointerEvents: "auto" }} />
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
    </div>
  );
}
