import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useOrgStore, TEAM_COLORS, selectIsManager } from "@/stores/orgStore";
import { useAuthStore } from "@/stores/authStore";
import { useAllEstimatorStats } from "@/hooks/useEstimatorStats";
import Sec from "@/components/shared/Sec";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";

export default function TeamPanel() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);

  const user = useAuthStore(s => s.user);
  const org = useOrgStore(s => s.org);
  const membership = useOrgStore(s => s.membership);
  const members = useOrgStore(s => s.members);
  const invitations = useOrgStore(s => s.invitations);
  const createOrg = useOrgStore(s => s.createOrg);
  const inviteMember = useOrgStore(s => s.inviteMember);
  const updateProfile = useOrgStore(s => s.updateProfile);
  const removeMember = useOrgStore(s => s.removeMember);
  const revokeInvitation = useOrgStore(s => s.revokeInvitation);

  const isManager = useOrgStore(selectIsManager);
  const allStats = useAllEstimatorStats();

  const [orgName, setOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("estimator");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(membership?.display_name || "");

  // Sync displayName when membership loads asynchronously
  useEffect(() => {
    if (membership?.display_name) setDisplayName(membership.display_name);
  }, [membership?.display_name]);

  // ── No org yet — show create form ──
  if (!org) {
    return (
      <Sec title="Team / Organization">
        <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 14, lineHeight: 1.6 }}>
          Create an organization to invite team members. Each estimator gets their own login, avatar, and color.
          Managers can monitor all estimators' work.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600, display: "block", marginBottom: 4 }}>
              Organization Name
            </label>
            <input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="e.g. Acme Construction"
              style={inp(C)}
            />
          </div>
          <button
            disabled={!orgName.trim() || loading}
            onClick={async () => {
              setLoading(true);
              setError("");
              const res = await createOrg(orgName.trim());
              setLoading(false);
              if (res.error) setError(res.error);
              else setOrgName("");
            }}
            style={bt(C, {
              background: C.accent,
              color: "#fff",
              padding: "8px 20px",
              fontSize: 11,
              fontWeight: 600,
              opacity: !orgName.trim() || loading ? 0.5 : 1,
            })}
          >
            {loading ? "Creating..." : "Create Organization"}
          </button>
        </div>
        {error && <div style={{ fontSize: 10, color: C.red, marginTop: 6 }}>{error}</div>}
      </Sec>
    );
  }

  const handleSaveName = async () => {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    const res = await updateProfile({ display_name: trimmed });
    if (!res.error) setEditingName(false);
    else setError(res.error);
  };

  const handleRemoveMember = async m => {
    if (!window.confirm(`Remove ${m.display_name || "this member"} from the organization?`)) return;
    const res = await removeMember(m.id);
    if (res.error) setError(res.error);
  };

  // Simple email format check
  const isValidEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  // ── Has org — show team management ──
  return (
    <Sec title={`Team — ${org.name}`}>
      {/* My Profile */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 8,
          }}
        >
          My Profile
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* Avatar circle */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: membership?.color || "#6366F1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
              flexShrink: 0,
            }}
          >
            {(membership?.display_name || user?.email || "?")[0].toUpperCase()}
          </div>

          {/* Name + role */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                  style={{ ...inp(C), fontSize: 12, padding: "4px 8px", flex: 1 }}
                />
                <button
                  onClick={handleSaveName}
                  style={{ ...bt(C), fontSize: 9, padding: "4px 10px", background: C.accent, color: "#fff" }}
                >
                  Save
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                  {membership?.display_name || "Set name"}
                </span>
                <button
                  onClick={() => {
                    setDisplayName(membership?.display_name || "");
                    setEditingName(true);
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                  aria-label="Edit display name"
                >
                  <Ic d={I.edit} size={10} color={C.textDim} />
                </button>
              </div>
            )}
            <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase", marginTop: 2 }}>
              {membership?.role} {user?.email && `· ${user.email}`}
            </div>
          </div>

          {/* Color picker */}
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 130 }}>
            {TEAM_COLORS.map(c => (
              <button
                key={c}
                onClick={() => updateProfile({ color: c })}
                aria-label={`Select color ${c}`}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: "none",
                  cursor: "pointer",
                  background: c,
                  transition: "transform 0.1s",
                  transform: membership?.color === c ? "scale(1.3)" : "scale(1)",
                  boxShadow: membership?.color === c ? `0 0 0 2px ${C.bg1}, 0 0 0 3px ${c}` : "none",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Members List (visible to managers) */}
      {isManager && members.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 8,
            }}
          >
            Members ({members.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {members.map(m => {
              const mStats = allStats[m.display_name] || {};
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: ov(0.02),
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: m.color || "#6366F1",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {(m.display_name || "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
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
                      {m.display_name || "Unnamed"}
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim, display: "flex", gap: 8, marginTop: 1 }}>
                      <span>{m.role}</span>
                      {mStats.totalEstimates > 0 && (
                        <>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span>{mStats.totalEstimates} estimate{mStats.totalEstimates !== 1 ? "s" : ""}</span>
                          {mStats.winRate != null && (
                            <>
                              <span style={{ opacity: 0.4 }}>·</span>
                              <span style={{ color: mStats.winRate >= 40 ? C.green : C.textDim }}>
                                {mStats.winRate}% win
                              </span>
                            </>
                          )}
                          {mStats.accuracy != null && (
                            <>
                              <span style={{ opacity: 0.4 }}>·</span>
                              <span style={{ color: mStats.accuracy <= 10 ? C.green : "#F59E0B" }}>
                                ±{mStats.accuracy}% accuracy
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {/* Hide remove for self and for the owner */}
                  {m.user_id !== user?.id && m.role !== "owner" && (
                    <button
                      onClick={() => handleRemoveMember(m)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
                      aria-label={`Remove ${m.display_name || "member"}`}
                    >
                      <Ic d={I.close} size={10} color={C.red} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Division Expertise Heat Map (managers only) */}
      {isManager && members.length > 0 && (() => {
        // Gather all divisions across all estimators
        const estimatorNames = members.map(m => m.display_name).filter(Boolean);
        const allDivs = new Set();
        for (const name of estimatorNames) {
          const s = allStats[name];
          if (s?.divisions) Object.keys(s.divisions).forEach(d => allDivs.add(d));
        }
        const divList = [...allDivs].sort();
        if (divList.length === 0) return null;

        const heatColor = (count, won) => {
          if (!count) return "transparent";
          const base = won > 0 ? "52,211,153" : "96,165,250"; // green if won, blue otherwise
          const alpha = count >= 5 ? 0.5 : count >= 3 ? 0.35 : 0.18;
          return `rgba(${base},${alpha})`;
        };

        return (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 8,
              }}
            >
              Division Expertise
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 9 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "4px 6px", color: C.textDim, fontWeight: 500 }} />
                    {divList.map(d => (
                      <th
                        key={d}
                        style={{
                          padding: "4px 3px",
                          color: C.textDim,
                          fontWeight: 500,
                          textAlign: "center",
                          whiteSpace: "nowrap",
                          maxWidth: 40,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={d}
                      >
                        {d.length > 5 ? d.slice(0, 5) : d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {estimatorNames.map(name => {
                    const s = allStats[name];
                    if (!s) return null;
                    return (
                      <tr key={name}>
                        <td
                          style={{
                            padding: "3px 6px",
                            color: C.text,
                            fontWeight: 500,
                            whiteSpace: "nowrap",
                            maxWidth: 100,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {name}
                        </td>
                        {divList.map(d => {
                          const dd = s.divisions?.[d];
                          return (
                            <td
                              key={d}
                              title={dd ? `${dd.count} est, ${dd.wonCount} won` : "—"}
                              style={{
                                padding: "3px 3px",
                                textAlign: "center",
                                background: heatColor(dd?.count, dd?.wonCount),
                                borderRadius: 3,
                                color: dd?.count ? C.text : "transparent",
                                fontWeight: 600,
                                minWidth: 28,
                              }}
                            >
                              {dd?.count || ""}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 8, color: C.textDim, marginTop: 6, display: "flex", gap: 12 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(52,211,153,0.5)", display: "inline-block" }} />
                5+ with wins
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(96,165,250,0.35)", display: "inline-block" }} />
                3-4
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(96,165,250,0.18)", display: "inline-block" }} />
                1-2
              </span>
            </div>
          </div>
        );
      })()}

      {/* Pending Invitations */}
      {isManager && invitations.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 8,
            }}
          >
            Pending Invitations
          </div>
          {invitations.map(inv => (
            <div
              key={inv.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 10px",
                borderRadius: 6,
                background: ov(0.02),
              }}
            >
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 11, color: C.text }}>{inv.email}</span>
                <span style={{ fontSize: 9, color: C.textDim, marginLeft: 8 }}>{inv.role}</span>
              </div>
              <button
                onClick={() => revokeInvitation(inv.id)}
                style={{ fontSize: 9, color: C.red, background: "none", border: "none", cursor: "pointer" }}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Invite Form (managers only) */}
      {isManager && (
        <div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: C.textDim,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 8,
            }}
          >
            Invite Team Member
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <input
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                type="email"
                style={inp(C)}
              />
            </div>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              style={{ ...inp(C), width: 120, fontSize: 11 }}
            >
              <option value="estimator">Estimator</option>
              <option value="manager">Manager</option>
            </select>
            <button
              disabled={!isValidEmail(inviteEmail.trim()) || loading}
              onClick={async () => {
                setLoading(true);
                setError("");
                const res = await inviteMember(inviteEmail.trim(), inviteRole);
                setLoading(false);
                if (res.error) setError(res.error);
                else {
                  setInviteEmail("");
                  setError("");
                }
              }}
              style={bt(C, {
                background: C.accent,
                color: "#fff",
                padding: "8px 16px",
                fontSize: 11,
                fontWeight: 600,
                opacity: !isValidEmail(inviteEmail.trim()) || loading ? 0.5 : 1,
              })}
            >
              {loading ? "Sending..." : "Invite"}
            </button>
          </div>
          {error && <div style={{ fontSize: 10, color: C.red, marginTop: 6 }}>{error}</div>}
        </div>
      )}
    </Sec>
  );
}
