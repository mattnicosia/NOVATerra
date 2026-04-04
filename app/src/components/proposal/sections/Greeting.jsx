import { useReportsStore } from '@/stores/reportsStore';

export default function Greeting({ data, proposalStyles: PS }) {
  const { project, masterData } = data;
  const cl = masterData.clients.find(c => c.company === project.client);
  const defaultText = `Dear ${cl?.contact || "Sir/Madam"},`;
  const proposalText = useReportsStore(s => s.proposalText);
  const setProposalText = useReportsStore(s => s.setProposalText);
  const value = proposalText.greeting || "";

  const font = PS?.font?.body || "'Inter', sans-serif";
  const color = PS?.color || { text: "#1a1a2e" };

  return (
    <div style={{ marginBottom: 16 }}>
      <textarea
        value={value}
        onChange={e => setProposalText("greeting", e.target.value)}
        placeholder={defaultText}
        rows={1}
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
