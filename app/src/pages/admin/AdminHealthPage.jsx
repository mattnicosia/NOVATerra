// ============================================================
// NOVA Core — Admin Health Panel
// /admin/health
// Live data: row counts for all 8 backbone tables.
// Green/amber/red health badges.
// ============================================================

import { useState, useEffect } from "react";

export default function AdminHealthPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
  }, []);

  async function fetchHealth() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/health");
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={S.msg}>Loading health data...</div>;
  if (error) return <div style={{ ...S.msg, color: "#A63030" }}>Error: {error}</div>;
  if (!data) return null;

  return (
    <div>
      <div style={S.header}>
        <h2 style={S.title}>System Health</h2>
        <button onClick={fetchHealth} style={S.refresh}>Refresh</button>
      </div>

      <div style={S.grid}>
        {data.tables.map((t) => (
          <div key={t.name} style={S.card}>
            <div style={S.cardTop}>
              <span style={S.tableName}>{t.name}</span>
              <span style={{
                ...S.badge,
                background: t.status === "healthy" ? "#639922" : t.status === "warning" ? "#BA7517" : "#A63030",
              }}>
                {t.status}
              </span>
            </div>
            <div style={S.rowCount}>{t.row_count.toLocaleString()}</div>
            <div style={S.rowLabel}>rows</div>
          </div>
        ))}
      </div>

      <div style={S.footer}>
        <span style={S.timestamp}>Last checked: {new Date(data.timestamp).toLocaleString()}</span>
        <span style={S.placeholder}>Nightly recompute: {data.nightly_recompute}</span>
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
  grid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#1E1E1C", border: "1px solid #2A2A28", borderRadius: 8,
    padding: "20px",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  tableName: { fontSize: 13, fontWeight: 500, color: "#888780" },
  badge: {
    fontSize: 11, fontWeight: 600, color: "#fff", padding: "2px 8px",
    borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em",
  },
  rowCount: { fontSize: 28, fontWeight: 700, color: "#fff", lineHeight: 1 },
  rowLabel: { fontSize: 12, color: "#888780", marginTop: 4 },
  footer: {
    marginTop: 32, display: "flex", justifyContent: "space-between",
    fontSize: 12, color: "#888780",
  },
  timestamp: {},
  placeholder: { fontStyle: "italic" },
};
