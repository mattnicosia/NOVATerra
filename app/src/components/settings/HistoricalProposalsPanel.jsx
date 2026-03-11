// Cost History Panel — Unified view of all estimates + historical proposals
// Lives on Settings page, feeds learning records to scanStore for calibration

import { useState, useRef, useMemo, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useScanStore } from "@/stores/scanStore";
import { useUiStore } from "@/stores/uiStore";
import { callAnthropic, pdfBlock } from "@/utils/ai";
import { generateBaselineROM, computeCalibration } from "@/utils/romEngine";
import {
  saveMasterData,
  saveUploadQueue,
  savePdfBase64,
  loadPdfBase64,
  deletePdfBase64,
  deletePdfBase64Batch,
} from "@/hooks/usePersistence";
import { mapStatusToOutcome, migrateJobType } from "@/utils/costHistoryMigration";
import { uid } from "@/utils/format";
import {
  BUILDING_TYPES,
  WORK_TYPES,
  OUTCOME_STATUSES,
  LOST_REASONS,
  STRUCTURAL_SYSTEMS,
  DELIVERY_METHODS,
  getBuildingTypeLabel,
  getWorkTypeLabel,
  getOutcomeInfo,
  getStructuralSystemLabel,
  getDeliveryMethodLabel,
} from "@/constants/constructionTypes";
import { DEFAULT_LABOR_TYPES } from "@/utils/laborTypes";
import { resolveLocationFactors } from "@/constants/locationFactors";
import { extractYear, getEscalationFactor, formatEscalation } from "@/utils/costEscalation";
import { getCurrentYear } from "@/constants/constructionCostIndex";
import {
  MARKUP_PRESETS,
  MARKUP_CATEGORIES,
  classifyMarkup,
  getMarkupCategory,
  groupMarkupsByCategory,
} from "@/constants/markupTaxonomy";
import CostHistoryEntryForm from "@/components/costHistory/CostHistoryEntryForm";
import CostHistoryAnalytics from "@/components/costHistory/CostHistoryAnalytics";
import NovaOrb from "@/components/dashboard/NovaOrb";
import Sec from "@/components/shared/Sec";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt } from "@/utils/styles";

const fmtCost = n => {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString();
};

// CSI divisions for detail view
const ROM_DIVISIONS = [
  { code: "01", label: "General Requirements" },
  { code: "02", label: "Existing Conditions/Demo" },
  { code: "03", label: "Concrete" },
  { code: "04", label: "Masonry" },
  { code: "05", label: "Metals" },
  { code: "06", label: "Wood & Plastics" },
  { code: "07", label: "Thermal & Moisture" },
  { code: "08", label: "Openings" },
  { code: "09", label: "Finishes" },
  { code: "10", label: "Specialties" },
  { code: "11", label: "Equipment" },
  { code: "14", label: "Conveying" },
  { code: "21", label: "Fire Suppression" },
  { code: "22", label: "Plumbing" },
  { code: "23", label: "HVAC" },
  { code: "26", label: "Electrical" },
  { code: "27", label: "Communications" },
  { code: "28", label: "Electronic Safety" },
  { code: "31", label: "Earthwork" },
  { code: "32", label: "Exterior Improvements" },
  { code: "33", label: "Utilities" },
];

// Module-level map: queue-id → base64 string (eagerly read at selection time)
// Eager reading prevents File objects from being invalidated when the input is cleared
const base64DataMap = new Map();

// Read a File to base64 string
function readFileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file || !(file instanceof File || file instanceof Blob)) {
      reject(new Error(`Invalid file object: ${typeof file}`));
      return;
    }
    if (file.size === 0) {
      reject(new Error(`File "${file.name}" is empty (0 bytes)`));
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      if (!dataUrl || typeof dataUrl !== "string") {
        reject(new Error(`FileReader returned invalid result for "${file.name}"`));
        return;
      }
      const base64 = dataUrl.split(",")[1] || "";
      if (!base64) {
        reject(
          new Error(
            `Empty base64 after reading "${file.name}" (${file.size} bytes, dataUrl length: ${dataUrl.length})`,
          ),
        );
        return;
      }
      console.log(
        `[BatchUpload] Read "${file.name}": ${file.size} bytes → ${(base64.length / 1024).toFixed(0)} KB base64`,
      );
      resolve(base64);
    };
    reader.onerror = () =>
      reject(new Error(`FileReader error for "${file.name}": ${reader.error?.message || "unknown"}`));
    reader.readAsDataURL(file);
  });
}

