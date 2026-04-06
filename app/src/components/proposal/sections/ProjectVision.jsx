import { useState, useEffect, useRef } from "react";
import { useReportsStore } from "@/stores/reportsStore";
import { callAnthropic } from "@/utils/ai";
import NovaInstructionBar from "../NovaInstructionBar";

export default function ProjectVision({ data, proposalStyles: PS }) {
  const { project, items, totals } = data;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const headingFont = PS?.font?.heading || font;
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", accent: "#1a1a2e" };
  const space = PS?.space || { md: 16, lg: 24 };

  const proposalText = useReportsStore(s => s.proposalText);
  const setProposalText = useReportsStore(s => s.setProposalText);
  const value = proposalText.projectVision || "";
  const [generating, setGenerating] = useState(false);
  const didAutoGenerate = useRef(false);

  const buildPrompt = (instruction) => {
    const projectName = project?.name || project?.projectName || "the project";
    const buildingType = project?.buildingType || project?.workType || "";
    const address = project?.address || "";
    const projectSF = project?.projectSF ? `${project.projectSF.toLocaleString()} SF` : "";
    const client = project?.client || "";
    const divCount = items ? [...new Set(items.map(i => (i.division || "").padStart(2, "0")))].filter(d => d !== "00").length : 0;
    const totalCost = totals?.grandTotal || totals?.total || 0;

    let prompt = `Write a compelling "Project Vision" section for an architectural-style construction proposal. This should read like the opening of an architecture monograph — thoughtful, contextual, and visually descriptive. 2-3 paragraphs.

Project: ${projectName}
${buildingType ? `Type: ${buildingType}` : ""}
${address ? `Location: ${address}` : ""}
${projectSF ? `Size: ${projectSF}` : ""}
${client ? `Client: ${client}` : ""}
${divCount ? `Scope: ${divCount} CSI divisions` : ""}
${totalCost ? `Budget: $${Math.round(totalCost).toLocaleString()}` : ""}

Rules:
- Write as if narrating the building's purpose and place in its context
- Reference the site, the community, and the building's intended function
- Connect the physical construction to human outcomes
- Professional yet evocative — the language of architecture, not spreadsheets
- Do NOT include dollar amounts or technical specifications
- Return ONLY the paragraphs, no titles or formatting
- NEVER use em dashes (\u2014) or en dashes (\u2013). Use commas, periods, or hyphens instead`;

    if (instruction) {
      prompt += `\n\nAdditional instruction from the estimator: ${instruction}`;
    }
    if (value && instruction) {
      prompt += `\n\nCurrent text to improve:\n${value}`;
    }
    return prompt;
  };

  const generateVision = async (instruction = "") => {
    setGenerating(true);
    try {
      const text = await callAnthropic({
        max_tokens: 600,
        temperature: 0.5,
        messages: [{ role: "user", content: buildPrompt(instruction) }],
      });
      setProposalText("projectVision", text.trim());
    } catch {
      setProposalText("projectVision", "Failed to generate — check API key in Settings.");
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate once on mount if empty
  useEffect(() => {
    if (!value && !generating && !didAutoGenerate.current) {
      didAutoGenerate.current = true;
      generateVision();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ marginBottom: space.lg, pageBreakInside: "avoid" }}>
      {/* Section label */}
      <div style={{
        ...type.label, fontFamily: font, color: color.accent,
        marginBottom: space.md,
      }}>
        PROJECT VISION
      </div>

      {/* Accent sidebar with content */}
      <div style={{
        borderLeft: `3px solid ${color.accent}`,
        paddingLeft: space.md,
      }}>
        {generating ? (
          <div style={{ ...type.body, fontFamily: font, color: color.textDim, fontStyle: "italic" }}>
            Composing project vision...
          </div>
        ) : (
          <textarea
            value={value}
            onChange={e => setProposalText("projectVision", e.target.value)}
            placeholder="A narrative about the project's vision and context..."
            rows={8}
            style={{
              width: "100%", fontSize: type.body?.fontSize || 12, fontFamily: font,
              lineHeight: type.body?.lineHeight || 1.8,
              border: "1px dashed transparent", borderRadius: 3, padding: "2px 4px",
              background: "transparent", color: color.text, resize: "vertical", outline: "none",
            }}
            onFocus={e => { e.target.style.borderColor = "#ccc"; }}
            onBlur={e => { e.target.style.borderColor = "transparent"; }}
            className="no-print-border"
          />
        )}

        {/* NOVA instruction bar */}
        <NovaInstructionBar
          onRegenerate={generateVision}
          generating={generating}
          color={color}
          font={font}
        />
      </div>

      {/* Pull quote — extract first sentence as a highlighted quote */}
      {value && type.pullQuote && (
        <div style={{
          ...type.pullQuote, fontFamily: headingFont, color: color.accent,
          margin: `${space.lg}px ${space.md}px`,
          paddingLeft: space.md,
          borderLeft: `2px solid ${color.accentLight}`,
        }}>
          {value.split(/[.!?]/)[0]?.trim()}.
        </div>
      )}
    </div>
  );
}
