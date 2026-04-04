import { useReportsStore } from '@/stores/reportsStore';

export default function Closing({ data, proposalStyles: PS }) {
  const defaultText = "We appreciate the opportunity to provide this proposal and look forward to working with you. Please do not hesitate to contact us with any questions.";
  const proposalText = useReportsStore(s => s.proposalText);
  const setProposalText = useReportsStore(s => s.setProposalText);
  const value = proposalText.closing || "";

  const font = PS?.font?.body || "'Inter', sans-serif";
  const color = PS?.color || { text: "#1a1a2e" };

  return (
    <div style={{ marginBottom: 20 }}>
      <textarea
        value={value}
        onChange={e => setProposalText("closing", e.target.value)}
        placeholder={defaultText}
        rows={2}
        style={{
          width: "100%", fontSize: 11, fontFamily: font, lineHeight: 1.6,
          border: "1px dashed transparent", borderRadius: 3, padding: "2px 4px",
          background: "transparent", color: color.text, resize: "vertical", outline: "none",
        }}
        onFocus={e => { e.target.style.borderColor = "#ccc"; }}
        onBlur={e => { e.target.style.borderColor = "transparent"; }}
        className="no-print-border"
      />
    </div>
  );
}