export default function HistoricalProposalsPanel() {
  const C = useTheme();
  const T = C.T;
  const showToast = useUiStore(s => s.showToast);

  // Data sources
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const historicalProposals = useMasterDataStore(s => s.masterData.historicalProposals || []);
  const addHistoricalProposal = useMasterDataStore(s => s.addHistoricalProposal);
  const updateHistoricalProposal = useMasterDataStore(s => s.updateHistoricalProposal);
  const removeHistoricalProposal = useMasterDataStore(s => s.removeHistoricalProposal);
  const updateProposalOutcome = useMasterDataStore(s => s.updateProposalOutcome);
  const learningRecords = useScanStore(s => s.learningRecords);
  const addLearningRecord = useScanStore(s => s.addLearningRecord);
  const calibrationFactors = useScanStore.getState().getCalibrationFactors();

  // Upload queue (store-backed)
  const uploadQueue = useMasterDataStore(s => s.pdfUploadQueue);
  const addToUploadQueue = useMasterDataStore(s => s.addToUploadQueue);
  const updateQueueItem = useMasterDataStore(s => s.updateQueueItem);
  const removeQueueItem = useMasterDataStore(s => s.removeQueueItem);
  const clearSavedFromQueue = useMasterDataStore(s => s.clearSavedFromQueue);
  const clearFailedFromQueue = useMasterDataStore(s => s.clearFailedFromQueue);

  // UI state
  const [showForm, setShowForm] = useState(false); // "manual" | "pdf-review" | false
  const [formInitial, setFormInitial] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [reviewingQueueId, setReviewingQueueId] = useState(null); // queue item being reviewed
  const [reviewPdfBase64, setReviewPdfBase64] = useState(null); // base64 for PDF preview in form
  const [expandedId, setExpandedId] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showQueue, setShowQueue] = useState(true);
  const pdfRef = useRef(null);
  const extractingRef = useRef(false); // legacy flag — now managed by worker pool
  const activeWorkersRef = useRef(0);
  const pausedRef = useRef(false);
  const batchStatsRef = useRef({ startTime: null, completed: 0, lastItemMs: 0 });
  const [isPaused, setIsPaused] = useState(false); // for UI re-render on pause toggle

  // Filters
  const [filterBuildingType, setFilterBuildingType] = useState("");
  const [filterWorkType, setFilterWorkType] = useState("");
  const [filterLaborType, setFilterLaborType] = useState("");
  const [filterDeliveryMethod, setFilterDeliveryMethod] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterSearch, setFilterSearch] = useState("");

  // ── Unified data ──
  const unifiedEntries = useMemo(() => {
    const fromEstimates = estimatesIndex.map(est => ({
      id: est.id,
      source: "estimate",
      name: est.name,
      client: est.client,
      architect: est.architect || "",
      date: est.lastModified,
      projectSF: est.projectSF || 0,
      buildingType: est.buildingType || migrateJobType(est.jobType).buildingType,
      workType: est.workType || migrateJobType(est.jobType).workType,
      totalCost: est.grandTotal || 0,
      divisions: est.divisionTotals || {},
      outcome: mapStatusToOutcome(est.status),
      outcomeMetadata: est.outcomeMetadata || {},
      laborType: est.laborType || "",
      zipCode: est.zipCode || "",
      stories: est.stories || 0,
      structuralSystem: est.structuralSystem || "",
      deliveryMethod: est.deliveryMethod || "",
      estimateId: est.id,
      status: est.status,
    }));

    const fromHistory = historicalProposals.map(p => ({
      id: p.id,
      source: p.source || "manual",
      name: p.name,
      client: p.client || "",
      architect: p.architect || "",
      date: p.date,
      projectSF: p.projectSF || 0,
      buildingType: p.buildingType || migrateJobType(p.jobType).buildingType,
      workType: p.workType || migrateJobType(p.jobType).workType,
      totalCost: p.totalCost || 0,
      divisions: p.divisions || {},
      markups: p.markups || [],
      outcome: p.outcome || "pending",
      outcomeMetadata: p.outcomeMetadata || {},
      laborType: p.laborType || "",
      zipCode: p.zipCode || "",
      stories: p.stories || 0,
      structuralSystem: p.structuralSystem || "",
      deliveryMethod: p.deliveryMethod || "",
      proposalType: p.proposalType || "gc",
      sourceFileName: p.sourceFileName,
      notes: p.notes || "",
    }));

    return [...fromEstimates, ...fromHistory];
  }, [estimatesIndex, historicalProposals]);

  // Apply filters
  const filteredEntries = useMemo(() => {
    return unifiedEntries.filter(entry => {
      if (filterBuildingType && entry.buildingType !== filterBuildingType) return false;
      if (filterWorkType && entry.workType !== filterWorkType) return false;
      if (filterLaborType && entry.laborType !== filterLaborType) return false;
      if (filterDeliveryMethod && entry.deliveryMethod !== filterDeliveryMethod) return false;
      if (filterOutcome && entry.outcome !== filterOutcome) return false;
      if (filterSearch) {
        const s = filterSearch.toLowerCase();
        if (
          !entry.name.toLowerCase().includes(s) &&
          !entry.client.toLowerCase().includes(s) &&
          !entry.architect.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [
    unifiedEntries,
    filterBuildingType,
    filterWorkType,
    filterLaborType,
    filterDeliveryMethod,
    filterOutcome,
    filterSearch,
  ]);

  // ── Learning record generation ──
  const generateLearningFromProposal = async proposal => {
    const bt = proposal.buildingType || proposal.jobType || "commercial-office";
    const wt = proposal.workType || "";
    const romPrediction = generateBaselineROM(proposal.projectSF, bt, wt, {});

    const proposalYear = extractYear(proposal.date);
    const currentYr = getCurrentYear();
    const actuals = { divisions: {} };
    Object.entries(proposal.divisions || {}).forEach(([div, cost]) => {
      const c = parseFloat(cost);
      if (c > 0) {
        const factor = getEscalationFactor(proposalYear, currentYr);
        actuals.divisions[div] = Math.round(c * factor);
      }
    });

    const calibration = computeCalibration(romPrediction, actuals);

    // Compute markup patterns for future analytics
    const mkps = proposal.markups || [];
    const divTotal = Object.values(actuals.divisions).reduce((s, v) => s + v, 0);
    const mkpTotal = mkps.reduce((s, m) => s + (m.calculatedAmount || 0), 0);

    await addLearningRecord({
      source: "historical-proposal",
      proposalId: proposal.id,
      proposalName: proposal.name,
      projectSF: proposal.projectSF,
      buildingType: bt,
      workType: wt,
      jobType: bt,
      laborType: proposal.laborType || "",
      zipCode: proposal.zipCode || "",
      stories: proposal.stories || 0,
      structuralSystem: proposal.structuralSystem || "",
      deliveryMethod: proposal.deliveryMethod || "",
      originalYear: proposalYear,
      normalizedToYear: currentYr,
      romPrediction: {
        divisions: Object.fromEntries(
          Object.entries(romPrediction.divisions).map(([div, data]) => [div, { mid: data.total.mid }]),
        ),
      },
      actuals,
      calibration,
      // Markup patterns — enables "avg O&P for this building type" intelligence
      markupPatterns:
        mkpTotal > 0
          ? {
              markupTotal: mkpTotal,
              divisionTotal: divTotal,
              markupPct: divTotal > 0 ? Math.round((mkpTotal / divTotal) * 1000) / 10 : 0,
              items: mkps.map(m => {
                const tax = classifyMarkup(m.key);
                return {
                  key: m.key,
                  type: m.type,
                  inputValue: m.inputValue,
                  calculatedAmount: m.calculatedAmount,
                  category: tax.category,
                  comparable: tax.comparable,
                };
              }),
              // Pre-computed category totals for fast aggregation
              byCategory: (() => {
                const groups = {};
                mkps.forEach(m => {
                  const cat = classifyMarkup(m.key).category;
                  groups[cat] = (groups[cat] || 0) + (m.calculatedAmount || 0);
                });
                return groups;
              })(),
            }
          : undefined,
    });
    return calibration;
  };

  // ── Extract single PDF via AI ──
  const extractProposalPdf = async (base64, fileName) => {
    if (!base64 || base64.length < 100) {
      throw new Error(`Cannot extract "${fileName}": base64 is empty or too short (${base64?.length || 0} chars)`);
    }
    console.log(`[BatchUpload] Sending "${fileName}" to AI (${(base64.length / 1024).toFixed(0)} KB base64)`);
    const response = await callAnthropic({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            pdfBlock(base64),
            {
              type: "text",
              text: `You are analyzing a construction proposal/bid document. Extract the following information:

1. **projectName**: The project name
2. **client**: The client/owner name
3. **architect**: The architect firm name (if mentioned)
4. **projectSF**: Building square footage (number only)
5. **buildingType**: Classify as one of: ${BUILDING_TYPES.map(b => `"${b.key}"`).join(", ")}
6. **workType**: Classify as one of: ${WORK_TYPES.map(w => `"${w.key}"`).join(", ")}
7. **totalCost**: Total bid/proposal amount (number only, no $ or commas)
8. **divisions**: Object mapping CSI division codes to dollar amounts:
   "01": General Requirements, "02": Demo, "03": Concrete, "04": Masonry,
   "05": Metals, "06": Wood/Carpentry, "07": Thermal & Moisture, "08": Openings,
   "09": Finishes, "10": Specialties, "11": Equipment, "14": Conveying,
   "21": Fire Suppression, "22": Plumbing, "23": HVAC, "26": Electrical,
   "27": Communications, "28": Electronic Safety, "31": Earthwork,
   "32": Exterior, "33": Utilities
9. **laborType**: Classify as one of: "open_shop", "union", "prevailing_wage".
   Look for prevailing wage requirements, Davis-Bacon language, union labor clauses.
   Government and public school projects are typically "prevailing_wage". Default to "open_shop" if unclear.
10. **zipCode**: The project zip code (extract from project address). 5 digits only.
11. **stories**: Number of stories/floors above grade (number only). Default to 1 if not stated.
12. **structuralSystem**: Classify as one of: ${STRUCTURAL_SYSTEMS.map(s => `"${s.key}"`).join(", ")}.
    Infer from structural scope section or division breakdown.
13. **deliveryMethod**: Classify as one of: ${DELIVERY_METHODS.map(d => `"${d.key}"`).join(", ")}.
    Look at bid instructions, contract type, or cover page.
14. **markups**: Array of below-the-line items (indirect costs) found in the proposal — costs ABOVE the division subtotal that make up the total bid.
15. **proposalType**: "gc" if this is a General Contractor/CM proposal (multiple divisions, below-the-line markups like O&P/GC/Bond, covers the whole project), or "sub" if this is a Subcontractor proposal (single trade/division, scope inclusions/exclusions, no GC markups). Default to "gc" if unclear.

For each markup found, extract:
- "key": one of:
  MARGIN: "fee" (profit only), "op" (overhead & profit combined), "overhead" (overhead alone), "profit" (profit alone)
  GENERAL: "gc" (General Conditions — duration-dependent site costs), "gr" (General Requirements — flat fee project resources)
  PROJECT COSTS: "bond", "permit", "insurance", "contingency", "precon" (preconstruction services), "escalation", "design" (design services — Design-Build only)
  TAX: "tax" (sales tax)
  If none match, use "custom"
- "label": the exact label used in the proposal (e.g. "General Contractor's Fee", "Builder's Risk Insurance")
- "type": "dollar" if a flat dollar amount, "percent" if expressed as a percentage
- "inputValue": the number (dollar amount or percentage without % sign)
- "category": one of "margin", "general", "project-cost", "tax", "custom"

CLASSIFICATION RULES:
- "O&P" or "Overhead & Profit" → key: "op", category: "margin"
- "Fee" alone (without "overhead") → key: "fee", category: "margin" (Fee = profit only)
- If BOTH overhead and profit are separate lines → use "overhead" and "profit" respectively
- "General Conditions" → key: "gc", category: "general"
- "General Requirements" → key: "gr", category: "general"
- "Mobilization" is a breakout of GR/GC — include it in "gc" or "gr" based on context
- "Bond" or "Payment & Performance Bond" → key: "bond", category: "project-cost"
- "Permit" or "Permit Fees" → key: "permit", category: "project-cost"
- "Insurance", "GL Insurance", "Builder's Risk" → key: "insurance", category: "project-cost"
- "Preconstruction" → key: "precon", category: "project-cost"
- "Design Fee/Services" → key: "design", category: "project-cost"

IMPORTANT: If General Conditions/Requirements costs appear as BOTH a CSI Division 01 line AND a separate below-the-line markup, only include them in ONE place — prefer divisions["01"]. Goal: sum(divisions) + sum(markups calculated as $) ≈ totalCost.

Return ONLY a JSON object. Example:
{
  "projectName": "ABC Office Renovation",
  "client": "ABC Corp",
  "architect": "Smith & Associates",
  "projectSF": 25000,
  "buildingType": "commercial-office",
  "workType": "renovation",
  "totalCost": 850000,
  "divisions": { "03": 45000, "05": 30000, "09": 60000, "22": 35000, "23": 55000, "26": 40000 },
  "markups": [
    { "key": "gc", "label": "General Conditions", "type": "dollar", "inputValue": 120000, "category": "general" },
    { "key": "op", "label": "Overhead & Profit", "type": "percent", "inputValue": 15, "category": "margin" },
    { "key": "insurance", "label": "GL Insurance", "type": "percent", "inputValue": 2.5, "category": "project-cost" }
  ],
  "laborType": "open_shop",
  "zipCode": "10001",
  "stories": 3,
  "structuralSystem": "steel-frame",
  "deliveryMethod": "hard-bid"
}`,
            },
          ],
        },
      ],
      system:
        "You are NOVA, the AI construction intelligence inside NOVATerra. Analyze this historical proposal to extract cost data. Be precise with division costs vs below-the-line markups. Return only valid JSON.",
    });

    // Parse response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!parsed || !parsed.projectName) {
      throw new Error(`Could not extract proposal data from "${fileName}"`);
    }

    // Compute calculatedAmount for markups
    const extractedDivSum = Object.values(parsed.divisions || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const processedMarkups = (parsed.markups || []).map(m => {
      const tax = classifyMarkup(m.key || "custom");
      return {
        id: uid(),
        key: m.key || "custom",
        label: m.label || tax.label || "",
        category: m.category || tax.category,
        type: m.type || "dollar",
        inputValue: m.inputValue || 0,
        calculatedAmount:
          m.type === "percent"
            ? Math.round((extractedDivSum * (parseFloat(m.inputValue) || 0)) / 100)
            : parseFloat(m.inputValue) || 0,
      };
    });

    return {
      name: parsed.projectName || fileName,
      client: parsed.client || "",
      architect: parsed.architect || "",
      date: new Date().toISOString().split("T")[0],
      projectSF: parsed.projectSF != null ? String(parsed.projectSF) : "",
      buildingType: parsed.buildingType || "",
      workType: parsed.workType || "",
      totalCost: parsed.totalCost != null ? String(parsed.totalCost) : "",
      divisions: parsed.divisions || {},
      markups: processedMarkups,
      laborType: parsed.laborType || "",
      zipCode: parsed.zipCode || "",
      stories: parsed.stories != null ? String(parsed.stories) : "",
      structuralSystem: parsed.structuralSystem || "",
      deliveryMethod: parsed.deliveryMethod || "",
      proposalType: parsed.proposalType || "gc",
      source: "pdf",
      sourceFileName: fileName,
      outcome: "pending",
      outcomeMetadata: {},
    };
  };

  // ── Parallel worker pool (replaces sequential processQueue) ──
  const CONCURRENCY = 3;

  const processQueue = useCallback(async () => {
    // Init batch stats on first call
    if (!batchStatsRef.current.startTime) {
      batchStatsRef.current = { startTime: Date.now(), completed: 0, lastItemMs: 0 };
    }

    // Spawn workers up to CONCURRENCY limit
    const spawnWorker = async () => {
      activeWorkersRef.current++;
      try {
        while (true) {
          // Check pause
          if (pausedRef.current) {
            break; // worker exits; resume will re-spawn
          }

          const queue = useMasterDataStore.getState().pdfUploadQueue;
          const next = queue.find(q => q.status === "queued");
          if (!next) break; // no work left

          // Load base64 from IndexedDB if not in memory (e.g. after page refresh)
          if (!base64DataMap.has(next.id)) {
            const stored = await loadPdfBase64(next.id);
            if (stored) base64DataMap.set(next.id, stored);
          }

          updateQueueItem(next.id, { status: "extracting" });
          const itemStart = Date.now();

          try {
            const base64 = base64DataMap.get(next.id);
            if (!base64 || base64.length < 100) {
              throw new Error(`PDF data missing for "${next.fileName}" — please re-upload file`);
            }
            console.log(
              `[BatchUpload] Sending "${next.fileName}" to AI (${(base64.length / 1024).toFixed(0)} KB base64)`,
            );
            const extracted = await extractProposalPdf(base64, next.fileName);
            updateQueueItem(next.id, { status: "extracted", extractedData: extracted });
            // Keep base64 in memory for PDF preview during review
            // It will be freed when the user saves/closes the review form
            batchStatsRef.current.completed++;
            batchStatsRef.current.lastItemMs = Date.now() - itemStart;
          } catch (err) {
            console.error("[CostHistory] PDF extraction error:", err);
            const is429 = err?.message?.includes("429") || err?.message?.toLowerCase().includes("rate");
            const isOverloaded = err?.message?.includes("529") || err?.message?.toLowerCase().includes("overloaded");
            if (is429 || isOverloaded) {
              // Rate limited or overloaded — exponential backoff and retry
              const retries = next.retryCount || 0;
              const backoff = Math.min(5000 * Math.pow(2, retries), 60000); // 5s, 10s, 20s, 40s, 60s max
              console.log(
                `[BatchUpload] ${is429 ? "429" : "529"} on "${next.fileName}", backoff ${backoff / 1000}s (retry #${retries + 1})`,
              );
              updateQueueItem(next.id, { status: "queued", error: null, retryCount: retries + 1 });
              await new Promise(r => setTimeout(r, backoff));
            } else {
              updateQueueItem(next.id, { status: "failed", error: err.message || "Extraction failed" });
            }
          }
          await saveUploadQueue();
        }
      } finally {
        activeWorkersRef.current--;
      }
    };

    // Launch workers up to CONCURRENCY (don't exceed already-running ones)
    const toSpawn = CONCURRENCY - activeWorkersRef.current;
    for (let i = 0; i < toSpawn; i++) {
      spawnWorker(); // fire-and-forget — each loops independently
    }
  }, [updateQueueItem]);

  // ── Auto-extract on file selection (with resume matching) ──
  const handlePdfFilesSelected = async files => {
    try {
      if (!files || files.length === 0) return;
      const allFiles = Array.isArray(files) ? files : Array.from(files);
      console.log("[BatchUpload] Received", allFiles.length, "files from picker");
      const MAX_PDF_SIZE = 25 * 1024 * 1024; // 25 MB raw — Anthropic limit is 32 MB for full request
      const fileArray = allFiles.filter(f => f.name.toLowerCase().endsWith(".pdf"));
      console.log("[BatchUpload] Filtered to", fileArray.length, "PDFs");
      if (fileArray.length === 0) {
        showToast("No PDF files found in selection", "error");
        return;
      }

      const existingQueue = useMasterDataStore.getState().pdfUploadQueue;
      const newItems = [];
      let resumed = 0;
      let skipped = 0;
      let oversized = 0;
      let readErrors = 0;

      // Eagerly read ALL files to base64 BEFORE clearing the file input.
      // This prevents a browser bug where clearing the input (e.target.value = "")
      // can invalidate File objects, making them read as 0 bytes.
      // Read in batches of 10 to avoid browser memory pressure on large folders.
      const BATCH_SIZE = 10;
      const readResults = [];
      for (let i = 0; i < fileArray.length; i += BATCH_SIZE) {
        const batch = fileArray.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(
          batch.map(async file => {
            if (file.size > MAX_PDF_SIZE) return { file, skip: "oversized" };
            if (file.size === 0) return { file, skip: "empty" };
            try {
              const base64 = await readFileToBase64(file);
              return { file, base64 };
            } catch (err) {
              console.error(`[BatchUpload] Failed to read "${file.name}":`, err.message);
              return { file, skip: "read_error", error: err.message };
            }
          }),
        );
        readResults.push(...batchResults);
      }

      for (const result of readResults) {
        const { file, base64, skip, error } =
          result.status === "fulfilled" ? result.value : { file: null, skip: "rejected" };
        if (!file) continue;

        if (skip === "oversized") {
          console.warn(
            "[BatchUpload] Skipping oversized file:",
            file.name,
            `(${(file.size / 1024 / 1024).toFixed(1)} MB)`,
          );
          oversized++;
          continue;
        }
        if (skip === "empty") {
          console.warn("[BatchUpload] Skipping empty file:", file.name);
          readErrors++;
          continue;
        }
        if (skip === "read_error") {
          showToast(`Could not read "${file.name}": ${error}`, "error");
          readErrors++;
          continue;
        }

        // Resume matching: find existing queue entry by fileName + fileSize
        const match = existingQueue.find(q => q.fileName === file.name && q.fileSize === file.size);

        if (match) {
          if (match.status === "extracted" && !match.extractedData) {
            // Status says extracted but data was lost (old persistence stripped it) — re-extract
            base64DataMap.set(match.id, base64);
            savePdfBase64(match.id, base64);
            updateQueueItem(match.id, { status: "queued", error: null });
            resumed++;
            continue;
          }
          if (match.status === "extracted" || match.status === "saved") {
            // Already extracted — still bind base64 for PDF preview if missing
            if (!base64DataMap.has(match.id)) {
              base64DataMap.set(match.id, base64);
              savePdfBase64(match.id, base64);
            }
            skipped++;
            continue;
          }
          // Bind eagerly-read base64 to existing queue item
          base64DataMap.set(match.id, base64);
          savePdfBase64(match.id, base64); // persist for PDF preview across refreshes
          if (match.status === "failed") {
            updateQueueItem(match.id, { status: "queued", error: null });
          }
          resumed++;
        } else {
          // New file — create queue entry with base64 already read
          const id = uid();
          base64DataMap.set(id, base64);
          savePdfBase64(id, base64); // persist for PDF preview across refreshes
          newItems.push({
            id,
            fileName: file.name,
            fileSize: file.size,
            status: "queued",
            error: null,
            extractedData: null,
            addedAt: Date.now(),
          });
        }
      }

      if (newItems.length > 0) addToUploadQueue(newItems);
      console.log(
        "[BatchUpload] Queued:",
        newItems.length,
        "new,",
        resumed,
        "resumed,",
        skipped,
        "skipped,",
        readErrors,
        "read errors. Total queue:",
        useMasterDataStore.getState().pdfUploadQueue.length,
      );
      setShowQueue(true);
      await saveUploadQueue();

      // Toast feedback
      if (oversized > 0) {
        showToast(`Skipped ${oversized} file${oversized !== 1 ? "s" : ""} over 25 MB (too large for API)`, "error");
      }
      if (resumed > 0 || skipped > 0) {
        showToast(`Resumed ${resumed} pending, ${newItems.length} new, ${skipped} already done`);
      } else if (newItems.length > 0) {
        showToast(`Queued ${newItems.length} PDF${newItems.length !== 1 ? "s" : ""} for extraction`);
      }

      // Start worker pool (base64 already read — workers use stored data)
      processQueue();
    } catch (err) {
      console.error("[BatchUpload] Error in handlePdfFilesSelected:", err);
      showToast(`Upload error: ${err.message}`, "error");
    }
  };

  // ── Folder picker handler ──

  // ── Retry a failed extraction ──
  const handleRetry = queueItem => {
    if (!base64DataMap.has(queueItem.id)) {
      // File reference lost (page refresh) — need re-select folder
      showToast(`File data lost for "${queueItem.fileName}" — please re-select folder`, "error");
      return;
    }
    updateQueueItem(queueItem.id, { status: "queued", error: null });
    processQueue();
  };

  // ── Retry all failed items ──
  const handleRetryAll = () => {
    const queue = useMasterDataStore.getState().pdfUploadQueue;
    let retried = 0;
    queue.forEach(q => {
      if (q.status === "failed" && base64DataMap.has(q.id)) {
        updateQueueItem(q.id, { status: "queued", error: null });
        retried++;
      }
    });
    if (retried > 0) {
      showToast(`Retrying ${retried} failed item${retried !== 1 ? "s" : ""}`);
      processQueue();
    } else {
      showToast("File references lost — use 'Clear Failed' then re-upload folder", "error");
    }
  };

  // ── Pause / Resume ──
  const handleTogglePause = () => {
    const newState = !pausedRef.current;
    pausedRef.current = newState;
    setIsPaused(newState);
    if (!newState) {
      // Resuming — restart workers
      processQueue();
    }
  };

  // ── Batch accept: save all extracted items at once ──
  const handleBatchAccept = async () => {
    const queue = useMasterDataStore.getState().pdfUploadQueue;
    const extracted = queue.filter(q => q.status === "extracted" && q.extractedData);
    if (extracted.length === 0) return;

    for (const q of extracted) {
      addHistoricalProposal({
        ...q.extractedData,
        source: "pdf",
        sourceFileName: q.fileName,
      });
      updateQueueItem(q.id, { status: "saved" });
    }
    await saveMasterData();
    await saveUploadQueue();
    showToast(`Saved ${extracted.length} proposal${extracted.length !== 1 ? "s" : ""} to Cost History`);

    // Generate learning records in background (non-blocking)
    setTimeout(async () => {
      const proposals = useMasterDataStore.getState().masterData.historicalProposals || [];
      for (const q of extracted) {
        const match = proposals.find(p => p.sourceFileName === q.fileName);
        if (match) {
          try {
            await generateLearningFromProposal(match);
          } catch (e) {
            console.warn("Learning gen error:", e);
          }
        }
      }
    }, 100);
  };

  // ── Review an extracted queue item ──
  const handleReviewQueueItem = async queueItem => {
    if (!queueItem.extractedData) {
      // Data lost (old persistence stripped it) — need re-upload to re-extract
      showToast(`Data lost for "${queueItem.fileName}" — re-upload the file to re-extract`, "error");
      return;
    }
    setFormInitial(queueItem.extractedData);
    setEditingId(null);
    setReviewingQueueId(queueItem.id);
    // Try in-memory first, then fall back to IndexedDB (survives page refresh)
    let b64 = base64DataMap.get(queueItem.id) || null;
    if (!b64) b64 = await loadPdfBase64(queueItem.id);
    setReviewPdfBase64(b64);
    setShowForm("pdf-review");
  };

  // ── Manual entry save / PDF review save ──
  const handleSaveEntry = async formData => {
    const proposal = {
      ...formData,
      source: formData.source || "manual",
    };

    if (editingId) {
      updateHistoricalProposal(editingId, proposal);
      showToast(`Updated "${formData.name}"`);
    } else {
      addHistoricalProposal(proposal);
      showToast(`Added "${formData.name}" to Cost History`);
    }

    // Mark queue item as saved (if reviewing from queue)
    if (reviewingQueueId) {
      updateQueueItem(reviewingQueueId, { status: "saved" });
      await saveUploadQueue();
    }

    // Auto-generate learning record if we have division data
    const hasDivisions = Object.keys(formData.divisions || {}).length > 0;
    if (hasDivisions && formData.projectSF > 0) {
      const latest = useMasterDataStore.getState().masterData.historicalProposals;
      const saved = editingId ? latest.find(p => p.id === editingId) : latest[latest.length - 1];
      if (saved) {
        await generateLearningFromProposal(saved);
        showToast(`NOVA calibration data generated`);
      }
    }

    await saveMasterData();
    setShowForm(false);
    setFormInitial(null);
    setEditingId(null);

    // Auto-open next extracted item from queue
    if (reviewingQueueId) {
      // Free base64 memory + IndexedDB for the saved item
      base64DataMap.delete(reviewingQueueId);
      deletePdfBase64(reviewingQueueId);
      setReviewPdfBase64(null);
      setReviewingQueueId(null);
      const queue = useMasterDataStore.getState().pdfUploadQueue;
      const nextExtracted = queue.find(q => q.status === "extracted" && q.extractedData);
      if (nextExtracted) {
        setTimeout(() => handleReviewQueueItem(nextExtracted), 200);
      }
    }
  };

  // ── Delete ──
  const handleDelete = async (id, source) => {
    if (source === "estimate") return;
    removeHistoricalProposal(id);
    await saveMasterData();
    showToast("Entry removed from Cost History");
  };

  // ── Edit ──
  const handleEdit = entry => {
    if (entry.source === "estimate") return;
    const p = historicalProposals.find(hp => hp.id === entry.id);
    if (!p) return;
    setFormInitial({
      name: p.name,
      client: p.client || "",
      architect: p.architect || "",
      date: p.date || "",
      projectSF: p.projectSF != null ? String(p.projectSF) : "",
      buildingType: p.buildingType || "",
      workType: p.workType || "",
      totalCost: p.totalCost != null ? String(p.totalCost) : "",
      divisions: p.divisions || {},
      markups: p.markups || [],
      laborType: p.laborType || "",
      zipCode: p.zipCode || "",
      stories: p.stories != null ? String(p.stories) : "",
      structuralSystem: p.structuralSystem || "",
      deliveryMethod: p.deliveryMethod || "",
      outcome: p.outcome || "pending",
      outcomeMetadata: p.outcomeMetadata || {},
      notes: p.notes || "",
      source: p.source || "manual",
      sourceFileName: p.sourceFileName || "",
    });
    setEditingId(entry.id);
    setReviewingQueueId(null);
    setShowForm("edit");
  };

  // ── Recalibrate ──
  const handleRecalibrate = async entry => {
    const proposal =
      entry.source === "estimate"
        ? {
            id: entry.id,
            projectSF: entry.projectSF,
            buildingType: entry.buildingType,
            workType: entry.workType,
            divisions: entry.divisions,
            markups: entry.markups || [],
            name: entry.name,
          }
        : historicalProposals.find(p => p.id === entry.id);
    if (!proposal) return;
    await generateLearningFromProposal(proposal);
    showToast(`NOVA recalibrated "${entry.name}"`);
  };

  // ── Quick outcome change ──
  const handleOutcomeChange = async (entry, newOutcome) => {
    if (entry.source === "estimate") return;
    updateProposalOutcome(entry.id, newOutcome, {});
    await saveMasterData();
  };

  // Stats
  const factorCount = Object.keys(calibrationFactors).length;

  // Queue stats
  const queueActive = uploadQueue.length > 0;
  const queueExtracted = uploadQueue.filter(q => q.status === "extracted").length;
  const queueExtracting = uploadQueue.filter(q => q.status === "extracting").length;
  const queueSaved = uploadQueue.filter(q => q.status === "saved").length;
  const queueFailed = uploadQueue.filter(q => q.status === "failed").length;
  const queueQueued = uploadQueue.filter(q => q.status === "queued").length;
  const queueTotal = uploadQueue.length;
  const queueDone = queueExtracted + queueSaved;
  const queueProcessing = queueDone + queueFailed;
  const batchMode = queueTotal > 5; // show batch UI for bulk uploads
  const batchPct = queueTotal > 0 ? Math.round((queueProcessing / queueTotal) * 100) : 0;

  // ETA calculation
  const batchEta = useMemo(() => {
    const { completed, startTime } = batchStatsRef.current;
    if (!startTime || completed === 0) return null;
    const elapsedMs = Date.now() - startTime;
    const avgMs = elapsedMs / completed;
    const remaining = queueQueued + queueExtracting;
    const etaMs = remaining * avgMs;
    if (etaMs < 60_000) return "< 1 min";
    return `~${Math.ceil(etaMs / 60_000)} min`;
  }, [queueQueued, queueExtracting]);

  // Source badge
  const sourceBadge = source => {
    const colors = { estimate: C.blue, pdf: C.purple, manual: C.textDim };
    const labels = { estimate: "Estimate", pdf: "PDF", manual: "Manual" };
    return (
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          padding: "2px 6px",
          borderRadius: 3,
          background: `${colors[source] || C.textDim}20`,
          color: colors[source] || C.textDim,
        }}
      >
        {labels[source] || source}
      </span>
    );
  };

  // Outcome badge
  const outcomeBadge = outcomeKey => {
    const info = getOutcomeInfo(outcomeKey);
    const colorMap = { green: C.green, red: C.red, blue: C.blue, orange: C.orange, textDim: C.textDim };
    const color = colorMap[info.color] || C.textDim;
    return (
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: 3,
          background: `${color}18`,
          color,
        }}
      >
        {info.label}
      </span>
    );
  };

  // Queue status badge
  const queueStatusBadge = status => {
    const config = {
      queued: { color: C.textDim, label: "Queued", icon: "○" },
      extracting: { color: C.orange, label: "Extracting...", icon: "⟳" },
      extracted: { color: C.blue, label: "Ready for Review", icon: "◉" },
      saved: { color: C.green, label: "Saved", icon: "✓" },
      failed: { color: C.red, label: "Failed", icon: "×" },
    };
    const c = config[status] || config.queued;
    return (
      <span style={{ fontSize: 9, fontWeight: 600, color: c.color, display: "flex", alignItems: "center", gap: 3 }}>
        <span style={{ fontSize: 11 }}>{c.icon}</span> {c.label}
      </span>
    );
  };

  return (
    <Sec title="Cost History">
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
        All your estimates and imported proposals in one place. NOVA uses this data to calibrate ROM estimates, track
        win rates, and identify pricing patterns.
      </div>

      {/* Analytics toggle + stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => setShowAnalytics(prev => !prev)}
          style={bt(C, {
            background: showAnalytics ? `${C.accent}15` : C.bg2,
            border: `1px solid ${showAnalytics ? C.accent + "50" : C.border}`,
            color: showAnalytics ? C.accent : C.text,
            padding: "6px 12px",
            fontSize: 10,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 5,
          })}
        >
          <Ic d={I.chart || I.scope} size={12} color={showAnalytics ? C.accent : C.textDim} />
          Analytics
        </button>

        <div
          style={{
            padding: "5px 10px",
            borderRadius: 5,
            background: C.bg2,
            border: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
          }}
        >
          <span style={{ fontWeight: 700, color: C.text }}>{unifiedEntries.length}</span>
          <span style={{ color: C.textDim }}>Total Entries</span>
        </div>
        <div
          style={{
            padding: "5px 10px",
            borderRadius: 5,
            background: C.bg2,
            border: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
          }}
        >
          <span style={{ fontWeight: 700, color: C.text }}>{estimatesIndex.length}</span>
          <span style={{ color: C.textDim }}>Estimates</span>
        </div>
        <div
          style={{
            padding: "5px 10px",
            borderRadius: 5,
            background: C.bg2,
            border: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
          }}
        >
          <span style={{ fontWeight: 700, color: C.text }}>{historicalProposals.length}</span>
          <span style={{ color: C.textDim }}>Imported</span>
        </div>
        {factorCount > 0 && (
          <div
            style={{
              padding: "5px 10px",
              borderRadius: 5,
              background: `${C.accent}10`,
              border: `1px solid ${C.accent}30`,
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 10,
            }}
          >
            <Ic d={I.check} size={10} color={C.accent} />
            <span style={{ fontWeight: 600, color: C.accent }}>Calibrating {factorCount} divisions</span>
          </div>
        )}
      </div>

      {/* Analytics Panel */}
      {showAnalytics && <CostHistoryAnalytics entries={unifiedEntries} />}

      {/* Calibration factors */}
      {factorCount > 0 && (
        <div
          style={{ padding: 10, background: C.bg2, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 14 }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: C.accent,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 6,
            }}
          >
            NOVA Calibration Factors
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {Object.entries(calibrationFactors)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([div, factor]) => {
                const divInfo = ROM_DIVISIONS.find(d => d.code === div);
                const pct = Math.round((factor - 1) * 100);
                const color = pct > 0 ? C.red : pct < 0 ? C.green : C.textDim;
                return (
                  <div
                    key={div}
                    style={{
                      padding: "3px 6px",
                      borderRadius: 3,
                      fontSize: 9,
                      background: `${color}12`,
                      border: `1px solid ${color}30`,
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: C.text, fontFamily: T.font.sans }}>
                      Div {div}
                    </span>
                    <span style={{ color: C.textDim }}>{divInfo?.label || ""}</span>
                    <span style={{ fontWeight: 700, color, fontFamily: T.font.sans }}>
                      {pct > 0 ? "+" : ""}
                      {pct}%
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => {
            setShowForm("manual");
            setFormInitial(null);
            setEditingId(null);
            setReviewingQueueId(null);
          }}
          style={bt(C, {
            background: C.bg2,
            border: `1px solid ${C.border}`,
            color: C.text,
            padding: "7px 12px",
            fontSize: 11,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 5,
          })}
        >
          <Ic d={I.plus} size={12} color={C.textDim} sw={2} />
          Manual Entry
        </button>
        <button
          onClick={() => pdfRef.current?.click()}
          style={bt(C, {
            background: `${C.purple}12`,
            border: `1px solid ${C.purple}30`,
            color: C.purple,
            padding: "7px 12px",
            fontSize: 11,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 5,
          })}
        >
          <Ic d={I.upload} size={12} color={C.purple} sw={2} />
          Upload Proposals
        </button>
        <input
          ref={pdfRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={async e => {
            const files = Array.from(e.target.files);
            await handlePdfFilesSelected(files);
            e.target.value = "";
          }}
        />
        {queueExtracting > 0 && !batchMode && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: 5,
              background: `${C.orange}10`,
              border: `1px solid ${C.orange}25`,
            }}
          >
            <NovaOrb size={14} scheme="nova" />
            <span style={{ fontSize: 10, color: C.orange, fontWeight: 600 }}>
              Extracting {queueExtracting} PDF{queueExtracting !== 1 ? "s" : ""}...
            </span>
          </div>
        )}
      </div>

      {/* ── Upload Queue Panel ── */}
      {queueActive && (
        <div style={{ marginBottom: 14, borderRadius: 8, border: `1px solid ${C.border}`, overflow: "hidden" }}>
          {/* Queue header */}
          <div
            onClick={() => setShowQueue(v => !v)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 12px",
              background: C.bg2,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>Upload Queue</span>
              {queueExtracted > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: `${C.blue}18`,
                    color: C.blue,
                  }}
                >
                  {queueExtracted} ready for review
                </span>
              )}
              {queueSaved > 0 && <span style={{ fontSize: 9, color: C.textDim }}>{queueSaved} saved</span>}
              {queueFailed > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 3,
                    background: `${C.red}18`,
                    color: C.red,
                  }}
                >
                  {queueFailed} failed
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={e => {
                  e.stopPropagation();
                  const ids = uploadQueue.map(q => q.id);
                  ids.forEach(id => base64DataMap.delete(id));
                  deletePdfBase64Batch(ids);
                  ids.forEach(id => removeQueueItem(id));
                  saveUploadQueue();
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 9,
                  color: C.red || "#f44",
                  fontWeight: 600,
                  padding: "2px 6px",
                }}
              >
                Clear All
              </button>
              <span
                style={{
                  fontSize: 10,
                  color: C.textDim,
                  transition: "transform 150ms",
                  transform: showQueue ? "rotate(90deg)" : "rotate(0deg)",
                  display: "inline-block",
                }}
              >
                ▸
              </span>
            </div>
          </div>

          {/* ── Batch Progress UI (shown for bulk uploads > 5 items) — always visible in batch mode ── */}
          {batchMode && (
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>
              {/* Progress bar */}
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: `${C.textDim}15`,
                  marginBottom: 8,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 3,
                    transition: "width 300ms ease",
                    width: `${batchPct}%`,
                    background: `linear-gradient(90deg, ${C.accent}, ${C.blue})`,
                  }}
                />
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.text }}>
                  {queueProcessing}/{queueTotal} processed ({batchPct}%)
                </span>
                {queueExtracting > 0 && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: C.orange,
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <NovaOrb size={10} scheme="nova" /> {queueExtracting} active
                  </span>
                )}
                {queueFailed > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 600, color: C.red }}>{queueFailed} failed</span>
                )}
                {batchEta && (queueQueued > 0 || queueExtracting > 0) && (
                  <span style={{ fontSize: 9, color: C.textDim }}>{batchEta} remaining</span>
                )}
                {isPaused && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: C.orange,
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: `${C.orange}15`,
                    }}
                  >
                    PAUSED
                  </span>
                )}
              </div>

              {/* Action buttons row */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button
                  onClick={handleTogglePause}
                  style={bt(C, {
                    background: isPaused ? `${C.accent}15` : `${C.orange}15`,
                    border: `1px solid ${isPaused ? C.accent + "35" : C.orange + "35"}`,
                    color: isPaused ? C.accent : C.orange,
                    padding: "4px 10px",
                    fontSize: 9,
                    fontWeight: 700,
                  })}
                >
                  {isPaused ? "Resume" : "Pause"}
                </button>
                {queueExtracted > 0 && (
                  <button
                    onClick={handleBatchAccept}
                    style={bt(C, {
                      background: `${C.green}15`,
                      border: `1px solid ${C.green}35`,
                      color: C.green,
                      padding: "4px 10px",
                      fontSize: 9,
                      fontWeight: 700,
                    })}
                  >
                    Accept All {queueExtracted}
                  </button>
                )}
                {queueFailed > 0 && (
                  <>
                    <button
                      onClick={handleRetryAll}
                      style={bt(C, {
                        background: `${C.orange}10`,
                        border: `1px solid ${C.orange}30`,
                        color: C.orange,
                        padding: "4px 10px",
                        fontSize: 9,
                        fontWeight: 700,
                      })}
                    >
                      Retry All {queueFailed} Failed
                    </button>
                    <button
                      onClick={() => {
                        const ids = uploadQueue.filter(q => q.status === "failed").map(q => q.id);
                        ids.forEach(id => base64DataMap.delete(id));
                        deletePdfBase64Batch(ids);
                        clearFailedFromQueue();
                        saveUploadQueue();
                      }}
                      style={bt(C, {
                        background: `${C.red || "#f44"}10`,
                        border: `1px solid ${C.red || "#f44"}30`,
                        color: C.red || "#f44",
                        padding: "4px 10px",
                        fontSize: 9,
                        fontWeight: 700,
                      })}
                    >
                      Clear {queueFailed} Failed
                    </button>
                  </>
                )}
              </div>

              {/* Currently extracting file names */}
              {queueExtracting > 0 && (
                <div style={{ marginTop: 6, fontSize: 9, color: C.textDim }}>
                  Extracting:{" "}
                  {uploadQueue
                    .filter(q => q.status === "extracting")
                    .map(q => q.fileName)
                    .join(", ")}
                </div>
              )}
            </div>
          )}

          {/* Queue items */}
          {showQueue && (
            <div
              style={{
                padding: "4px 8px 8px",
                maxHeight: batchMode ? 300 : undefined,
                overflowY: batchMode ? "auto" : undefined,
              }}
            >
              {uploadQueue.map(q => (
                <div
                  key={q.id}
                  onClick={() => q.status === "extracted" && q.extractedData && handleReviewQueueItem(q)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    borderRadius: 4,
                    marginBottom: 2,
                    cursor: q.status === "extracted" && q.extractedData ? "pointer" : "default",
                    background:
                      q.status === "extracted"
                        ? `${C.blue}06`
                        : q.status === "failed"
                          ? `${C.red || "#f44"}08`
                          : "transparent",
                  }}
                >
                  {/* File name + error detail */}
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: C.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        display: "block",
                      }}
                    >
                      {q.fileName}
                    </span>
                    {q.status === "failed" && q.error && (
                      <span
                        style={{
                          fontSize: 8,
                          color: C.red || "#f44",
                          opacity: 0.8,
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={q.error}
                      >
                        {q.error.length > 80 ? q.error.slice(0, 80) + "…" : q.error}
                      </span>
                    )}
                  </div>
                  {/* File size */}
                  <span style={{ fontSize: 9, color: C.textMuted, whiteSpace: "nowrap" }}>
                    {q.fileSize ? `${Math.round(q.fileSize / 1024)}KB` : ""}
                  </span>
                  {/* Status */}
                  {queueStatusBadge(q.status)}
                  {/* Actions */}
                  {q.status === "extracted" && q.extractedData && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleReviewQueueItem(q);
                      }}
                      style={bt(C, {
                        background: C.blue,
                        color: "#fff",
                        padding: "3px 10px",
                        fontSize: 9,
                        fontWeight: 700,
                        borderRadius: 4,
                      })}
                    >
                      Review
                    </button>
                  )}
                  {q.status === "extracted" && !q.extractedData && (
                    <span style={{ fontSize: 8, color: C.orange, fontWeight: 600 }}>Re-upload to restore</span>
                  )}
                  {q.status === "failed" && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleRetry(q);
                      }}
                      style={bt(C, {
                        background: `${C.orange}15`,
                        border: `1px solid ${C.orange}35`,
                        color: C.orange,
                        padding: "3px 10px",
                        fontSize: 9,
                        fontWeight: 600,
                      })}
                    >
                      Retry
                    </button>
                  )}
                  {q.status !== "extracting" && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        base64DataMap.delete(q.id);
                        deletePdfBase64(q.id);
                        removeQueueItem(q.id);
                        saveUploadQueue();
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.4 }}
                    >
                      <Ic d={I.x || I.close} size={10} color={C.textDim} />
                    </button>
                  )}
                </div>
              ))}
              {/* Clear completed */}
              {queueSaved > 0 && (
                <button
                  onClick={() => {
                    const ids = uploadQueue.filter(q => q.status === "saved").map(q => q.id);
                    ids.forEach(id => base64DataMap.delete(id));
                    deletePdfBase64Batch(ids);
                    clearSavedFromQueue();
                    saveUploadQueue();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: C.textDim,
                    fontSize: 9,
                    cursor: "pointer",
                    padding: "4px 0",
                    fontWeight: 600,
                  }}
                >
                  Clear {queueSaved} completed
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={filterBuildingType}
          onChange={e => setFilterBuildingType(e.target.value)}
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 150 })}
        >
          <option value="">All Building Types</option>
          {BUILDING_TYPES.map(b => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
        <select
          value={filterWorkType}
          onChange={e => setFilterWorkType(e.target.value)}
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 140 })}
        >
          <option value="">All Work Types</option>
          {WORK_TYPES.map(w => (
            <option key={w.key} value={w.key}>
              {w.label}
            </option>
          ))}
        </select>
        <select
          value={filterLaborType}
          onChange={e => setFilterLaborType(e.target.value)}
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 130 })}
        >
          <option value="">All Labor Types</option>
          {DEFAULT_LABOR_TYPES.map(lt => (
            <option key={lt.key} value={lt.key}>
              {lt.label}
            </option>
          ))}
        </select>
        <select
          value={filterDeliveryMethod}
          onChange={e => setFilterDeliveryMethod(e.target.value)}
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 130 })}
        >
          <option value="">All Delivery Methods</option>
          {DELIVERY_METHODS.map(d => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          value={filterOutcome}
          onChange={e => setFilterOutcome(e.target.value)}
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 110 })}
        >
          <option value="">All Outcomes</option>
          {OUTCOME_STATUSES.map(o => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          placeholder="Search name, client, architect..."
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 180 })}
        />
        {(filterBuildingType ||
          filterWorkType ||
          filterLaborType ||
          filterDeliveryMethod ||
          filterOutcome ||
          filterSearch) && (
          <button
            onClick={() => {
              setFilterBuildingType("");
              setFilterWorkType("");
              setFilterLaborType("");
              setFilterDeliveryMethod("");
              setFilterOutcome("");
              setFilterSearch("");
            }}
            style={{
              background: "none",
              border: "none",
              color: C.accent,
              fontSize: 10,
              cursor: "pointer",
              fontWeight: 600,
              padding: "4px 6px",
            }}
          >
            Clear filters
          </button>
        )}
        {filteredEntries.length !== unifiedEntries.length && (
          <span style={{ fontSize: 10, color: C.textDim }}>
            {filteredEntries.length} of {unifiedEntries.length} entries
          </span>
        )}
      </div>

      {/* Table */}
      {filteredEntries.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 70px 70px 70px 80px 65px 60px 45px",
              gap: 6,
              padding: "4px 8px",
              fontSize: 9,
              fontWeight: 700,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            <span>Project</span>
            <span>Client</span>
            <span>Type</span>
            <span style={{ textAlign: "right" }}>SF</span>
            <span style={{ textAlign: "right" }}>$/SF</span>
            <span style={{ textAlign: "right" }}>Adj $/SF</span>
            <span style={{ textAlign: "right" }}>Total</span>
            <span style={{ textAlign: "center" }}>Outcome</span>
            <span style={{ textAlign: "center" }}>Source</span>
            <span />
          </div>

          {filteredEntries.map(entry => {
            const isExpanded = expandedId === entry.id;
            const costPerSF =
              entry.projectSF > 0 && entry.totalCost > 0 ? Math.round(entry.totalCost / entry.projectSF) : 0;
            const entryYear = extractYear(entry.date);
            const currentYr = getCurrentYear();
            const escalationFactor = getEscalationFactor(entryYear, currentYr);
            const adjCostPerSF =
              costPerSF > 0 && escalationFactor !== 1 ? Math.round(costPerSF * escalationFactor) : costPerSF;
            const divCount = Object.keys(entry.divisions || {}).length;
            const hasLearning = learningRecords.some(r => r.proposalId === entry.id);
            const entryMarkups = entry.markups || [];

            return (
              <div key={`${entry.source}-${entry.id}`}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr 70px 70px 70px 80px 65px 60px 45px",
                    gap: 6,
                    padding: "7px 8px",
                    borderRadius: 5,
                    cursor: "pointer",
                    alignItems: "center",
                    background: isExpanded ? `${C.accent}08` : C.bg2,
                    border: `1px solid ${isExpanded ? C.accent + "30" : C.border}`,
                    transition: "all 0.12s",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: C.text,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {entry.name}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: C.textDim,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.client || "—"}
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim, lineHeight: 1.3 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getBuildingTypeLabel(entry.buildingType)}
                    </div>
                    {entry.workType && (
                      <div
                        style={{
                          color: C.textMuted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {getWorkTypeLabel(entry.workType)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: C.text, textAlign: "right", fontFamily: T.font.sans }}>
                    {entry.projectSF > 0 ? entry.projectSF.toLocaleString() : "—"}
                  </div>
                  <div style={{ fontSize: 10, color: C.text, textAlign: "right", fontFamily: T.font.sans }}>
                    {costPerSF > 0 ? `$${costPerSF}` : "—"}
                  </div>
                  <div style={{ fontSize: 10, textAlign: "right", fontFamily: T.font.sans }}>
                    {adjCostPerSF > 0 && adjCostPerSF !== costPerSF ? (
                      <span style={{ color: C.accent, fontWeight: 600 }}>${adjCostPerSF}</span>
                    ) : adjCostPerSF > 0 ? (
                      <span style={{ color: C.textDim }}>—</span>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: C.text,
                      textAlign: "right",
                      fontWeight: 600,
                      fontFamily: T.font.sans,
                    }}
                  >
                    {entry.totalCost > 0 ? fmtCost(entry.totalCost) : "—"}
                  </div>
                  <div style={{ textAlign: "center" }}>{outcomeBadge(entry.outcome)}</div>
                  <div
                    style={{
                      textAlign: "center",
                      display: "flex",
                      gap: 3,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {sourceBadge(entry.source)}
                    {hasLearning && <span style={{ fontSize: 8, fontWeight: 700, color: C.green }}>Cal</span>}
                  </div>
                  <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                    {entry.source !== "estimate" && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDelete(entry.id, entry.source);
                        }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 3, opacity: 0.4 }}
                        title="Delete"
                      >
                        <Ic d={I.trash} size={11} color={C.red} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div
                    style={{
                      padding: "10px 12px",
                      margin: "2px 0 4px",
                      background: C.bg1,
                      borderRadius: "0 0 6px 6px",
                      border: `1px solid ${C.accent}20`,
                      borderTop: "none",
                    }}
                  >
                    {/* Meta row */}
                    <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
                      {entry.architect && (
                        <div style={{ fontSize: 10, color: C.textDim }}>
                          Architect: <strong style={{ color: C.text }}>{entry.architect}</strong>
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: C.textDim }}>
                        Date: <strong style={{ color: C.text }}>{entry.date || "—"}</strong>
                      </div>
                      <div style={{ fontSize: 10, color: C.textDim }}>
                        Divisions: <strong style={{ color: C.text }}>{divCount}</strong>
                      </div>
                      {entry.sourceFileName && (
                        <div style={{ fontSize: 10, color: C.textDim }}>
                          File: <strong style={{ color: C.text }}>{entry.sourceFileName}</strong>
                        </div>
                      )}
                      {entry.source === "estimate" && (
                        <div style={{ fontSize: 10, color: C.blue, fontWeight: 600 }}>Status: {entry.status}</div>
                      )}
                      {escalationFactor !== 1 && costPerSF > 0 && (
                        <div style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>
                          Escalation: {formatEscalation(escalationFactor)} ({entryYear}→{currentYr})
                        </div>
                      )}
                    </div>
                    {/* Extended data row */}
                    {(entry.laborType ||
                      entry.zipCode ||
                      entry.stories > 0 ||
                      entry.structuralSystem ||
                      entry.deliveryMethod) && (
                      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                        {entry.laborType &&
                          (() => {
                            const ltColors = { union: C.orange, prevailing_wage: C.red, open_shop: C.green };
                            const ltLabels = {
                              union: "Union",
                              prevailing_wage: "Prevailing Wage",
                              open_shop: "Open Shop",
                            };
                            const c = ltColors[entry.laborType] || C.textDim;
                            return (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  padding: "2px 7px",
                                  borderRadius: 3,
                                  background: `${c}15`,
                                  color: c,
                                }}
                              >
                                {ltLabels[entry.laborType] || entry.laborType}
                              </span>
                            );
                          })()}
                        {entry.zipCode &&
                          (() => {
                            const loc = resolveLocationFactors(entry.zipCode);
                            return (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 600,
                                  padding: "2px 7px",
                                  borderRadius: 3,
                                  background: `${C.blue}12`,
                                  color: C.blue,
                                }}
                              >
                                {loc.source !== "none" ? `${loc.label} (L:${loc.lab}×)` : entry.zipCode}
                              </span>
                            );
                          })()}
                        {entry.stories > 0 && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: "2px 7px",
                              borderRadius: 3,
                              background: C.bg2,
                              color: C.textDim,
                            }}
                          >
                            {entry.stories} {entry.stories === 1 ? "story" : "stories"}
                          </span>
                        )}
                        {entry.structuralSystem && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: "2px 7px",
                              borderRadius: 3,
                              background: C.bg2,
                              color: C.textDim,
                            }}
                          >
                            {getStructuralSystemLabel(entry.structuralSystem)}
                          </span>
                        )}
                        {entry.deliveryMethod && (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: "2px 7px",
                              borderRadius: 3,
                              background: C.bg2,
                              color: C.textDim,
                            }}
                          >
                            {getDeliveryMethodLabel(entry.deliveryMethod)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Outcome metadata */}
                    {entry.outcomeMetadata &&
                      (entry.outcomeMetadata.lostReason ||
                        entry.outcomeMetadata.competitor ||
                        entry.outcomeMetadata.contractAmount) && (
                        <div
                          style={{
                            display: "flex",
                            gap: 12,
                            marginBottom: 10,
                            padding: "6px 10px",
                            borderRadius: 5,
                            background: C.bg2,
                          }}
                        >
                          {entry.outcomeMetadata.lostReason && (
                            <div style={{ fontSize: 10, color: C.textDim }}>
                              Reason:{" "}
                              <strong style={{ color: C.red }}>
                                {LOST_REASONS.find(r => r.key === entry.outcomeMetadata.lostReason)?.label ||
                                  entry.outcomeMetadata.lostReason}
                              </strong>
                            </div>
                          )}
                          {entry.outcomeMetadata.competitor && (
                            <div style={{ fontSize: 10, color: C.textDim }}>
                              Competitor: <strong style={{ color: C.text }}>{entry.outcomeMetadata.competitor}</strong>
                            </div>
                          )}
                          {entry.outcomeMetadata.competitorAmount && (
                            <div style={{ fontSize: 10, color: C.textDim }}>
                              Their Bid:{" "}
                              <strong style={{ color: C.text }}>
                                {fmtCost(entry.outcomeMetadata.competitorAmount)}
                              </strong>
                            </div>
                          )}
                          {entry.outcomeMetadata.contractAmount && (
                            <div style={{ fontSize: 10, color: C.textDim }}>
                              Contract:{" "}
                              <strong style={{ color: C.green }}>
                                {fmtCost(entry.outcomeMetadata.contractAmount)}
                              </strong>
                            </div>
                          )}
                        </div>
                      )}

                    {/* Division breakdown */}
                    {divCount > 0 && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                          gap: 3,
                          marginBottom: 10,
                        }}
                      >
                        {Object.entries(entry.divisions)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([div, cost]) => {
                            const divInfo = ROM_DIVISIONS.find(d => d.code === div);
                            return (
                              <div
                                key={div}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  padding: "3px 6px",
                                  borderRadius: 3,
                                  background: C.bg2,
                                  fontSize: 10,
                                }}
                              >
                                <span style={{ color: C.textDim }}>
                                  <span style={{ fontWeight: 700, fontFamily: T.font.sans }}>{div}</span>{" "}
                                  {divInfo?.label || ""}
                                </span>
                                <span style={{ fontWeight: 600, color: C.text, fontFamily: T.font.sans }}>
                                  {fmtCost(cost)}
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    )}

                    {/* Markups breakdown — grouped by category */}
                    {entryMarkups.length > 0 && (
                      <>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            color: C.accent,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            marginBottom: 6,
                          }}
                        >
                          Indirect Costs / Markups
                        </div>
                        {MARKUP_CATEGORIES.map(cat => {
                          const catItems = entryMarkups.filter(m => classifyMarkup(m.key).category === cat.key);
                          if (catItems.length === 0) return null;
                          const catColor = C[cat.color] || C.accent;
                          return (
                            <div key={cat.key} style={{ marginBottom: 6 }}>
                              <div
                                style={{
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: catColor,
                                  textTransform: "uppercase",
                                  letterSpacing: 0.5,
                                  marginBottom: 2,
                                  opacity: 0.8,
                                }}
                              >
                                {cat.label}
                              </div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                                  gap: 3,
                                }}
                              >
                                {catItems.map(m => (
                                  <div
                                    key={m.id || m.key}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      padding: "3px 6px",
                                      borderRadius: 3,
                                      background: `${catColor}08`,
                                      fontSize: 10,
                                    }}
                                  >
                                    <span style={{ color: C.textDim }}>{m.label || m.key}</span>
                                    <span
                                      style={{ fontWeight: 600, color: catColor, fontFamily: T.font.sans }}
                                    >
                                      {m.type === "percent" ? `${m.inputValue}%` : ""} {fmtCost(m.calculatedAmount)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        <div style={{ height: 4 }} />
                      </>
                    )}

                    {/* Notes */}
                    {entry.notes && (
                      <div style={{ fontSize: 10, color: C.textDim, marginBottom: 10, fontStyle: "italic" }}>
                        {entry.notes}
                      </div>
                    )}

                    {/* Row actions */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {entry.source !== "estimate" && (
                        <>
                          <button
                            onClick={() => handleEdit(entry)}
                            style={bt(C, {
                              background: C.bg2,
                              border: `1px solid ${C.border}`,
                              color: C.text,
                              padding: "4px 10px",
                              fontSize: 10,
                              fontWeight: 600,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            })}
                          >
                            <Ic d={I.edit} size={11} color={C.textDim} />
                            Edit
                          </button>
                          <select
                            value={entry.outcome}
                            onChange={e => {
                              e.stopPropagation();
                              handleOutcomeChange(entry, e.target.value);
                            }}
                            onClick={e => e.stopPropagation()}
                            style={inp(C, { padding: "4px 8px", fontSize: 10, width: 90 })}
                          >
                            {OUTCOME_STATUSES.map(o => (
                              <option key={o.key} value={o.key}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      {divCount > 0 && (
                        <button
                          onClick={() => handleRecalibrate(entry)}
                          style={bt(C, {
                            background: `${C.accent}12`,
                            border: `1px solid ${C.accent}30`,
                            color: C.accent,
                            padding: "4px 10px",
                            fontSize: 10,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          })}
                        >
                          <NovaOrb size={12} scheme="nova" />
                          {hasLearning ? "Recalibrate" : "Calibrate"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ padding: "20px 16px", borderRadius: 8, border: `1px dashed ${C.border}`, textAlign: "center" }}>
          {unifiedEntries.length > 0 ? (
            <>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>No entries match your filters</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>Try adjusting the filter criteria above.</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>No cost history data yet</div>
              <div style={{ fontSize: 10, color: C.textMuted }}>
                Create an estimate or import past proposals to start building your cost intelligence.
              </div>
            </>
          )}
        </div>
      )}

      {/* Entry Form Modal */}
      {showForm && (
        <CostHistoryEntryForm
          onClose={() => {
            // Free base64 memory + IndexedDB if closing without saving
            if (reviewingQueueId) {
              base64DataMap.delete(reviewingQueueId);
              deletePdfBase64(reviewingQueueId);
            }
            setShowForm(false);
            setFormInitial(null);
            setEditingId(null);
            setReviewingQueueId(null);
            setReviewPdfBase64(null);
          }}
          onSave={handleSaveEntry}
          initial={formInitial}
          mode={showForm === "pdf-review" ? "pdf-review" : showForm === "edit" ? "edit" : "manual"}
          pdfBase64={reviewPdfBase64}
        />
      )}
    </Sec>
  );
}
