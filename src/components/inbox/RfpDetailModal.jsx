import { useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import Modal from '@/components/shared/Modal';
import AttachmentPreview from './AttachmentPreview';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { bt } from '@/utils/styles';

const API_BASE = import.meta.env.DEV
  ? "https://app-nova-42373ca7.vercel.app"
  : "";

function isPreviewable(att) {
  const isPdf = att.contentType === "application/pdf" || att.filename?.toLowerCase().endsWith(".pdf");
  const isImage = att.contentType?.startsWith("image/") || /\.(jpg|jpeg|png|gif)$/i.test(att.filename || "");
  return isPdf || isImage;
}

function Field({ label, value, C }) {
  if (!value) return null;
  const T = C.T;
  return (
    <div style={{ marginBottom: T.space[3] }}>
      <div style={{ fontSize: T.fontSize.xs, color: C.textDim, fontWeight: T.fontWeight.semibold, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: T.fontSize.sm, color: C.text }}>
        {value}
      </div>
    </div>
  );
}

function ContactBlock({ label, contact, C }) {
  if (!contact) return null;
  const T = C.T;
  return (
    <div style={{ marginBottom: T.space[3] }}>
      <div style={{ fontSize: T.fontSize.xs, color: C.textDim, fontWeight: T.fontWeight.semibold, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: T.fontSize.sm, color: C.text }}>
        {contact.company && <div style={{ fontWeight: T.fontWeight.semibold }}>{contact.company}</div>}
        {contact.contact && <div>{contact.contact}</div>}
        {contact.email && <div style={{ color: C.accent }}>{contact.email}</div>}
        {contact.phone && <div style={{ color: C.textMuted }}>{contact.phone}</div>}
      </div>
    </div>
  );
}

export default function RfpDetailModal({ rfp, onClose, onImport }) {
  const C = useTheme();
  const T = C.T;
  const pd = rfp.parsed_data || {};
  const attachments = rfp.attachments || [];
  const br = pd.bidRequirements || {};
  const [previewAttachment, setPreviewAttachment] = useState(null);

  const bidReqs = Object.entries(br)
    .filter(([k, v]) => v && k !== "other")
    .map(([k]) => k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()))
    .join(", ");

  return (
    <Modal onClose={onClose} wide>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: T.space[5] }}>
        <div>
          <div style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[1] }}>
            {pd.projectName || rfp.subject || "RFP Details"}
          </div>
          <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>
            from {rfp.sender_name || rfp.sender_email} · {new Date(rfp.received_at).toLocaleString()}
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
          <Ic d={I.x} size={18} color={C.textDim} />
        </button>
      </div>

      {/* Two-column layout */}
      <div style={{ display: "flex", gap: T.space[5] }}>
        {/* Left: Parsed data */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.accent, marginBottom: T.space[3], textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Extracted Information
          </div>

          {pd.confidence != null && (
            <div style={{
              padding: "6px 10px", borderRadius: T.radius.sm, marginBottom: T.space[4],
              background: pd.confidence > 0.7 ? `${C.green}18` : pd.confidence > 0.4 ? "#f59e0b18" : `${C.red}18`,
              border: `1px solid ${pd.confidence > 0.7 ? C.green : pd.confidence > 0.4 ? "#f59e0b" : C.red}30`,
              fontSize: T.fontSize.xs, color: pd.confidence > 0.7 ? C.green : pd.confidence > 0.4 ? "#f59e0b" : C.red,
            }}>
              AI Confidence: {Math.round(pd.confidence * 100)}%
            </div>
          )}

          <Field label="Project Name" value={pd.projectName} C={C} />
          <Field label="Address" value={pd.address} C={C} />
          <Field label="Job Type" value={pd.jobType} C={C} />
          <Field label="Bid Type" value={pd.bidType} C={C} />
          <Field label="Bid Delivery" value={pd.bidDelivery} C={C} />
          <Field label="Description" value={pd.description} C={C} />

          <div style={{ display: "flex", gap: T.space[4] }}>
            <Field label="Bid Due" value={pd.bidDue ? `${pd.bidDue}${pd.bidDueTime ? ` at ${pd.bidDueTime}` : ""}` : null} C={C} />
            <Field label="Walkthrough" value={pd.walkthroughDate} C={C} />
            <Field label="RFI Due" value={pd.rfiDueDate} C={C} />
          </div>

          <Field label="Project SF" value={pd.projectSF ? pd.projectSF.toLocaleString() : null} C={C} />
          <Field label="Bid Requirements" value={bidReqs || null} C={C} />
          {br.other && <Field label="Other Requirements" value={br.other} C={C} />}

          <ContactBlock label="Client / Owner" contact={pd.client} C={C} />
          <ContactBlock label="Architect" contact={pd.architect} C={C} />
          <ContactBlock label="Engineer" contact={pd.engineer} C={C} />

          {pd.scopeNotes && pd.scopeNotes.length > 0 && (
            <div style={{ marginBottom: T.space[3] }}>
              <div style={{ fontSize: T.fontSize.xs, color: C.textDim, fontWeight: T.fontWeight.semibold, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
                Scope Notes
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: T.fontSize.sm, color: C.text }}>
                {pd.scopeNotes.map((n, i) => <li key={i} style={{ marginBottom: 2 }}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* Right: Attachments + email or preview */}
        <div style={{ flex: 1 }}>
          {/* Attachments — clickable for preview */}
          {attachments.length > 0 && (
            <div style={{ marginBottom: T.space[4] }}>
              <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.accent, marginBottom: T.space[3], textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Attachments ({attachments.length})
                {attachments.some(a => isPreviewable(a)) ? " — Click to preview" : ""}
              </div>
              {attachments.map(att => {
                const canPreview = isPreviewable(att);
                const isActive = previewAttachment?.id === att.id;
                return (
                  <div
                    key={att.id}
                    onClick={() => canPreview && setPreviewAttachment(isActive ? null : att)}
                    style={{
                      display: "flex", alignItems: "center", gap: T.space[2],
                      padding: "6px 10px", borderRadius: T.radius.sm,
                      background: isActive ? `${C.accent}20` : C.bg,
                      border: `1px solid ${isActive ? C.accent + "40" : C.border}`,
                      marginBottom: T.space[2],
                      cursor: canPreview ? "pointer" : "default",
                      transition: T.transition.fast,
                    }}
                  >
                    <Ic d={canPreview ? I.eye : I.plans} size={14} color={C.accent} />
                    <span style={{ flex: 1, fontSize: T.fontSize.sm, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {att.filename}
                    </span>
                    <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
                      {att.size > 1048576 ? `${(att.size / 1048576).toFixed(1)} MB` : `${Math.round(att.size / 1024)} KB`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Show preview or original email */}
          {previewAttachment ? (
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 400 }}>
              <AttachmentPreview
                attachment={previewAttachment}
                apiBase={API_BASE}
                onClose={() => setPreviewAttachment(null)}
              />
            </div>
          ) : (
            <>
              <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.accent, marginBottom: T.space[3], textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Original Email
              </div>
              <div style={{
                padding: T.space[4], borderRadius: T.radius.sm,
                background: C.bg, border: `1px solid ${C.border}`,
                fontSize: T.fontSize.sm, color: C.textMuted,
                maxHeight: 300, overflowY: "auto",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
                lineHeight: T.lineHeight.relaxed,
              }}>
                {rfp.raw_text || "(email text not available)"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      {(rfp.status === "parsed" || rfp.status === "pending") && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: T.space[3], marginTop: T.space[5], borderTop: `1px solid ${C.border}`, paddingTop: T.space[4] }}>
          <button style={bt(C, { padding: "8px 20px", background: "transparent", color: C.textMuted, border: `1px solid ${C.border}` })} onClick={onClose}>
            Cancel
          </button>
          <button style={bt(C, { padding: "8px 20px", background: C.accent, color: "#fff" })} onClick={() => onImport(rfp)}>
            <Ic d={I.download} size={14} color="#fff" />
            Import as Estimate
          </button>
        </div>
      )}
    </Modal>
  );
}
