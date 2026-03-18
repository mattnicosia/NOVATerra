export default function Acceptance({ data }) {
  const { T } = data;
  return (
    <div style={{ marginTop: T.space[8], padding: `${T.space[5]}px ${T.space[6]}px`, border: "1px solid #ccc", borderRadius: T.radius.md }}>
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 12 }}>ACCEPTANCE</div>
      <div style={{ fontSize: 10, color: "#666", marginBottom: 16 }}>The above proposal is accepted. You are authorized to proceed as outlined above.</div>
      <div style={{ display: "flex", gap: 40 }}>
        <div style={{ flex: 1 }}><div style={{ borderBottom: "1px solid #999", height: 24 }} /><div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>Authorized Signature</div></div>
        <div style={{ flex: 1 }}><div style={{ borderBottom: "1px solid #999", height: 24 }} /><div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>Printed Name & Title</div></div>
        <div style={{ width: 120 }}><div style={{ borderBottom: "1px solid #999", height: 24 }} /><div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>Date</div></div>
      </div>
    </div>
  );
}
