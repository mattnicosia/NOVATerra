// ═══════════════════════════════════════════════════════════════════════════════
// scanRunner.js — Shared scan pipeline (extracted from DocumentsPage)
// Can be called from any page: Discovery rescan, Documents auto-scan, etc.
// All state reads use getState() so this works outside React render context.
// ═══════════════════════════════════════════════════════════════════════════════

import { useUiStore } from "@/stores/uiStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { useNovaStore } from "@/stores/novaStore";
import {
  callAnthropic,
  batchAI,
  optimizeImageForAI,
  imageBlock,
  buildProjectContext,
  runOCR,
  segmentedOCR,
  SCAN_MODEL,
  INTERPRET_MODEL,
  NARRATIVE_MODEL,
} from "@/utils/ai";
import {
  buildDetectionPrompt,
  buildParsePrompt,
  buildCountingPrompt,
  normalizeScheduleData,
  SCHEDULE_TYPES,
} from "@/utils/scheduleParsers";
import {
  generateBaselineROM,
  generateScheduleLineItems,
  augmentROMWithAI,
  estimateProjectSF,
  extractBuildingParamsFromSchedules,
} from "@/utils/romEngine";
import { runParameterDetection } from "@/utils/parameterDetectionEngine";
import { extractDrawingNotes, buildNotesContext } from "@/utils/notesExtractor";
import { extractTitleBlockFields, mapBuildingTypeKey, inferWorkType } from "@/utils/titleBlockExtractor";
import { generateScopeOutline } from "@/utils/scopeOutlineGenerator";
import { novaPlans } from "@/nova/agents/plans";
import { useFirmMemoryStore } from "@/nova/learning/firmMemory";
import { useCorrectionStore } from "@/nova/learning/correctionStore";
import { useSnapshotsStore } from "@/stores/snapshotsStore";
import { autoTradeFromCode } from "@/constants/tradeGroupings";
import { renderPdfPage } from "@/utils/drawingUtils";
import { saveEstimate } from "@/hooks/usePersistence";

/**
 * Extract balanced JSON from AI response text.
 * Finds the first [ or { and tracks bracket depth to find matching close.
 * Falls back to greedy regex if balanced extraction fails.
 */
