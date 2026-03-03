import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useProjectStore } from '@/stores/projectStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useUiStore } from '@/stores/uiStore';
import { saveEstimate } from '@/hooks/usePersistence';
import { CODE_SYSTEMS } from '@/constants/codeSystems';
import { BUILDING_TYPES, WORK_TYPES, LOST_REASONS } from '@/constants/constructionTypes';
import Sec from '@/components/shared/Sec';
import Fld from '@/components/shared/Fld';
import Ic from '@/components/shared/Ic';
import Modal from '@/components/shared/Modal';
import { I } from '@/constants/icons';
import { inp, nInp, bt } from '@/utils/styles';
import { uid } from '@/utils/format';
import { resolveLocationFactors, getAllLocations } from '@/constants/locationFactors';

/* ── Completion calculator ── */
const ESSENTIAL_FIELDS = ['name', 'client', 'status', 'bidDue', 'buildingType', 'projectSF', 'zipCode'];
const ALL_FIELDS = [...ESSENTIAL_FIELDS, 'architect', 'engineer', 'estimator', 'address', 'workType', 'laborType', 'projectNumber', 'date', 'description', 'referredByType'];

function calcCompletion(project, mode) {
  const fields = mode === 'essentials' ? ESSENTIAL_FIELDS : ALL_FIELDS;
  let filled = 0;
  fields.forEach(f => { if (project[f] && String(project[f]).trim()) filled++; });
  return Math.round((filled / fields.length) * 100);
}

/* ── Completion Ring (SVG) ── */
function CompletionRing({ pct, size = 52, stroke = 3, C }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const color = pct >= 80 ? C.green : pct >= 50 ? '#FBBF24' : C.accent;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease-out, stroke 0.3s' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color, fontFamily: "'DM Sans', sans-serif",
      }}>
        {pct}%
      </div>
    </div>
  );
}

