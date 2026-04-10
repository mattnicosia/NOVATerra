// Cost History Panel — Unified view of all estimates + historical proposals
// Lives on Settings page, feeds learning records to scanStore for calibration

import { useState, useRef, useMemo, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
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
  STRUCTURAL_SYSTEMS,
  DELIVERY_METHODS,
} from "@/constants/constructionTypes";
import { DEFAULT_LABOR_TYPES } from "@/utils/laborTypes";
import { extractYear, getEscalationFactor } from "@/utils/costEscalation";
import { getCurrentYear } from "@/constants/constructionCostIndex";
import { MARKUP_CATEGORIES, classifyMarkup } from "@/constants/markupTaxonomy";
import CostHistoryEntryForm from "@/components/costHistory/CostHistoryEntryForm";
import CostHistoryAnalytics from "@/components/costHistory/CostHistoryAnalytics";
import ProposalUploadQueue from "@/components/costHistory/ProposalUploadQueue";
import ProposalTable from "@/components/costHistory/ProposalTable";
import Sec from "@/components/shared/Sec";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";

// Module-level map: queue-id -> base64 string
const base64DataMap = new Map();

function readFileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file || !(file instanceof File || file instanceof Blob)) { reject(new Error(`Invalid file object: ${typeof file}`)); return; }
    if (file.size === 0) { reject(new Error(`File "${file.name}" is empty (0 bytes)`)); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      if (!dataUrl || typeof dataUrl !== "string") { reject(new Error(`FileReader returned invalid result for "${file.name}"`)); return; }
      const base64 = dataUrl.split(",")[1] || "";
      if (!base64) { reject(new Error(`Empty base64 after reading "${file.name}"`)); return; }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`FileReader error for "${file.name}": ${reader.error?.message || "unknown"}`));
    reader.readAsDataURL(file);
  });
}

