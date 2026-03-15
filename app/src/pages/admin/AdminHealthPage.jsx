// ============================================================
// NOVA Core — Admin Health Panel (Full)
// /admin/health
// Live data: row counts for ALL 28+ tables (8 backbone + 20 new + 3 admin).
// Nightly recompute log — last run timestamp, duration, records, errors.
// Green/amber/red status per table.
// ============================================================

import { useAdminFetch } from "@/hooks/useAdminFetch";

export default function AdminHealthPage() {
  const { data, loading, error, refetch: fetchHealth } = useAdminFetch("nova-health");

  if (loading) return <div style={S.msg}>Loading health data...</div>;
  if (error) return <div style={{ ...S.msg, color: "#A63030" }}>Error: {error}</div>;
  if (!data) return null;

  const rc = data.nightly_recompute;

  return (
    <div>
      <div style={S.header}>
        <h2 style={S.title}>System Health</h2>
        <button onClick={fetchHealth} style={S.refresh}>Refresh</button>
      </div>

      {/* Nightly Recompute Card */}
      <div style={S.recomputeCard}>
        <div style={S.recomputeHeader}>
          <span style={S.recomputeTitle}>Nightly Recompute</span>
          <span style={{
            ...S.badge,
            background: rc.status === "healthy" ? "#639922"
              : rc.status === "never_run" ? "#555"
              : rc.status === "error" ? "#A63030"
              : "#BA7517",
          }}>
            {rc.status === "never_run" ? "NEVER RUN" : rc.status === "healthy" ? "HEALTHY" : rc.status.toUpperCase()}
          </span>
        </div>
        {rc.last_run ? (
          <div style={S.recomputeDetails}>
            <div style={S.rcDetail}>
              <span style={S.rcLabel}>Last run</span>
              <span style={S.rcValue}>{new Date(rc.last_run).toLocaleString()}</span>
            </div>
            <div style={S.rcDetail}>
              <span style={S.rcLabel}>Duration</span>
              <span style={S.rcValue}>{(rc.duration_ms / 1000).toFixed(1)}s</span>
            </div>
            <div style={S.rcDetail}>
              <span style={S.rcLabel}>Records</span>
              <span style={S.rcValue}>{(rc.records_processed || 0).toLocaleString()}</span>
            </div>
            {rc.errors && (
              <div style={S.rcDetail}>
                <span style={S.rcLabel}>Errors</span>
                <span style={{ ...S.rcValue, color: "#F87171" }}>
                  {Array.isArray(rc.errors) ? rc.errors.length : "Yes"}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "#888780", marginTop: 8 }}>
            No recompute runs recorded yet.
          </div>
        )}
        {rc.step_results && Array.isArray(rc.step_results) && (
          <div style={S.stepGrid}>
            {rc.step_results.map((s, i) => (
              <div key={i} style={S.stepChip}>
                <span style={S.stepName}>{s.step}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: s.error ? "#F87171" : "#fff" }}>
                  {s.records.toLocaleString()}
                </span>
                {s.error && <span style={{ fontSize: 10, color: "#F87171" }}>err</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Table Groups */}
      {data.groups && data.groups.map((group) => (
        <div key={group.group} style={S.groupSection}>
          <h3 style={S.groupTitle}>{group.group}</h3>
          <div style={S.grid}>
            {group.tables.map((t) => (
              <div key={t.name} style={S.card}>
                <div style={S.cardTop}>
                  <span style={S.tableName}>{t.name}</span>
                  <span style={{
                    ...S.badge,
                    background: t.status === "healthy" ? "#639922"
                      : t.status === "warning" ? "#BA7517"
                      : t.status === "empty" ? "#555"
                      : "#A63030",
                  }}>
                    {t.status}
                  </span>
                </div>
                <div style={S.rowCount}>{t.row_count >= 0 ? t.row_count.toLocaleString() : "ERR"}</div>
                <div style={S.rowLabel}>rows</div>
                {t.error && <div style={{ fontSize: 10, color: "#F87171", marginTop: 4 }}>{t.error}</div>}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={S.footer}>
        <span style={S.timestamp}>Last checked: {new Date(data.timestamp).toLocaleString()}</span>
      </div>
    </div>
  );
}

const S = {
  msg: { color: "#888780", fontSize: 14, padding: 40, textAlign: "center" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 600, color: "#fff", margin: 0 },
  refresh: {
    padding: "8px 16px", background: "#1E1E1C", border: "1px solid #2A2A28",
    borderRadius: 6, color: "#888780", fontSize: 13, cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  },

  // Nightly Recompute
  recomputeCard: {
    background: "#1E1E1C", border: "1px solid #2A2A28", borderRadius: 8,
    padding: 20, marginBottom: 28,
  },
  recomputeHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  recomputeTitle: { fontSize: 14, fontWeight: 600, color: "#fff" },
  recomputeDetails: { display: "flex", gap: 24, flexWrap: "wrap" },
  rcDetail: { display: "flex", flexDirection: "column", gap: 2 },
  rcLabel: { fontSize: 11, color: "#888780", fontWeight: 500 },
  rcValue: { fontSize: 14, fontWeight: 600, color: "#fff" },
  stepGrid: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16, paddingTop: 16, borderTop: "1px solid #2A2A28" },
  stepChip: {
    display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
    background: "#161614", borderRadius: 4, border: "1px solid #2A2A28",
  },
  stepName: { fontSize: 10, color: "#888780", fontWeight: 500 },

  // Table Groups
  groupSection: { marginBottom: 28 },
  groupTitle: { fontSize: 14, fontWeight: 600, color: "#888780", marginBottom: 12, margin: "0 0 12px" },
  grid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 12,
  },
  card: {
    background: "#1E1E1C", border: "1px solid #2A2A28", borderRadius: 8,
    padding: "16px",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  tableName: { fontSize: 12, fontWeight: 500, color: "#888780" },
  badge: {
    fontSize: 10, fontWeight: 600, color: "#fff", padding: "2px 7px",
    borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em",
  },
  rowCount: { fontSize: 24, fontWeight: 700, color: "#fff", lineHeight: 1 },
  rowLabel: { fontSize: 11, color: "#888780", marginTop: 3 },

  footer: {
    marginTop: 32, display: "flex", justifyContent: "space-between",
    fontSize: 12, color: "#888780",
  },
  timestamp: {},
};
