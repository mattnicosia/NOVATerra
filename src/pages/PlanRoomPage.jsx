import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { useSpecsStore } from '@/stores/specsStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore } from '@/stores/uiStore';
import { useScanStore } from '@/stores/scanStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, bt } from '@/utils/styles';
import { uid, nowStr } from '@/utils/format';
import { callAnthropic, batchAI, optimizeImageForAI, imageBlock, buildProjectContext } from '@/utils/ai';
import { loadPdfJs } from '@/utils/pdf';
import { SCALE_PRESETS } from '@/constants/scales';
import { buildDetectionPrompt, buildParsePrompt, normalizeScheduleData, SCHEDULE_TYPES } from '@/utils/scheduleParsers';
import { generateBaselineROM, generateScheduleLineItems, augmentROMWithAI, estimateProjectSF } from '@/utils/romEngine';
import ScanResultsModal from '@/components/planroom/ScanResultsModal';
import DocumentsPage from '@/pages/DocumentsPage';

// Convert ArrayBuffer to base64
const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
};

// Map AI-detected scale text to our scale key
const SCALE_MAP = {
  // Architectural
  '1/16"=1\'': "sixteenth", '1/16" = 1\'': "sixteenth", '1/16"=1\'-0"': "sixteenth", '1/16" = 1\'-0"': "sixteenth",
  '1/8"=1\'': "eighth", '1/8" = 1\'': "eighth", '1/8"=1\'-0"': "eighth", '1/8" = 1\'-0"': "eighth",
  '3/16"=1\'': "3/16", '3/16" = 1\'': "3/16", '3/16"=1\'-0"': "3/16", '3/16" = 1\'-0"': "3/16",
  '1/4"=1\'': "quarter", '1/4" = 1\'': "quarter", '1/4"=1\'-0"': "quarter", '1/4" = 1\'-0"': "quarter",
  '3/8"=1\'': "3/8", '3/8" = 1\'': "3/8", '3/8"=1\'-0"': "3/8", '3/8" = 1\'-0"': "3/8",
  '1/2"=1\'': "half", '1/2" = 1\'': "half", '1/2"=1\'-0"': "half", '1/2" = 1\'-0"': "half",
  '3/4"=1\'': "3/4", '3/4" = 1\'': "3/4", '3/4"=1\'-0"': "3/4", '3/4" = 1\'-0"': "3/4",
  '1"=1\'': "full", '1" = 1\'': "full", '1"=1\'-0"': "full", '1" = 1\'-0"': "full",
  '1-1/2"=1\'': "1-1/2", '1-1/2" = 1\'': "1-1/2", '1-1/2"=1\'-0"': "1-1/2", '1-1/2" = 1\'-0"': "1-1/2",
  '3"=1\'': "3", '3" = 1\'': "3", '3"=1\'-0"': "3", '3" = 1\'-0"': "3",
  // Engineering
  '1"=10\'': "eng10", '1" = 10\'': "eng10", '1"=20\'': "eng20", '1" = 20\'': "eng20",
  '1"=30\'': "eng30", '1" = 30\'': "eng30", '1"=40\'': "eng40", '1" = 40\'': "eng40",
  '1"=50\'': "eng50", '1" = 50\'': "eng50", '1"=60\'': "eng60", '1" = 60\'': "eng60",
  '1"=100\'': "eng100", '1" = 100\'': "eng100",
  // Metric
  '1:50': "metric_1:50", '1:100': "metric_1:100", '1:200': "metric_1:200", '1:500': "metric_1:500",
};

function matchScaleKey(scaleText) {
  if (!scaleText) return null;
  const s = scaleText.trim();
  // Direct lookup
  if (SCALE_MAP[s]) return SCALE_MAP[s];
  // Normalize: remove spaces around = and -, replace unicode quotes
  const norm = s.replace(/\u201c|\u201d/g, '"').replace(/\u2019/g, "'").replace(/\s*=\s*/g, "=").replace(/\s*-\s*/g, "-").trim();
  if (SCALE_MAP[norm]) return SCALE_MAP[norm];
  // Try with spaces around =
  const spaced = norm.replace(/=/g, " = ");
  if (SCALE_MAP[spaced]) return SCALE_MAP[spaced];
  // Fuzzy: find best partial match
  const lower = norm.toLowerCase();
  for (const [key, val] of Object.entries(SCALE_MAP)) {
    if (key.toLowerCase().replace(/\s/g, "") === lower.replace(/\s/g, "")) return val;
  }
  return null;
}

// Get the display label for a scale key
function getScaleLabel(key) {
  if (!key) return null;
  for (const group of SCALE_PRESETS) {
    const item = group.items.find(i => i.key === key);
    if (item) return item.label;
  }
  return key;
}

