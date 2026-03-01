import { today } from '@/utils/format';

export default function Letterhead({ data }) {
  const { companyInfo, masterData, project, activeEstimateId, T } = data;
  // Use resolved companyInfo (project-specific profile) or fall back to masterData.companyInfo
  const ci = companyInfo || masterData.companyInfo;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, paddingBottom: 16, borderBottom: "3px solid #1a1a2e" }}>
      <div>
        {ci?.logo ? (
          <img src={ci.logo} alt="Logo" style={{ maxHeight: 60, maxWidth: 200, marginBottom: 6 }} />
        ) : (
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1a1a2e", letterSpacing: 1 }}>{ci?.name || "YOUR COMPANY"}</div>
        )}
        <div style={{ fontSize: 10, color: "#666" }}>{ci?.address}{ci?.city ? `, ${ci.city}` : ""}{ci?.state ? `, ${ci.state}` : ""} {ci?.zip || ""}</div>
        <div style={{ fontSize: 10, color: "#666" }}>{ci?.phone}{ci?.email ? ` \u2022 ${ci.email}` : ""}</div>
        {ci?.licenseNo && <div style={{ fontSize: 9, color: "#888" }}>License #{ci.licenseNo}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 10, color: "#666" }}>{project.date || today()}</div>
        <div style={{ fontSize: 9, color: "#888", marginTop: 2 }}>Estimate #{activeEstimateId?.substring(0, 6).toUpperCase()}</div>
      </div>
    </div>
  );
}
