import { fmt, fmt2, nn } from '@/utils/format';

export default function BaseBid({ data }) {
  const { totals, project, T } = data;
  return (
    <div style={{ padding: "20px 28px", background: "linear-gradient(135deg, #f8f9fa, #f0f0f2)", borderRadius: T.radius.lg, marginBottom: 16, border: "2px solid #1a1a2e" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>BASE BID</div>
          <div style={{ fontSize: 10, color: "#666" }}>Complete as specified</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, fontFamily: T.font.mono, letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}>{fmt(totals.grand)}</div>
      </div>
      {nn(project.projectSF) > 0 && (
        <div style={{ fontSize: 10, color: "#888", marginTop: 4, textAlign: "right" }}>
          {fmt2(totals.grand / nn(project.projectSF))}/SF {"\u00D7"} {project.projectSF} SF
        </div>
      )}
    </div>
  );
}
