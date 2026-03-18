export default function Exclusions({ data }) {
  const { exclusions, T } = data;
  if (exclusions.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, marginBottom: T.space[2], borderBottom: "1px solid #ddd", paddingBottom: T.space[1] }}>EXCLUSIONS</div>
      {exclusions.map((ex, i) => (
        <div key={ex.id} style={{ fontSize: 10, padding: "2px 0", color: "#444" }}>{i + 1}. {ex.description}</div>
      ))}
    </div>
  );
}
