// ============================================================
// Publish Panel — Modal for creating/publishing Living Proposals
// Used from within the Estimate view
// ============================================================

import { useState, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useLivingProposalStore } from "@/stores/livingProposalStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore } from "@/stores/orgStore";

export default function PublishPanel({ onClose }) {
  const C = useTheme();
  const T = C.T;

  const store = useLivingProposalStore();
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const project = useProjectStore();
  const user = useAuthStore(s => s.user);
  const org = useOrgStore(s => s.org);

  // Check if this estimate OR its parent has a living proposal
  const currentEntry = estimatesIndex.find(e => e.id === activeId);
  const parentEstimateId = currentEntry?.parentEstimateId;
  const isRevision = !!parentEstimateId;

  // Look for existing proposal on this estimate or the parent (revision continuity)
  const existing = store.getForEstimate(activeId) || (parentEstimateId ? store.getForEstimate(parentEstimateId) : null);

  // Form state
  const [gcCompanyName, setGcCompanyName] = useState(org?.name || "");
  const [gcEmail, setGcEmail] = useState(user?.email || "");
  const [gcPhone, setGcPhone] = useState("");
  const [gcAccentColor, setGcAccentColor] = useState("#7C5CFC");
  const [ownerName, setOwnerName] = useState(project.owner || "");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [validDays, setValidDays] = useState(30);
  const [changeSummary, setChangeSummary] = useState("");

  // Result state
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const isNew = !existing;

  const handleCreate = async () => {
    try {
      const res = await store.create({
        estimateId: activeId,
        projectName: project.name || "Untitled Project",
        projectAddress: [project.address, project.city, project.state, project.zip].filter(Boolean).join(", "),
        gcCompanyName: gcCompanyName || "My Company",
        gcAccentColor,
        gcPhone,
        gcEmail,
        ownerName,
        ownerEmail,
        validDays: parseInt(validDays) || 30,
        orgId: org?.id,
      });
      // Auto-publish first version
      const pubRes = await store.publish(res.proposal.id, "Initial proposal");
      setResult({ url: pubRes.url, slug: res.proposal.slug, version: pubRes.version.version_number });
    } catch (err) {
      // error is in store.error
    }
  };

  const handlePublish = async () => {
    try {
      const res = await store.publish(existing.id, changeSummary || "Updated proposal");
      setResult({ url: res.url, version: res.version.version_number });
    } catch (err) {
      // error is in store.error
    }
  };

  const copyLink = () => {
    if (result?.url) {
      navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
    }}>
      <div style={{
        width: 520, maxHeight: "85vh", overflow: "auto",
        background: C.glassBg || C.bg1, border: `1px solid ${C.glassBorder || C.border}`,
        borderRadius: T.radius.lg, padding: 28,
        boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>
              {result ? "Proposal Published!" : isNew ? "Create Living Proposal" : "Publish Update"}
            </h2>
            <p style={{ fontSize: 12, color: C.textDim, margin: "4px 0 0" }}>
              {result
                ? `Version ${result.version} is live`
                : isNew
                  ? "Share an interactive, always-current proposal link"
                  : `Currently on v${existing.version_count}. Publish a new version.`
              }
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: C.textDim, fontSize: 20,
            cursor: "pointer", padding: "4px 8px", lineHeight: 1,
          }}>×</button>
        </div>

        {/* Success state */}
        {result && (
          <div>
            <div style={{
              padding: 20, borderRadius: 10,
              background: `${C.accent}10`, border: `1px solid ${C.accent}30`,
              marginBottom: 20,
            }}>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Share this link with the owner:</div>
              <div style={{
                display: "flex", gap: 8, alignItems: "center",
              }}>
                <input
                  readOnly
                  value={result.url}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 8,
                    background: C.bg2, border: `1px solid ${C.border}`,
                    color: C.text, fontSize: 13, fontFamily: "monospace",
                    outline: "none",
                  }}
                  onClick={e => e.target.select()}
                />
                <button onClick={copyLink} style={{
                  padding: "10px 18px", borderRadius: 8, border: "none",
                  background: C.accent, color: "#fff", fontSize: 13,
                  fontWeight: 600, cursor: "pointer", fontFamily: T.font.sans,
                  whiteSpace: "nowrap",
                }}>
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{
                padding: "10px 20px", borderRadius: 8,
                background: C.bg2, border: `1px solid ${C.border}`,
                color: C.text, fontSize: 13, fontWeight: 500,
                cursor: "pointer", fontFamily: T.font.sans,
              }}>Done</button>
            </div>
          </div>
        )}

        {/* Create form */}
        {!result && isNew && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Company Name" value={gcCompanyName} onChange={setGcCompanyName} C={C} T={T} />
              <div style={{ display: "flex", gap: 8 }}>
                <Field label="Email" value={gcEmail} onChange={setGcEmail} C={C} T={T} style={{ flex: 1 }} />
                <Field label="Phone" value={gcPhone} onChange={setGcPhone} C={C} T={T} style={{ flex: 1 }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Field label="Owner / Client Name" value={ownerName} onChange={setOwnerName} C={C} T={T} style={{ flex: 1 }} />
                <Field label="Owner Email" value={ownerEmail} onChange={setOwnerEmail} C={C} T={T} style={{ flex: 1 }} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Field label="Valid For (days)" value={validDays} onChange={setValidDays} type="number" C={C} T={T} style={{ flex: "0 0 120px" }} />
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.textDim, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Brand Color
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["#7C5CFC", "#30D158", "#FF9F0A", "#FF453A", "#5AC8FA", "#BF5AF2"].map(color => (
                      <button
                        key={color}
                        onClick={() => setGcAccentColor(color)}
                        style={{
                          width: 28, height: 28, borderRadius: 8, border: gcAccentColor === color ? `2px solid ${C.text}` : `1px solid ${C.border}`,
                          background: color, cursor: "pointer", padding: 0,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {store.error && (
              <div style={{ color: "#FF453A", fontSize: 12, marginTop: 12 }}>{store.error}</div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={onClose} style={{
                padding: "10px 20px", borderRadius: 8,
                background: "transparent", border: `1px solid ${C.border}`,
                color: C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: T.font.sans,
              }}>Cancel</button>
              <button
                onClick={handleCreate}
                disabled={store.creating || store.publishing}
                style={{
                  padding: "10px 24px", borderRadius: 8, border: "none",
                  background: C.accent, color: "#fff", fontSize: 13,
                  fontWeight: 600, cursor: "pointer", fontFamily: T.font.sans,
                  opacity: store.creating || store.publishing ? 0.5 : 1,
                }}
              >
                {store.creating || store.publishing ? "Creating..." : "Create & Publish"}
              </button>
            </div>
          </div>
        )}

        {/* Publish update form */}
        {!result && !isNew && (
          <div>
            <div style={{
              padding: 16, borderRadius: 8,
              background: C.bg2, border: `1px solid ${C.border}`,
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>Current version</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>v{existing.version_count}</div>
              <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>
                Publishing will create v{existing.version_count + 1} and notify the owner.
              </div>
              {isRevision && (
                <div style={{
                  fontSize: 11, color: C.accent, marginTop: 8,
                  padding: "6px 10px", background: `${C.accent}10`, borderRadius: 6,
                }}>
                  Publishing from Revision {currentEntry?.revisionNumber} — same shareable link, new version.
                </div>
              )}
            </div>

            <Field
              label="What changed? (optional)"
              value={changeSummary}
              onChange={setChangeSummary}
              placeholder="e.g., Updated steel pricing per new sub quote"
              C={C} T={T}
              multiline
            />

            {store.error && (
              <div style={{ color: "#FF453A", fontSize: 12, marginTop: 12 }}>{store.error}</div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={onClose} style={{
                padding: "10px 20px", borderRadius: 8,
                background: "transparent", border: `1px solid ${C.border}`,
                color: C.textMuted, fontSize: 13, cursor: "pointer", fontFamily: T.font.sans,
              }}>Cancel</button>
              <button
                onClick={handlePublish}
                disabled={store.publishing}
                style={{
                  padding: "10px 24px", borderRadius: 8, border: "none",
                  background: C.accent, color: "#fff", fontSize: 13,
                  fontWeight: 600, cursor: "pointer", fontFamily: T.font.sans,
                  opacity: store.publishing ? 0.5 : 1,
                }}
              >
                {store.publishing ? "Publishing..." : "Publish v" + (existing.version_count + 1)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", multiline, C, T, style }) {
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    padding: "9px 12px", borderRadius: 8,
    background: C.bg2, border: `1px solid ${C.border}`,
    color: C.text, fontSize: 13, fontFamily: T.font.sans,
    outline: "none",
  };
  return (
    <div style={style}>
      <label style={{ fontSize: 11, fontWeight: 600, color: C.textDim, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      ) : (
        <input
          type={type} value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
    </div>
  );
}
