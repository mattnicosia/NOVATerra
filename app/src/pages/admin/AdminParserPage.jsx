// ============================================================
// NOVA Core — Admin Parser Intelligence Panel
// /admin/parser
//
// Four sections:
//   1. Parse volume metrics (last 30 days)
//   2. Confidence distribution bar chart
//   3. Top 10 sub companies by parse volume
//   4. Recent errors
// ============================================================

import { useAdminFetch } from "@/hooks/useAdminFetch";

function formatDollars(n) {
  if (n == null || n === 0) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function AdminParserPage() {
  const { data, loading, error, refetch } = useAdminFetch("nova-parser");

  if (loading) return <div style={S.msg}>Loading parser stats...</div>;
  if (error) return <div style={{ ...S.msg, color: "#A63030" }}>Error: {error}</div>;

  const vol = data?.volume || {};
  const dist = data?.confidence_distribution || {};
  const companies = data?.top_companies || [];
  const errors = data?.recent_errors || [];

  const distTotal = Object.values(dist).reduce((s, v) => s + v, 0);

  return (
    <div>
      <div style={S.header}>
        <div>
          <h2 style={S.title}>Parser</h2>
          <p style={S.subtitle}>Parse intelligence — last 30 days</p>
        </div>
        <button onClick={refetch} style={S.refreshBtn}>Refresh</button>
      </div>

      {/* ── 1. Metric Cards ── */}
      <div style={S.cardRow}>
        <MetricCard label="Total Parse Jobs" value={vol.total_jobs || "—"} />
        <MetricCard label="Total Lines Parsed" value={vol.total_lines || "—"} />
        <MetricCard label="Auto-Written" value={vol.auto_written || "—"} color="#639922" />
        <MetricCard label="Review Rate" value={vol.total_lines ? `${vol.review_rate_pct || 0}%` : "—"} color="#BA7517" />
        <MetricCard label="Avg Confidence" value={vol.total_lines ? `${Math.round((vol.avg_confidence || 0) * 100)}%` : "—"} />
      </div>

      {/* ── 2. Confidence Distribution ── */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={S.sectionTitle}>Confidence Distribution</h3>
        <div style={S.chartContainer}>
          {Object.entries(dist).map(([bucket, count]) => {
            const pct = distTotal > 0 ? (count / distTotal) * 100 : 0;
            const color = bucket.startsWith('0.9') ? '#639922'
              : bucket.startsWith('0.8') ? '#7AAF2E'
              : bucket.startsWith('0.7') ? '#BA7517'
              : bucket.startsWith('0.6') ? '#C98A30'
              : bucket.startsWith('0.5') ? '#A63030'
              : '#7A2020';

            return (
              <div key={bucket} style={S.barRow}>
                <span style={S.barLabel}>{bucket}</span>
                <div style={S.barTrack}>
                  <div style={{ ...S.barFill, width: `${Math.max(pct, 1)}%`, background: color }} />
                </div>
                <span style={S.barCount}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 3. Top Sub Companies ── */}
      {companies.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={S.sectionTitle}>Top Sub Companies</h3>
          <div style={S.table}>
            <div style={S.tableHeader}>
              <span style={{ ...S.th, flex: "1 1 200px" }}>Sub Company</span>
              <span style={{ ...S.th, flex: "0 0 80px", textAlign: "right" }}>Jobs</span>
              <span style={{ ...S.th, flex: "0 0 100px", textAlign: "right" }}>Avg Confidence</span>
              <span style={{ ...S.th, flex: "0 0 140px", textAlign: "right" }}>Avg Bid Amount</span>
            </div>
            {companies.map((c, i) => (
              <div key={i} style={S.row}>
                <span style={{ ...S.td, flex: "1 1 200px", fontWeight: 600 }}>{c.company}</span>
                <span style={{ ...S.td, flex: "0 0 80px", textAlign: "right" }}>{c.job_count}</span>
                <span style={{ ...S.td, flex: "0 0 100px", textAlign: "right" }}>
                  {Math.round(c.avg_confidence * 100)}%
                </span>
                <span style={{ ...S.td, flex: "0 0 140px", textAlign: "right" }}>{formatDollars(c.total_bid)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Recent Errors ── */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={S.sectionTitle}>Recent Errors</h3>
        {errors.length > 0 ? (
          <div style={S.table}>
            <div style={S.tableHeader}>
              <span style={{ ...S.th, flex: "0 0 140px" }}>Date</span>
              <span style={{ ...S.th, flex: "0 0 200px" }}>Source Email</span>
              <span style={{ ...S.th, flex: "1 1 auto" }}>Error</span>
            </div>
            {errors.map((e, i) => (
              <div key={i} style={S.row}>
                <span style={{ ...S.td, flex: "0 0 140px", color: "#888780" }}>{formatDate(e.created_at)}</span>
                <span style={{ ...S.td, flex: "0 0 200px" }}>{e.source_email || "—"}</span>
                <span style={{ ...S.td, flex: "1 1 auto", color: "#A63030", fontSize: 12 }}>{e.error_message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={S.empty}>No parser errors</div>
        )}
      </div>

      {vol.total_jobs === 0 && companies.length === 0 && errors.length === 0 && (
        <div style={S.empty}>No parse data yet. Send a sub proposal PDF to bids@novaterra.ai to start.</div>
      )}
    </div>
  );
}

// ── Metric Card Component ──

function MetricCard({ label, value, color }) {
  return (
    <div style={S.card}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#888780", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || "#fff", lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

// ── Styles (Between Stars and Stone) ──

const S = {
  msg: { color: "#888780", fontSize: 14, padding: 40, textAlign: "center" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 600, color: "#fff", margin: 0 },
  subtitle: { fontSize: 12, color: "#888780", margin: "4px 0 0" },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: "#888780", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" },

  refreshBtn: {
    padding: "8px 16px", background: "#1E1E1C", border: "1px solid #2A2A28",
    borderRadius: 6, color: "#888780", fontSize: 13, cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  },

  cardRow: {
    display: "flex", gap: 12, marginBottom: 32, flexWrap: "wrap",
  },
  card: {
    flex: "1 1 150px", background: "#1E1E1C", border: "1px solid #2A2A28",
    borderRadius: 8, padding: "16px 20px",
  },

  chartContainer: {
    background: "#1E1E1C", border: "1px solid #2A2A28", borderRadius: 8,
    padding: 20,
  },
  barRow: {
    display: "flex", alignItems: "center", gap: 12, marginBottom: 8,
  },
  barLabel: {
    fontSize: 12, color: "#888780", fontFamily: "monospace", width: 90, textAlign: "right", flexShrink: 0,
  },
  barTrack: {
    flex: 1, height: 20, background: "#161614", borderRadius: 4, overflow: "hidden",
  },
  barFill: {
    height: "100%", borderRadius: 4, transition: "width 0.3s",
  },
  barCount: {
    fontSize: 12, color: "#fff", fontWeight: 600, width: 40, textAlign: "right", flexShrink: 0,
  },

  empty: {
    textAlign: "center", padding: 60, color: "#888780", fontSize: 14,
    background: "#1E1E1C", borderRadius: 8, border: "1px solid #2A2A28",
  },

  table: { background: "#1E1E1C", borderRadius: 8, border: "1px solid #2A2A28", overflow: "hidden" },
  tableHeader: {
    display: "flex", alignItems: "center", padding: "10px 16px",
    borderBottom: "1px solid #2A2A28", background: "#161614",
  },
  th: { fontSize: 10, fontWeight: 600, color: "#888780", textTransform: "uppercase", letterSpacing: "0.04em" },
  row: {
    display: "flex", alignItems: "center", padding: "10px 16px",
    borderBottom: "1px solid #1A1A18",
  },
  td: { fontSize: 13, color: "#fff" },
};
