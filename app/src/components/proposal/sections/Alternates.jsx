import { fmt, nn } from '@/utils/format';

export default function Alternates({ data, proposalStyles: PS, sectionNumber }) {
  const { alternates, T } = data;
  if (alternates.length === 0) return null;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const mono = PS?.font?.mono || "monospace";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", accent: "#1a1a2e", border: "#ddd" };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...type.h2, fontFamily: font, color: color.accent, fontSize: type.h2?.fontSize || T.fontSize.base, fontWeight: type.h2?.fontWeight || T.fontWeight.bold, marginBottom: T.space[2], borderBottom: `1px solid ${color.border}`, paddingBottom: T.space[1] }}>
        {sectionNumber ? `${sectionNumber}.0  ` : ""}ALTERNATES
      </div>
      {alternates.map((alt, i) => {
        const t = alt.items.reduce((s, ai) => (nn(ai.material) + nn(ai.labor) + nn(ai.equipment) + nn(ai.subcontractor)) * nn(ai.quantity) + s, 0);
        return (
          <div key={alt.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${color.bgSubtle || "#f0f0f0"}` }}>
            <div style={{ ...type.body, fontFamily: font, fontSize: type.body?.fontSize || 11 }}>
              <strong style={{ color: color.accent }}>Alt #{i + 1} ({alt.type === "deduct" ? "Deduct" : "Add"}):</strong> {alt.name}{alt.description ? ` \u2014 ${alt.description}` : ""}
            </div>
            <div style={{ ...type.money, fontFamily: mono, fontWeight: 600, fontSize: type.money?.fontSize || 11 }}>{alt.type === "deduct" ? "\u2212" : "+"}{fmt(t)}</div>
          </div>
        );
      })}
    </div>
  );
}
