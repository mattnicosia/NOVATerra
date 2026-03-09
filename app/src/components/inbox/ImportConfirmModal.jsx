import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import Modal from "@/components/shared/Modal";
import CalendarPicker from "@/components/shared/CalendarPicker";
import BidIntelligencePanel from "@/components/inbox/BidIntelligencePanel";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useUiStore } from "@/stores/uiStore";
import { WORK_TYPES } from "@/constants/constructionTypes";

/* ────────────────────────────────────────────────────────
   ImportConfirmModal — Phase A: edit fields, Phase B: processing

   Supports two modes:
   - Normal: Import RFP as new estimate (edit fields + create)
   - Addendum: Import addendum into existing estimate (no field editing)

   Includes:
   - Bid Intelligence Panel (Phase A, normal mode)
   - Addendum context banner (addendum mode)
   - Post-import bid package suggestion
   ──────────────────────────────────────────────────────── */

export default function ImportConfirmModal({
  rfp,
  onClose,
  onConfirm,
  loading,
  progressSteps,
  importComplete,
  createdEstimateId,
  failedCloudLinks = [],
  isAddendum = false,
  addendumNumber = null,
  parentProjectName = null,
}) {
  const C = useTheme();
  const T = C.T;
  const pd = rfp.parsed_data || {};
  const { masterData } = useMasterDataStore();
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);

  // Company profile selection — defaults to currently active profile
  const companyProfiles = masterData.companyProfiles || [];
  const primaryName = masterData.companyInfo?.name || "Primary";
  const hasMultipleProfiles = companyProfiles.length > 0;
  const defaultProfileId = activeCompanyId === "__all__" ? "" : activeCompanyId || "";
  const [selectedProfileId, setSelectedProfileId] = useState(defaultProfileId);

  // Track which destination the user chose
  const [destination, setDestination] = useState(null);

  // Editable fields — user can override before import
  const [fields, setFields] = useState({
    projectName: pd.projectName || rfp.subject || "",
    client: pd.client?.company || "",
    architect: pd.architect?.company || "",
    address: pd.address || "",
    workType: pd.workType || "",
    bidType: pd.bidType || "Hard Bid",
    bidDelivery: pd.bidDelivery || "",
    bidDue: pd.bidDue || "",
    bidDueTime: pd.bidDueTime || "",
    description: pd.description || (pd.scopeNotes || []).join("; ") || "",
  });

  const update = (key, value) => setFields(f => ({ ...f, [key]: value }));

  const fieldDefs = [
    { key: "projectName", label: "Project Name", type: "text" },
    { key: "client", label: "Client", type: "text" },
    { key: "architect", label: "Architect", type: "text" },
    { key: "address", label: "Address", type: "text" },
    {
      key: "workType",
      label: "Work Type",
      type: "select",
      options: ["", ...WORK_TYPES.map(w => w.key)],
      displayMap: Object.fromEntries(WORK_TYPES.map(w => [w.key, w.label])),
    },
    {
      key: "bidType",
      label: "Bid Type",
      type: "select",
      options: ["", "Hard Bid", "Negotiated", "Design-Build", "CM at Risk", "GMP"],
    },
    {
      key: "bidDelivery",
      label: "Bid Delivery",
      type: "select",
      options: ["", "Email", "Sealed & Delivered", "Both", "Online Portal"],
    },
    { key: "bidDue", label: "Bid Due Date", type: "date" },
    { key: "bidDueTime", label: "Bid Due Time", type: "time" },
    { key: "description", label: "Description", type: "textarea" },
  ];

  const isProcessing = loading || importComplete;
  const attachmentCount = (rfp.attachments || []).length;
  const pdfCount = (rfp.attachments || []).filter(
    a => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf"),
  ).length;

  const handleCreate = dest => {
    setDestination(dest);
    onConfirm({ fields, destination: dest, profileId: selectedProfileId });
  };

  return (
    <Modal onClose={!isProcessing ? onClose : undefined} wide>
      <div style={{ minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[5] }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: T.radius.sm,
              background: `${C.accent}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ic d={isProcessing ? I.check : I.download} size={18} color={C.accent} />
          </div>
          <div>
            <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
              {isProcessing
                ? isAddendum
                  ? `Importing Addendum #${addendumNumber || ""}`
                  : "Importing Estimate"
                : isAddendum
                  ? `Import Addendum #${addendumNumber || ""}`
                  : "Import RFP as Estimate"}
            </div>
            <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>
              {isProcessing
                ? isAddendum
                  ? "Adding new documents to the existing estimate..."
                  : "Processing your documents and creating the estimate..."
                : isAddendum
                  ? `Adding to: ${parentProjectName || "existing project"}`
                  : "Review and edit project details before creating the estimate"}
            </div>
          </div>
        </div>

        {/* ═══ Phase A: Edit fields (before processing) ═══ */}
        {!isProcessing && (
          <>
            {/* Addendum mode: simplified banner, no field editing */}
            {isAddendum ? (
              <div style={{ marginBottom: T.space[5] }}>
                <div
                  style={{
                    padding: T.space[4],
                    borderRadius: T.radius.sm,
                    background: C.isDark ? "rgba(255,149,0,0.08)" : "rgba(255,149,0,0.05)",
                    border: `1px solid ${C.isDark ? "rgba(255,149,0,0.20)" : "rgba(255,149,0,0.15)"}`,
                    display: "flex",
                    alignItems: "center",
                    gap: T.space[3],
                    marginBottom: T.space[4],
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: T.radius.sm,
                      background: "#FF950020",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Ic d={I.refresh || I.download} size={16} color="#FF9500" />
                  </div>
                  <div>
                    <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.text }}>
                      Addendum #{addendumNumber} for {parentProjectName}
                    </div>
                    <div style={{ fontSize: T.fontSize.xs, color: C.textMuted }}>
                      New drawings will be merged into the existing estimate. Matching sheets will be versioned
                      automatically.
                    </div>
                  </div>
                </div>

                {/* Summary of addendum contents */}
                {(attachmentCount > 0 || (pd.planLinks || []).length > 0) && (
                  <div
                    style={{
                      padding: T.space[3],
                      borderRadius: T.radius.sm,
                      background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                      border: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                      fontSize: T.fontSize.sm,
                      color: C.textMuted,
                      display: "flex",
                      alignItems: "center",
                      gap: T.space[2],
                    }}
                  >
                    <Ic d={I.plans} size={14} color={C.textDim} />
                    <span>
                      {pdfCount > 0 && `${pdfCount} PDF${pdfCount > 1 ? "s" : ""} will be processed`}
                      {(pd.planLinks || []).length > 0 &&
                        ` · ${(pd.planLinks || []).length} cloud file${(pd.planLinks || []).length > 1 ? "s" : ""}`}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Normal mode: editable fields */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: T.space[3],
                    marginBottom: T.space[4],
                  }}
                >
                  {fieldDefs.map(fd => (
                    <div key={fd.key} style={fd.key === "description" ? { gridColumn: "span 2" } : {}}>
                      <label
                        style={{
                          display: "block",
                          fontSize: T.fontSize.xs,
                          color: C.textDim,
                          fontWeight: T.fontWeight.semibold,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: 4,
                        }}
                      >
                        {fd.label}
                      </label>
                      {fd.type === "textarea" ? (
                        <textarea
                          value={fields[fd.key]}
                          onChange={e => update(fd.key, e.target.value)}
                          rows={3}
                          style={inp(C, { resize: "vertical" })}
                        />
                      ) : fd.type === "select" ? (
                        <select value={fields[fd.key]} onChange={e => update(fd.key, e.target.value)} style={inp(C)}>
                          {fd.options.map(o => (
                            <option key={o} value={o}>
                              {o ? fd.displayMap?.[o] || o : "\u2014"}
                            </option>
                          ))}
                        </select>
                      ) : fd.type === "date" ? (
                        <CalendarPicker
                          value={fields[fd.key]}
                          onChange={v => update(fd.key, v)}
                          placeholder="Select date..."
                        />
                      ) : (
                        <input
                          type={fd.type}
                          value={fields[fd.key]}
                          onChange={e => update(fd.key, e.target.value)}
                          style={inp(C)}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Bid Intelligence Panel */}
                <BidIntelligencePanel parsedData={pd} editedFields={fields} />

                {/* Bid Requirements — read-only display from parsed data */}
                {(() => {
                  const br = pd.bidRequirements || {};
                  const reqs = Object.entries(br)
                    .filter(([k, v]) => v && k !== "other")
                    .map(([k]) => k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()));
                  if (reqs.length === 0 && !br.other) return null;
                  return (
                    <div
                      style={{
                        padding: T.space[3],
                        borderRadius: T.radius.sm,
                        background: C.isDark ? "rgba(139,92,246,0.06)" : "rgba(139,92,246,0.04)",
                        border: `1px solid ${C.isDark ? "rgba(139,92,246,0.15)" : "rgba(139,92,246,0.10)"}`,
                        marginBottom: T.space[4],
                      }}
                    >
                      <div
                        style={{
                          fontSize: T.fontSize.xs,
                          color: "#8b5cf6",
                          fontWeight: T.fontWeight.semibold,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          marginBottom: T.space[2],
                        }}
                      >
                        Bid Requirements
                      </div>
                      {reqs.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: T.space[2],
                            marginBottom: br.other ? T.space[2] : 0,
                          }}
                        >
                          {reqs.map(r => (
                            <span
                              key={r}
                              style={{
                                fontSize: T.fontSize.xs,
                                padding: "2px 8px",
                                borderRadius: T.radius.full,
                                background: "#8b5cf618",
                                color: "#8b5cf6",
                                fontWeight: T.fontWeight.medium,
                              }}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                      {br.other && <div style={{ fontSize: T.fontSize.xs, color: C.textMuted }}>{br.other}</div>}
                    </div>
                  );
                })()}

                {/* Company Profile selector — only shown if multiple profiles exist */}
                {hasMultipleProfiles && (
                  <div style={{ marginBottom: T.space[4] }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: T.fontSize.xs,
                        color: C.textDim,
                        fontWeight: T.fontWeight.semibold,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: 4,
                      }}
                    >
                      Company Profile
                    </label>
                    <select
                      value={selectedProfileId}
                      onChange={e => setSelectedProfileId(e.target.value)}
                      style={inp(C)}
                    >
                      <option value="">{primaryName}</option>
                      {companyProfiles.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name || "Unnamed Profile"}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Summary of what will be imported */}
                {(attachmentCount > 0 || (pd.planLinks || []).length > 0) && (
                  <div
                    style={{
                      padding: T.space[3],
                      borderRadius: T.radius.sm,
                      background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                      border: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                      marginBottom: T.space[5],
                      fontSize: T.fontSize.sm,
                      color: C.textMuted,
                      display: "flex",
                      alignItems: "center",
                      gap: T.space[2],
                    }}
                  >
                    <Ic d={I.plans} size={14} color={C.textDim} />
                    <span>
                      {pdfCount > 0 && `${pdfCount} PDF${pdfCount > 1 ? "s" : ""} will be processed as drawings`}
                      {pdfCount > 0 && attachmentCount - pdfCount > 0 && " · "}
                      {attachmentCount - pdfCount > 0 &&
                        `${attachmentCount - pdfCount} other file${attachmentCount - pdfCount > 1 ? "s" : ""} attached`}
                      {(pd.planLinks || []).length > 0 &&
                        ` · ${(pd.planLinks || []).length} cloud file${(pd.planLinks || []).length > 1 ? "s" : ""} will be auto-downloaded`}
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: T.space[3],
                borderTop: `1px solid ${C.border}`,
                paddingTop: T.space[4],
              }}
            >
              <button
                style={bt(C, {
                  padding: "8px 20px",
                  background: "transparent",
                  color: C.textMuted,
                  border: `1px solid ${C.border}`,
                })}
                onClick={onClose}
              >
                Cancel
              </button>
              {isAddendum ? (
                <button
                  style={bt(C, { padding: "8px 20px", background: "#FF9500", color: "#fff" })}
                  onClick={() => {
                    setDestination("estimate");
                    onConfirm({ profileId: selectedProfileId });
                  }}
                >
                  <Ic d={I.download} size={14} color="#fff" />
                  Import Addendum
                </button>
              ) : (
                <>
                  <button
                    style={bt(C, {
                      padding: "8px 20px",
                      background: "transparent",
                      color: C.accent,
                      border: `1px solid ${C.accent}40`,
                    })}
                    onClick={() => handleCreate("bidPackages")}
                  >
                    <Ic d={I.bid} size={14} color={C.accent} />
                    Create & Setup Bid Packages
                  </button>
                  <button
                    style={bt(C, { padding: "8px 20px", background: C.accent, color: "#fff" })}
                    onClick={() => handleCreate("estimate")}
                  >
                    <Ic d={I.check} size={14} color="#fff" />
                    Create Estimate
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* ═══ Phase B: Processing view (after clicking Create) ═══ */}
        {isProcessing && (
          <div style={{ minHeight: 200 }}>
            {/* Progress steps */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: T.space[3],
                marginBottom: T.space[6],
              }}
            >
              {(progressSteps || []).map((step, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
                  {step.status === "done" ? (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: `${C.green}20`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Ic d={I.check} size={14} color={C.green} sw={2.5} />
                    </div>
                  ) : step.status === "active" ? (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: `${C.accent}20`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        animation: "pulse 1.5s ease-in-out infinite",
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: C.accent,
                        }}
                      />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: T.fontSize.sm,
                      color: step.status === "done" ? C.text : step.status === "active" ? C.accent : C.textDim,
                      fontWeight: step.status === "active" ? T.fontWeight.semibold : T.fontWeight.normal,
                    }}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA when complete */}
            {importComplete && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: T.space[4],
                  padding: T.space[5],
                  borderRadius: T.radius.md,
                  background: C.isDark ? "rgba(48,209,88,0.06)" : "rgba(48,209,88,0.04)",
                  border: `1px solid ${C.green}30`,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: `${C.green}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ic d={I.check} size={24} color={C.green} sw={2.5} />
                </div>
                <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.semibold, color: C.text }}>
                  {isAddendum ? `Addendum #${addendumNumber} Imported` : "Estimate Created"}
                </div>
                <button
                  style={bt(C, { padding: "10px 28px", background: C.accent, color: "#fff", fontSize: T.fontSize.sm })}
                  onClick={() => {
                    if (destination === "bidPackages") {
                      window.__importNav?.(`/estimate/${createdEstimateId}/bids`);
                    } else {
                      window.__importNav?.(`/estimate/${createdEstimateId}/info`);
                    }
                  }}
                >
                  {destination === "bidPackages" ? (
                    <>
                      <Ic d={I.bid} size={14} color="#fff" />
                      Setup Bid Packages
                    </>
                  ) : (
                    <>
                      <Ic d={I.estimate} size={14} color="#fff" />
                      Go to Estimate
                    </>
                  )}
                </button>

                {/* Failed cloud download links — show fallback for manual download */}
                {failedCloudLinks.length > 0 && (
                  <div
                    style={{
                      width: "100%",
                      marginTop: T.space[4],
                      padding: T.space[3],
                      borderRadius: T.radius.sm,
                      background: C.isDark ? "rgba(255,149,0,0.06)" : "rgba(255,149,0,0.04)",
                      border: `1px solid ${C.isDark ? "rgba(255,149,0,0.15)" : "rgba(255,149,0,0.12)"}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: T.fontSize.xs,
                        fontWeight: T.fontWeight.semibold,
                        color: C.isDark ? "#FF9500" : "#CC7700",
                        marginBottom: T.space[2],
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Ic d={I.alert} size={12} color={C.isDark ? "#FF9500" : "#CC7700"} />
                      {failedCloudLinks.length} cloud file{failedCloudLinks.length > 1 ? "s" : ""} couldn't be
                      downloaded
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {failedCloudLinks.map((link, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: T.fontSize.xs,
                          }}
                        >
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: C.accent,
                              textDecoration: "none",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: 300,
                            }}
                          >
                            {link.label || link.url}
                          </a>
                          {link.message && <span style={{ color: C.textDim, flexShrink: 0 }}>— {link.message}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pulse animation for active step indicator */}
      {isProcessing && !importComplete && (
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(0.9); }
          }
        `}</style>
      )}
    </Modal>
  );
}