function extractJSON(text, type = "array") {
  const openChar = type === "array" ? "[" : "{";
  const closeChar = type === "array" ? "]" : "}";
  const startIdx = text.indexOf(openChar);
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(startIdx, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Run the full NOVA scan pipeline on existing drawings.
 * Phases: Schedule Detection → Notes Extraction → Schedule Parsing → ROM Generation
 *
 * @param {Object} options
 * @param {Function} options.onComplete — Called when scan finishes successfully (receives results)
 * @param {Function} options.onError — Called on error (receives error message)
 * @returns {Promise<Object|null>} scan results or null on failure
 */
export async function runFullScan({ onComplete, onError, signal } = {}) {
  const currentDrawings = useDrawingPipelineStore.getState().drawings.filter(d => d.data);
  if (currentDrawings.length === 0) {
    const msg = "No drawings to scan. Upload documents first.";
    useUiStore.getState().showToast(msg, "error");
    onError?.(msg);
    return null;
  }

  const { setScanResults, setScanProgress, setScanError, clearScan, createAbortController } = useDrawingPipelineStore.getState();
  const showToast = useUiStore.getState().showToast;

  // Create abort controller if no external signal provided
  const abortSignal = signal || createAbortController();
  const checkAbort = () => {
    if (abortSignal.aborted) throw new Error("__SCAN_STOPPED__");
  };

  clearScan();
  // Re-create controller after clearScan reset it
  if (!signal) useDrawingPipelineStore.getState().createAbortController();

  useNovaStore.getState().startTask("scan", `Scanning ${currentDrawings.length} drawings...`);
  setScanProgress({
    phase: "detect",
    current: 0,
    total: currentDrawings.length,
    message: "NOVA scanning for schedules...",
  });

  try {
    // ── Phase 0: OCR Pre-Pass (batch OCR all drawings, cache results) ──
    checkAbort();
    setScanProgress({
      phase: "ocr",
      current: 0,
      total: currentDrawings.length,
      message: "Running OCR pre-pass...",
    });

    // Prepare optimized images + check OCR cache
    const drawingImages = await batchAI(
      currentDrawings,
      async (d, idx) => {
        checkAbort();
        setScanProgress({
          phase: "ocr",
          current: idx + 1,
          total: currentDrawings.length,
          message: `OCR: sheet ${idx + 1}/${currentDrawings.length}...`,
        });
        let imgData;
        const curCanvases = useDrawingPipelineStore.getState().pdfCanvases;
        if (d.type === "pdf") {
          imgData = curCanvases[d.id] || (await renderPdfPage(d));
        } else {
          imgData = d.data;
        }
        if (!imgData) return { id: d.id, optimized: null, ocrText: "" };

        const optimized = await optimizeImageForAI(imgData, 2000);

        // Check drawing-level OCR cache (skip if fresh — less than 1 hour old)
        const cached = d.ocrCache;
        if (cached?.text && cached.timestamp && Date.now() - cached.timestamp < 3600000) {
          return { id: d.id, optimized, ocrText: cached.text };
        }

        // Run OCR and cache result
        let ocrText = "";
        try {
          const ocrResult = await segmentedOCR(optimized.base64, optimized.width, optimized.height);
          ocrText = ocrResult.text || "";
        } catch {
          try {
            const fb = await runOCR(optimized.base64);
            ocrText = fb.text || "";
          } catch {
            /* optional */
          }
        }

        // Store OCR result on drawing for future reuse
        if (ocrText) {
          try {
            useDrawingPipelineStore.getState().updateDrawing(d.id, "ocrCache", {
              text: ocrText,
              timestamp: Date.now(),
            });
          } catch {
            /* non-critical */
          }
        }

        return { id: d.id, optimized, ocrText };
      },
      3,
    );

    // Build lookup map for Phase 1
    const ocrMap = new Map(drawingImages.map(r => [r.id, r]));
    const ocrCacheHits = drawingImages.filter(r => !r.error && r.ocrText).length;
    console.log(`[scanRunner] Phase 0: OCR pre-pass complete — ${ocrCacheHits}/${currentDrawings.length} with text`);

    // ── Phase 1: Detect schedules (uses cached OCR from Phase 0) ──
    checkAbort();
    const detections = await batchAI(
      currentDrawings,
      async (d, idx) => {
        checkAbort();
        setScanProgress({
          phase: "detect",
          current: idx + 1,
          total: currentDrawings.length,
          message: `Scanning sheet ${idx + 1}/${currentDrawings.length}...`,
        });

        const cached = ocrMap.get(d.id);
        if (!cached?.optimized) return { sheetId: d.id, schedules: [] };
        const optimized = cached.optimized;
        const ocrText = cached.ocrText || "";

        const sheetLabel = d.sheetTitle || d.label || d.sheetNumber;
        const prompt = buildDetectionPrompt(sheetLabel, ocrText);
        const { systemPrompt: detectionSys } = novaPlans.augmentDetectionPrompt(sheetLabel, ocrText);
        const detectStart = Date.now();
        const result = await callAnthropic({
          model: SCAN_MODEL,
          max_tokens: 1000,
          system: detectionSys,
          messages: [{ role: "user", content: [imageBlock(optimized.base64), { type: "text", text: prompt }] }],
        });

        try {
          const parsed = extractJSON(result, "array");
          const detected = Array.isArray(parsed) ? parsed : [];
          try {
            const { logAICall } = await import("@/nova/learning/evaluationLogger");
            logAICall({ phase: 'detect', model: 'haiku', inputSummary: `Sheet ${sheetLabel}`, aiResult: detected, latencyMs: Date.now() - detectStart });
          } catch {}
          if (!parsed) return { sheetId: d.id, sheetLabel, schedules: [], ocrText };
          return {
            sheetId: d.id,
            sheetLabel,
            imgBase64: optimized.base64,
            imgWidth: optimized.width,
            imgHeight: optimized.height,
            schedules: detected,
            ocrText,
          };
        } catch {
          return { sheetId: d.id, sheetLabel, schedules: [], ocrText };
        }
      },
      3,
    );

    const schedulesToParse = [];
    detections.forEach(det => {
      if (det.error || !det.schedules) return;
      det.schedules.forEach(s => {
        if (s.type && s.type !== "unknown" && s.confidence !== "low") {
          if (s.rowCount != null && s.rowCount < 2) return;
          schedulesToParse.push({
            ...s,
            sheetId: det.sheetId,
            sheetLabel: det.sheetLabel,
            imgBase64: det.imgBase64,
            imgWidth: det.imgWidth,
            imgHeight: det.imgHeight,
            ocrText: det.ocrText,
          });
        }
      });
    });

    // ── Phase 1.5: Extract drawing notes ──
    checkAbort();
    useNovaStore.getState().updateProgress(25, "Extracting drawing notes...");
    setScanProgress({ phase: "notes", current: 0, total: detections.length, message: "Extracting drawing notes..." });
    const drawingNotesResults = await batchAI(
      detections.filter(d => !d.error && d.imgBase64),
      async (det, idx) => {
        setScanProgress({
          phase: "notes",
          current: idx + 1,
          total: detections.length,
          message: `Reading notes from sheet ${idx + 1}...`,
        });
        const result = await extractDrawingNotes({
          imgBase64: det.imgBase64,
          ocrText: det.ocrText || "",
          sheetLabel: det.sheetLabel || `Sheet ${idx + 1}`,
        });
        try {
          useDrawingPipelineStore.getState().updateDrawing(det.sheetId, "extractedNotes", result);
        } catch {
          /* non-critical */
        }
        return { sheetLabel: det.sheetLabel, sheetId: det.sheetId, ...result };
      },
      3,
    );
    const validNotesResults = drawingNotesResults.filter(r => !r.error);
    const notesContext = buildNotesContext(validNotesResults);

    // ── Phase 1.7: Extract title block fields ──
    checkAbort();
    try {
      useNovaStore.getState().updateProgress(30, "Reading title block...");
      setScanProgress({ phase: "titleblock", current: 0, total: 1, message: "Reading title block..." });

      // Pick 2 candidate sheets — prefer those with title-block notes, fall back to first 2
      const titleBlockSheets = validNotesResults.filter(r => r.notes?.some(n => n.category === "title-block"));
      const candidateSheetIds =
        titleBlockSheets.length > 0
          ? titleBlockSheets.slice(0, 2).map(r => r.sheetId)
          : detections
              .filter(d => !d.error && d.imgBase64)
              .slice(0, 2)
              .map(d => d.sheetId);

      const candidateDets = detections.filter(d => candidateSheetIds.includes(d.sheetId) && d.imgBase64);

      if (candidateDets.length > 0) {
        const tbResults = await batchAI(
          candidateDets,
          async det => {
            return extractTitleBlockFields({
              imgBase64: det.imgBase64,
              ocrText: det.ocrText || "",
              sheetLabel: det.sheetLabel || "Unknown",
            });
          },
          2,
        );

        // Merge: first non-empty value per field wins
        const merged = {};
        const fields = [
          "projectName",
          "client",
          "architect",
          "engineer",
          "engineerStructural",
          "engineerMEP",
          "engineerCivil",
          "address",
          "city",
          "state",
          "zipCode",
          "projectNumber",
          "buildingTypeHint",
          "workTypeHint",
        ];
        for (const result of tbResults) {
          if (!result || result.error) continue;
          for (const f of fields) {
            if (!merged[f] && result[f]) merged[f] = result[f];
          }
        }

        // Write to projectStore — only empty fields
        const proj = useProjectStore.getState().project;
        const updates = {};
        const detected = { ...(proj.autoDetected || {}) };
        let anyUpdate = false;

        if (merged.projectName && (!proj.name || proj.name === "New Estimate")) {
          updates.name = merged.projectName;
          detected.name = true;
          anyUpdate = true;
        }
        if (merged.client && !proj.client) {
          updates.client = merged.client;
          detected.client = true;
          anyUpdate = true;
        }
        if (merged.architect && !proj.architect) {
          updates.architect = merged.architect;
          detected.architect = true;
          anyUpdate = true;
        }
        if (merged.engineer && !proj.engineer) {
          updates.engineer = merged.engineer;
          detected.engineer = true;
          anyUpdate = true;
        }
        if (merged.engineerStructural && !proj.engineerStructural) {
          updates.engineerStructural = merged.engineerStructural;
          detected.engineerStructural = true;
          anyUpdate = true;
        }
        if (merged.engineerMEP && !proj.engineerMEP) {
          updates.engineerMEP = merged.engineerMEP;
          detected.engineerMEP = true;
          anyUpdate = true;
        }
        if (merged.engineerCivil && !proj.engineerCivil) {
          updates.engineerCivil = merged.engineerCivil;
          detected.engineerCivil = true;
          anyUpdate = true;
        }
        if (merged.address && !proj.address) {
          let addr = merged.address;
          if (merged.city) addr += `, ${merged.city}`;
          if (merged.state) addr += `, ${merged.state}`;
          updates.address = addr;
          detected.address = true;
          anyUpdate = true;
        }
        if (merged.zipCode && !proj.zipCode) {
          updates.zipCode = merged.zipCode;
          detected.zipCode = true;
          anyUpdate = true;
        }
        if (merged.projectNumber && !proj.projectNumber) {
          updates.projectNumber = merged.projectNumber;
          detected.projectNumber = true;
          anyUpdate = true;
        }
        if (merged.buildingTypeHint && !proj.buildingType) {
          const mapped = mapBuildingTypeKey(merged.buildingTypeHint);
          if (mapped) {
            updates.buildingType = mapped;
            detected.buildingType = true;
            anyUpdate = true;
          }
        }

        // Infer work type from drawing notes
        if (!proj.workType) {
          const inferredWork = inferWorkType(validNotesResults);
          if (inferredWork) {
            updates.workType = inferredWork;
            detected.workType = true;
            anyUpdate = true;
          }
        }

        // Also check title block work type hint
        if (merged.workTypeHint && !proj.workType && !updates.workType) {
          const lower = merged.workTypeHint.toLowerCase();
          if (lower.includes("renovation")) updates.workType = "renovation";
          else if (lower.includes("tenant")) updates.workType = "tenant-fit-out";
          else if (lower.includes("addition")) updates.workType = "addition";
          else if (lower.includes("new")) updates.workType = "new-construction";
          if (updates.workType) {
            detected.workType = true;
            anyUpdate = true;
          }
        }

        if (anyUpdate) {
          updates.autoDetected = detected;
          useProjectStore.getState().setProject({ ...useProjectStore.getState().project, ...updates });
          const fieldCount = Object.keys(updates).filter(k => k !== "autoDetected").length;
          console.log(`[scanRunner] Phase 1.7: Auto-filled ${fieldCount} project fields from title block`);

          // Sync detected fields to estimatesIndex so Projects table shows them immediately
          const activeId = useEstimatesStore.getState().activeEstimateId;
          if (activeId) {
            const indexUpdates = {};
            if (updates.name) indexUpdates.name = updates.name;
            if (updates.client) indexUpdates.client = updates.client;
            if (updates.architect) indexUpdates.architect = updates.architect;
            if (updates.engineer) indexUpdates.engineer = updates.engineer;
            if (updates.address) indexUpdates.address = updates.address;
            if (updates.zipCode) indexUpdates.zipCode = updates.zipCode;
            if (updates.buildingType) indexUpdates.buildingType = updates.buildingType;
            if (updates.workType) indexUpdates.workType = updates.workType;
            if (updates.projectNumber) indexUpdates.estimateNumber = updates.projectNumber;
            if (Object.keys(indexUpdates).length > 0) {
              useEstimatesStore.getState().updateIndexEntry(activeId, indexUpdates);
              console.log(`[scanRunner] Synced ${Object.keys(indexUpdates).length} fields to estimatesIndex`);
            }
          }
        }
      }
    } catch (err) {
      console.warn("[scanRunner] Phase 1.7 (title block) failed:", err.message);
      // Non-critical — project fields remain empty for user to fill
    }

    // ── Phase 2: Parse schedules (skip if none detected) ──
    checkAbort();
    let validSchedules = [];
    let scheduleEvidence = null;
    if (schedulesToParse.length > 0) {
      useNovaStore.getState().updateProgress(50, "Parsing schedules...");
      setScanProgress({ phase: "parse", current: 0, total: schedulesToParse.length, message: "Parsing schedules..." });
      const parsedSchedules = await batchAI(
        schedulesToParse,
        async (sched, idx) => {
          setScanProgress({
            phase: "parse",
            current: idx + 1,
            total: schedulesToParse.length,
            message: `Parsing ${SCHEDULE_TYPES.find(t => t.id === sched.type)?.label || sched.type}...`,
          });
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
              const sx = Math.round((img.width * xPct) / 100),
                sy = Math.round((img.height * yPct) / 100);
              const sw = Math.round((img.width * wPct) / 100),
                sh = Math.round((img.height * hPct) / 100);
              canvas.width = Math.min(sw * 2, 1800);
              canvas.height = Math.min(sh * 2, 1800);
              canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
              cropBase64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
            } catch {
              /* use full image */
            }
          }
          let cropOcrText = "";
          try {
            const r = await runOCR(cropBase64);
            cropOcrText = r.text || "";
          } catch {
            /* optional */
          }
          // Search for similar past corrections (cloud vector store)
          let vectorCorrectionContext = "";
          try {
            const { searchSimilarCorrections } = await import("@/nova/learning/correctionSync");
            vectorCorrectionContext = await searchSimilarCorrections(sched.type, cropOcrText);
          } catch { /* non-critical — local corrections still apply */ }

          // Build local correction context from global patterns
          const localCorrectionCtx = useCorrectionStore.getState().buildCorrectionContext?.(sched.type) || "";

          const parsePrompt = buildParsePrompt(sched.type, cropOcrText, notesContext)
            + (localCorrectionCtx ? "\n\n" + localCorrectionCtx : "")
            + (vectorCorrectionContext ? "\n\n" + vectorCorrectionContext : "");
          if (!parsePrompt) return { ...sched, entries: [], error: "Unknown schedule type" };
          const { systemPrompt: parseSys } = novaPlans.augmentParsePrompt(sched.type, cropOcrText);
          const parseStart = Date.now();
          const result = await callAnthropic({
            model: SCAN_MODEL,
            max_tokens: 4000,
            system: parseSys,
            messages: [{ role: "user", content: [imageBlock(cropBase64), { type: "text", text: parsePrompt }] }],
          });
          try {
            const parsed = extractJSON(result, "array");
            try {
              const { logAICall } = await import("@/nova/learning/evaluationLogger");
              logAICall({
                phase: 'parse', model: 'haiku',
                inputSummary: `${sched.type} schedule`,
                aiResult: { entryCount: parsed?.length || 0 },
                latencyMs: Date.now() - parseStart,
                correctionContextUsed: !!(localCorrectionCtx || vectorCorrectionContext),
                vectorCorrectionsUsed: vectorCorrectionContext ? (vectorCorrectionContext.match(/^-/gm) || []).length : 0,
              });
            } catch {}
            if (!parsed) return { ...sched, entries: [] };
            return { ...sched, entries: normalizeScheduleData(sched.type, parsed) };
          } catch {
            return { ...sched, entries: [] };
          }
        },
        3,
      );

      validSchedules = parsedSchedules.filter(s => !s.error && s.entries?.length > 0);

      // ── Phase 2.4: Verify parsed schedules (agent self-check) ──
      checkAbort();
      try {
        const { verifyScheduleParse } = await import("@/utils/scanVerifier");
        const corrPatterns = useCorrectionStore.getState().globalPatterns || [];
        // Build OCR meta from detection phase
        const ocrMeta = {};
        for (const sched of validSchedules) {
          if (sched.drawingId) ocrMeta[sched.drawingId] = { rowCount: sched._detectedRowCount || 0 };
        }
        const verification = verifyScheduleParse(validSchedules, ocrMeta, corrPatterns);
        if (!verification.pass && verification.rerunItems.length > 0) {
          console.log(`[scanRunner] Phase 2.4: Re-parsing ${verification.rerunItems.length} low-confidence schedules with Sonnet`);
          for (const item of verification.rerunItems.slice(0, 3)) { // max 3 re-runs (cost guard)
            checkAbort();
            const sched = validSchedules.find(s => s.drawingId === item.drawingId && s.type === item.schedType);
            if (!sched) continue;
            const drawing = currentDrawings.find(d => d.id === sched.drawingId);
            if (!drawing) continue;
            try {
              const cropOcrText = drawing._ocrCache || "";
              const reParsePrompt = buildParsePrompt(sched.type, cropOcrText, notesContext) +
                `\n\nPREVIOUS ATTEMPT (needs improvement — ${item.reason}):\n${JSON.stringify(sched.entries?.slice(0, 3))}`;
              const reResult = await callAnthropic({
                model: INTERPRET_MODEL, // Upgrade from Haiku to Sonnet for retry
                messages: [{ role: "user", content: reParsePrompt }],
                max_tokens: 4000,
              });
              const reParsed = extractJSON(reResult, "array");
              if (reParsed && reParsed.length > sched.entries.length) {
                sched.entries = normalizeScheduleData(sched.type, reParsed);
                sched._reVerified = true;
                console.log(`[scanRunner] Phase 2.4: Re-parse improved ${sched.type} from ${item.originalCount} to ${sched.entries.length} entries`);
              }
            } catch (reErr) {
              console.warn(`[scanRunner] Phase 2.4: Re-parse failed for ${sched.type}:`, reErr.message);
            }
          }
        }
        if (verification.issues.length > 0) {
          console.log(`[scanRunner] Phase 2.4: ${verification.issues.length} issues flagged`, verification.issues.map(i => i.reason));
        }
      } catch (verifyErr) {
        console.warn("[scanRunner] Phase 2.4 (verification) non-critical:", verifyErr.message);
      }

      // ── Phase 2.3: Count items on floor plans ──
      const countableTypes = new Set([
        "door",
        "window",
        "lighting-fixture",
        "plumbing-fixture",
        "equipment",
        "mechanical-equipment",
      ]);
      const marksByType = {};
      for (const sched of validSchedules) {
        if (!countableTypes.has(sched.type)) continue;
        const marks = sched.entries.map(e => e.mark).filter(m => m != null && m !== "");
        if (marks.length > 0) marksByType[sched.type] = [...new Set(marks)];
      }

      if (Object.keys(marksByType).length > 0) {
        useNovaStore.getState().updateProgress(52, "Counting items on floor plans...");
        setScanProgress({ phase: "count", current: 0, total: 0, message: "Counting items on floor plans..." });

        // Identify floor plan sheets
        const floorPlanPattern =
          /floor.?plan|plan.?view|^A-?\d|^A\d{2,3}|first.floor|second.floor|third.floor|ground.floor|level.?\d|basement|lower.level|upper.level|mezzanine|penthouse|^L\d|reflected.ceiling|RCP|ceiling.plan/i;
        const sheetsWithSchedules = new Set(schedulesToParse.map(s => s.sheetId));
        let floorPlanSheets = detections.filter(
          det =>
            !det.error &&
            det.imgBase64 &&
            !sheetsWithSchedules.has(det.sheetId) &&
            floorPlanPattern.test(det.sheetLabel || ""),
        );
        // Fallback: sheets with zero schedule detections
        if (floorPlanSheets.length === 0) {
          floorPlanSheets = detections.filter(
            det => !det.error && det.imgBase64 && (!det.schedules || det.schedules.length === 0),
          );
        }

        if (floorPlanSheets.length > 0) {
          setScanProgress({
            phase: "count",
            current: 0,
            total: floorPlanSheets.length,
            message: `Counting items on ${floorPlanSheets.length} floor plans...`,
          });

          const countResults = await batchAI(
            floorPlanSheets,
            async (det, idx) => {
              setScanProgress({
                phase: "count",
                current: idx + 1,
                total: floorPlanSheets.length,
                message: `Counting marks on ${det.sheetLabel || `sheet ${idx + 1}`}...`,
              });
              const prompt = buildCountingPrompt(marksByType, det.ocrText);
              const result = await callAnthropic({
                model: SCAN_MODEL,
                max_tokens: 2000,
                messages: [{ role: "user", content: [imageBlock(det.imgBase64), { type: "text", text: prompt }] }],
              });
              try {
                const parsed = extractJSON(result, "object");
                return parsed || {};
              } catch {
                return {};
              }
            },
            3,
          );

          // Aggregate counts across all floor plan sheets
          const totalCounts = {};
          for (const counts of countResults) {
            if (!counts || counts.error) continue;
            for (const [schedType, markCounts] of Object.entries(counts)) {
              if (!totalCounts[schedType]) totalCounts[schedType] = {};
              for (const [mark, count] of Object.entries(markCounts)) {
                const n = parseInt(count) || 0;
                totalCounts[schedType][mark] = (totalCounts[schedType][mark] || 0) + n;
              }
            }
          }

          // Update schedule entries — only where quantity is null/empty/0
          for (const sched of validSchedules) {
            if (!totalCounts[sched.type]) continue;
            for (const entry of sched.entries) {
              const existingQty = parseInt(entry.quantity);
              if (existingQty > 0) continue; // don't override schedule-provided quantities
              const counted = totalCounts[sched.type][entry.mark];
              if (counted != null && counted > 0) {
                entry.quantity = counted;
                entry._counted = true;
              }
            }
          }

          console.log("[scanRunner] Phase 2.3: Floor plan counts:", JSON.stringify(totalCounts));
        }
      }

      // ── Phase 2.5: Extract building params from schedules ──
      try {
        scheduleEvidence = extractBuildingParamsFromSchedules(validSchedules);
        const currentProject = useProjectStore.getState().project;
        const updates = {};
        const existingRooms = currentProject.roomCounts || {};
        const mergedRooms = { ...existingRooms };
        let roomsUpdated = false;
        Object.entries(scheduleEvidence.roomCounts).forEach(([k, v]) => {
          if (v > (existingRooms[k] || 0)) {
            mergedRooms[k] = v;
            roomsUpdated = true;
          }
        });
        if (roomsUpdated) updates.roomCounts = mergedRooms;
        if (scheduleEvidence.floorCount > 0 && !currentProject.floorCount) {
          updates.floorCount = scheduleEvidence.floorCount;
          updates.floors = Array.from({ length: scheduleEvidence.floorCount }, (_, i) => ({
            label: `Floor ${i + 1}`,
            height: i === 0 ? 14 : 12,
          }));
        }
        if (Object.keys(updates).length > 0) {
          useProjectStore.getState().setProject({ ...useProjectStore.getState().project, ...updates });
        }
      } catch {
        /* non-critical */
      }
    }

    // ── Phase 2.6: Multi-signal parameter detection engine ──
    checkAbort();
    try {
      useNovaStore.getState().updateProgress(55, "Running parameter detection engine...");
      setScanProgress({ phase: "params", current: 0, total: 1, message: "Multi-signal parameter detection..." });

      const detectionResult = await runParameterDetection({
        parsedSchedules: validSchedules,
        scheduleEvidence,
        onProgress: (phase, message) => {
          setScanProgress({ phase: "params", current: 0, total: 1, message });
        },
      });

      // Apply merged results to project store
      if (detectionResult?.parameters) {
        const proj = useProjectStore.getState().project;
        const updates = {};
        const detected = { ...(proj.autoDetected || {}) };

        // Room counts — take max of existing vs evidence
        const existingRooms = proj.roomCounts || {};
        const mergedRooms = { ...existingRooms };
        let roomsUpdated = false;
        for (const [paramPath, value] of Object.entries(detectionResult.parameters)) {
          if (paramPath.startsWith("roomCounts.")) {
            const roomKey = paramPath.split(".")[1];
            if (typeof value === "number" && value > (mergedRooms[roomKey] || 0)) {
              mergedRooms[roomKey] = value;
              roomsUpdated = true;
            }
          }
        }
        if (roomsUpdated) {
          updates.roomCounts = mergedRooms;
          detected.roomCounts = true;
        }

        // Floor count — allow override if auto-detected (user hasn't manually set)
        const detectedFloors = detectionResult.parameters.floorCount;
        if (detectedFloors && (!proj.floorCount || parseInt(proj.floorCount) === 0 || proj.autoDetected?.floorCount)) {
          const floorNum = Math.floor(detectedFloors);
          const hasBasement = detectionResult.parameters.basementCount > 0;
          const hasLoft = detectionResult.parameters._hasLoft;
          const floors = [];
          if (hasBasement) floors.push({ label: "Basement", height: 10 });
          for (let i = 1; i <= floorNum; i++) floors.push({ label: `Floor ${i}`, height: i === 1 ? 14 : 12 });
          if (hasLoft) floors.push({ label: "Loft", height: 8 });
          updates.floorCount = String(floorNum);
          if (hasBasement) updates.basementCount = "1";
          updates.floors = floors;
          detected.floorCount = true;
        }

        // Building type — map to BUILDING_TYPES key
        if (detectionResult.parameters.buildingType && !proj.buildingType) {
          updates.buildingType =
            mapBuildingTypeKey(detectionResult.parameters.buildingType) || detectionResult.parameters.buildingType;
          detected.buildingType = true;
        }

        // Store confidence map
        if (detectionResult.confidence) {
          updates.parameterConfidence = detectionResult.confidence;
        }

        if (Object.keys(updates).length > 0) {
          updates.autoDetected = detected;
          useProjectStore.getState().setProject({ ...useProjectStore.getState().project, ...updates });
        }
      }

      // Store evidence in scan results for debugging
      if (detectionResult?.evidence?.length > 0) {
        useDrawingPipelineStore.getState().setScanResults({
          ...useDrawingPipelineStore.getState().scanResults,
          parameterEvidence: detectionResult.evidence,
          parameterTiming: detectionResult.timing,
        });
      }

      const paramCount = Object.keys(detectionResult?.parameters || {}).length;
      const evidenceCount = detectionResult?.evidence?.length || 0;
      console.log(`[scanRunner] Phase 2.6: ${paramCount} parameters from ${evidenceCount} evidence items`);
    } catch (err) {
      console.warn("[scanRunner] Phase 2.6 (parameter detection) failed:", err.message);
      // Non-critical — existing schedule extraction from Phase 2.5 still works
    }

    // ── Phase 3: Generate ROM (always runs — produces estimates from drawings + notes even without schedules) ──
    checkAbort();
    useNovaStore.getState().updateProgress(75, "Generating ROM estimate...");
    setScanProgress({ phase: "rom", current: 0, total: 1, message: "Generating ROM estimate..." });
    const proj = useProjectStore.getState().project;
    let effectiveSF = proj.projectSF;
    let sfEstimate = null;
    if (!effectiveSF || parseFloat(effectiveSF) === 0) {
      const pCtx = buildProjectContext({ project: proj, drawings: useDrawingPipelineStore.getState().drawings });
      sfEstimate = await estimateProjectSF({
        drawings: useDrawingPipelineStore.getState().drawings,
        schedules: validSchedules,
        projectContext: pCtx,
      });
      if (sfEstimate?.estimatedSF) effectiveSF = sfEstimate.estimatedSF;
    }
    const calibrationFactors = useDrawingPipelineStore
      .getState()
      .getCalibrationFactors(proj.jobType, proj.workType || "", proj.laborType || "");
    const buildingParams = {
      floorCount: proj.floorCount,
      basementCount: proj.basementCount,
      roomCounts: proj.roomCounts || {},
    };
    const baseline = generateBaselineROM(
      effectiveSF,
      proj.jobType,
      proj.workType || "",
      calibrationFactors,
      buildingParams,
    );
    if (sfEstimate?.estimatedSF) {
      baseline.sfEstimated = true;
      baseline.sfEstimateDetails = sfEstimate;
      baseline.sfMissing = false;
      baseline.projectSF = sfEstimate.estimatedSF;

      // Write estimated SF back to projectStore if user hasn't set it
      if (!useProjectStore.getState().project.projectSF) {
        const sfVal = String(Math.round(sfEstimate.estimatedSF));
        useProjectStore.getState().setProject({
          ...useProjectStore.getState().project,
          projectSF: sfVal,
          autoDetected: { ...useProjectStore.getState().project.autoDetected, projectSF: true },
        });
      }
    }
    const scheduleLineItems = await generateScheduleLineItems(validSchedules);

    setScanProgress({ phase: "rom", current: 0, total: 1, message: "Refining ROM estimates..." });
    const projectCtx = buildProjectContext({
      project: { ...proj, projectSF: effectiveSF || proj.projectSF },
      items: useItemsStore.getState().items,
      drawings: useDrawingPipelineStore.getState().drawings,
      specs: useDocumentManagementStore.getState().specs,
    });
    const romStart = Date.now();
    const augmentedROM = await augmentROMWithAI({
      baseline,
      scheduleItems: scheduleLineItems,
      projectContext: projectCtx,
      notesContext,
    });
    try {
      const resolvedJobType = proj.jobType || 'unknown';
      const resolvedSF = effectiveSF || proj.projectSF || 0;
      const { logAICall } = await import("@/nova/learning/evaluationLogger");
      logAICall({ phase: 'rom', model: 'sonnet', inputSummary: `${resolvedJobType} ${resolvedSF}SF`, aiResult: { totalMid: augmentedROM?.totals?.mid, divCount: Object.keys(augmentedROM?.divisions || {}).length }, latencyMs: Date.now() - romStart });
    } catch {}

    // ── Phase 3.1: Verify ROM (agent self-check) ──
    try {
      const { verifyROM } = await import("@/utils/scanVerifier");
      const calFactors = useDrawingPipelineStore.getState().getCalibrationFactors?.(proj.jobType, proj.workType || "", proj.laborType || "") || {};
      const romVerification = verifyROM(augmentedROM, effectiveSF, proj.jobType, calFactors);
      if (!romVerification.pass) {
        console.log(`[scanRunner] Phase 3.1: ROM verification flagged ${romVerification.issues.length} issues`);
        // Apply clamped adjustments
        for (const [divCode, adj] of Object.entries(romVerification.adjustments || {})) {
          if (augmentedROM?.divisions?.[divCode]) {
            const div = augmentedROM.divisions[divCode];
            if (adj.clampedMid !== undefined) {
              const ratio = adj.clampedMid / (div.perSF?.mid || 1);
              div.low = Math.round(div.low * ratio);
              div.mid = Math.round(div.mid * ratio);
              div.high = Math.round(div.high * ratio);
              if (div.perSF) {
                div.perSF.low = Math.round(div.perSF.low * ratio * 100) / 100;
                div.perSF.mid = Math.round(div.perSF.mid * ratio * 100) / 100;
                div.perSF.high = Math.round(div.perSF.high * ratio * 100) / 100;
              }
              div._verified = "adjusted";
            }
          }
        }
        // Recalculate totals after adjustments
        if (Object.keys(romVerification.adjustments || {}).length > 0) {
          let totalLow = 0, totalMid = 0, totalHigh = 0;
          for (const div of Object.values(augmentedROM.divisions || {})) {
            totalLow += div.low || 0;
            totalMid += div.mid || 0;
            totalHigh += div.high || 0;
          }
          augmentedROM.totals = { low: totalLow, mid: totalMid, high: totalHigh };
        }
      }
      augmentedROM._verificationResult = { pass: romVerification.pass, issueCount: romVerification.issues.length };
    } catch (verifyErr) {
      console.warn("[scanRunner] Phase 3.1 (ROM verification) non-critical:", verifyErr.message);
    }

    // ── Phase 3.5: Auto-populate scope outline (only for empty estimates) ──
    let scopeOutlineStats = null;
    checkAbort();

    // Auto-snapshot before scope items are added
    const preItems = useItemsStore.getState().items;
    if (preItems.length > 0) {
      try {
        const activeId = useUiStore.getState()?.activeEstimateId;
        if (activeId) {
          const preTotals = useItemsStore.getState().getTotals();
          const preProj = useProjectStore.getState().project;
          useSnapshotsStore
            .getState()
            .captureSnapshot(activeId, preItems, preTotals, {}, null, null, preProj, {
              label: "Pre-scan",
              trigger: "auto",
            });
        }
      } catch {
        /* snapshot non-critical */
      }
    }

    if (useItemsStore.getState().items.length === 0) {
      try {
        useNovaStore.getState().updateProgress(85, "Generating scope outline...");
        setScanProgress({ phase: "scope", current: 0, total: 1, message: "Generating scope outline..." });

        const scopeResult = await generateScopeOutline({
          scheduleLineItems,
          rom: augmentedROM,
          project: useProjectStore.getState().project,
          notesContext,
        });

        if (scopeResult.items.length > 0) {
          const { addElement } = useItemsStore.getState();
          const { divFromCode } = useProjectStore.getState();
          for (const item of scopeResult.items) {
            const division = item.division || divFromCode(item.code) || "";
            addElement(division, {
              code: item.code,
              name: item.description,
              unit: item.unit,
              quantity: item.quantity || 1,
              material: item.material || 0,
              labor: item.labor || 0,
              equipment: item.equipment || 0,
              subcontractor: item.subcontractor || 0,
              trade: autoTradeFromCode(item.code) || "",
            });
          }
          scopeOutlineStats = {
            totalItems: scopeResult.items.length,
            scheduleItems: scopeResult.scheduleItemCount,
            aiItems: scopeResult.aiItemCount,
          };
          console.log(
            `[scanRunner] Phase 3.5: Generated ${scopeResult.items.length} scope items ` +
              `(${scopeResult.scheduleItemCount} from schedules, ${scopeResult.aiItemCount} AI-generated)`,
          );
        }
      } catch (err) {
        console.warn("[scanRunner] Phase 3.5 (scope outline) failed:", err.message);
        // Non-critical — user can still add items manually
      }
    }

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
      drawingNotes: validNotesResults,
      notesContext,
      scopeOutline: scopeOutlineStats,
      timestamp: Date.now(),
    };
    // ── NOVA Intelligence Summary: what memory was applied ──
    try {
      const proj = useProjectStore.getState().project;
      const corrStats = useCorrectionStore.getState().getStats();
      const firmName = proj?.architect || proj?.engineer;
      const firmCtx = firmName ? useFirmMemoryStore.getState().buildFirmContext(firmName, 200) : "";
      results.novaIntelligence = {
        correctionsApplied: corrStats.totalCorrections,
        patternsLearned: corrStats.uniquePatterns,
        firmName: firmName || null,
        firmPatternsUsed: firmCtx ? firmCtx.split("\n").filter(l => l.trim()).length : 0,
        topCorrections: corrStats.topPatterns?.slice(0, 3).map(p => `${p.type}:${p.field} (${p.frequency}x)`) || [],
      };
    } catch { /* intelligence summary non-critical */ }

    setScanResults(results);
    setScanProgress({ phase: null, current: 0, total: 0, message: "" });

    // ── NOVA Firm Memory: learn patterns from this scan ──
    try {
      const proj = useProjectStore.getState().project;
      const firmName = proj.architect || proj.engineer;
      if (firmName) {
        const firmKey = useFirmMemoryStore
          .getState()
          .registerFirm(
            { architect: proj.architect, engineer: proj.engineer },
            proj.architect ? "architect" : "engineer",
          );
        if (firmKey) {
          useFirmMemoryStore.getState().learnFromScan(firmKey, results);
        }
      }
    } catch (e) {
      console.warn("[scanRunner] Firm memory learning failed:", e);
    }

    // Persist scan results to IndexedDB immediately
    // (auto-save doesn't watch scanResults, so we must save explicitly)
    try {
      await saveEstimate();
    } catch (e) {
      console.warn("[scanRunner] Post-scan save failed:", e);
    }

    const totalEntries = validSchedules.reduce((sum, s) => sum + s.entries.length, 0);
    const totalNotes = validNotesResults.reduce((s, r) => s + (r.notes?.length || 0), 0);
    const parts = [];
    if (totalEntries > 0) parts.push(`${totalEntries} items across ${validSchedules.length} schedules`);
    if (totalNotes > 0) parts.push(`${totalNotes} notes extracted`);
    if (augmentedROM?.totals)
      parts.push(
        `ROM $${Math.round(augmentedROM.totals.low / 1000)}K–$${Math.round(augmentedROM.totals.high / 1000)}K`,
      );
    if (scopeOutlineStats) parts.push(`${scopeOutlineStats.totalItems} scope items generated`);
    const scanMsg = parts.length > 0 ? `Scan complete: ${parts.join(" · ")}` : "Scan complete: drawings analyzed";
    showToast(scanMsg);
    useNovaStore.getState().completeTask(scanMsg);
    useNovaStore.getState().notify(scanMsg, "success");

    // Clear abort controller on success
    try {
      useDrawingPipelineStore.setState({ scanAbortController: null });
    } catch {
      /* ok */
    }

    onComplete?.(results);
    return results;
  } catch (err) {
    // Handle user-initiated stop gracefully
    if (err.message === "__SCAN_STOPPED__" || abortSignal.aborted) {
      setScanProgress({ phase: null, current: 0, total: 0, message: "" });
      showToast("Scan stopped");
      useNovaStore.getState().completeTask("Scan stopped by user");
      onError?.("Scan stopped");
      return null;
    }
    setScanError(err.message);
    setScanProgress({ phase: null, current: 0, total: 0, message: "" });
    showToast(`Scan failed: ${err.message}`, "error");
    useNovaStore.getState().failTask(err.message);
    useNovaStore.getState().notify(`Scan failed: ${err.message}`, "warn");
    onError?.(err.message);
    return null;
  }
}
