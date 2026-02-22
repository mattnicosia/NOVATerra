import { useReportsStore } from '@/stores/reportsStore';

export default function Signature({ data }) {
  const { project, companyInfo, masterData } = data;
  const ci = companyInfo || masterData.companyInfo;
  const defaultSignoff = "Respectfully submitted,";
  const proposalText = useReportsStore(s => s.proposalText);
  const setProposalText = useReportsStore(s => s.setProposalText);
  const value = proposalText.signature || "";

  return (
    <div style={{ fontSize: 11 }}>
      <textarea
        value={value}
        onChange={e => setProposalText("signature", e.target.value)}
        placeholder={defaultSignoff}
        rows={1}
        style={{
          width: "100%", fontSize: 11, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6,
          border: "1px dashed transparent", borderRadius: 3, padding: "2px 4px",
          background: "transparent", color: "#1a1a2e", resize: "vertical", outline: "none",
        }}
        onFocus={e => { e.target.style.borderColor = "#ccc"; }}
        onBlur={e => { e.target.style.borderColor = "transparent"; }}
        className="no-print-border"
      />
      <div style={{ marginTop: 30, fontWeight: 600 }}>{project.estimator || "[Estimator Name]"}</div>
      <div style={{ color: "#666" }}>{ci?.name || "[Company Name]"}</div>
    </div>
  );
}
