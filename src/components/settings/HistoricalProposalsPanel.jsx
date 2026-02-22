// Historical Proposals Panel — Import past project cost data for ROM calibration
// Lives on Settings page, feeds learning records to scanStore for calibration factors

import { useState, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useScanStore } from '@/stores/scanStore';
import { useUiStore } from '@/stores/uiStore';
import { callAnthropic, pdfBlock } from '@/utils/ai';
import { generateBaselineROM, computeCalibration } from '@/utils/romEngine';
import { saveMasterData } from '@/hooks/usePersistence';
import Sec from '@/components/shared/Sec';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';

const fmtCost = (n) => {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString();
};

// CSI divisions that the ROM tracks (matching romEngine BENCHMARKS)
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

const JOB_TYPE_MAP = {
  "commercial-office": "Commercial / Office",
  "retail": "Retail",
  "healthcare": "Healthcare",
  "education": "Education",
  "industrial": "Industrial",
  "residential-multi": "Multi-Family Residential",
};

export default function HistoricalProposalsPanel() {
  const C = useTheme();
  const T = C.T;
  const showToast = useUiStore(s => s.showToast);
  const apiKey = useUiStore(s => s.appSettings.apiKey);
  const historicalProposals = useMasterDataStore(s => s.masterData.historicalProposals || []);
  const addHistoricalProposal = useMasterDataStore(s => s.addHistoricalProposal);
  const removeHistoricalProposal = useMasterDataStore(s => s.removeHistoricalProposal);
  const learningRecords = useScanStore(s => s.learningRecords);
  const addLearningRecord = useScanStore(s => s.addLearningRecord);
  const calibrationFactors = useScanStore.getState().getCalibrationFactors();

  const [showForm, setShowForm] = useState(false);
  const [importing, setImporting] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const pdfRef = useRef(null);

  // Manual entry form state
  const [form, setForm] = useState({
    name: "", client: "", date: "", projectSF: "",
    jobType: "commercial-office", totalCost: "",
    divisions: {},
  });

  const updateForm = (field, val) => setForm(prev => ({ ...prev, [field]: val }));
  const updateDiv = (div, val) => setForm(prev => ({
    ...prev,
    divisions: { ...prev.divisions, [div]: val },
  }));

  // ── Generate learning record from a proposal ──
  const generateLearningFromProposal = async (proposal) => {
    // Generate what the ROM *would have predicted* for this SF & job type (uncalibrated)
    const romPrediction = generateBaselineROM(proposal.projectSF, proposal.jobType, {});

    // Build actuals from the proposal's division data
    const actuals = { divisions: {} };
    Object.entries(proposal.divisions || {}).forEach(([div, cost]) => {
      const c = parseFloat(cost);
      if (c > 0) actuals.divisions[div] = c;
    });

    // Compute calibration (actual / predicted ratio per division)
    const calibration = computeCalibration(romPrediction, actuals);

    // Store as learning record
    await addLearningRecord({
      source: "historical-proposal",
      proposalId: proposal.id,
      proposalName: proposal.name,
      projectSF: proposal.projectSF,
      jobType: proposal.jobType,
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

  // ── Save manual entry ──
  const handleSaveManual = async () => {
    if (!form.name || !form.projectSF) {
      showToast("Project name and SF are required", "error");
      return;
    }

    const proposal = {
      name: form.name,
      client: form.client,
      date: form.date || new Date().toISOString().split("T")[0],
      projectSF: parseFloat(form.projectSF) || 0,
      jobType: form.jobType,
      totalCost: parseFloat(form.totalCost) || 0,
      divisions: Object.fromEntries(
        Object.entries(form.divisions).filter(([, v]) => parseFloat(v) > 0).map(([k, v]) => [k, parseFloat(v)])
      ),
      source: "manual",
    };

    addHistoricalProposal(proposal);

    // Auto-generate learning record if we have division data
    const hasDivisions = Object.keys(proposal.divisions).length > 0;
    if (hasDivisions) {
      // Get the just-added proposal with its generated ID
      const latest = useMasterDataStore.getState().masterData.historicalProposals;
      const saved = latest[latest.length - 1];
      await generateLearningFromProposal(saved);
      showToast(`Imported "${form.name}" — calibration data generated`);
    } else {
      showToast(`Imported "${form.name}" (add division costs for calibration)`);
    }

    await saveMasterData();

    // Reset form
    setForm({ name: "", client: "", date: "", projectSF: "", jobType: "commercial-office", totalCost: "", divisions: {} });
    setShowForm(false);
  };

  // ── PDF Import ──
  const handlePdfUpload = async (file) => {
    if (!apiKey) {
      showToast("Set your Anthropic API key in Settings to use PDF import", "error");
      return;
    }

    setImporting(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = (e) => {
          const full = e.target.result;
          resolve(full.split(",")[1]); // strip data:... prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await callAnthropic({
        apiKey,
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
3. **projectSF**: Building square footage (number only). Look for "SF", "sq ft", "square feet", "gross area", etc.
4. **jobType**: Classify as one of: "commercial-office", "retail", "healthcare", "education", "industrial", "residential-multi"
5. **totalCost**: Total bid/proposal amount (number only, no $ or commas)
6. **divisions**: Object mapping CSI division codes to dollar amounts. Map line items to these divisions:
   - "01": General Requirements / General Conditions
   - "02": Demo / Existing Conditions
   - "03": Concrete
   - "04": Masonry
   - "05": Metals / Structural Steel
   - "06": Wood / Carpentry / Millwork
   - "07": Thermal & Moisture / Roofing / Waterproofing
   - "08": Openings / Doors / Windows / Glazing
   - "09": Finishes / Drywall / Paint / Flooring / Ceiling
   - "10": Specialties
   - "11": Equipment
   - "14": Conveying / Elevator
   - "21": Fire Suppression / Sprinkler
   - "22": Plumbing
   - "23": HVAC / Mechanical
   - "26": Electrical
   - "27": Communications / Low Voltage
   - "28": Electronic Safety / Fire Alarm
   - "31": Earthwork / Site Work
   - "32": Exterior / Paving / Landscaping
   - "33": Utilities

If the proposal has line items that span multiple divisions, distribute them reasonably.
If a division cost can't be determined, omit it.

Return ONLY a JSON object with these fields. Example:
{
  "projectName": "ABC Office Renovation",
  "client": "ABC Corp",
  "projectSF": 25000,
  "jobType": "commercial-office",
  "totalCost": 850000,
  "divisions": { "03": 45000, "05": 30000, "08": 25000, "09": 60000, "22": 35000, "23": 55000, "26": 40000 }
}`,
            },
          ],
        }],
        system: "You are a construction cost analysis expert. Extract cost data from proposals accurately. Return only valid JSON.",
      });

      // Parse AI response
      let parsed;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch {
        showToast("Failed to parse AI response", "error");
        setImporting(false);
        return;
      }

      if (!parsed || !parsed.projectName) {
        showToast("Could not extract proposal data from PDF", "error");
        setImporting(false);
        return;
      }

      const proposal = {
        name: parsed.projectName || file.name,
        client: parsed.client || "",
        date: new Date().toISOString().split("T")[0],
        projectSF: parseFloat(parsed.projectSF) || 0,
        jobType: parsed.jobType || "commercial-office",
        totalCost: parseFloat(parsed.totalCost) || 0,
        divisions: parsed.divisions || {},
        source: "pdf",
        sourceFileName: file.name,
      };

      addHistoricalProposal(proposal);

      // Auto-generate learning record
      const hasDivisions = Object.keys(proposal.divisions).length > 0;
      if (hasDivisions && proposal.projectSF > 0) {
        const latest = useMasterDataStore.getState().masterData.historicalProposals;
        const saved = latest[latest.length - 1];
        await generateLearningFromProposal(saved);
        showToast(`Imported "${proposal.name}" from PDF — calibration data generated`);
      } else {
        showToast(`Imported "${proposal.name}" from PDF`);
      }

      await saveMasterData();
    } catch (err) {
      console.error("[HistoricalProposals] PDF import error:", err);
      showToast("PDF import failed: " + (err.message || "Unknown error"), "error");
    } finally {
      setImporting(false);
    }
  };

  // ── Delete proposal ──
  const handleDelete = async (id) => {
    removeHistoricalProposal(id);
    await saveMasterData();
    showToast("Proposal removed");
  };

  // ── Regenerate calibration for a proposal ──
  const handleRecalibrate = async (proposal) => {
    await generateLearningFromProposal(proposal);
    showToast(`Calibration updated for "${proposal.name}"`);
  };

  // Stats
  const totalProposals = historicalProposals.length;
  const totalRecords = learningRecords.length;
  const factorCount = Object.keys(calibrationFactors).length;

  return (
    <Sec title="Cost History (ROM Calibration)">
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14 }}>
        Import past proposals to calibrate ROM estimates. The more historical data you add, the more accurate future Scan predictions become.
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ padding: "8px 14px", borderRadius: 6, background: C.bg2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: totalProposals > 0 ? C.green : C.textDim, boxShadow: totalProposals > 0 ? `0 0 6px ${C.green}60` : "none" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{totalProposals}</span>
          <span style={{ fontSize: 10, color: C.textDim }}>Proposals</span>
        </div>
        <div style={{ padding: "8px 14px", borderRadius: 6, background: C.bg2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: totalRecords > 0 ? C.blue : C.textDim, boxShadow: totalRecords > 0 ? `0 0 6px ${C.blue}60` : "none" }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{totalRecords}</span>
          <span style={{ fontSize: 10, color: C.textDim }}>Learning Records</span>
        </div>
        {factorCount > 0 && (
          <div style={{ padding: "8px 14px", borderRadius: 6, background: `${C.accent}10`, border: `1px solid ${C.accent}30`, display: "flex", alignItems: "center", gap: 8 }}>
            <Ic d={I.check} size={12} color={C.accent} />
            <span style={{ fontSize: 10, fontWeight: 600, color: C.accent }}>Calibrating {factorCount} divisions</span>
          </div>
        )}
      </div>

      {/* Calibration factors preview */}
      {factorCount > 0 && (
        <div style={{ padding: 12, background: C.bg2, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            Active Calibration Factors
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(calibrationFactors).sort(([a], [b]) => a.localeCompare(b)).map(([div, factor]) => {
              const divInfo = ROM_DIVISIONS.find(d => d.code === div);
              const pct = Math.round((factor - 1) * 100);
              const color = pct > 0 ? C.red : pct < 0 ? C.green : C.textDim;
              return (
                <div key={div} style={{
                  padding: "4px 8px", borderRadius: 4, fontSize: 10,
                  background: `${color}12`, border: `1px solid ${color}30`,
                  display: "flex", alignItems: "center", gap: 4,
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
          <div style={{ fontSize: 9, color: C.textDim, marginTop: 6 }}>
            Positive = your costs run higher than benchmark. Negative = your costs run lower. Applied to all future ROM scans.
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setShowForm(prev => !prev)}
          style={bt(C, {
            background: showForm ? `${C.accent}15` : C.bg2,
            border: `1px solid ${showForm ? C.accent + '50' : C.border}`,
            color: showForm ? C.accent : C.text,
            padding: "8px 14px", fontSize: 11, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
          })}>
          <Ic d={I.plus} size={13} color={showForm ? C.accent : C.textDim} sw={2} />
          Manual Entry
        </button>
        <button onClick={() => pdfRef.current?.click()} disabled={importing || !apiKey}
          style={bt(C, {
            background: C.bg2, border: `1px solid ${C.border}`,
            color: apiKey ? C.purple : C.textDim,
            padding: "8px 14px", fontSize: 11, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 6,
            opacity: apiKey ? 1 : 0.5,
          })}>
          <Ic d={I.upload} size={13} color={apiKey ? C.purple : C.textDim} sw={2} />
          {importing ? "Importing..." : "Import PDF"}
        </button>
        <input ref={pdfRef} type="file" accept=".pdf" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ""; }} />
      </div>

      {/* Manual entry form */}
      {showForm && (
        <div style={{ padding: 16, background: C.bg1, borderRadius: 8, border: `1px solid ${C.accent}30`, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
            Add Past Project
          </div>

          {/* Basic info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Project Name *</label>
              <input value={form.name} onChange={e => updateForm("name", e.target.value)}
                placeholder="e.g. ABC Office Renovation"
                style={inp(C, { padding: "6px 10px", fontSize: 12 })} />
            </div>
            <div>
              <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Client</label>
              <input value={form.client} onChange={e => updateForm("client", e.target.value)}
                style={inp(C, { padding: "6px 10px", fontSize: 12 })} />
            </div>
            <div>
              <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Project SF *</label>
              <input type="number" value={form.projectSF} onChange={e => updateForm("projectSF", e.target.value)}
                placeholder="25000"
                style={nInp(C, { padding: "6px 10px", fontSize: 12 })} />
            </div>
            <div>
              <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Job Type</label>
              <select value={form.jobType} onChange={e => updateForm("jobType", e.target.value)}
                style={inp(C, { padding: "6px 10px", fontSize: 11 })}>
                {Object.entries(JOB_TYPE_MAP).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Total Cost</label>
              <input type="number" value={form.totalCost} onChange={e => updateForm("totalCost", e.target.value)}
                placeholder="850000"
                style={nInp(C, { padding: "6px 10px", fontSize: 12 })} />
            </div>
            <div>
              <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Date</label>
              <input type="date" value={form.date} onChange={e => updateForm("date", e.target.value)}
                style={inp(C, { padding: "6px 10px", fontSize: 11 })} />
            </div>
          </div>

          {/* Division cost breakdown */}
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Division Costs (for calibration)
          </div>
          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 8 }}>
            Enter costs per division. Only enter divisions you have data for — leave others empty.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 14, maxHeight: 280, overflowY: "auto" }}>
            {ROM_DIVISIONS.map(d => (
              <div key={d.code} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 6px", borderRadius: 4, background: form.divisions[d.code] ? `${C.accent}08` : "transparent" }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.textDim, fontFamily: "'DM Mono',monospace", width: 18 }}>{d.code}</span>
                <span style={{ fontSize: 9, color: C.textDim, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</span>
                <input type="number" value={form.divisions[d.code] || ""}
                  onChange={e => updateDiv(d.code, e.target.value)}
                  placeholder="$"
                  style={nInp(C, { width: 80, padding: "3px 6px", fontSize: 11, textAlign: "right" })} />
              </div>
            ))}
          </div>

          {/* Running total vs entered total */}
          {(() => {
            const divSum = Object.values(form.divisions).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            const total = parseFloat(form.totalCost) || 0;
            const diff = total > 0 && divSum > 0 ? total - divSum : 0;
            return divSum > 0 ? (
              <div style={{ padding: "6px 10px", borderRadius: 4, background: C.bg2, marginBottom: 12, display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: C.textDim }}>Division subtotal: <strong style={{ color: C.text }}>{fmtCost(divSum)}</strong></span>
                {total > 0 && Math.abs(diff) > 0 && (
                  <span style={{ color: diff > 0 ? C.orange : C.green }}>
                    {diff > 0 ? `${fmtCost(diff)} unallocated` : `${fmtCost(Math.abs(diff))} over total`}
                  </span>
                )}
              </div>
            ) : null;
          })()}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowForm(false)}
              style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "7px 16px", fontSize: 11 })}>
              Cancel
            </button>
            <button onClick={handleSaveManual}
              style={bt(C, { background: C.accent, color: "#fff", padding: "7px 16px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 })}>
              <Ic d={I.save} size={13} color="#fff" sw={2} />
              Save Proposal
            </button>
          </div>
        </div>
      )}

      {/* Proposal list */}
      {historicalProposals.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 80px 100px 80px 60px", gap: 8, padding: "4px 10px", fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
            <span>Project</span>
            <span>Client</span>
            <span style={{ textAlign: "right" }}>SF</span>
            <span style={{ textAlign: "right" }}>Total Cost</span>
            <span style={{ textAlign: "center" }}>Source</span>
            <span />
          </div>

          {historicalProposals.map(p => {
            const isExpanded = expandedId === p.id;
            const divCount = Object.keys(p.divisions || {}).length;
            const hasLearning = learningRecords.some(r => r.proposalId === p.id);

            return (
              <div key={p.id}>
                {/* Row */}
                <div onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 1fr 80px 100px 80px 60px", gap: 8,
                    padding: "8px 10px", borderRadius: 6, cursor: "pointer", alignItems: "center",
                    background: isExpanded ? `${C.accent}08` : C.bg2,
                    border: `1px solid ${isExpanded ? C.accent + '30' : C.border}`,
                    transition: "all 0.15s",
                  }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{p.name}</div>
                    <div style={{ fontSize: 9, color: C.textDim }}>{JOB_TYPE_MAP[p.jobType] || p.jobType}</div>
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim }}>{p.client || "—"}</div>
                  <div style={{ fontSize: 11, color: C.text, textAlign: "right", fontFamily: "'DM Mono',monospace" }}>
                    {p.projectSF ? p.projectSF.toLocaleString() : "—"}
                  </div>
                  <div style={{ fontSize: 11, color: C.text, textAlign: "right", fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>
                    {p.totalCost ? fmtCost(p.totalCost) : "—"}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 3,
                      background: p.source === "pdf" ? `${C.purple}20` : `${C.blue}20`,
                      color: p.source === "pdf" ? C.purple : C.blue,
                    }}>
                      {p.source === "pdf" ? "PDF" : "Manual"}
                    </span>
                    {hasLearning && (
                      <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 4px", borderRadius: 3, background: `${C.green}20`, color: C.green, marginLeft: 4 }}>
                        Cal
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button onClick={e => { e.stopPropagation(); handleDelete(p.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, opacity: 0.5 }}
                      title="Delete">
                      <Ic d={I.trash} size={12} color={C.red} />
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "10px 14px", margin: "2px 0 4px", background: C.bg1, borderRadius: "0 0 6px 6px", border: `1px solid ${C.accent}20`, borderTop: "none" }}>
                    <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: C.textDim }}>
                        Date: <strong style={{ color: C.text }}>{p.date || "—"}</strong>
                      </div>
                      <div style={{ fontSize: 10, color: C.textDim }}>
                        $/SF: <strong style={{ color: C.text }}>{p.projectSF && p.totalCost ? fmtCost(p.totalCost / p.projectSF) : "—"}</strong>
                      </div>
                      <div style={{ fontSize: 10, color: C.textDim }}>
                        Divisions: <strong style={{ color: C.text }}>{divCount}</strong>
                      </div>
                      {p.sourceFileName && (
                        <div style={{ fontSize: 10, color: C.textDim }}>
                          File: <strong style={{ color: C.text }}>{p.sourceFileName}</strong>
                        </div>
                      )}
                    </div>

                    {/* Division breakdown */}
                    {divCount > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 3, marginBottom: 10 }}>
                        {Object.entries(p.divisions).sort(([a], [b]) => a.localeCompare(b)).map(([div, cost]) => {
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

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8 }}>
                      {divCount > 0 && (
                        <button onClick={() => handleRecalibrate(p)}
                          style={bt(C, { background: `${C.accent}12`, border: `1px solid ${C.accent}30`, color: C.accent, padding: "5px 10px", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 })}>
                          <Ic d={I.ai} size={11} color={C.accent} />
                          {hasLearning ? "Recalibrate" : "Generate Calibration"}
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
          <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>No historical proposals yet</div>
          <div style={{ fontSize: 10, color: C.textMuted }}>
            Add past project data manually or import proposal PDFs to start calibrating ROM estimates.
          </div>
        </div>
      )}

      {!apiKey && (
        <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: `${C.orange}10`, border: `1px solid ${C.orange}30`, fontSize: 10, color: C.orange }}>
          Set your Anthropic API key above to enable PDF import with AI extraction.
        </div>
      )}
    </Sec>
  );
}
