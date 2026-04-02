/**
 * AdminInvitesPage — Manage beta invite links.
 * Generate, copy, revoke invite tokens.
 */
import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/utils/supabase";
import { bt, inp, card } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { uid } from "@/utils/format";

const STATUS_COLORS = {
  pending: "#F59E0B",
  accepted: "#22C55E",
  revoked: "#EF4444",
  expired: "#6B7280",
};

export default function AdminInvitesPage() {
  const C = useTheme();
  const T = C.T;
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("estimator");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => { loadInvites(); }, []);

  const loadInvites = async () => {
    setLoading(true);
    try {
      // Try org_invitations first, fall back to beta_invites
      const { data } = await supabase
        .from("org_invitations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      setInvites(data || []);
    } catch { setInvites([]); }
    setLoading(false);
  };

  const createInvite = async () => {
    if (!newEmail.trim()) return;
    setCreating(true);
    try {
      const token = uid() + uid();
      const { data } = await supabase.from("org_invitations").insert({
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        token,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), // 7 days
        org_id: (await supabase.auth.getUser())?.data?.user?.app_metadata?.org_id || null,
      }).select().single();
      if (data) setInvites(prev => [data, ...prev]);
      setNewEmail("");
    } catch { /* invite create error */ }
    setCreating(false);
  };

  const revokeInvite = async (id) => {
    try {
      await supabase.from("org_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      setInvites(prev => prev.map(inv => inv.id === id ? { ...inv, revoked_at: new Date().toISOString() } : inv));
    } catch { /* non-critical */ }
  };

  const copyLink = (token) => {
    const url = `${window.location.origin}/login?invite=${token}`;
    navigator.clipboard?.writeText(url);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatus = (inv) => {
    if (inv.revoked_at) return "revoked";
    if (inv.accepted_at) return "accepted";
    if (inv.expires_at && new Date(inv.expires_at) < new Date()) return "expired";
    return "pending";
  };

  return (
    <div style={{ padding: T.space[4], maxWidth: 800 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: T.space[3] }}>
        Beta Invites ({invites.length})
      </h2>

      {/* New invite form */}
      <div style={{ ...card(C), padding: T.space[3], marginBottom: T.space[3], display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder="Email address"
          style={{ ...inp(C, { padding: "6px 12px", fontSize: 11, width: 220, borderRadius: 6 }) }}
          onKeyDown={e => e.key === "Enter" && createInvite()}
        />
        <select
          value={newRole}
          onChange={e => setNewRole(e.target.value)}
          style={{ ...inp(C, { padding: "6px 8px", fontSize: 11, width: "auto", borderRadius: 6 }) }}
        >
          <option value="estimator">Estimator</option>
          <option value="manager">Manager</option>
          <option value="client">Client (View Only)</option>
        </select>
        <button
          onClick={createInvite}
          disabled={creating || !newEmail.trim()}
          style={bt(C, {
            padding: "6px 14px", fontSize: 11, fontWeight: 600,
            background: C.accent, color: "#fff",
            opacity: creating || !newEmail.trim() ? 0.5 : 1,
          })}
        >
          <Ic d={I.send} size={10} color="#fff" /> {creating ? "Creating..." : "Create Invite"}
        </button>
      </div>

      {/* Invite list */}
      {loading ? (
        <div style={{ color: C.textDim, fontSize: 12 }}>Loading invites...</div>
      ) : invites.length === 0 ? (
        <div style={{ color: C.textDim, fontSize: 12, padding: T.space[4], textAlign: "center" }}>
          No invites yet. Create one above.
        </div>
      ) : (
        <div style={{ ...card(C), padding: 0, overflow: "hidden" }}>
          {invites.map(inv => {
            const status = getStatus(inv);
            return (
              <div
                key={inv.id}
                style={{
                  display: "flex", alignItems: "center", gap: T.space[2],
                  padding: `${T.space[2]}px ${T.space[3]}px`,
                  borderBottom: `1px solid ${C.border}06`,
                  fontSize: 11,
                }}
              >
                {/* Status pill */}
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                  background: `${STATUS_COLORS[status]}18`,
                  color: STATUS_COLORS[status],
                  textTransform: "uppercase", minWidth: 55, textAlign: "center",
                }}>
                  {status}
                </span>
                {/* Email */}
                <span style={{ color: C.text, fontWeight: 500, minWidth: 180 }}>{inv.email}</span>
                {/* Role */}
                <span style={{ color: C.textDim, fontSize: 9, minWidth: 60 }}>{inv.role}</span>
                {/* Created */}
                <span style={{ color: C.textDim, fontSize: 9, flex: 1 }}>
                  {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : ""}
                </span>
                {/* Accepted */}
                {inv.accepted_at && (
                  <span style={{ color: C.green, fontSize: 9 }}>
                    Accepted {new Date(inv.accepted_at).toLocaleDateString()}
                  </span>
                )}
                {/* Actions */}
                {status === "pending" && (
                  <>
                    <button
                      onClick={() => copyLink(inv.token)}
                      style={bt(C, { padding: "3px 8px", fontSize: 8, color: copiedId === inv.token ? C.green : C.accent })}
                    >
                      {copiedId === inv.token ? "Copied!" : "Copy Link"}
                    </button>
                    <button
                      onClick={() => revokeInvite(inv.id)}
                      style={bt(C, { padding: "3px 8px", fontSize: 8, color: C.red || "#EF4444" })}
                    >
                      Revoke
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
