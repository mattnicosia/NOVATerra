// Cost History Panel — Unified view of all estimates + historical proposals
// Lives on Settings page, feeds learning records to scanStore for calibration

import { useState, useRef, useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useScanStore } from '@/stores/scanStore';
import { useUiStore } from '@/stores/uiStore';
import { callAnthropic, pdfBlock } from '@/utils/ai';
import { generateBaselineROM, computeCalibration } from '@/utils/romEngine';
import { saveMasterData } from '@/hooks/usePersistence';
import { mapStatusToOutcome, migrateJobType } from '@/utils/costHistoryMigration';
import { BUILDING_TYPES, WORK_TYPES, OUTCOME_STATUSES, LOST_REASONS,
  STRUCTURAL_SYSTEMS, DELIVERY_METHODS,
  getBuildingTypeLabel, getWorkTypeLabel, getOutcomeInfo,
  getStructuralSystemLabel, getDeliveryMethodLabel } from '@/constants/constructionTypes';
import { DEFAULT_LABOR_TYPES } from '@/utils/laborTypes';
import { resolveLocationFactors } from '@/constants/locationFactors';
import { extractYear, getEscalationFactor, formatEscalation } from '@/utils/costEscalation';
import { getCurrentYear } from '@/constants/constructionCostIndex';
import CostHistoryEntryForm from '@/components/costHistory/CostHistoryEntryForm';
import CostHistoryAnalytics from '@/components/costHistory/CostHistoryAnalytics';
import NovaOrb from '@/components/dashboard/NovaOrb';
import Sec from '@/components/shared/Sec';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';

