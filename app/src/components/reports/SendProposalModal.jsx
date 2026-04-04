import { useState, useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useProjectStore } from '@/stores/projectStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import { useReportsStore } from '@/stores/reportsStore';
import { useUiStore } from '@/stores/uiStore';
import Modal from '@/components/shared/Modal';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { inp, bt } from '@/utils/styles';
import { fmt, today } from '@/utils/format';

export default function SendProposalModal({ onClose, totals, reportType }) {
  const C = useTheme();
  const T = C.T;
  const project = useProjectStore(s => s.project);
  const masterData = useMasterDataStore(s => s.masterData);
  const getCompanyInfo = useMasterDataStore(s => s.getCompanyInfo);
  const showToast = useUiStore(s => s.showToast);

  const companyInfo = getCompanyInfo(project.companyProfileId);
  const client = masterData.clients.find(c => c.company === project.client);

  // Form state
  const [to, setTo] = useState(client?.email || "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(
    `Proposal — ${project.name || "Project"} — ${companyInfo?.name || "Company"}`
  );
  const [body, setBody] = useState(buildDefaultBody(project, client, companyInfo, totals));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [pdfProgress, setPdfProgress] = useState(null); // null | 'generating' | 'sending'

  const handleSend = useCallback(async () => {
    if (!to.trim()) { setError("Recipient email is required"); return; }
    setError(null);
    setSending(true);
    setPdfProgress("generating");

    try {
      // Dynamically import html2pdf.js (lazy load ~500KB)
      const html2pdf = (await import('html2pdf.js')).default;

      // Target the proposal or SOV element
      const element = document.getElementById("proposal-print")
        || document.querySelector(".sov-doc");
      if (!element) throw new Error("Proposal not found — make sure a Proposal or SOV is visible");

      // Respect orientation from proposal design preferences
      const { proposalDesign } = useReportsStore.getState();
      const isLandscape = proposalDesign.orientation === "landscape";

      // Generate PDF as blob
      const pdfBlob = await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `Proposal_${project.name || "estimate"}.pdf`,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: {
            unit: "mm",
            format: isLandscape ? [279, 216] : "letter",
            orientation: isLandscape ? "landscape" : "portrait",
          },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(element)
        .outputPdf("blob");

      setPdfProgress("sending");

      // Convert blob to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(pdfBlob);
      });

      // Build filename
      const safeName = (project.name || "Estimate").replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
      const pdfFilename = `Proposal_${safeName}_${today()}.pdf`;

      // Send via API
      const resp = await fetch("/api/send-proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          cc: cc.trim(),
          bcc: bcc.trim(),
          subject,
          body,
          pdfBase64: base64,
          pdfFilename,
          fromName: companyInfo?.name || "",
          replyTo: companyInfo?.email || "",
        }),
      });

      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Failed to send email");

      showToast(`Proposal sent to ${to.trim()}`);
      onClose();
    } catch (err) {
      console.error("Send proposal error:", err);
      setError(err.message || "Failed to send proposal");
      setPdfProgress(null);
    } finally {
      setSending(false);
    }
  }, [to, cc, bcc, subject, body, project, companyInfo, showToast, onClose]);

  const reportLabel = reportType === "sov" ? "Schedule of Values" : "Proposal";

  return (
    <Modal onClose={onClose} extraWide>
      <div style={{ display: "flex", gap: T.space[6] }}>
        {/* Left: Email Form */}
        <div style={{ flex: 3, minWidth: 0 }}>
          <div style={{ fontSize: T.fontSize.md, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[5], display: "flex", alignItems: "center", gap: 8 }}>
            <Ic d={I.send} size={16} color={C.accent} /> Email {reportLabel}
          </div>

          {error && (
            <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}40`, borderRadius: T.radius.sm, padding: "8px 12px", marginBottom: T.space[3], fontSize: 11, color: C.red }}>
              {error}
            </div>
          )}

          {/* To */}
          <label style={labelStyle(C)}>To *</label>
          <input value={to} onChange={e => setTo(e.target.value)}
            placeholder="client@example.com"
            style={inp(C, { marginBottom: T.space[3], width: "100%" })} />

          {/* CC / BCC row */}
          <div style={{ display: "flex", gap: T.space[3], marginBottom: T.space[3] }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle(C)}>CC</label>
              <input value={cc} onChange={e => setCc(e.target.value)}
                placeholder="Comma-separated emails"
                style={inp(C, { width: "100%" })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle(C)}>BCC</label>
              <input value={bcc} onChange={e => setBcc(e.target.value)}
                placeholder="Comma-separated emails"
                style={inp(C, { width: "100%" })} />
            </div>
          </div>

          {/* Subject */}
          <label style={labelStyle(C)}>Subject</label>
          <input value={subject} onChange={e => setSubject(e.target.value)}
            style={inp(C, { marginBottom: T.space[3], width: "100%" })} />

          {/* Body */}
          <label style={labelStyle(C)}>Message</label>
          <textarea value={body} onChange={e => setBody(e.target.value)}
            rows={8}
            style={inp(C, { resize: "vertical", marginBottom: T.space[4], lineHeight: 1.6, width: "100%" })} />

          {/* Buttons */}
          <div style={{ display: "flex", gap: T.space[3], justifyContent: "flex-end" }}>
            <button onClick={onClose} disabled={sending}
              style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted, padding: "8px 18px", fontSize: 12 })}>
              Cancel
            </button>
            <button onClick={handleSend} disabled={sending}
              style={bt(C, { background: C.accent, color: "#fff", padding: "8px 22px", fontSize: 12, opacity: sending ? 0.6 : 1 })}>
              <Ic d={I.send} size={13} color="#fff" />
              {" "}{sending
                ? (pdfProgress === "generating" ? "Generating PDF..." : "Sending...")
                : `Send ${reportLabel}`}
            </button>
          </div>
        </div>

        {/* Right: Preview Summary */}
        <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: T.space[3], minWidth: 0 }}>
          {/* Attachment preview card */}
          <div style={{ background: C.bg2, borderRadius: T.radius.md, border: `1px solid ${C.border}`, padding: T.space[5] }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: T.space[3] }}>
              Attachment Preview
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: T.space[2] }}>
              {project.name || "Untitled Project"}
            </div>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: T.space[1] }}>
              Client: {project.client || "No client"}
            </div>
            {project.address && (
              <div style={{ fontSize: 11, color: C.textMuted, marginBottom: T.space[1] }}>
                {project.address}
              </div>
            )}
            <div style={{ marginTop: T.space[3], paddingTop: T.space[3], borderTop: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>Grand Total</span>
                <span style={{ fontSize: 16, fontWeight: 700, fontFamily: T.font.mono, color: C.accent }}>
                  {fmt(totals?.grand || 0)}
                </span>
              </div>
            </div>
            <div style={{ marginTop: T.space[3], fontSize: 10, color: C.textDim, display: "flex", alignItems: "center", gap: 4 }}>
              <Ic d={I.plans || I.report} size={11} color={C.textDim} />
              PDF generated from the {reportLabel} currently displayed
            </div>
          </div>

          {/* Sender info card */}
          <div style={{ background: C.bg2, borderRadius: T.radius.md, border: `1px solid ${C.border}`, padding: T.space[4] }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: T.space[2] }}>
              Sent From
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
              {companyInfo?.name || "Company"}
            </div>
            {companyInfo?.email && (
              <div style={{ fontSize: 11, color: C.textMuted }}>
                Reply-to: {companyInfo.email}
              </div>
            )}
            {companyInfo?.phone && (
              <div style={{ fontSize: 11, color: C.textMuted }}>
                {companyInfo.phone}
              </div>
            )}
          </div>

          {/* Recipient info card (if client found) */}
          {client && (
            <div style={{ background: C.bg2, borderRadius: T.radius.md, border: `1px solid ${C.border}`, padding: T.space[4] }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: T.space[2] }}>
                Recipient
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                {client.contact || client.company}
              </div>
              <div style={{ fontSize: 11, color: C.textMuted }}>{client.company}</div>
              {client.email && <div style={{ fontSize: 11, color: C.accent }}>{client.email}</div>}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function buildDefaultBody(project, client, companyInfo, totals) {
  const contactName = client?.contact || "Sir/Madam";
  const grandTotal = totals?.grand ? fmt(totals.grand) : "";
  const lines = [
    `Dear ${contactName},`,
    "",
    `Please find attached our proposal for ${project.name || "the above-referenced project"}. We have reviewed the plans and specifications and are pleased to submit the enclosed for your review.`,
    "",
    grandTotal ? `Total: ${grandTotal}` : "",
    "",
    "Please don't hesitate to reach out with any questions.",
    "",
    "Best regards,",
    companyInfo?.name || "",
    companyInfo?.phone || "",
    companyInfo?.email || "",
  ].filter(l => l !== undefined);
  return lines.join("\n");
}

const labelStyle = (C) => ({
  fontSize: 10, fontWeight: 600, color: C.textDim,
  textTransform: "uppercase", letterSpacing: 0.5,
  display: "block", marginBottom: 4,
});
