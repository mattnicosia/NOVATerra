import { fmt, nn } from '@/utils/format';

export default function Alternates({ data }) {
  const { alternates, T } = data;
  if (alternates.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, marginBottom: T.space[2], borderBottom: "1px solid #ddd", paddingBottom: T.space[1] }}>ALTERNATES</div>
      {alternates.map((alt, i) => {
        const t = alt.items.reduce((s, ai) => (nn(ai.material) + nn(ai.labor) + nn(ai.equipment) + nn(ai.subcontractor)) * nn(ai.quantity) + s, 0);
        return (
          <div key={alt.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: "1px solid #f0f0f0" }}>
            <div><strong>Alt #{i + 1} ({alt.type === "deduct" ? "Deduct" : "Add"}):</strong> {alt.name}{alt.description ? ` \u2014 ${alt.description}` : ""}</div>
            <div style={{ fontWeight: 600, fontFamily: T.font.mono }}>{alt.type === "deduct" ? "\u2212" : "+"}{fmt(t)}</div>
          </div>
        );
      })}
    </div>
  );
}
