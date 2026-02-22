import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useInboxStore } from '@/stores/inboxStore';
import { useAuthStore } from '@/stores/authStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useUiStore } from '@/stores/uiStore';
import { supabase } from '@/utils/supabase';
import { loadEstimate } from '@/hooks/usePersistence';
import RfpCard from '@/components/inbox/RfpCard';
import RfpDetailModal from '@/components/inbox/RfpDetailModal';
import ImportConfirmModal from '@/components/inbox/ImportConfirmModal';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { bt, pageContainer, card, sectionLabel, inp } from '@/utils/styles';
import { titleCase, uid, nowStr } from '@/utils/format';
import { loadPdfJs } from '@/utils/pdf';

const API_BASE = import.meta.env.DEV
  ? "https://app-nova-42373ca7.vercel.app"
  : "";

// Convert ArrayBuffer to base64 (chunked to avoid stack overflow on large files)
const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "all", label: "All" },
  { key: "imported", label: "Imported" },
  { key: "dismissed", label: "Dismissed" },
];

export default function InboxPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const showToast = useUiStore(s => s.showToast);
  const importFromRfp = useEstimatesStore(s => s.importFromRfp);

  // Auth from global authStore (user is guaranteed logged in by App.jsx)
  const user = useAuthStore(s => s.user);

  const {
    rfps, loading, error, filter, unreadCount,
    fetchRfps, subscribeToRfps, setFilter,
    dismissRfp, importRfp,
    registerSenderEmail, removeSenderEmail, fetchSenderEmails,
  } = useInboxStore();

  const [viewRfp, setViewRfp] = useState(null);
  const [importRfpData, setImportRfpData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [senderEmails, setSenderEmails] = useState([]);
  const [newSender, setNewSender] = useState("");
  const [addingSender, setAddingSender] = useState(false);

  // Fetch RFPs + subscribe (user is already authenticated at this point)
  useEffect(() => {
    fetchRfps();
    fetchSenderEmails().then(setSenderEmails);
    const unsub = subscribeToRfps();
    return unsub;
  }, [filter]);

  const handleAddSender = async () => {
    const email = newSender.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    if (senderEmails.includes(email)) {
      showToast("Email already registered");
      return;
    }
    setAddingSender(true);
    try {
      const result = await registerSenderEmail(email);
      if (result.error) {
        if (result.error === "duplicate") {
          // Already exists in DB — sync local state and clear input
          setSenderEmails(prev => prev.includes(email) ? prev : [...prev, email]);
          setNewSender("");
          showToast("Email already registered");
        } else {
          showToast(result.error);
        }
      } else {
        setSenderEmails(prev => [...prev, email]);
        setNewSender("");
        showToast("Sender email approved");
      }
    } catch (err) {
      showToast("Failed to add: " + err.message);
    }
    setAddingSender(false);
  };

  const handleRemoveSender = async (email) => {
    await removeSenderEmail(email);
    setSenderEmails(prev => prev.filter(e => e !== email));
    showToast("Sender email removed");
  };

  const handleImport = async (rfp) => {
    setImportRfpData(rfp);
    setViewRfp(null);
  };

  const handleImportConfirm = async (editedFields) => {
    if (!importRfpData) return;
    setImporting(true);
    try {
      const result = await importRfp(importRfpData.id);
      if (!result) throw new Error("Import failed");

      // Override with user's edits (always apply modal values, fall back to API values)
      // Apply title case to name fields for consistent capitalization
      const data = result.estimateData;
      data.project.name = titleCase(editedFields.projectName || data.project.name);
      data.project.client = titleCase(editedFields.client || data.project.client);
      data.project.architect = titleCase(editedFields.architect || data.project.architect);
      data.project.address = editedFields.address || data.project.address;
      data.project.jobType = editedFields.jobType || data.project.jobType;
      data.project.bidDue = editedFields.bidDue || data.project.bidDue;
      data.project.bidDueTime = editedFields.bidDueTime || data.project.bidDueTime;
      data.project.description = editedFields.description || data.project.description;

      // Include documents from attachments
      if (result.attachments && result.attachments.length > 0) {
        data.documents = result.attachments.map(att => ({
          id: att.downloadPath || att.filename,
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          source: "rfp",
          storagePath: att.downloadPath || null,
          data: null,
          uploadDate: new Date().toISOString(),
        }));
      }

      // Download PDF attachments and add as drawings for takeoffs
      const pdfAttachments = (result.attachments || []).filter(att =>
        att.contentType === "application/pdf" || att.filename?.toLowerCase().endsWith(".pdf")
      );
      if (pdfAttachments.length > 0) {
        try {
          const session = supabase ? (await supabase.auth.getSession()).data.session : null;
          const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {};
          await loadPdfJs();

          const drawings = [];
          for (const att of pdfAttachments) {
            try {
              const url = `${API_BASE}/api/attachment?path=${encodeURIComponent(att.downloadPath)}`;
              const resp = await fetch(url, { headers });
              if (!resp.ok) { console.error(`PDF download failed: ${att.filename} (${resp.status})`); continue; }

              const buffer = await resp.arrayBuffer();
              const base64 = arrayBufferToBase64(buffer);
              const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

              for (let p = 1; p <= pdf.numPages; p++) {
                drawings.push({
                  id: uid(),
                  label: `${att.filename.replace(/\.pdf$/i, "")}-Pg${p}`,
                  sheetNumber: "",
                  sheetTitle: "",
                  revision: "0",
                  type: "pdf",
                  data: base64,
                  fileName: att.filename,
                  uploadDate: new Date().toISOString(),
                  pdfPage: p,
                  totalPdfPages: pdf.numPages,
                });
              }
              console.log(`[import] ${att.filename}: ${pdf.numPages} pages added as drawings`);
            } catch (err) {
              console.error(`Failed to load PDF as drawing: ${att.filename}`, err);
            }
          }
          if (drawings.length > 0) {
            data.drawings = drawings;
          }
        } catch (err) {
          console.error("PDF drawing import error:", err);
        }
      }

      // Create estimate in IndexedDB
      const estId = await importFromRfp(data);
      // Load the saved estimate into all stores so project data is available immediately
      await loadEstimate(estId);
      showToast("RFP imported as estimate!");
      setImportRfpData(null);
      setImporting(false);
      fetchRfps();
      navigate(`/estimate/${estId}/info`);
    } catch (err) {
      showToast("Failed to import: " + err.message);
      setImporting(false);
    }
  };

  // Not configured — show info
  if (!supabase) {
    return (
      <div style={pageContainer(C)}>
        <div style={{ maxWidth: 520, margin: "60px auto", textAlign: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px",
            background: `${C.accent}18`, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Ic d={I.inbox} size={28} color={C.accent} />
          </div>
          <h2 style={{ color: C.text, fontWeight: T.fontWeight.bold, marginBottom: T.space[3] }}>
            Email Inbox
          </h2>
          <p style={{ color: C.textMuted, fontSize: T.fontSize.sm, lineHeight: T.lineHeight.relaxed, marginBottom: T.space[5] }}>
            Forward RFP emails to your dedicated address and AI will automatically parse bid information, extract contacts, and create draft estimates.
          </p>
          <div style={{
            ...card(C), padding: T.space[5], textAlign: "left",
          }}>
            <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Setup Required</div>
            <p style={{ color: C.textMuted, fontSize: T.fontSize.sm, lineHeight: T.lineHeight.relaxed }}>
              This feature requires Supabase configuration. Add your Supabase URL and anon key to the environment variables to enable the email inbox.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageContainer(C)}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[5] }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
            <Ic d={I.inbox} size={22} color={C.accent} />
            <h1 style={{ fontSize: T.fontSize.xl, fontWeight: T.fontWeight.bold, color: C.text, margin: 0 }}>
              RFP Inbox
            </h1>
            {unreadCount > 0 && (
              <span style={{
                fontSize: T.fontSize.xs, fontWeight: T.fontWeight.bold,
                padding: "2px 8px", borderRadius: T.radius.full,
                background: C.accent, color: "#fff",
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
            {user?.email}
          </div>
        </div>

        {/* Forwarding address info */}
        <div style={{
          ...card(C), padding: T.space[4], marginBottom: T.space[5],
          background: `${C.accent}08`, border: `1px solid ${C.accent}20`,
          display: "flex", alignItems: "center", gap: T.space[3],
        }}>
          <Ic d={I.inbox} size={16} color={C.accent} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>Forward RFP emails to: </span>
            <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.accent }}>
              bids@novabuild.app
            </span>
          </div>
          <button
            style={bt(C, { padding: "4px 10px", fontSize: T.fontSize.xs, background: "transparent", color: C.textDim, border: `1px solid ${C.border}` })}
            onClick={() => { navigator.clipboard.writeText("bids@novabuild.app"); showToast("Copied!"); }}
          >
            Copy
          </button>
        </div>

        {/* Approved Senders */}
        <div style={{
          ...card(C), padding: T.space[4], marginBottom: T.space[5],
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[3] }}>
            <div style={{ fontSize: T.fontSize.xs, fontWeight: T.fontWeight.semibold, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Approved Sender Emails
            </div>
            <span style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
              {senderEmails.length} registered
            </span>
          </div>
          <div style={{ fontSize: T.fontSize.xs, color: C.textMuted, marginBottom: T.space[3], lineHeight: 1.5 }}>
            Only emails forwarded from these addresses will be processed. Add the email address you forward RFPs from (e.g. your work email).
          </div>

          {senderEmails.map(email => (
            <div key={email} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 10px", borderRadius: 6, background: C.bg, border: `1px solid ${C.border}`, marginBottom: 4,
            }}>
              <span style={{ fontSize: 12, color: C.text, fontFamily: "'DM Mono',monospace" }}>{email}</span>
              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }} onClick={() => handleRemoveSender(email)}>
                <Ic d={I.x} size={12} color={C.textDim} />
              </button>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: senderEmails.length > 0 ? 8 : 0 }}>
            <input type="email" value={newSender} onChange={e => setNewSender(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAddSender()}
              placeholder="sender@example.com" style={inp(C, { flex: 1, fontSize: 12 })} />
            <button type="button"
              style={bt(C, { padding: "6px 14px", fontSize: T.fontSize.xs, background: C.accent, color: "#fff", opacity: addingSender ? 0.6 : 1 })}
              onClick={handleAddSender}
              disabled={addingSender}
            >
              {addingSender ? "..." : "Add"}
            </button>
          </div>

          {senderEmails.length === 0 && (
            <div style={{
              marginTop: T.space[3], padding: T.space[3], borderRadius: 6,
              background: `${C.orange}12`, border: `1px solid ${C.orange}30`,
              fontSize: T.fontSize.xs, color: C.orange, lineHeight: 1.5,
            }}>
              <strong>No senders registered.</strong> Forwarded emails will be silently dropped until you add at least one approved sender address above.
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: T.space[1], marginBottom: T.space[4] }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              style={bt(C, {
                padding: "6px 14px", fontSize: T.fontSize.sm,
                background: filter === f.key ? C.accentBg : "transparent",
                color: filter === f.key ? C.accent : C.textMuted,
                border: `1px solid ${filter === f.key ? C.accent + "40" : "transparent"}`,
              })}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* RFP list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: T.space[7], color: C.textDim }}>
            Loading...
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: T.space[7], color: C.red }}>
            {error}
          </div>
        ) : rfps.length === 0 ? (
          <div style={{
            textAlign: "center", padding: T.space[7],
            ...card(C), border: `2px dashed ${C.border}`,
          }}>
            <Ic d={I.inbox} size={32} color={C.textDim} />
            <div style={{ color: C.textMuted, marginTop: T.space[3], fontSize: T.fontSize.sm }}>
              {senderEmails.length === 0
                ? "Add an approved sender email above, then forward an RFP to get started."
                : "No RFPs yet. Forward an email to bids@novabuild.app to get started."}
            </div>
          </div>
        ) : (
          rfps.map(rfp => (
            <RfpCard
              key={rfp.id}
              rfp={rfp}
              onView={setViewRfp}
              onImport={handleImport}
              onDismiss={dismissRfp}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {viewRfp && (
        <RfpDetailModal
          rfp={viewRfp}
          onClose={() => setViewRfp(null)}
          onImport={handleImport}
        />
      )}
      {importRfpData && (
        <ImportConfirmModal
          rfp={importRfpData}
          onClose={() => setImportRfpData(null)}
          onConfirm={handleImportConfirm}
          loading={importing}
        />
      )}
    </div>
  );
}
