import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import Modal from "@/components/shared/Modal";
import AttachmentPreview from "./AttachmentPreview";
import CalendarPicker from "@/components/shared/CalendarPicker";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { getProviderInfo } from "@/utils/cloudProviders";

const API_BASE = import.meta.env.DEV ? "https://app-nova-42373ca7.vercel.app" : "";

function isPreviewable(att) {
  const isPdf = att.contentType === "application/pdf" || att.filename?.toLowerCase().endsWith(".pdf");
  const isImage = att.contentType?.startsWith("image/") || /\.(jpg|jpeg|png|gif)$/i.test(att.filename || "");
  return isPdf || isImage;
}

export default function ImportConfirmModal({ rfp, onClose, onConfirm, loading }) {
  const C = useTheme();
  const T = C.T;
  const pd = rfp.parsed_data || {};
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const { masterData } = useMasterDataStore();

  // Editable fields — user can override before import
  const [fields, setFields] = useState({
    projectName: pd.projectName || rfp.subject || "",
    client: pd.client?.company || "",
    architect: pd.architect?.company || "",
    address: pd.address || "",
    jobType: pd.jobType || "",
    bidDue: pd.bidDue || "",
    bidDueTime: pd.bidDueTime || "",
    description: pd.description || "",
  });

  const update = (key, value) => setFields(f => ({ ...f, [key]: value }));

  const fieldDefs = [
    { key: "projectName", label: "Project Name", type: "text" },
    { key: "client", label: "Client", type: "text" },
    { key: "architect", label: "Architect", type: "text" },
    { key: "address", label: "Address", type: "text" },
    {
      key: "jobType",
      label: "Job Type",
      type: "select",
      options: [
        "",
        ...(Array.isArray(masterData.jobTypes)
          ? masterData.jobTypes.map(j => (typeof j === "string" ? j : j.name))
          : []),
      ],
    },
    { key: "bidDue", label: "Bid Due Date", type: "date" },
    { key: "bidDueTime", label: "Bid Due Time", type: "time" },
    { key: "description", label: "Description", type: "textarea" },
  ];

  const attachments = rfp.attachments || [];
  const planLinks = pd.planLinks || [];
  const hasPreview = !!previewAttachment;

  return (
    <Modal onClose={onClose} wide={!hasPreview} extraWide={hasPreview}>
      <div style={{ display: "flex", gap: T.space[5] }}>
        {/* Left panel: form fields */}
        <div style={{ flex: hasPreview ? "0 0 380px" : 1, minWidth: 0 }}>
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
              <Ic d={I.download} size={18} color={C.accent} />
            </div>
            <div>
              <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
                Import RFP as Estimate
              </div>
              <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>
                Review and edit project details before creating the estimate
              </div>
            </div>
          </div>

          {/* Editable fields */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: hasPreview ? "1fr" : "1fr 1fr",
              gap: T.space[3],
              marginBottom: T.space[5],
            }}
          >
            {fieldDefs.map(fd => (
              <div key={fd.key} style={!hasPreview && fd.key === "description" ? { gridColumn: "span 2" } : {}}>
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
                        {o || "\u2014"}
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

          {/* Attachments — clickable for preview */}
          {attachments.length > 0 && (
            <div
              style={{
                padding: T.space[3],
                borderRadius: T.radius.sm,
                background: C.bg,
                border: `1px solid ${C.border}`,
                marginBottom: T.space[4],
              }}
            >
              <div
                style={{
                  fontSize: T.fontSize.xs,
                  color: C.textDim,
                  fontWeight: T.fontWeight.semibold,
                  marginBottom: T.space[2],
                }}
              >
                {attachments.length} ATTACHMENT{attachments.length !== 1 ? "S" : ""}
                {attachments.some(a => isPreviewable(a)) ? " — CLICK TO PREVIEW" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: T.space[1] }}>
                {attachments.map(att => {
                  const canPreview = isPreviewable(att);
                  const isActive = previewAttachment?.id === att.id;
                  return (
                    <div
                      key={att.id}
                      onClick={() => canPreview && setPreviewAttachment(isActive ? null : att)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: T.space[2],
                        fontSize: T.fontSize.xs,
                        padding: "5px 8px",
                        borderRadius: T.radius.sm,
                        background: isActive ? `${C.accent}20` : C.accentBg,
                        color: C.accent,
                        cursor: canPreview ? "pointer" : "default",
                        border: isActive ? `1px solid ${C.accent}40` : "1px solid transparent",
                        transition: T.transition.fast,
                      }}
                    >
                      <Ic d={canPreview ? I.eye : I.plans} size={12} color={C.accent} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {att.filename}
                      </span>
                      {att.size && (
                        <span style={{ fontSize: 9, color: C.textDim, flexShrink: 0 }}>
                          {att.size > 1048576
                            ? `${(att.size / 1048576).toFixed(1)} MB`
                            : `${Math.round(att.size / 1024)} KB`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Plan links — cloud storage URLs */}
          {planLinks.length > 0 && (
            <div
              style={{
                padding: T.space[3],
                borderRadius: T.radius.sm,
                background: C.bg,
                border: `1px solid ${C.border}`,
                marginBottom: T.space[4],
              }}
            >
              <div
                style={{
                  fontSize: T.fontSize.xs,
                  color: C.textDim,
                  fontWeight: T.fontWeight.semibold,
                  marginBottom: T.space[2],
                }}
              >
                {planLinks.length} PLAN LINK{planLinks.length !== 1 ? "S" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: T.space[1] }}>
                {planLinks.map((link, i) => {
                  const provider = getProviderInfo(link.url);
                  return (
                    <div
                      key={i}
                      onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: T.space[2],
                        fontSize: T.fontSize.xs,
                        padding: "5px 8px",
                        borderRadius: T.radius.sm,
                        background: C.accentBg,
                        color: C.accent,
                        cursor: "pointer",
                        border: "1px solid transparent",
                        transition: T.transition.fast,
                      }}
                    >
                      <Ic d={I.externalLink} size={12} color={C.accent} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {link.label || provider.label}
                      </span>
                      <span style={{ fontSize: 9, color: C.textDim, flexShrink: 0 }}>{provider.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
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
              disabled={loading}
            >
              Cancel
            </button>
            <button
              style={bt(C, { padding: "8px 20px", background: C.accent, color: "#fff", opacity: loading ? 0.6 : 1 })}
              onClick={() => onConfirm(fields)}
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Estimate"}
            </button>
          </div>
        </div>

        {/* Right panel: document preview */}
        {hasPreview && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderLeft: `1px solid ${C.border}`,
              paddingLeft: T.space[5],
              display: "flex",
              flexDirection: "column",
              maxHeight: "72vh",
            }}
          >
            <AttachmentPreview
              attachment={previewAttachment}
              apiBase={API_BASE}
              onClose={() => setPreviewAttachment(null)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