export default function PlanRoomPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const { id: estimateId } = useParams();
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const estId = activeEstimateId || estimateId;
  const showToast = useUiStore(s => s.showToast);
  const apiKey = useUiStore(s => s.appSettings.apiKey);

  // Drawings store
  const drawings = useDrawingsStore(s => s.drawings);
  const setDrawings = useDrawingsStore(s => s.setDrawings);
  const pdfCanvases = useDrawingsStore(s => s.pdfCanvases);
  const setPdfCanvases = useDrawingsStore(s => s.setPdfCanvases);
  const previewDrawingId = useDrawingsStore(s => s.previewDrawingId);
  const setPreviewDrawingId = useDrawingsStore(s => s.setPreviewDrawingId);
  const aiLabelLoading = useDrawingsStore(s => s.aiLabelLoading);
  const setAiLabelLoading = useDrawingsStore(s => s.setAiLabelLoading);
  const autoLabelProgress = useDrawingsStore(s => s.autoLabelProgress);
  const setAutoLabelProgress = useDrawingsStore(s => s.setAutoLabelProgress);
  const drawingScales = useDrawingsStore(s => s.drawingScales);
  const setDrawingScales = useDrawingsStore(s => s.setDrawingScales);

  // Specs store
  const specs = useSpecsStore(s => s.specs);
  const setSpecs = useSpecsStore(s => s.setSpecs);
  const specPdf = useSpecsStore(s => s.specPdf);
  const setSpecPdf = useSpecsStore(s => s.setSpecPdf);
  const specParseLoading = useSpecsStore(s => s.specParseLoading);
  const setSpecParseLoading = useSpecsStore(s => s.setSpecParseLoading);
  const addSpec = useSpecsStore(s => s.addSpec);
  const updateSpec = useSpecsStore(s => s.updateSpec);
  const removeSpec = useSpecsStore(s => s.removeSpec);

  // Items for spec allocation + spec-to-estimate mapping
  const items = useItemsStore(s => s.items);
  const addElement = useItemsStore(s => s.addElement);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const [specMapLoading, setSpecMapLoading] = useState(false);
  const [specMapResults, setSpecMapResults] = useState(null);

  // Scan store
  const scanResults = useScanStore(s => s.scanResults);
  const scanProgress = useScanStore(s => s.scanProgress);
  const scanError = useScanStore(s => s.scanError);
  const setScanResults = useScanStore(s => s.setScanResults);
  const setScanProgress = useScanStore(s => s.setScanProgress);
  const setScanError = useScanStore(s => s.setScanError);
  const clearScan = useScanStore(s => s.clearScan);
  const [showScanModal, setShowScanModal] = useState(false);

  // Tab state for Drawings / Specifications / Documents
  const [planTab, setPlanTab] = useState("drawings");

  const planFileRef = useRef(null);

  // Use store's updateDrawing — it reads current state (not stale closure)
  const updateDrawing = useDrawingsStore(s => s.updateDrawing);
  const removeDrawingFromStore = useDrawingsStore(s => s.removeDrawing);
  const removeDrawing = (id) => {
    removeDrawingFromStore(id);
    if (previewDrawingId === id) setPreviewDrawingId(null);
  };

  // Render PDF page to canvas data URL
  const renderPdfPage = useCallback(async (drawing) => {
    // Read current canvases from store to avoid stale closure
    const currentCanvases = useDrawingsStore.getState().pdfCanvases;
    if (currentCanvases[drawing.id]) return currentCanvases[drawing.id];
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
      useDrawingsStore.setState(s => ({ pdfCanvases: { ...s.pdfCanvases, [drawing.id]: url } }));
      return url;
    } catch (e) { console.error("renderPdfPage error:", e); return null; }
  }, []);

  // Handle drawing file upload
  const handleDrawingUpload = (file) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const reader = new FileReader();
    reader.onerror = () => showToast("Error reading file", "error");
    reader.onload = async (e) => {
      if (isPdf) {
        try {
          const base64 = arrayBufferToBase64(e.target.result);
          await loadPdfJs();
          // Use original ArrayBuffer directly — much faster than re-decoding base64
          const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(e.target.result) }).promise;
          const nd = [];
          for (let p = 1; p <= pdf.numPages; p++) {
            nd.push({ id: uid(), label: `${file.name.replace(/\.pdf$/i, "")}-Pg${p}`, sheetNumber: "", sheetTitle: "", revision: "0", type: "pdf", data: base64, fileName: file.name, uploadDate: nowStr(), pdfPage: p, totalPdfPages: pdf.numPages });
          }
          // Read current drawings from store to avoid stale closure
          const cur = useDrawingsStore.getState().drawings;
          setDrawings([...cur, ...nd]);
          showToast(`${pdf.numPages} sheets added — use Auto Label or Smart Label`);
          nd.forEach(d => renderPdfPage(d));
        } catch (err) {
          console.error("PDF upload error:", err);
          showToast(`PDF error: ${err.message || "Failed to process PDF"}`, "error");
        }
      } else {
        const cur = useDrawingsStore.getState().drawings;
        setDrawings([...cur, { id: uid(), label: file.name.replace(/\.[^.]+$/, ""), sheetNumber: "", sheetTitle: "", revision: "0", type: "image", data: e.target.result, fileName: file.name, uploadDate: nowStr(), pdfPage: null, totalPdfPages: null }]);
        showToast("Drawing added");
      }
    };
    if (isPdf) reader.readAsArrayBuffer(file); else reader.readAsDataURL(file);
  };

  // Re-attach file data to drawing loaded from storage
  const reattachDrawingFile = (drawingId, file) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const reader = new FileReader();
    reader.onerror = () => showToast("Error reading file", "error");
    reader.onload = (e) => {
      if (isPdf) {
        const base64 = arrayBufferToBase64(e.target.result);
        updateDrawing(drawingId, "data", base64);
        // Render the PDF thumbnail after data is attached
        setTimeout(() => {
          const d = useDrawingsStore.getState().drawings.find(dr => dr.id === drawingId);
          if (d) renderPdfPage(d);
        }, 100);
        showToast("File re-attached");
      } else {
        updateDrawing(drawingId, "data", e.target.result);
        showToast("File re-attached");
      }
    };
    if (isPdf) reader.readAsArrayBuffer(file); else reader.readAsDataURL(file);
  };

  // Auto Label All — AI reads sheet numbers, titles, and scale from title blocks
  const autoLabelAll = async () => {
    const key = useUiStore.getState().appSettings.apiKey;
    if (!key) { showToast("Add your Anthropic API key in Settings first", "error"); return; }
    // Read drawings fresh from store to avoid stale closure
    const currentDrawings = useDrawingsStore.getState().drawings;
    const curScales = useDrawingsStore.getState().drawingScales;
    const needsWork = currentDrawings.filter(d => d.data && (!d.sheetNumber || !d.sheetTitle || !curScales[d.id]));
    if (needsWork.length === 0) { showToast("All drawings already labeled & scaled"); return; }
    setAiLabelLoading(true);
    setAutoLabelProgress({ current: 0, total: needsWork.length });
    let count = 0;
    let scaleCount = 0;
    for (let i = 0; i < needsWork.length; i++) {
      const d = needsWork[i];
      setAutoLabelProgress({ current: i + 1, total: needsWork.length });
      try {
        let imgData;
        const curCanvases = useDrawingsStore.getState().pdfCanvases;
        if (d.type === "pdf") { imgData = curCanvases[d.id] || await renderPdfPage(d); } else { imgData = d.data; }
        if (!imgData) continue;
        const base64Data = imgData.includes(",") ? imgData.split(",")[1] : imgData;
        const text = await callAnthropic({
          apiKey: key, max_tokens: 300,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Data } },
            { type: "text", text: `This is a construction blueprint/drawing. Look at the title block (usually bottom-right corner) and anywhere on the drawing for scale information.

Find and return:
1. Sheet number — usually formatted like A-100, A-100.00, S-201, M-001, E-100, L-001, etc.
2. Sheet title — the drawing name like "FIRST FLOOR PLAN", "FOUNDATION PLAN", etc.
3. Scale — the drawing scale, written exactly as shown on the drawing (e.g. 1/4" = 1'-0", 1/8" = 1'-0", 1" = 20', 1:100, etc.). Look in the title block, scale bar, or near individual plan views. If multiple scales are shown, use the primary/plan scale (usually the largest view).

Return ONLY a JSON object like: {"number":"A-100.00","title":"FIRST FLOOR PLAN","scale":"1/4\\" = 1'-0\\""}
If you can't read a field, use null for that field.` }
          ] }]
        });
        console.log("Auto label response for", d.id, ":", text);
        try {
          // Extract JSON object from anywhere in the response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON found");
          const parsed = JSON.parse(jsonMatch[0]);
          console.log("Parsed label:", parsed);
          if (parsed.number && !d.sheetNumber) { updateDrawing(d.id, "sheetNumber", parsed.number); count++; }
          if (parsed.title && !d.sheetTitle) { updateDrawing(d.id, "sheetTitle", parsed.title); count++; }
          // Match detected scale to a scale key
          if (parsed.scale) {
            const scaleKey = matchScaleKey(parsed.scale);
            const latestScales = useDrawingsStore.getState().drawingScales;
            if (scaleKey && !latestScales[d.id]) {
              useDrawingsStore.getState().setDrawingScales({ ...latestScales, [d.id]: scaleKey });
              scaleCount++;
            } else if (!scaleKey) {
              console.log("Could not match scale:", parsed.scale, "for drawing", d.id);
              // Store the raw text so the user can see what was detected
              updateDrawing(d.id, "detectedScale", parsed.scale);
            }
          }
        } catch (pe) {
          console.warn("JSON parse failed, raw text:", text);
          if (text && !text.includes("{")) { updateDrawing(d.id, "sheetNumber", text); count++; }
        }
      } catch (e) {
        console.error("Auto label error for drawing:", d.id, e);
      }
    }
    const parts = [];
    if (count > 0) parts.push(`${count} label fields`);
    if (scaleCount > 0) parts.push(`${scaleCount} scales`);
    showToast(parts.length > 0 ? `Auto-detected ${parts.join(" & ")} across ${needsWork.length} sheets` : `Processed ${needsWork.length} sheets — no new data found`);
    setAiLabelLoading(false);
    setAutoLabelProgress(null);
  };

  // Manual spec add
  const addManualSpec = () => addSpec({ section: "", title: "", summary: "", requirements: [], page: null, allocated: false });

  // Spec allocation check
  const getSpecAllocation = () => {
    const allocated = new Set();
    items.forEach(item => {
      if (item.specSection) allocated.add(item.specSection);
      if (item.code) {
        const parts = item.code.split(".");
        const divSub = parts.slice(0, 2).join(".");
        specs.forEach(sp => {
          if (sp.section && sp.section.replace(/\s+/g, "").startsWith(divSub.replace(".", "")))
            allocated.add(sp.section);
        });
      }
    });
    return allocated;
  };

  // ─── Spec-to-Estimate Mapper ────────────────────────────────────
  const generateEstimateFromSpecs = async () => {
    if (!apiKey || specs.length === 0) return;
    setSpecMapLoading(true);
    setSpecMapResults(null);
    try {
      const specList = specs.map(sp => `${sp.section} ${sp.title}${sp.summary ? ` — ${sp.summary}` : ""}`).join("\n");
      const existingItems = items.map(it => `${it.code} ${it.description} (${it.unit})`).join("\n");

      const result = await callAnthropic({
        apiKey, max_tokens: 4000,
        system: "You are a senior construction estimator. Given specification sections, generate recommended estimate line items with proper CSI codes, descriptions, and units of measure.",
        messages: [{ role: "user", content: `Analyze these specification sections and generate recommended estimate line items for each.

SPECIFICATIONS:
${specList}

EXISTING ESTIMATE ITEMS (avoid duplicating these):
${existingItems || "(none)"}

For each spec section, suggest 1-5 key line items that should be in the estimate. Focus on the primary scope items, not minor accessories.

Return ONLY a JSON array where each object has:
- section: the spec section number (e.g., "03 30 00")
- items: array of { code: "XX.XXX.XXX", description: "string", unit: "SF|LF|CY|EA|LS|TON|etc" }

Use proper CSI MasterFormat codes (e.g., "03.300.100" for cast-in-place concrete). Be specific with descriptions — include material types, thicknesses, methods where the spec provides detail.` }],
      });

      let parsed;
      try { parsed = JSON.parse(result.replace(/```json|```/g, "").trim()); } catch { parsed = null; }
      if (parsed && Array.isArray(parsed)) {
        setSpecMapResults(parsed);
      } else {
        showToast("Failed to parse AI response", "error");
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
    } finally {
      setSpecMapLoading(false);
    }
  };

  const applySpecMapItems = (sectionItems) => {
    sectionItems.forEach(item => {
      const division = divFromCode(item.code);
      addElement(division, { code: item.code, name: item.description, unit: item.unit });
    });
    showToast(`Added ${sectionItems.length} items to estimate`);
  };

  const applyAllSpecMapItems = () => {
    if (!specMapResults) return;
    let count = 0;
    specMapResults.forEach(sec => {
      (sec.items || []).forEach(item => {
        const division = divFromCode(item.code);
        addElement(division, { code: item.code, name: item.description, unit: item.unit });
        count++;
      });
    });
    setSpecMapResults(null);
    showToast(`Added ${count} items to estimate`);
  };

  // ─── Project Scan ─────────────────────────────────────────────────
  const runProjectScan = async () => {
    const key = useUiStore.getState().appSettings.apiKey;
    if (!key) { showToast("Add your Anthropic API key in Settings first", "error"); return; }
    const currentDrawings = useDrawingsStore.getState().drawings.filter(d => d.data);
    if (currentDrawings.length === 0) { showToast("Upload drawings first", "error"); return; }

    clearScan();
    setScanProgress({ phase: "detect", current: 0, total: currentDrawings.length, message: "Detecting schedules..." });

    try {
      // ── Phase 1: Detect schedules on each drawing ──
      const detections = await batchAI(currentDrawings, async (d, idx) => {
        setScanProgress({ phase: "detect", current: idx + 1, total: currentDrawings.length, message: `Scanning sheet ${idx + 1}/${currentDrawings.length}...` });

        let imgData;
        const curCanvases = useDrawingsStore.getState().pdfCanvases;
        if (d.type === "pdf") {
          imgData = curCanvases[d.id] || await renderPdfPage(d);
        } else {
          imgData = d.data;
        }
        if (!imgData) return { sheetId: d.id, schedules: [] };

        const optimized = await optimizeImageForAI(imgData, 1400);
        const prompt = buildDetectionPrompt(d.sheetTitle || d.label || d.sheetNumber);

        const result = await callAnthropic({
          apiKey: key, max_tokens: 1000,
          messages: [{ role: "user", content: [
            imageBlock(optimized.base64),
            { type: "text", text: prompt },
          ] }],
        });

        try {
          const jsonMatch = result.match(/\[[\s\S]*\]/);
          if (!jsonMatch) return { sheetId: d.id, sheetLabel: d.sheetTitle || d.sheetNumber || d.label, schedules: [] };
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            sheetId: d.id,
            sheetLabel: d.sheetTitle || d.sheetNumber || d.label,
            imgBase64: optimized.base64,
            imgWidth: optimized.width,
            imgHeight: optimized.height,
            schedules: Array.isArray(parsed) ? parsed : [],
          };
        } catch {
          return { sheetId: d.id, sheetLabel: d.sheetTitle || d.sheetNumber || d.label, schedules: [] };
        }
      }, 3);

      // Flatten detections into schedule items to parse
      // Filter out low-confidence detections and those with very few rows
      const schedulesToParse = [];
      detections.forEach(det => {
        if (det.error || !det.schedules) return;
        det.schedules.forEach(s => {
          if (s.type && s.type !== "unknown" && s.confidence !== "low") {
            // Skip detections with rowCount < 2 (likely legends/notes, not real schedules)
            if (s.rowCount != null && s.rowCount < 2) return;
            schedulesToParse.push({
              ...s,
              sheetId: det.sheetId,
              sheetLabel: det.sheetLabel,
              imgBase64: det.imgBase64,
              imgWidth: det.imgWidth,
              imgHeight: det.imgHeight,
            });
          }
        });
      });

      if (schedulesToParse.length === 0) {
        setScanProgress({ phase: null, current: 0, total: 0, message: "" });
        setScanResults({ schedules: [], rom: null, lineItems: [], timestamp: Date.now() });
        setShowScanModal(true);
        showToast("No schedules detected on the uploaded drawings");
        return;
      }

      // ── Phase 2: Parse each detected schedule ──
      setScanProgress({ phase: "parse", current: 0, total: schedulesToParse.length, message: "Parsing schedules..." });

      const parsedSchedules = await batchAI(schedulesToParse, async (sched, idx) => {
        setScanProgress({ phase: "parse", current: idx + 1, total: schedulesToParse.length, message: `Parsing ${SCHEDULE_TYPES.find(t => t.id === sched.type)?.label || sched.type}...` });

        // Crop the schedule region from the drawing
        let cropBase64 = sched.imgBase64;
        if (sched.bbox && sched.imgBase64) {
          try {
            const [xPct, yPct, wPct, hPct] = sched.bbox;
            const canvas = document.createElement("canvas");
            const img = await new Promise((res, rej) => {
              const i = new Image();
              i.onload = () => res(i);
              i.onerror = rej;
              i.src = `data:image/jpeg;base64,${sched.imgBase64}`;
            });
            const sx = Math.round(img.width * xPct / 100);
            const sy = Math.round(img.height * yPct / 100);
            const sw = Math.round(img.width * wPct / 100);
            const sh = Math.round(img.height * hPct / 100);
            // Crop at 2x for clarity
            canvas.width = Math.min(sw * 2, 1800);
            canvas.height = Math.min(sh * 2, 1800);
            canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            cropBase64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
          } catch (cropErr) {
            console.warn("Crop failed, using full image:", cropErr);
          }
        }

        const parsePrompt = buildParsePrompt(sched.type);
        if (!parsePrompt) return { ...sched, entries: [], error: "Unknown schedule type" };

        const result = await callAnthropic({
          apiKey: key, max_tokens: 4000,
          messages: [{ role: "user", content: [
            imageBlock(cropBase64),
            { type: "text", text: parsePrompt },
          ] }],
        });

        try {
          const jsonMatch = result.match(/\[[\s\S]*\]/);
          if (!jsonMatch) return { ...sched, entries: [] };
          const parsed = JSON.parse(jsonMatch[0]);
          const normalized = normalizeScheduleData(sched.type, parsed);
          return { ...sched, entries: normalized };
        } catch {
          return { ...sched, entries: [] };
        }
      }, 3);

      const validSchedules = parsedSchedules.filter(s => !s.error && s.entries && s.entries.length > 0);

      // ── Phase 3: Generate ROM ──
      setScanProgress({ phase: "rom", current: 0, total: 1, message: "Generating ROM estimate..." });

      const project = useProjectStore.getState().project;
      let effectiveSF = project.projectSF;
      let sfEstimate = null;

      // If project SF is missing, ask AI to estimate it
      if (!effectiveSF || parseFloat(effectiveSF) === 0) {
        setScanProgress({ phase: "rom", current: 0, total: 1, message: "Estimating project square footage..." });
        const projectCtxForSF = buildProjectContext({
          project,
          drawings: useDrawingsStore.getState().drawings,
        });
        sfEstimate = await estimateProjectSF({
          drawings: useDrawingsStore.getState().drawings,
          schedules: validSchedules,
          projectContext: projectCtxForSF,
          apiKey: key,
        });
        if (sfEstimate?.estimatedSF) {
          effectiveSF = sfEstimate.estimatedSF;
        }
      }

      const calibrationFactors = useScanStore.getState().getCalibrationFactors();
      const baseline = generateBaselineROM(effectiveSF, project.jobType, calibrationFactors);
      // Tag with SF estimate info if we estimated it
      if (sfEstimate?.estimatedSF) {
        baseline.sfEstimated = true;
        baseline.sfEstimateDetails = sfEstimate;
        baseline.sfMissing = false;
        baseline.projectSF = sfEstimate.estimatedSF;
      }
      const scheduleLineItems = generateScheduleLineItems(validSchedules);

      // AI augmentation
      setScanProgress({ phase: "rom", current: 0, total: 1, message: "AI refining ROM estimates..." });
      const projectCtx = buildProjectContext({
        project: { ...project, projectSF: effectiveSF || project.projectSF },
        items: useItemsStore.getState().items,
        drawings: useDrawingsStore.getState().drawings,
        specs: useSpecsStore.getState().specs,
      });
      const augmentedROM = await augmentROMWithAI({
        baseline,
        scheduleItems: scheduleLineItems,
        projectContext: projectCtx,
        apiKey: key,
      });

      // Store results
      const results = {
        schedules: validSchedules.map(s => ({
          type: s.type,
          title: s.title,
          sheetId: s.sheetId,
          sheetLabel: s.sheetLabel,
          confidence: s.confidence,
          entries: s.entries,
        })),
        rom: augmentedROM,
        lineItems: scheduleLineItems,
        timestamp: Date.now(),
      };

      setScanResults(results);
      setScanProgress({ phase: null, current: 0, total: 0, message: "" });
      setShowScanModal(true);

      const totalEntries = validSchedules.reduce((sum, s) => sum + s.entries.length, 0);
      showToast(`Scan complete: ${totalEntries} items across ${validSchedules.length} schedules`);

    } catch (err) {
      console.error("[runProjectScan] Error:", err);
      setScanError(err.message);
      setScanProgress({ phase: null, current: 0, total: 0, message: "" });
      showToast(`Scan failed: ${err.message}`, "error");
    }
  };

  const handleApplyToEstimate = (selectedItems) => {
    if (!selectedItems || selectedItems.length === 0) return;
    let count = 0;
    selectedItems.forEach(li => {
      const division = divFromCode(li.code);
      addElement(division, {
        code: li.code,
        name: li.description,
        unit: li.unit,
        material: li.m || 0,
        labor: li.l || 0,
        equipment: li.e || 0,
      });
      count++;
    });
    setShowScanModal(false);
    showToast(`Added ${count} items to estimate from project scan`);
  };

  const handleSaveScanOnly = () => {
    setShowScanModal(false);
    showToast("Scan results saved");
  };

  // Upload spec book PDF
  const uploadSpecBook = async (file) => {
    if (!file) return;
    setSpecParseLoading(true);
    try {
      const data = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error("Failed to read file"));
        r.readAsDataURL(file);
      });
      setSpecPdf({ name: file.name, data });
      showToast(`Spec book uploaded: ${file.name} — parsing with AI...`);
      const base64 = data.split(",")[1];
      if (!base64 || base64.length < 100) { showToast("File appears empty or too small", "error"); setSpecParseLoading(false); return; }
      const text = await callAnthropic({
        apiKey: useUiStore.getState().appSettings.apiKey, max_tokens: 8000,
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: `You are a construction specification parser. Analyze this spec book and extract ALL CSI specification sections you can find.\n\nFor each section provide:\n- section: The CSI section number (format: "XX XX XX" e.g. "09 30 00")\n- title: Section title\n- summary: 1-2 sentence summary of key requirements, products, manufacturers\n- page: Approximate page number in the document\n\nCRITICAL: Respond with ONLY a JSON array. No markdown fences, no backticks, no explanation text. Just the raw JSON array.\n\nFocus on sections with actual specification content (Part 1/2/3), not the table of contents or front matter. Extract every section you find.` }
        ] }]
      });
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          const newSpecs = parsed.map(s => ({ id: uid(), section: s.section || "", title: s.title || "", summary: s.summary || "", page: s.page || null, requirements: [], allocated: false }));
          setSpecs([...specs, ...newSpecs]);
          showToast(`Parsed ${newSpecs.length} spec sections`);
        }
      } catch (pe) {
        console.error("Spec parse JSON error:", pe);
        showToast("Failed to parse spec sections — check console", "error");
      }
    } catch (e) {
      console.error("Spec upload error:", e);
      showToast("Spec upload failed", "error");
    }
    setSpecParseLoading(false);
  };

  return (
    <div style={{ padding: T.space[7], minHeight: "100%", animation: "fadeIn 0.15s ease-out" }}>
      <div style={{ maxWidth: 1000 }}>
        {/* Tab bar */}
        <div style={{ display: "inline-flex", gap: 0, marginBottom: T.space[4], background: C.bg2, borderRadius: T.radius.md, padding: 3 }}>
          {[{ k: "drawings", l: "Drawings" }, { k: "specs", l: "Specifications" }, { k: "documents", l: "Documents" }].map(tab => (
            <button key={tab.k} onClick={() => setPlanTab(tab.k)}
              style={bt(C, { background: planTab === tab.k ? C.accent : "transparent", color: planTab === tab.k ? "#fff" : C.textMuted, padding: "6px 16px", fontSize: 11, border: "none", borderRadius: T.radius.sm })}>{tab.l}</button>
          ))}
        </div>

        {/* Documents tab */}
        {planTab === "documents" && <DocumentsPage />}

        {/* Drawings tab */}
        {planTab === "drawings" && <>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>Upload drawings then use <strong style={{ color: C.blue }}>Auto Label All</strong> to detect sheet numbers, titles &amp; scales from title blocks.</p>
          <div style={{ display: "flex", gap: 8 }}>
            {drawings.filter(d => d.data).length > 0 && (
              <button className="ghost-btn" onClick={autoLabelAll} disabled={aiLabelLoading}
                style={bt(C, { background: aiLabelLoading ? "rgba(91,141,239,0.08)" : "rgba(91,141,239,0.06)", border: `1px solid ${C.blue}`, color: C.blue, padding: "8px 16px", opacity: aiLabelLoading ? 0.6 : 1 })}>
                <Ic d={I.ai} size={14} color={C.blue} /> {autoLabelProgress ? `Labeling ${autoLabelProgress.current}/${autoLabelProgress.total}...` : `Auto Label All (${drawings.filter(d => d.data && (!d.sheetNumber || !d.sheetTitle || !drawingScales[d.id])).length})`}
              </button>
            )}
            {drawings.filter(d => d.data).length > 0 && (
              <button className="ghost-btn" onClick={runProjectScan} disabled={!!scanProgress.phase || aiLabelLoading}
                style={bt(C, { background: scanProgress.phase ? "rgba(168,85,247,0.08)" : "rgba(168,85,247,0.06)", border: `1px solid ${C.purple || C.accent}`, color: C.purple || C.accent, padding: "8px 16px", opacity: scanProgress.phase ? 0.7 : 1 })}>
                <Ic d={I.ai} size={14} color={C.purple || C.accent} /> {scanProgress.phase ? `Scanning ${scanProgress.current}/${scanProgress.total}...` : "🔍 Scan Project"}
              </button>
            )}
            <button className="accent-btn" onClick={() => planFileRef.current?.click()} style={bt(C, { background: C.accent, color: "#fff", padding: "8px 16px" })}><Ic d={I.upload} size={14} color="#fff" sw={2.5} /> Upload Drawings</button>
            <input ref={planFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,image/*" multiple style={{ display: "none" }} onChange={e => { Array.from(e.target.files).forEach(f => handleDrawingUpload(f)); e.target.value = ""; }} />
          </div>
        </div>

        {/* Re-upload notice */}
        {drawings.length > 0 && drawings.some(d => !d.data) && (
          <div style={{ marginBottom: 12, padding: "8px 14px", background: "rgba(249,148,81,0.08)", borderRadius: 6, border: "1px solid rgba(249,148,81,0.25)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 11, color: C.orange }}><strong>{drawings.filter(d => !d.data).length} drawing(s)</strong> need files re-attached (file data is not stored between sessions to save space).</div>
            <button className="ghost-btn" onClick={() => planFileRef.current?.click()} style={bt(C, { background: "transparent", border: `1px solid ${C.orange}`, color: C.orange, padding: "4px 12px", fontSize: 10 })}><Ic d={I.upload} size={10} color={C.orange} /> Re-upload</button>
          </div>
        )}

        {/* Empty state */}
        {drawings.length === 0 && <div style={{ textAlign: "center", padding: 60, border: `1px dashed ${C.border}`, borderRadius: T.radius.md }}><div style={{ color: C.textMuted, fontSize: T.fontSize.base }}>No drawings yet. Upload PDFs or images.</div></div>}

        {/* Drawings table */}
        {drawings.length > 0 && (<>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", fontSize: 8, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: 48 }}>Preview</div>
            <div style={{ width: 100 }}>Sheet #</div>
            <div style={{ flex: 2, minWidth: 120 }}>Sheet Title</div>
            <div style={{ width: 110 }}>Scale</div>
            <div style={{ flex: 1, minWidth: 80 }}>Label</div>
            <div style={{ width: 40 }}>Rev</div>
            <div style={{ width: 60 }}>Uploaded</div>
            <div style={{ width: 50 }}></div>
          </div>
          {drawings.map(d => {
            const hasSheet = !!(d.sheetNumber || d.pageNumber);
            const hasData = !!d.data;
            return (
              <div key={d.id} className="row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderBottom: `1px solid ${C.bg2}`, opacity: hasData ? 1 : 0.6 }}>
                {/* Thumbnail */}
                <ReattachThumbnail d={d} hasData={hasData} C={C} pdfCanvases={pdfCanvases} setPreviewDrawingId={setPreviewDrawingId} renderPdfPage={renderPdfPage} reattachDrawingFile={reattachDrawingFile} />
                {/* Sheet # */}
                <div style={{ width: 100 }}><input value={d.sheetNumber || d.pageNumber || ""} onChange={e => updateDrawing(d.id, "sheetNumber", e.target.value)} placeholder="A-100.00" style={inp(C, { textAlign: "center", padding: "4px 6px", fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: hasSheet ? C.accent : C.textDim, background: hasSheet ? "transparent" : C.bg2 })} /></div>
                {/* Sheet Title */}
                <div style={{ flex: 2, minWidth: 120 }}><input value={d.sheetTitle || ""} onChange={e => updateDrawing(d.id, "sheetTitle", e.target.value)} placeholder="Sheet title..." style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 6px", fontSize: 12 })} /></div>
                {/* Scale */}
                <div style={{ width: 110 }}>
                  <select value={drawingScales[d.id] || ""} onChange={e => {
                    const val = e.target.value;
                    setDrawingScales({ ...useDrawingsStore.getState().drawingScales, [d.id]: val || undefined });
                    if (!val) {
                      // Remove key if cleared
                      const next = { ...useDrawingsStore.getState().drawingScales };
                      delete next[d.id];
                      setDrawingScales(next);
                    }
                  }} style={inp(C, { padding: "3px 4px", fontSize: 9, color: drawingScales[d.id] ? C.green : C.textDim, fontWeight: drawingScales[d.id] ? 600 : 400 })} title={d.detectedScale && !drawingScales[d.id] ? `AI detected: ${d.detectedScale}` : ""}>
                    <option value="">{d.detectedScale && !drawingScales[d.id] ? `? ${d.detectedScale}` : "No scale"}</option>
                    {SCALE_PRESETS.map(g => (
                      <optgroup key={g.group} label={g.group}>
                        {g.items.map(sc => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                {/* Label */}
                <div style={{ flex: 1, minWidth: 80 }}><input value={d.label} onChange={e => updateDrawing(d.id, "label", e.target.value)} placeholder="File label..." style={inp(C, { background: "transparent", border: "1px solid transparent", padding: "3px 6px", fontSize: 11, color: C.textMuted })} /></div>
                {/* Rev */}
                <div style={{ width: 40 }}><input value={d.revision} onChange={e => updateDrawing(d.id, "revision", e.target.value)} style={inp(C, { textAlign: "center", padding: "4px 4px", fontSize: 11, fontFamily: "'DM Mono',monospace" })} /></div>
                {/* Date */}
                <div style={{ width: 60, fontSize: 9, color: C.textDim }}>{d.uploadDate}</div>
                {/* Actions */}
                <div style={{ width: 50, display: "flex", gap: 2 }}>
                  <button className="icon-btn" onClick={() => { setPreviewDrawingId(d.id); if (d.type === "pdf") renderPdfPage(d); }} title="Preview" style={{ width: 22, height: 22, border: "none", background: "transparent", color: C.blue, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Ic d={I.layers} size={11} /></button>
                  <button className="icon-btn" onClick={() => removeDrawing(d.id)} title="Delete" style={{ width: 22, height: 22, border: "none", background: "transparent", color: C.red, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Ic d={I.trash} size={11} /></button>
                </div>
              </div>
            );
          })}

          {/* Smart Label Bar */}
          <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(91,141,239,0.06)", borderRadius: 6, border: "1px solid rgba(91,141,239,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 2 }}><Ic d={I.ai} size={14} color={C.blue} /> AI Detection Summary</div>
                <div style={{ fontSize: 10, color: C.textDim }}>
                  <strong>Auto Label All</strong> detects sheet numbers, titles &amp; drawing scales from title blocks.
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: drawings.filter(d => d.sheetNumber).length === drawings.length ? C.green : C.textMuted, fontWeight: 600 }}>{drawings.filter(d => d.sheetNumber).length}/{drawings.length} labeled</span>
                <span style={{ fontSize: 10, color: drawings.filter(d => drawingScales[d.id]).length === drawings.length ? C.green : C.textMuted, fontWeight: 600 }}>{drawings.filter(d => drawingScales[d.id]).length}/{drawings.length} scaled</span>
              </div>
            </div>
          </div>

          {/* Scan Progress Bar */}
          {scanProgress.phase && (
            <div style={{ marginTop: 12, padding: "10px 16px", background: "rgba(168,85,247,0.06)", borderRadius: 6, border: "1px solid rgba(168,85,247,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.purple || C.accent }}>
                  <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid rgba(168,85,247,0.3)", borderTop: `2px solid ${C.purple || C.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 6, verticalAlign: "middle" }} />
                  {scanProgress.message}
                </div>
                <span style={{ fontSize: 10, color: C.textDim }}>{scanProgress.phase === "detect" ? "Phase 1/3" : scanProgress.phase === "parse" ? "Phase 2/3" : "Phase 3/3"}</span>
              </div>
              <div style={{ height: 4, background: C.bg2, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  background: `linear-gradient(90deg, ${C.purple || C.accent}, ${C.accent})`,
                  borderRadius: 2,
                  transition: "width 0.3s ease",
                  width: scanProgress.total > 0 ? `${Math.round((scanProgress.current / scanProgress.total) * 100)}%` : "0%",
                }} />
              </div>
            </div>
          )}

          {/* Scan Error */}
          {scanError && (
            <div style={{ marginTop: 12, padding: "10px 16px", background: "rgba(239,68,68,0.06)", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)", fontSize: 11, color: C.red }}>
              <strong>Scan Error:</strong> {scanError}
              <button onClick={clearScan} style={{ marginLeft: 8, background: "transparent", border: "none", color: C.red, textDecoration: "underline", cursor: "pointer", fontSize: 10 }}>Dismiss</button>
            </div>
          )}

          {/* Scan Results Card */}
          {scanResults && !scanProgress.phase && (
            <div style={{ marginTop: 12, padding: "12px 16px", background: "rgba(168,85,247,0.06)", borderRadius: 6, border: "1px solid rgba(168,85,247,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.purple || C.accent, marginBottom: 2 }}>
                    <Ic d={I.ai} size={14} color={C.purple || C.accent} /> Scan Complete
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim }}>
                    {scanResults.schedules?.length || 0} schedule{scanResults.schedules?.length !== 1 ? "s" : ""} found
                    {" · "}{scanResults.lineItems?.length || 0} line items generated
                    {scanResults.rom?.totals ? ` · ROM: $${Math.round(scanResults.rom.totals.low).toLocaleString()} – $${Math.round(scanResults.rom.totals.high).toLocaleString()}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setShowScanModal(true)} style={bt(C, { background: C.purple || C.accent, color: "#fff", padding: "6px 14px", fontSize: 10, fontWeight: 600 })}>View Results</button>
                  <button onClick={clearScan} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "6px 10px", fontSize: 10 })}>Clear</button>
                </div>
              </div>
            </div>
          )}
        </>)}

        </>}

        {/* ═══ SPECIFICATIONS ═══ */}
        {planTab === "specs" && <>
        <div style={{ marginTop: T.space[5], padding: `${T.space[4]}px ${T.space[5]}px`, background: C.bg1, borderRadius: T.radius.md, border: `1px solid ${C.border}`, boxShadow: T.shadow.sm }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[3], flexWrap: "wrap", gap: T.space[2] }}>
            <div>
              <div style={{ fontSize: T.fontSize.md, fontWeight: T.fontWeight.bold, color: C.purple, display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <Ic d={I.layers} size={16} color={C.purple} /> Specifications
              </div>
              <div style={{ fontSize: 10, color: C.textMuted }}>Upload a spec book PDF to auto-parse CSI sections, or add sections manually. Tracks allocation against your estimate scope.</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button className="accent-btn" onClick={() => document.getElementById("spec-upload")?.click()} disabled={specParseLoading}
                style={bt(C, { background: specParseLoading ? C.bg3 : C.purple, color: specParseLoading ? C.textDim : "#fff", padding: "7px 14px", fontSize: 11 })}>
                {specParseLoading ? <><span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #fff3", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 6 }} /> Parsing...</>
                  : <><Ic d={I.upload} size={12} color="#fff" sw={2} /> Upload Spec Book</>}
              </button>
              <input id="spec-upload" type="file" accept=".pdf" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) uploadSpecBook(e.target.files[0]); e.target.value = ""; }} />
              <button onClick={addManualSpec} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "6px 12px", fontSize: 10 })}>+ Add Section</button>
            </div>
          </div>

          {specPdf && <div style={{ fontSize: 10, color: C.green, fontWeight: 500, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
            <Ic d={I.check} size={11} color={C.green} /> {specPdf.name}
            <button onClick={() => {}} style={bt(C, { background: "transparent", border: `1px solid ${C.purple}40`, color: C.purple, padding: "2px 8px", fontSize: 8, marginLeft: 6 })}>Open Spec Book</button>
          </div>}

          {specs.length > 0 ? (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 50px 28px", padding: "5px 8px", fontSize: 8, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.7, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
                <div>Section</div><div>Title / Summary</div><div>Status</div><div />
              </div>
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {specs.map(sp => {
                  const allocated = items.some(i => i.specSection === sp.section);
                  return (
                    <div key={sp.id} style={{ display: "grid", gridTemplateColumns: "90px 1fr 50px 28px", padding: "4px 8px", borderBottom: `1px solid ${C.bg2}`, alignItems: "center", background: allocated ? "rgba(22,163,74,0.04)" : "transparent" }}>
                      <input value={sp.section} onChange={e => updateSpec(sp.id, "section", e.target.value)} placeholder="XX XX XX" style={inp(C, { fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 600, color: C.purple, background: "transparent", border: "1px solid transparent", padding: "2px 4px" })} />
                      <div>
                        <input value={sp.title} onChange={e => updateSpec(sp.id, "title", e.target.value)} placeholder="Section title..." style={inp(C, { fontSize: 10, fontWeight: 500, background: "transparent", border: "1px solid transparent", padding: "2px 4px" })} />
                        <input value={sp.summary || ""} onChange={e => updateSpec(sp.id, "summary", e.target.value)} placeholder="Key requirements, products, manufacturers..." style={inp(C, { fontSize: 8, color: C.textMuted, background: "transparent", border: "1px solid transparent", padding: "1px 4px" })} />
                      </div>
                      <div style={{ textAlign: "center" }}>
                        {allocated ? <span style={{ fontSize: 7, fontWeight: 700, color: C.green, background: "rgba(22,163,74,0.1)", padding: "2px 5px", borderRadius: 3 }}>✓</span>
                          : <span style={{ fontSize: 7, fontWeight: 600, color: C.orange, background: "rgba(234,88,12,0.08)", padding: "2px 5px", borderRadius: 3 }}>GAP</span>}
                      </div>
                      <button onClick={() => removeSpec(sp.id)} style={{ width: 18, height: 18, border: "none", background: "transparent", color: C.red, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Ic d={I.trash} size={8} /></button>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const allocSet = getSpecAllocation();
                const gaps = specs.filter(sp => !allocSet.has(sp.section));
                return gaps.length > 0 && <div style={{ padding: "6px 10px", background: "rgba(234,88,12,0.05)", borderTop: `1px solid ${C.border}`, fontSize: 9, color: C.orange, fontWeight: 500 }}>
                  {gaps.length} unallocated spec section{gaps.length > 1 ? "s" : ""} — add scope items to cover {gaps.length > 1 ? "them" : "it"}
                </div>;
              })()}
            </div>
          ) : <div style={{ padding: 20, textAlign: "center", border: `1px dashed ${C.border}`, borderRadius: 6, color: C.textDim, fontSize: 11 }}>No specifications yet. Upload a spec book PDF or add sections manually.</div>}

          {/* Spec-to-Estimate Mapper */}
          {specs.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={generateEstimateFromSpecs} disabled={specMapLoading || !apiKey}
                style={bt(C, {
                  background: specMapLoading ? C.bg3 : `linear-gradient(135deg, ${C.accent}, ${C.purple || C.accent})`,
                  color: specMapLoading ? C.textDim : "#fff",
                  padding: "8px 16px", fontSize: 11, fontWeight: 600,
                  boxShadow: specMapLoading ? "none" : `0 2px 8px ${C.accent}30`,
                })}>
                {specMapLoading ? <><span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #fff3", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 6 }} /> Analyzing Specs...</>
                  : <><Ic d={I.ai} size={13} color="#fff" sw={2} /> Generate Estimate from Specs</>}
              </button>
              {!apiKey && <span style={{ fontSize: 9, color: C.orange }}>Add API key in Settings</span>}
            </div>
          )}

          {/* Spec Map Results */}
          {specMapResults && (
            <div style={{ marginTop: 12, border: `1px solid ${C.accent}30`, borderRadius: 8, overflow: "hidden", background: `${C.accent}04` }}>
              <div style={{ padding: "8px 12px", background: `${C.accent}10`, borderBottom: `1px solid ${C.accent}20`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>
                  <Ic d={I.ai} size={12} color={C.accent} /> AI-Suggested Estimate Items
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={applyAllSpecMapItems}
                    style={bt(C, { background: C.green, color: "#fff", padding: "4px 12px", fontSize: 9, fontWeight: 600 })}>
                    Add All to Estimate
                  </button>
                  <button onClick={() => setSpecMapResults(null)}
                    style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "4px 8px", fontSize: 9 })}>
                    Dismiss
                  </button>
                </div>
              </div>
              <div style={{ maxHeight: 400, overflowY: "auto" }}>
                {specMapResults.map((sec, si) => (
                  <div key={si} style={{ borderBottom: si < specMapResults.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ padding: "6px 12px", background: `${C.text}04`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.purple, fontFamily: "'DM Mono',monospace" }}>{sec.section}</span>
                      <button onClick={() => applySpecMapItems(sec.items || [])}
                        style={bt(C, { background: `${C.green}15`, border: `1px solid ${C.green}30`, color: C.green, padding: "2px 8px", fontSize: 8, fontWeight: 600 })}>
                        + Add {(sec.items || []).length} items
                      </button>
                    </div>
                    {(sec.items || []).map((item, ii) => (
                      <div key={ii} style={{ padding: "3px 12px 3px 24px", fontSize: 10, color: C.text, display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, color: C.textDim, minWidth: 70 }}>{item.code}</span>
                        <span style={{ flex: 1 }}>{item.description}</span>
                        <span style={{ fontSize: 8, color: C.textMuted, fontWeight: 600 }}>{item.unit}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        </>}

        {/* ═══ NEXT STEPS ═══ */}
        {estId && (
          <div style={{ marginTop: T.space[5], padding: `${T.space[4]}px ${T.space[5]}px`, background: `linear-gradient(135deg, ${C.bg1}, ${C.bg})`, borderRadius: T.radius.md, border: `1px solid ${C.border}`, boxShadow: T.shadow.sm }}>
            <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.textMuted, textTransform: "uppercase", letterSpacing: T.tracking.wide, marginBottom: T.space[3] }}>Next Steps</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button onClick={() => navigate(`/estimate/${estId}/takeoffs`)}
                style={bt(C, { background: C.accent, color: "#fff", padding: "10px 20px", fontSize: 12, fontWeight: 600, flex: 1, minWidth: 180 })}>
                <Ic d={I.layers} size={15} color="#fff" sw={2} /> Start Takeoffs
                <span style={{ display: "block", fontSize: 9, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>Measure quantities from your drawings</span>
              </button>
              <button onClick={() => navigate(`/estimate/${estId}/estimate`)}
                style={bt(C, { background: "transparent", border: `1px solid ${C.accent}`, color: C.accent, padding: "10px 20px", fontSize: 12, fontWeight: 600, flex: 1, minWidth: 180 })}>
                <Ic d={I.edit} size={15} color={C.accent} sw={2} /> Build Estimate
                <span style={{ display: "block", fontSize: 9, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>Add line items and pricing</span>
              </button>
              <button onClick={() => navigate(`/estimate/${estId}/info`)}
                style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "10px 20px", fontSize: 12, fontWeight: 500, flex: 1, minWidth: 180 })}>
                <Ic d={I.settings} size={15} color={C.textMuted} sw={2} /> Project Info
                <span style={{ display: "block", fontSize: 9, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>Edit project details &amp; dates</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scan Results Modal */}
      {showScanModal && scanResults && (
        <ScanResultsModal
          scanResults={scanResults}
          onClose={() => setShowScanModal(false)}
          onApplyToEstimate={handleApplyToEstimate}
          onSaveOnly={handleSaveScanOnly}
        />
      )}
    </div>
  );
}

// Thumbnail sub-component with its own reattach ref
function ReattachThumbnail({ d, hasData, C, pdfCanvases, setPreviewDrawingId, renderPdfPage, reattachDrawingFile }) {
  const reattachRef = useRef(null);
  return (
    <div onClick={() => { if (hasData) { setPreviewDrawingId(d.id); if (d.type === "pdf") renderPdfPage(d); } else reattachRef.current?.click(); }}
      style={{ width: 48, height: 34, borderRadius: 3, overflow: "hidden", cursor: "pointer", background: hasData ? C.bg2 : "rgba(249,148,81,0.1)", border: `1px solid ${hasData ? C.border : C.orange}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {!hasData ? <span style={{ fontSize: 6, color: C.orange, fontWeight: 700 }}>RE-UPLOAD</span> :
        d.type === "image" ? <img src={d.data} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
          pdfCanvases[d.id] ? <img src={pdfCanvases[d.id]} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> :
            <span style={{ fontSize: 7, color: C.textDim }} onClick={e => { e.stopPropagation(); renderPdfPage(d); }}>PDF</span>}
      <input ref={reattachRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) reattachDrawingFile(d.id, e.target.files[0]); e.target.value = ""; }} />
    </div>
  );
}
