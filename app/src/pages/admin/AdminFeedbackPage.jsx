/**
 * AdminFeedbackPage — View, triage, and resolve beta feedback entries.
 */
import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/utils/supabase";
import { bt, inp, card } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const CATEGORY_COLORS = {
  bug: "#EF4444",
  feature: "#8B5CF6",
  ux: "#F59E0B",
  general: "#6B7280",
};

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminFeedbackPage() {
  const C = useTheme();
  const T = C.T;
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // "all" | "bug" | "feature" | "ux" | "general" | "resolved"
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    loadFeedback();
  }, []);

  const loadFeedback = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("beta_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setFeedback(data || []);
    } catch { setFeedback([]); }
    setLoading(false);
  };

  const toggleResolved = async (id, current) => {
    try {
      await supabase.from("beta_feedback").update({ resolved: !current }).eq("id", id);
      setFeedback(prev => prev.map(f => f.id === id ? { ...f, resolved: !current } : f));
    } catch { /* non-critical */ }
  };

  const updateNotes = async (id, notes) => {
    try {
      await supabase.from("beta_feedback").update({ notes }).eq("id", id);
      setFeedback(prev => prev.map(f => f.id === id ? { ...f, notes } : f));
    } catch { /* non-critical */ }
  };

  const filtered = feedback.filter(f => {
    if (filter === "resolved") return f.resolved;
    if (filter === "all") return !f.resolved;
    return f.category === filter && !f.resolved;
  });

  return (
    <div style={{ padding: T.space[4], maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: T.space[3] }}>
        Beta Feedback ({feedback.length})
      </h2>

      {/* Filters */}
      <div style={{ display: "flex", gap: 4, marginBottom: T.space[3], flexWrap: "wrap" }}>
        {["all", "bug", "feature", "ux", "general", "resolved"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={bt(C, {
              padding: "4px 12px", fontSize: 10, fontWeight: 600,
              background: filter === f ? `${CATEGORY_COLORS[f] || C.accent}15` : "transparent",
              color: filter === f ? CATEGORY_COLORS[f] || C.accent : C.textDim,
              border: `1px solid ${filter === f ? (CATEGORY_COLORS[f] || C.accent) + "30" : C.border}`,
              borderRadius: T.radius.full, textTransform: "capitalize",
            })}
          >
            {f} ({f === "resolved" ? feedback.filter(x => x.resolved).length : f === "all" ? feedback.filter(x => !x.resolved).length : feedback.filter(x => x.category === f && !x.resolved).length})
          </button>
        ))}
        <button onClick={loadFeedback} style={bt(C, { padding: "4px 8px", fontSize: 10, color: C.textDim, marginLeft: "auto" })}>
          <Ic d={I.refresh} size={10} color={C.textDim} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ color: C.textDim, fontSize: 12 }}>Loading feedback...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: C.textDim, fontSize: 12, padding: T.space[4], textAlign: "center" }}>
          No feedback matching this filter
        </div>
      ) : (
        <div style={{ ...card(C), padding: 0, overflow: "hidden" }}>
          {filtered.map(f => (
            <div key={f.id}>
              <div
                onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                style={{
                  display: "flex", alignItems: "center", gap: T.space[2],
                  padding: `${T.space[2]}px ${T.space[3]}px`,
                  borderBottom: `1px solid ${C.border}06`,
                  cursor: "pointer", fontSize: 11,
                }}
              >
                {/* Category pill */}
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3,
                  background: `${CATEGORY_COLORS[f.category] || C.textDim}18`,
                  color: CATEGORY_COLORS[f.category] || C.textDim,
                  textTransform: "uppercase", minWidth: 50, textAlign: "center",
                }}>
                  {f.category || "—"}
                </span>
                {/* Email */}
                <span style={{ color: C.accent, fontWeight: 500, minWidth: 120 }}>{f.email || "anonymous"}</span>
                {/* Message preview */}
                <span style={{ flex: 1, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.message?.slice(0, 100)}
                </span>
                {/* Time */}
                <span style={{ fontSize: 9, color: C.textDim, minWidth: 60 }}>{timeAgo(f.created_at)}</span>
                {/* Resolved toggle */}
                <button
                  onClick={e => { e.stopPropagation(); toggleResolved(f.id, f.resolved); }}
                  style={bt(C, {
                    padding: "3px 8px", fontSize: 8, fontWeight: 600,
                    background: f.resolved ? `${C.green}15` : "transparent",
                    color: f.resolved ? C.green : C.textDim,
                    border: `1px solid ${f.resolved ? C.green + "30" : C.border}`,
                  })}
                >
                  {f.resolved ? "Resolved" : "Open"}
                </button>
              </div>

              {/* Expanded detail */}
              {expandedId === f.id && (
                <div style={{ padding: `${T.space[2]}px ${T.space[3]}px ${T.space[3]}px`, background: `${C.bg1}40`, fontSize: 10, borderBottom: `1px solid ${C.border}06` }}>
                  <div style={{ color: C.text, lineHeight: 1.6, marginBottom: T.space[2] }}>{f.message}</div>
                  <div style={{ display: "flex", gap: T.space[3], color: C.textDim, fontSize: 9, flexWrap: "wrap" }}>
                    <span>Page: {f.page || "—"}</span>
                    <span>Screen: {f.screen_dimensions || "—"}</span>
                    <span>Version: {f.app_version || "—"}</span>
                    <span>Agent: {(f.user_agent || "").slice(0, 60)}</span>
                  </div>
                  {/* Admin notes */}
                  <div style={{ marginTop: T.space[2] }}>
                    <label style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Admin Notes:</label>
                    <textarea
                      value={f.notes || ""}
                      onChange={e => setFeedback(prev => prev.map(x => x.id === f.id ? { ...x, notes: e.target.value } : x))}
                      onBlur={e => updateNotes(f.id, e.target.value)}
                      rows={2}
                      style={{ ...inp(C, { fontSize: 10, width: "100%", marginTop: 4, borderRadius: 4 }) }}
                      placeholder="Internal notes..."
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
