import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useDocumentsStore } from "@/stores/documentsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useUiStore } from "@/stores/uiStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useScanStore } from "@/stores/scanStore";
import { useNovaStore } from "@/stores/novaStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";
import { uid, nowStr } from "@/utils/format";
import {
  callAnthropic,
  batchAI,
  optimizeImageForAI,
  imageBlock,
  buildProjectContext,
  runOCR,
  segmentedOCR,
} from "@/utils/ai";
import { loadPdfJs } from "@/utils/pdf";
import { buildDetectionPrompt, buildParsePrompt, normalizeScheduleData, SCHEDULE_TYPES } from "@/utils/scheduleParsers";
import {
  generateBaselineROM,
  generateScheduleLineItems,
  augmentROMWithAI,
  estimateProjectSF,
  extractBuildingParamsFromSchedules,
} from "@/utils/romEngine";
import { extractDrawingNotes, buildNotesContext } from "@/utils/notesExtractor";
import { arrayBufferToBase64, matchScaleKey, renderPdfPage, classifyFile, isDuplicateFile } from "@/utils/drawingUtils";
import { detectBuildingOutline, outlineToFeet, computePolygonArea } from "@/utils/outlineDetector";
import { useModelStore } from "@/stores/modelStore";
import { runFullScan } from "@/utils/scanRunner";
import ScanResultsModal from "@/components/planroom/ScanResultsModal";
import NovaOrb from "@/components/dashboard/NovaOrb";
import NovaSceneLazy from "@/components/nova/NovaSceneLazy";
import EmptyState from "@/components/shared/EmptyState";

// ─── Status badge component ──────────────────────────────────────────────────
function StatusBadge({ status, message, C, T }) {
  const colors = {
    pending: { bg: `${C.textDim}10`, text: C.textDim, label: "Queued" },
    processing: { bg: `${C.blue}12`, text: C.blue, label: message || "Processing..." },
    complete: { bg: `${C.green}12`, text: C.green, label: message || "Complete" },
    error: { bg: `${C.red}12`, text: C.red, label: message || "Error" },
  };
  const c = colors[status] || colors.pending;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: T.radius.full,
        background: c.bg,
        fontSize: 10,
        fontWeight: 600,
        color: c.text,
        maxWidth: 200,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {status === "processing" && (
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            border: `2px solid ${c.text}40`,
            borderTop: `2px solid ${c.text}`,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      )}
      {status === "complete" && <Ic d={I.check} size={10} color={c.text} />}
      {c.label}
    </div>
  );
}

// ─── Type badge component ────────────────────────────────────────────────────
function TypeBadge({ docType, C, T }) {
  const types = {
    drawing: { bg: `${C.blue}12`, text: C.blue, label: "Drawing", icon: I.layers },
    specification: { bg: `${C.purple || C.accent}12`, text: C.purple || C.accent, label: "Spec", icon: I.plans },
    general: { bg: `${C.textMuted}10`, text: C.textMuted, label: "Document", icon: I.folder },
  };
  const t = types[docType] || types.general;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: T.radius.full,
        background: t.bg,
        fontSize: 10,
        fontWeight: 600,
        color: t.text,
      }}
    >
      <Ic d={t.icon} size={10} color={t.text} />
      {t.label}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ═══════════════════════════════════════════════════════════════════════════════
