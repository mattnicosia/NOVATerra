// NOVA Core — Admin Intelligence Panel (Stub)
// /admin/intelligence — Coming Sprint 3
// Will show: materialized view outputs. Filter by metro/trade/building type. display_flag audit.

export default function AdminIntelligencePage() {
  return (
    <div style={S.wrap}>
      <h2 style={S.title}>Intelligence</h2>
      <p style={S.desc}>
        Materialized view outputs. Filter by metro, trade, building type. Display flag audit.
      </p>
      <span style={S.badge}>Coming Sprint 3</span>
    </div>
  );
}

const S = {
  wrap: { padding: 40, textAlign: "center" },
  title: { fontSize: 20, fontWeight: 600, color: "#fff", marginBottom: 12 },
  desc: { fontSize: 14, color: "#888780", maxWidth: 440, margin: "0 auto 24px" },
  badge: {
    display: "inline-block", padding: "6px 16px", borderRadius: 20,
    background: "#1E1E1C", border: "1px solid #2A2A28",
    color: "#534AB7", fontSize: 12, fontWeight: 600,
  },
};
