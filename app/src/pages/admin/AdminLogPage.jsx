// ============================================================
// NOVA Core — Admin Log Panel (Live)
// /admin/log
// Append-only log of all admin actions.
// Shows: timestamp, action type, record affected, admin note.
// Only resolve and escalate actions from Queue write here.
// ============================================================

import { useAdminFetch } from "@/hooks/useAdminFetch";

export default function AdminLogPage() {
  const { data: logData, loading, error, refetch: fetchLog } = useAdminFetch("nova-log");
  const entries = logData?.entries || [];

  if (loading) return <div style={S.msg}>Loading admin log...</div>;
  if (error) return <div style={{ ...S.msg, color: "#A63030" }}>Error: {error}</div>;

  return (
    <div>
      <div style={S.header}>
        <div>
          <h2 style={S.title}>Admin Log</h2>
          <p style={S.subtitle}>{entries.length} action{entries.length !== 1 ? "s" : ""} recorded</p>
        </div>
        <button onClick={fetchLog} style={S.refresh}>Refresh</button>
      </div>

      {entries.length === 0 ? (
        <div style={S.empty}>No admin actions recorded yet.</div>
      ) : (
        <div style={S.table}>
          {/* Header */}
          <div style={S.tableHeader}>
            <span style={{ ...S.th, flex: "0 0 170px" }}>Timestamp</span>
            <span style={{ ...S.th, flex: "0 0 100px" }}>Action</span>
            <span style={{ ...S.th, flex: "0 0 120px" }}>Table</span>
            <span style={{ ...S.th, flex: "0 0 260px" }}>Record ID</span>
            <span style={{ ...S.th, flex: 1 }}>Note</span>
          </div>

          {/* Rows */}
          {entries.map((entry) => (
            <div key={entry.id} style={S.row}>
              <span style={{ ...S.td, flex: "0 0 170px", fontSize: 12, color: "#888780" }}>
                {new Date(entry.created_at).toLocaleString()}
              </span>
              <span style={{ ...S.td, flex: "0 0 100px" }}>
                <span style={{
                  ...S.actionBadge,
                  background: entry.action_type === "resolve" ? "#63992220" : "#BA751720",
                  color: entry.action_type === "resolve" ? "#639922" : "#D4952B",
                }}>
                  {entry.action_type}
                </span>
              </span>
              <span style={{ ...S.td, flex: "0 0 120px", fontSize: 12, color: "#888780" }}>
                {entry.record_table}
              </span>
              <span style={{ ...S.td, flex: "0 0 260px", fontSize: 11, fontFamily: "monospace", color: "#888780" }}>
                {entry.record_id}
              </span>
              <span style={{ ...S.td, flex: 1, fontSize: 12, color: entry.admin_note ? "#fff" : "#555" }}>
                {entry.admin_note || "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  msg: { color: "#888780", fontSize: 14, padding: 40, textAlign: "center" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 600, color: "#fff", margin: 0 },
  subtitle: { fontSize: 12, color: "#888780", margin: "4px 0 0" },
  refresh: {
    padding: "8px 16px", background: "#1E1E1C", border: "1px solid #2A2A28",
    borderRadius: 6, color: "#888780", fontSize: 13, cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  },
  empty: {
    textAlign: "center", padding: 60, color: "#888780", fontSize: 14,
    background: "#1E1E1C", borderRadius: 8, border: "1px solid #2A2A28",
    fontStyle: "italic",
  },

  // Table
  table: { background: "#1E1E1C", borderRadius: 8, border: "1px solid #2A2A28", overflow: "hidden" },
  tableHeader: {
    display: "flex", alignItems: "center", padding: "12px 16px",
    borderBottom: "1px solid #2A2A28", background: "#161614",
  },
  th: { fontSize: 11, fontWeight: 600, color: "#888780", textTransform: "uppercase", letterSpacing: "0.04em" },
  row: {
    display: "flex", alignItems: "center", padding: "10px 16px",
    borderBottom: "1px solid #1A1A18",
  },
  td: { fontSize: 13, color: "#fff" },
  actionBadge: {
    fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
    textTransform: "uppercase", letterSpacing: "0.03em",
  },
};
