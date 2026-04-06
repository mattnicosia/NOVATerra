import { useState, useMemo, useEffect, useRef } from "react";
import { useReportsStore } from "@/stores/reportsStore";
import { callAnthropic } from "@/utils/ai";
import NovaInstructionBar from "../NovaInstructionBar";

export default function DesignNarrative({ data, proposalStyles: PS }) {
  const { project, items, totals, divTotals } = data;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const headingFont = PS?.font?.heading || font;
  const mono = PS?.font?.mono || "monospace";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", accent: "#1a1a2e", bgSubtle: "#f8f9fa" };
  const space = PS?.space || { sm: 8, md: 16, lg: 24 };

  const proposalText = useReportsStore(s => s.proposalText);
  const setProposalText = useReportsStore(s => s.setProposalText);
  const narrative = proposalText.designNarrative || "";
  const [generating, setGenerating] = useState(false);
  const didAutoGenerate = useRef(false);

  // Find top 5 cost drivers
  const topDrivers = useMemo(() => {
    if (!divTotals) return [];
    const DIV_LABELS = {
      "01": "General Conditions", "02": "Demolition", "03": "Concrete", "04": "Masonry",
      "05": "Structural Steel", "06": "Wood & Carpentry", "07": "Thermal & Moisture",
      "08": "Openings", "09": "Finishes", "10": "Specialties", "11": "Equipment",
      "14": "Conveying", "21": "Fire Suppression", "22": "Plumbing", "23": "HVAC",
      "26": "Electrical", "27": "Communications", "28": "Safety", "31": "Earthwork",
      "32": "Site Improvements", "33": "Utilities",
    };
    const grand = totals?.grand || totals?.grandTotal || totals?.total || 1;
    return Object.entries(divTotals)
      .map(([div, val]) => {
        const amount = typeof val === "number" ? val : val?.total || val?.mid || 0;
        const code = div.match(/^(\d{2})/)?.[1] || "";
        const label = DIV_LABELS[code] || div.replace(/^\d{2}\s*-\s*/, "") || `Division ${div}`;
        return { div, code, label, amount, pct: (amount / grand) * 100 };
      })
      .filter(d => d.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [divTotals, totals]);

  const generateNarrative = async (instruction = "") => {
    setGenerating(true);
    try {
      const projectName = project?.name || project?.projectName || "the project";
      const buildingType = project?.buildingType || project?.workType || "";
      const totalCost = totals?.grand || totals?.grandTotal || totals?.total || 0;
      const driversText = topDrivers
        .map(d => `${d.label} (Division ${d.div}): $${d.amount.toLocaleString()} — ${d.pct.toFixed(1)}% of total`)
        .join("\n");

      let prompt = `Write a "Design Narrative" section for an architectural-style construction proposal. This section connects the building's design decisions to their cost implications. It should read like an architecture critic explaining why the building costs what it costs — connecting physical decisions to financial outcomes. 3-4 paragraphs.

Project: ${projectName}
Type: ${buildingType}
Total: $${Math.round(totalCost).toLocaleString()}

Top 5 cost drivers:
${driversText}

Rules:
- For each major cost driver, explain the design decision that creates that cost
- Example: "The structural steel frame (Division 05) — representing 18% of the project — enables the client's vision for column-free floor plates spanning 40 feet..."
- Connect costs to design intent, not just materials
- Professional, architectural language — not accounting language
- Include the dollar amount and percentage for each cost driver discussed
- Make the client understand WHY the building costs what it does
- Return ONLY the paragraphs, no titles
- NEVER use em dashes (\u2014) or en dashes (\u2013). Use commas, periods, or hyphens instead`;

      if (instruction) {
        prompt += `\n\nAdditional instruction from the estimator: ${instruction}`;
      }
      if (narrative && instruction) {
        prompt += `\n\nCurrent text to improve:\n${narrative}`;
      }

      const text = await callAnthropic({
        max_tokens: 700,
        temperature: 0.5,
        messages: [{ role: "user", content: prompt }],
      });
      setProposalText("designNarrative", text.trim());
    } catch {
      setProposalText("designNarrative", "Failed to generate — check API key in Settings.");
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate once on mount if empty
  useEffect(() => {
    if (!narrative && !generating && !didAutoGenerate.current && topDrivers.length > 0) {
      didAutoGenerate.current = true;
      generateNarrative();
    }
  }, [topDrivers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ marginBottom: space.lg, pageBreakInside: "avoid" }}>
      {/* Section label */}
      <div style={{
        ...type.label, fontFamily: font, color: color.accent,
        marginBottom: space.md,
      }}>
        DESIGN NARRATIVE
      </div>

      {/* Subtitle */}
      <div style={{
        ...(type.h1 || {}), fontFamily: headingFont, color: color.text,
        marginBottom: space.md, fontSize: type.h1?.fontSize || 18,
      }}>
        How Design Decisions Shape Cost
      </div>

      {/* Narrative text */}
      {generating ? (
        <div style={{ ...type.body, fontFamily: font, color: color.textDim, fontStyle: "italic" }}>
          Composing design narrative...
        </div>
      ) : (
        <textarea
          value={narrative}
          onChange={e => setProposalText("designNarrative", e.target.value)}
          placeholder="A narrative connecting design decisions to cost outcomes..."
          rows={12}
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
        onRegenerate={generateNarrative}
        generating={generating}
        color={color}
        font={font}
      />

      {/* Cost driver summary strip */}
      {topDrivers.length > 0 && (
        <div style={{
          display: "flex", gap: space.sm, marginTop: space.lg,
          flexWrap: "wrap",
        }}>
          {topDrivers.map(d => (
            <div key={d.div} style={{
              flex: "1 1 120px",
              padding: `${space.sm}px ${space.md}px`,
              background: color.bgSubtle,
              borderRadius: 4,
              borderTop: `2px solid ${color.accent}`,
              textAlign: "center",
            }}>
              <div style={{ ...type.label, fontFamily: font, color: color.textDim, marginBottom: 4 }}>
                {d.label}
              </div>
              <div style={{ fontFamily: mono, fontSize: type.money?.fontSize || 13, fontWeight: 700, color: color.text }}>
                ${(d.amount / 1000).toFixed(0)}K
              </div>
              <div style={{ fontSize: 9, color: color.textDim, marginTop: 2 }}>
                {d.pct.toFixed(1)}%
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
