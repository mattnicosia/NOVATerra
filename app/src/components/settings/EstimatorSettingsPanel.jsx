import { useState, useMemo, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";
import { computeEstimatorExperience } from "@/utils/estimatorExperience";
import { inp, bt, cardSolid } from "@/utils/styles";
import { uid } from "@/utils/format";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import Avatar from "@/components/shared/Avatar";

const TEAM_COLORS = [
  "#A78BFA",
  "#60A5FA",
  "#34D399",
  "#FB7185",
  "#FBBF24",
  "#F472B6",
  "#38BDF8",
  "#4ADE80",
  "#FB923C",
  "#C084FC",
];

function getInitials(name) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ExperiencePills({ estimatorName, estimates, C, T }) {
  const exp = useMemo(() => computeEstimatorExperience(estimates, estimatorName), [estimates, estimatorName]);
  if (!exp || exp.jobTypes.length === 0) return null;
  const top3 = exp.jobTypes.slice(0, 3);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {top3.map(jt => (
        <span
          key={jt.type}
          style={{
            fontSize: 9,
            fontWeight: 500,
            color: C.text,
            background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            padding: "2px 8px",
            borderRadius: 10,
          }}
        >
          {jt.type} ({jt.count})
        </span>
      ))}
    </div>
  );
}

