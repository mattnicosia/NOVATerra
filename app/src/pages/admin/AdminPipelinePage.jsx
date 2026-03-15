// ============================================================
// NOVA Core — Admin Pipeline Panel (Live)
// /admin/pipeline
// Shows: 12-step pipeline with records processed, flagged, passed per step.
// Queried from pipeline_log table.
// ============================================================

import { useAdminFetch } from "@/hooks/useAdminFetch";

export default function AdminPipelinePage() {
  const { data, loading, error, refetch: fetchPipeline } = useAdminFetch("nova-pipeline");

  if (loading) return <div style={S.msg}>Loading pipeline data...</div>;
  if (error) return <div style={{ ...S.msg, color: "#A63030" }}>Error: {error}</div>;
  if (!data) return null;

  const steps = data.steps || [];
  const hasActivity = steps.some((s) => s.records_in > 0);

  return (
    <div>
      <div style={S.header}>
        <div>
          <h2 style={S.title}>Pipeline</h2>
          <p style={S.subtitle}>12-step data pipeline — today's activity</p>
        </div>
        <button onClick={fetchPipeline} style={S.refresh}>Refresh</button>
      </div>

      {!hasActivity && (
        <div style={S.noActivity}>No pipeline activity recorded today.</div>
      )}

      <div style={S.table}>
        {/* Header */}
        <div style={S.tableHeader}>
          <span style={{ ...S.th, flex: "0 0 50px" }}>Step</span>
          <span style={{ ...S.th, flex: 1 }}>Label</span>
          <span style={{ ...S.th, flex: "0 0 110px", textAlign: "right" }}>Processed</span>
          <span style={{ ...S.th, flex: "0 0 100px", textAlign: "right" }}>Flagged</span>
          <span style={{ ...S.th, flex: "0 0 100px", textAlign: "right" }}>Passed</span>
          <span style={{ ...S.th, flex: "0 0 60px", textAlign: "right" }}>Runs</span>
          <span style={{ ...S.th, flex: "0 0 140px", textAlign: "right" }}>Last Run</span>
        </div>

        {/* Rows */}
        {steps.map((s) => {
          const flagPct = s.records_in > 0 ? ((s.records_flagged / s.records_in) * 100).toFixed(1) : 0;
          const isActive = s.records_in > 0;

          return (
            <div key={s.step} style={{ ...S.row, opacity: isActive ? 1 : 0.4 }}>
              <span style={{ ...S.td, flex: "0 0 50px" }}>
                <span style={S.stepBadge}>{s.step}</span>
              </span>
              <span style={{ ...S.td, flex: 1, fontWeight: 500 }}>{s.label}</span>
              <span style={{ ...S.td, flex: "0 0 110px", textAlign: "right", fontWeight: 600 }}>
                {s.records_in.toLocaleString()}
              </span>
              <span style={{
                ...S.td, flex: "0 0 100px", textAlign: "right", fontWeight: 600,
                color: s.records_flagged > 0 ? "#F59E0B" : "#888780",
              }}>
                {s.records_flagged.toLocaleString()}
                {s.records_flagged > 0 && (
                  <span style={{ fontSize: 10, color: "#BA7517", marginLeft: 4 }}>({flagPct}%)</span>
                )}
              </span>
              <span style={{
                ...S.td, flex: "0 0 100px", textAlign: "right", fontWeight: 600,
                color: s.records_passed > 0 ? "#639922" : "#888780",
              }}>
                {s.records_passed.toLocaleString()}
              </span>
              <span style={{ ...S.td, flex: "0 0 60px", textAlign: "right", color: "#888780" }}>
                {s.runs_today}
              </span>
              <span style={{ ...S.td, flex: "0 0 140px", textAlign: "right", fontSize: 11, color: "#888780" }}>
                {s.last_run ? new Date(s.last_run).toLocaleTimeString() : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {/* 7-day summary */}
      {data.week_summary && Object.keys(data.week_summary).length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={S.sectionTitle}>7-Day Summary</h3>
          <div style={S.summaryGrid}>
            {Object.entries(data.week_summary).map(([step, stats]) => (
              <div key={step} style={S.summaryCard}>
                <div style={S.summaryStep}>Step {step}</div>
                <div style={S.summaryRow}>
                  <span style={S.summaryLabel}>In</span>
                  <span style={S.summaryValue}>{stats.records_in.toLocaleString()}</span>
                </div>
                <div style={S.summaryRow}>
                  <span style={S.summaryLabel}>Flagged</span>
                  <span style={{ ...S.summaryValue, color: stats.records_flagged > 0 ? "#F59E0B" : "#888780" }}>
                    {stats.records_flagged.toLocaleString()}
                  </span>
                </div>
                <div style={S.summaryRow}>
                  <span style={S.summaryLabel}>Passed</span>
                  <span style={{ ...S.summaryValue, color: "#639922" }}>{stats.records_passed.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={S.footer}>
        <span style={{ fontSize: 12, color: "#888780" }}>
          Last checked: {new Date(data.timestamp).toLocaleString()}
        </span>
      </div>
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
  noActivity: {
    textAlign: "center", padding: "16px 0", color: "#888780", fontSize: 13,
    marginBottom: 16, fontStyle: "italic",
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
  stepBadge: {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    width: 28, height: 28, borderRadius: "50%",
    background: "#534AB720", color: "#7C6FDB",
    fontSize: 12, fontWeight: 700,
  },

  // Section
  sectionTitle: { fontSize: 14, fontWeight: 600, color: "#888780", marginBottom: 12, margin: "0 0 12px" },

  // Summary
  summaryGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12,
  },
  summaryCard: {
    background: "#1E1E1C", border: "1px solid #2A2A28", borderRadius: 8, padding: 14,
  },
  summaryStep: { fontSize: 11, fontWeight: 600, color: "#7C6FDB", marginBottom: 8 },
  summaryRow: { display: "flex", justifyContent: "space-between", marginBottom: 4 },
  summaryLabel: { fontSize: 11, color: "#888780" },
  summaryValue: { fontSize: 13, fontWeight: 600, color: "#fff" },

  footer: { marginTop: 28 },
};
