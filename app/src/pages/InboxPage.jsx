import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useInboxStore } from "@/stores/inboxStore";
import { useAuthStore } from "@/stores/authStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { supabase } from "@/utils/supabase";
import { loadEstimate } from "@/hooks/usePersistence";
import RfpCard from "@/components/inbox/RfpCard";
import RfpDetailModal from "@/components/inbox/RfpDetailModal";
import ImportConfirmModal from "@/components/inbox/ImportConfirmModal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, pageContainer, card, sectionLabel } from "@/utils/styles";
import { titleCase, uid } from "@/utils/format";
import { loadPdfJs } from "@/utils/pdf";

const API_BASE = import.meta.env.DEV ? "https://app-nova-42373ca7.vercel.app" : "";

// Convert ArrayBuffer to base64 (chunked to avoid stack overflow on large files)
const arrayBufferToBase64 = buffer => {
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
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
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
    rfps,
    loading,
    error,
    filter,
    readIds,
    fetchRfps,
    subscribeToRfps,
    setFilter,
    dismissRfp,
    importRfp,
    retryParse,
    loadReadIds,
    markAsRead,
    fetchSenderEmails,
  } = useInboxStore();
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);

  const [viewRfp, setViewRfp] = useState(null);
  const [importRfpData, setImportRfpData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [senderEmails, setSenderEmails] = useState([]);

  // Progress tracking for ImportConfirmModal
  const [progressSteps, setProgressSteps] = useState([]);
  const [importComplete, setImportComplete] = useState(false);
  const [createdEstimateId, setCreatedEstimateId] = useState(null);

  // Fetch RFPs + subscribe (user is already authenticated at this point)
  useEffect(() => {
    loadReadIds();
    fetchRfps();
    fetchSenderEmails().then(setSenderEmails);
    const unsub = subscribeToRfps();
    return unsub;
  }, []);

  // Expose navigate for ImportConfirmModal CTA
  useEffect(() => {
    window.__importNav = path => {
      setImportRfpData(null);
      setImporting(false);
      setProgressSteps([]);
      setImportComplete(false);
      setCreatedEstimateId(null);
      navigate(path);
    };
    return () => {
      delete window.__importNav;
    };
  }, [navigate]);

  // Filter by company profile first, then by status tab
  const displayedRfps = useMemo(() => {
    // Company profile filter (same logic as estimates)
    const companyFiltered =
      activeCompanyId === "__all__"
        ? rfps
        : rfps.filter(r => {
            const cid = r.company_profile_id || "";
            return cid === activeCompanyId || cid === "";
          });

    // Status tab filter
    if (filter === "unread") {
      return companyFiltered.filter(r => (r.status === "parsed" || r.status === "pending") && !readIds.includes(r.id));
    }
    if (filter === "imported") return companyFiltered.filter(r => r.status === "imported");
    if (filter === "dismissed") return companyFiltered.filter(r => r.status === "dismissed");
    return companyFiltered; // "all"
  }, [rfps, filter, readIds, activeCompanyId]);

  // Profile-filtered unread count
  const unreadCount = useMemo(() => {
    const companyFiltered =
      activeCompanyId === "__all__"
        ? rfps
        : rfps.filter(r => {
            const cid = r.company_profile_id || "";
            return cid === activeCompanyId || cid === "";
          });
    return companyFiltered.filter(r => (r.status === "parsed" || r.status === "pending") && !readIds.includes(r.id))
      .length;
  }, [rfps, readIds, activeCompanyId]);

  // Mark as read + open detail view
  const handleView = rfp => {
    markAsRead(rfp.id);
    setViewRfp(rfp);
  };

  const handleImport = async rfp => {
    setImportRfpData(rfp);
    setViewRfp(null);
    // Reset processing state
    setProgressSteps([]);
    setImportComplete(false);
    setCreatedEstimateId(null);
  };

  // Helper to update progress steps
  const setStep = useCallback((steps, index, status, label) => {
    const updated = [...steps];
    if (label) updated[index] = { ...updated[index], label, status };
    else updated[index] = { ...updated[index], status };
    setProgressSteps(updated);
    return updated;
  }, []);

  const handleImportConfirm = async ({ fields: editedFields, destination, profileId: selectedProfileId }) => {
    if (!importRfpData) return;
    setImporting(true);

    // Build initial progress steps
    const pdfAtts = (importRfpData.attachments || []).filter(
      a => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf"),
    );
    const hasPdfs = pdfAtts.length > 0;

    let steps = [
      { label: "Creating estimate...", status: "active" },
      ...(hasPdfs
        ? [{ label: `Processing ${pdfAtts.length} PDF${pdfAtts.length > 1 ? "s" : ""}...`, status: "pending" }]
        : []),
      { label: "Finalizing...", status: "pending" },
    ];
    setProgressSteps(steps);

    try {
      // Use the profile selected in the modal (falls back to active profile)
      const profileId =
        selectedProfileId != null ? selectedProfileId : activeCompanyId === "__all__" ? "" : activeCompanyId;
      const result = await importRfp(importRfpData.id, profileId);
      if (!result) throw new Error("Import failed");

      // Override with user's edits (always apply modal values, fall back to API values)
      const data = result.estimateData;
      data.project.name = titleCase(editedFields.projectName || data.project.name);
      data.project.client = titleCase(editedFields.client || data.project.client);
      data.project.architect = titleCase(editedFields.architect || data.project.architect);
      data.project.address = editedFields.address || data.project.address;
      data.project.jobType = editedFields.jobType || data.project.jobType;
      data.project.bidDue = editedFields.bidDue || data.project.bidDue;
      data.project.bidDueTime = editedFields.bidDueTime || data.project.bidDueTime;
      data.project.description = editedFields.description || data.project.description;

      // Mark step 1 done
      steps = setStep(steps, 0, "done", "Estimate created");

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
      if (hasPdfs) {
        const pdfStepIdx = 1;
        steps = setStep(steps, pdfStepIdx, "active");

        try {
          const session = supabase ? (await supabase.auth.getSession()).data.session : null;
          const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {};
          await loadPdfJs();

          const drawings = [];
          let totalPages = 0;
          for (const att of pdfAtts) {
            try {
              const url = `${API_BASE}/api/attachment?path=${encodeURIComponent(att.downloadPath)}`;
              const resp = await fetch(url, { headers });
              if (!resp.ok) {
                console.error(`PDF download failed: ${att.filename} (${resp.status})`);
                continue;
              }

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
              totalPages += pdf.numPages;

              // Update step label with progress
              steps = setStep(
                steps,
                pdfStepIdx,
                "active",
                `Processing PDFs... ${att.filename} (${pdf.numPages} pages)`,
              );
              console.log(`[import] ${att.filename}: ${pdf.numPages} pages added as drawings`);
            } catch (err) {
              console.error(`Failed to load PDF as drawing: ${att.filename}`, err);
            }
          }
          if (drawings.length > 0) {
            data.drawings = drawings;
          }
          steps = setStep(
            steps,
            pdfStepIdx,
            "done",
            `${pdfAtts.length} PDF${pdfAtts.length > 1 ? "s" : ""} processed (${totalPages} pages)`,
          );
        } catch (err) {
          console.error("PDF drawing import error:", err);
          steps = setStep(steps, pdfStepIdx, "done", "PDF processing complete (with some errors)");
        }
      }

      // Finalize step
      const finalIdx = steps.length - 1;
      steps = setStep(steps, finalIdx, "active", "Saving estimate...");

      // Create estimate in IndexedDB
      const estId = await importFromRfp(data);
      // Load the saved estimate into all stores so project data is available immediately
      await loadEstimate(estId);

      steps = setStep(steps, finalIdx, "done", "Complete!");
      setCreatedEstimateId(estId);
      setImportComplete(true);
      setImporting(false);
      showToast("RFP imported as estimate!");
      fetchRfps();
    } catch (err) {
      showToast("Failed to import: " + err.message);
      setImporting(false);
      setImportRfpData(null);
      setProgressSteps([]);
      setImportComplete(false);
    }
  };

  // Not configured — show info
  if (!supabase) {
    return (
      <div style={pageContainer(C)}>
        <div style={{ maxWidth: 520, margin: "60px auto", textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              margin: "0 auto 20px",
              background: `${C.accent}18`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ic d={I.inbox} size={28} color={C.accent} />
          </div>
          <h2 style={{ color: C.text, fontWeight: T.fontWeight.bold, marginBottom: T.space[3] }}>Email Inbox</h2>
          <p
            style={{
              color: C.textMuted,
              fontSize: T.fontSize.sm,
              lineHeight: T.lineHeight.relaxed,
              marginBottom: T.space[5],
            }}
          >
            Forward RFP emails to your dedicated address and AI will automatically parse bid information, extract
            contacts, and create draft estimates.
          </p>
          <div
            style={{
              ...card(C),
              padding: T.space[5],
              textAlign: "left",
            }}
          >
            <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>Setup Required</div>
            <p style={{ color: C.textMuted, fontSize: T.fontSize.sm, lineHeight: T.lineHeight.relaxed }}>
              This feature requires Supabase configuration. Add your Supabase URL and anon key to the environment
              variables to enable the email inbox.
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
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[5] }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
            <Ic d={I.inbox} size={22} color={C.accent} />
            <h1 style={{ fontSize: T.fontSize.xl, fontWeight: T.fontWeight.bold, color: C.text, margin: 0 }}>
              RFP Inbox
            </h1>
            {unreadCount > 0 && (
              <span
                style={{
                  fontSize: T.fontSize.xs,
                  fontWeight: T.fontWeight.bold,
                  padding: "2px 8px",
                  borderRadius: T.radius.full,
                  background: C.accent,
                  color: "#fff",
                }}
              >
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>{user?.email}</div>
        </div>

        {/* Forwarding address info */}
        <div
          style={{
            ...card(C),
            padding: T.space[4],
            marginBottom: T.space[5],
            background: `${C.accent}08`,
            border: `1px solid ${C.accent}20`,
            display: "flex",
            alignItems: "center",
            gap: T.space[3],
          }}
        >
          <Ic d={I.inbox} size={16} color={C.accent} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>Forward RFP emails to: </span>
            <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.accent }}>
              bids@novabuild.app
            </span>
          </div>
          <button
            style={bt(C, {
              padding: "4px 10px",
              fontSize: T.fontSize.xs,
              background: "transparent",
              color: C.textDim,
              border: `1px solid ${C.border}`,
            })}
            onClick={() => {
              navigator.clipboard.writeText("bids@novabuild.app");
              showToast("Copied!");
            }}
          >
            Copy
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: T.space[1], marginBottom: T.space[4] }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              style={bt(C, {
                padding: "6px 14px",
                fontSize: T.fontSize.sm,
                background: filter === f.key ? C.accentBg : "transparent",
                color: filter === f.key ? C.accent : C.textMuted,
                border: `1px solid ${filter === f.key ? C.accent + "40" : "transparent"}`,
                display: "flex",
                alignItems: "center",
                gap: 6,
              })}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              {f.key === "unread" && unreadCount > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: T.fontWeight.bold,
                    padding: "1px 6px",
                    borderRadius: T.radius.full,
                    background: C.accent,
                    color: "#fff",
                    minWidth: 16,
                    textAlign: "center",
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* RFP list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: T.space[7], color: C.textDim }}>Loading...</div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: T.space[7], color: C.red }}>{error}</div>
        ) : displayedRfps.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: T.space[7],
              ...card(C),
              border: `2px dashed ${C.border}`,
            }}
          >
            <Ic d={I.inbox} size={32} color={C.textDim} />
            <div style={{ color: C.textMuted, marginTop: T.space[3], fontSize: T.fontSize.sm }}>
              {rfps.length === 0
                ? senderEmails.length === 0
                  ? "Add an approved sender email in Settings, then forward an RFP to get started."
                  : "No RFPs yet. Forward an email to bids@novabuild.app to get started."
                : filter === "unread"
                  ? "All caught up! No unread emails."
                  : `No ${filter} emails.`}
            </div>
          </div>
        ) : (
          displayedRfps.map(rfp => (
            <RfpCard
              key={rfp.id}
              rfp={rfp}
              isUnread={(rfp.status === "parsed" || rfp.status === "pending") && !readIds.includes(rfp.id)}
              onView={handleView}
              onImport={handleImport}
              onDismiss={dismissRfp}
              onRetry={async id => {
                const result = await retryParse(id);
                if (result.success) {
                  showToast("Re-parsed successfully!");
                  fetchRfps();
                } else if (result.error) {
                  showToast("Parse failed: " + result.error);
                }
              }}
            />
          ))
        )}
      </div>

      {/* Modals */}
      {viewRfp && <RfpDetailModal rfp={viewRfp} onClose={() => setViewRfp(null)} onImport={handleImport} />}
      {importRfpData && (
        <ImportConfirmModal
          rfp={importRfpData}
          onClose={() => {
            setImportRfpData(null);
            setProgressSteps([]);
            setImportComplete(false);
            setCreatedEstimateId(null);
          }}
          onConfirm={handleImportConfirm}
          loading={importing}
          progressSteps={progressSteps}
          importComplete={importComplete}
          createdEstimateId={createdEstimateId}
        />
      )}
    </div>
  );
}
