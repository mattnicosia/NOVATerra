// CostHistoryEntryForm — Modal for manual entry, PDF review/edit, and editing existing entries
// Shared across: Manual Add, PDF Extract Review, Edit Existing

import { useState, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useUiStore } from '@/stores/uiStore';
import { BUILDING_TYPES, WORK_TYPES, OUTCOME_STATUSES, LOST_REASONS,
  STRUCTURAL_SYSTEMS, DELIVERY_METHODS } from '@/constants/constructionTypes';
import { DEFAULT_LABOR_TYPES } from '@/utils/laborTypes';
import { resolveLocationFactors } from '@/constants/locationFactors';
import Modal from '@/components/shared/Modal';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';

const fmtCost = (n) => {
  if (!n && n !== 0) return "—";
  return "$" + Math.round(n).toLocaleString();
};

// CSI divisions for cost grid
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

/**
 * CostHistoryEntryForm — modal form for cost history entries.
 *
 * Props:
 *  - onClose: () => void
 *  - onSave: (formData) => void
 *  - initial: optional pre-filled data (from PDF extraction or editing existing)
 *  - mode: "manual" | "pdf-review" | "edit"
 */
export default function CostHistoryEntryForm({ onClose, onSave, initial, mode = "manual" }) {
  const C = useTheme();
  const masterData = useMasterDataStore(s => s.masterData);
  const addMasterItem = useMasterDataStore(s => s.addMasterItem);
  const showToast = useUiStore(s => s.showToast);

  const appSettings = useUiStore(s => s.appSettings);
  const laborTypes = appSettings.laborTypes || DEFAULT_LABOR_TYPES;

  const [showDetails, setShowDetails] = useState(false);

  const [form, setForm] = useState({
    name: "",
    client: "",
    architect: "",
    date: new Date().toISOString().split("T")[0],
    projectSF: "",
    buildingType: "",
    workType: "",
    totalCost: "",
    laborType: "",
    zipCode: "",
    stories: "",
    structuralSystem: "",
    deliveryMethod: "",
    outcome: "pending",
    outcomeMetadata: {},
    divisions: {},
    notes: "",
    ...initial,
  });

  // Resolve zip code to metro area for display
  const zipResolved = form.zipCode?.length >= 3 ? resolveLocationFactors(form.zipCode) : null;
  const showZipBadge = zipResolved && zipResolved.source !== "none";

  // Update form when initial changes (e.g., PDF extraction completes)
  useEffect(() => {
    if (initial) setForm(prev => ({ ...prev, ...initial }));
  }, [initial]);

  const up = (field, val) => setForm(prev => ({ ...prev, [field]: val }));
  const upDiv = (div, val) => setForm(prev => ({
    ...prev,
    divisions: { ...prev.divisions, [div]: val },
  }));
  const upOutcome = (field, val) => setForm(prev => ({
    ...prev,
    outcomeMetadata: { ...prev.outcomeMetadata, [field]: val },
  }));

  // CRM auto-suggest
  const clients = masterData.clients || [];
  const architects = masterData.architects || [];
  const clientMatch = form.client && clients.some(c => c.company === form.client);
  const architectMatch = form.architect && architects.some(a => a.company === form.architect);
  const projCompany = "";

  const handleSave = () => {
    const nameVal = String(form.name || "").trim();
    const sfVal = parseFloat(form.projectSF);
    if (!nameVal && (!sfVal || isNaN(sfVal))) {
      showToast("Project name and SF are required", "error");
      return;
    }
    if (!nameVal) {
      showToast("Project name is required", "error");
      return;
    }
    if (!sfVal || isNaN(sfVal) || sfVal <= 0) {
      showToast("Project square footage is required", "error");
      return;
    }
    // Clean division data
    const cleanDivisions = Object.fromEntries(
      Object.entries(form.divisions).filter(([, v]) => parseFloat(v) > 0).map(([k, v]) => [k, parseFloat(v)])
    );
    onSave({
      ...form,
      projectSF: parseFloat(form.projectSF) || 0,
      totalCost: parseFloat(form.totalCost) || 0,
      stories: parseInt(form.stories) || 0,
      divisions: cleanDivisions,
    });
  };

  const divSum = Object.values(form.divisions).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const total = parseFloat(form.totalCost) || 0;
  const diff = total > 0 && divSum > 0 ? total - divSum : 0;

  const title = mode === "pdf-review" ? "Review PDF Extraction" : mode === "edit" ? "Edit Entry" : "Add Cost History Entry";

  return (
    <Modal onClose={onClose} width={680}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{title}</div>
      {mode === "pdf-review" && (
        <div style={{ fontSize: 10, color: C.orange, fontWeight: 600, marginBottom: 12 }}>
          NOVA extracted the data below — review and edit before saving
        </div>
      )}

      {/* Essential Info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Project Name *</label>
          <input value={form.name} onChange={e => up("name", e.target.value)}
            placeholder="e.g. ABC Office Renovation"
            style={inp(C, { padding: "6px 10px", fontSize: 12 })} />
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Client</label>
          <div style={{ position: "relative" }}>
            <input value={form.client} onChange={e => up("client", e.target.value)}
              list="ch-client-suggest" placeholder="Type or select..."
              style={inp(C, { padding: "6px 10px", fontSize: 12 })} />
            <datalist id="ch-client-suggest">
              {clients.filter(c => c.company?.toLowerCase().includes((form.client || "").toLowerCase()))
                .map(c => <option key={c.id} value={c.company} />)}
            </datalist>
            {form.client && !clientMatch && (
              <button onClick={() => { addMasterItem("clients", { company: form.client, contact: "", email: "", phone: "", companyProfileId: projCompany }); showToast(`Added "${form.client}" to CRM`); }}
                style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: `${C.green}15`, border: `1px solid ${C.green}40`, color: C.green, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, cursor: "pointer" }}>
                + CRM
              </button>
            )}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Building Type</label>
          <select value={form.buildingType || ""} onChange={e => up("buildingType", e.target.value)}
            style={inp(C, { padding: "6px 10px", fontSize: 11 })}>
            <option value="">— Select —</option>
            {BUILDING_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Date</label>
          <input type="date" value={form.date || ""} onChange={e => up("date", e.target.value)}
            style={inp(C, { padding: "6px 10px", fontSize: 11 })} />
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Project SF *</label>
          <input type="number" value={form.projectSF} onChange={e => up("projectSF", e.target.value)}
            placeholder="25000" style={nInp(C, { padding: "6px 10px", fontSize: 12 })} />
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Total Cost</label>
          <input type="number" value={form.totalCost} onChange={e => up("totalCost", e.target.value)}
            placeholder="850000" style={nInp(C, { padding: "6px 10px", fontSize: 12 })} />
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Labor Type</label>
          <select value={form.laborType || ""} onChange={e => up("laborType", e.target.value)}
            style={inp(C, { padding: "6px 10px", fontSize: 11 })}>
            <option value="">— Select —</option>
            {laborTypes.map(lt => <option key={lt.key} value={lt.key}>{lt.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Zip Code</label>
          <input value={form.zipCode || ""} onChange={e => up("zipCode", e.target.value)}
            placeholder="10001" maxLength={5}
            style={inp(C, { padding: "6px 10px", fontSize: 12 })} />
          {showZipBadge && (
            <div style={{ fontSize: 8, color: C.accent, fontWeight: 600, marginTop: 2 }}>
              → {zipResolved.label} (L:{zipResolved.lab}×)
            </div>
          )}
        </div>
      </div>

      {/* Details toggle */}
      <button
        onClick={() => setShowDetails(v => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 600, color: C.accent,
          padding: '4px 0', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ transition: 'transform 150ms', transform: showDetails ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▸</span>
        {showDetails ? 'Hide details' : 'More details'}
        {!showDetails && (form.architect || form.workType || form.stories || form.structuralSystem || form.deliveryMethod) && (
          <span style={{ fontSize: 8, color: C.textDim, fontWeight: 400, marginLeft: 4 }}>
            ({[form.architect && 'Architect', form.workType && 'Work Type', form.stories && 'Stories', form.structuralSystem && 'Structure', form.deliveryMethod && 'Delivery'].filter(Boolean).join(', ')})
          </span>
        )}
      </button>

      {/* Detail fields (collapsed by default) */}
      {showDetails && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Architect</label>
            <div style={{ position: "relative" }}>
              <input value={form.architect || ""} onChange={e => up("architect", e.target.value)}
                list="ch-arch-suggest" placeholder="Type or select..."
                style={inp(C, { padding: "6px 10px", fontSize: 12 })} />
              <datalist id="ch-arch-suggest">
                {architects.filter(a => a.company?.toLowerCase().includes((form.architect || "").toLowerCase()))
                  .map(a => <option key={a.id} value={a.company} />)}
              </datalist>
              {form.architect && !architectMatch && (
                <button onClick={() => { addMasterItem("architects", { company: form.architect, contact: "", email: "", phone: "", companyProfileId: projCompany }); showToast(`Added "${form.architect}" to CRM`); }}
                  style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", background: `${C.green}15`, border: `1px solid ${C.green}40`, color: C.green, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, cursor: "pointer" }}>
                  + CRM
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Work Type</label>
            <select value={form.workType || ""} onChange={e => up("workType", e.target.value)}
              style={inp(C, { padding: "6px 10px", fontSize: 11 })}>
              <option value="">— Select —</option>
              {WORK_TYPES.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Delivery Method</label>
            <select value={form.deliveryMethod || ""} onChange={e => up("deliveryMethod", e.target.value)}
              style={inp(C, { padding: "6px 10px", fontSize: 11 })}>
              <option value="">— Select —</option>
              {DELIVERY_METHODS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Stories</label>
            <input type="number" value={form.stories || ""} onChange={e => up("stories", e.target.value)}
              placeholder="3" min="1" style={nInp(C, { padding: "6px 10px", fontSize: 12 })} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Structural System</label>
            <select value={form.structuralSystem || ""} onChange={e => up("structuralSystem", e.target.value)}
              style={inp(C, { padding: "6px 10px", fontSize: 11 })}>
              <option value="">— Select —</option>
              {STRUCTURAL_SYSTEMS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Outcome */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Outcome</label>
          <select value={form.outcome || "pending"} onChange={e => up("outcome", e.target.value)}
            style={inp(C, { padding: "6px 10px", fontSize: 11 })}>
            {OUTCOME_STATUSES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        {form.outcome === "lost" && (
          <>
            <div>
              <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Lost Reason</label>
              <select value={form.outcomeMetadata?.lostReason || ""} onChange={e => upOutcome("lostReason", e.target.value)}
                style={inp(C, { padding: "6px 10px", fontSize: 11 })}>
                <option value="">— Select —</option>
                {LOST_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Competitor</label>
              <input value={form.outcomeMetadata?.competitor || ""} onChange={e => upOutcome("competitor", e.target.value)}
                placeholder="Who won?" style={inp(C, { padding: "6px 10px", fontSize: 12 })} />
            </div>
          </>
        )}
        {form.outcome === "won" && (
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Contract Amount</label>
            <input type="number" value={form.outcomeMetadata?.contractAmount || ""} onChange={e => upOutcome("contractAmount", e.target.value ? Number(e.target.value) : "")}
              placeholder="Final contract" style={nInp(C, { padding: "6px 10px", fontSize: 12 })} />
          </div>
        )}
      </div>

      {/* Division Costs */}
      <div style={{ fontSize: 9, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
        Division Costs (for calibration)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 10, maxHeight: 220, overflowY: "auto" }}>
        {ROM_DIVISIONS.map(d => (
          <div key={d.code} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 6px", borderRadius: 4, background: form.divisions[d.code] ? `${C.accent}08` : "transparent" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: C.textDim, fontFamily: "'DM Mono',monospace", width: 18 }}>{d.code}</span>
            <span style={{ fontSize: 9, color: C.textDim, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</span>
            <input type="number" value={form.divisions[d.code] || ""}
              onChange={e => upDiv(d.code, e.target.value)}
              placeholder="$"
              style={nInp(C, { width: 80, padding: "3px 6px", fontSize: 11, textAlign: "right" })} />
          </div>
        ))}
      </div>

      {/* Running total */}
      {divSum > 0 && (
        <div style={{ padding: "6px 10px", borderRadius: 4, background: C.bg2, marginBottom: 10, fontSize: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: C.textDim }}>Division subtotal: <strong style={{ color: C.text }}>{fmtCost(divSum)}</strong></span>
            {total > 0 && Math.abs(diff) > 0 && (
              <span style={{ color: diff > 0 ? C.orange : C.green }}>
                {diff > 0 ? `${fmtCost(diff)} unallocated` : `${fmtCost(Math.abs(diff))} over total`}
              </span>
            )}
          </div>
          {/* Quick allocation buttons when money is unallocated */}
          {total > 0 && diff > 1 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <button
                onClick={() => upDiv("01", String(Math.round((parseFloat(form.divisions["01"] || 0) + diff))))}
                style={{ background: `${C.orange}15`, border: `1px solid ${C.orange}35`, color: C.orange, fontSize: 9, fontWeight: 600, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}>
                + Add {fmtCost(diff)} to Div 01 (GR)
              </button>
              <button
                onClick={() => {
                  // Distribute proportionally across existing divisions
                  const filledDivs = Object.entries(form.divisions).filter(([, v]) => parseFloat(v) > 0);
                  if (filledDivs.length === 0) return;
                  const newDivs = { ...form.divisions };
                  filledDivs.forEach(([code, val]) => {
                    const pct = parseFloat(val) / divSum;
                    newDivs[code] = String(Math.round(parseFloat(val) + diff * pct));
                  });
                  setForm(prev => ({ ...prev, divisions: newDivs }));
                }}
                style={{ background: `${C.accent}12`, border: `1px solid ${C.accent}30`, color: C.accent, fontSize: 9, fontWeight: 600, padding: "3px 8px", borderRadius: 4, cursor: "pointer" }}>
                Distribute proportionally
              </button>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Notes</label>
        <input value={form.notes || ""} onChange={e => up("notes", e.target.value)}
          placeholder="Lessons learned, special conditions..."
          style={inp(C, { padding: "6px 10px", fontSize: 11 })} />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose}
          style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "7px 16px", fontSize: 11 })}>
          Cancel
        </button>
        <button onClick={handleSave}
          style={bt(C, { background: C.accent, color: "#fff", padding: "7px 16px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 })}>
          <Ic d={I.save} size={13} color="#fff" sw={2} />
          {mode === "pdf-review" ? "Save Extraction" : mode === "edit" ? "Update" : "Save Entry"}
        </button>
      </div>
    </Modal>
  );
}
