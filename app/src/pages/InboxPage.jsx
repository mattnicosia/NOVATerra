import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useInboxStore } from "@/stores/inboxStore";
import { useAuthStore } from "@/stores/authStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { useCalendarStore } from "@/stores/calendarStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { supabase } from "@/utils/supabase";
import { loadEstimate } from "@/hooks/usePersistence";
import { processContact } from "@/utils/contactDedup";
import RfpCard from "@/components/inbox/RfpCard";
import RfpDetailModal from "@/components/inbox/RfpDetailModal";
import ImportConfirmModal from "@/components/inbox/ImportConfirmModal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, pageContainer, card, sectionLabel } from "@/utils/styles";
import { titleCase, uid } from "@/utils/format";
import { loadPdfJs } from "@/utils/pdf";
import { runFullScan } from "@/utils/scanRunner";

const API_BASE = import.meta.env.DEV ? "https://app-nova-42373ca7.vercel.app" : "";

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
  const [failedCloudLinks, setFailedCloudLinks] = useState([]);

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
      setFailedCloudLinks([]);
      navigate(path);
    };
    return () => {
      delete window.__importNav;
    };
  }, [navigate]);

  // Filter by company profile first, then by status tab
  const displayedRfps = useMemo(() => {
    // Company profile filter — include unassigned RFPs (no company_profile_id) alongside matched ones
    const companyFiltered =
      activeCompanyId === "__all__"
        ? rfps
        : rfps.filter(r => {
            const cid = r.company_profile_id || "";
            return cid === (activeCompanyId || "") || cid === "";
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
            return cid === (activeCompanyId || "") || cid === "";
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
    setFailedCloudLinks([]);
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
    setFailedCloudLinks([]);

    // Step 0: Creating estimate
    let steps = [{ label: "Creating estimate...", status: "active" }];
    setProgressSteps(steps);

    try {
      // --- Step 0: Import RFP (create estimate data) ---
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
      data.project.workType = editedFields.workType || data.project.workType;
      data.project.bidType = editedFields.bidType || data.project.bidType;
      data.project.bidDelivery = editedFields.bidDelivery || data.project.bidDelivery;
      data.project.bidDue = editedFields.bidDue || data.project.bidDue;
      data.project.bidDueTime = editedFields.bidDueTime || data.project.bidDueTime;
      data.project.description = editedFields.description || data.project.description;
      data.project.companyProfileId = profileId;

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

      // Email PDF attachments
      const emailPdfAtts = (importRfpData.attachments || []).filter(
        a => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf"),
      );

      // Get auth session once (used for cloud download + PDF download)
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const authHeaders = session ? { Authorization: `Bearer ${session.access_token}` } : {};

      // --- Cloud download step (optional) ---
      const cloudLinks = result.planLinks || [];
      const hasCloudLinks = cloudLinks.length > 0;
      let cloudPdfAtts = [];
      let cloudStoragePaths = [];

      if (hasCloudLinks) {
        const cloudStepIdx = steps.length;
        steps = [
          ...steps,
          {
            label: `Downloading ${cloudLinks.length} cloud file${cloudLinks.length > 1 ? "s" : ""}...`,
            status: "active",
          },
        ];
        setProgressSteps(steps);

        try {
          const existingFilenames = emailPdfAtts.map(a => a.filename);

          const cloudResp = await fetch(`${API_BASE}/api/fetch-cloud-files`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              planLinks: cloudLinks,
              rfpId: importRfpData.id,
              existingFilenames,
            }),
          });

          if (!cloudResp.ok) {
            const errData = await cloudResp.json().catch(() => ({}));
            throw new Error(errData.error || `Cloud download failed (${cloudResp.status})`);
          }

          const cloudResult = await cloudResp.json();
          const cloudFiles = cloudResult.files || [];
          const cloudErrors = cloudResult.errors || [];

          // Track failed links for UI
          if (cloudErrors.length > 0) {
            setFailedCloudLinks(cloudErrors);
            // Preserve failed URLs in project data for manual access
            data.project.planLinks = cloudErrors.map(e => ({ url: e.url, label: e.label, error: e.message }));
          }

          // Separate cloud files by category
          for (const cf of cloudFiles) {
            // Only track storagePath for cleanup if file was uploaded to Supabase
            if (cf.storagePath) cloudStoragePaths.push(cf.storagePath);

            const isPdf = cf.contentType === "application/pdf" || cf.filename?.toLowerCase().endsWith(".pdf");

            if (isPdf && (cf.docCategory === "drawing" || cf.docCategory === "addendum" || !cf.docCategory)) {
              // PDFs classified as drawings/addenda → process as drawings
              cloudPdfAtts.push({
                filename: cf.filename,
                downloadPath: cf.storagePath,
                proxyToken: cf.proxyToken || null,
                contentType: cf.contentType,
                size: cf.size,
                isAddendum: cf.isAddendum || false,
                addendumNumber: cf.addendumNumber || null,
                relativePath: cf.relativePath || null,
                source: "cloud",
                provider: cf.provider,
              });
            } else {
              // Non-PDF files or specs/bid forms → add as documents
              if (!data.documents) data.documents = [];
              data.documents.push({
                id: cf.storagePath || cf.filename,
                filename: cf.filename,
                contentType: cf.contentType,
                size: cf.size,
                source: "cloud",
                provider: cf.provider,
                storagePath: cf.storagePath,
                proxyToken: cf.proxyToken || null,
                docCategory: cf.docCategory || "general",
                data: null,
                uploadDate: new Date().toISOString(),
              });
            }
          }

          const downloadedCount = cloudFiles.length;
          const errorCount = cloudErrors.length;
          const statusLabel =
            errorCount > 0
              ? `${downloadedCount} file${downloadedCount !== 1 ? "s" : ""} downloaded (${errorCount} failed)`
              : `${downloadedCount} cloud file${downloadedCount !== 1 ? "s" : ""} downloaded`;
          steps = setStep(steps, cloudStepIdx, "done", statusLabel);
        } catch (err) {
          console.error("Cloud download error:", err);
          steps = setStep(steps, cloudStepIdx, "done", "Cloud download failed — links preserved");
          // Preserve all cloud links for manual access
          data.project.planLinks = cloudLinks.map(l => ({ url: l.url, label: l.label }));
          setFailedCloudLinks(cloudLinks.map(l => ({ url: l.url, label: l.label, message: err.message })));
        }
      }

      // Combine email + cloud PDFs
      const allPdfAtts = [...emailPdfAtts, ...cloudPdfAtts];
      const hasPdfs = allPdfAtts.length > 0;

      // Build remaining steps dynamically now that we know the full picture
      const pdfStepIdx = hasPdfs ? steps.length : -1;
      if (hasPdfs) {
        steps = [
          ...steps,
          {
            label: `Processing ${allPdfAtts.length} PDF${allPdfAtts.length > 1 ? "s" : ""}...`,
            status: "pending",
          },
        ];
      }
      const saveStepIdx = steps.length;
      steps = [...steps, { label: "Saving estimate...", status: "pending" }];
      const discoveryStepIdx = steps.length;
      steps = [...steps, { label: "Running NOVA Discovery...", status: "pending" }];
      setProgressSteps(steps);

      // --- PDF processing step ---
      if (hasPdfs) {
        steps = setStep(steps, pdfStepIdx, "active");

        try {
          await loadPdfJs();

          const drawings = [];
          let totalPages = 0;
          for (const att of allPdfAtts) {
            try {
              // Use proxy endpoint for large files (no storagePath), or standard attachment endpoint
              const url = att.proxyToken
                ? `${API_BASE}/api/proxy-cloud-file?token=${encodeURIComponent(att.proxyToken)}`
                : `${API_BASE}/api/attachment?path=${encodeURIComponent(att.downloadPath)}`;
              const resp = await fetch(url, { headers: authHeaders });
              if (!resp.ok) {
                console.error(`PDF download failed: ${att.filename} (${resp.status})`);
                continue;
              }

              const buffer = await resp.arrayBuffer();
              const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

              // Render each page to JPEG instead of storing raw PDF base64 per page
              for (let p = 1; p <= pdf.numPages; p++) {
                const pg = await pdf.getPage(p);
                const scale = 1.5;
                const vp = pg.getViewport({ scale });
                const canvas = document.createElement("canvas");
                canvas.width = vp.width;
                canvas.height = vp.height;
                await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
                const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.85);

                const drawing = {
                  id: uid(),
                  label: `${att.filename.replace(/\.pdf$/i, "")}-Pg${p}`,
                  sheetNumber: "",
                  sheetTitle: "",
                  revision: "0",
                  type: "pdf",
                  pdfPreRendered: true,
                  data: jpegDataUrl,
                  fileName: att.filename,
                  uploadDate: new Date().toISOString(),
                  pdfPage: p,
                  totalPdfPages: pdf.numPages,
                };
                // Add addendum metadata from cloud files
                if (att.isAddendum) {
                  drawing.isAddendum = true;
                  drawing.addendumNumber = att.addendumNumber;
                }
                // Preserve relative path for future auto-grouping
                if (att.relativePath) {
                  drawing.relativePath = att.relativePath;
                }
                if (att.source === "cloud") {
                  drawing.source = "cloud";
                  drawing.provider = att.provider;
                }
                drawings.push(drawing);
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
            `${allPdfAtts.length} PDF${allPdfAtts.length > 1 ? "s" : ""} processed (${totalPages} pages)`,
          );
        } catch (err) {
          console.error("PDF drawing import error:", err);
          steps = setStep(steps, pdfStepIdx, "done", "PDF processing complete (with some errors)");
        }
      }

      // Cleanup cloud temp files from Supabase after extraction
      if (cloudStoragePaths.length > 0) {
        try {
          await fetch(`${API_BASE}/api/cleanup-cloud-files`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ paths: cloudStoragePaths }),
          });
        } catch (err) {
          console.error("Cloud cleanup error:", err);
          // Non-critical — files can be cleaned up later
        }
      }

      // --- Save step ---
      steps = setStep(steps, saveStepIdx, "active", "Saving estimate...");

      // Create estimate in IndexedDB
      const estId = await importFromRfp(data);
      // Load the saved estimate into all stores so project data is available immediately
      await loadEstimate(estId);

      steps = setStep(steps, saveStepIdx, "done", "Estimate saved");

      // --- Auto-create calendar events from parsed dates ---
      try {
        const { addTask } = useCalendarStore.getState();
        if (data.project.bidDue) {
          addTask({
            title: `Bid Due: ${data.project.name}`,
            date: data.project.bidDue,
            time: data.project.bidDueTime || "",
            description: `Bid submission deadline for ${data.project.name}`,
            estimateId: estId,
            color: "#FF3B30",
          });
        }
        if (data.project.walkthroughDate) {
          addTask({
            title: `Walkthrough: ${data.project.name}`,
            date: data.project.walkthroughDate,
            time: "",
            description: `Site walkthrough for ${data.project.name}`,
            estimateId: estId,
            color: "#007AFF",
          });
        }
        if (data.project.rfiDueDate) {
          addTask({
            title: `RFI Due: ${data.project.name}`,
            date: data.project.rfiDueDate,
            time: "",
            description: `RFI submission deadline for ${data.project.name}`,
            estimateId: estId,
            color: "#FF9500",
          });
        }
      } catch (calErr) {
        console.error("Calendar auto-create error (non-critical):", calErr);
      }

      // --- Contact dedup / merge into masterData ---
      try {
        const mdState = useMasterDataStore.getState();
        const md = mdState.masterData;
        let mdUpdated = false;
        const updatedMd = { ...md };

        const contactPairs = [
          { data: result.contacts?.client, list: "clients" },
          { data: result.contacts?.architect, list: "architects" },
          { data: result.contacts?.engineer, list: "engineers" },
        ];

        for (const { data: contactData, list } of contactPairs) {
          if (!contactData?.company) continue;
          const result2 = processContact(contactData, updatedMd[list] || []);
          if (!result2) continue;

          if (result2.action === "merge") {
            updatedMd[list] = (updatedMd[list] || []).map(c => (c.id === result2.matchId ? result2.contact : c));
            mdUpdated = true;
          } else {
            updatedMd[list] = [...(updatedMd[list] || []), { id: uid(), ...result2.contact }];
            mdUpdated = true;
          }
        }

        if (mdUpdated) {
          mdState.setMasterData(updatedMd);
        }
      } catch (dedupErr) {
        console.error("Contact dedup error (non-critical):", dedupErr);
      }

      // --- Store bid list if parsed ---
      if (result.bidList?.length > 0) {
        data.project.bidList = result.bidList;
      }

      // --- Discovery step — run NOVA scan on imported drawings ---
      // Ensure drawings are in the store — loadEstimate may have set them,
      // but force-set from local data to guarantee runFullScan finds them
      if (data.drawings && data.drawings.length > 0) {
        const storeDrawings = useDrawingsStore.getState().drawings;
        if (storeDrawings.length === 0) {
          useDrawingsStore.getState().setDrawings(data.drawings);
        }
      }
      const scanDrawings = useDrawingsStore.getState().drawings.filter(d => d.data);
      if (scanDrawings.length > 0) {
        steps = setStep(steps, discoveryStepIdx, "active", "Running NOVA Discovery...");
        try {
          await runFullScan({
            onComplete: () => {
              steps = setStep(steps, discoveryStepIdx, "done", "Discovery complete!");
              setProgressSteps([...steps]);
            },
            onError: msg => {
              steps = setStep(steps, discoveryStepIdx, "done", `Discovery: ${msg || "skipped"}`);
              setProgressSteps([...steps]);
            },
          });
        } catch {
          steps = setStep(steps, discoveryStepIdx, "done", "Discovery skipped");
        }
      } else {
        steps = setStep(steps, discoveryStepIdx, "done", "No drawings — Discovery skipped");
      }

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

  // ── Addendum Import Flow ──────────────────────────────────────
  // When the RFP is an addendum (type === 'addendum'), merge into existing estimate
  const handleAddendumImport = async ({ profileId: selectedProfileId }) => {
    if (!importRfpData) return;
    setImporting(true);
    setFailedCloudLinks([]);

    let steps = [{ label: "Loading parent estimate...", status: "active" }];
    setProgressSteps(steps);

    try {
      const profileId =
        selectedProfileId != null ? selectedProfileId : activeCompanyId === "__all__" ? "" : activeCompanyId;
      const result = await importRfp(importRfpData.id, profileId);
      if (!result) throw new Error("Import failed");

      const parentEstimateId = result.parentEstimateId || importRfpData.parent_estimate_id;
      const addendumNumber = result.addendumNumber || importRfpData.addendum_number || 1;

      if (!parentEstimateId) {
        throw new Error("Parent estimate not found — import as new estimate instead");
      }

      // Load parent estimate into stores
      await loadEstimate(parentEstimateId);
      steps = setStep(steps, 0, "done", "Parent estimate loaded");

      // Get auth session
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      const authHeaders = session ? { Authorization: `Bearer ${session.access_token}` } : {};

      // Email PDF attachments from addendum
      const emailPdfAtts = (importRfpData.attachments || []).filter(
        a => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf"),
      );

      // Cloud download step (same as normal import)
      const cloudLinks = result.planLinks || [];
      const hasCloudLinks = cloudLinks.length > 0;
      let cloudPdfAtts = [];
      let cloudStoragePaths = [];

      if (hasCloudLinks) {
        const cloudStepIdx = steps.length;
        steps = [
          ...steps,
          {
            label: `Downloading ${cloudLinks.length} cloud file${cloudLinks.length > 1 ? "s" : ""}...`,
            status: "active",
          },
        ];
        setProgressSteps(steps);

        try {
          const cloudResp = await fetch(`${API_BASE}/api/fetch-cloud-files`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              planLinks: cloudLinks,
              rfpId: importRfpData.id,
              existingFilenames: emailPdfAtts.map(a => a.filename),
            }),
          });
          if (cloudResp.ok) {
            const cloudResult = await cloudResp.json();
            for (const cf of cloudResult.files || []) {
              if (cf.storagePath) cloudStoragePaths.push(cf.storagePath);
              const isPdf = cf.contentType === "application/pdf" || cf.filename?.toLowerCase().endsWith(".pdf");
              if (isPdf) {
                cloudPdfAtts.push({
                  filename: cf.filename,
                  downloadPath: cf.storagePath,
                  proxyToken: cf.proxyToken || null,
                  contentType: cf.contentType,
                  size: cf.size,
                  source: "cloud",
                  provider: cf.provider,
                });
              }
            }
            if (cloudResult.errors?.length > 0) setFailedCloudLinks(cloudResult.errors);
          }
          steps = setStep(steps, cloudStepIdx, "done", `Cloud files downloaded`);
        } catch (err) {
          console.error("Addendum cloud download error:", err);
          steps = setStep(steps, cloudStepIdx, "done", "Cloud download failed");
        }
      }

      // Process PDFs
      const allPdfAtts = [...emailPdfAtts, ...cloudPdfAtts];
      const hasPdfs = allPdfAtts.length > 0;

      const pdfStepIdx = hasPdfs ? steps.length : -1;
      if (hasPdfs)
        steps = [
          ...steps,
          {
            label: `Processing ${allPdfAtts.length} addendum PDF${allPdfAtts.length > 1 ? "s" : ""}...`,
            status: "pending",
          },
        ];
      const saveStepIdx = steps.length;
      steps = [...steps, { label: "Merging into estimate...", status: "pending" }];
      if (hasPdfs) steps = [...steps, { label: "Running NOVA Discovery...", status: "pending" }];
      const discoveryStepIdx = hasPdfs ? steps.length - 1 : -1;
      setProgressSteps(steps);

      if (hasPdfs) {
        steps = setStep(steps, pdfStepIdx, "active");
        try {
          await loadPdfJs();
          const newDrawings = [];
          for (const att of allPdfAtts) {
            try {
              // Use proxy endpoint for large files (no storagePath), or standard attachment endpoint
              const url = att.proxyToken
                ? `${API_BASE}/api/proxy-cloud-file?token=${encodeURIComponent(att.proxyToken)}`
                : `${API_BASE}/api/attachment?path=${encodeURIComponent(att.downloadPath)}`;
              const resp = await fetch(url, { headers: authHeaders });
              if (!resp.ok) continue;
              const buffer = await resp.arrayBuffer();
              const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
              // Render each page to JPEG instead of storing raw PDF base64 per page
              for (let p = 1; p <= pdf.numPages; p++) {
                const pg = await pdf.getPage(p);
                const scale = 1.5;
                const vp = pg.getViewport({ scale });
                const canvas = document.createElement("canvas");
                canvas.width = vp.width;
                canvas.height = vp.height;
                await pg.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
                const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.85);

                newDrawings.push({
                  id: uid(),
                  label: `${att.filename.replace(/\.pdf$/i, "")}-Pg${p}`,
                  sheetNumber: "",
                  sheetTitle: "",
                  revision: "0",
                  type: "pdf",
                  pdfPreRendered: true,
                  data: jpegDataUrl,
                  fileName: att.filename,
                  uploadDate: new Date().toISOString(),
                  pdfPage: p,
                  totalPdfPages: pdf.numPages,
                  isAddendum: true,
                  addendumNumber,
                  source: att.source || "rfp",
                  provider: att.provider || null,
                });
              }
            } catch (err) {
              console.error(`Addendum PDF error: ${att.filename}`, err);
            }
          }

          // Merge drawings using version tracking
          if (newDrawings.length > 0) {
            useDrawingsStore.getState().mergeAddendumDrawings(newDrawings, addendumNumber);
          }
          steps = setStep(
            steps,
            pdfStepIdx,
            "done",
            `${newDrawings.length} addendum drawing${newDrawings.length > 1 ? "s" : ""} processed`,
          );
        } catch (err) {
          console.error("Addendum PDF error:", err);
          steps = setStep(steps, pdfStepIdx, "done", "PDF processing complete (with errors)");
        }
      }

      // Cleanup cloud files
      if (cloudStoragePaths.length > 0) {
        try {
          await fetch(`${API_BASE}/api/cleanup-cloud-files`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ paths: cloudStoragePaths }),
          });
        } catch {}
      }

      // Save estimate (the drawings store already updated, trigger a save)
      steps = setStep(steps, saveStepIdx, "active", "Merging into estimate...");
      // Re-save the estimate with updated drawings
      const estStore = useEstimatesStore.getState();
      const drawingsStore = useDrawingsStore.getState();
      (await estStore.saveCurrentEstimate?.()) || (await loadEstimate(parentEstimateId));
      steps = setStep(steps, saveStepIdx, "done", `Addendum #${addendumNumber} merged`);

      // Calendar event for addendum
      try {
        useCalendarStore.getState().addTask({
          title: `Addendum #${addendumNumber}: ${importRfpData.parsed_data?.projectName || "Project"}`,
          date: new Date().toISOString().split("T")[0],
          time: "",
          description: `Addendum #${addendumNumber} received and imported`,
          estimateId: parentEstimateId,
          color: "#FF9500",
        });
      } catch {}

      // Discovery on new drawings
      if (hasPdfs) {
        steps = setStep(steps, discoveryStepIdx, "active", "Running NOVA Discovery...");
        try {
          await runFullScan({
            onComplete: () => {
              steps = setStep(steps, discoveryStepIdx, "done", "Discovery complete!");
              setProgressSteps([...steps]);
            },
            onError: msg => {
              steps = setStep(steps, discoveryStepIdx, "done", `Discovery: ${msg || "skipped"}`);
              setProgressSteps([...steps]);
            },
          });
        } catch {
          steps = setStep(steps, discoveryStepIdx, "done", "Discovery skipped");
        }
      }

      setCreatedEstimateId(parentEstimateId);
      setImportComplete(true);
      setImporting(false);
      showToast(`Addendum #${addendumNumber} imported!`);
      fetchRfps();
    } catch (err) {
      showToast("Addendum import failed: " + err.message);
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
            setFailedCloudLinks([]);
          }}
          onConfirm={importRfpData.type === "addendum" ? handleAddendumImport : handleImportConfirm}
          loading={importing}
          progressSteps={progressSteps}
          importComplete={importComplete}
          createdEstimateId={createdEstimateId}
          failedCloudLinks={failedCloudLinks}
          isAddendum={importRfpData.type === "addendum"}
          addendumNumber={importRfpData.addendum_number}
          parentProjectName={importRfpData.parsed_data?.parentProjectName || importRfpData.parsed_data?.projectName}
        />
      )}
    </div>
  );
}