// ROM divisions for calibration display
const ROM_DIVISIONS = [
  { code: "01", label: "General Requirements" }, { code: "02", label: "Existing Conditions/Demo" },
  { code: "03", label: "Concrete" }, { code: "04", label: "Masonry" }, { code: "05", label: "Metals" },
  { code: "06", label: "Wood & Plastics" }, { code: "07", label: "Thermal & Moisture" },
  { code: "08", label: "Openings" }, { code: "09", label: "Finishes" }, { code: "10", label: "Specialties" },
  { code: "11", label: "Equipment" }, { code: "14", label: "Conveying" }, { code: "21", label: "Fire Suppression" },
  { code: "22", label: "Plumbing" }, { code: "23", label: "HVAC" }, { code: "26", label: "Electrical" },
  { code: "27", label: "Communications" }, { code: "28", label: "Electronic Safety" },
  { code: "31", label: "Earthwork" }, { code: "32", label: "Exterior Improvements" }, { code: "33", label: "Utilities" },
];

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
  const learningRecords = useDrawingPipelineStore(s => s.learningRecords);
  const addLearningRecord = useDrawingPipelineStore(s => s.addLearningRecord);
  const calibrationFactors = useDrawingPipelineStore.getState().getCalibrationFactors();

  // Upload queue
  const uploadQueue = useMasterDataStore(s => s.pdfUploadQueue);
  const addToUploadQueue = useMasterDataStore(s => s.addToUploadQueue);
  const updateQueueItem = useMasterDataStore(s => s.updateQueueItem);
  const removeQueueItem = useMasterDataStore(s => s.removeQueueItem);
  const clearSavedFromQueue = useMasterDataStore(s => s.clearSavedFromQueue);
  const clearFailedFromQueue = useMasterDataStore(s => s.clearFailedFromQueue);

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [formInitial, setFormInitial] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [reviewingQueueId, setReviewingQueueId] = useState(null);
  const [reviewPdfBase64, setReviewPdfBase64] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const pdfRef = useRef(null);
  const activeWorkersRef = useRef(0);
  const pausedRef = useRef(false);
  const batchStatsRef = useRef({ startTime: null, completed: 0, lastItemMs: 0 });
  const [isPaused, setIsPaused] = useState(false);

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
      id: est.id, source: "estimate", name: est.name, client: est.client, architect: est.architect || "",
      date: est.lastModified, projectSF: est.projectSF || 0, buildingType: est.buildingType || migrateJobType(est.jobType).buildingType,
      workType: est.workType || migrateJobType(est.jobType).workType, totalCost: est.grandTotal || 0,
      divisions: est.divisionTotals || {}, outcome: mapStatusToOutcome(est.status), outcomeMetadata: est.outcomeMetadata || {},
      laborType: est.laborType || "", zipCode: est.zipCode || "", stories: est.stories || 0,
      structuralSystem: est.structuralSystem || "", deliveryMethod: est.deliveryMethod || "", estimateId: est.id, status: est.status,
    }));
    const fromHistory = historicalProposals.map(p => ({
      id: p.id, source: p.source || "manual", name: p.name, client: p.client || "", architect: p.architect || "",
      date: p.date, projectSF: p.projectSF || 0, buildingType: p.buildingType || migrateJobType(p.jobType).buildingType,
      workType: p.workType || migrateJobType(p.jobType).workType, totalCost: p.totalCost || 0,
      divisions: p.divisions || {}, markups: p.markups || [], outcome: p.outcome || "pending",
      outcomeMetadata: p.outcomeMetadata || {}, laborType: p.laborType || "", zipCode: p.zipCode || "",
      stories: p.stories || 0, structuralSystem: p.structuralSystem || "", deliveryMethod: p.deliveryMethod || "",
      proposalType: p.proposalType || "gc", sourceFileName: p.sourceFileName, notes: p.notes || "",
    }));
    return [...fromEstimates, ...fromHistory];
  }, [estimatesIndex, historicalProposals]);

  const filteredEntries = useMemo(() => {
    return unifiedEntries.filter(entry => {
      if (filterBuildingType && entry.buildingType !== filterBuildingType) return false;
      if (filterWorkType && entry.workType !== filterWorkType) return false;
      if (filterLaborType && entry.laborType !== filterLaborType) return false;
      if (filterDeliveryMethod && entry.deliveryMethod !== filterDeliveryMethod) return false;
      if (filterOutcome && entry.outcome !== filterOutcome) return false;
      if (filterSearch) {
        const s = filterSearch.toLowerCase();
        if (!entry.name.toLowerCase().includes(s) && !entry.client.toLowerCase().includes(s) && !entry.architect.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [unifiedEntries, filterBuildingType, filterWorkType, filterLaborType, filterDeliveryMethod, filterOutcome, filterSearch]);

  // ── Learning record generation ──
  const generateLearningFromProposal = async proposal => {
    const bt2 = proposal.buildingType || proposal.jobType || "commercial-office";
    const wt = proposal.workType || "";
    const romPrediction = generateBaselineROM(proposal.projectSF, bt2, wt, {});
    const proposalYear = extractYear(proposal.date);
    const currentYr = getCurrentYear();
    const actuals = { divisions: {} };
    Object.entries(proposal.divisions || {}).forEach(([div, cost]) => {
      const c = parseFloat(cost);
      if (c > 0) actuals.divisions[div] = Math.round(c * getEscalationFactor(proposalYear, currentYr));
    });
    const calibration = computeCalibration(romPrediction, actuals);
    const mkps = proposal.markups || [];
    const divTotal = Object.values(actuals.divisions).reduce((s, v) => s + v, 0);
    const mkpTotal = mkps.reduce((s, m) => s + (m.calculatedAmount || 0), 0);

    await addLearningRecord({
      source: "historical-proposal", proposalId: proposal.id, proposalName: proposal.name,
      projectSF: proposal.projectSF, buildingType: bt2, workType: wt, jobType: bt2,
      laborType: proposal.laborType || "", zipCode: proposal.zipCode || "",
      stories: proposal.stories || 0, structuralSystem: proposal.structuralSystem || "",
      deliveryMethod: proposal.deliveryMethod || "", originalYear: proposalYear, normalizedToYear: currentYr,
      romPrediction: { divisions: Object.fromEntries(Object.entries(romPrediction.divisions).map(([div, data]) => [div, { mid: data.total.mid }])) },
      actuals, calibration,
      markupPatterns: mkpTotal > 0 ? {
        markupTotal: mkpTotal, divisionTotal: divTotal,
        markupPct: divTotal > 0 ? Math.round((mkpTotal / divTotal) * 1000) / 10 : 0,
        items: mkps.map(m => { const tax = classifyMarkup(m.key); return { key: m.key, type: m.type, inputValue: m.inputValue, calculatedAmount: m.calculatedAmount, category: tax.category, comparable: tax.comparable }; }),
        byCategory: (() => { const groups = {}; mkps.forEach(m => { const cat = classifyMarkup(m.key).category; groups[cat] = (groups[cat] || 0) + (m.calculatedAmount || 0); }); return groups; })(),
      } : undefined,
    });
    return calibration;
  };

  // ── PDF extraction ──
  const extractProposalPdf = async (base64, fileName) => {
    if (!base64 || base64.length < 100) throw new Error(`Cannot extract "${fileName}": base64 too short`);
    const response = await callAnthropic({
      model: "claude-sonnet-4-20250514", max_tokens: 4000,
      messages: [{ role: "user", content: [pdfBlock(base64), { type: "text", text: `You are analyzing a construction proposal/bid document. Extract the following information:\n\n1. **projectName**: The project name\n2. **client**: The client/owner name\n3. **architect**: The architect firm name (if mentioned)\n4. **projectSF**: Building square footage (number only)\n5. **buildingType**: Classify as one of: ${BUILDING_TYPES.map(b => `"${b.key}"`).join(", ")}\n6. **workType**: Classify as one of: ${WORK_TYPES.map(w => `"${w.key}"`).join(", ")}\n7. **totalCost**: Total bid/proposal amount (number only)\n8. **divisions**: Object mapping CSI division codes to dollar amounts\n9. **laborType**: "open_shop", "union", or "prevailing_wage"\n10. **zipCode**: Project zip code (5 digits)\n11. **stories**: Number of stories above grade\n12. **structuralSystem**: Classify as one of: ${STRUCTURAL_SYSTEMS.map(s => `"${s.key}"`).join(", ")}\n13. **deliveryMethod**: Classify as one of: ${DELIVERY_METHODS.map(d => `"${d.key}"`).join(", ")}\n14. **markups**: Array of below-the-line items with key, label, type, inputValue, category\n15. **proposalType**: "gc" or "sub"\n\nReturn ONLY a JSON object.` }] }],
      system: "You are NOVA, the AI construction intelligence inside NOVATerra. Analyze this historical proposal to extract cost data. Return only valid JSON.",
    });
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!parsed || !parsed.projectName) throw new Error(`Could not extract proposal data from "${fileName}"`);
    const extractedDivSum = Object.values(parsed.divisions || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const processedMarkups = (parsed.markups || []).map(m => {
      const tax = classifyMarkup(m.key || "custom");
      return { id: uid(), key: m.key || "custom", label: m.label || tax.label || "", category: m.category || tax.category, type: m.type || "dollar", inputValue: m.inputValue || 0, calculatedAmount: m.type === "percent" ? Math.round((extractedDivSum * (parseFloat(m.inputValue) || 0)) / 100) : parseFloat(m.inputValue) || 0 };
    });
    return { name: parsed.projectName || fileName, client: parsed.client || "", architect: parsed.architect || "", date: new Date().toISOString().split("T")[0], projectSF: parsed.projectSF != null ? String(parsed.projectSF) : "", buildingType: parsed.buildingType || "", workType: parsed.workType || "", totalCost: parsed.totalCost != null ? String(parsed.totalCost) : "", divisions: parsed.divisions || {}, markups: processedMarkups, laborType: parsed.laborType || "", zipCode: parsed.zipCode || "", stories: parsed.stories != null ? String(parsed.stories) : "", structuralSystem: parsed.structuralSystem || "", deliveryMethod: parsed.deliveryMethod || "", proposalType: parsed.proposalType || "gc", source: "pdf", sourceFileName: fileName, outcome: "pending", outcomeMetadata: {} };
  };

  // ── Parallel worker pool ──
  const CONCURRENCY = 3;
  const processQueue = useCallback(async () => {
    if (!batchStatsRef.current.startTime) batchStatsRef.current = { startTime: Date.now(), completed: 0, lastItemMs: 0 };
    const spawnWorker = async () => {
      activeWorkersRef.current++;
      try {
        while (true) {
          if (pausedRef.current) break;
          const queue = useMasterDataStore.getState().pdfUploadQueue;
          const next = queue.find(q => q.status === "queued");
          if (!next) break;
          if (!base64DataMap.has(next.id)) { const stored = await loadPdfBase64(next.id); if (stored) base64DataMap.set(next.id, stored); }
          updateQueueItem(next.id, { status: "extracting" });
          try {
            const base64 = base64DataMap.get(next.id);
            if (!base64 || base64.length < 100) throw new Error(`PDF data missing for "${next.fileName}"`);
            const extracted = await extractProposalPdf(base64, next.fileName);
            updateQueueItem(next.id, { status: "extracted", extractedData: extracted });
            batchStatsRef.current.completed++;
          } catch (err) {
            const is429 = err?.message?.includes("429") || err?.message?.toLowerCase().includes("rate");
            const isOverloaded = err?.message?.includes("529") || err?.message?.toLowerCase().includes("overloaded");
            if (is429 || isOverloaded) {
              const retries = next.retryCount || 0;
              const backoff = Math.min(5000 * Math.pow(2, retries), 60000);
              updateQueueItem(next.id, { status: "queued", error: null, retryCount: retries + 1 });
              await new Promise(r => setTimeout(r, backoff));
            } else {
              updateQueueItem(next.id, { status: "failed", error: err.message || "Extraction failed" });
            }
          }
          await saveUploadQueue();
        }
      } finally { activeWorkersRef.current--; }
    };
    const toSpawn = CONCURRENCY - activeWorkersRef.current;
    for (let i = 0; i < toSpawn; i++) spawnWorker();
  }, [updateQueueItem]);

  // ── File selection handler ──
  const handlePdfFilesSelected = async files => {
    try {
      if (!files || files.length === 0) return;
      const allFiles = Array.isArray(files) ? files : Array.from(files);
      const MAX_PDF_SIZE = 25 * 1024 * 1024;
      const fileArray = allFiles.filter(f => f.name.toLowerCase().endsWith(".pdf"));
      if (fileArray.length === 0) { showToast("No PDF files found in selection", "error"); return; }
      const existingQueue = useMasterDataStore.getState().pdfUploadQueue;
      const newItems = [];
      let resumed = 0, skipped = 0, oversized = 0, readErrors = 0;
      const BATCH_SIZE = 10;
      const readResults = [];
      for (let i = 0; i < fileArray.length; i += BATCH_SIZE) {
        const batch = fileArray.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.allSettled(batch.map(async file => {
          if (file.size > MAX_PDF_SIZE) return { file, skip: "oversized" };
          if (file.size === 0) return { file, skip: "empty" };
          try { return { file, base64: await readFileToBase64(file) }; } catch (err) { return { file, skip: "read_error", error: err.message }; }
        }));
        readResults.push(...batchResults);
      }
      for (const result of readResults) {
        const { file, base64, skip, error } = result.status === "fulfilled" ? result.value : { file: null, skip: "rejected" };
        if (!file) continue;
        if (skip === "oversized") { oversized++; continue; }
        if (skip === "empty" || skip === "read_error") { readErrors++; if (skip === "read_error") showToast(`Could not read "${file.name}": ${error}`, "error"); continue; }
        const match = existingQueue.find(q => q.fileName === file.name && q.fileSize === file.size);
        if (match) {
          if (match.status === "extracted" && !match.extractedData) { base64DataMap.set(match.id, base64); savePdfBase64(match.id, base64); updateQueueItem(match.id, { status: "queued", error: null }); resumed++; continue; }
          if (match.status === "extracted" || match.status === "saved") { if (!base64DataMap.has(match.id)) { base64DataMap.set(match.id, base64); savePdfBase64(match.id, base64); } skipped++; continue; }
          base64DataMap.set(match.id, base64); savePdfBase64(match.id, base64);
          if (match.status === "failed") updateQueueItem(match.id, { status: "queued", error: null });
          resumed++;
        } else {
          const id = uid();
          base64DataMap.set(id, base64); savePdfBase64(id, base64);
          newItems.push({ id, fileName: file.name, fileSize: file.size, status: "queued", error: null, extractedData: null, addedAt: Date.now() });
        }
      }
      if (newItems.length > 0) addToUploadQueue(newItems);
      await saveUploadQueue();
      if (oversized > 0) showToast(`Skipped ${oversized} file${oversized !== 1 ? "s" : ""} over 25 MB`, "error");
      if (resumed > 0 || skipped > 0) showToast(`Resumed ${resumed} pending, ${newItems.length} new, ${skipped} already done`);
      else if (newItems.length > 0) showToast(`Queued ${newItems.length} PDF${newItems.length !== 1 ? "s" : ""} for extraction`);
      processQueue();
    } catch (err) { showToast(`Upload error: ${err.message}`, "error"); }
  };

  const handleRetry = queueItem => {
    if (!base64DataMap.has(queueItem.id)) { showToast(`File data lost for "${queueItem.fileName}" — please re-select folder`, "error"); return; }
    updateQueueItem(queueItem.id, { status: "queued", error: null }); processQueue();
  };

  const handleRetryAll = () => {
    const queue = useMasterDataStore.getState().pdfUploadQueue;
    let retried = 0;
    queue.forEach(q => { if (q.status === "failed" && base64DataMap.has(q.id)) { updateQueueItem(q.id, { status: "queued", error: null }); retried++; } });
    if (retried > 0) { showToast(`Retrying ${retried} failed item${retried !== 1 ? "s" : ""}`); processQueue(); }
    else showToast("File references lost — use 'Clear Failed' then re-upload folder", "error");
  };

  const handleTogglePause = () => { const ns = !pausedRef.current; pausedRef.current = ns; setIsPaused(ns); if (!ns) processQueue(); };

  const handleBatchAccept = async () => {
    const queue = useMasterDataStore.getState().pdfUploadQueue;
    const extracted = queue.filter(q => q.status === "extracted" && q.extractedData);
    if (extracted.length === 0) return;
    for (const q of extracted) { addHistoricalProposal({ ...q.extractedData, source: "pdf", sourceFileName: q.fileName }); updateQueueItem(q.id, { status: "saved" }); }
    await saveMasterData(); await saveUploadQueue();
    showToast(`Saved ${extracted.length} proposal${extracted.length !== 1 ? "s" : ""} to Cost History`);
    setTimeout(async () => {
      const proposals = useMasterDataStore.getState().masterData.historicalProposals || [];
      for (const q of extracted) {
        const match = proposals.find(p => p.sourceFileName === q.fileName);
        if (match) {
          try {
            await generateLearningFromProposal(match);
          } catch (err) {
            console.warn(`[HistoricalProposalsPanel] Learning generation failed for ${q.fileName}:`, err);
          }
        }
      }
    }, 100);
  };

  const handleReviewQueueItem = async queueItem => {
    if (!queueItem.extractedData) { showToast(`Data lost for "${queueItem.fileName}" — re-upload`, "error"); return; }
    setFormInitial(queueItem.extractedData); setEditingId(null); setReviewingQueueId(queueItem.id);
    let b64 = base64DataMap.get(queueItem.id) || null;
    if (!b64) b64 = await loadPdfBase64(queueItem.id);
    setReviewPdfBase64(b64); setShowForm("pdf-review");
  };

  const handleSaveEntry = async formData => {
    const proposal = { ...formData, source: formData.source || "manual" };
    if (editingId) { updateHistoricalProposal(editingId, proposal); showToast(`Updated "${formData.name}"`); }
    else { addHistoricalProposal(proposal); showToast(`Added "${formData.name}" to Cost History`); }
    if (reviewingQueueId) { updateQueueItem(reviewingQueueId, { status: "saved" }); await saveUploadQueue(); }
    if (Object.keys(formData.divisions || {}).length > 0 && formData.projectSF > 0) {
      const latest = useMasterDataStore.getState().masterData.historicalProposals;
      const saved = editingId ? latest.find(p => p.id === editingId) : latest[latest.length - 1];
      if (saved) { await generateLearningFromProposal(saved); showToast("NOVA calibration data generated"); }
    }
    await saveMasterData(); setShowForm(false); setFormInitial(null); setEditingId(null);
    if (reviewingQueueId) {
      base64DataMap.delete(reviewingQueueId); deletePdfBase64(reviewingQueueId); setReviewPdfBase64(null); setReviewingQueueId(null);
      const queue = useMasterDataStore.getState().pdfUploadQueue;
      const nextExtracted = queue.find(q => q.status === "extracted" && q.extractedData);
      if (nextExtracted) setTimeout(() => handleReviewQueueItem(nextExtracted), 200);
    }
  };

  const handleDelete = async (id, source) => { if (source === "estimate") return; removeHistoricalProposal(id); await saveMasterData(); showToast("Entry removed from Cost History"); };

  const handleEdit = entry => {
    if (entry.source === "estimate") return;
    const p = historicalProposals.find(hp => hp.id === entry.id);
    if (!p) return;
    setFormInitial({ name: p.name, client: p.client || "", architect: p.architect || "", date: p.date || "", projectSF: p.projectSF != null ? String(p.projectSF) : "", buildingType: p.buildingType || "", workType: p.workType || "", totalCost: p.totalCost != null ? String(p.totalCost) : "", divisions: p.divisions || {}, markups: p.markups || [], laborType: p.laborType || "", zipCode: p.zipCode || "", stories: p.stories != null ? String(p.stories) : "", structuralSystem: p.structuralSystem || "", deliveryMethod: p.deliveryMethod || "", outcome: p.outcome || "pending", outcomeMetadata: p.outcomeMetadata || {}, notes: p.notes || "", source: p.source || "manual", sourceFileName: p.sourceFileName || "" });
    setEditingId(entry.id); setReviewingQueueId(null); setShowForm("edit");
  };

  const handleRecalibrate = async entry => {
    const proposal = entry.source === "estimate" ? { id: entry.id, projectSF: entry.projectSF, buildingType: entry.buildingType, workType: entry.workType, divisions: entry.divisions, markups: entry.markups || [], name: entry.name } : historicalProposals.find(p => p.id === entry.id);
    if (!proposal) return;
    await generateLearningFromProposal(proposal); showToast(`NOVA recalibrated "${entry.name}"`);
  };

  const handleOutcomeChange = async (entry, newOutcome) => { if (entry.source === "estimate") return; updateProposalOutcome(entry.id, newOutcome, {}); await saveMasterData(); };

  const factorCount = Object.keys(calibrationFactors).length;
  const queueExtracting = uploadQueue.filter(q => q.status === "extracting").length;
  const batchMode = uploadQueue.length > 5;

  return (
    <Sec title="Cost History">
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
        All your estimates and imported proposals in one place. NOVA uses this data to calibrate ROM estimates, track win rates, and identify pricing patterns.
      </div>

      {/* Analytics toggle + stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setShowAnalytics(prev => !prev)} style={bt(C, { background: showAnalytics ? `${C.accent}15` : C.bg2, border: `1px solid ${showAnalytics ? C.accent + "50" : C.border}`, color: showAnalytics ? C.accent : C.text, padding: "6px 12px", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 })}>
          <Ic d={I.chart || I.scope} size={12} color={showAnalytics ? C.accent : C.textDim} /> Analytics
        </button>
        {[{ label: "Total Entries", value: unifiedEntries.length }, { label: "Estimates", value: estimatesIndex.length }, { label: "Imported", value: historicalProposals.length }].map(s => (
          <div key={s.label} style={{ padding: "5px 10px", borderRadius: 5, background: C.bg2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
            <span style={{ fontWeight: 700, color: C.text }}>{s.value}</span>
            <span style={{ color: C.textDim }}>{s.label}</span>
          </div>
        ))}
        {factorCount > 0 && (
          <div style={{ padding: "5px 10px", borderRadius: 5, background: `${C.accent}10`, border: `1px solid ${C.accent}30`, display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
            <Ic d={I.check} size={10} color={C.accent} />
            <span style={{ fontWeight: 600, color: C.accent }}>Calibrating {factorCount} divisions</span>
          </div>
        )}
      </div>

      {showAnalytics && <CostHistoryAnalytics entries={unifiedEntries} />}

      {/* Calibration factors */}
      {factorCount > 0 && (
        <div style={{ padding: 10, background: C.bg2, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>NOVA Calibration Factors</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {Object.entries(calibrationFactors).sort(([a], [b]) => a.localeCompare(b)).map(([div, factor]) => {
              const divInfo = ROM_DIVISIONS.find(d => d.code === div);
              const pct = Math.round((factor - 1) * 100);
              const color = pct > 0 ? C.red : pct < 0 ? C.green : C.textDim;
              return (
                <div key={div} style={{ padding: "3px 6px", borderRadius: 3, fontSize: 9, background: `${color}12`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ fontWeight: 700, color: C.text, fontFamily: T.font.sans }}>Div {div}</span>
                  <span style={{ color: C.textDim }}>{divInfo?.label || ""}</span>
                  <span style={{ fontWeight: 700, color, fontFamily: T.font.sans }}>{pct > 0 ? "+" : ""}{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => { setShowForm("manual"); setFormInitial(null); setEditingId(null); setReviewingQueueId(null); }} style={bt(C, { background: C.bg2, border: `1px solid ${C.border}`, color: C.text, padding: "7px 12px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 })}>
          <Ic d={I.plus} size={12} color={C.textDim} sw={2} /> Manual Entry
        </button>
        <button onClick={() => pdfRef.current?.click()} style={bt(C, { background: `${C.purple}12`, border: `1px solid ${C.purple}30`, color: C.purple, padding: "7px 12px", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 })}>
          <Ic d={I.upload} size={12} color={C.purple} sw={2} /> Upload Proposals
        </button>
        <input ref={pdfRef} type="file" accept=".pdf" multiple style={{ display: "none" }} onChange={async e => { await handlePdfFilesSelected(Array.from(e.target.files)); e.target.value = ""; }} />
        {queueExtracting > 0 && !batchMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 5, background: `${C.orange}10`, border: `1px solid ${C.orange}25` }}>
            <Ic d={I.ai} size={12} color={C.accent} />
            <span style={{ fontSize: 10, color: C.orange, fontWeight: 600 }}>Extracting {queueExtracting} PDF{queueExtracting !== 1 ? "s" : ""}...</span>
          </div>
        )}
      </div>

      {/* Upload Queue */}
      <ProposalUploadQueue
        C={C} T={T} uploadQueue={uploadQueue} base64DataMap={base64DataMap}
        isPaused={isPaused} batchStatsRef={batchStatsRef}
        handleReviewQueueItem={handleReviewQueueItem} handleRetry={handleRetry}
        handleRetryAll={handleRetryAll} handleTogglePause={handleTogglePause}
        handleBatchAccept={handleBatchAccept} removeQueueItem={removeQueueItem}
        clearSavedFromQueue={clearSavedFromQueue} clearFailedFromQueue={clearFailedFromQueue}
      />

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterBuildingType} onChange={e => setFilterBuildingType(e.target.value)} style={inp(C, { padding: "4px 8px", fontSize: 10, width: 150 })}>
          <option value="">All Building Types</option>
          {BUILDING_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)} style={inp(C, { padding: "4px 8px", fontSize: 10, width: 140 })}>
          <option value="">All Work Types</option>
          {WORK_TYPES.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
        </select>
        <select value={filterLaborType} onChange={e => setFilterLaborType(e.target.value)} style={inp(C, { padding: "4px 8px", fontSize: 10, width: 130 })}>
          <option value="">All Labor Types</option>
          {DEFAULT_LABOR_TYPES.map(lt => <option key={lt.key} value={lt.key}>{lt.label}</option>)}
        </select>
        <select value={filterDeliveryMethod} onChange={e => setFilterDeliveryMethod(e.target.value)} style={inp(C, { padding: "4px 8px", fontSize: 10, width: 130 })}>
          <option value="">All Delivery Methods</option>
          {DELIVERY_METHODS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} style={inp(C, { padding: "4px 8px", fontSize: 10, width: 110 })}>
          <option value="">All Outcomes</option>
          {OUTCOME_STATUSES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)} placeholder="Search name, client, architect..." style={inp(C, { padding: "4px 8px", fontSize: 10, width: 180 })} />
        {(filterBuildingType || filterWorkType || filterLaborType || filterDeliveryMethod || filterOutcome || filterSearch) && (
          <button onClick={() => { setFilterBuildingType(""); setFilterWorkType(""); setFilterLaborType(""); setFilterDeliveryMethod(""); setFilterOutcome(""); setFilterSearch(""); }} style={{ background: "none", border: "none", color: C.accent, fontSize: 10, cursor: "pointer", fontWeight: 600, padding: "4px 6px" }}>Clear filters</button>
        )}
        {filteredEntries.length !== unifiedEntries.length && <span style={{ fontSize: 10, color: C.textDim }}>{filteredEntries.length} of {unifiedEntries.length} entries</span>}
      </div>

      {/* Proposal Table */}
      <ProposalTable
        filteredEntries={filteredEntries} unifiedEntries={unifiedEntries}
        learningRecords={learningRecords} historicalProposals={historicalProposals}
        handleEdit={handleEdit} handleDelete={handleDelete}
        handleRecalibrate={handleRecalibrate} handleOutcomeChange={handleOutcomeChange}
      />

      {/* Entry Form Modal */}
      {showForm && (
        <CostHistoryEntryForm
          onClose={() => { if (reviewingQueueId) { base64DataMap.delete(reviewingQueueId); deletePdfBase64(reviewingQueueId); } setShowForm(false); setFormInitial(null); setEditingId(null); setReviewingQueueId(null); setReviewPdfBase64(null); }}
          onSave={handleSaveEntry}
          initial={formInitial}
          mode={showForm === "pdf-review" ? "pdf-review" : showForm === "edit" ? "edit" : "manual"}
          pdfBase64={reviewPdfBase64}
        />
      )}
    </Sec>
  );
}
