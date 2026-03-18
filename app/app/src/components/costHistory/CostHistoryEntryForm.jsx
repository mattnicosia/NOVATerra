// CostHistoryEntryForm — Modal for manual entry, PDF review/edit, and editing existing entries
// Shared across: Manual Add, PDF Extract Review, Edit Existing

import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useUiStore } from "@/stores/uiStore";
import {
  BUILDING_TYPES,
  WORK_TYPES,
  OUTCOME_STATUSES,
  LOST_REASONS,
  STRUCTURAL_SYSTEMS,
  DELIVERY_METHODS,
} from "@/constants/constructionTypes";
import { DEFAULT_LABOR_TYPES } from "@/utils/laborTypes";
import { resolveLocationFactors } from "@/constants/locationFactors";
import { uid } from "@/utils/format";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, nInp, bt } from "@/utils/styles";
import PdfPreviewPanel from "@/components/costHistory/PdfPreviewPanel";
import { MARKUP_TAXONOMY, MARKUP_CATEGORIES, classifyMarkup, getMarkupCategory } from "@/constants/markupTaxonomy";

// Re-export for backward compat
export { MARKUP_PRESETS } from "@/constants/markupTaxonomy";

const fmtCost = n => {
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
export default function CostHistoryEntryForm({ onClose, onSave, initial, mode = "manual", pdfBase64 }) {
  const C = useTheme();
  const T = C.T;
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
    proposalType: "gc",
    outcome: "pending",
    outcomeMetadata: {},
    divisions: {},
    markups: [],
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
  const upDiv = (div, val) =>
    setForm(prev => ({
      ...prev,
      divisions: { ...prev.divisions, [div]: val },
    }));
  const upOutcome = (field, val) =>
    setForm(prev => ({
      ...prev,
      outcomeMetadata: { ...prev.outcomeMetadata, [field]: val },
    }));

  // ── Markup helpers ──
  const addMarkup = key => {
    const tax = classifyMarkup(key);
    setForm(prev => ({
      ...prev,
      markups: [
        ...(prev.markups || []),
        {
          id: uid(),
          key,
          label: tax.label || "",
          category: tax.category,
          type: "dollar",
          inputValue: "",
          calculatedAmount: 0,
        },
      ],
    }));
  };

  const updateMarkup = (id, field, value) => {
    setForm(prev => ({
      ...prev,
      markups: (prev.markups || []).map(m => {
        if (m.id !== id) return m;
        const updated = { ...m, [field]: value };
        // Recompute calculatedAmount when inputValue or type changes
        if (field === "inputValue" || field === "type") {
          const iv = parseFloat(field === "inputValue" ? value : updated.inputValue) || 0;
          if (updated.type === "percent") {
            updated.calculatedAmount = Math.round((divSum * iv) / 100);
          } else {
            updated.calculatedAmount = iv;
          }
        }
        return updated;
      }),
    }));
  };

  const removeMarkup = id => {
    setForm(prev => ({
      ...prev,
      markups: (prev.markups || []).filter(m => m.id !== id),
    }));
  };

  // CRM auto-suggest
  const clients = masterData.clients || [];
  const architects = masterData.architects || [];
  const clientMatch = form.client && clients.some(c => c.company === form.client);
  const architectMatch = form.architect && architects.some(a => a.company === form.architect);
  const projCompany = "";

  // ── Computed totals ──
  const divSum = Object.values(form.divisions).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const markups = form.markups || [];
  const markupSum = markups.reduce((s, m) => {
    if (m.type === "percent") return s + Math.round((divSum * (parseFloat(m.inputValue) || 0)) / 100);
    return s + (parseFloat(m.inputValue) || 0);
  }, 0);
  const computedTotal = divSum + markupSum;
  const total = parseFloat(form.totalCost) || 0;
  const remaining =
    total > 0 && computedTotal > 0 ? total - computedTotal : total > 0 && divSum > 0 ? total - divSum : 0;

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
      Object.entries(form.divisions)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([k, v]) => [k, parseFloat(v)]),
    );
    // Clean markups — filter empties, compute final calculatedAmount
    const cleanDivSum = Object.values(cleanDivisions).reduce((s, v) => s + v, 0);
    const cleanMarkups = (form.markups || [])
      .filter(m => parseFloat(m.inputValue) > 0)
      .map(m => ({
        ...m,
        inputValue: parseFloat(m.inputValue) || 0,
        calculatedAmount:
          m.type === "percent"
            ? Math.round((cleanDivSum * (parseFloat(m.inputValue) || 0)) / 100)
            : parseFloat(m.inputValue) || 0,
      }));
    onSave({
      ...form,
      projectSF: parseFloat(form.projectSF) || 0,
      totalCost: parseFloat(form.totalCost) || 0,
      stories: parseInt(form.stories) || 0,
      divisions: cleanDivisions,
      markups: cleanMarkups,
    });
  };

  const title =
    mode === "pdf-review" ? "Review PDF Extraction" : mode === "edit" ? "Edit Entry" : "Add Cost History Entry";

  // Which preset keys are already added
  const usedKeys = new Set((form.markups || []).filter(m => m.key !== "custom").map(m => m.key));

  const formBody = (
    <>
      {/* Essential Info */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Project Name *</label>
          <input
            value={form.name}
            onChange={e => up("name", e.target.value)}
            placeholder="e.g. ABC Office Renovation"
            style={inp(C, { padding: "6px 10px", fontSize: 12 })}
          />
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Client</label>
          <div style={{ position: "relative" }}>
            <input
              value={form.client}
              onChange={e => up("client", e.target.value)}
              list="ch-client-suggest"
              placeholder="Type or select..."
              style={inp(C, { padding: "6px 10px", fontSize: 12 })}
            />
            <datalist id="ch-client-suggest">
              {clients
                .filter(c => c.company?.toLowerCase().includes((form.client || "").toLowerCase()))
                .map(c => (
                  <option key={c.id} value={c.company} />
                ))}
            </datalist>
            {form.client && !clientMatch && (
              <button
                onClick={() => {
                  addMasterItem("clients", {
                    company: form.client,
                    contact: "",
                    email: "",
                    phone: "",
                    companyProfileId: projCompany,
                  });
                  showToast(`Added "${form.client}" to CRM`);
                }}
                style={{
                  position: "absolute",
                  right: 4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: `${C.green}15`,
                  border: `1px solid ${C.green}40`,
                  color: C.green,
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                + CRM
              </button>
            )}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Building Type</label>
          <select
            value={form.buildingType || ""}
            onChange={e => up("buildingType", e.target.value)}
            style={inp(C, { padding: "6px 10px", fontSize: 11 })}
          >
            <option value="">— Select —</option>
            {BUILDING_TYPES.map(b => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Proposal Type</label>
          <select
            value={form.proposalType || "gc"}
            onChange={e => up("proposalType", e.target.value)}
            style={inp(C, { padding: "6px 10px", fontSize: 11 })}
          >
            <option value="gc">GC Proposal</option>
            <option value="sub">Sub Proposal</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Date</label>
          <input
            type="date"
            value={form.date || ""}
            onChange={e => up("date", e.target.value)}
            style={inp(C, { padding: "6px 10px", fontSize: 11 })}
          />
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Project SF *</label>
          <input
            type="number"
            value={form.projectSF}
            onChange={e => up("projectSF", e.target.value)}
            placeholder="25000"
            style={nInp(C, { padding: "6px 10px", fontSize: 12 })}
          />
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Total Cost</label>
          <input
            type="number"
            value={form.totalCost}
            onChange={e => up("totalCost", e.target.value)}
            placeholder="850000"
            style={nInp(C, { padding: "6px 10px", fontSize: 12 })}
          />
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Labor Type</label>
          <select
            value={form.laborType || ""}
            onChange={e => up("laborType", e.target.value)}
            style={inp(C, { padding: "6px 10px", fontSize: 11 })}
          >
            <option value="">— Select —</option>
            {laborTypes.map(lt => (
              <option key={lt.key} value={lt.key}>
                {lt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Zip Code</label>
          <input
            value={form.zipCode || ""}
            onChange={e => up("zipCode", e.target.value)}
            placeholder="10001"
            maxLength={5}
            style={inp(C, { padding: "6px 10px", fontSize: 12 })}
          />
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
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 10,
          fontWeight: 600,
          color: C.accent,
          padding: "4px 0",
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            transition: "transform 150ms",
            transform: showDetails ? "rotate(90deg)" : "rotate(0deg)",
            display: "inline-block",
          }}
        >
          ▸
        </span>
        {showDetails ? "Hide details" : "More details"}
        {!showDetails &&
          (form.architect || form.workType || form.stories || form.structuralSystem || form.deliveryMethod) && (
            <span style={{ fontSize: 8, color: C.textDim, fontWeight: 400, marginLeft: 4 }}>
              (
              {[
                form.architect && "Architect",
                form.workType && "Work Type",
                form.stories && "Stories",
                form.structuralSystem && "Structure",
                form.deliveryMethod && "Delivery",
              ]
                .filter(Boolean)
                .join(", ")}
              )
            </span>
          )}
      </button>

      {/* Detail fields (collapsed by default) */}
      {showDetails && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Architect</label>
            <div style={{ position: "relative" }}>
              <input
                value={form.architect || ""}
                onChange={e => up("architect", e.target.value)}
                list="ch-arch-suggest"
                placeholder="Type or select..."
                style={inp(C, { padding: "6px 10px", fontSize: 12 })}
              />
              <datalist id="ch-arch-suggest">
                {architects
                  .filter(a => a.company?.toLowerCase().includes((form.architect || "").toLowerCase()))
                  .map(a => (
                    <option key={a.id} value={a.company} />
                  ))}
              </datalist>
              {form.architect && !architectMatch && (
                <button
                  onClick={() => {
                    addMasterItem("architects", {
                      company: form.architect,
                      contact: "",
                      email: "",
                      phone: "",
                      companyProfileId: projCompany,
                    });
                    showToast(`Added "${form.architect}" to CRM`);
                  }}
                  style={{
                    position: "absolute",
                    right: 4,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: `${C.green}15`,
                    border: `1px solid ${C.green}40`,
                    color: C.green,
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  + CRM
                </button>
              )}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Work Type</label>
            <select
              value={form.workType || ""}
              onChange={e => up("workType", e.target.value)}
              style={inp(C, { padding: "6px 10px", fontSize: 11 })}
            >
              <option value="">— Select —</option>
              {WORK_TYPES.map(w => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Delivery Method</label>
            <select
              value={form.deliveryMethod || ""}
              onChange={e => up("deliveryMethod", e.target.value)}
              style={inp(C, { padding: "6px 10px", fontSize: 11 })}
            >
              <option value="">— Select —</option>
              {DELIVERY_METHODS.map(d => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Stories</label>
            <input
              type="number"
              value={form.stories || ""}
              onChange={e => up("stories", e.target.value)}
              placeholder="3"
              min="1"
              style={nInp(C, { padding: "6px 10px", fontSize: 12 })}
            />
          </div>
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Structural System</label>
            <select
              value={form.structuralSystem || ""}
              onChange={e => up("structuralSystem", e.target.value)}
              style={inp(C, { padding: "6px 10px", fontSize: 11 })}
            >
              <option value="">— Select —</option>
              {STRUCTURAL_SYSTEMS.map(s => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Outcome */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Outcome</label>
          <select
            value={form.outcome || "pending"}
            onChange={e => up("outcome", e.target.value)}
            style={inp(C, { padding: "6px 10px", fontSize: 11 })}
          >
            {OUTCOME_STATUSES.map(o => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {form.outcome === "lost" && (
          <>
            <div>
              <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Lost Reason</label>
              <select
                value={form.outcomeMetadata?.lostReason || ""}
                onChange={e => upOutcome("lostReason", e.target.value)}
                style={inp(C, { padding: "6px 10px", fontSize: 11 })}
              >
                <option value="">— Select —</option>
                {LOST_REASONS.map(r => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Competitor</label>
              <input
                value={form.outcomeMetadata?.competitor || ""}
                onChange={e => upOutcome("competitor", e.target.value)}
                placeholder="Who won?"
                style={inp(C, { padding: "6px 10px", fontSize: 12 })}
              />
            </div>
          </>
        )}
        {form.outcome === "won" && (
          <div>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Contract Amount</label>
            <input
              type="number"
              value={form.outcomeMetadata?.contractAmount || ""}
              onChange={e => upOutcome("contractAmount", e.target.value ? Number(e.target.value) : "")}
              placeholder="Final contract"
              style={nInp(C, { padding: "6px 10px", fontSize: 12 })}
            />
          </div>
        )}
      </div>

      {/* Division Costs */}
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        Division Costs (direct costs)
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 4,
          marginBottom: 10,
          maxHeight: 220,
          overflowY: "auto",
        }}
      >
        {ROM_DIVISIONS.map(d => (
          <div
            key={d.code}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 6px",
              borderRadius: 4,
              background: form.divisions[d.code] ? `${C.accent}08` : "transparent",
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, color: C.textDim, fontFamily: T.font.sans, width: 18 }}>
              {d.code}
            </span>
            <span
              style={{
                fontSize: 9,
                color: C.textDim,
                flex: 1,
                minWidth: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {d.label}
            </span>
            <input
              type="number"
              value={form.divisions[d.code] || ""}
              onChange={e => upDiv(d.code, e.target.value)}
              placeholder="$"
              style={nInp(C, { width: 80, padding: "3px 6px", fontSize: 11, textAlign: "right" })}
            />
          </div>
        ))}
      </div>

      {/* ── GC Markups / Below-the-Line ── */}
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        GC Markups (below the line)
      </div>

      {/* Preset add buttons — grouped by category */}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 8 }}>
        {MARKUP_CATEGORIES.filter(cat => cat.key !== "custom").map(cat => {
          const catItems = MARKUP_TAXONOMY.filter(t => t.category === cat.key);
          if (catItems.length === 0) return null;
          const catColor = C[cat.color] || C.accent;
          return (
            <div key={cat.key} style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 8,
                  color: catColor,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  minWidth: 60,
                  opacity: 0.7,
                }}
              >
                {cat.label}
              </span>
              {catItems.map(p => (
                <button
                  key={p.key}
                  onClick={() => addMarkup(p.key)}
                  disabled={usedKeys.has(p.key)}
                  style={{
                    background: usedKeys.has(p.key) ? C.bg2 : `${catColor}10`,
                    border: `1px solid ${usedKeys.has(p.key) ? C.border : catColor + "30"}`,
                    color: usedKeys.has(p.key) ? C.textMuted : catColor,
                    fontSize: 9,
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: 4,
                    cursor: usedKeys.has(p.key) ? "default" : "pointer",
                    opacity: usedKeys.has(p.key) ? 0.35 : 1,
                  }}
                >
                  + {p.label}
                </button>
              ))}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span
            style={{
              fontSize: 8,
              color: C.green,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              minWidth: 60,
              opacity: 0.7,
            }}
          >
            Custom
          </span>
          <button
            onClick={() => addMarkup("custom")}
            style={{
              background: `${C.green}10`,
              border: `1px solid ${C.green}30`,
              color: C.green,
              fontSize: 9,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            + Custom
          </button>
        </div>
      </div>

      {/* Markup rows */}
      {markups.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          {markups.map(m => {
            const calcAmt =
              m.type === "percent"
                ? Math.round((divSum * (parseFloat(m.inputValue) || 0)) / 100)
                : parseFloat(m.inputValue) || 0;
            const mCat = getMarkupCategory(m.key);
            const mColor = C[mCat.color] || C.accent;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: `${mColor}06`,
                  border: `1px solid ${mColor}12`,
                }}
              >
                {/* Category color dot */}
                <div style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: mColor }} />
                {/* Label */}
                {m.key === "custom" ? (
                  <input
                    value={m.label}
                    onChange={e => updateMarkup(m.id, "label", e.target.value)}
                    placeholder="Custom item name..."
                    style={inp(C, { flex: 1, padding: "3px 6px", fontSize: 10, minWidth: 120 })}
                  />
                ) : (
                  <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: C.text, minWidth: 120 }}>
                    {m.label}
                  </span>
                )}

                {/* $/% toggle */}
                <div style={{ display: "flex", borderRadius: 3, overflow: "hidden", border: `1px solid ${C.border}` }}>
                  <button
                    onClick={() => updateMarkup(m.id, "type", "dollar")}
                    style={{
                      background: m.type === "dollar" ? C.accent : "transparent",
                      color: m.type === "dollar" ? "#fff" : C.textDim,
                      border: "none",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      cursor: "pointer",
                    }}
                  >
                    $
                  </button>
                  <button
                    onClick={() => updateMarkup(m.id, "type", "percent")}
                    style={{
                      background: m.type === "percent" ? C.accent : "transparent",
                      color: m.type === "percent" ? "#fff" : C.textDim,
                      border: "none",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      cursor: "pointer",
                    }}
                  >
                    %
                  </button>
                </div>

                {/* Input value */}
                <input
                  type="number"
                  value={m.inputValue}
                  onChange={e => updateMarkup(m.id, "inputValue", e.target.value)}
                  placeholder={m.type === "percent" ? "15" : "120000"}
                  style={nInp(C, { width: 90, padding: "3px 6px", fontSize: 11, textAlign: "right" })}
                />

                {/* Computed amount (for % type) */}
                {m.type === "percent" && parseFloat(m.inputValue) > 0 && (
                  <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600, width: 80, textAlign: "right" }}>
                    = {fmtCost(calcAmt)}
                  </span>
                )}

                {/* Remove */}
                <button
                  onClick={() => removeMarkup(m.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, opacity: 0.5 }}
                >
                  <Ic d={I.x || I.close} size={10} color={C.red} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Reconciliation Display ── */}
      {(divSum > 0 || markupSum > 0) && (
        <div style={{ padding: "8px 10px", borderRadius: 6, background: C.bg2, marginBottom: 10, fontSize: 10 }}>
          {/* Division subtotal */}
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: markupSum > 0 ? 4 : 0 }}>
            <span style={{ color: C.textDim }}>Division Subtotal</span>
            <strong style={{ color: C.text, fontFamily: T.font.sans }}>{fmtCost(divSum)}</strong>
          </div>

          {/* Markups total */}
          {markupSum > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: C.textDim }}>
                + Markups ({markups.filter(m => parseFloat(m.inputValue) > 0).length} items)
              </span>
              <strong style={{ color: C.accent, fontFamily: T.font.sans }}>{fmtCost(markupSum)}</strong>
            </div>
          )}

          {/* Separator + computed total */}
          {markupSum > 0 && (
            <>
              <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: total > 0 ? 4 : 0 }}>
                <span style={{ color: C.textDim }}>Computed Total</span>
                <strong style={{ color: C.text, fontFamily: T.font.sans }}>{fmtCost(computedTotal)}</strong>
              </div>
            </>
          )}

          {/* Reconciliation vs entered total */}
          {total > 0 && computedTotal > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.textDim }}>vs. Entered Total</span>
              <span
                style={{
                  fontWeight: 700,
                  fontFamily: T.font.sans,
                  color: Math.abs(total - computedTotal) < 2 ? C.green : total - computedTotal > 0 ? C.orange : C.red,
                }}
              >
                {fmtCost(total)}
                {Math.abs(total - computedTotal) < 2
                  ? " ✓"
                  : ` (${total - computedTotal > 0 ? "+" : ""}${fmtCost(total - computedTotal)} gap)`}
              </span>
            </div>
          )}

          {/* Simple unallocated display (no markups) */}
          {markupSum === 0 && total > 0 && Math.abs(remaining) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.textDim }}>vs. Entered Total</span>
              <span style={{ color: remaining > 0 ? C.orange : C.green, fontWeight: 600 }}>
                {remaining > 0 ? `${fmtCost(remaining)} unallocated` : `${fmtCost(Math.abs(remaining))} over total`}
              </span>
            </div>
          )}

          {/* Quick allocation buttons for remaining gap */}
          {total > 0 && remaining > 1 && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <button
                onClick={() => upDiv("01", String(Math.round(parseFloat(form.divisions["01"] || 0) + remaining)))}
                style={{
                  background: `${C.orange}15`,
                  border: `1px solid ${C.orange}35`,
                  color: C.orange,
                  fontSize: 9,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                + Add {fmtCost(remaining)} to Div 01
              </button>
              <button
                onClick={() => {
                  const filledDivs = Object.entries(form.divisions).filter(([, v]) => parseFloat(v) > 0);
                  if (filledDivs.length === 0) return;
                  const newDivs = { ...form.divisions };
                  filledDivs.forEach(([code, val]) => {
                    const pct = parseFloat(val) / divSum;
                    newDivs[code] = String(Math.round(parseFloat(val) + remaining * pct));
                  });
                  setForm(prev => ({ ...prev, divisions: newDivs }));
                }}
                style={{
                  background: `${C.accent}12`,
                  border: `1px solid ${C.accent}30`,
                  color: C.accent,
                  fontSize: 9,
                  fontWeight: 600,
                  padding: "3px 8px",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Distribute proportionally
              </button>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Notes</label>
        <input
          value={form.notes || ""}
          onChange={e => up("notes", e.target.value)}
          placeholder="Lessons learned, special conditions..."
          style={inp(C, { padding: "6px 10px", fontSize: 11 })}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={bt(C, {
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textDim,
            padding: "7px 16px",
            fontSize: 11,
          })}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          style={bt(C, {
            background: C.accent,
            color: "#fff",
            padding: "7px 16px",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            gap: 6,
          })}
        >
          <Ic d={I.save} size={13} color="#fff" sw={2} />
          {mode === "pdf-review" ? "Save Extraction" : mode === "edit" ? "Update" : "Save Entry"}
        </button>
      </div>
    </>
  );

  const hasPdf = !!pdfBase64;

  return (
    <Modal onClose={onClose} width={hasPdf ? 1340 : 720}>
      {hasPdf ? (
        <div style={{ display: "flex", gap: 20, minHeight: 0 }}>
          {/* Left: PDF viewer */}
          <div
            style={{
              flex: "0 0 540px",
              minHeight: 0,
              maxHeight: "calc(88vh - 80px)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              borderRight: `1px solid ${C.border}`,
              paddingRight: 16,
            }}
          >
            <PdfPreviewPanel base64={pdfBase64} />
          </div>
          {/* Right: Form (scrollable) */}
          <div style={{ flex: 1, minWidth: 0, overflowY: "auto", maxHeight: "calc(88vh - 80px)", paddingRight: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{title}</div>
            {mode === "pdf-review" && (
              <div style={{ fontSize: 10, color: C.orange, fontWeight: 600, marginBottom: 12 }}>
                NOVA extracted the data below — review and edit before saving
              </div>
            )}
            {formBody}
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{title}</div>
          {mode === "pdf-review" && (
            <div style={{ fontSize: 10, color: C.orange, fontWeight: 600, marginBottom: 12 }}>
              NOVA extracted the data below — review and edit before saving
            </div>
          )}
          {formBody}
        </>
      )}
    </Modal>
  );
}
