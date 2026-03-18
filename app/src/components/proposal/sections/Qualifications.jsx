export default function Qualifications({ data }) {
  const { T } = data;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, marginBottom: T.space[2], borderBottom: "1px solid #ddd", paddingBottom: T.space[1] }}>QUALIFICATIONS</div>
      <div style={{ fontSize: 10, color: "#444", lineHeight: 1.8 }}>
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
