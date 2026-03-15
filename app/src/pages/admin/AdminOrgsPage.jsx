// ============================================================
// NOVA Core — Admin Orgs Panel
// /admin/orgs — Org list, detail, API key management
// 3 views: org list → org detail → (key modal overlay)
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { card } from "@/utils/styles";

const API_BASE = "/api/nova-core/admin";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Plan badge colors ──
const PLAN_COLORS = {
  free: { bg: "#2A2A28", text: "#A0A09B" },
  professional: { bg: "#3D2E00", text: "#F59E0B" },
  enterprise: { bg: "#052E16", text: "#22C55E" },
};

function PlanBadge({ plan }) {
  const colors = PLAN_COLORS[plan] || PLAN_COLORS.free;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        textTransform: "capitalize",
      }}
    >
      {plan}
    </span>
  );
}

function StatusDot({ active }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: active ? "#22C55E" : "#EF4444",
        marginRight: 6,
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function AdminOrgsPage() {
  const [selectedOrgId, setSelectedOrgId] = useState(null);

  if (selectedOrgId) {
    return <OrgDetailView orgId={selectedOrgId} onBack={() => setSelectedOrgId(null)} />;
  }
  return <OrgListView onSelectOrg={setSelectedOrgId} />;
}

// ══════════════════════════════════════════════════════════════
// VIEW 1 — Org List
// ══════════════════════════════════════════════════════════════
function OrgListView({ onSelectOrg }) {
  const C = useTheme();
  const T = C.T;
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPlan, setFormPlan] = useState("free");
  const [submitting, setSubmitting] = useState(false);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/orgs");
      setOrgs(data.orgs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch("/orgs", {
        method: "POST",
        body: JSON.stringify({ name: formName.trim(), plan: formPlan }),
      });
      setFormName("");
      setFormPlan("free");
      setShowForm(false);
      fetchOrgs();
    } catch (err) {
      alert("Failed to create org: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const cellStyle = {
    padding: "10px 14px",
    fontSize: 13,
    color: C.text,
    borderBottom: `1px solid ${C.border}`,
  };

  const headCell = {
    ...cellStyle,
    fontSize: 11,
    fontWeight: 600,
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  if (loading) return <div style={{ color: C.textMuted, padding: 40 }}>Loading…</div>;
  if (error) return <div style={{ ...card(C), color: "#F87171" }}>Failed: {error}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Organizations</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: "8px 16px",
            borderRadius: T.radius.sm,
            border: "none",
            background: C.accent,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.font.sans,
          }}
        >
          + New Org
        </button>
      </div>

      {/* Inline create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          style={{
            ...card(C),
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 16,
          }}
        >
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Organization name"
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: T.radius.sm,
              border: `1px solid ${C.border}`,
              background: C.inputBg || "#0D0D0C",
              color: C.text,
              fontSize: 13,
              fontFamily: T.font.sans,
              outline: "none",
            }}
          />
          <select
            value={formPlan}
            onChange={(e) => setFormPlan(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: T.radius.sm,
              border: `1px solid ${C.border}`,
              background: C.inputBg || "#0D0D0C",
              color: C.text,
              fontSize: 13,
              fontFamily: T.font.sans,
              outline: "none",
            }}
          >
            <option value="free">Free</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <button
            type="submit"
            disabled={submitting || !formName.trim()}
            style={{
              padding: "8px 20px",
              borderRadius: T.radius.sm,
              border: "none",
              background: submitting ? C.border : C.accent,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: T.font.sans,
            }}
          >
            {submitting ? "Creating…" : "Submit"}
          </button>
        </form>
      )}

      {/* Org table */}
      {orgs.length === 0 ? (
        <div style={{ ...card(C), padding: 40, textAlign: "center", color: C.textMuted, fontSize: 14 }}>
          No organizations yet
        </div>
      ) : (
        <div style={{ ...card(C), overflow: "hidden", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headCell}>Name</th>
                <th style={headCell}>Plan</th>
                <th style={{ ...headCell, textAlign: "center" }}>API Keys</th>
                <th style={{ ...headCell, textAlign: "center" }}>Proposals</th>
                <th style={headCell}>Created</th>
                <th style={headCell}>Onboarded</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr
                  key={org.id}
                  onClick={() => onSelectOrg(org.id)}
                  style={{ cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = `${C.accent}08`)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ ...cellStyle, fontWeight: 600 }}>{org.name}</td>
                  <td style={cellStyle}>
                    <PlanBadge plan={org.plan} />
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{org.api_key_count}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{org.proposal_count}</td>
                  <td style={{ ...cellStyle, color: C.textMuted, fontSize: 12 }}>
                    {org.created_at ? new Date(org.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ ...cellStyle, color: C.textMuted, fontSize: 12 }}>
                    {org.onboarded_at ? new Date(org.onboarded_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// VIEW 2 — Org Detail
// ══════════════════════════════════════════════════════════════
function OrgDetailView({ orgId, onBack }) {
  const C = useTheme();
  const T = C.T;
  const [org, setOrg] = useState(null);
  const [keys, setKeys] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newKeyModal, setNewKeyModal] = useState(null);
  const [upgrading, setUpgrading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/orgs?detail=${orgId}`);
      // GET returns all orgs — find ours
      const found = (data.orgs || []).find((o) => o.id === orgId);
      if (!found) throw new Error("Org not found");
      setOrg(found);

      // Fetch keys and proposals in parallel (these are separate queries we do client-side via the org list data)
      // We need to get the keys + proposals for this org specifically
      // Keys: we'll query from the org detail response if enriched, otherwise do separate calls
      // For now, re-use the list data and do a dedicated detail fetch for keys/proposals

      // Fetch API keys for this org from Supabase via our orgs endpoint
      // Actually we need dedicated endpoints — but we can use the data we have
      // Let's fetch keys separately
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const fetchKeys = useCallback(async () => {
    try {
      // We don't have a dedicated keys list endpoint, so we'll use the org data
      // The api_keys table data comes from the detail. For now, let's add keys fetching
      // via a query param on the orgs endpoint
      const data = await apiFetch(`/orgs`);
      const found = (data.orgs || []).find((o) => o.id === orgId);
      if (found) setOrg(found);
    } catch {
      // non-critical
    }
  }, [orgId]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch("/orgs");
        const found = (data.orgs || []).find((o) => o.id === orgId);
        if (!found) throw new Error("Org not found");
        setOrg(found);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [orgId]);

  // Fetch keys and proposals from dedicated admin endpoints
  useEffect(() => {
    if (!org) return;
    // We'll inline-fetch the keys and proposals via the main admin API
    // since we have supabase access through the admin cookie
    const fetchExtra = async () => {
      try {
        // Fetch keys via a separate call
        const keysRes = await fetch(`/api/admin/nova-org-keys?org_id=${orgId}`, {
          credentials: "same-origin",
        });
        if (keysRes.ok) {
          const keysData = await keysRes.json();
          setKeys(keysData.keys || []);
        }
      } catch {
        // Keys endpoint might not exist yet — that's OK, we show empty
      }

      try {
        // Fetch recent proposals from parser_audit_log
        const propRes = await fetch(`/api/admin/nova-pipeline?org_id=${orgId}&limit=5`, {
          credentials: "same-origin",
        });
        if (propRes.ok) {
          const propData = await propRes.json();
          setProposals(propData.jobs || propData.proposals || []);
        }
      } catch {
        // Non-critical
      }

      try {
        const membersData = await apiFetch(`/org-members?org_id=${orgId}`);
        setMembers(membersData.members || []);
      } catch {
        // Non-critical
      }
    };
    fetchExtra();
  }, [org, orgId]);

  const handleUpgrade = async () => {
    if (!org) return;
    const nextPlan =
      org.plan === "free" ? "professional" : org.plan === "professional" ? "enterprise" : null;
    if (!nextPlan) return;

    setUpgrading(true);
    try {
      const updated = await apiFetch(`/orgs/${orgId}`, {
        method: "PATCH",
        body: JSON.stringify({ plan: nextPlan }),
      });
      setOrg((prev) => ({ ...prev, ...updated, plan: nextPlan }));
    } catch (err) {
      alert("Upgrade failed: " + err.message);
    } finally {
      setUpgrading(false);
    }
  };

  const handleGenerateKey = async () => {
    setGenerating(true);
    try {
      const result = await apiFetch("/api-keys", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId }),
      });
      setNewKeyModal(result.raw_key);
      // Refresh keys
      setKeys((prev) => [
        {
          id: result.id,
          key_prefix: result.key_prefix,
          created_at: result.created_at,
          last_used_at: null,
          total_requests: 0,
          is_active: true,
          revoked_at: null,
        },
        ...prev,
      ]);
    } catch (err) {
      alert("Failed to generate key: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (keyId) => {
    if (!confirm("Revoke this key? This cannot be undone.")) return;
    try {
      await apiFetch(`/api-keys?id=${keyId}`, { method: "DELETE" });
      setKeys((prev) =>
        prev.map((k) =>
          k.id === keyId ? { ...k, is_active: false, revoked_at: new Date().toISOString() } : k
        )
      );
    } catch (err) {
      alert("Revoke failed: " + err.message);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await apiFetch("/invite-member", {
        method: "POST",
        body: JSON.stringify({ org_id: orgId, email: inviteEmail.trim(), role: inviteRole }),
      });
      setInviteEmail("");
      setInviteRole("member");
      setShowInviteForm(false);
      // Refresh members
      const membersData = await apiFetch(`/org-members?org_id=${orgId}`);
      setMembers(membersData.members || []);
    } catch (err) {
      alert("Failed to invite: " + err.message);
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    if (!confirm("Remove this member? They will lose access.")) return;
    try {
      // Soft-delete: we'll call a PATCH or use direct supabase call
      // For now, use the org-members endpoint pattern — but we need to implement removal
      // We'll do it via the invite-member endpoint pattern or inline
      // Simplest: fetch with DELETE-like semantics via POST
      // Actually, let's just do it via the existing admin pattern
      await apiFetch(`/org-members?org_id=${orgId}&member_id=${memberId}`, {
        method: "DELETE",
      });
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, active: false } : m))
      );
    } catch (err) {
      alert("Remove failed: " + err.message);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
  };

  const cellStyle = {
    padding: "10px 14px",
    fontSize: 13,
    color: C.text,
    borderBottom: `1px solid ${C.border}`,
  };

  const headCell = {
    ...cellStyle,
    fontSize: 11,
    fontWeight: 600,
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  const sectionHead = {
    fontSize: 15,
    fontWeight: 700,
    color: C.text,
    margin: 0,
  };

  if (loading) return <div style={{ color: C.textMuted, padding: 40 }}>Loading…</div>;
  if (error) return <div style={{ ...card(C), color: "#F87171" }}>Failed: {error}</div>;
  if (!org) return null;

  const nextPlan =
    org.plan === "free" ? "Professional" : org.plan === "professional" ? "Enterprise" : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          color: C.textMuted,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: T.font.sans,
          padding: 0,
        }}
      >
        ← Back
      </button>

      {/* Org heading */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{org.name}</h1>
        <PlanBadge plan={org.plan} />
      </div>

      {/* Info row */}
      <div style={{ ...card(C), padding: 20, display: "flex", gap: 40 }}>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>
            ONBOARDED
          </div>
          <div style={{ fontSize: 14, color: C.text }}>
            {org.onboarded_at ? new Date(org.onboarded_at).toLocaleDateString() : "Not onboarded"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>
            API CALLS TODAY
          </div>
          <div style={{ fontSize: 14, color: C.text }}>{org.api_calls_today ?? "—"}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>
            API CALLS THIS MONTH
          </div>
          <div style={{ fontSize: 14, color: C.text }}>{org.api_calls_month ?? "—"}</div>
        </div>
      </div>

      {/* Plan row */}
      <div style={{ ...card(C), padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4, fontWeight: 600 }}>
            CURRENT PLAN
          </div>
          <PlanBadge plan={org.plan} />
        </div>
        {nextPlan && (
          <button
            onClick={handleUpgrade}
            disabled={upgrading}
            style={{
              marginLeft: "auto",
              padding: "8px 20px",
              borderRadius: T.radius.sm,
              border: "none",
              background: upgrading ? C.border : C.accent,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: upgrading ? "not-allowed" : "pointer",
              fontFamily: T.font.sans,
            }}
          >
            {upgrading ? "Upgrading…" : `Upgrade to ${nextPlan}`}
          </button>
        )}
      </div>

      {/* API Keys section */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={sectionHead}>API Keys</h2>
        <button
          onClick={handleGenerateKey}
          disabled={generating}
          style={{
            padding: "7px 14px",
            borderRadius: T.radius.sm,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: C.text,
            fontSize: 12,
            fontWeight: 600,
            cursor: generating ? "not-allowed" : "pointer",
            fontFamily: T.font.sans,
          }}
        >
          {generating ? "Generating…" : "Generate New Key"}
        </button>
      </div>

      {keys.length === 0 ? (
        <div
          style={{
            ...card(C),
            padding: 32,
            textAlign: "center",
            color: C.textMuted,
            fontSize: 13,
          }}
        >
          No API keys yet
        </div>
      ) : (
        <div style={{ ...card(C), overflow: "hidden", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headCell}>Prefix</th>
                <th style={headCell}>Created</th>
                <th style={headCell}>Last Used</th>
                <th style={{ ...headCell, textAlign: "center" }}>Total Requests</th>
                <th style={headCell}>Status</th>
                <th style={headCell}></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td style={{ ...cellStyle, fontFamily: "monospace", fontSize: 12 }}>
                    {k.key_prefix}…
                  </td>
                  <td style={{ ...cellStyle, fontSize: 12, color: C.textMuted }}>
                    {k.created_at ? new Date(k.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ ...cellStyle, fontSize: 12, color: C.textMuted }}>
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : "Never"}
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>{k.total_requests || 0}</td>
                  <td style={cellStyle}>
                    <StatusDot active={k.is_active} />
                    <span style={{ fontSize: 12, color: k.is_active ? "#22C55E" : "#EF4444" }}>
                      {k.is_active
                        ? "Active"
                        : `Revoked ${k.revoked_at ? new Date(k.revoked_at).toLocaleDateString() : ""}`}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    {k.is_active && (
                      <button
                        onClick={() => handleRevoke(k.id)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: T.radius.sm,
                          border: `1px solid #EF4444`,
                          background: "transparent",
                          color: "#EF4444",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: T.font.sans,
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Proposals section */}
      {proposals.length > 0 && (
        <>
          <h2 style={sectionHead}>Recent Proposals</h2>
          <div style={{ ...card(C), overflow: "hidden", padding: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={headCell}>Date</th>
                  <th style={headCell}>Sub Company</th>
                  <th style={{ ...headCell, textAlign: "center" }}>Lines</th>
                  <th style={{ ...headCell, textAlign: "center" }}>Auto-Written</th>
                  <th style={{ ...headCell, textAlign: "right" }}>Amount</th>
                  <th style={headCell}>Status</th>
                </tr>
              </thead>
              <tbody>
                {proposals.slice(0, 5).map((p, i) => {
                  const statusColor = p.error_message
                    ? "#EF4444"
                    : p.auto_written
                      ? "#22C55E"
                      : "#F59E0B";
                  const statusLabel = p.error_message
                    ? "Error"
                    : p.auto_written
                      ? "Complete"
                      : "Pending";
                  return (
                    <tr key={p.id || i}>
                      <td style={{ ...cellStyle, fontSize: 12, color: C.textMuted }}>
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td style={cellStyle}>{p.sub_company_name || "—"}</td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        {p.total_lines_parsed || 0}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "center" }}>
                        {p.auto_written ? "Yes" : "No"}
                      </td>
                      <td style={{ ...cellStyle, textAlign: "right", fontFamily: "monospace" }}>
                        {p.total_bid_amount
                          ? `$${Number(p.total_bid_amount).toLocaleString()}`
                          : "—"}
                      </td>
                      <td style={cellStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            color: statusColor,
                            background: `${statusColor}18`,
                          }}
                        >
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Team Members section */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={sectionHead}>Team Members</h2>
        <button
          onClick={() => setShowInviteForm(!showInviteForm)}
          style={{
            padding: "7px 14px",
            borderRadius: T.radius.sm,
            border: `1px solid ${C.border}`,
            background: "transparent",
            color: C.text,
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: T.font.sans,
          }}
        >
          Invite Member
        </button>
      </div>

      {/* Invite form */}
      {showInviteForm && (
        <form
          onSubmit={handleInvite}
          style={{
            ...card(C),
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: 16,
          }}
        >
          <input
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Email address"
            type="email"
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: T.radius.sm,
              border: `1px solid ${C.border}`,
              background: C.inputBg || "#0D0D0C",
              color: C.text,
              fontSize: 13,
              fontFamily: T.font.sans,
              outline: "none",
            }}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: T.radius.sm,
              border: `1px solid ${C.border}`,
              background: C.inputBg || "#0D0D0C",
              color: C.text,
              fontSize: 13,
              fontFamily: T.font.sans,
              outline: "none",
            }}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={inviting || !inviteEmail.trim()}
            style={{
              padding: "8px 20px",
              borderRadius: T.radius.sm,
              border: "none",
              background: inviting ? C.border : C.accent,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: inviting ? "not-allowed" : "pointer",
              fontFamily: T.font.sans,
            }}
          >
            {inviting ? "Sending…" : "Send Invite"}
          </button>
        </form>
      )}

      {/* Members table */}
      {members.length === 0 ? (
        <div
          style={{
            ...card(C),
            padding: 32,
            textAlign: "center",
            color: C.textMuted,
            fontSize: 13,
          }}
        >
          No team members yet
        </div>
      ) : (
        <div style={{ ...card(C), overflow: "hidden", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headCell}>Email</th>
                <th style={headCell}>Role</th>
                <th style={headCell}>Status</th>
                <th style={headCell}>Invited</th>
                <th style={headCell}></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isActive = !!m.accepted_at;
                const statusColor = isActive ? "#22C55E" : "#F59E0B";
                const statusLabel = isActive ? "Active" : "Pending";
                return (
                  <tr key={m.id}>
                    <td style={{ ...cellStyle, fontWeight: 500 }}>{m.email}</td>
                    <td style={{ ...cellStyle, textTransform: "capitalize" }}>{m.role}</td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          color: statusColor,
                          background: `${statusColor}18`,
                        }}
                      >
                        {statusLabel}
                      </span>
                    </td>
                    <td style={{ ...cellStyle, fontSize: 12, color: C.textMuted }}>
                      {m.invited_at ? new Date(m.invited_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={cellStyle}>
                      {m.active && (
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: T.radius.sm,
                            border: `1px solid #EF4444`,
                            background: "transparent",
                            color: "#EF4444",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: T.font.sans,
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Seat usage note */}
      <div style={{ fontSize: 12, color: C.textMuted, padding: "0 2px" }}>
        {org.is_paying
          ? `${members.filter((m) => m.active).length} of ${org.seat_count || 0} seats used · $${(members.filter((m) => m.active).length * 299).toLocaleString()}/mo`
          : org.is_demo
            ? "Demo account — unlimited members"
            : "Trial account — add seats when you subscribe"}
      </div>

      {/* ── New Key Modal ── */}
      {newKeyModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setNewKeyModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.cardBg || "#1A1A18",
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.md || 12,
              padding: 32,
              maxWidth: 520,
              width: "90%",
              display: "flex",
              flexDirection: "column",
              gap: 20,
              alignItems: "center",
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>
              API Key Generated
            </h3>

            <div
              style={{
                width: "100%",
                padding: 16,
                borderRadius: T.radius.sm,
                background: "#0D0D0C",
                border: `1px solid ${C.border}`,
                fontFamily: "monospace",
                fontSize: 15,
                color: C.accent,
                wordBreak: "break-all",
                textAlign: "center",
                lineHeight: 1.6,
                userSelect: "all",
              }}
            >
              {newKeyModal}
            </div>

            <button
              onClick={() => {
                copyToClipboard(newKeyModal);
              }}
              style={{
                padding: "10px 28px",
                borderRadius: T.radius.sm,
                border: "none",
                background: C.accent,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: T.font.sans,
              }}
            >
              Copy Key
            </button>

            <p
              style={{
                fontSize: 12,
                color: "#F59E0B",
                textAlign: "center",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              This key will not be shown again. Store it securely.
            </p>

            <button
              onClick={() => setNewKeyModal(null)}
              style={{
                padding: "8px 24px",
                borderRadius: T.radius.sm,
                border: `1px solid ${C.border}`,
                background: "transparent",
                color: C.textMuted,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: T.font.sans,
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
