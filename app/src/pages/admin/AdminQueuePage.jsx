// NOVA Core — Admin Queue Panel (Stub)
// /admin/queue — Coming Sprint 2
// Will show: flagged records, duplicate confirmations, pending context proposals, outlier flags.

export default function AdminQueuePage() {
  return (
    <div style={S.wrap}>
      <h2 style={S.title}>Queue</h2>
      <p style={S.desc}>
        All flagged records. Duplicate confirmations. Pending context proposals. Outlier flags.
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
