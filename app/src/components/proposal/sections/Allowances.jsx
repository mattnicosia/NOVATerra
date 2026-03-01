import { fmt } from '@/utils/format';

export default function Allowances({ data }) {
  const { allowanceItems, allowanceGrandTotal, generateAllowanceNote, T } = data;
  if (allowanceItems.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, marginBottom: T.space[2], borderBottom: "1px solid #ddd", paddingBottom: T.space[1] }}>MATERIAL ALLOWANCES</div>
      {allowanceItems.map((item, i) => (
        <div key={item.id} style={{ fontSize: 10, padding: "2px 0", color: "#444" }}>{i + 1}. {item.allowanceNote || generateAllowanceNote(item)}</div>
      ))}
      <div style={{ fontSize: 10, padding: "4px 0 0", color: "#222", fontWeight: 600 }}>Total Allowances: <span style={{ fontFamily: T.font.mono, fontVariantNumeric: "tabular-nums" }}>{fmt(allowanceGrandTotal)}</span></div>
    </div>
  );
}
