// NOVA Core — Admin Log Panel (Stub)
// /admin/log — Coming Sprint 2
// Will show: append-only admin action log. Every rollback, override, manual resolution.

export default function AdminLogPage() {
  return (
    <div style={S.wrap}>
      <h2 style={S.title}>Log</h2>
      <p style={S.desc}>
        Append-only admin action log. Every rollback, override, manual resolution.
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
