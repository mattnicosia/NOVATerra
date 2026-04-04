import { today } from "@/utils/format";

export default function Letterhead({ data, proposalStyles: PS, sectionNumber }) {
  const { companyInfo, masterData, project, activeEstimateId } = data;
  const ci = companyInfo || masterData.companyInfo;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", accent: "#1a1a2e", border: "#ddd" };
  const space = PS?.space || { sm: 8, md: 16, section: 28 };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: space.section || 28,
        paddingBottom: space.md || 16,
        paddingLeft: space.md || 16,
        borderLeft: `4px solid ${color.accent}`,
        borderBottom: `1px solid ${color.borderLight || "#eee"}`,
      }}
    >
      <div>
        {ci?.logo ? (
          <img src={ci.logo} alt="Logo" style={{ maxHeight: 60, maxWidth: 200, marginBottom: 6 }} />
        ) : (
          <div style={{ ...type.title, fontFamily: font, color: color.text, fontSize: type.title?.fontSize || 20, fontWeight: type.title?.fontWeight || 800, letterSpacing: 1 }}>
            {ci?.name || "YOUR COMPANY"}
          </div>
        )}
        <div style={{ ...type.caption, fontFamily: font, color: color.textDim, fontSize: type.caption?.fontSize || 10 }}>
          {ci?.address}
          {ci?.city ? `, ${ci.city}` : ""}
          {ci?.state ? `, ${ci.state}` : ""} {ci?.zip || ""}
        </div>
        <div style={{ ...type.caption, fontFamily: font, color: color.textDim, fontSize: type.caption?.fontSize || 10 }}>
          {ci?.phone}
          {ci?.email ? ` \u2022 ${ci.email}` : ""}
        </div>
        {ci?.licenseNo && <div style={{ ...type.caption, fontFamily: font, color: color.textMuted || "#888", fontSize: type.caption?.fontSize ? type.caption.fontSize - 1 : 9 }}>License #{ci.licenseNo}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ ...type.caption, fontFamily: font, color: color.textDim, fontSize: type.caption?.fontSize || 10 }}>{project.date || today()}</div>
        <div style={{ ...type.caption, fontFamily: font, color: color.textMuted || "#888", fontSize: type.caption?.fontSize ? type.caption.fontSize - 1 : 9, marginTop: 2 }}>
          Estimate #{activeEstimateId?.substring(0, 6).toUpperCase()}
        </div>
      </div>
    </div>
  );
}