const fmtCost = (n) => {
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

  // UI state
  const [showForm, setShowForm] = useState(false);   // "manual" | "pdf-review" | false
  const [formInitial, setFormInitial] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [importing, setImporting] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const pdfRef = useRef(null);

  // Multi-upload queue
  const pdfQueueRef = useRef([]);          // files waiting to be processed
  const [queueTotal, setQueueTotal] = useState(0);   // total files in current batch
  const [queueIndex, setQueueIndex] = useState(0);   // current file being processed (1-indexed)

  // Filters
  const [filterBuildingType, setFilterBuildingType] = useState("");
  const [filterWorkType, setFilterWorkType] = useState("");
  const [filterLaborType, setFilterLaborType] = useState("");
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
      outcome: p.outcome || "pending",
      outcomeMetadata: p.outcomeMetadata || {},
      laborType: p.laborType || "",
      zipCode: p.zipCode || "",
      stories: p.stories || 0,
      structuralSystem: p.structuralSystem || "",
      deliveryMethod: p.deliveryMethod || "",
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
      if (filterOutcome && entry.outcome !== filterOutcome) return false;
      if (filterSearch) {
        const s = filterSearch.toLowerCase();
        if (!entry.name.toLowerCase().includes(s) && !entry.client.toLowerCase().includes(s) && !entry.architect.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [unifiedEntries, filterBuildingType, filterWorkType, filterLaborType, filterOutcome, filterSearch]);

  // ── Learning record generation ──
  // Normalizes historical costs to current-year dollars before calibrating
  const generateLearningFromProposal = async (proposal) => {
    const bt = proposal.buildingType || proposal.jobType || "commercial-office";
    const wt = proposal.workType || "";
    const romPrediction = generateBaselineROM(proposal.projectSF, bt, wt, {});

    // Normalize division costs to current-year dollars
    const proposalYear = extractYear(proposal.date);
    const currentYr = getCurrentYear();
    const actuals = { divisions: {} };
    Object.entries(proposal.divisions || {}).forEach(([div, cost]) => {
      const c = parseFloat(cost);
      if (c > 0) {
        // Escalate each division's cost from proposal year to current year
        const factor = getEscalationFactor(proposalYear, currentYr);
        actuals.divisions[div] = Math.round(c * factor);
      }
    });

    const calibration = computeCalibration(romPrediction, actuals);
    await addLearningRecord({
      source: "historical-proposal",
      proposalId: proposal.id,
      proposalName: proposal.name,
      projectSF: proposal.projectSF,
      buildingType: bt,
      workType: wt,
      jobType: bt, // backward compat
      laborType: proposal.laborType || "",
      zipCode: proposal.zipCode || "",
      stories: proposal.stories || 0,
      structuralSystem: proposal.structuralSystem || "",
      deliveryMethod: proposal.deliveryMethod || "",
      originalYear: proposalYear,
      normalizedToYear: currentYr,
      romPrediction: {
        divisions: Object.fromEntries(
          Object.entries(romPrediction.divisions).map(([div, data]) => [div, { mid: data.total.mid }])
        ),
      },
      actuals,
      calibration,
    });
    return calibration;
  };

  // ── Manual entry save ──
  const handleSaveEntry = async (formData) => {
    const proposal = {
      ...formData,
      source: formData.source || "manual",
    };

    if (editingId) {
      // Update existing
      updateHistoricalProposal(editingId, proposal);
      showToast(`Updated "${formData.name}"`);
    } else {
      addHistoricalProposal(proposal);
      showToast(`Added "${formData.name}" to Cost History`);
    }

    // Auto-generate learning record if we have division data
    const hasDivisions = Object.keys(formData.divisions || {}).length > 0;
    if (hasDivisions && formData.projectSF > 0) {
      const latest = useMasterDataStore.getState().masterData.historicalProposals;
      const saved = editingId
        ? latest.find(p => p.id === editingId)
        : latest[latest.length - 1];
      if (saved) {
        await generateLearningFromProposal(saved);
        showToast(`NOVA calibration data generated`);
      }
    }

    await saveMasterData();
    setShowForm(false);
    setFormInitial(null);
    setEditingId(null);

    // If there are more PDFs in the queue, process the next one
    if (pdfQueueRef.current.length > 0) {
      const nextFile = pdfQueueRef.current.shift();
      setQueueIndex(prev => prev + 1);
      // Small delay so the user sees the save toast before next extraction starts
      setTimeout(() => handlePdfUpload(nextFile), 300);
    } else {
      // Queue finished
      setQueueTotal(0);
      setQueueIndex(0);
    }
  };

  // ── PDF Import (single file) ──
  const handlePdfUpload = async (file) => {
    setImporting(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = (e) => resolve(e.target.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await callAnthropic({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{
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
10. **zipCode**: The project zip code (extract from project address on cover sheet). 5 digits only.
11. **stories**: Number of stories/floors above grade (number only). Default to 1 if not stated.
12. **structuralSystem**: Classify as one of: ${STRUCTURAL_SYSTEMS.map(s => `"${s.key}"`).join(", ")}.
    Infer from structural scope section or division breakdown.
13. **deliveryMethod**: Classify as one of: ${DELIVERY_METHODS.map(d => `"${d.key}"`).join(", ")}.
    Look at bid instructions, contract type, or cover page.

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
  "laborType": "open_shop",
  "zipCode": "10001",
  "stories": 3,
  "structuralSystem": "steel-frame",
  "deliveryMethod": "hard-bid"
}`,
            },
          ],
        }],
        system: "You are NOVA, the AI construction intelligence inside BLDG Omni. Analyze this historical proposal to extract cost data. Be precise. Return only valid JSON.",
      });

      let parsed;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        showToast(`Failed to parse AI response for "${file.name}"`, "error");
        setImporting(false);
        processNextInQueue();
        return;
      }

      if (!parsed || !parsed.projectName) {
        showToast(`Could not extract proposal data from "${file.name}"`, "error");
        setImporting(false);
        processNextInQueue();
        return;
      }

      // Open review form pre-filled with extraction
      // Convert numeric values to strings for form inputs (preserve 0, don't coerce to "")
      setFormInitial({
        name: parsed.projectName || file.name,
        client: parsed.client || "",
        architect: parsed.architect || "",
        date: new Date().toISOString().split("T")[0],
        projectSF: parsed.projectSF != null ? String(parsed.projectSF) : "",
        buildingType: parsed.buildingType || "",
        workType: parsed.workType || "",
        totalCost: parsed.totalCost != null ? String(parsed.totalCost) : "",
        divisions: parsed.divisions || {},
        laborType: parsed.laborType || "",
        zipCode: parsed.zipCode || "",
        stories: parsed.stories != null ? String(parsed.stories) : "",
        structuralSystem: parsed.structuralSystem || "",
        deliveryMethod: parsed.deliveryMethod || "",
        source: "pdf",
        sourceFileName: file.name,
        outcome: "pending",
        outcomeMetadata: {},
      });
      setEditingId(null);
      setShowForm("pdf-review");
    } catch (err) {
      console.error("[CostHistory] PDF import error:", err);
      showToast("NOVA extraction failed: " + (err.message || "Unknown error"), "error");
      processNextInQueue();
    } finally {
      setImporting(false);
    }
  };

  // Process next file in the PDF queue (after error/skip)
  const processNextInQueue = () => {
    if (pdfQueueRef.current.length > 0) {
      const nextFile = pdfQueueRef.current.shift();
      setQueueIndex(prev => prev + 1);
      setTimeout(() => handlePdfUpload(nextFile), 300);
    } else {
      setQueueTotal(0);
      setQueueIndex(0);
    }
  };

  // ── Multi-PDF Upload Handler ──
  const handlePdfFilesSelected = (files) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    // First file gets processed immediately, rest go to queue
    const [first, ...rest] = fileArray;
    pdfQueueRef.current = rest;
    setQueueTotal(fileArray.length);
    setQueueIndex(1);
    handlePdfUpload(first);
  };

  // ── Delete ──
  const handleDelete = async (id, source) => {
    if (source === "estimate") return; // Can't delete estimates from here
    removeHistoricalProposal(id);
    await saveMasterData();
    showToast("Entry removed from Cost History");
  };

  // ── Edit ──
  const handleEdit = (entry) => {
    if (entry.source === "estimate") return; // Can't edit estimates from here
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
    setShowForm("edit");
  };

  // ── Recalibrate ──
  const handleRecalibrate = async (entry) => {
    const proposal = entry.source === "estimate"
      ? { id: entry.id, projectSF: entry.projectSF, buildingType: entry.buildingType, workType: entry.workType, divisions: entry.divisions, name: entry.name }
      : historicalProposals.find(p => p.id === entry.id);
    if (!proposal) return;
    await generateLearningFromProposal(proposal);
    showToast(`NOVA recalibrated "${entry.name}"`);
  };

  // ── Quick outcome change for historical proposals ──
  const handleOutcomeChange = async (entry, newOutcome) => {
    if (entry.source === "estimate") return;
    updateProposalOutcome(entry.id, newOutcome, {});
    await saveMasterData();
  };

  // Stats
  const factorCount = Object.keys(calibrationFactors).length;

  // Source badge
  const sourceBadge = (source) => {
    const colors = { estimate: C.blue, pdf: C.purple, manual: C.textDim };
    const labels = { estimate: "Estimate", pdf: "PDF", manual: "Manual" };
    return (
      <span style={{
        fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
        background: `${colors[source] || C.textDim}20`,
        color: colors[source] || C.textDim,
      }}>
        {labels[source] || source}
      </span>
    );
  };

  // Outcome badge
  const outcomeBadge = (outcomeKey) => {
    const info = getOutcomeInfo(outcomeKey);
    const colorMap = { green: C.green, red: C.red, blue: C.blue, orange: C.orange, textDim: C.textDim };
    const color = colorMap[info.color] || C.textDim;
    return (
      <span style={{
        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
        background: `${color}18`, color,
      }}>
        {info.label}
      </span>
    );
  };

  return (
    <Sec title="Cost History">
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
        All your estimates and imported proposals in one place. NOVA uses this data to calibrate ROM estimates, track win rates, and identify pricing patterns.
      </div>

      {/* Analytics toggle + stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setShowAnalytics(prev => !prev)}
          style={bt(C, {
            background: showAnalytics ? `${C.accent}15` : C.bg2,
            border: `1px solid ${showAnalytics ? C.accent + '50' : C.border}`,
            color: showAnalytics ? C.accent : C.text,
            padding: "6px 12px", fontSize: 10, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 5,
          })}>
          <Ic d={I.chart || I.scope} size={12} color={showAnalytics ? C.accent : C.textDim} />
          Analytics
        </button>

        <div style={{ padding: "5px 10px", borderRadius: 5, background: C.bg2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
          <span style={{ fontWeight: 700, color: C.text }}>{unifiedEntries.length}</span>
          <span style={{ color: C.textDim }}>Total Entries</span>
        </div>
        <div style={{ padding: "5px 10px", borderRadius: 5, background: C.bg2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
          <span style={{ fontWeight: 700, color: C.text }}>{estimatesIndex.length}</span>
          <span style={{ color: C.textDim }}>Estimates</span>
        </div>
        <div style={{ padding: "5px 10px", borderRadius: 5, background: C.bg2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
          <span style={{ fontWeight: 700, color: C.text }}>{historicalProposals.length}</span>
          <span style={{ color: C.textDim }}>Imported</span>
        </div>
        {factorCount > 0 && (
          <div style={{ padding: "5px 10px", borderRadius: 5, background: `${C.accent}10`, border: `1px solid ${C.accent}30`, display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
            <Ic d={I.check} size={10} color={C.accent} />
            <span style={{ fontWeight: 600, color: C.accent }}>Calibrating {factorCount} divisions</span>
          </div>
        )}
      </div>

      {/* Analytics Panel */}
      {showAnalytics && <CostHistoryAnalytics entries={unifiedEntries} />}

      {/* Calibration factors */}
      {factorCount > 0 && (
        <div style={{ padding: 10, background: C.bg2, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            NOVA Calibration Factors
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {Object.entries(calibrationFactors).sort(([a], [b]) => a.localeCompare(b)).map(([div, factor]) => {
              const divInfo = ROM_DIVISIONS.find(d => d.code === div);
              const pct = Math.round((factor - 1) * 100);
              const color = pct > 0 ? C.red : pct < 0 ? C.green : C.textDim;
              return (
                <div key={div} style={{
                  padding: "3px 6px", borderRadius: 3, fontSize: 9,
                  background: `${color}12`, border: `1px solid ${color}30`,
                  display: "flex", alignItems: "center", gap: 3,
                }}>
                  <span style={{ fontWeight: 700, color: C.text, fontFamily: "'DM Mono',monospace" }}>Div {div}</span>
                  <span style={{ color: C.textDim }}>{divInfo?.label || ""}</span>
                  <span style={{ fontWeight: 700, color, fontFamily: "'DM Mono',monospace" }}>
                    {pct > 0 ? "+" : ""}{pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => { setShowForm("manual"); setFormInitial(null); setEditingId(null); }}
          style={bt(C, {
            background: C.bg2, border: `1px solid ${C.border}`,
            color: C.text, padding: "7px 12px", fontSize: 11, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 5,
          })}>
          <Ic d={I.plus} size={12} color={C.textDim} sw={2} />
          Manual Entry
        </button>
        <button onClick={() => pdfRef.current?.click()} disabled={importing}
          style={bt(C, {
            background: C.bg2, border: `1px solid ${C.border}`,
            color: C.purple,
            padding: "7px 12px", fontSize: 11, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 5,
          })}>
          {importing
            ? <NovaOrb size={14} scheme="nova" />
            : <Ic d={I.upload} size={12} color={C.purple} sw={2} />
          }
          {importing
            ? (queueTotal > 1 ? `Extracting ${queueIndex} of ${queueTotal}...` : "Extracting...")
            : "NOVA Extract PDFs"
          }
        </button>
        <input ref={pdfRef} type="file" accept=".pdf" multiple style={{ display: "none" }}
          onChange={e => { handlePdfFilesSelected(e.target.files); e.target.value = ""; }} />
        {queueTotal > 1 && !importing && pdfQueueRef.current.length > 0 && (
          <span style={{ fontSize: 10, color: C.textMuted, fontStyle: "italic" }}>
            {pdfQueueRef.current.length} more PDF{pdfQueueRef.current.length !== 1 ? "s" : ""} queued
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterBuildingType} onChange={e => setFilterBuildingType(e.target.value)}
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 150 })}>
          <option value="">All Building Types</option>
          {BUILDING_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <select value={filterWorkType} onChange={e => setFilterWorkType(e.target.value)}
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 140 })}>
          <option value="">All Work Types</option>
          {WORK_TYPES.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
        </select>
        <select value={filterLaborType} onChange={e => setFilterLaborType(e.target.value)}
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 130 })}>
          <option value="">All Labor Types</option>
          {DEFAULT_LABOR_TYPES.map(lt => <option key={lt.key} value={lt.key}>{lt.label}</option>)}
        </select>
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)}
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 110 })}>
          <option value="">All Outcomes</option>
          {OUTCOME_STATUSES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
          placeholder="Search name, client, architect..."
          style={inp(C, { padding: "4px 8px", fontSize: 10, width: 180 })} />
        {(filterBuildingType || filterWorkType || filterLaborType || filterOutcome || filterSearch) && (
          <button onClick={() => { setFilterBuildingType(""); setFilterWorkType(""); setFilterLaborType(""); setFilterOutcome(""); setFilterSearch(""); }}
            style={{ background: "none", border: "none", color: C.accent, fontSize: 10, cursor: "pointer", fontWeight: 600, padding: "4px 6px" }}>
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
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 70px 70px 70px 80px 65px 60px 45px",
            gap: 6, padding: "4px 8px", fontSize: 9, fontWeight: 700,
            color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5,
          }}>
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
            const costPerSF = entry.projectSF > 0 && entry.totalCost > 0
              ? Math.round(entry.totalCost / entry.projectSF)
              : 0;
            // Adjusted $/SF — normalize to current year dollars
            const entryYear = extractYear(entry.date);
            const currentYr = getCurrentYear();
            const escalationFactor = getEscalationFactor(entryYear, currentYr);
            const adjCostPerSF = costPerSF > 0 && escalationFactor !== 1
              ? Math.round(costPerSF * escalationFactor)
              : costPerSF;
            const divCount = Object.keys(entry.divisions || {}).length;
            const hasLearning = learningRecords.some(r => r.proposalId === entry.id);

            return (
              <div key={`${entry.source}-${entry.id}`}>
                <div onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr 70px 70px 70px 80px 65px 60px 45px",
                    gap: 6, padding: "7px 8px", borderRadius: 5, cursor: "pointer", alignItems: "center",
                    background: isExpanded ? `${C.accent}08` : C.bg2,
                    border: `1px solid ${isExpanded ? C.accent + '30' : C.border}`,
                    transition: "all 0.12s",
                  }}>
                  {/* Project */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</div>
                  </div>
                  {/* Client */}
                  <div style={{ fontSize: 10, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.client || "—"}
                  </div>
                  {/* Type */}
                  <div style={{ fontSize: 9, color: C.textDim, lineHeight: 1.3 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getBuildingTypeLabel(entry.buildingType)}</div>
                    {entry.workType && <div style={{ color: C.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getWorkTypeLabel(entry.workType)}</div>}
                  </div>
                  {/* SF */}
                  <div style={{ fontSize: 10, color: C.text, textAlign: "right", fontFamily: "'DM Mono',monospace" }}>
                    {entry.projectSF > 0 ? entry.projectSF.toLocaleString() : "—"}
                  </div>
                  {/* $/SF */}
                  <div style={{ fontSize: 10, color: C.text, textAlign: "right", fontFamily: "'DM Mono',monospace" }}>
                    {costPerSF > 0 ? `$${costPerSF}` : "—"}
                  </div>
                  {/* Adj $/SF */}
                  <div style={{ fontSize: 10, textAlign: "right", fontFamily: "'DM Mono',monospace" }}>
                    {adjCostPerSF > 0 && adjCostPerSF !== costPerSF ? (
                      <span style={{ color: C.accent, fontWeight: 600 }}>${adjCostPerSF}</span>
                    ) : adjCostPerSF > 0 ? (
                      <span style={{ color: C.textDim }}>—</span>
                    ) : "—"}
                  </div>
                  {/* Total */}
                  <div style={{ fontSize: 10, color: C.text, textAlign: "right", fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>
                    {entry.totalCost > 0 ? fmtCost(entry.totalCost) : "—"}
                  </div>
                  {/* Outcome */}
                  <div style={{ textAlign: "center" }}>
                    {outcomeBadge(entry.outcome)}
                  </div>
                  {/* Source */}
                  <div style={{ textAlign: "center", display: "flex", gap: 3, justifyContent: "center", alignItems: "center" }}>
                    {sourceBadge(entry.source)}
                    {hasLearning && <span style={{ fontSize: 8, fontWeight: 700, color: C.green }}>Cal</span>}
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                    {entry.source !== "estimate" && (
                      <button onClick={e => { e.stopPropagation(); handleDelete(entry.id, entry.source); }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 3, opacity: 0.4 }}
                        title="Delete">
                        <Ic d={I.trash} size={11} color={C.red} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "10px 12px", margin: "2px 0 4px", background: C.bg1, borderRadius: "0 0 6px 6px", border: `1px solid ${C.accent}20`, borderTop: "none" }}>
                    {/* Meta row */}
                    <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
                      {entry.architect && <div style={{ fontSize: 10, color: C.textDim }}>Architect: <strong style={{ color: C.text }}>{entry.architect}</strong></div>}
                      <div style={{ fontSize: 10, color: C.textDim }}>Date: <strong style={{ color: C.text }}>{entry.date || "—"}</strong></div>
                      <div style={{ fontSize: 10, color: C.textDim }}>Divisions: <strong style={{ color: C.text }}>{divCount}</strong></div>
                      {entry.sourceFileName && <div style={{ fontSize: 10, color: C.textDim }}>File: <strong style={{ color: C.text }}>{entry.sourceFileName}</strong></div>}
                      {entry.source === "estimate" && <div style={{ fontSize: 10, color: C.blue, fontWeight: 600 }}>Status: {entry.status}</div>}
                      {escalationFactor !== 1 && costPerSF > 0 && (
                        <div style={{ fontSize: 10, color: C.accent, fontWeight: 600 }}>
                          Escalation: {formatEscalation(escalationFactor)} ({entryYear}→{currentYr})
                        </div>
                      )}
                    </div>
                    {/* Extended data row */}
                    {(entry.laborType || entry.zipCode || entry.stories > 0 || entry.structuralSystem || entry.deliveryMethod) && (
                      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                        {entry.laborType && (() => {
                          const ltColors = { union: C.orange, prevailing_wage: C.red, open_shop: C.green };
                          const ltLabels = { union: "Union", prevailing_wage: "Prevailing Wage", open_shop: "Open Shop" };
                          const c = ltColors[entry.laborType] || C.textDim;
                          return (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: `${c}15`, color: c }}>
                              {ltLabels[entry.laborType] || entry.laborType}
                            </span>
                          );
                        })()}
                        {entry.zipCode && (() => {
                          const loc = resolveLocationFactors(entry.zipCode);
                          return (
                            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: `${C.blue}12`, color: C.blue }}>
                              {loc.source !== "none" ? `${loc.label} (L:${loc.lab}×)` : entry.zipCode}
                            </span>
                          );
                        })()}
                        {entry.stories > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: C.bg2, color: C.textDim }}>
                            {entry.stories} {entry.stories === 1 ? "story" : "stories"}
                          </span>
                        )}
                        {entry.structuralSystem && (
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: C.bg2, color: C.textDim }}>
                            {getStructuralSystemLabel(entry.structuralSystem)}
                          </span>
                        )}
                        {entry.deliveryMethod && (
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: C.bg2, color: C.textDim }}>
                            {getDeliveryMethodLabel(entry.deliveryMethod)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Outcome metadata */}
                    {entry.outcomeMetadata && (entry.outcomeMetadata.lostReason || entry.outcomeMetadata.competitor || entry.outcomeMetadata.contractAmount) && (
                      <div style={{ display: "flex", gap: 12, marginBottom: 10, padding: "6px 10px", borderRadius: 5, background: C.bg2 }}>
                        {entry.outcomeMetadata.lostReason && (
                          <div style={{ fontSize: 10, color: C.textDim }}>
                            Reason: <strong style={{ color: C.red }}>{LOST_REASONS.find(r => r.key === entry.outcomeMetadata.lostReason)?.label || entry.outcomeMetadata.lostReason}</strong>
                          </div>
                        )}
                        {entry.outcomeMetadata.competitor && (
                          <div style={{ fontSize: 10, color: C.textDim }}>Competitor: <strong style={{ color: C.text }}>{entry.outcomeMetadata.competitor}</strong></div>
                        )}
                        {entry.outcomeMetadata.competitorAmount && (
                          <div style={{ fontSize: 10, color: C.textDim }}>Their Bid: <strong style={{ color: C.text }}>{fmtCost(entry.outcomeMetadata.competitorAmount)}</strong></div>
                        )}
                        {entry.outcomeMetadata.contractAmount && (
                          <div style={{ fontSize: 10, color: C.textDim }}>Contract: <strong style={{ color: C.green }}>{fmtCost(entry.outcomeMetadata.contractAmount)}</strong></div>
                        )}
                      </div>
                    )}

                    {/* Division breakdown */}
                    {divCount > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 3, marginBottom: 10 }}>
                        {Object.entries(entry.divisions).sort(([a], [b]) => a.localeCompare(b)).map(([div, cost]) => {
                          const divInfo = ROM_DIVISIONS.find(d => d.code === div);
                          return (
                            <div key={div} style={{ display: "flex", justifyContent: "space-between", padding: "3px 6px", borderRadius: 3, background: C.bg2, fontSize: 10 }}>
                              <span style={{ color: C.textDim }}>
                                <span style={{ fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{div}</span> {divInfo?.label || ""}
                              </span>
                              <span style={{ fontWeight: 600, color: C.text, fontFamily: "'DM Mono',monospace" }}>{fmtCost(cost)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Notes */}
                    {entry.notes && (
                      <div style={{ fontSize: 10, color: C.textDim, marginBottom: 10, fontStyle: "italic" }}>{entry.notes}</div>
                    )}

                    {/* Row actions */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {entry.source !== "estimate" && (
                        <>
                          <button onClick={() => handleEdit(entry)}
                            style={bt(C, { background: C.bg2, border: `1px solid ${C.border}`, color: C.text, padding: "4px 10px", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 })}>
                            <Ic d={I.edit} size={11} color={C.textDim} />
                            Edit
                          </button>
                          {/* Quick outcome */}
                          <select value={entry.outcome} onChange={e => { e.stopPropagation(); handleOutcomeChange(entry, e.target.value); }}
                            onClick={e => e.stopPropagation()}
                            style={inp(C, { padding: "4px 8px", fontSize: 10, width: 90 })}>
                            {OUTCOME_STATUSES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                          </select>
                        </>
                      )}
                      {divCount > 0 && (
                        <button onClick={() => handleRecalibrate(entry)}
                          style={bt(C, { background: `${C.accent}12`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "4px 10px", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 })}>
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
          onClose={() => { setShowForm(false); setFormInitial(null); setEditingId(null); }}
          onSave={handleSaveEntry}
          initial={formInitial}
          mode={showForm === "pdf-review" ? "pdf-review" : showForm === "edit" ? "edit" : "manual"}
        />
      )}
    </Sec>
  );
}
