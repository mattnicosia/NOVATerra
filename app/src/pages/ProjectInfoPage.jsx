import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useProjectStore } from "@/stores/projectStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useUiStore } from "@/stores/uiStore";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";
import { useEstimatorStats } from "@/hooks/useEstimatorStats";
import { saveEstimate } from "@/hooks/usePersistence";
import { CODE_SYSTEMS } from "@/constants/codeSystems";
import { BUILDING_TYPES, WORK_TYPES, LOST_REASONS } from "@/constants/constructionTypes";
import Sec from "@/components/shared/Sec";
import Fld from "@/components/shared/Fld";
import Ic from "@/components/shared/Ic";
import Modal from "@/components/shared/Modal";
import TimePicker from "@/components/shared/TimePicker";
import { I } from "@/constants/icons";
import { inp, nInp, bt } from "@/utils/styles";
// uid available for future use
// import { uid } from "@/utils/format";
import { useCorrespondenceStore } from "@/stores/correspondenceStore";
import { resolveLocationFactors, getAllLocations } from "@/constants/locationFactors";
import { suggestEstimatedHours } from "@/utils/hoursEstimator";
import { supabase } from "@/utils/supabase";

/* ── Completion calculator ── */
const ALL_FIELDS = [
  "name",
  "client",
  "status",
  "bidDue",
  "buildingType",
  "projectSF",
  "zipCode",
  "architect",
  "estimator",
  "address",
  "workType",
  "laborType",
  "projectNumber",
  "date",
  "description",
  "referredByType",
];

function calcCompletion(project) {
  let filled = 0;
  ALL_FIELDS.forEach(f => {
    if (project[f] && String(project[f]).trim()) filled++;
  });
  return Math.round((filled / ALL_FIELDS.length) * 100);
}

/* ── Completion Ring (SVG) ── */
function CompletionRing({ pct, size = 52, stroke = 3, C }) {
  const T = C.T;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  const color = pct >= 80 ? C.green : pct >= 50 ? "#FBBF24" : C.accent;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.border} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease-out, stroke 0.3s" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          color,
          fontFamily: T.font.sans,
        }}
      >
        {pct}%
      </div>
    </div>
  );
}

