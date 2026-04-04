export default function Qualifications({ data, proposalStyles: PS, sectionNumber }) {
  const { T } = data;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textMed: "#444", accent: "#1a1a2e", border: "#ddd" };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ ...type.h2, fontFamily: font, color: color.accent, fontSize: type.h2?.fontSize || T.fontSize.base, fontWeight: type.h2?.fontWeight || T.fontWeight.bold, marginBottom: T.space[2], borderBottom: `1px solid ${color.border}`, paddingBottom: T.space[1] }}>
        {sectionNumber ? `${sectionNumber}.0  ` : ""}QUALIFICATIONS
      </div>
      <div style={{ ...type.body, fontFamily: font, fontSize: type.body?.fontSize || 10, color: color.textMed || "#444", lineHeight: 1.8 }}>
        1. This proposal is valid for thirty (30) days from the date above.<br />
        2. Payment terms: Net 30 days from invoice date. Progress billing monthly.<br />
        3. This proposal is based on normal working hours. Overtime, if required, will be billed at premium rates.<br />
        4. Any work not specifically included in the scope above is excluded.<br />
        5. Permits, fees, and inspections by others unless specifically included.<br />
        6. Owner to provide access to all work areas during normal business hours.
      </div>
    </div>
  );
}
