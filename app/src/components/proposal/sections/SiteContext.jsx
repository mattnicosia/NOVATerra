import { useState, useMemo, useEffect, useRef } from "react";
import { useReportsStore } from "@/stores/reportsStore";
import { callAnthropic } from "@/utils/ai";
import NovaInstructionBar from "../NovaInstructionBar";

/** Static Mapbox image URL for a given address */
function getMapImageUrl(address, width = 560, height = 280) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token || !address) return null;
  const encoded = encodeURIComponent(address);
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/pin-s+333(${encoded})/${encoded},14,0/${width}x${height}@2x?access_token=${token}`;
}

export default function SiteContext({ data, proposalStyles: PS }) {
  const { project } = data;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", accent: "#1a1a2e", bgSubtle: "#f8f9fa" };
  const space = PS?.space || { sm: 8, md: 16, lg: 24 };

  const proposalText = useReportsStore(s => s.proposalText);
  const setProposalText = useReportsStore(s => s.setProposalText);
  const siteNarrative = proposalText.siteContext || "";
  const [generating, setGenerating] = useState(false);
  const didAutoGenerate = useRef(false);

  const address = project?.address || "";
  const mapUrl = useMemo(() => getMapImageUrl(address), [address]);

  const projectDetails = useMemo(() => {
    const details = [];
    if (project?.buildingType || project?.workType) details.push({ label: "Building Type", value: project.buildingType || project.workType });
    if (project?.projectSF) details.push({ label: "Gross Area", value: `${project.projectSF.toLocaleString()} SF` });
    const storyCount = project?.stories || (Array.isArray(project?.floors) ? project.floors.length : project?.floors);
    if (storyCount) details.push({ label: "Stories", value: String(storyCount) });
    if (project?.architect) details.push({ label: "Architect", value: project.architect });
    if (project?.client) details.push({ label: "Owner", value: project.client });
    if (address) details.push({ label: "Location", value: address });
    return details;
  }, [project, address]);

  const generateSiteNarrative = async (instruction = "") => {
    if (!address && !project?.name) return;
    setGenerating(true);
    try {
      let prompt = `Write a brief site context paragraph (2-3 sentences) for a construction proposal. Describe the project location and its surrounding context in architectural language.

Project: ${project?.name || ""}
Address: ${address}
Type: ${project?.buildingType || project?.workType || ""}
Size: ${project?.projectSF ? `${project.projectSF.toLocaleString()} SF` : ""}

Rules:
- Reference the neighborhood, accessibility, and surrounding context if the address provides enough info
- If the address is generic, focus on the project's typology and scale
- Professional, concise, architectural tone
- Return ONLY the paragraph text
- NEVER use em dashes (\u2014) or en dashes (\u2013). Use commas, periods, or hyphens instead`;

      if (instruction) {
        prompt += `\n\nAdditional instruction from the estimator: ${instruction}`;
      }
      if (siteNarrative && instruction) {
        prompt += `\n\nCurrent text to improve:\n${siteNarrative}`;
      }

      const text = await callAnthropic({
        max_tokens: 300,
        temperature: 0.4,
        messages: [{ role: "user", content: prompt }],
      });
      setProposalText("siteContext", text.trim());
    } catch {
      setProposalText("siteContext", "");
    } finally {
      setGenerating(false);
    }
  };

  // Auto-generate once on mount if empty
  useEffect(() => {
    if (!siteNarrative && !generating && !didAutoGenerate.current && (address || project?.name)) {
      didAutoGenerate.current = true;
      generateSiteNarrative();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ marginBottom: space.lg, pageBreakInside: "avoid" }}>
      {/* Section label */}
      <div style={{
        ...type.label, fontFamily: font, color: color.accent,
        marginBottom: space.md,
      }}>
        SITE CONTEXT
      </div>

      {/* Map image */}
      {mapUrl && (
        <div style={{
          borderRadius: 4, overflow: "hidden", marginBottom: space.md,
          border: `1px solid ${color.borderLight || "#eee"}`,
        }}>
          <img
            src={mapUrl}
            alt={`Site map: ${address}`}
            style={{ width: "100%", height: "auto", display: "block" }}
            onError={e => { e.target.style.display = "none"; }}
          />
        </div>
      )}

      {/* Site narrative */}
      {generating ? (
        <div style={{ ...type.body, fontFamily: font, color: color.textDim, fontStyle: "italic", marginBottom: space.md }}>
          Composing site context...
        </div>
      ) : siteNarrative ? (
        <textarea
          value={siteNarrative}
          onChange={e => setProposalText("siteContext", e.target.value)}
          placeholder="Site context narrative..."
          rows={4}
          style={{
            width: "100%", fontSize: type.body?.fontSize || 12, fontFamily: font,
            lineHeight: type.body?.lineHeight || 1.8,
            border: "1px dashed transparent", borderRadius: 3, padding: "2px 4px",
            background: "transparent", color: color.textMed || "#444",
            resize: "vertical", outline: "none", marginBottom: space.sm,
          }}
          onFocus={e => { e.target.style.borderColor = "#ccc"; }}
          onBlur={e => { e.target.style.borderColor = "transparent"; }}
          className="no-print-border"
        />
      ) : null}

      {/* NOVA instruction bar */}
      <NovaInstructionBar
        onRegenerate={generateSiteNarrative}
        generating={generating}
        color={color}
        font={font}
      />

      {/* Project details grid */}
      {projectDetails.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: `${space.sm}px ${space.md}px`,
          padding: space.md,
          background: color.bgSubtle,
          borderRadius: 4,
          border: `1px solid ${color.borderLight || "#eee"}`,
          marginTop: space.md,
        }}>
          {projectDetails.map(d => (
            <div key={d.label}>
              <div style={{ ...type.label, fontFamily: font, color: color.textDim, marginBottom: 2 }}>
                {d.label}
              </div>
              <div style={{ fontSize: type.body?.fontSize || 12, fontWeight: 600, color: color.text, fontFamily: font }}>
                {d.value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