/* ── Visual Timeline for Bid Schedule ── */
function BidTimeline({ project, C }) {
  const fmtTime = (t) => t ? new Date(`2000-01-01T${t}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const events = [
    { key: 'walkthroughDate', label: 'Walkthrough', value: project.walkthroughDate, time: fmtTime(project.walkthroughTime), color: '#F59E0B' },
    { key: 'rfiDueDate', label: 'RFI Due', value: project.rfiDueDate, time: fmtTime(project.rfiDueTime), color: '#EF4444' },
    { key: 'bidDue', label: 'Bid Due', value: project.bidDue, time: fmtTime(project.bidDueTime), color: '#34D399' },
  ].filter(e => e.value);

  if (events.length < 2) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0, padding: '16px 0 8px',
      marginBottom: 12, position: 'relative',
    }}>
      {/* Connecting line */}
      <div style={{
        position: 'absolute', top: '50%', left: 24, right: 24, height: 2,
        background: `linear-gradient(90deg, ${C.border}, ${C.accent}40, ${C.border})`,
        transform: 'translateY(-50%)',
      }} />
      {events.map((evt, i) => (
        <div key={evt.key} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          position: 'relative', zIndex: 1,
        }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%', background: evt.color,
            boxShadow: `0 0 8px ${evt.color}60`, border: `2px solid ${C.bg1 || '#0B0D11'}`,
            marginBottom: 6,
          }} />
          <span style={{ fontSize: 8, fontWeight: 600, color: evt.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{evt.label}</span>
          <span style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            {new Date(evt.value + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {evt.time && <span style={{ marginLeft: 3, opacity: 0.7 }}>{evt.time}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Section Header with icon ── */
const SECTION_ICONS = {
  'Project Details': I.estimate || 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  'Bid Outcome': I.dollar || 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  'Referred By': I.user || 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 110 8 4 4 0 010-8z',
  'Bid Schedule': I.calendar || 'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
  'Bid Requirements': I.check || 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  'Terrain': I.plans || 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
};


export default function ProjectInfoPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const project = useProjectStore(s => s.project);
  const setProject = useProjectStore(s => s.setProject);
  const codeSystem = useProjectStore(s => s.codeSystem);
  const setCodeSystem = useProjectStore(s => s.setCodeSystem);
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const draftId = useEstimatesStore(s => s.draftId);
  const clearDraft = useEstimatesStore(s => s.clearDraft);
  const updateIndexEntry = useEstimatesStore(s => s.updateIndexEntry);
  const masterData = useMasterDataStore(s => s.masterData);
  const addMasterItem = useMasterDataStore(s => s.addMasterItem);
  const addJobType = useMasterDataStore(s => s.addJobType);
  const getContactsForCompany = useMasterDataStore(s => s.getContactsForCompany);
  const showToast = useUiStore(s => s.showToast);
  const appSettings = useUiStore(s => s.appSettings);

  const projCompany = project.companyProfileId || "";
  const projectClients = getContactsForCompany("clients", projCompany);
  const projectArchitects = getContactsForCompany("architects", projCompany);
  const projectEngineers = getContactsForCompany("engineers", projCompany);

  const [quickAddModal, setQuickAddModal] = useState(null);
  const [quickAddValue, setQuickAddValue] = useState("");
  const [detailMode, setDetailMode] = useState('essentials'); // essentials | all
  const showAll = detailMode === 'all';

  const completion = useMemo(() => calcCompletion(project, detailMode), [project, detailMode]);

  const handleSave = async () => {
    if (!activeEstimateId) return;
    const isDraft = draftId && activeEstimateId === draftId;
    if (isDraft) {
      clearDraft();
      await saveEstimate();
      showToast("Estimate created!");
    } else {
      updateIndexEntry(activeEstimateId, {
        name: project.name || "Untitled",
        estimateNumber: project.estimateNumber || "",
        client: project.client || "",
        status: project.status || "Bidding",
        bidDue: project.bidDue || "",
        estimator: project.estimator || "",
        jobType: project.jobType || "",
        buildingType: project.buildingType || "",
        workType: project.workType || "",
        architect: project.architect || "",
        projectSF: project.projectSF || 0,
        zipCode: project.zipCode || "",
        outcomeMetadata: project.outcomeMetadata || {},
      });
      showToast("Project info saved!");
    }
    navigate(`/estimate/${activeEstimateId}/plans`);
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

  const autoTag = (field) => project.autoDetected?.[field]
    ? <span style={{ fontSize: 8, color: C.green, fontWeight: 600, animation: 'fadeIn 0.3s ease' }}>✦ Auto-detected</span>
    : null;

  return (
    <div style={{ padding: T.space[7], minHeight: "100%", animation: 'fadeIn 0.2s ease-out' }}>
      <div style={{ maxWidth: 1200 }}>

        {/* ── Page Header with completion ring + detail toggle ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: T.space[5], paddingBottom: T.space[4],
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <CompletionRing pct={completion} C={C} />
            <div>
              <h1 style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text, margin: 0 }}>
                {project.name || 'Project Info'}
              </h1>
              <p style={{ color: C.textDim, fontSize: 11, margin: '4px 0 0', letterSpacing: '0.02em' }}>
                {completion < 100
                  ? `${completion}% complete — fill in more fields to improve accuracy`
                  : 'All fields complete'}
              </p>
            </div>
          </div>
          <div style={{
            display: 'flex', background: C.bg2, borderRadius: 8, padding: 3,
            border: `1px solid ${C.border}`,
          }}>
            {[
              { key: 'essentials', label: 'Essentials' },
              { key: 'all', label: 'All Fields' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setDetailMode(tab.key)} style={{
                ...bt(C), padding: '6px 14px', fontSize: 11, borderRadius: 6,
                background: detailMode === tab.key ? `${C.accent}18` : 'transparent',
                color: detailMode === tab.key ? C.accent : C.textMuted,
                border: detailMode === tab.key ? `1px solid ${C.accent}30` : '1px solid transparent',
                fontWeight: detailMode === tab.key ? 600 : 400,
              }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Project Details ── */}
        <Sec title="Project Details" icon={SECTION_ICONS['Project Details']}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <Fld label="Estimate Number">
              <input value={project.estimateNumber || ""} onChange={e => up("estimateNumber", e.target.value)} placeholder="e.g. EST-2026-001" style={inp(C)} />
              {autoTag('estimateNumber')}
            </Fld>
            <Fld label="Project Name">
              <input value={project.name} onChange={e => up("name", e.target.value)} placeholder="e.g. Smith Residence" style={inp(C)} />
              {autoTag('name')}
            </Fld>
            <Fld label="Client">
              <select value={project.client} onChange={e => {
                if (e.target.value === "__new__") { setQuickAddModal({ category: "clients", field: "client", label: "Client" }); setQuickAddValue(""); }
                else up("client", e.target.value);
              }} style={inp(C)}>
                <option value="">— Select Client —</option>
                {projectClients.map(c => <option key={c.id} value={c.company}>{c.company}</option>)}
                <option value="__new__">+ Create New Client...</option>
              </select>
              {autoTag('client')}
            </Fld>
            <Fld label="Status">
              <select value={project.status || "Active"} onChange={e => up("status", e.target.value)} style={inp(C)}>
                <option>Active</option><option>Bidding</option><option>Submitted</option><option>Won</option><option>Lost</option><option>On Hold</option><option>Cancelled</option>
              </select>
            </Fld>
            <Fld label="Building Type">
              <select value={project.buildingType || ""} onChange={e => up("buildingType", e.target.value)} style={inp(C)}>
                <option value="">— Select Building Type —</option>
                {BUILDING_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </Fld>
            <Fld label="Project SF">
              <input type="number" value={project.projectSF} onChange={e => up("projectSF", e.target.value)} style={nInp(C, { fontSize: 13 })} />
            </Fld>
            <Fld label="Project Zip Code">
              <input value={project.zipCode || ""} onChange={e => up("zipCode", e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="5-digit zip" maxLength={5} style={inp(C)} />
              {project.zipCode && project.zipCode.length >= 3 && (() => {
                const loc = resolveLocationFactors(project.zipCode);
                return loc.source !== "none" ? (
                  <div style={{ fontSize: 10, color: C.accent, marginTop: 3, fontWeight: 600 }}>
                    {loc.label} — Mat: {loc.mat}x · Lab: {loc.lab}x · Equip: {loc.equip}x
                  </div>
                ) : null;
              })()}
            </Fld>

            {/* ── Extended fields (shown in "All Fields" mode) ── */}
            {showAll && (
              <>
                <Fld label="Architect">
                  <select value={project.architect || ""} onChange={e => {
                    if (e.target.value === "__new__") { setQuickAddModal({ category: "architects", field: "architect", label: "Architect" }); setQuickAddValue(""); }
                    else up("architect", e.target.value);
                  }} style={inp(C)}>
                    <option value="">— Select Architect —</option>
                    {projectArchitects.map(a => <option key={a.id} value={a.company}>{a.company}</option>)}
                    <option value="__new__">+ Create New Architect...</option>
                  </select>
                  {autoTag('architect')}
                </Fld>
                <Fld label="Engineer">
                  <select value={project.engineer || ""} onChange={e => {
                    if (e.target.value === "__new__") { setQuickAddModal({ category: "engineers", field: "engineer", label: "Engineer" }); setQuickAddValue(""); }
                    else up("engineer", e.target.value);
                  }} style={inp(C)}>
                    <option value="">— Select Engineer —</option>
                    {projectEngineers.map(eng => <option key={eng.id} value={eng.company}>{eng.company}</option>)}
                    <option value="__new__">+ Create New Engineer...</option>
                  </select>
                  {autoTag('engineer')}
                </Fld>
                <Fld label="Estimator">
                  <select value={project.estimator} onChange={e => {
                    if (e.target.value === "__new__") { setQuickAddModal({ category: "estimators", field: "estimator", label: "Estimator" }); setQuickAddValue(""); }
                    else up("estimator", e.target.value);
                  }} style={inp(C)}>
                    <option value="">— Select Estimator —</option>
                    {masterData.estimators.map(est => <option key={est.id} value={est.name}>{est.name}</option>)}
                    <option value="__new__">+ Create New Estimator...</option>
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
                  {autoTag('address')}
                </Fld>
                <Fld label="Project Number">
                  <input value={project.projectNumber || ""} onChange={e => up("projectNumber", e.target.value)} placeholder="e.g. 2024-0156" style={inp(C)} />
                  {autoTag('projectNumber')}
                </Fld>
                <Fld label="Work Type">
                  <select value={project.workType || ""} onChange={e => up("workType", e.target.value)} style={inp(C)}>
                    <option value="">— Select Work Type —</option>
                    {WORK_TYPES.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
                  </select>
                </Fld>
                <Fld label="Labor Type">
                  <select value={project.laborType || "open_shop"} onChange={e => up("laborType", e.target.value)} style={inp(C)}>
                    {(appSettings.laborTypes || []).map(lt => (
                      <option key={lt.key} value={lt.key}>{lt.label} ({lt.multiplier}x)</option>
                    ))}
                  </select>
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
              </>
            )}
          </div>
        </Sec>

        {/* Building Parameters — moved to Discovery tab */}
        <Sec title="Terrain" icon={SECTION_ICONS['Terrain']}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
            <Ic d={I.plans} size={18} color={C.accent} />
            <div>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>Building parameters have moved to Discovery</div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                Floor counts, heights, and room quantities are now in{" "}
                <span
                  onClick={() => navigate(`/estimate/${activeEstimateId}/plans`)}
                  style={{ color: C.accent, cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>
                  Discovery &rarr; Terrain
                </span>
              </div>
            </div>
          </div>
        </Sec>

        {/* Bid Outcome — visible when Won or Lost */}
        {["Won", "Lost"].includes(project.status) && (
          <Sec title="Bid Outcome" icon={SECTION_ICONS['Bid Outcome']}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
              {project.status === "Won" && (
                <Fld label="Contract Amount">
                  <input type="number" value={project.outcomeMetadata?.contractAmount || ""}
                    onChange={e => up("outcomeMetadata", { ...project.outcomeMetadata, contractAmount: e.target.value ? Number(e.target.value) : "" })}
                    placeholder="Final contract value" style={nInp(C, { fontSize: 13 })} />
                </Fld>
              )}
              {project.status === "Lost" && (
                <>
                  <Fld label="Lost Reason">
                    <select value={project.outcomeMetadata?.lostReason || ""}
                      onChange={e => up("outcomeMetadata", { ...project.outcomeMetadata, lostReason: e.target.value })}
                      style={inp(C)}>
                      <option value="">— Select Reason —</option>
                      {LOST_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </Fld>
                  <Fld label="Competitor">
                    <input value={project.outcomeMetadata?.competitor || ""}
                      onChange={e => up("outcomeMetadata", { ...project.outcomeMetadata, competitor: e.target.value })}
                      placeholder="Who won the bid?" style={inp(C)} />
                  </Fld>
                  <Fld label="Competitor Amount">
                    <input type="number" value={project.outcomeMetadata?.competitorAmount || ""}
                      onChange={e => up("outcomeMetadata", { ...project.outcomeMetadata, competitorAmount: e.target.value ? Number(e.target.value) : "" })}
                      placeholder="Their bid amount" style={nInp(C, { fontSize: 13 })} />
                  </Fld>
                </>
              )}
              <Fld label="Outcome Notes">
                <input value={project.outcomeMetadata?.notes || ""}
                  onChange={e => up("outcomeMetadata", { ...project.outcomeMetadata, notes: e.target.value })}
                  placeholder="Lessons learned, feedback..." style={inp(C)} />
              </Fld>
            </div>
          </Sec>
        )}

        {/* Referred By — only in "all" mode */}
        {showAll && (
          <Sec title="Referred By" icon={SECTION_ICONS['Referred By']}>
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
        )}

        {/* Bid Schedule */}
        <Sec title="Bid Schedule" icon={SECTION_ICONS['Bid Schedule']}>
          {/* Visual Timeline */}
          <BidTimeline project={project} C={C} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
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
            <Fld label="Walkthrough Time">
              <input type="time" value={project.walkthroughTime || ""} onChange={e => up("walkthroughTime", e.target.value)} style={inp(C)} />
            </Fld>
            <Fld label="RFI Due Date">
              <input type="date" value={project.rfiDueDate || ""} onChange={e => up("rfiDueDate", e.target.value)} style={inp(C)} />
            </Fld>
            <Fld label="RFI Due Time">
              <input type="time" value={project.rfiDueTime || ""} onChange={e => up("rfiDueTime", e.target.value)} style={inp(C)} />
            </Fld>
            {showAll && (
              <Fld label={project.otherDueLabel || "Other Due Date"}>
                <input type="date" value={project.otherDueDate || ""} onChange={e => up("otherDueDate", e.target.value)} style={inp(C)} />
                <input value={project.otherDueLabel || ""} onChange={e => up("otherDueLabel", e.target.value)} placeholder="Label this date..."
                  style={inp(C, { marginTop: 4, fontSize: 10, padding: "4px 8px" })} />
              </Fld>
            )}
          </div>
        </Sec>

        {/* Bid Requirements — only in "all" mode */}
        {showAll && (
          <Sec title="Bid Requirements" icon={SECTION_ICONS['Bid Requirements']}>
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
        )}

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
