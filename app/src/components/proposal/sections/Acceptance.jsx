export default function Acceptance({ data, proposalStyles: PS, sectionNumber }) {
  const { T } = data;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", textMuted: "#888", border: "#ccc" };

  return (
    <div style={{ marginTop: T.space[8], padding: `${T.space[5]}px ${T.space[6]}px`, border: `1px solid ${color.border}`, borderRadius: T.radius.md }}>
      <div style={{ ...type.h2, fontFamily: font, color: color.text, fontSize: type.h2?.fontSize || 11, fontWeight: type.h2?.fontWeight || 700, marginBottom: 12 }}>
        {sectionNumber ? `${sectionNumber}.0  ` : ""}ACCEPTANCE
      </div>
      <div style={{ ...type.body, fontFamily: font, fontSize: type.body?.fontSize || 10, color: color.textDim, marginBottom: 16 }}>The above proposal is accepted. You are authorized to proceed as outlined above.</div>
      <div style={{ display: "flex", gap: 40 }}>
        <div style={{ flex: 1 }}><div style={{ borderBottom: `1px solid ${color.textMuted || "#999"}`, height: 24 }} /><div style={{ ...type.label, fontFamily: font, color: color.textMuted || "#888", fontSize: type.label?.fontSize || 9, marginTop: 2 }}>Authorized Signature</div></div>
        <div style={{ flex: 1 }}><div style={{ borderBottom: `1px solid ${color.textMuted || "#999"}`, height: 24 }} /><div style={{ ...type.label, fontFamily: font, color: color.textMuted || "#888", fontSize: type.label?.fontSize || 9, marginTop: 2 }}>Printed Name & Title</div></div>
        <div style={{ width: 120 }}><div style={{ borderBottom: `1px solid ${color.textMuted || "#999"}`, height: 24 }} /><div style={{ ...type.label, fontFamily: font, color: color.textMuted || "#888", fontSize: type.label?.fontSize || 9, marginTop: 2 }}>Date</div></div>
      </div>
    </div>
  );
}
