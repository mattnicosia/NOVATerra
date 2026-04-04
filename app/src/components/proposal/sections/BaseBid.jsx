import { fmt, fmt2, nn } from '@/utils/format';

export default function BaseBid({ data, proposalStyles: PS, sectionNumber }) {
  const { totals, project, T } = data;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const mono = PS?.font?.mono || "monospace";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", accent: "#1a1a2e", bgSubtle: "#f8f9fa", accentLight: "#f0f0f2" };

  return (
    <div style={{
      padding: "20px 28px",
      background: `linear-gradient(135deg, ${color.bgSubtle || "#f8f9fa"}, ${color.accentLight || "#f0f0f2"})`,
      borderRadius: T.radius.lg,
      marginBottom: 16,
      border: `2px solid ${color.accent}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ ...type.h2, fontFamily: font, color: color.accent, fontSize: type.h2?.fontSize || 14, fontWeight: type.h2?.fontWeight || 800 }}>
            {sectionNumber ? `${sectionNumber}.0  ` : ""}BASE BID
          </div>
          <div style={{ ...type.caption, fontFamily: font, color: color.textDim, fontSize: type.caption?.fontSize || 10 }}>Complete as specified</div>
        </div>
        <div style={{ ...type.moneyLg, fontFamily: mono, color: color.text, fontSize: type.moneyLg?.fontSize || 22, fontWeight: type.moneyLg?.fontWeight || 800, letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" }}>{fmt(totals.grand)}</div>
      </div>
      {nn(project.projectSF) > 0 && (
        <div style={{ ...type.caption, fontFamily: mono, color: color.textDim, fontSize: type.caption?.fontSize || 10, marginTop: 4, textAlign: "right" }}>
          {fmt2(totals.grand / nn(project.projectSF))}/SF {"\u00D7"} {project.projectSF} SF
        </div>
      )}
    </div>
  );
}
