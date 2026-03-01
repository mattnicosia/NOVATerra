export default function Clarifications({ data }) {
  const { clarifications, T } = data;
  if (clarifications.length === 0) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, marginBottom: T.space[2], borderBottom: "1px solid #ddd", paddingBottom: T.space[1] }}>CLARIFICATIONS</div>
      {clarifications.map((cl, i) => (
        <div key={cl.id} style={{ fontSize: 10, padding: "2px 0", color: "#444" }}>{i + 1}. {cl.text}</div>
      ))}
    </div>
  );
}
