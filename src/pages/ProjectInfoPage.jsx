import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useProjectStore } from '@/stores/projectStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useUiStore } from '@/stores/uiStore';
import { CODE_SYSTEMS } from '@/constants/codeSystems';
import Sec from '@/components/shared/Sec';
import Fld from '@/components/shared/Fld';
import Ic from '@/components/shared/Ic';
import Modal from '@/components/shared/Modal';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';
import { uid } from '@/utils/format';
import { resolveLocationFactors, getAllLocations } from '@/constants/locationFactors';

export default function ProjectInfoPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const project = useProjectStore(s => s.project);
  const setProject = useProjectStore(s => s.setProject);
  const codeSystem = useProjectStore(s => s.codeSystem);
  const setCodeSystem = useProjectStore(s => s.setCodeSystem);
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const updateIndexEntry = useEstimatesStore(s => s.updateIndexEntry);
  const masterData = useMasterDataStore(s => s.masterData);
  const addMasterItem = useMasterDataStore(s => s.addMasterItem);
  const addJobType = useMasterDataStore(s => s.addJobType);
  const getContactsForCompany = useMasterDataStore(s => s.getContactsForCompany);
  const showToast = useUiStore(s => s.showToast);
  const appSettings = useUiStore(s => s.appSettings);

  // Filter contacts by the project's company profile
  const projCompany = project.companyProfileId || "";
  const projectClients = getContactsForCompany("clients", projCompany);
  const projectArchitects = getContactsForCompany("architects", projCompany);
  const projectEngineers = getContactsForCompany("engineers", projCompany);

  const [quickAddModal, setQuickAddModal] = useState(null);
  const [quickAddValue, setQuickAddValue] = useState("");

  const handleSave = () => {
    if (activeEstimateId) {
      updateIndexEntry(activeEstimateId, {
        name: project.name || "Untitled",
        client: project.client || "",
        status: project.status || "Bidding",
        bidDue: project.bidDue || "",
        estimator: project.estimator || "",
        jobType: project.jobType || "",
      });
      showToast("Project info saved!");
      navigate(`/estimate/${activeEstimateId}/plans`);
    }
  };

  const up = (field, value) => setProject({ ...project, [field]: value });

  const handleQuickAdd = () => {
    if (!quickAddValue.trim()) return;
    const m = quickAddModal;
    if (m.category === "jobType") {
      addJobType(quickAddValue.trim());
      up("jobType", quickAddValue.trim());
    } else if (m.category === "bidType") {
      useMasterDataStore.getState().setMasterData({
        ...useMasterDataStore.getState().masterData,
        bidTypes: [...(useMasterDataStore.getState().masterData.bidTypes || []), quickAddValue.trim()],
      });
      up("bidType", quickAddValue.trim());
    } else if (m.category === "deliveryType") {
      // Add to bidDeliveryTypes in masterData
      useMasterDataStore.getState().setMasterData({
        ...useMasterDataStore.getState().masterData,
        bidDeliveryTypes: [...(useMasterDataStore.getState().masterData.bidDeliveryTypes || []), quickAddValue.trim()],
      });
      up("bidDelivery", quickAddValue.trim().toLowerCase());
    } else {
      const newItem = m.category === "estimators"
        ? { name: quickAddValue.trim(), initials: "", email: "" }
        : { company: quickAddValue.trim(), contact: "", email: "", phone: "", companyProfileId: projCompany };
      addMasterItem(m.category, newItem);
      up(m.field, quickAddValue.trim());
    }
    showToast(`Added "${quickAddValue.trim()}" to ${m.label}s`);
    setQuickAddModal(null);
    setQuickAddValue("");
  };

  return (
    <div style={{ padding: T.space[7], minHeight: "100%", animation: "fadeIn 0.15s ease-out" }}>
      <div style={{ maxWidth: 1200 }}>
        {/* Project Details */}
        <Sec title="Project Details">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <Fld label="Project Name">
              <input value={project.name} onChange={e => up("name", e.target.value)} placeholder="e.g. Smith Residence" style={inp(C)} />
            </Fld>
            <Fld label="Client">
              <select value={project.client} onChange={e => {
                if (e.target.value === "__new__") { setQuickAddModal({ category: "clients", field: "client", label: "Client" }); setQuickAddValue(""); }
                else up("client", e.target.value);
              }} style={inp(C)}>
                <option value="">— Select Client —</option>
                {projectClients.map(c => <option key={c.id} value={c.company}>{c.company}</option>)}
                <option value="__new__">＋ Create New Client...</option>
              </select>
            </Fld>
            <Fld label="Architect">
              <select value={project.architect || ""} onChange={e => {
                if (e.target.value === "__new__") { setQuickAddModal({ category: "architects", field: "architect", label: "Architect" }); setQuickAddValue(""); }
                else up("architect", e.target.value);
              }} style={inp(C)}>
                <option value="">— Select Architect —</option>
                {projectArchitects.map(a => <option key={a.id} value={a.company}>{a.company}</option>)}
                <option value="__new__">＋ Create New Architect...</option>
              </select>
            </Fld>
            <Fld label="Engineer">
              <select value={project.engineer || ""} onChange={e => {
                if (e.target.value === "__new__") { setQuickAddModal({ category: "engineers", field: "engineer", label: "Engineer" }); setQuickAddValue(""); }
                else up("engineer", e.target.value);
              }} style={inp(C)}>
                <option value="">— Select Engineer —</option>
                {projectEngineers.map(eng => <option key={eng.id} value={eng.company}>{eng.company}</option>)}
                <option value="__new__">＋ Create New Engineer...</option>
              </select>
            </Fld>
            <Fld label="Estimator">
              <select value={project.estimator} onChange={e => {
                if (e.target.value === "__new__") { setQuickAddModal({ category: "estimators", field: "estimator", label: "Estimator" }); setQuickAddValue(""); }
                else up("estimator", e.target.value);
              }} style={inp(C)}>
                <option value="">— Select Estimator —</option>
                {masterData.estimators.map(est => <option key={est.id} value={est.name}>{est.name}</option>)}
                <option value="__new__">＋ Create New Estimator...</option>
              </select>
            </Fld>
            <Fld label="Company Profile">
              <select value={project.companyProfileId || ""} onChange={e => up("companyProfileId", e.target.value)} style={inp(C)}>
                <option value="">{masterData.companyInfo?.name || "Primary Profile"} (Default)</option>
                {(masterData.companyProfiles || []).map(p => (
                  <option key={p.id} value={p.id}>{p.name || "Unnamed Profile"}</option>
                ))}
              </select>
              <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>Branding for proposals, bid forms, and reports</div>
            </Fld>
            <Fld label="Address">
              <input value={project.address} onChange={e => up("address", e.target.value)} style={inp(C)} />
            </Fld>
            <Fld label="Job Type">
              <div style={{ display: "flex", gap: 4 }}>
                <select value={project.jobType || ""} onChange={e => up("jobType", e.target.value)} style={inp(C, { flex: 1 })}>
                  <option value="">— Select Type —</option>
                  {(Array.isArray(masterData.jobTypes) ? masterData.jobTypes : []).map(j => {
                    const name = typeof j === "string" ? j : j.name;
                    const key = typeof j === "string" ? j : j.id;
                    return <option key={key} value={name}>{name}</option>;
                  })}
                </select>
                <button className="ghost-btn" title="Add new job type" onClick={() => { setQuickAddModal({ category: "jobType", field: "jobType", label: "Job Type" }); setQuickAddValue(""); }}
                  style={bt(C, { background: C.bg2, border: `1px solid ${C.border}`, color: C.accent, padding: "4px 8px", flexShrink: 0 })}>
                  <Ic d={I.plus} size={12} color={C.accent} />
                </button>
              </div>
            </Fld>
            <Fld label="Labor Type">
              <select value={project.laborType || "open_shop"} onChange={e => up("laborType", e.target.value)} style={inp(C)}>
                {(appSettings.laborTypes || []).map(lt => (
                  <option key={lt.key} value={lt.key}>{lt.label} ({lt.multiplier}x)</option>
                ))}
              </select>
            </Fld>
            <Fld label="Project Zip Code">
              <input value={project.zipCode || ""} onChange={e => up("zipCode", e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="5-digit zip" maxLength={5} style={inp(C)} />
              {project.zipCode && project.zipCode.length >= 3 && (() => {
                const loc = resolveLocationFactors(project.zipCode);
                return loc.source !== "none" ? (
                  <div style={{ fontSize: 10, color: C.accent, marginTop: 3, fontWeight: 600 }}>
                    {loc.label} &mdash; Mat: {loc.mat}x &middot; Lab: {loc.lab}x &middot; Equip: {loc.equip}x
                  </div>
                ) : null;
              })()}
            </Fld>
            <Fld label="Location Override">
              <select value={project.locationMetroId || ""} onChange={e => up("locationMetroId", e.target.value)} style={inp(C)}>
                <option value="">Auto-detect from zip</option>
                {getAllLocations().filter(m => m.id).map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </Fld>
            <Fld label="Cost Code System">
              <select value={codeSystem} onChange={e => setCodeSystem(e.target.value)} style={inp(C)}>
                {Object.values(CODE_SYSTEMS).map(sys => (
                  <option key={sys.id} value={sys.id}>{sys.icon} {sys.name}</option>
                ))}
              </select>
              <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{(CODE_SYSTEMS[codeSystem] || {}).desc}</div>
            </Fld>
            <Fld label="Project SF">
              <input type="number" value={project.projectSF} onChange={e => up("projectSF", e.target.value)} style={nInp(C, { fontSize: 13 })} />
            </Fld>
            <Fld label="Status">
              <select value={project.status || "Active"} onChange={e => up("status", e.target.value)} style={inp(C)}>
                <option>Active</option><option>Bidding</option><option>Submitted</option><option>Won</option><option>Lost</option><option>On Hold</option><option>Cancelled</option>
              </select>
            </Fld>
          </div>
        </Sec>

        {/* Referred By */}
        <Sec title="Referred By">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <Fld label="Referral Source">
              <select value={project.referredByType || ""} onChange={e => up("referredByType", e.target.value)} style={inp(C)}>
                <option value="">— Select Source —</option>
                <option value="client">Existing Client</option>
                <option value="architect">Architect</option>
                <option value="engineer">Engineer</option>
                <option value="realtor">Realtor</option>
                <option value="website">Website / Online</option>
                <option value="social">Social Media</option>
                <option value="repeat">Repeat Client</option>
                <option value="planroom">Plan Room / Bid Board</option>
                <option value="word">Word of Mouth</option>
                <option value="other">Other</option>
              </select>
            </Fld>
            <Fld label="Referred By (Name)">
              <input value={project.referredByName || ""} onChange={e => up("referredByName", e.target.value)} placeholder="Person or company name" style={inp(C)} />
            </Fld>
            <Fld label="Referral Notes">
              <input value={project.referredByNotes || ""} onChange={e => up("referredByNotes", e.target.value)} placeholder="How did they find us, context..." style={inp(C)} />
            </Fld>
          </div>
        </Sec>

        {/* Bid Schedule */}
        <Sec title="Bid Schedule">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <Fld label="Estimate Date">
              <input type="date" value={project.date} onChange={e => up("date", e.target.value)} style={inp(C)} />
            </Fld>
            <Fld label="Bid Due Date">
              <input type="date" value={project.bidDue} onChange={e => up("bidDue", e.target.value)}
                style={inp(C, { color: project.bidDue ? C.red : C.text, fontWeight: project.bidDue ? 600 : 400 })} />
            </Fld>
            <Fld label="Bid Due Time">
              <input type="time" value={project.bidDueTime || "14:00"} onChange={e => up("bidDueTime", e.target.value)} style={inp(C)} />
            </Fld>
            <Fld label="Walkthrough Date">
              <input type="date" value={project.walkthroughDate || ""} onChange={e => up("walkthroughDate", e.target.value)} style={inp(C)} />
            </Fld>
            <Fld label="RFI Due Date">
              <input type="date" value={project.rfiDueDate || ""} onChange={e => up("rfiDueDate", e.target.value)} style={inp(C)} />
            </Fld>
            <Fld label={project.otherDueLabel || "Other Due Date"}>
              <input type="date" value={project.otherDueDate || ""} onChange={e => up("otherDueDate", e.target.value)} style={inp(C)} />
              <input value={project.otherDueLabel || ""} onChange={e => up("otherDueLabel", e.target.value)} placeholder="Label this date..."
                style={inp(C, { marginTop: 4, fontSize: 10, padding: "4px 8px" })} />
            </Fld>
          </div>
        </Sec>

        {/* Bid Requirements */}
        <Sec title="Bid Requirements">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 12 }}>
            <Fld label="Bid Type">
              <div style={{ display: "flex", gap: 4 }}>
                <select value={project.bidType || ""} onChange={e => up("bidType", e.target.value)} style={inp(C, { flex: 1 })}>
                  <option value="">— Select Type —</option>
                  {(masterData.bidTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button className="ghost-btn" title="Add new bid type"
                  onClick={() => { setQuickAddModal({ category: "bidType", field: "bidType", label: "Bid Type" }); setQuickAddValue(""); }}
                  style={bt(C, { background: C.bg2, border: `1px solid ${C.border}`, color: C.accent, padding: "4px 8px", flexShrink: 0 })}>
                  <Ic d={I.plus} size={12} color={C.accent} />
                </button>
              </div>
            </Fld>
            <Fld label="Bid Delivery Method">
              <div style={{ display: "flex", gap: 4 }}>
                <select value={project.bidDelivery || ""} onChange={e => up("bidDelivery", e.target.value)} style={inp(C, { flex: 1 })}>
                  <option value="">— Select Method —</option>
                  {(masterData.bidDeliveryTypes || []).map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
                </select>
                <button className="ghost-btn" title="Add new delivery method"
                  onClick={() => { setQuickAddModal({ category: "deliveryType", field: "bidDelivery", label: "Delivery Method" }); setQuickAddValue(""); }}
                  style={bt(C, { background: C.bg2, border: `1px solid ${C.border}`, color: C.accent, padding: "4px 8px", flexShrink: 0 })}>
                  <Ic d={I.plus} size={12} color={C.accent} />
                </button>
              </div>
            </Fld>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Required Attachments</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              { k: "schedule", l: "Schedule" },
              { k: "marketing", l: "Marketing / Quals" },
              { k: "financials", l: "Financial Statements" },
              { k: "bonds", l: "Bid Bond / P&P Bond" },
              { k: "insurance", l: "Insurance Certs" },
              { k: "references", l: "References" },
              { k: "safetyPlan", l: "Safety Plan" },
            ].map(r => {
              const on = project.bidRequirements?.[r.k];
              return (
                <button key={r.k}
                  onClick={() => up("bidRequirements", { ...project.bidRequirements, [r.k]: !on })}
                  style={bt(C, {
                    padding: "5px 12px", fontSize: 11, borderRadius: 5,
                    background: on ? "rgba(76,175,125,0.12)" : "transparent",
                    border: `1px solid ${on ? C.green : C.border}`,
                    color: on ? C.green : C.textMuted,
                    fontWeight: on ? 600 : 400,
                  })}>
                  {on ? "✓ " : ""}{r.l}
                </button>
              );
            })}
          </div>
          <Fld label="Other Requirements" style={{ marginTop: 8 }}>
            <input value={project.bidRequirements?.other || ""}
              onChange={e => up("bidRequirements", { ...project.bidRequirements, other: e.target.value })}
              placeholder="e.g. LEED documentation, MBE/WBE cert..." style={inp(C, { fontSize: 11 })} />
          </Fld>
        </Sec>

        {/* Description */}
        <Fld label="Project Description" style={{ marginTop: 4 }}>
          <textarea value={project.description || ""} onChange={e => up("description", e.target.value)}
            placeholder="Brief scope description..." rows={3} style={inp(C, { resize: "vertical", lineHeight: 1.5 })} />
        </Fld>

        {/* Save Button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <button className="accent-btn" onClick={handleSave}
            style={bt(C, { background: C.accent, color: "#fff", padding: "10px 28px", fontSize: 13, fontWeight: 600, borderRadius: 6 })}>
            <Ic d={I.check} size={14} color="#fff" sw={2.5} /> Save Project Info
          </button>
        </div>
      </div>

      {/* Quick Add Modal */}
      {quickAddModal && (
        <Modal onClose={() => setQuickAddModal(null)}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 12 }}>
            Add New {quickAddModal.label}
          </div>
          <input autoFocus value={quickAddValue} onChange={e => setQuickAddValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleQuickAdd()}
            placeholder={quickAddModal.category === "estimators" ? "Full Name" : "Company / Name"}
            style={inp(C, { padding: "10px 12px", fontSize: 13, marginBottom: 16 })} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setQuickAddModal(null)} style={bt(C, { background: C.bg2, color: C.textMuted, padding: "8px 16px" })}>Cancel</button>
            <button onClick={handleQuickAdd} style={bt(C, { background: C.accent, color: "#fff", padding: "8px 16px" })}>
              <Ic d={I.plus} size={12} color="#fff" /> Add
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
