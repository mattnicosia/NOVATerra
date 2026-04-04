export default function Exclusions({ data, proposalStyles: PS, sectionNumber }) {
  const { exclusions, T } = data;
  if (exclusions.length === 0) return null;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textMed: "#444", accent: "#1a1a2e", border: "#ddd" };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...type.h2, fontFamily: font, color: color.accent, fontSize: type.h2?.fontSize || T.fontSize.base, fontWeight: type.h2?.fontWeight || T.fontWeight.bold, marginBottom: T.space[2], borderBottom: `1px solid ${color.border}`, paddingBottom: T.space[1] }}>
        {sectionNumber ? `${sectionNumber}.0  ` : ""}EXCLUSIONS
      </div>
      {exclusions.map((ex, i) => (
        <div key={ex.id} style={{ ...type.body, fontFamily: font, fontSize: type.body?.fontSize || 10, padding: "2px 0", color: color.textMed || "#444" }}>{i + 1}. {ex.description}</div>
      ))}
    </div>
  );
}