export default function EstimatorSettingsPanel() {
  const C = useTheme();
  const T = C.T;
  const estimators = useMasterDataStore(s => s.masterData.estimators) || [];
  const addMasterItem = useMasterDataStore(s => s.addMasterItem);
  const updateMasterItem = useMasterDataStore(s => s.updateMasterItem);
  const removeMasterItem = useMasterDataStore(s => s.removeMasterItem);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);

  // Org store — for invite functionality
  const org = useOrgStore(s => s.org);
  const isManager = useOrgStore(selectIsManager);
  const members = useOrgStore(s => s.members);
  const allInvitations = useOrgStore(s => s.allInvitations);
  const sendEstimatorInvite = useOrgStore(s => s.sendEstimatorInvite);
  const fetchAllInvitations = useOrgStore(s => s.fetchAllInvitations);
  const revokeInvitation = useOrgStore(s => s.revokeInvitation);

  const [inviting, setInviting] = useState(null); // email currently being invited

  // Load all invitations when org is available
  useEffect(() => {
    if (org && isManager) fetchAllInvitations();
  }, [org, isManager]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formColor, setFormColor] = useState(TEAM_COLORS[0]);
  const [formMaxHours, setFormMaxHours] = useState(7);
  const [formNotes, setFormNotes] = useState("");

  // Collect unique job types from all estimates for preferred types picker
  const allJobTypes = useMemo(() => {
    const s = new Set();
    for (const e of estimatesIndex) {
      if (e.jobType) s.add(e.jobType);
    }
    return [...s].sort();
  }, [estimatesIndex]);
  const [formPreferredTypes, setFormPreferredTypes] = useState([]);

  const resetForm = () => {
    setFormName("");
    setFormEmail("");
    setFormColor(TEAM_COLORS[estimators.length % TEAM_COLORS.length]);
    setFormMaxHours(7);
    setFormPreferredTypes([]);
    setFormNotes("");
    setEditId(null);
    setShowForm(false);
  };

  const handleSave = () => {
    if (!formName.trim()) return;
    const initials = getInitials(formName);
    if (editId) {
      // Update existing
      const est = estimators.find(e => e.id === editId);
      if (est) {
        updateMasterItem("estimators", editId, "name", formName.trim());
        updateMasterItem("estimators", editId, "email", formEmail.trim());
        updateMasterItem("estimators", editId, "initials", initials);
        updateMasterItem("estimators", editId, "color", formColor);
        updateMasterItem("estimators", editId, "maxHoursPerDay", Number(formMaxHours) || 7);
        updateMasterItem("estimators", editId, "preferredJobTypes", formPreferredTypes);
        updateMasterItem("estimators", editId, "notes", formNotes.trim());
      }
    } else {
      // Add new
      addMasterItem("estimators", {
        name: formName.trim(),
        email: formEmail.trim(),
        initials,
        color: formColor,
        maxHoursPerDay: Number(formMaxHours) || 7,
        preferredJobTypes: formPreferredTypes,
        notes: formNotes.trim(),
      });
    }
    resetForm();
  };

  const handleEdit = est => {
    setEditId(est.id);
    setFormName(est.name || "");
    setFormEmail(est.email || "");
    setFormColor(est.color || TEAM_COLORS[0]);
    setFormMaxHours(est.maxHoursPerDay || 7);
    setFormPreferredTypes(est.preferredJobTypes || []);
    setFormNotes(est.notes || "");
    setShowForm(true);
  };

  const handleRemove = id => {
    removeMasterItem("estimators", id);
    if (editId === id) resetForm();
  };

  // ── Invitation status lookup ──
  const getInviteStatus = email => {
    if (!email || !org) return null;
    const normalized = email.toLowerCase().trim();

    // Check if already an active org member
    const member = members.find(m => m.email?.toLowerCase() === normalized && m.active);
    if (member) return { status: "active", member };

    // Check invitations (most recent first — already sorted by created_at desc)
    const inv = allInvitations.find(i => i.email?.toLowerCase() === normalized);
    if (!inv) return null;

    if (inv.accepted_at) return { status: "accepted", inv };
    if (new Date(inv.expires_at) < new Date()) return { status: "expired", inv };
    return { status: "pending", inv };
  };

  const handleInvite = async (email, name) => {
    if (!email || inviting) return;
    setInviting(email);
    const result = await sendEstimatorInvite(email, name);
    if (result?.error) {
      // Simple alert for now — could use toast
      console.warn("[invite]", result.error);
      alert(result.error);
    }
    setInviting(null);
  };

  const handleResendInvite = async (email, name, oldInvitationId) => {
    if (!email || inviting) return;
    setInviting(email);
    // Revoke old invitation first, then send new one
    if (oldInvitationId) await revokeInvitation(oldInvitationId);
    const result = await sendEstimatorInvite(email, name);
    if (result?.error) {
      console.warn("[invite resend]", result.error);
      alert(result.error);
    }
    setInviting(null);
  };

  // Compute active project counts per estimator
  const getEstimatorStats = name => {
    const active = estimatesIndex.filter(e => e.estimator === name && ["Bidding", "Submitted"].includes(e.status));
    const totalHours = active.reduce((s, e) => s + (Number(e.estimatedHours) || 0), 0);
    const hoursLogged = active.reduce((s, e) => s + (e.timerTotalMs || 0) / 3600000, 0);
    return { activeCount: active.length, totalHours, hoursLogged: Math.round(hoursLogged * 10) / 10 };
  };

  // Mini workload strip — 30-day horizontal bar showing projects
  const MiniGantt = ({ estimatorName, color }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rangeStart = new Date(today);
    rangeStart.setDate(rangeStart.getDate() - 7);
    const rangeEnd = new Date(today);
    rangeEnd.setDate(rangeEnd.getDate() + 23);
    const totalDays = 30;

    const active = estimatesIndex.filter(
      e => e.estimator === estimatorName && ["Bidding", "Submitted"].includes(e.status) && e.bidDue,
    );

    const bars = active.map(est => {
      const start = est.startDate ? new Date(est.startDate + "T00:00:00") : today;
      const end = new Date(est.bidDue + "T00:00:00");
      const startOffset = Math.max(0, (start - rangeStart) / 86400000);
      const endOffset = Math.min(totalDays, (end - rangeStart) / 86400000);
      const left = (startOffset / totalDays) * 100;
      const width = Math.max(2, ((endOffset - startOffset) / totalDays) * 100);
      return { id: est.id, name: est.name, left, width, status: est.status };
    });

    if (bars.length === 0) return null;

    const todayPos = ((today - rangeStart) / 86400000 / totalDays) * 100;

    return (
      <div
        style={{
          position: "relative",
          height: Math.max(16, bars.length * 10 + 4),
          background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
          borderRadius: 4,
          overflow: "hidden",
          marginTop: 6,
        }}
      >
        {/* Today marker */}
        <div
          style={{
            position: "absolute",
            left: `${todayPos}%`,
            top: 0,
            bottom: 0,
            width: 1,
            background: C.accent,
            opacity: 0.5,
            zIndex: 2,
          }}
        />
        {bars.map((bar, i) => (
          <div
            key={bar.id}
            title={bar.name}
            style={{
              position: "absolute",
              left: `${bar.left}%`,
              width: `${bar.width}%`,
              top: 2 + i * 10,
              height: 7,
              borderRadius: 3,
              background: color,
              opacity: bar.status === "Submitted" ? 0.5 : 0.8,
            }}
          />
        ))}
      </div>
    );
  };

  const ov = a => (C.isDark ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);

  return (
    <div style={{ marginTop: T.space[6] }}>
      {/* Section Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.space[4] }}>
        <div>
          <h3 style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text, margin: 0 }}>
            Estimators
          </h3>
          <p style={{ fontSize: T.fontSize.xs, color: C.textMuted, marginTop: 2 }}>
            Manage your estimating team and track their workload
          </p>
        </div>
        <button
          onClick={() => {
            setFormColor(TEAM_COLORS[estimators.length % TEAM_COLORS.length]);
            setShowForm(true);
            setEditId(null);
            setFormName("");
            setFormEmail("");
          }}
          style={{
            ...bt(C),
            padding: "8px 16px",
            fontSize: T.fontSize.xs,
            fontWeight: 600,
            color: "#fff",
            background: C.accent,
            borderRadius: T.radius.sm,
          }}
        >
          <Ic d={I.plus} size={13} /> Add Estimator
        </button>
      </div>

      {/* Estimator List */}
      {estimators.length === 0 && !showForm && (
        <div
          style={{
            ...cardSolid(C),
            padding: `${T.space[6]}px`,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: T.fontSize.md, color: C.textMuted, marginBottom: 4 }}>No estimators added yet</div>
          <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
            Add estimators to track assignments and workload in the Resource page
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: T.space[3] }}>
        {estimators.map(est => {
          const stats = getEstimatorStats(est.name);
          const color = est.color || TEAM_COLORS[0];
          return (
            <div
              key={est.id}
              style={{
                ...cardSolid(C),
                padding: `${T.space[3]}px ${T.space[4]}px`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
                {/* Avatar */}
                <Avatar name={est.name} color={color} size={36} fontSize={13} />

                {/* Name & Email */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.semibold, color: C.text }}>
                    {est.name}
                  </div>
                  {est.email && (
                    <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, marginTop: 1 }}>{est.email}</div>
                  )}
                </div>

                {/* Invite Status Badge */}
                {org && isManager && (() => {
                  const invStatus = getInviteStatus(est.email);
                  if (!est.email) {
                    return (
                      <div style={{
                        fontSize: 10, color: C.textDim, fontStyle: "italic",
                        padding: "3px 10px", borderRadius: 12,
                        background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                      }}>
                        No email — local only
                      </div>
                    );
                  }
                  if (!invStatus) {
                    return (
                      <button
                        onClick={() => handleInvite(est.email, est.name)}
                        disabled={inviting === est.email}
                        style={{
                          ...bt(C),
                          padding: "5px 14px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#fff",
                          background: inviting === est.email ? C.textDim : C.accent,
                          borderRadius: 20,
                          opacity: inviting === est.email ? 0.6 : 1,
                          cursor: inviting === est.email ? "wait" : "pointer",
                        }}
                      >
                        {inviting === est.email ? "Sending..." : "Invite to Platform"}
                      </button>
                    );
                  }
                  if (invStatus.status === "active" || invStatus.status === "accepted") {
                    return (
                      <div style={{
                        fontSize: 10, fontWeight: 600, color: "#34D399",
                        padding: "3px 10px", borderRadius: 12,
                        background: "rgba(52,211,153,0.12)",
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34D399" }} />
                        Active
                      </div>
                    );
                  }
                  if (invStatus.status === "pending") {
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{
                          fontSize: 10, fontWeight: 600, color: "#FBBF24",
                          padding: "3px 10px", borderRadius: 12,
                          background: "rgba(251,191,36,0.12)",
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#FBBF24" }} />
                          Pending
                        </div>
                        <button
                          onClick={() => handleResendInvite(est.email, est.name, invStatus.inv?.id)}
                          disabled={inviting === est.email}
                          style={{
                            ...bt(C),
                            padding: "3px 8px",
                            fontSize: 10,
                            color: C.accent,
                            background: "transparent",
                            borderRadius: 10,
                            textDecoration: "underline",
                            cursor: inviting === est.email ? "wait" : "pointer",
                          }}
                        >
                          {inviting === est.email ? "..." : "Resend"}
                        </button>
                      </div>
                    );
                  }
                  if (invStatus.status === "expired") {
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{
                          fontSize: 10, fontWeight: 600, color: C.textDim,
                          padding: "3px 10px", borderRadius: 12,
                          background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                        }}>
                          Expired
                        </div>
                        <button
                          onClick={() => handleResendInvite(est.email, est.name, invStatus.inv?.id)}
                          disabled={inviting === est.email}
                          style={{
                            ...bt(C),
                            padding: "3px 8px",
                            fontSize: 10,
                            color: C.accent,
                            background: "transparent",
                            borderRadius: 10,
                            textDecoration: "underline",
                            cursor: inviting === est.email ? "wait" : "pointer",
                          }}
                        >
                          {inviting === est.email ? "..." : "Re-invite"}
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Stats */}
                <div style={{ display: "flex", gap: T.space[4], alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: T.fontSize.md, fontWeight: T.fontWeight.bold, color: C.text }}>
                      {stats.activeCount}
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Active
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: T.fontSize.md, fontWeight: T.fontWeight.bold, color: C.text }}>
                      {stats.totalHours || "—"}
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Hours
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: T.fontSize.md, fontWeight: T.fontWeight.bold, color: C.text }}>
                      {stats.hoursLogged || "—"}
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Logged
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: T.space[1] }}>
                  <button
                    onClick={() => handleEdit(est)}
                    style={{
                      ...bt(C),
                      padding: "6px 8px",
                      color: C.textMuted,
                      background: "transparent",
                      borderRadius: T.radius.sm,
                    }}
                    title="Edit"
                  >
                    <Ic d={I.edit} size={14} />
                  </button>
                  <button
                    onClick={() => handleRemove(est.id)}
                    style={{
                      ...bt(C),
                      padding: "6px 8px",
                      color: C.red,
                      background: "transparent",
                      borderRadius: T.radius.sm,
                    }}
                    title="Remove"
                  >
                    <Ic d={I.trash} size={14} />
                  </button>
                </div>
              </div>

              {/* Mini Gantt */}
              <MiniGantt estimatorName={est.name} color={color} />

              {/* Experience Pills — top 3 job types */}
              <ExperiencePills estimatorName={est.name} estimates={estimatesIndex} C={C} T={T} />
            </div>
          );
        })}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div
          style={{
            ...cardSolid(C),
            padding: `${T.space[4]}px`,
            marginTop: T.space[3],
            border: `1px solid ${C.accent}30`,
          }}
        >
          <div
            style={{
              fontSize: T.fontSize.sm,
              fontWeight: T.fontWeight.semibold,
              color: C.text,
              marginBottom: T.space[3],
            }}
          >
            {editId ? "Edit Estimator" : "New Estimator"}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[3], marginBottom: T.space[3] }}>
            <div>
              <label style={{ fontSize: T.fontSize.xs, color: C.textMuted, display: "block", marginBottom: 4 }}>
                Name
              </label>
              <input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Full name"
                style={inp(C)}
                autoFocus
              />
            </div>
            <div>
              <label style={{ fontSize: T.fontSize.xs, color: C.textMuted, display: "block", marginBottom: 4 }}>
                Email
              </label>
              <input
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                placeholder="email@company.com"
                style={inp(C)}
              />
            </div>
          </div>

          {/* Color Picker */}
          <div style={{ marginBottom: T.space[3] }}>
            <label style={{ fontSize: T.fontSize.xs, color: C.textMuted, display: "block", marginBottom: 4 }}>
              Color
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              {TEAM_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setFormColor(c)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: c,
                    border: formColor === c ? `2px solid ${C.text}` : `2px solid transparent`,
                    cursor: "pointer",
                    outline: "none",
                    transition: "border-color 150ms",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Daily Capacity */}
          <div style={{ marginBottom: T.space[3] }}>
            <label style={{ fontSize: T.fontSize.xs, color: C.textMuted, display: "block", marginBottom: 4 }}>
              Max Hours/Day
            </label>
            <input
              type="number"
              min={1}
              max={12}
              step={0.5}
              value={formMaxHours}
              onChange={e => setFormMaxHours(e.target.value)}
              style={{ ...inp(C), width: 80 }}
            />
          </div>

          {/* Preferred Job Types */}
          {allJobTypes.length > 0 && (
            <div style={{ marginBottom: T.space[3] }}>
              <label style={{ fontSize: T.fontSize.xs, color: C.textMuted, display: "block", marginBottom: 4 }}>
                Preferred Job Types
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {allJobTypes.map(jt => {
                  const active = formPreferredTypes.includes(jt);
                  return (
                    <button
                      key={jt}
                      type="button"
                      onClick={() => {
                        setFormPreferredTypes(prev => (active ? prev.filter(t => t !== jt) : [...prev, jt]));
                      }}
                      style={{
                        ...bt(C),
                        padding: "4px 10px",
                        fontSize: 10,
                        fontWeight: active ? 600 : 400,
                        color: active ? "#fff" : C.textMuted,
                        background: active ? C.accent : C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                        border: `1px solid ${active ? C.accent : C.border}`,
                        borderRadius: 20,
                        transition: "all 120ms",
                      }}
                    >
                      {jt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: T.space[3] }}>
            <label style={{ fontSize: T.fontSize.xs, color: C.textMuted, display: "block", marginBottom: 4 }}>
              Notes
            </label>
            <textarea
              value={formNotes}
              onChange={e => setFormNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={2}
              style={{ ...inp(C), resize: "vertical", minHeight: 50, fontFamily: "inherit" }}
            />
          </div>

          {/* Preview */}
          {formName && (
            <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[3] }}>
              <Avatar name={formName} color={formColor} size={28} fontSize={11} />
              <span style={{ fontSize: T.fontSize.sm, color: C.text }}>
                {formName} ({getInitials(formName)})
              </span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: T.space[2], justifyContent: "flex-end" }}>
            <button
              onClick={resetForm}
              style={{
                ...bt(C),
                padding: "7px 16px",
                fontSize: T.fontSize.xs,
                color: C.textMuted,
                background: ov(0.04),
                border: `1px solid ${C.border}`,
                borderRadius: T.radius.sm,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!formName.trim()}
              style={{
                ...bt(C),
                padding: "7px 16px",
                fontSize: T.fontSize.xs,
                fontWeight: 600,
                color: "#fff",
                background: formName.trim() ? C.accent : C.textDim,
                borderRadius: T.radius.sm,
                opacity: formName.trim() ? 1 : 0.5,
              }}
            >
              {editId ? "Update" : "Add Estimator"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
