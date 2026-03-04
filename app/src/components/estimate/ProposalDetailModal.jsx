import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/stores/authStore";
import { useUiStore } from "@/stores/uiStore";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import ScopeGapReport from "./ScopeGapReport";

const fmt = v =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v || 0);

export default function ProposalDetailModal({ proposal, onClose, estimateItems, projectName, packageName }) {
  const C = useTheme();
  const T = C.T;
  const [activeTab, setActiveTab] = useState("details");
  const [downloading, setDownloading] = useState(false);

  if (!proposal) return null;

  const pd = proposal.parsedData || {};
  const lineItems = pd.lineItems || [];
  const inclusions = pd.inclusions || [];
  const exclusions = pd.exclusions || [];
  const alternates = pd.alternates || [];
  const qualifications = pd.qualifications || [];

  const confidencePct = Math.round((pd.confidence || 0) * 100);
  const confidenceColor = confidencePct >= 80 ? "#30D158" : confidencePct >= 50 ? "#FF9F0A" : "#FF453A";
  const subName = pd.subcontractorName || proposal.subCompany || "Unknown Sub";
  const hasEstimate = estimateItems && estimateItems.length > 0;

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const token = useAuthStore.getState().session?.access_token;
      if (!token) throw new Error("Not authenticated");
      const resp = await fetch("/api/proposal-download", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ proposalId: proposal.id }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "Download failed");
      }
      const { url, filename } = await resp.json();
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("[ProposalDetailModal] Download error:", err);
      useUiStore.getState().showToast(err.message || "Download failed", "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal onClose={onClose} extraWide>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "linear-gradient(135deg, rgba(48,209,88,0.2), rgba(48,209,88,0.05))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ic d={I.estimate} size={18} color="#30D158" />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: 0 }}>{subName}</h3>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
            {proposal.filename || "proposal.pdf"}
            {pd.confidence != null && (
              <span style={{ marginLeft: 8 }}>
                · Confidence: <span style={{ color: confidenceColor, fontWeight: 600 }}>{confidencePct}%</span>
              </span>
            )}
          </div>
        </div>
        {pd.totalBid && (
          <div
            style={{
              background: "rgba(48,209,88,0.1)",
              border: "1px solid rgba(48,209,88,0.2)",
              borderRadius: 10,
              padding: "8px 16px",
            }}
          >
            <div
              style={{
                color: "#8E8E93",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              Total Bid
            </div>
            <div style={{ color: "#30D158", fontSize: 20, fontWeight: 700 }}>{fmt(pd.totalBid)}</div>
          </div>
        )}
      </div>

      {/* Tab Bar */}
      {hasEstimate && (pd.lineItems?.length > 0 || pd.exclusions?.length > 0) && (
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 16,
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          {[
            { key: "details", label: "Details" },
            { key: "gaps", label: "Scope Gaps", icon: I.shield },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: "none",
                border: "none",
                padding: "8px 16px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                color: activeTab === tab.key ? C.accent : C.textMuted,
                borderBottom: activeTab === tab.key ? `2px solid ${C.accent}` : "2px solid transparent",
                marginBottom: -1,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {tab.icon && <Ic d={tab.icon} size={13} color={activeTab === tab.key ? C.accent : C.textMuted} />}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ maxHeight: 480, overflowY: "auto" }}>
        {activeTab === "gaps" && hasEstimate ? (
          <ScopeGapReport
            estimateItems={estimateItems}
            parsedProposal={pd}
            projectName={projectName}
            packageName={packageName}
            subName={subName}
          />
        ) : (
          <>
            {/* Details tab content — original body */}
            {/* Line Items */}
            {lineItems.length > 0 && (
              <Section title="Line Items" count={lineItems.length}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th style={thStyle(C)}>CSI</th>
                      <th style={{ ...thStyle(C), textAlign: "left" }}>Description</th>
                      <th style={thStyle(C)}>Qty</th>
                      <th style={thStyle(C)}>Unit</th>
                      <th style={thStyle(C)}>Unit Price</th>
                      <th style={thStyle(C)}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}15` }}>
                        <td style={tdStyle(C)}>
                          {item.csiCode && (
                            <span
                              style={{
                                background: `${C.accent}20`,
                                color: C.accent,
                                padding: "1px 6px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {item.csiCode}
                            </span>
                          )}
                        </td>
                        <td style={{ ...tdStyle(C), textAlign: "left", color: C.text }}>{item.description}</td>
                        <td style={tdStyle(C)}>{item.quantity || "—"}</td>
                        <td style={tdStyle(C)}>{item.unit || "—"}</td>
                        <td style={tdStyle(C)}>{item.unitPrice ? fmt(item.unitPrice) : "—"}</td>
                        <td style={{ ...tdStyle(C), color: C.text, fontWeight: 500 }}>
                          {item.amount ? fmt(item.amount) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* Inclusions / Exclusions side by side */}
            {(inclusions.length > 0 || exclusions.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {inclusions.length > 0 && (
                  <Section title="Inclusions" count={inclusions.length} color="#30D158">
                    {inclusions.map((item, i) => (
                      <BulletItem key={i} text={item} color="#30D158" />
                    ))}
                  </Section>
                )}
                {exclusions.length > 0 && (
                  <Section title="Exclusions" count={exclusions.length} color="#FF453A">
                    {exclusions.map((item, i) => (
                      <BulletItem key={i} text={item} color="#FF453A" />
                    ))}
                  </Section>
                )}
              </div>
            )}

            {/* Alternates */}
            {alternates.length > 0 && (
              <Section title="Alternates" count={alternates.length} color="#FF9F0A">
                {alternates.map((alt, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom: `1px solid ${C.border}10`,
                    }}
                  >
                    <span style={{ color: C.text, fontSize: 13 }}>{alt.description}</span>
                    <span
                      style={{
                        color: alt.type === "deduct" ? "#30D158" : "#FF9F0A",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {alt.type === "deduct" ? "−" : "+"}
                      {alt.amount ? fmt(alt.amount) : "TBD"}
                    </span>
                  </div>
                ))}
              </Section>
            )}

            {/* Qualifications */}
            {qualifications.length > 0 && (
              <Section title="Qualifications & Conditions" count={qualifications.length}>
                {qualifications.map((q, i) => (
                  <BulletItem key={i} text={q} />
                ))}
              </Section>
            )}

            {/* Other Details */}
            {(pd.paymentTerms || pd.validityPeriod || pd.scheduleDuration || pd.bondIncluded != null) && (
              <Section title="Additional Details">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {pd.paymentTerms && <DetailCell label="Payment Terms" value={pd.paymentTerms} />}
                  {pd.validityPeriod && <DetailCell label="Valid For" value={pd.validityPeriod} />}
                  {pd.scheduleDuration && <DetailCell label="Schedule" value={pd.scheduleDuration} />}
                  {pd.bondIncluded != null && (
                    <DetailCell label="Bond" value={pd.bondIncluded ? "Included" : "Not Included"} />
                  )}
                  {pd.insuranceIncluded != null && (
                    <DetailCell label="Insurance" value={pd.insuranceIncluded ? "Included" : "Not Included"} />
                  )}
                </div>
              </Section>
            )}

            {/* Contact Info */}
            {(pd.subcontractorContact || pd.subcontractorEmail || pd.subcontractorPhone) && (
              <Section title="Contact Info">
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8 }}>
                  {pd.subcontractorContact && <div>{pd.subcontractorContact}</div>}
                  {pd.subcontractorEmail && <div style={{ color: C.accent }}>{pd.subcontractorEmail}</div>}
                  {pd.subcontractorPhone && <div style={{ color: C.textMuted }}>{pd.subcontractorPhone}</div>}
                </div>
              </Section>
            )}

            {/* Parse status */}
            {proposal.parseStatus === "error" && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  background: "rgba(255,69,58,0.08)",
                  border: "1px solid rgba(255,69,58,0.15)",
                  color: "#FF453A",
                  fontSize: 13,
                  marginTop: 12,
                }}
              >
                Parse error: {proposal.parseError || "Unknown error"}
              </div>
            )}

            {proposal.parseStatus === "pending" && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  background: "rgba(124,92,252,0.08)",
                  border: "1px solid rgba(124,92,252,0.15)",
                  color: C.accent,
                  fontSize: 13,
                  marginTop: 12,
                }}
              >
                Proposal is being parsed by AI... Check back shortly.
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 16,
          paddingTop: 12,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{
            background: "none",
            border: `1px solid ${C.accent}30`,
            color: C.accent,
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: downloading ? "wait" : "pointer",
            opacity: downloading ? 0.6 : 1,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Ic d={I.download} size={13} color={C.accent} />
          {downloading ? "Downloading…" : "Download PDF"}
        </button>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: `1px solid ${C.border}`,
            color: C.textMuted,
            borderRadius: 8,
            padding: "8px 20px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

// ── Helpers ──

function Section({ title, count, color, children }) {
  const C = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: color || C.textMuted,
          marginBottom: 8,
        }}
      >
        {title}
        {count != null && <span style={{ opacity: 0.6 }}>({count})</span>}
      </div>
      {children}
    </div>
  );
}

function BulletItem({ text, color }) {
  const C = useTheme();
  return (
    <div style={{ display: "flex", gap: 8, padding: "3px 0", fontSize: 13, color: C.text }}>
      <span style={{ color: color || C.textMuted, flexShrink: 0 }}>•</span>
      <span>{text}</span>
    </div>
  );
}

function DetailCell({ label, value }) {
  const C = useTheme();
  return (
    <div style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)" }}>
      <div
        style={{
          color: C.textDim,
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.3,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ color: C.text, fontSize: 13 }}>{value}</div>
    </div>
  );
}

const thStyle = C => ({
  padding: "8px 6px",
  textAlign: "right",
  fontSize: 11,
  fontWeight: 600,
  color: C.textDim,
  textTransform: "uppercase",
  letterSpacing: 0.3,
});

const tdStyle = C => ({
  padding: "8px 6px",
  textAlign: "right",
  color: C.textMuted,
});
