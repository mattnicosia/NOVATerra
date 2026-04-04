import { useState, useEffect, useCallback } from 'react';
import { useReportsStore } from '@/stores/reportsStore';
import { callAnthropic, NARRATIVE_MODEL } from '@/utils/ai';
import { fmt } from '@/utils/format';
import { T } from '@/utils/designTokens';

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

export default function CoverLetterSection({ data }) {
  const { project, companyInfo, totals, items, masterData } = data;
  const coverLetterText = useReportsStore(s => s.coverLetterText);
  const setCoverLetterText = useReportsStore(s => s.setCoverLetterText);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

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
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a2e", letterSpacing: 0.5 }}>{companyName}</div>
        )}
        {companyInfo?.address && (
          <div style={{ fontSize: 10, color: "#888" }}>
            {companyInfo.address}{companyInfo?.city ? `, ${companyInfo.city}` : ""}{companyInfo?.state ? `, ${companyInfo.state}` : ""} {companyInfo?.zip || ""}
          </div>
        )}
        {(companyInfo?.phone || companyInfo?.email) && (
          <div style={{ fontSize: 10, color: "#888" }}>
            {companyInfo.phone}{companyInfo?.email ? ` \u2022 ${companyInfo.email}` : ""}
          </div>
        )}
      </div>

      {/* Date */}
      <div style={{ fontSize: 11, color: "#444", marginBottom: 20 }}>{dateStr}</div>

      {/* RE line */}
      <div style={{ fontSize: 11, fontWeight: 600, color: "#1a1a2e", marginBottom: 16 }}>
        RE: {project.name || "Project Estimate"} — {buildingType} Estimate
      </div>

      {/* Salutation */}
      <div style={{ fontSize: 11, color: "#222", marginBottom: 12 }}>
        Dear {clientName},
      </div>

      {/* AI-generated body (editable) */}
      {loading ? (
        <div style={{ padding: "12px 0", fontSize: 11, color: "#999", fontStyle: "italic" }}>
          Generating cover letter...
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <textarea
            value={coverLetterText || ""}
            onChange={e => setCoverLetterText(e.target.value)}
            rows={6}
            style={{
              width: "100%", fontSize: 11, fontFamily: T.font.sans, lineHeight: 1.7,
              border: "1px dashed transparent", borderRadius: 3, padding: "4px 6px",
              background: "transparent", color: "#333", resize: "vertical", outline: "none",
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
              position: "absolute", top: -24, right: 0, fontSize: 9, color: "#999",
              background: "none", border: "none", cursor: "pointer", padding: "2px 6px",
            }}
          >
            {loading ? "..." : "\u21BB Regenerate"}
          </button>
        </div>
      )}

      {/* Closing */}
      <div style={{ marginTop: 20, fontSize: 11, color: "#222", lineHeight: 1.7 }}>
        We appreciate the opportunity to provide this estimate and look forward to discussing it further.
      </div>

      {/* Signature block */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 11, color: "#222" }}>Sincerely,</div>
        <div style={{ marginTop: 32, borderTop: "1px solid #ccc", width: 220, paddingTop: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a2e" }}>{companyName}</div>
          {companyInfo?.phone && <div style={{ fontSize: 10, color: "#888" }}>{companyInfo.phone}</div>}
          {companyInfo?.email && <div style={{ fontSize: 10, color: "#888" }}>{companyInfo.email}</div>}
        </div>
      </div>

      {/* Visual separator before rest of proposal */}
      <div style={{ marginTop: 32, borderBottom: "2px solid #1a1a2e" }} />
    </div>
  );
}