/* ── Visual Timeline for Bid Schedule ── */
function BidTimeline({ project, C }) {
  const fmtTime = t =>
    t ? new Date(`2000-01-01T${t}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
  const events = [
    {
      key: "walkthroughDate",
      label: "Walkthrough",
      value: project.walkthroughDate,
      time: fmtTime(project.walkthroughTime),
      color: "#F59E0B",
    },
    {
      key: "rfiDueDate",
      label: "RFI Due",
      value: project.rfiDueDate,
      time: fmtTime(project.rfiDueTime),
      color: "#EF4444",
    },
    { key: "bidDue", label: "Bid Due", value: project.bidDue, time: fmtTime(project.bidDueTime), color: "#34D399" },
  ].filter(e => e.value);

  if (events.length < 2) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        padding: "16px 0 8px",
        marginBottom: 12,
        position: "relative",
      }}
    >
      {/* Connecting line */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 24,
          right: 24,
          height: 2,
          background: `linear-gradient(90deg, ${C.border}, ${C.accent}40, ${C.border})`,
          transform: "translateY(-50%)",
        }}
      />
      {events.map((evt, _i) => (
        <div
          key={evt.key}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: evt.color,
              boxShadow: `0 0 8px ${evt.color}60`,
              border: `2px solid ${C.bg1 || "#0B0D11"}`,
              marginBottom: 6,
            }}
          />
          <span
            style={{
              fontSize: 8,
              fontWeight: 600,
              color: evt.color,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {evt.label}
          </span>
          <span style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            {new Date(evt.value + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {evt.time && <span style={{ marginLeft: 3, opacity: 0.7 }}>{evt.time}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Section Header with icon ── */
const SECTION_ICONS = {
  "Project Details":
    I.estimate ||
    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  "Bid Outcome": I.dollar || "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  "Referred By": I.user || "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 110 8 4 4 0 010-8z",
  "Bid Schedule":
    I.calendar || "M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18",
  "Bid Requirements": I.check || "M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3",
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

  const org = useOrgStore(s => s.org);
  const orgMembers = useOrgStore(s => s.members);
  const isManager = useOrgStore(selectIsManager);
  const assignEstimate = useEstimatesStore(s => s.assignEstimate);
  const estimatorStats = useEstimatorStats(project.estimator);

  const projCompany = project.companyProfileId || "";
  const projectClients = getContactsForCompany("clients", projCompany);
  const projectArchitects = getContactsForCompany("architects", projCompany);
  const projectEngineers = getContactsForCompany("engineers", projCompany);

  const [quickAddModal, setQuickAddModal] = useState(null);
  const [quickAddValue, setQuickAddValue] = useState("");
  const [hoursSuggestion, setHoursSuggestion] = useState(null);
  const [estNumError, setEstNumError] = useState("");
  const prevEstNumRef = useRef("");

  // Correspondences
  const correspondences = useCorrespondenceStore(s => s.correspondences);
  const addCorrespondence = useCorrespondenceStore(s => s.addCorrespondence);
  const updateCorrespondence = useCorrespondenceStore(s => s.updateCorrespondence);
  const removeCorrespondence = useCorrespondenceStore(s => s.removeCorrespondence);
  const [corrExpanded, setCorrExpanded] = useState(null);

  // Communications timeline — linked emails from inbox
  const [commEmails, setCommEmails] = useState([]);
  const [commLoading, setCommLoading] = useState(false);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const currentEntry = useMemo(
    () => estimatesIndex.find(e => e.id === activeEstimateId),
    [estimatesIndex, activeEstimateId],
  );
  const sourceRfpId = currentEntry?.sourceRfpId || "";
  const emailCount = currentEntry?.emailCount || 0;

  // Fetch linked emails when sourceRfpId is available
  const API_BASE = import.meta.env.DEV ? "https://app-nova-42373ca7.vercel.app" : "";
  const fetchCommEmails = useCallback(async () => {
    if (!activeEstimateId || !supabase) return;
    setCommLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;
      const resp = await fetch(`${API_BASE}/api/estimate-emails?estimateId=${activeEstimateId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        setCommEmails(data.emails || []);
      }
    } catch (err) {
      console.error("[ProjectInfo] Failed to fetch communications:", err);
    } finally {
      setCommLoading(false);
    }
  }, [activeEstimateId, API_BASE]);

  useEffect(() => {
    if (sourceRfpId || emailCount > 0) fetchCommEmails();
  }, [sourceRfpId, emailCount, fetchCommEmails]);

  const completion = useMemo(() => calcCompletion(project), [project]);

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
        startDate: project.startDate || "",
        estimatedHours: project.estimatedHours || "",
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

  const validateEstimateNumber = val => {
    const trimmed = (val || "").trim();
    if (!trimmed) {
      setEstNumError("");
      return;
    }
    const all = useEstimatesStore.getState().estimatesIndex;
    const dup = all.find(e => e.estimateNumber === trimmed && e.id !== activeEstimateId);
    if (dup) {
      setEstNumError(`Estimate #${trimmed} already exists ("${dup.name}")`);
      up("estimateNumber", prevEstNumRef.current);
    } else {
      setEstNumError("");
    }
  };

  const handleSuggestHours = () => {
    const estimatesIndex = useEstimatesStore.getState().estimatesIndex;
    const result = suggestEstimatedHours(project, estimatesIndex);
    setHoursSuggestion(result);
  };

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
      const newItem =
        m.category === "estimators"
          ? { name: quickAddValue.trim(), initials: "", email: "" }
          : { company: quickAddValue.trim(), contact: "", email: "", phone: "", companyProfileId: projCompany };
      addMasterItem(m.category, newItem);
      up(m.field, quickAddValue.trim());
    }
    showToast(`Added "${quickAddValue.trim()}" to ${m.label}s`);
    setQuickAddModal(null);
    setQuickAddValue("");
  };

  // Check if a value already exists in a masterData contact list
  const isInContacts = (category, companyName) => {
    if (!companyName) return true; // nothing to save
    const list = masterData[category] || [];
    return list.some(c => (c.company || "").toLowerCase() === companyName.toLowerCase());
  };

  const handleSaveToContacts = (category, field, label) => {
    const value = project[field];
    if (!value || isInContacts(category, value)) return;
    addMasterItem(category, { company: value, contact: "", email: "", phone: "", companyProfileId: projCompany });
    showToast(`${value} added to ${label}s`);
  };

  const autoTag = (field, category, label) => {
    const detected = project.autoDetected?.[field];
    const value = project[field];
    const needsSave = category && value && !isInContacts(category, value);

    if (!detected && !needsSave) return null;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
        {detected && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: 3,
              background: `${C.accent}18`,
              color: C.accent,
              letterSpacing: "0.04em",
              lineHeight: "14px",
              animation: "fadeIn 0.3s ease",
            }}
          >
            NOVA
          </span>
        )}
        {needsSave && (
          <button
            onClick={e => {
              e.preventDefault();
              handleSaveToContacts(category, field, label);
            }}
            style={{
              fontSize: 8,
              fontWeight: 600,
              color: C.accent,
              background: `${C.accent}12`,
              border: `1px solid ${C.accent}30`,
              borderRadius: 3,
              padding: "1px 6px",
              cursor: "pointer",
              lineHeight: "14px",
              animation: "fadeIn 0.3s ease",
            }}
          >
            + Save to {label}s
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: T.space[7], minHeight: "100%", animation: "fadeIn 0.2s ease-out" }}>
      <div style={{ maxWidth: 1200 }}>
        {/* ── Page Header with completion ring + detail toggle ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: T.space[5],
            paddingBottom: T.space[4],
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <CompletionRing pct={completion} C={C} />
            <div>
              <h1 style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text, margin: 0 }}>
                {project.name || "Project Info"}
              </h1>
              <p style={{ color: C.textDim, fontSize: 11, margin: "4px 0 0", letterSpacing: "0.02em" }}>
                {completion < 100
                  ? `${completion}% complete — fill in more fields to improve accuracy`
                  : "All fields complete"}
              </p>
            </div>
          </div>
          {/* placeholder for alignment */}
          <div />
        </div>

        {/* ── Project Details ── */}
        <Sec title="Project Details" icon={SECTION_ICONS["Project Details"]}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <Fld label="Estimate Number">
              <input
                value={project.estimateNumber || ""}
                onFocus={() => {
                  prevEstNumRef.current = project.estimateNumber || "";
                }}
                onChange={e => {
                  setEstNumError("");
                  up("estimateNumber", e.target.value);
                }}
                onBlur={e => validateEstimateNumber(e.target.value)}
                placeholder="e.g. EST-2026-001"
                style={inp(C, estNumError ? { borderColor: C.red } : {})}
              />
              {estNumError && <div style={{ fontSize: 10, color: C.red, marginTop: 2 }}>{estNumError}</div>}
              {autoTag("estimateNumber")}
            </Fld>
            <Fld label="Project Name">
              <input
                value={project.name}
                onChange={e => up("name", e.target.value)}
                placeholder="e.g. Smith Residence"
                style={inp(C)}
              />
              {autoTag("name")}
            </Fld>
            <Fld label="Client">
              <select
                value={project.client}
                onChange={e => {
                  if (e.target.value === "__new__") {
                    setQuickAddModal({ category: "clients", field: "client", label: "Client" });
                    setQuickAddValue("");
                  } else up("client", e.target.value);
                }}
                style={inp(C)}
              >
                <option value="">— Select Client —</option>
                {/* Show auto-detected value if not yet in contacts */}
                {project.client && !isInContacts("clients", project.client) && (
                  <option value={project.client}>{project.client}</option>
                )}
                {projectClients.map(c => (
                  <option key={c.id} value={c.company}>
                    {c.company}
                  </option>
                ))}
                <option value="__new__">+ Create New Client...</option>
              </select>
              {autoTag("client", "clients", "Client")}
            </Fld>
            <Fld label="Status">
              <select value={project.status || "Active"} onChange={e => up("status", e.target.value)} style={inp(C)}>
                <option>Active</option>
                <option>Qualifying</option>
                <option>Bidding</option>
                <option>Submitted</option>
                <option>Won</option>
                <option>Lost</option>
                <option>On Hold</option>
                <option>Cancelled</option>
              </select>
            </Fld>
            <Fld label="Building Type">
              <select
                value={project.buildingType || ""}
                onChange={e => up("buildingType", e.target.value)}
                style={inp(C)}
              >
                <option value="">— Select Building Type —</option>
                {BUILDING_TYPES.map(b => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
              {autoTag("buildingType")}
            </Fld>
            <Fld label="Project SF">
              <input
                type="number"
                value={project.projectSF}
                onChange={e => up("projectSF", e.target.value)}
                style={nInp(C, { fontSize: 13 })}
              />
              {autoTag("projectSF")}
            </Fld>
            <Fld label="Project Zip Code">
              <input
                value={project.zipCode || ""}
                onChange={e => up("zipCode", e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="5-digit zip"
                maxLength={5}
                style={inp(C)}
              />
              {project.zipCode &&
                project.zipCode.length >= 3 &&
                (() => {
                  const loc = resolveLocationFactors(project.zipCode);
                  return loc.source !== "none" ? (
                    <div style={{ fontSize: 10, color: C.accent, marginTop: 3, fontWeight: 600 }}>
                      {loc.label} — Mat: {loc.mat}x · Lab: {loc.lab}x · Equip: {loc.equip}x
                    </div>
                  ) : null;
                })()}
              {autoTag("zipCode")}
            </Fld>

            {/* ── Extended fields ── */}
            <Fld label="Architect">
              <select
                value={project.architect || ""}
                onChange={e => {
                  if (e.target.value === "__new__") {
                    setQuickAddModal({ category: "architects", field: "architect", label: "Architect" });
                    setQuickAddValue("");
                  } else up("architect", e.target.value);
                }}
                style={inp(C)}
              >
                <option value="">— Select Architect —</option>
                {/* Show auto-detected value if not yet in contacts */}
                {project.architect && !isInContacts("architects", project.architect) && (
                  <option value={project.architect}>{project.architect}</option>
                )}
                {projectArchitects.map(a => (
                  <option key={a.id} value={a.company}>
                    {a.company}
                  </option>
                ))}
                <option value="__new__">+ Create New Architect...</option>
              </select>
              {autoTag("architect", "architects", "Architect")}
            </Fld>
            <Fld label="Structural Engineer">
              <select
                value={project.engineerStructural || ""}
                onChange={e => {
                  if (e.target.value === "__new__") {
                    setQuickAddModal({
                      category: "engineers",
                      field: "engineerStructural",
                      label: "Structural Engineer",
                    });
                    setQuickAddValue("");
                  } else up("engineerStructural", e.target.value);
                }}
                style={inp(C)}
              >
                <option value="">— Select Structural Engineer —</option>
                {project.engineerStructural && !isInContacts("engineers", project.engineerStructural) && (
                  <option value={project.engineerStructural}>{project.engineerStructural}</option>
                )}
                {projectEngineers.map(eng => (
                  <option key={eng.id} value={eng.company}>
                    {eng.company}
                  </option>
                ))}
                <option value="__new__">+ Create New Engineer...</option>
              </select>
              {autoTag("engineerStructural")}
            </Fld>
            <Fld label="MEP Engineer">
              <select
                value={project.engineerMEP || ""}
                onChange={e => {
                  if (e.target.value === "__new__") {
                    setQuickAddModal({ category: "engineers", field: "engineerMEP", label: "MEP Engineer" });
                    setQuickAddValue("");
                  } else up("engineerMEP", e.target.value);
                }}
                style={inp(C)}
              >
                <option value="">— Select MEP Engineer —</option>
                {project.engineerMEP && !isInContacts("engineers", project.engineerMEP) && (
                  <option value={project.engineerMEP}>{project.engineerMEP}</option>
                )}
                {projectEngineers.map(eng => (
                  <option key={eng.id} value={eng.company}>
                    {eng.company}
                  </option>
                ))}
                <option value="__new__">+ Create New Engineer...</option>
              </select>
              {autoTag("engineerMEP")}
            </Fld>
            <Fld label="Civil Engineer">
              <select
                value={project.engineerCivil || ""}
                onChange={e => {
                  if (e.target.value === "__new__") {
                    setQuickAddModal({ category: "engineers", field: "engineerCivil", label: "Civil Engineer" });
                    setQuickAddValue("");
                  } else up("engineerCivil", e.target.value);
                }}
                style={inp(C)}
              >
                <option value="">— Select Civil Engineer —</option>
                {project.engineerCivil && !isInContacts("engineers", project.engineerCivil) && (
                  <option value={project.engineerCivil}>{project.engineerCivil}</option>
                )}
                {projectEngineers.map(eng => (
                  <option key={eng.id} value={eng.company}>
                    {eng.company}
                  </option>
                ))}
                <option value="__new__">+ Create New Engineer...</option>
              </select>
              {autoTag("engineerCivil")}
            </Fld>
            <Fld label="Estimator">
              {/* Chip-based multi-estimator picker */}
              {(() => {
                const team = [project.estimator, ...(project.coEstimators || [])].filter(Boolean);
                // Merge org members into estimator list so owner + all members are selectable
                const masterEsts = masterData.estimators || [];
                const masterNames = new Set(masterEsts.map(e => e.name));
                const orgExtras = (orgMembers || [])
                  .filter(m => m.display_name && !masterNames.has(m.display_name))
                  .map(m => ({ id: m.id, name: m.display_name, color: m.color }));
                const allEstimators = [...masterEsts, ...orgExtras];
                const available = allEstimators.filter(e => !team.includes(e.name));
                const removeEstimator = name => {
                  if (name === project.estimator) {
                    // Removing lead → promote first co-estimator
                    const coEsts = project.coEstimators || [];
                    up("estimator", coEsts[0] || "");
                    up("coEstimators", coEsts.slice(1));
                  } else {
                    up(
                      "coEstimators",
                      (project.coEstimators || []).filter(c => c !== name),
                    );
                  }
                };
                const addEstimator = name => {
                  if (!project.estimator) {
                    up("estimator", name);
                  } else {
                    up("coEstimators", [...(project.coEstimators || []), name]);
                  }
                };
                return (
                  <>
                    <div
                      style={{
                        ...inp(C),
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        alignItems: "center",
                        minHeight: 34,
                        padding: "4px 6px",
                      }}
                    >
                      {team.map((name, idx) => (
                        <span
                          key={name}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 3,
                            padding: "2px 6px 2px 8px",
                            background: `${C.accent}18`,
                            border: `1px solid ${C.accent}30`,
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            color: C.text,
                          }}
                        >
                          {idx === 0 && team.length > 1 && (
                            <span style={{ fontSize: 8, color: C.accent, fontWeight: 700, marginRight: 1 }}>LEAD</span>
                          )}
                          {name}
                          <button
                            onClick={() => removeEstimator(name)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: C.textMuted,
                              fontSize: 13,
                              lineHeight: 1,
                              padding: "0 2px",
                              display: "flex",
                              alignItems: "center",
                            }}
                            title={`Remove ${name}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <select
                        value=""
                        onChange={e => {
                          if (e.target.value === "__new__") {
                            setQuickAddModal({ category: "estimators", field: "estimator", label: "Estimator" });
                            setQuickAddValue("");
                          } else if (e.target.value) {
                            addEstimator(e.target.value);
                          }
                        }}
                        style={{
                          ...inp(C),
                          border: "none",
                          background: "transparent",
                          padding: "2px 4px",
                          fontSize: 11,
                          minWidth: team.length > 0 ? 30 : 160,
                          flex: team.length > 0 ? "0 0 auto" : 1,
                          cursor: "pointer",
                          color: team.length > 0 ? C.textMuted : C.text,
                        }}
                      >
                        <option value="">{team.length > 0 ? "+" : "— Select Estimator —"}</option>
                        {available.map(est => (
                          <option key={est.id} value={est.name}>
                            {est.name}
                          </option>
                        ))}
                        <option value="__new__">+ Create New Estimator...</option>
                      </select>
                    </div>
                    {project.estimator && (estimatorStats.winRate != null || estimatorStats.accuracy != null) && (
                      <div style={{ fontSize: 9, color: C.textDim, marginTop: 3, display: "flex", gap: 6 }}>
                        {estimatorStats.winRate != null && (
                          <span style={{ color: estimatorStats.winRate >= 40 ? C.green : C.textDim }}>
                            Win rate: {estimatorStats.winRate}%
                          </span>
                        )}
                        {estimatorStats.winRate != null && estimatorStats.accuracy != null && (
                          <span style={{ opacity: 0.4 }}>·</span>
                        )}
                        {estimatorStats.accuracy != null && (
                          <span style={{ color: estimatorStats.accuracy <= 10 ? C.green : "#F59E0B" }}>
                            Accuracy: ±{estimatorStats.accuracy}%
                          </span>
                        )}
                        {estimatorStats.totalHours > 0 && (
                          <>
                            <span style={{ opacity: 0.4 }}>·</span>
                            <span>{estimatorStats.totalHours}h logged</span>
                          </>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </Fld>
            {/* Assigned To (org mode only) */}
            {org && (
              <Fld label="Assigned To">
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", minHeight: 32 }}>
                  {(() => {
                    const idx = useEstimatesStore.getState().estimatesIndex.find(e => e.id === activeEstimateId);
                    const assignedIds = idx?.assignedTo || [];
                    const assigned = orgMembers.filter(m => assignedIds.includes(m.user_id));
                    return (
                      <>
                        {assigned.length > 0 ? (
                          assigned.map(m => (
                            <div
                              key={m.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "3px 8px 3px 4px",
                                background: `${m.color || "#6366F1"}18`,
                                border: `1px solid ${m.color || "#6366F1"}30`,
                                borderRadius: 12,
                                fontSize: 10,
                                color: C.text,
                              }}
                            >
                              <div
                                style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: "50%",
                                  background: m.color || "#6366F1",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 8,
                                  fontWeight: 700,
                                  color: "#fff",
                                }}
                              >
                                {(m.display_name || "?")[0].toUpperCase()}
                              </div>
                              {m.display_name || "Unnamed"}
                              {isManager && (
                                <button
                                  onClick={() => {
                                    const next = assignedIds.filter(id => id !== m.user_id);
                                    assignEstimate(activeEstimateId, next);
                                  }}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 0,
                                    marginLeft: 2,
                                    lineHeight: 1,
                                  }}
                                >
                                  <Ic d={I.close} size={8} color={C.textDim} />
                                </button>
                              )}
                            </div>
                          ))
                        ) : (
                          <span style={{ fontSize: 10, color: C.textDim }}>Unassigned</span>
                        )}
                        {isManager && (
                          <select
                            value=""
                            onChange={e => {
                              if (!e.target.value) return;
                              const next = [...new Set([...assignedIds, e.target.value])];
                              assignEstimate(activeEstimateId, next);
                            }}
                            style={{
                              ...inp(C),
                              width: 28,
                              height: 28,
                              padding: 0,
                              fontSize: 14,
                              textAlign: "center",
                              cursor: "pointer",
                              borderRadius: "50%",
                              flexShrink: 0,
                            }}
                            title="Assign team member"
                          >
                            <option value="">+</option>
                            {orgMembers
                              .filter(m => !assignedIds.includes(m.user_id))
                              .map(m => (
                                <option key={m.id} value={m.user_id}>
                                  {m.display_name || "Unnamed"}
                                </option>
                              ))}
                          </select>
                        )}
                      </>
                    );
                  })()}
                </div>
              </Fld>
            )}
            <Fld label="Company Profile">
              <select
                value={project.companyProfileId || ""}
                onChange={e => up("companyProfileId", e.target.value)}
                style={inp(C)}
              >
                <option value="">{masterData.companyInfo?.name || "Primary Profile"} (Default)</option>
                {(masterData.companyProfiles || []).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name || "Unnamed Profile"}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>
                Branding for proposals, bid forms, and reports
              </div>
            </Fld>
            <Fld label="Address">
              <input value={project.address} onChange={e => up("address", e.target.value)} style={inp(C)} />
              {autoTag("address")}
            </Fld>
            <Fld label="Work Type">
              <select value={project.workType || ""} onChange={e => up("workType", e.target.value)} style={inp(C)}>
                <option value="">— Select Work Type —</option>
                {WORK_TYPES.map(w => (
                  <option key={w.key} value={w.key}>
                    {w.label}
                  </option>
                ))}
              </select>
              {autoTag("workType")}
            </Fld>
            <Fld label="Labor Type">
              <select
                value={project.laborType || "open_shop"}
                onChange={e => up("laborType", e.target.value)}
                style={inp(C)}
              >
                {(appSettings.laborTypes || []).map(lt => (
                  <option key={lt.key} value={lt.key}>
                    {lt.label} ({lt.multiplier}x)
                  </option>
                ))}
              </select>
            </Fld>
            <Fld label="Location Override">
              <select
                value={project.locationMetroId || ""}
                onChange={e => up("locationMetroId", e.target.value)}
                style={inp(C)}
              >
                <option value="">Auto-detect from zip</option>
                {getAllLocations()
                  .filter(m => m.id)
                  .map(m => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
              </select>
            </Fld>
            <Fld label="Cost Code System">
              <select value={codeSystem} onChange={e => setCodeSystem(e.target.value)} style={inp(C)}>
                {Object.values(CODE_SYSTEMS).map(sys => (
                  <option key={sys.id} value={sys.id}>
                    {sys.icon} {sys.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>{(CODE_SYSTEMS[codeSystem] || {}).desc}</div>
            </Fld>
          </div>
        </Sec>

        {/* Bid Outcome — visible when Won or Lost */}
        {["Won", "Lost"].includes(project.status) && (
          <Sec title="Bid Outcome" icon={SECTION_ICONS["Bid Outcome"]}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
              {project.status === "Won" && (
                <Fld label="Contract Amount">
                  <input
                    type="number"
                    value={project.outcomeMetadata?.contractAmount || ""}
                    onChange={e =>
                      up("outcomeMetadata", {
                        ...project.outcomeMetadata,
                        contractAmount: e.target.value ? Number(e.target.value) : "",
                      })
                    }
                    placeholder="Final contract value"
                    style={nInp(C, { fontSize: 13 })}
                  />
                </Fld>
              )}
              {project.status === "Lost" && (
                <>
                  <Fld label="Lost Reason">
                    <select
                      value={project.outcomeMetadata?.lostReason || ""}
                      onChange={e => up("outcomeMetadata", { ...project.outcomeMetadata, lostReason: e.target.value })}
                      style={inp(C)}
                    >
                      <option value="">— Select Reason —</option>
                      {LOST_REASONS.map(r => (
                        <option key={r.key} value={r.key}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </Fld>
                  <Fld label="Competitor">
                    <input
                      value={project.outcomeMetadata?.competitor || ""}
                      onChange={e => up("outcomeMetadata", { ...project.outcomeMetadata, competitor: e.target.value })}
                      placeholder="Who won the bid?"
                      style={inp(C)}
                    />
                  </Fld>
                  <Fld label="Competitor Amount">
                    <input
                      type="number"
                      value={project.outcomeMetadata?.competitorAmount || ""}
                      onChange={e =>
                        up("outcomeMetadata", {
                          ...project.outcomeMetadata,
                          competitorAmount: e.target.value ? Number(e.target.value) : "",
                        })
                      }
                      placeholder="Their bid amount"
                      style={nInp(C, { fontSize: 13 })}
                    />
                  </Fld>
                </>
              )}
              <Fld label="Outcome Notes">
                <input
                  value={project.outcomeMetadata?.notes || ""}
                  onChange={e => up("outcomeMetadata", { ...project.outcomeMetadata, notes: e.target.value })}
                  placeholder="Lessons learned, feedback..."
                  style={inp(C)}
                />
              </Fld>
            </div>
          </Sec>
        )}

        {/* Referred By */}
        <Sec title="Referred By" icon={SECTION_ICONS["Referred By"]}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <Fld label="Referral Source">
              <select
                value={project.referredByType || ""}
                onChange={e => up("referredByType", e.target.value)}
                style={inp(C)}
              >
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
              <input
                value={project.referredByName || ""}
                onChange={e => up("referredByName", e.target.value)}
                placeholder="Person or company name"
                style={inp(C)}
              />
            </Fld>
            <Fld label="Referral Notes">
              <input
                value={project.referredByNotes || ""}
                onChange={e => up("referredByNotes", e.target.value)}
                placeholder="How did they find us, context..."
                style={inp(C)}
              />
            </Fld>
          </div>
        </Sec>

        {/* Bid Schedule */}
        <Sec title="Bid Schedule" icon={SECTION_ICONS["Bid Schedule"]}>
          {/* Visual Timeline */}
          <BidTimeline project={project} C={C} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <Fld label="Estimated Hours">
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={project.estimatedHours || ""}
                  onChange={e => up("estimatedHours", e.target.value)}
                  placeholder="0"
                  style={inp(C, { flex: 1 })}
                />
                <button
                  type="button"
                  onClick={handleSuggestHours}
                  title="NOVA: Suggest hours from similar projects"
                  style={{
                    ...bt(C),
                    padding: "6px 8px",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    background: `${C.accent}18`,
                    border: `1px solid ${C.accent}44`,
                    color: C.accent,
                    borderRadius: 6,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Ic path={I.ai} size={14} color={C.accent} />
                </button>
              </div>
              {hoursSuggestion && (
                <div
                  style={{
                    marginTop: 6,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: `${C.accent}10`,
                    border: `1px solid ${C.accent}22`,
                    fontSize: 11,
                    color: C.textSoft,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 120 }}>
                    ~{hoursSuggestion.range[0]}-{hoursSuggestion.range[1]} hrs based on {hoursSuggestion.basedOn}{" "}
                    similar project{hoursSuggestion.basedOn !== 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      up("estimatedHours", String(hoursSuggestion.suggested));
                      setHoursSuggestion(null);
                    }}
                    style={{
                      ...bt(C),
                      padding: "3px 10px",
                      fontSize: 10,
                      fontWeight: 600,
                      background: C.accent,
                      color: "#fff",
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Apply
                  </button>
                </div>
              )}
              {hoursSuggestion === null && (
                <div style={{ fontSize: 10, color: C.textSoft, marginTop: 2, opacity: 0.6 }}>
                  Click the star to get NOVA's estimate
                </div>
              )}
            </Fld>
            <Fld label="Bid Due Date">
              <input type="date" value={project.bidDue} onChange={e => up("bidDue", e.target.value)} style={inp(C)} />
            </Fld>
            <Fld label="Bid Due Time">
              <TimePicker value={project.bidDueTime || "14:00"} onChange={v => up("bidDueTime", v)} />
            </Fld>
            <Fld label="Walkthrough Date">
              <input
                type="date"
                value={project.walkthroughDate || ""}
                onChange={e => up("walkthroughDate", e.target.value)}
                style={inp(C)}
              />
            </Fld>
            <Fld label="Walkthrough Time">
              <TimePicker value={project.walkthroughTime || ""} onChange={v => up("walkthroughTime", v)} />
            </Fld>
            <Fld label="RFI Due Date">
              <input
                type="date"
                value={project.rfiDueDate || ""}
                onChange={e => up("rfiDueDate", e.target.value)}
                style={inp(C)}
              />
            </Fld>
            <Fld label="RFI Due Time">
              <TimePicker value={project.rfiDueTime || ""} onChange={v => up("rfiDueTime", v)} />
            </Fld>
            <Fld label={project.otherDueLabel || "Other Due Date"}>
              <input
                type="date"
                value={project.otherDueDate || ""}
                onChange={e => up("otherDueDate", e.target.value)}
                style={inp(C)}
              />
              <input
                value={project.otherDueLabel || ""}
                onChange={e => up("otherDueLabel", e.target.value)}
                placeholder="Label this date..."
                style={inp(C, { marginTop: 4, fontSize: 10, padding: "4px 8px" })}
              />
            </Fld>
          </div>
        </Sec>

        {/* Correspondences — only for Submitted/Won, hidden until first one added */}
        {(correspondences.length > 0 || project.status === "Submitted" || project.status === "Won") && (
          <Sec
            title={`Correspondences${correspondences.length > 0 ? ` (${correspondences.length})` : ""}`}
            icon={
              I.email ||
              "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            }
          >
            {correspondences.length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
                  No correspondences yet. Track client Q&A after bid submission.
                </div>
                <button
                  onClick={() => addCorrespondence({ title: "", dueDate: "", estimatedHours: 0 })}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 6,
                    border: `1px solid ${C.accent}4D`,
                    background: `${C.accent}1A`,
                    color: C.accent,
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Add Correspondence
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {correspondences.map(c => {
                  const isExpanded = corrExpanded === c.id;
                  const statusColors = {
                    pending: "#F59E0B",
                    in_progress: "#60A5FA",
                    answered: "#22C55E",
                    closed: "#64748B",
                  };
                  const catLabels = {
                    clarification: "Clarification",
                    substitution: "Substitution",
                    scope: "Scope",
                    schedule: "Schedule",
                    other: "Other",
                  };
                  return (
                    <div
                      key={c.id}
                      style={{
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: "10px 12px",
                        background: C.bg1,
                      }}
                    >
                      {/* Header row */}
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                        onClick={() => setCorrExpanded(isExpanded ? null : c.id)}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          style={{
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                            transition: "transform 0.15s",
                            flexShrink: 0,
                          }}
                        >
                          <path
                            d="M3 1.5L7 5L3 8.5"
                            stroke={C.textMuted}
                            strokeWidth="1.3"
                            fill="none"
                            strokeLinecap="round"
                          />
                        </svg>
                        <input
                          value={c.title}
                          onChange={e => updateCorrespondence(c.id, { title: e.target.value })}
                          onClick={e => e.stopPropagation()}
                          placeholder="Correspondence title..."
                          style={inp(C, { flex: 1, fontSize: 11, fontWeight: 600, padding: "2px 6px", minWidth: 0 })}
                        />
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: `${statusColors[c.status] || "#64748B"}20`,
                            color: statusColors[c.status] || "#64748B",
                            textTransform: "uppercase",
                            flexShrink: 0,
                          }}
                        >
                          {(c.status || "pending").replace("_", " ")}
                        </span>
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 500,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: C.isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                            color: C.textMuted,
                            flexShrink: 0,
                          }}
                        >
                          {catLabels[c.category] || c.category}
                        </span>
                      </div>

                      {/* Compact row: due date + hours */}
                      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                        <label style={{ fontSize: 9, color: C.textMuted, flexShrink: 0 }}>Due</label>
                        <input
                          type="date"
                          value={c.dueDate || ""}
                          onChange={e => updateCorrespondence(c.id, { dueDate: e.target.value })}
                          style={inp(C, { fontSize: 10, padding: "2px 6px", width: 120 })}
                        />
                        <label style={{ fontSize: 9, color: C.textMuted, flexShrink: 0 }}>Hours</label>
                        <input
                          type="number"
                          value={c.estimatedHours || ""}
                          onChange={e => updateCorrespondence(c.id, { estimatedHours: Number(e.target.value) || 0 })}
                          style={inp(C, { fontSize: 10, padding: "2px 6px", width: 50, textAlign: "center" })}
                        />
                      </div>

                      {/* Expanded: question, response, actions */}
                      {isExpanded && (
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div>
                            <label style={{ fontSize: 9, color: C.textMuted, display: "block", marginBottom: 2 }}>
                              Question
                            </label>
                            <textarea
                              value={c.question || ""}
                              onChange={e => updateCorrespondence(c.id, { question: e.target.value })}
                              placeholder="Client's question..."
                              rows={2}
                              style={inp(C, { fontSize: 10, padding: "4px 8px", resize: "vertical", width: "100%" })}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 9, color: C.textMuted, display: "block", marginBottom: 2 }}>
                              Response
                            </label>
                            <textarea
                              value={c.response || ""}
                              onChange={e => updateCorrespondence(c.id, { response: e.target.value })}
                              placeholder="Your response..."
                              rows={2}
                              style={inp(C, { fontSize: 10, padding: "4px 8px", resize: "vertical", width: "100%" })}
                            />
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <Fld label="Category" style={{ flex: 1 }}>
                              <select
                                value={c.category || "clarification"}
                                onChange={e => updateCorrespondence(c.id, { category: e.target.value })}
                                style={inp(C, { fontSize: 10, padding: "2px 6px" })}
                              >
                                <option value="clarification">Clarification</option>
                                <option value="substitution">Substitution</option>
                                <option value="scope">Scope</option>
                                <option value="schedule">Schedule</option>
                                <option value="other">Other</option>
                              </select>
                            </Fld>
                            <Fld label="Status" style={{ flex: 1 }}>
                              <select
                                value={c.status || "pending"}
                                onChange={e => {
                                  const updates = { status: e.target.value };
                                  if (e.target.value === "answered") updates.answeredAt = new Date().toISOString();
                                  updateCorrespondence(c.id, updates);
                                }}
                                style={inp(C, { fontSize: 10, padding: "2px 6px" })}
                              >
                                <option value="pending">Pending</option>
                                <option value="in_progress">In Progress</option>
                                <option value="answered">Answered</option>
                                <option value="closed">Closed</option>
                              </select>
                            </Fld>
                            <Fld label="Respondent" style={{ flex: 1 }}>
                              <input
                                value={c.respondent || ""}
                                onChange={e => updateCorrespondence(c.id, { respondent: e.target.value })}
                                placeholder="Who responded"
                                style={inp(C, { fontSize: 10, padding: "2px 6px" })}
                              />
                            </Fld>
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
                            <button
                              onClick={() => removeCorrespondence(c.id)}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 5,
                                border: `1px solid ${C.red}4D`,
                                background: `${C.red}15`,
                                color: C.red,
                                fontSize: 9,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Quick add row */}
                <button
                  onClick={() => addCorrespondence({ title: "", dueDate: "", estimatedHours: 0 })}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: `1px dashed ${C.border}`,
                    background: "transparent",
                    color: C.textMuted,
                    fontSize: 10,
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  + Add Correspondence
                </button>
              </div>
            )}
          </Sec>
        )}

        {/* Communications Timeline — shows all linked emails */}
        {(commEmails.length > 0 || sourceRfpId) && (
          <Sec
            title={`Communications${commEmails.length > 0 ? ` (${commEmails.length})` : ""}`}
            icon={
              I.inbox ||
              "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            }
          >
            {commLoading ? (
              <div style={{ fontSize: 11, color: C.textDim, padding: "8px 0" }}>Loading emails...</div>
            ) : commEmails.length === 0 ? (
              <div style={{ fontSize: 11, color: C.textDim, padding: "8px 0" }}>
                No linked emails found. Future emails matching this project will appear here automatically.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {commEmails.map((email, ei) => {
                  const cls = email.classification || "initial_rfp";
                  const clsColors = {
                    initial_rfp: "#22c55e",
                    addendum: "#FF9500",
                    date_change: "#f59e0b",
                    scope_clarification: "#60A5FA",
                    substitution: "#A78BFA",
                    pre_bid_notes: "#34D399",
                    plan_room_notification: "#94A3B8",
                    other: "#94A3B8",
                  };
                  const clsLabels = {
                    initial_rfp: "RFP",
                    addendum: email.addendum_number ? `Addendum #${email.addendum_number}` : "Addendum",
                    date_change: "Date Change",
                    scope_clarification: "Clarification",
                    substitution: "Substitution",
                    pre_bid_notes: "Pre-Bid Notes",
                    plan_room_notification: "Plan Room",
                    other: "Other",
                  };
                  const clsColor = clsColors[cls] || "#94A3B8";
                  const fmtDate = d => {
                    if (!d) return "";
                    const dt = new Date(d);
                    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  };
                  const attachCount = (email.attachments || []).length;

                  return (
                    <div
                      key={email.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        padding: "8px 0",
                        borderBottom: ei < commEmails.length - 1 ? `1px solid ${C.border}20` : "none",
                      }}
                    >
                      {/* Timeline dot */}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          paddingTop: 3,
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: clsColor,
                            border: `2px solid ${C.bg1}`,
                            boxShadow: `0 0 0 1px ${clsColor}40`,
                          }}
                        />
                        {ei < commEmails.length - 1 && (
                          <div
                            style={{ width: 1, flex: 1, minHeight: 20, background: `${C.border}40`, marginTop: 2 }}
                          />
                        )}
                      </div>
                      {/* Email content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 600,
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: `${clsColor}18`,
                              color: clsColor,
                            }}
                          >
                            {clsLabels[cls] || cls}
                          </span>
                          <span style={{ fontSize: 10, color: C.textDim }}>{fmtDate(email.received_at)}</span>
                          {attachCount > 0 && (
                            <span style={{ fontSize: 9, color: C.textDim }}>
                              {attachCount} file{attachCount !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            color: C.text,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {email.subject || "(no subject)"}
                        </div>
                        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>
                          from {email.sender_name || email.sender_email}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Sec>
        )}

        {/* Bid Requirements */}
        <Sec title="Bid Requirements" icon={SECTION_ICONS["Bid Requirements"]}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <Fld label="Bid Type">
              <div style={{ display: "flex", gap: 4 }}>
                <select
                  value={project.bidType || ""}
                  onChange={e => up("bidType", e.target.value)}
                  style={inp(C, { flex: 1 })}
                >
                  <option value="">— Select Type —</option>
                  {(masterData.bidTypes || []).map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  className="ghost-btn"
                  title="Add new bid type"
                  onClick={() => {
                    setQuickAddModal({ category: "bidType", field: "bidType", label: "Bid Type" });
                    setQuickAddValue("");
                  }}
                  style={bt(C, {
                    background: C.bg2,
                    border: `1px solid ${C.border}`,
                    color: C.accent,
                    padding: "4px 8px",
                    flexShrink: 0,
                  })}
                >
                  <Ic d={I.plus} size={12} color={C.accent} />
                </button>
              </div>
            </Fld>
            <Fld label="Bid Delivery Method">
              <div style={{ display: "flex", gap: 4 }}>
                <select
                  value={project.bidDelivery || ""}
                  onChange={e => up("bidDelivery", e.target.value)}
                  style={inp(C, { flex: 1 })}
                >
                  <option value="">— Select Method —</option>
                  {(masterData.bidDeliveryTypes || []).map(t => (
                    <option key={t} value={t.toLowerCase()}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  className="ghost-btn"
                  title="Add new delivery method"
                  onClick={() => {
                    setQuickAddModal({ category: "deliveryType", field: "bidDelivery", label: "Delivery Method" });
                    setQuickAddValue("");
                  }}
                  style={bt(C, {
                    background: C.bg2,
                    border: `1px solid ${C.border}`,
                    color: C.accent,
                    padding: "4px 8px",
                    flexShrink: 0,
                  })}
                >
                  <Ic d={I.plus} size={12} color={C.accent} />
                </button>
              </div>
            </Fld>
          </div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            Required Attachments
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              { k: "bidForm", l: "Bid Form" },
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
                <button
                  key={r.k}
                  onClick={() => up("bidRequirements", { ...project.bidRequirements, [r.k]: !on })}
                  style={bt(C, {
                    padding: "5px 12px",
                    fontSize: 11,
                    borderRadius: 5,
                    background: on ? "rgba(76,175,125,0.12)" : "transparent",
                    border: `1px solid ${on ? C.green : C.border}`,
                    color: on ? C.green : C.textMuted,
                    fontWeight: on ? 600 : 400,
                  })}
                >
                  {on ? "✓ " : ""}
                  {r.l}
                </button>
              );
            })}
          </div>
          <Fld label="Other Requirements" style={{ marginTop: 8 }}>
            <input
              value={project.bidRequirements?.other || ""}
              onChange={e => up("bidRequirements", { ...project.bidRequirements, other: e.target.value })}
              placeholder="e.g. LEED documentation, MBE/WBE cert..."
              style={inp(C, { fontSize: 11 })}
            />
          </Fld>
        </Sec>

        {/* Description */}
        <Fld label="Project Description" style={{ marginTop: 4 }}>
          <textarea
            value={project.description || ""}
            onChange={e => up("description", e.target.value)}
            placeholder="Brief scope description..."
            rows={3}
            style={inp(C, { resize: "vertical", lineHeight: 1.5 })}
          />
        </Fld>

        {/* Save Button */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 20,
            paddingTop: 16,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <button
            className="accent-btn"
            onClick={handleSave}
            style={bt(C, {
              background: C.accent,
              color: "#fff",
              padding: "10px 28px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
            })}
          >
            <Ic d={I.check} size={14} color="#fff" sw={2.5} /> Save & Continue
          </button>
        </div>
      </div>

      {/* Quick Add Modal */}
      {quickAddModal && (
        <Modal onClose={() => setQuickAddModal(null)}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 12 }}>
            Add New {quickAddModal.label}
          </div>
          <input
            autoFocus
            value={quickAddValue}
            onChange={e => setQuickAddValue(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleQuickAdd()}
            placeholder={quickAddModal.category === "estimators" ? "Full Name" : "Company / Name"}
            style={inp(C, { padding: "10px 12px", fontSize: 13, marginBottom: 16 })}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setQuickAddModal(null)}
              style={bt(C, { background: C.bg2, color: C.textMuted, padding: "8px 16px" })}
            >
              Cancel
            </button>
            <button
              onClick={handleQuickAdd}
              style={bt(C, { background: C.accent, color: "#fff", padding: "8px 16px" })}
            >
              <Ic d={I.plus} size={12} color="#fff" /> Add
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
