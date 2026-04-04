import { fmt } from '@/utils/format';

export default function Allowances({ data, proposalStyles: PS, sectionNumber }) {
  const { allowanceItems, allowanceGrandTotal, generateAllowanceNote, T } = data;
  if (allowanceItems.length === 0) return null;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const mono = PS?.font?.mono || "monospace";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textMed: "#444", accent: "#1a1a2e", border: "#ddd" };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...type.h2, fontFamily: font, color: color.accent, fontSize: type.h2?.fontSize || T.fontSize.base, fontWeight: type.h2?.fontWeight || T.fontWeight.bold, marginBottom: T.space[2], borderBottom: `1px solid ${color.border}`, paddingBottom: T.space[1] }}>
        {sectionNumber ? `${sectionNumber}.0  ` : ""}MATERIAL ALLOWANCES
      </div>
      {allowanceItems.map((item, i) => (
        <div key={item.id} style={{ ...type.body, fontFamily: font, fontSize: type.body?.fontSize || 10, padding: "2px 0", color: color.textMed || "#444" }}>{i + 1}. {item.allowanceNote || generateAllowanceNote(item)}</div>
      ))}
      <div style={{ ...type.body, fontFamily: font, fontSize: type.body?.fontSize || 10, padding: "4px 0 0", color: color.text, fontWeight: 600 }}>
        Total Allowances: <span style={{ ...type.money, fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>{fmt(allowanceGrandTotal)}</span>
      </div>
    </div>
  );
}
