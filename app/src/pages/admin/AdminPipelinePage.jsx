// NOVA Core — Admin Pipeline Panel (Stub)
// /admin/pipeline — Coming Sprint 2
// Will show: 14-step pipeline metrics. Records per step. Flagged vs passed per step.

export default function AdminPipelinePage() {
  return (
    <div style={S.wrap}>
      <h2 style={S.title}>Pipeline</h2>
      <p style={S.desc}>
        14-step pipeline metrics. Records per step. Flagged vs passed per step.
      </p>
      <span style={S.badge}>Coming Sprint 2</span>
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
