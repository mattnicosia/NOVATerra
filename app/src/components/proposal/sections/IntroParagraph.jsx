import { useState } from 'react';
import { useReportsStore } from '@/stores/reportsStore';
import { callAnthropic } from '@/utils/ai';

export default function IntroParagraph({ data, proposalStyles: PS }) {
  const { project, companyInfo, items, totals } = data;
  const defaultText = `Thank you for the opportunity to submit our proposal for the above-referenced project. We have reviewed the plans and specifications${project.architect ? ` prepared by ${project.architect}` : ""} and are pleased to provide the following:`;
  const proposalText = useReportsStore(s => s.proposalText);
  const setProposalText = useReportsStore(s => s.setProposalText);
  const value = proposalText.intro || "";
  const [generating, setGenerating] = useState(false);

  const font = PS?.font?.body || "'Inter', sans-serif";
  const color = PS?.color || { text: "#1a1a2e" };

  const generateCoverLetter = async () => {
    setGenerating(true);
    try {
      const companyName = companyInfo?.name || "Our company";
      const clientName = project.client || "the Owner";
      const projectName = project.name || "the referenced project";
      const projectSF = project.projectSF ? `${project.projectSF.toLocaleString()} SF` : "";
      const buildingType = project.buildingType || project.workType || "";
      const architect = project.architect || "";
      const divisionCount = items ? [...new Set(items.map(i => (i.division || i.code?.substring(0, 2) || "").padStart(2, "0")))].filter(d => d !== "00").length : 0;
      const totalCost = totals?.grandTotal || totals?.total || 0;

      const prompt = `Write a professional construction proposal introduction paragraph (3-5 sentences). This is a cover letter for a formal bid proposal.

Company: ${companyName}
Client: ${clientName}
Project: ${projectName}
${projectSF ? `Size: ${projectSF}` : ""}
${buildingType ? `Type: ${buildingType}` : ""}
${architect ? `Architect: ${architect}` : ""}
${divisionCount ? `Scope: ${divisionCount} CSI divisions` : ""}
${totalCost ? `Total: $${Math.round(totalCost).toLocaleString()}` : ""}

Rules:
- Professional and confident tone, not salesy
- Reference the specific project name and architect (if provided)
- Mention you've reviewed the plans and specifications
- Brief reference to scope coverage
- End with a statement of commitment to quality and schedule
- Do NOT include "Dear..." or sign-off — just the body paragraph
- Keep it concise — estimators hate long cover letters
- Return ONLY the paragraph text, no quotes, no formatting`;

      const text = await callAnthropic({
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      });

      setProposalText("intro", text.trim());
    } catch (err) {
      console.error("[IntroParagraph] AI generation failed:", err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div style={{ marginBottom: 16, position: "relative" }}>
      <textarea
        value={value}
        onChange={e => setProposalText("intro", e.target.value)}
        placeholder={defaultText}
        rows={4}
        style={{
          width: "100%", fontSize: 11, fontFamily: font, lineHeight: 1.6,
          border: "1px dashed transparent", borderRadius: 3, padding: "2px 4px",
          background: "transparent", color: color.text, resize: "vertical", outline: "none",
        }}
        onFocus={e => { e.target.style.borderColor = "#ccc"; }}
        onBlur={e => { e.target.style.borderColor = "transparent"; }}
        className="no-print-border"
      />
      {/* AI Generate button removed — use Cover Letter section instead */}
    </div>
  );
}
