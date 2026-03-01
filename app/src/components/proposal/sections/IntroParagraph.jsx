import { useReportsStore } from '@/stores/reportsStore';
import { T } from '@/utils/designTokens';

export default function IntroParagraph({ data }) {
  const { project } = data;
  const defaultText = `Thank you for the opportunity to submit our proposal for the above-referenced project. We have reviewed the plans and specifications${project.architect ? ` prepared by ${project.architect}` : ""} and are pleased to provide the following:`;
  const proposalText = useReportsStore(s => s.proposalText);
  const setProposalText = useReportsStore(s => s.setProposalText);
  const value = proposalText.intro || "";

  return (
    <div style={{ marginBottom: 16 }}>
      <textarea
        value={value}
        onChange={e => setProposalText("intro", e.target.value)}
        placeholder={defaultText}
        rows={3}
        style={{
          width: "100%", fontSize: 11, fontFamily: T.font.sans, lineHeight: 1.6,
          border: "1px dashed transparent", borderRadius: 3, padding: "2px 4px",
          background: "transparent", color: "#1a1a2e", resize: "vertical", outline: "none",
        }}
        onFocus={e => { e.target.style.borderColor = "#ccc"; }}
        onBlur={e => { e.target.style.borderColor = "transparent"; }}
        className="no-print-border"
      />
    </div>
  );
}