// DocumentsPage — Central upload hub with auto-processing pipeline
// ═══════════════════════════════════════════════════════════════════════════════
export default function DocumentsPage() {
  const C = useTheme();
  const T = C.T;
  const showToast = useUiStore(s => s.showToast);

  // Documents store
  const documents = useDocumentsStore(s => s.documents);
  const addDocument = useDocumentsStore(s => s.addDocument);
  const updateDocument = useDocumentsStore(s => s.updateDocument);
  const removeDocument = useDocumentsStore(s => s.removeDocument);

  // Drawings store
  const drawings = useDrawingsStore(s => s.drawings);
  const setDrawings = useDrawingsStore(s => s.setDrawings);
  const updateDrawing = useDrawingsStore(s => s.updateDrawing);
  const setDrawingScales = useDrawingsStore(s => s.setDrawingScales);
  const setAiLabelLoading = useDrawingsStore(s => s.setAiLabelLoading);
  const setAutoLabelProgress = useDrawingsStore(s => s.setAutoLabelProgress);

  // Specs store
  const specs = useSpecsStore(s => s.specs);
  const setSpecs = useSpecsStore(s => s.setSpecs);
  const setSpecPdf = useSpecsStore(s => s.setSpecPdf);
  const addClarification = useSpecsStore(s => s.addClarification);

  // Scan store
  const scanResults = useScanStore(s => s.scanResults);
  const setScanResults = useScanStore(s => s.setScanResults);
  const setScanProgress = useScanStore(s => s.setScanProgress);
  const setScanError = useScanStore(s => s.setScanError);
  const clearScan = useScanStore(s => s.clearScan);

  // Project store
  const project = useProjectStore(s => s.project);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const addElement = useItemsStore(s => s.addElement);
  const items = useItemsStore(s => s.items);

  // Documents store extras
  const tagPalette = useDocumentsStore(s => s.tagPalette);
  const transmittals = useDocumentsStore(s => s.transmittals);
  const toggleDocTag = useDocumentsStore(s => s.toggleDocTag);
  const addTag = useDocumentsStore(s => s.addTag);
  const moveToFolder = useDocumentsStore(s => s.moveToFolder);
  const addTransmittal = useDocumentsStore(s => s.addTransmittal);

  // Local state
  const [dragOver, setDragOver] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [docSearch, setDocSearch] = useState("");
  const [docFolderFilter, setDocFolderFilter] = useState(""); // "" = all
  const [showTransmittalLog, setShowTransmittalLog] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  // Setup mode: new estimate that hasn't uploaded docs yet
  const isSetupMode = project.setupComplete === false;

  const API_BASE = import.meta.env.DEV ? "https://app-nova-42373ca7.vercel.app" : "";

  // Recovery: if a document has been "processing" for >5 minutes, mark it as stale
  useEffect(() => {
    const interval = setInterval(() => {
      const docs = useDocumentsStore.getState().documents;
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      docs.forEach(d => {
        if (d.processingStatus === "processing" && d.uploadDate) {
          const uploadTime = new Date(d.uploadDate).getTime();
          if (uploadTime < fiveMinAgo) {
            useDocumentsStore.getState().updateDocument(d.id, {
              processingStatus: "complete",
              processingMessage: d.processingMessage ? `${d.processingMessage} (timed out)` : "Processing timed out",
            });
          }
        }
      });
    }, 60000); // check every minute
    return () => clearInterval(interval);
  }, []);

  // ─── Drawing PDF extraction ─────────────────────────────────────────────
  const extractDrawingPages = useCallback(async file => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      // Image file — single drawing
      const data = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const d = {
        id: uid(),
        label: file.name.replace(/\.[^.]+$/, ""),
        sheetNumber: "",
        sheetTitle: "",
        revision: "0",
        type: "image",
        data,
        fileName: file.name,
        uploadDate: nowStr(),
        pdfPage: null,
        totalPdfPages: null,
      };
      const cur = useDrawingsStore.getState().drawings;
      useDrawingsStore.getState().setDrawings([...cur, d]);
      return [d.id];
    }

    // PDF file — extract all pages
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    await loadPdfJs();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const newDrawings = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      newDrawings.push({
        id: uid(),
        label: `${file.name.replace(/\.pdf$/i, "")}-Pg${p}`,
        sheetNumber: "",
        sheetTitle: "",
        revision: "0",
        type: "pdf",
        data: base64,
        fileName: file.name,
        uploadDate: nowStr(),
        pdfPage: p,
        totalPdfPages: pdf.numPages,
      });
    }
    const cur = useDrawingsStore.getState().drawings;
    useDrawingsStore.getState().setDrawings([...cur, ...newDrawings]);
    // Pre-render thumbnails
    newDrawings.forEach(d => renderPdfPage(d));
    return newDrawings.map(d => d.id);
  }, []);

  // ─── Auto-label drawings ────────────────────────────────────────────────
  const autoLabelDrawings = useCallback(
    async drawingIds => {
      const allDrawings = useDrawingsStore.getState().drawings;
      const curScales = useDrawingsStore.getState().drawingScales;
      const targets = drawingIds
        ? allDrawings.filter(d => drawingIds.includes(d.id) && d.data)
        : allDrawings.filter(d => d.data && (!d.sheetNumber || !d.sheetTitle || !curScales[d.id]));

      if (targets.length === 0) return;

      setAiLabelLoading(true);
      setAutoLabelProgress({ current: 0, total: targets.length });
      useNovaStore.getState().startTask("label", `Labeling ${targets.length} drawings...`);

      let count = 0,
        scaleCount = 0,
        failCount = 0,
        lastErr = "";

      let metadataExtracted = false;

      for (let i = 0; i < targets.length; i++) {
        const d = targets[i];
        setAutoLabelProgress({ current: i + 1, total: targets.length });
        useNovaStore
          .getState()
          .updateProgress(Math.round(((i + 1) / targets.length) * 100), `Labeling sheet ${i + 1}/${targets.length}...`);
        try {
          let imgData;
          const curCanvases = useDrawingsStore.getState().pdfCanvases;
          if (d.type === "pdf") {
            imgData = curCanvases[d.id] || (await renderPdfPage(d));
          } else {
            imgData = d.data;
          }
          if (!imgData) continue;

          // For the first drawing, use an enhanced prompt that also extracts project metadata
          const isFirstSheet = i === 0 && !metadataExtracted;
          const labelPrompt = isFirstSheet
            ? `This is a construction blueprint/drawing. Look at the title block (usually bottom-right corner) and anywhere on the drawing for scale information.\n\nFind and return:\n1. Sheet number — usually formatted like A-100, A-100.00, S-201, M-001, E-100, L-001, etc.\n2. Sheet title — the drawing name like "FIRST FLOOR PLAN", "FOUNDATION PLAN", etc.\n3. Scale — the drawing scale, written exactly as shown on the drawing (e.g. 1/4" = 1'-0", 1/8" = 1'-0", 1" = 20', 1:100, etc.). Look in the title block, scale bar, or near individual plan views. If multiple scales are shown, use the primary/plan scale (usually the largest view).\n\nALSO extract project-level information from the title block:\n4. Project name — the full project name\n5. Architect — the architect or design firm name\n6. Client/Owner — the client or owner name\n7. Address — the project street address, city, state\n8. Project number — the project number or job number\n9. Engineer — the structural or MEP engineer firm name\n\nReturn ONLY a JSON object like: {"number":"A-100.00","title":"FIRST FLOOR PLAN","scale":"1/4\\" = 1'-0\\"","projectName":"RIVERSIDE APARTMENTS","architect":"Smith & Associates Architects","client":"ABC Development Corp","address":"123 Main St, Portland, OR 97201","projectNumber":"2024-0156","engineer":"XYZ Engineering"}\nIf you can't read a field, use null for that field.`
            : `This is a construction blueprint/drawing. Look at the title block (usually bottom-right corner) and anywhere on the drawing for scale information.\n\nFind and return:\n1. Sheet number — usually formatted like A-100, A-100.00, S-201, M-001, E-100, L-001, etc.\n2. Sheet title — the drawing name like "FIRST FLOOR PLAN", "FOUNDATION PLAN", etc.\n3. Scale — the drawing scale, written exactly as shown on the drawing (e.g. 1/4" = 1'-0", 1/8" = 1'-0", 1" = 20', 1:100, etc.). Look in the title block, scale bar, or near individual plan views. If multiple scales are shown, use the primary/plan scale (usually the largest view).\n\nReturn ONLY a JSON object like: {"number":"A-100.00","title":"FIRST FLOOR PLAN","scale":"1/4\\" = 1'-0\\""}\nIf you can't read a field, use null for that field.`;

          const optimized = await optimizeImageForAI(imgData, 1200);
          const text = await callAnthropic({
            max_tokens: isFirstSheet ? 600 : 300,
            messages: [
              {
                role: "user",
                content: [
                  { type: "image", source: { type: "base64", media_type: "image/jpeg", data: optimized.base64 } },
                  { type: "text", text: labelPrompt },
                ],
              },
            ],
          });

          failCount = 0;
          try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("No JSON");
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.number && !d.sheetNumber) {
              updateDrawing(d.id, "sheetNumber", parsed.number);
              count++;
            }
            if (parsed.title && !d.sheetTitle) {
              updateDrawing(d.id, "sheetTitle", parsed.title);
              count++;
            }
            if (parsed.scale) {
              const scaleKey = matchScaleKey(parsed.scale);
              const latestScales = useDrawingsStore.getState().drawingScales;
              if (scaleKey && !latestScales[d.id]) {
                useDrawingsStore.getState().setDrawingScales({ ...latestScales, [d.id]: scaleKey });
                scaleCount++;
              } else if (!scaleKey) {
                updateDrawing(d.id, "detectedScale", parsed.scale);
              }
            }

            // Phase 1: Extract project metadata from first drawing's title block
            if (isFirstSheet) {
              metadataExtracted = true;
              try {
                const proj = useProjectStore.getState().project;
                const updates = {};
                const detected = { ...(proj.autoDetected || {}) };
                let metaCount = 0;

                if (parsed.projectName && (!proj.name || proj.name === "New Estimate")) {
                  updates.name = parsed.projectName;
                  detected.name = true;
                  metaCount++;
                }
                if (parsed.architect && !proj.architect) {
                  updates.architect = parsed.architect;
                  detected.architect = true;
                  metaCount++;
                }
                if (parsed.client && !proj.client) {
                  updates.client = parsed.client;
                  detected.client = true;
                  metaCount++;
                }
                if (parsed.address && !proj.address) {
                  updates.address = parsed.address;
                  detected.address = true;
                  metaCount++;
                }
                if (parsed.projectNumber && !proj.projectNumber) {
                  updates.projectNumber = parsed.projectNumber;
                  detected.projectNumber = true;
                  metaCount++;
                }
                if (parsed.engineer && !proj.engineer) {
                  updates.engineer = parsed.engineer;
                  detected.engineer = true;
                  metaCount++;
                }

                if (metaCount > 0) {
                  updates.autoDetected = detected;
                  useProjectStore.getState().setProject({ ...useProjectStore.getState().project, ...updates });
                  // Update the estimate index entry with detected name/client
                  try {
                    const estId = useEstimatesStore.getState().activeEstimateId;
                    if (estId) {
                      const indexUpdates = {};
                      if (updates.name) indexUpdates.name = updates.name;
                      if (updates.client) indexUpdates.client = updates.client;
                      if (updates.architect) indexUpdates.architect = updates.architect;
                      useEstimatesStore.getState().updateIndexEntry(estId, indexUpdates);
                    }
                  } catch {
                    /* non-critical */
                  }
                }
              } catch {
                /* metadata extraction non-critical */
              }
            }
          } catch {
            /* parse failed */
          }
        } catch (e) {
          failCount++;
          lastErr = e.message || "Unknown error";
          if (failCount >= 3) break;
        }
      }

      if (failCount >= 3) {
        useNovaStore.getState().failTask(lastErr);
        useNovaStore.getState().notify(`Labeling failed: ${lastErr}`, "warn");
      } else {
        const parts = [];
        if (count > 0) parts.push(`${count} labels`);
        if (scaleCount > 0) parts.push(`${scaleCount} scales`);
        const resultMsg = parts.length > 0 ? `Detected ${parts.join(" & ")}` : `Processed ${targets.length} sheets`;
        useNovaStore.getState().completeTask(resultMsg);
        useNovaStore.getState().notify(resultMsg, "success");
      }
      // ── Post-label: infer building params from sheet TITLES only ──
      // IMPORTANT: Sheet numbers (A-201, A-301) do NOT mean floor 2, floor 3.
      // A-2XX = elevations, A-3XX = sections, A-4XX = details. Only TITLES are reliable.
      try {
        const labeledDrawings = useDrawingsStore.getState().drawings;
        const proj = useProjectStore.getState().project;

        // 1) Infer floor count ONLY from sheet titles that explicitly name floor plans
        if (!proj.floorCount || parseInt(proj.floorCount) === 0) {
          const floorPlanTitles = []; // { floor: number, title: string }
          let hasBasement = false;
          let hasLoft = false;
          let hasMezzanine = false;

          labeledDrawings.forEach(d => {
            const title = (d.sheetTitle || "").toLowerCase();
            // Only match titles that are clearly FLOOR PLANS (not elevations, sections, details)
            const isPlan =
              /\bplan\b/i.test(title) ||
              /\bfloor\b/i.test(title) ||
              /\blevel\b/i.test(title) ||
              /\blayout\b/i.test(title);
            // Exclude non-plan sheets
            const isExcluded =
              /\b(elevation|section|detail|schedule|note|diagram|spec|roof\s*plan|site\s*plan|framing|foundation|reflected|ceiling)\b/i.test(
                title,
              );
            if (!isPlan || isExcluded) return;

            // Named floor plans
            if (/\b(first|1st|ground|main)\s*(fl|floor|level|plan)\b/i.test(title))
              floorPlanTitles.push({ floor: 1, title });
            else if (/\b(second|2nd|upper)\s*(fl|floor|level|plan)\b/i.test(title))
              floorPlanTitles.push({ floor: 2, title });
            else if (/\b(third|3rd)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 3, title });
            else if (/\b(fourth|4th)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 4, title });
            else if (/\b(fifth|5th)\s*(fl|floor|level|plan)\b/i.test(title)) floorPlanTitles.push({ floor: 5, title });
            // Numbered floor plans (e.g., "Floor 2 Plan", "Level 3")
            else {
              const numMatch = title.match(/(?:floor|level|fl)\s*(\d+)/i);
              if (numMatch) floorPlanTitles.push({ floor: parseInt(numMatch[1]), title });
            }

            // Sub-levels detected from titles
            if (/\b(basement|lower\s*level|sub\s*grade|below\s*grade)\b/i.test(title) && /\bplan\b/i.test(title))
              hasBasement = true;
            if (/\bloft\b/i.test(title)) hasLoft = true;
            if (/\bmezzanine\b/i.test(title)) hasMezzanine = true;
          });

          // Deduplicate floor numbers
          const uniqueFloors = [...new Set(floorPlanTitles.map(f => f.floor))].sort((a, b) => a - b);
          const maxFloor = uniqueFloors.length > 0 ? Math.max(...uniqueFloors) : 0;

          if (maxFloor > 0) {
            const floors = [];
            if (hasBasement) floors.push({ label: "Basement", height: 10 });
            for (let i = 1; i <= maxFloor; i++) floors.push({ label: `Floor ${i}`, height: 10 });
            if (hasLoft) floors.push({ label: "Loft", height: 8 });
            if (hasMezzanine) floors.push({ label: "Mezzanine", height: 10 });
            const updates = {
              floorCount: String(maxFloor + (hasLoft ? 0.5 : 0) + (hasMezzanine ? 0.5 : 0)),
              basementCount: hasBasement ? "1" : "",
              floors,
              autoDetected: { ...(proj.autoDetected || {}), floorCount: true },
            };
            useProjectStore.getState().setProject({ ...useProjectStore.getState().project, ...updates });
          }
        }

        // 2) Auto-extract zip code from detected address
        if (proj.address && (!proj.zipCode || proj.zipCode.length < 5)) {
          const zipMatch = proj.address.match(/\b(\d{5})(?:-\d{4})?\b/);
          if (zipMatch) {
            useProjectStore.getState().setProject({
              ...useProjectStore.getState().project,
              zipCode: zipMatch[1],
              autoDetected: { ...(useProjectStore.getState().project.autoDetected || {}), zipCode: true },
            });
          }
        }
      } catch {
        /* terrain inference non-critical */
      }

      setAiLabelLoading(false);
      setAutoLabelProgress(null);
      return { count, scaleCount };
    },
    [updateDrawing, setAiLabelLoading, setAutoLabelProgress],
  );

  // ─── Auto-scan drawings (full NOVA scan pipeline — delegated to shared scanRunner) ──
  const autoScanDrawings = useCallback(async () => {
    await runFullScan({
      onComplete: () => setShowScanModal(true),
    });
  }, []);

  // ─── AI Building Analysis — extract terrain from floor plans ────────────
  const aiBuildingAnalysis = useCallback(async () => {
    const allDrawings = useDrawingsStore.getState().drawings;
    // Find floor plan drawings by title — the AI will read actual rooms/spaces
    const planPatterns = [
      /floor\s*plan/i,
      /main\s*(level|floor)/i,
      /first\s*floor/i,
      /1st\s*floor/i,
      /ground\s*(floor|plan)/i,
      /plan\s*view/i,
    ];
    const floorPlans = allDrawings.filter(d => {
      if (!d.data) return false;
      const label = `${d.sheetTitle || ""} ${d.label || ""}`;
      return planPatterns.some(p => p.test(label));
    });

    // Also try any sheet with "plan" in title if nothing matched
    if (floorPlans.length === 0) {
      const fallback = allDrawings.filter(
        d =>
          d.data &&
          /\bplan\b/i.test(d.sheetTitle || "") &&
          !/\b(site|roof|framing|foundation|reflected|ceiling|demolition)\b/i.test(d.sheetTitle || ""),
      );
      floorPlans.push(...fallback);
    }

    if (floorPlans.length === 0) return;

    // Use up to 2 floor plan images for analysis
    const targets = floorPlans.slice(0, 2);
    useNovaStore.getState().startTask("analyze", "Analyzing building from floor plans...");

    try {
      const imageContents = [];
      for (const d of targets) {
        let imgData;
        const curCanvases = useDrawingsStore.getState().pdfCanvases;
        if (d.type === "pdf") {
          imgData = curCanvases[d.id] || (await renderPdfPage(d));
        } else {
          imgData = d.data;
        }
        if (!imgData) continue;
        const optimized = await optimizeImageForAI(imgData, 1600);
        imageContents.push(imageBlock(optimized.base64));
        imageContents.push({
          type: "text",
          text: `(Sheet: ${d.sheetNumber || "?"} — ${d.sheetTitle || d.label || "Floor Plan"})`,
        });
      }

      if (imageContents.length === 0) {
        useNovaStore.getState().completeTask("No plans to analyze");
        return;
      }

      const analysisPrompt = `You are analyzing construction floor plan drawings. Identify rooms by their ARCHITECTURAL SYMBOLS AND FIXTURES, not just labels.

1. **Floor count**: How many above-grade floors? Count ONLY actual living/occupiable floors. A loft = 0.5. Do NOT count roof, attic, crawl space, section views, or elevation views.
2. **Basement**: Is there a below-grade habitable/utility level shown as its own floor plan? (true/false). Foundation plans and crawl spaces are NOT basements.
3. **Room counts**: Identify rooms by their fixture symbols and spatial patterns:

   BATHROOMS — look for ANY of these fixture symbols:
   • Toilet/WC (oval or rounded rectangle against wall)
   • Bathtub (5' rectangle, usually against wall)
   • Shower (square/rectangle with diagonal lines, drain dot, or shower head symbol)
   • Lavatory/sink (small oval or rectangle on countertop or pedestal)
   → Any enclosed or semi-enclosed space with a toilet = 1 bathroom. Count EACH separately.
   → A half bath/powder room has only toilet + sink (no tub/shower). Still counts as 1 bathroom.

   KITCHENS — look for ANY of these patterns:
   • Counter/cabinet runs (L-shaped or U-shaped lines along walls with sink symbol)
   • Appliance symbols: range/oven (rectangle with burner circles), refrigerator (rectangle), dishwasher (rectangle next to sink)
   • Kitchen sink (typically larger than lavatory, set in counter run)
   → In open floor plans, the kitchen area shares space with living/dining — still count 1 kitchen if appliance/cabinet symbols exist.

   STAIRCASES — look for:
   • Parallel lines (treads/risers) in a narrow rectangular zone
   • Arrow indicating "UP" or "DN" direction
   • Break line (diagonal or zigzag) indicating continuation to another floor
   → A staircase may appear on multiple floor plans — count the PHYSICAL staircase once, not per floor.

   LAUNDRY — look for:
   • Washer/dryer symbols (two circles or two squares side by side)
   • Utility sink (rectangle in small room near washer symbols)

   Also count: Bedrooms, Living/family rooms, Offices/studies, Closets (walk-in only), Garage spaces, Storage/utility rooms, Dining rooms.

4. **Building type**: residential, commercial, industrial, mixed-use, etc.
5. **Notable features**: loft, open floor plan, vaulted/cathedral ceiling, etc.

CRITICAL RULES:
- A split-level with a loft is 1.5-2 floors, NOT more.
- Cathedral/vaulted ceilings are double-height spaces, NOT separate floors.
- Only mark hasBasement=true for actual below-grade levels with their own floor plan.
- When in doubt about a fixture, count it — overcounting is better than undercounting.

Return ONLY a JSON object:
{"floors":2,"hasBasement":false,"hasLoft":true,"rooms":{"bathrooms":3,"kitchens":1,"bedrooms":4,"staircases":1,"offices":1,"laundryRooms":1,"garageSpaces":2,"storageRooms":1},"buildingType":"residential","features":["loft","open floor plan"]}`;

      const result = await callAnthropic({
        max_tokens: 600,
        messages: [{ role: "user", content: [...imageContents, { type: "text", text: analysisPrompt }] }],
      });

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        useNovaStore.getState().completeTask("Could not parse analysis");
        return;
      }
      const analysis = JSON.parse(jsonMatch[0]);

      // Apply to project store (only fill empty fields)
      const proj = useProjectStore.getState().project;
      const updates = {};
      const detected = { ...(proj.autoDetected || {}) };

      // Floor count — AI vision can correct earlier auto-detected values (regex/title-based)
      // but respects manual user edits (autoDetected.floorCount will be falsy if user set it)
      if (analysis.floors && (!proj.floorCount || parseInt(proj.floorCount) === 0 || proj.autoDetected?.floorCount)) {
        const floorNum = Math.floor(analysis.floors);
        const floors = [];
        if (analysis.hasBasement) floors.push({ label: "Basement", height: 10 });
        for (let i = 1; i <= floorNum; i++) floors.push({ label: `Floor ${i}`, height: 10 });
        if (analysis.hasLoft) floors.push({ label: "Loft", height: 8 });
        updates.floorCount = String(floorNum);
        updates.basementCount = analysis.hasBasement ? "1" : "";
        updates.floors = floors;
        detected.floorCount = true;
      }

      // Room counts — merge with existing, prefer AI counts for empty fields
      if (analysis.rooms) {
        const existingRooms = proj.roomCounts || {};
        const merged = { ...existingRooms };
        const roomMap = {
          bathrooms: "bathrooms",
          kitchens: "kitchens",
          staircases: "staircases",
          offices: "offices",
          storageRooms: "storageRooms",
          elevators: "elevators",
          lobbies: "lobbies",
          serverRooms: "serverRooms",
          conferenceRooms: "conferenceRooms",
          breakRooms: "breakRooms",
          residentialUnits: "residentialUnits",
          parkingSpaces: "parkingSpaces",
          garageSpaces: "parkingSpaces",
          laundryRooms: "storageRooms", // map to utility
        };
        Object.entries(analysis.rooms).forEach(([aiKey, count]) => {
          const storeKey = roomMap[aiKey] || aiKey;
          // Take the higher value — AI vision can supplement schedule-based counts
          if (count > (merged[storeKey] || 0)) {
            merged[storeKey] = count;
          }
        });
        updates.roomCounts = merged;
        detected.roomCounts = true;
      }

      // Building type
      if (analysis.buildingType && !proj.buildingType) {
        updates.buildingType = analysis.buildingType;
        detected.buildingType = true;
      }

      if (Object.keys(updates).length > 0) {
        updates.autoDetected = detected;
        useProjectStore.getState().setProject({ ...useProjectStore.getState().project, ...updates });
      }

      const roomTotal = analysis.rooms ? Object.values(analysis.rooms).reduce((s, v) => s + (v || 0), 0) : 0;
      const msg = `Building: ${analysis.floors || "?"}F, ${roomTotal} rooms, ${analysis.buildingType || "unknown"}`;
      useNovaStore.getState().completeTask(msg);
      useNovaStore.getState().notify(msg, "success");
    } catch (err) {
      useNovaStore.getState().completeTask("Analysis partial");
    }
  }, []);

  // ─── Auto-detect building outlines for Insights geometry ────────────────
  const autoDetectOutlines = useCallback(async () => {
    const allDrawings = useDrawingsStore.getState().drawings;
    const existingOutlines = useModelStore.getState().outlines;

    // Find floor plan drawings by title — these are best for outline detection
    const floorPlanPatterns = [
      /floor\s*plan/i,
      /site\s*plan/i,
      /ground\s*floor/i,
      /first\s*floor/i,
      /second\s*floor/i,
      /third\s*floor/i,
      /main\s*level/i,
      /level\s*\d/i,
      /basement/i,
      /lower\s*level/i,
      /upper\s*level/i,
      /mezzanine/i,
      /penthouse/i,
      /^A-?\d/i,
      /^A\d{2,3}/i,
      /^L\d/i,
      /plan\s*view/i,
    ];
    let candidates = allDrawings.filter(d => {
      if (existingOutlines[d.id]) return false; // already detected
      if (!d.data) return false;
      const label = `${d.sheetTitle || ""} ${d.sheetNumber || ""} ${d.label || ""}`;
      return floorPlanPatterns.some(p => p.test(label));
    });

    // Fallback: if no titled matches, use first architectural drawings that aren't elevations/sections/details
    if (candidates.length === 0) {
      const excludePatterns = [
        /elevation/i,
        /section/i,
        /detail/i,
        /schedule/i,
        /legend/i,
        /diagram/i,
        /riser/i,
        /note/i,
      ];
      candidates = allDrawings.filter(d => {
        if (existingOutlines[d.id]) return false;
        if (!d.data) return false;
        const label = `${d.sheetTitle || ""} ${d.sheetNumber || ""} ${d.label || ""}`;
        return !excludePatterns.some(p => p.test(label));
      });
    }

    // Limit to 3 best candidates to avoid excessive API calls
    const targets = candidates.slice(0, 3);
    if (targets.length === 0) return;

    useNovaStore.getState().startTask("outline", `Detecting building outlines (${targets.length} plans)...`);
    let detected = 0;

    for (let i = 0; i < targets.length; i++) {
      const d = targets[i];
      useNovaStore
        .getState()
        .updateProgress(Math.round(((i + 1) / targets.length) * 100), `Tracing outline ${i + 1}/${targets.length}...`);
      try {
        const result = await detectBuildingOutline(d.id);
        if (result.polygon && result.polygon.length >= 3) {
          const feetPolygon = outlineToFeet(result.polygon, d.id);
          useModelStore.getState().setOutline(d.id, feetPolygon, "ai", result.polygon);
          detected++;

          // Compute footprint area from polygon and store in project
          const area = computePolygonArea(feetPolygon);
          if (area > 0 && detected === 1) {
            // Use first (ground floor) outline only
            const curProj = useProjectStore.getState().project;
            if (!curProj.buildingFootprintSF || parseInt(curProj.buildingFootprintSF) === 0) {
              useProjectStore.getState().setProject({
                ...useProjectStore.getState().project,
                buildingFootprintSF: Math.round(area),
                autoDetected: { ...(useProjectStore.getState().project.autoDetected || {}), footprintSF: true },
              });
            }
          }
        }
      } catch (e) {
        console.warn(`Outline detection failed for ${d.sheetNumber || d.id}:`, e.message);
      }
    }

    if (detected > 0) {
      useNovaStore.getState().completeTask(`Detected ${detected} building outline${detected > 1 ? "s" : ""}`);
    } else {
      useNovaStore.getState().completeTask("No outlines detected");
    }
    return detected;
  }, []);

  // ─── Spec book processing ───────────────────────────────────────────────
  const processSpecBook = useCallback(
    async file => {
      const data = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      setSpecPdf({ name: file.name, data });
      const base64 = data.split(",")[1];
      if (!base64 || base64.length < 100) return 0;

      const text = await callAnthropic({
        max_tokens: 8000,
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              {
                type: "text",
                text: `You are a construction specification parser. Analyze this spec book and extract ALL CSI specification sections you can find.\n\nFor each section provide:\n- section: The CSI section number (format: "XX XX XX" e.g. "09 30 00")\n- title: Section title\n- summary: 1-2 sentence summary of key requirements, products, manufacturers\n- page: Approximate page number in the document\n\nCRITICAL: Respond with ONLY a JSON array. No markdown fences, no backticks, no explanation text. Just the raw JSON array.\n\nFocus on sections with actual specification content (Part 1/2/3), not the table of contents or front matter. Extract every section you find.`,
              },
            ],
          },
        ],
      });

      try {
        const clean = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          const newSpecs = parsed.map(s => ({
            id: uid(),
            section: s.section || "",
            title: s.title || "",
            summary: s.summary || "",
            page: s.page || null,
            requirements: [],
            allocated: false,
          }));
          const curSpecs = useSpecsStore.getState().specs;
          useSpecsStore.getState().setSpecs([...curSpecs, ...newSpecs]);
          return newSpecs.length;
        }
      } catch {
        /* parse failed */
      }
      return 0;
    },
    [setSpecPdf],
  );

  // ─── AI document classification for ambiguous files ─────────────────────
  const aiClassifyDocument = useCallback(async file => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) return "general";

    try {
      // Read first page as image for quick classification
      const arrayBuffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      await loadPdfJs();
      const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      const pg = await pdf.getPage(1);
      const vp = pg.getViewport({ scale: 0.75 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width;
      canvas.height = vp.height;
      await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      const imgDataUrl = canvas.toDataURL("image/jpeg", 0.6);
      const imgBase64 = imgDataUrl.split(",")[1];

      const text = await callAnthropic({
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imgBase64 } },
              {
                type: "text",
                text: `Classify this document page. Is it:\n1. "drawing" — a construction blueprint, plan, elevation, section, or detail drawing\n2. "specification" — a written specification document, project manual, or bid document\n3. "general" — any other document type\n\nRespond with ONLY one word: drawing, specification, or general`,
              },
            ],
          },
        ],
      });

      const result = text.trim().toLowerCase();
      if (result.includes("drawing")) return "drawing";
      if (result.includes("specification") || result.includes("spec")) return "specification";
      return "general";
    } catch {
      return "general";
    }
  }, []);

  // ─── Main upload handler ────────────────────────────────────────────────
  const handleUpload = useCallback(
    async files => {
      if (!files || files.length === 0) return;

      const drawingDocIds = [];
      const specDocIds = [];

      for (const file of files) {
        // Skip duplicate files
        const currentDocs = useDocumentsStore.getState().documents;
        if (isDuplicateFile(file.name, currentDocs)) {
          showToast(`${file.name} already uploaded — skipping`, "warn");
          continue;
        }

        let docType = classifyFile(file.name, file.type, file.size);

        // For ambiguous PDFs classified as "general", try AI classification (with timeout)
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (docType === "general" && isPdf) {
          try {
            const aiType = await Promise.race([
              aiClassifyDocument(file),
              new Promise(resolve => setTimeout(() => resolve("general"), 15000)), // 15s timeout
            ]);
            if (aiType !== "general") docType = aiType;
          } catch {
            /* classification non-critical, fall through to general */
          }
        }

        // Add to documents store
        const doc = addDocument({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          docType,
          processingStatus: "processing",
          processingMessage:
            docType === "drawing"
              ? "Extracting pages..."
              : docType === "specification"
                ? "Parsing specifications..."
                : "Stored",
        });

        if (docType === "drawing") {
          try {
            const drawingIds = await extractDrawingPages(file);
            updateDocument(doc.id, {
              processingMessage: `${drawingIds.length} pages extracted — labeling...`,
              pageCount: drawingIds.length,
              drawingIds,
            });
            drawingDocIds.push({ docId: doc.id, drawingIds });
            showToast(`${file.name}: ${drawingIds.length} sheets extracted`);
          } catch (err) {
            updateDocument(doc.id, {
              processingStatus: "error",
              processingError: err.message,
              processingMessage: "Extraction failed",
            });
            showToast(`${file.name}: extraction failed — ${err.message}`, "error");
          }
        } else if (docType === "specification") {
          try {
            const sectionCount = await processSpecBook(file);
            updateDocument(doc.id, {
              processingStatus: "complete",
              processingMessage: `${sectionCount} sections parsed`,
            });
            specDocIds.push(doc.id);
            showToast(`${file.name}: ${sectionCount} spec sections parsed`);
          } catch (err) {
            updateDocument(doc.id, {
              processingStatus: "error",
              processingError: err.message,
              processingMessage: "Parse failed",
            });
            showToast(`${file.name}: spec parse failed — ${err.message}`, "error");
          }
        } else {
          // General document — store the file data
          const data = await new Promise(res => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = () => res(null);
            r.readAsDataURL(file);
          });
          updateDocument(doc.id, {
            data,
            processingStatus: "complete",
            processingMessage: "Stored",
          });
        }
      }

      // Auto-label + auto-scan drawings (if API key available)
      if (drawingDocIds.length > 0) {
        const allNewDrawingIds = drawingDocIds.flatMap(d => d.drawingIds);

        // Step 1: Auto-label
        for (const { docId } of drawingDocIds) {
          updateDocument(docId, { processingMessage: "ARTIFACT labeling sheets..." });
        }
        try {
          const labelResult = await autoLabelDrawings(allNewDrawingIds);
          for (const { docId, drawingIds } of drawingDocIds) {
            updateDocument(docId, { processingMessage: `Labeled — scanning for schedules...` });
          }
        } catch (err) {
          for (const { docId } of drawingDocIds) {
            updateDocument(docId, { processingMessage: `Label failed: ${err.message}` });
          }
        }

        // Step 2: Auto-scan
        try {
          await autoScanDrawings();
          for (const { docId, drawingIds } of drawingDocIds) {
            const count = drawingIds.length;
            const sr = useScanStore.getState().scanResults;
            const schedCount = sr?.schedules?.length || 0;
            const romRange = sr?.rom?.totals
              ? `ROM $${Math.round(sr.rom.totals.low / 1000)}K–$${Math.round(sr.rom.totals.high / 1000)}K`
              : "";
            updateDocument(docId, {
              processingStatus: "complete",
              processingMessage: `${count} sheets • ${schedCount} schedules${romRange ? ` • ${romRange}` : ""}`,
            });
          }
        } catch (err) {
          for (const { docId, drawingIds } of drawingDocIds) {
            updateDocument(docId, {
              processingStatus: "complete",
              processingMessage: `${drawingIds.length} sheets labeled (scan skipped)`,
            });
          }
        }

        // Step 3: Auto-detect building outlines for Insights 3D model (non-blocking)
        try {
          await autoDetectOutlines();
        } catch {
          /* outline detection is non-critical */
        }

        // Step 4: AI building analysis now runs inside runFullScan() Phase 2.6
        // (multi-signal parameter detection engine replaces standalone aiBuildingAnalysis)

        // Navigate to Discovery after scan completes
        if (useProjectStore.getState().project.setupComplete === false) {
          useProjectStore.getState().setProject({ ...useProjectStore.getState().project, setupComplete: true });
        }
        const estId = useEstimatesStore.getState().activeEstimateId;
        if (estId) navigate(`/estimate/${estId}/plans`);
      }
    },
    [
      addDocument,
      updateDocument,
      extractDrawingPages,
      processSpecBook,
      autoLabelDrawings,
      autoScanDrawings,
      autoDetectOutlines,
      aiClassifyDocument,
      showToast,
    ],
  );

  // ─── Scan result handlers ───────────────────────────────────────────────
  const handleApplyToEstimate = selectedItems => {
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
        quantity: li.qty || 1,
      });
      count++;
    });
    setShowScanModal(false);
    showToast(`Added ${count} items to estimate`);
  };

  const handleApplyNotes = selectedNotes => {
    if (!selectedNotes || selectedNotes.length === 0) return;
    selectedNotes.forEach(note => addClarification(note.category ? `[${note.category}]` : "[scan-note]", note.text));
    showToast(`Added ${selectedNotes.length} note${selectedNotes.length > 1 ? "s" : ""} to clarifications`);
  };

  // ─── Drag & drop handlers ──────────────────────────────────────────────
  const onDragOver = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const onDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUpload(files);
  };

  // ─── Download handlers ─────────────────────────────────────────────────
  const handleDownload = async doc => {
    if (doc.source === "rfp" && doc.storagePath) {
      try {
        const url = `${API_BASE}/api/attachment?path=${encodeURIComponent(doc.storagePath)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error("Download failed");
        const blob = await resp.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = doc.filename;
        a.click();
        URL.revokeObjectURL(a.href);
      } catch (err) {
        showToast("Download failed: " + err.message);
      }
    } else if (doc.data) {
      const a = document.createElement("a");
      a.href = doc.data;
      a.download = doc.filename;
      a.click();
    }
  };

  // ─── Filter documents ──────────────────────────────────────────────────
  const searchLower = docSearch.toLowerCase();
  const allFolders = [...new Set(documents.map(d => d.folder).filter(Boolean))].sort();
  const filteredDocuments = documents.filter(d => {
    // Skip superseded versions (show only latest)
    if (d.replacedById) return false;
    // Search filter
    if (searchLower) {
      const matchName = (d.filename || "").toLowerCase().includes(searchLower);
      const matchFolder = (d.folder || "").toLowerCase().includes(searchLower);
      const matchTags = (d.tags || []).some(tagId => {
        const tag = tagPalette.find(t => t.id === tagId);
        return tag?.name?.toLowerCase().includes(searchLower);
      });
      if (!matchName && !matchFolder && !matchTags) return false;
    }
    // Folder filter
    if (docFolderFilter && (d.folder || "") !== docFolderFilter) return false;
    return true;
  });

  // ─── Group documents by type ───────────────────────────────────────────
  const drawingDocs = filteredDocuments.filter(d => d.docType === "drawing");
  const specDocs = filteredDocuments.filter(d => d.docType === "specification");
  const generalDocs = filteredDocuments.filter(d => d.docType === "general" || (!d.docType && d.source !== "rfp"));
  const rfpDocs = filteredDocuments.filter(d => d.source === "rfp" && d.docType !== "drawing" && d.docType !== "specification");
  const hasProcessing = documents.some(d => d.processingStatus === "processing");

  // ─── Scan progress from scanStore ──────────────────────────────────────
  const scanProgress = useScanStore(s => s.scanProgress);
  const scanError = useScanStore(s => s.scanError);

  // ═══════════════════════════════════════════════════════════════════════
  // SETUP MODE: Focused document upload experience for new estimates
  // ═══════════════════════════════════════════════════════════════════════
  if (isSetupMode) {
    const isProcessing = hasProcessing || scanProgress.phase;
    const handleSkip = () => {
      useProjectStore.getState().setProject({ ...useProjectStore.getState().project, setupComplete: true });
      const estId = useEstimatesStore.getState().activeEstimateId;
      if (estId) navigate(`/estimate/${estId}/info`);
    };

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100%",
          padding: T.space[7],
          fontFamily: T.font.sans,
        }}
      >
        <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          {/* NOVA orb */}
          <div style={{ marginBottom: 24, display: "flex", justifyContent: "center" }}>
            <NovaSceneLazy width={48} height={48} size={0.8} intensity={0.6} lightweight />
          </div>

          {/* Heading */}
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: C.text,
              margin: 0,
              marginBottom: 6,
              fontFamily: T.font.sans,
            }}
          >
            Upload Your Construction Plans
          </h1>
          <p style={{ fontSize: 12, color: C.textDim, margin: 0, marginBottom: 28, lineHeight: 1.6 }}>
            Drop your PDF plans below and ARTIFACT will automatically extract project details, detect schedules, and
            generate a rough order of magnitude estimate.
          </p>

          {/* Processing state */}
          {isProcessing ? (
            <div
              style={{
                ...card(C),
                padding: "24px 28px",
                marginBottom: 20,
                textAlign: "left",
                border: `1px solid ${C.accent}20`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <NovaOrb size={22} scheme="nova" />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>ARTIFACT is analyzing your drawings...</div>
              </div>
              {scanProgress.phase && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>
                    {scanProgress.message}
                    <span style={{ float: "right" }}>
                      {scanProgress.phase === "detect"
                        ? "Phase 1/4"
                        : scanProgress.phase === "notes"
                          ? "Phase 2/4"
                          : scanProgress.phase === "parse"
                            ? "Phase 3/4"
                            : "Phase 4/4"}
                    </span>
                  </div>
                  <div style={{ height: 4, background: C.bg2, borderRadius: 2, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 2,
                        transition: "width 0.3s ease",
                        background: `linear-gradient(90deg, ${C.accent}, ${C.purple || C.accent})`,
                        width:
                          scanProgress.total > 0
                            ? `${Math.round((scanProgress.current / scanProgress.total) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              )}
              {!scanProgress.phase && hasProcessing && (
                <div style={{ fontSize: 10, color: C.textDim }}>Processing uploaded documents...</div>
              )}
              <div style={{ fontSize: 9, color: C.textDim, marginTop: 8 }}>
                This may take a minute depending on the number of sheets. Project info will be auto-filled from your
                title blocks.
              </div>
            </div>
          ) : (
            /* Drop zone */
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                ...card(C),
                padding: "40px 24px",
                textAlign: "center",
                cursor: "pointer",
                border: dragOver ? `2px dashed ${C.accent}` : `2px dashed ${C.border}`,
                background: dragOver ? `${C.accent}08` : C.glassBg,
                transition: T.transition.fast,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: T.radius.lg,
                  background: `${C.accent}12`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto",
                  marginBottom: 14,
                }}
              >
                <Ic d={I.upload} size={26} color={C.accent} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {dragOver ? "Drop files here" : "Drop PDF plans here or click to browse"}
              </div>
              <div style={{ fontSize: 10, color: C.textDim }}>
                PDF drawings, specifications, addenda — any project document
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx,image/*"
                style={{ display: "none" }}
                onChange={e => {
                  handleUpload(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* Skip link */}
          {!isProcessing && (
            <button
              onClick={handleSkip}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                color: C.textDim,
                padding: "8px 16px",
                fontFamily: T.font.sans,
                transition: "color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textDim)}
            >
              Skip — I don't have plans yet →
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: T.space[7], minHeight: "100%", maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[4] }}>
        <div>
          <h1
            style={{
              fontSize: T.fontSize.xl,
              fontWeight: T.fontWeight.bold,
              color: C.text,
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: T.space[3],
              fontFamily: T.font.sans,
            }}
          >
            <Ic d={I.folder} size={22} color={C.accent} />
            Documents
            {documents.length > 0 && (
              <span
                style={{
                  fontSize: T.fontSize.xs,
                  color: C.textDim,
                  padding: "2px 8px",
                  borderRadius: T.radius.full,
                  background: C.bg2,
                  fontWeight: T.fontWeight.medium,
                }}
              >
                {documents.length}
              </span>
            )}
          </h1>
          <p
            style={{
              fontSize: T.fontSize.xs,
              color: C.textDim,
              margin: `${T.space[1]}px 0 0`,
              fontFamily: T.font.sans,
            }}
          >
            Upload project documents — ARTIFACT automatically processes drawings and specifications.
          </p>
        </div>
        {/* Rescan button — re-runs NOVA pipeline on all existing drawings */}
        {drawings.length > 0 && !scanProgress.phase && !hasProcessing && (
          <button
            className="ghost-btn"
            onClick={async () => {
              try {
                const allDrawingIds = drawings.map(d => d.id);
                showToast(`Rescanning ${drawings.length} drawings...`);
                // Step 1: Re-label
                await autoLabelDrawings(allDrawingIds);
                // Step 2: Re-scan for schedules + ROM
                await autoScanDrawings();
                // Step 3: Re-detect outlines (non-blocking)
                autoDetectOutlines().catch(() => {});
                // Step 4: AI building analysis now runs inside runFullScan() Phase 2.6
              } catch (err) {
                showToast(`Rescan failed: ${err.message}`, "error");
              }
            }}
            style={bt(C, {
              background: `linear-gradient(135deg, ${C.purple || C.accent}12, ${C.accent}12)`,
              border: `1px solid ${C.accent}30`,
              color: C.accent,
              padding: "8px 16px",
              fontSize: 11,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            })}
          >
            <Ic d={I.ai} size={13} color={C.accent} /> Rescan All
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          ...card(C),
          padding: T.space[6],
          textAlign: "center",
          cursor: "pointer",
          border: dragOver ? `2px dashed ${C.accent}` : `2px dashed ${C.border}`,
          background: dragOver ? `${C.accent}08` : C.glassBg,
          transition: T.transition.fast,
          marginBottom: T.space[5],
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: T.radius.md,
            background: `${C.accent}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto",
            marginBottom: T.space[3],
          }}
        >
          <Ic d={I.upload} size={22} color={C.accent} />
        </div>
        <div
          style={{
            fontSize: T.fontSize.sm,
            fontWeight: T.fontWeight.semibold,
            color: C.text,
            marginBottom: T.space[1],
          }}
        >
          {dragOver ? "Drop files here" : "Drop files here or click to browse"}
        </div>
        <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
          PDF drawings, specifications, addenda, or any project document
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx,image/*"
          style={{ display: "none" }}
          onChange={e => {
            handleUpload(Array.from(e.target.files || []));
            e.target.value = "";
          }}
        />
      </div>

      {/* Scan progress */}
      {scanProgress.phase && (
        <div
          style={{
            marginBottom: T.space[4],
            padding: `${T.space[3]}px ${T.space[4]}px`,
            background: `${C.purple || C.accent}06`,
            borderRadius: T.radius.md,
            border: `1px solid ${C.purple || C.accent}20`,
          }}
        >
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[2] }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.purple || C.accent,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <NovaOrb size={18} scheme="nova" />
              {scanProgress.message}
            </div>
            <span style={{ fontSize: 10, color: C.textDim }}>
              {scanProgress.phase === "detect"
                ? "Phase 1/4"
                : scanProgress.phase === "notes"
                  ? "Phase 2/4"
                  : scanProgress.phase === "parse"
                    ? "Phase 3/4"
                    : "Phase 4/4"}
            </span>
          </div>
          <div style={{ height: 4, background: C.bg2, borderRadius: 2, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                background: `linear-gradient(90deg, ${C.purple || C.accent}, ${C.accent})`,
                borderRadius: 2,
                transition: "width 0.3s ease",
                width:
                  scanProgress.total > 0 ? `${Math.round((scanProgress.current / scanProgress.total) * 100)}%` : "0%",
              }}
            />
          </div>
        </div>
      )}

      {/* Scan error */}
      {scanError && (
        <div
          style={{
            marginBottom: T.space[4],
            padding: `${T.space[3]}px ${T.space[4]}px`,
            background: `${C.red}06`,
            borderRadius: T.radius.md,
            border: `1px solid ${C.red}20`,
            fontSize: 11,
            color: C.red,
          }}
        >
          <strong>Scan Error:</strong> {scanError}
          <button
            onClick={clearScan}
            style={{
              marginLeft: 8,
              background: "transparent",
              border: "none",
              color: C.red,
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 10,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search, filter, transmittal toolbar */}
      {documents.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: T.space[2],
            alignItems: "center",
            marginBottom: T.space[4],
            flexWrap: "wrap",
          }}
        >
          {/* Search input */}
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Ic
              d={I.search}
              size={13}
              color={C.textDim}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              type="text"
              placeholder="Search documents..."
              value={docSearch}
              onChange={e => setDocSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "7px 10px 7px 30px",
                fontSize: 11,
                border: `1px solid ${C.border}`,
                borderRadius: T.radius.md,
                background: C.bg2,
                color: C.text,
                fontFamily: T.font.sans,
                outline: "none",
              }}
            />
          </div>

          {/* Folder filter */}
          {allFolders.length > 0 && (
            <select
              value={docFolderFilter}
              onChange={e => setDocFolderFilter(e.target.value)}
              style={{
                padding: "7px 10px",
                fontSize: 11,
                border: `1px solid ${C.border}`,
                borderRadius: T.radius.md,
                background: C.bg2,
                color: C.text,
                fontFamily: T.font.sans,
                cursor: "pointer",
              }}
            >
              <option value="">All folders</option>
              {allFolders.map(f => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}

          {/* Tag filter chips */}
          {tagPalette.length > 0 && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {tagPalette.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => setDocSearch(prev => (prev === tag.name ? "" : tag.name))}
                  style={bt(C, {
                    padding: "3px 8px",
                    fontSize: 9,
                    fontWeight: 600,
                    background: docSearch === tag.name ? `${tag.color}20` : "transparent",
                    color: docSearch === tag.name ? tag.color : C.textDim,
                    border: `1px solid ${docSearch === tag.name ? tag.color + "40" : C.border}`,
                    borderRadius: T.radius.full,
                  })}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}

          {/* Transmittal log toggle */}
          <button
            onClick={() => setShowTransmittalLog(v => !v)}
            style={bt(C, {
              padding: "6px 12px",
              fontSize: 10,
              fontWeight: 600,
              background: showTransmittalLog ? `${C.accent}12` : "transparent",
              color: showTransmittalLog ? C.accent : C.textDim,
              border: `1px solid ${showTransmittalLog ? C.accent + "40" : C.border}`,
              display: "flex",
              alignItems: "center",
              gap: 4,
            })}
          >
            <Ic d={I.send || I.inbox} size={11} color={showTransmittalLog ? C.accent : C.textDim} />
            Transmittals{transmittals.length > 0 ? ` (${transmittals.length})` : ""}
          </button>

          {/* Doc count */}
          <span style={{ fontSize: 10, color: C.textDim }}>
            {filteredDocuments.length === documents.filter(d => !d.replacedById).length
              ? `${filteredDocuments.length} docs`
              : `${filteredDocuments.length} of ${documents.filter(d => !d.replacedById).length}`}
          </span>
        </div>
      )}

      {/* Transmittal Log Panel */}
      {showTransmittalLog && (
        <div
          style={{
            ...card(C),
            padding: T.space[4],
            marginBottom: T.space[4],
            border: `1px solid ${C.accent}20`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[3] }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6 }}>
              <Ic d={I.send || I.inbox} size={14} color={C.accent} />
              Transmittal Log
            </div>
            <button
              onClick={() => {
                const party = prompt("Company/person name:");
                if (!party) return;
                const method = prompt("Method (email, planroom, hand-delivery, ftp):", "email") || "email";
                const notes = prompt("Notes (optional):", "") || "";
                addTransmittal({ direction: "sent", party, method, notes, docIds: [] });
                showToast("Transmittal logged");
              }}
              style={bt(C, {
                padding: "4px 10px",
                fontSize: 9,
                fontWeight: 600,
                background: C.accent,
                color: "#fff",
              })}
            >
              + Log Transmittal
            </button>
          </div>
          {transmittals.length === 0 ? (
            <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", padding: T.space[4] }}>
              No transmittals logged yet. Track when you send or receive project documents.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[...transmittals].reverse().map(t => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: T.space[3],
                    padding: `${T.space[2]}px ${T.space[3]}px`,
                    background: C.bg2,
                    borderRadius: T.radius.sm,
                    fontSize: 11,
                  }}
                >
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: T.radius.full,
                      background: t.direction === "sent" ? `${C.blue}15` : `${C.green}15`,
                      color: t.direction === "sent" ? C.blue : C.green,
                      textTransform: "uppercase",
                    }}
                  >
                    {t.direction}
                  </span>
                  <span style={{ fontWeight: 600, color: C.text }}>{t.party}</span>
                  <span style={{ color: C.textDim, fontSize: 10 }}>via {t.method}</span>
                  {t.notes && <span style={{ color: C.textDim, fontSize: 10, flex: 1 }}>— {t.notes}</span>}
                  <span style={{ color: C.textDim, fontSize: 9, marginLeft: "auto" }}>
                    {new Date(t.date).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Drawing documents */}
      {drawingDocs.length > 0 && (
        <DocSection title="Drawings" count={drawingDocs.length} icon={I.layers} color={C.blue} C={C} T={T}>
          {drawingDocs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              C={C}
              T={T}
              onRemove={() => removeDocument(doc.id)}
              onDownload={() => handleDownload(doc)}
              tagPalette={tagPalette}
            />
          ))}
        </DocSection>
      )}

      {/* Spec documents */}
      {specDocs.length > 0 && (
        <DocSection
          title="Specifications"
          count={specDocs.length}
          icon={I.plans}
          color={C.purple || C.accent}
          C={C}
          T={T}
        >
          {specDocs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              C={C}
              T={T}
              onRemove={() => removeDocument(doc.id)}
              onDownload={() => handleDownload(doc)}
              tagPalette={tagPalette}
            />
          ))}
        </DocSection>
      )}

      {/* RFP attachments */}
      {rfpDocs.length > 0 && (
        <DocSection title="RFP Attachments" count={rfpDocs.length} icon={I.inbox} color={C.accent} C={C} T={T}>
          {rfpDocs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              C={C}
              T={T}
              onRemove={() => removeDocument(doc.id)}
              onDownload={() => handleDownload(doc)}
              tagPalette={tagPalette}
            />
          ))}
        </DocSection>
      )}

      {/* General documents */}
      {generalDocs.length > 0 && (
        <DocSection title="Documents" count={generalDocs.length} icon={I.folder} color={C.textMuted} C={C} T={T}>
          {generalDocs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              C={C}
              T={T}
              onRemove={() => removeDocument(doc.id)}
              onDownload={() => handleDownload(doc)}
              tagPalette={tagPalette}
            />
          ))}
        </DocSection>
      )}

      {/* Empty state */}
      {documents.length === 0 && (
        <EmptyState
          icon={I.upload}
          title="No documents uploaded"
          subtitle="Drop files above or click to upload drawings, specs, and project documents."
          action={() => fileInputRef.current?.click()}
          actionLabel="Upload Documents"
          actionIcon={I.upload}
        />
      )}

      {/* Scan Results Modal */}
      {showScanModal && scanResults && (
        <ScanResultsModal
          scanResults={scanResults}
          onClose={() => setShowScanModal(false)}
          onApplyToEstimate={handleApplyToEstimate}
          onApplyNotes={handleApplyNotes}
          onSaveOnly={() => {
            setShowScanModal(false);
            showToast("Scan results saved");
          }}
        />
      )}

      {/* Scan results summary card */}
      {scanResults && !scanProgress.phase && !showScanModal && (
        <div
          style={{
            marginTop: T.space[4],
            ...card(C),
            padding: `${T.space[3]}px ${T.space[4]}px`,
            border: `1px solid ${C.purple || C.accent}20`,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.purple || C.accent,
                  marginBottom: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ic d={I.ai} size={14} color={C.purple || C.accent} /> ARTIFACT Scan Complete
              </div>
              <div style={{ fontSize: 10, color: C.textDim }}>
                {scanResults.schedules?.length || 0} schedule{scanResults.schedules?.length !== 1 ? "s" : ""}
                {" · "}
                {scanResults.lineItems?.length || 0} line items
                {scanResults.rom?.totals
                  ? ` · ROM: $${Math.round(scanResults.rom.totals.low).toLocaleString()} – $${Math.round(scanResults.rom.totals.high).toLocaleString()}`
                  : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => setShowScanModal(true)}
                style={bt(C, {
                  background: C.purple || C.accent,
                  color: "#fff",
                  padding: "6px 14px",
                  fontSize: 10,
                  fontWeight: 600,
                })}
              >
                View Results
              </button>
              <button
                onClick={clearScan}
                style={bt(C, {
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textDim,
                  padding: "6px 10px",
                  fontSize: 10,
                })}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function DocSection({ title, count, icon, color, C, T, children }) {
  return (
    <div style={{ marginBottom: T.space[4] }}>
      <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[2] }}>
        <Ic d={icon} size={14} color={color} />
        <span
          style={{
            fontSize: T.fontSize.xs,
            fontWeight: T.fontWeight.bold,
            color: C.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>({count})</span>
      </div>
      <div style={{ ...card(C), overflow: "hidden", padding: 0 }}>{children}</div>
    </div>
  );
}

// ─── Document row ─────────────────────────────────────────────────────────────
function DocRow({ doc, C, T, onRemove, onDownload, tagPalette }) {
  const ext = doc.filename?.split(".").pop()?.toUpperCase() || "";
  const docTags = (doc.tags || [])
    .map(tid => (tagPalette || []).find(t => t.id === tid))
    .filter(Boolean);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: T.space[3],
        padding: `${T.space[3]}px ${T.space[4]}px`,
        borderBottom: `1px solid ${C.border}08`,
        transition: T.transition.fast,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = `${C.text}04`)}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      {/* File type badge */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: T.radius.sm,
          background: `${C.accent}08`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 9, fontWeight: T.fontWeight.bold, color: C.accent, letterSpacing: "0.02em" }}>
          {ext}
        </span>
      </div>

      {/* File info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2], flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: T.fontSize.sm,
              fontWeight: T.fontWeight.medium,
              color: C.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {doc.filename}
          </span>
          <TypeBadge docType={doc.docType} C={C} T={T} />
          {(doc.version || 1) > 1 && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: T.radius.full,
                background: `${C.purple || C.accent}12`,
                color: C.purple || C.accent,
              }}
            >
              v{doc.version}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginTop: 2, flexWrap: "wrap" }}>
          <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
            {formatBytes(doc.size)}
            {doc.pageCount && ` · ${doc.pageCount} pages`}
          </span>
          {doc.folder && (
            <span
              style={{
                fontSize: 8,
                padding: "1px 5px",
                borderRadius: 3,
                background: `${C.textDim}10`,
                color: C.textDim,
                fontWeight: 600,
              }}
            >
              {doc.folder}
            </span>
          )}
          {docTags.map(tag => (
            <span
              key={tag.id}
              style={{
                fontSize: 8,
                padding: "1px 5px",
                borderRadius: 3,
                background: `${tag.color}15`,
                color: tag.color,
                fontWeight: 600,
              }}
            >
              {tag.name}
            </span>
          ))}
          {doc.source === "rfp" && (
            <span
              style={{
                padding: "1px 6px",
                borderRadius: T.radius.sm,
                background: `${C.accent}12`,
                color: C.accent,
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              RFP
            </span>
          )}
        </div>
      </div>

      {/* Processing status */}
      <StatusBadge status={doc.processingStatus} message={doc.processingMessage} C={C} T={T} />

      {/* Actions */}
      <div style={{ display: "flex", gap: T.space[1], flexShrink: 0 }}>
        {(doc.data || doc.storagePath) && (
          <button
            onClick={onDownload}
            title="Download"
            style={bt(C, {
              padding: "6px",
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textDim,
            })}
          >
            <Ic d={I.download} size={12} color={C.textDim} />
          </button>
        )}
        <button
          onClick={onRemove}
          title="Remove"
          style={bt(C, {
            padding: "6px",
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textDim,
          })}
        >
          <Ic d={I.trash} size={12} color={C.textDim} />
        </button>
      </div>
    </div>
  );
}
