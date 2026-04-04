import { useState, useEffect, useCallback } from 'react';
import { useReportsStore } from '@/stores/reportsStore';
import { callAnthropic, NARRATIVE_MODEL } from '@/utils/ai';
import { fmt } from '@/utils/format';

// Generate cover letter body via AI from project context
async function generateCoverLetter(project, items, totalCost, companyName) {
  const divisionSet = new Set(items.map(i => i.division?.substring(0, 2)).filter(Boolean));
  const prompt = `Write a brief, professional construction estimate cover letter (2 short paragraphs max).
Project: ${project.name || "Unnamed Project"}
Client: ${project.client || "Owner"}
Type: ${project.buildingType || project.jobType || "Commercial"}
Size: ${project.projectSF ? project.projectSF.toLocaleString() + " SF" : "N/A"}
Total Estimate: $${Math.round(totalCost).toLocaleString()}
Items: ${items.length} line items across ${divisionSet.size} CSI divisions
Company: ${companyName || "Our company"}

Keep it concise, professional, construction-industry tone. No placeholder brackets — use the actual data provided. Return just the letter body text, no headers, dates, RE line, or signatures.`;

  return callAnthropic({
    model: NARRATIVE_MODEL,
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });
}

export default function CoverLetterSection({ data, proposalStyles: PS }) {
  const { project, companyInfo, totals, items, masterData } = data;
  const coverLetterText = useReportsStore(s => s.coverLetterText);
  const setCoverLetterText = useReportsStore(s => s.setCoverLetterText);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const font = PS?.font?.body || "'Inter', sans-serif";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", textMed: "#333", accent: "#1a1a2e", textMuted: "#888" };

  const client = masterData.clients?.find(c => c.company === project.client);
  const clientName = client?.contact || project.client || "Sir/Madam";
  const companyName = companyInfo?.name || "Our Company";
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const buildingType = project.buildingType || project.jobType || "Construction";

  // Auto-generate on first render if no text cached
  const handleGenerate = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const text = await generateCoverLetter(project, items, totals.grand, companyName);
      setCoverLetterText(text);
      setGenerated(true);
    } catch (err) {
      console.error("[CoverLetter] AI generation failed:", err);
      // Fallback template
      setCoverLetterText(
        `We are pleased to submit the enclosed estimate for ${project.name || "this project"} in the amount of ${fmt(totals.grand)}. This estimate is based on our review of the plans, specifications, and site conditions as provided.\n\nOur pricing includes all labor, materials, and equipment necessary to complete the scope of work as outlined herein. We look forward to the opportunity to discuss this estimate and answer any questions you may have.`
      );
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }, [project, items, totals.grand, companyName, loading, setCoverLetterText]);

  useEffect(() => {
    if (!coverLetterText && !generated && !loading) {
      handleGenerate();
    }
  }, [coverLetterText, generated, loading, handleGenerate]);

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Company name / logo */}
      <div style={{ marginBottom: 24 }}>
        {companyInfo?.logo ? (
          <img src={companyInfo.logo} alt="" style={{ maxHeight: 48, maxWidth: 200, marginBottom: 8 }} />
        ) : (
          <div style={{ ...type.h1, fontFamily: font, color: color.text, fontSize: type.h1?.fontSize || 16, fontWeight: type.h1?.fontWeight || 700, letterSpacing: 0.5 }}>{companyName}</div>
        )}
        {companyInfo?.address && (
          <div style={{ ...type.caption, fontFamily: font, color: color.textMuted || "#888", fontSize: type.caption?.fontSize || 10 }}>
            {companyInfo.address}{companyInfo?.city ? `, ${companyInfo.city}` : ""}{companyInfo?.state ? `, ${companyInfo.state}` : ""} {companyInfo?.zip || ""}
          </div>
        )}
        {(companyInfo?.phone || companyInfo?.email) && (
          <div style={{ ...type.caption, fontFamily: font, color: color.textMuted || "#888", fontSize: type.caption?.fontSize || 10 }}>
            {companyInfo.phone}{companyInfo?.email ? ` \u2022 ${companyInfo.email}` : ""}
          </div>
        )}
      </div>

      {/* Date */}
      <div style={{ ...type.body, fontFamily: font, color: color.textMed || "#444", fontSize: type.body?.fontSize || 11, marginBottom: 20 }}>{dateStr}</div>

      {/* RE line */}
      <div style={{ ...type.body, fontFamily: font, fontWeight: 600, color: color.text, fontSize: type.body?.fontSize || 11, marginBottom: 16 }}>
        RE: {project.name || "Project Estimate"} — {buildingType} Estimate
      </div>

      {/* Salutation */}
      <div style={{ ...type.body, fontFamily: font, color: color.text, fontSize: type.body?.fontSize || 11, marginBottom: 12 }}>
        Dear {clientName},
      </div>

      {/* AI-generated body (editable) */}
      {loading ? (
        <div style={{ padding: "12px 0", fontSize: 11, fontFamily: font, color: color.textDim, fontStyle: "italic" }}>
          Generating cover letter...
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <textarea
            value={coverLetterText || ""}
            onChange={e => setCoverLetterText(e.target.value)}
            rows={6}
            style={{
              width: "100%", fontSize: 11, fontFamily: font, lineHeight: 1.7,
              border: "1px dashed transparent", borderRadius: 3, padding: "4px 6px",
              background: "transparent", color: color.textMed || "#333", resize: "vertical", outline: "none",
            }}
            onFocus={e => { e.target.style.borderColor = "#ccc"; }}
            onBlur={e => { e.target.style.borderColor = "transparent"; }}
            className="no-print-border"
          />
          {/* Regenerate button (no-print) */}
          <button
            className="no-print"
            onClick={handleGenerate}
            disabled={loading}
            style={{
              position: "absolute", top: -24, right: 0, fontSize: 9, color: color.accent,
              background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
            }}
          >
            {loading ? "..." : "\u21BB Regenerate"}
          </button>
        </div>
      )}

      {/* Closing */}
      <div style={{ marginTop: 20, ...type.body, fontFamily: font, color: color.text, fontSize: type.body?.fontSize || 11, lineHeight: 1.7 }}>
        We appreciate the opportunity to provide this estimate and look forward to discussing it further.
      </div>

      {/* Signature block */}
      <div style={{ marginTop: 28 }}>
        <div style={{ ...type.body, fontFamily: font, color: color.text, fontSize: type.body?.fontSize || 11 }}>Sincerely,</div>
        <div style={{ marginTop: 32, borderTop: `1px solid ${color.accent}`, width: 220, paddingTop: 6 }}>
          <div style={{ ...type.h1, fontFamily: font, color: color.text, fontSize: type.h1?.fontSize || 12, fontWeight: type.h1?.fontWeight || 600 }}>{companyName}</div>
          {companyInfo?.phone && <div style={{ ...type.caption, fontFamily: font, color: color.textMuted || "#888", fontSize: type.caption?.fontSize || 10 }}>{companyInfo.phone}</div>}
          {companyInfo?.email && <div style={{ ...type.caption, fontFamily: font, color: color.textMuted || "#888", fontSize: type.caption?.fontSize || 10 }}>{companyInfo.email}</div>}
        </div>
      </div>

      {/* Visual separator before rest of proposal */}
      <div style={{ marginTop: 32, borderBottom: `2px solid ${color.accent}` }} />
    </div>
  );
}
