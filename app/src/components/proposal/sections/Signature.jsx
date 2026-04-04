import { useReportsStore } from '@/stores/reportsStore';

export default function Signature({ data, proposalStyles: PS }) {
  const { project, companyInfo, masterData } = data;
  const ci = companyInfo || masterData.companyInfo;
  const defaultSignoff = "Respectfully submitted,";
  const proposalText = useReportsStore(s => s.proposalText);
  const setProposalText = useReportsStore(s => s.setProposalText);
  const value = proposalText.signature || "";

  const font = PS?.font?.body || "'Inter', sans-serif";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", textMed: "#444" };

  return (
    <div style={{ fontSize: 11 }}>
      <textarea
        value={value}
        onChange={e => setProposalText("signature", e.target.value)}
        placeholder={defaultSignoff}
        rows={1}
        style={{
          width: "100%", fontSize: 11, fontFamily: font, lineHeight: 1.6,
          border: "1px dashed transparent", borderRadius: 3, padding: "2px 4px",
          background: "transparent", color: color.textMed || "#444", resize: "vertical", outline: "none",
        }}
        onFocus={e => { e.target.style.borderColor = "#ccc"; }}
        onBlur={e => { e.target.style.borderColor = "transparent"; }}
        className="no-print-border"
      />
      <div style={{ ...type.h1, fontFamily: font, color: color.text, marginTop: 30, fontWeight: type.h1?.fontWeight || 600, fontSize: type.h1?.fontSize || 12 }}>{project.estimator || "[Estimator Name]"}</div>
      <div style={{ ...type.caption, fontFamily: font, color: color.textDim }}>{ci?.name || "[Company Name]"}</div>
    </div>
  );
}
