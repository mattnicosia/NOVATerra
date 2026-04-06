import { useState, useRef, useCallback, useEffect, lazy } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useNovaStore } from "@/stores/novaStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";
import { resolveLocationFactors, METRO_AREAS } from "@/constants/locationFactors";
import BuildingParametersSection from "@/components/planroom/BuildingParametersSection";
import BuildingSketch from "@/components/planroom/BuildingSketch";
import { runFullScan } from "@/utils/scanRunner";
import { saveEstimate } from "@/hooks/usePersistence";
import { handleFileUpload, autoLabelDrawings, autoDetectOutlines } from "@/utils/uploadPipeline";
import ScanResultsModal from "@/components/planroom/ScanResultsModal";
const DrawingOverlay = lazy(() => import("@/components/planroom/DrawingOverlay"));
import Modal from "@/components/shared/Modal";

// Extracted sub-components
import SetupModeView from "@/components/planroom/SetupModeView";
import NovaVisionCard from "@/components/planroom/NovaVisionCard";
import ProjectSummaryCard from "@/components/planroom/ProjectSummaryCard";
import NovaROMCard from "@/components/planroom/NovaROMCard";
import DrawingLightbox from "@/components/planroom/DrawingLightbox";
import SpecificationsCard from "@/components/planroom/SpecificationsCard";

// ═══════════════════════════════════════════════════════════════════════════════
// Discovery Page — Combined upload + findings dashboard
// ═══════════════════════════════════════════════════════════════════════════════
export default function PlanRoomPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const { id: estimateId } = useParams();
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const estId = activeEstimateId || estimateId;

  // Stores
  const project = useProjectStore(s => s.project);
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const drawingScales = useDrawingPipelineStore(s => s.drawingScales);
  const pdfCanvases = useDrawingPipelineStore(s => s.pdfCanvases);
  const specs = useDocumentManagementStore(s => s.specs);
  const items = useItemsStore(s => s.items);
  const scanResults = useDrawingPipelineStore(s => s.scanResults);
  const scanProgress = useDrawingPipelineStore(s => s.scanProgress);
  const documents = useDocumentManagementStore(s => s.documents);
  const outlines = useDrawingPipelineStore(s => s.outlines);
  const floorAssignments = useDrawingPipelineStore(s => s.floorAssignments);
  const novaHistory = useNovaStore(s => s.history);

  // Derived stats
  const labeledCount = drawings.filter(d => d.sheetNumber).length;
  const scaledCount = drawings.filter(d => drawingScales[d.id]).length;
  const outlineCount = Object.keys(outlines).length;
  const autoDetected = project.autoDetected || {};
  const floors = project.floors || [];
  const processingDocs = documents.filter(d => d.processingStatus === "processing");

  // Location factors
  const zip = project.zipCode;
  const locRaw = zip && zip.length >= 3 ? resolveLocationFactors(zip) : null;
  const manualMetro = project.locationMetroId ? METRO_AREAS.find(m => m.id === project.locationMetroId) : null;
  const activeLoc = manualMetro
    ? { mat: manualMetro.mat, lab: manualMetro.lab, equip: manualMetro.equip, label: manualMetro.label, source: "metro" }
    : locRaw;
  const composite = activeLoc && activeLoc.source !== "none" ? ((activeLoc.mat + activeLoc.lab + activeLoc.equip) / 3).toFixed(2) : null;
  const compositeNum = composite ? parseFloat(composite) : 1;
  const costLevel = compositeNum > 1.15 ? "High" : compositeNum > 1.02 ? "Above Avg" : compositeNum > 0.95 ? "Average" : compositeNum > 0.82 ? "Below Avg" : "Low";
  const costColor = compositeNum > 1.15 ? C.red : compositeNum > 1.02 ? C.orange : compositeNum > 0.95 ? C.green : compositeNum > 0.82 ? C.blue : C.green;

  // Document groups
  const drawingTypeDocs = documents.filter(d => d.docType === "drawing" || (d.drawingIds && d.drawingIds.length > 0) || !d.docType);
  const nonDrawingDocs = documents.filter(d => d.docType === "specification" || d.docType === "rfp");
  const failedDrawingDocs = drawingTypeDocs.filter(d => d.processingStatus === "error");
  const drawingsMissing = drawingTypeDocs.length > 0 && drawings.length === 0 && !scanResults && processingDocs.length === 0;
  const hasData = drawings.length > 0 || specs.length > 0 || floors.length > 0 || Object.entries(project.roomCounts || {}).filter(([, v]) => v > 0).length > 0 || scanResults || Object.keys(autoDetected).length > 0 || documents.length > 0;

  // Upload state
  const showToast = useUiStore(s => s.showToast);
  const removeDocument = useDocumentManagementStore(s => s.removeDocument);
  const clearScan = useDrawingPipelineStore(s => s.clearScan);
  const stopScan = useDrawingPipelineStore(s => s.stopScan);
  const scanError = useDrawingPipelineStore(s => s.scanError);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const addElement = useItemsStore(s => s.addElement);
  const addClarification = useDocumentManagementStore(s => s.addClarification);
  const [dragOver, setDragOver] = useState(false);
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showOverlay, setShowOverlay] = useState(null);
  const [previewDrawingId, setPreviewDrawingId] = useState(null);
  const fileInputRef = useRef(null);
  const isSetupMode = project.setupComplete === false;
  const hasProcessing = documents.some(d => d.processingStatus === "processing");

  // Stale processing recovery
  useEffect(() => {
    const interval = setInterval(() => {
      const docs = useDocumentManagementStore.getState().documents;
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      docs.forEach(d => {
        if (d.processingStatus === "processing" && d.uploadDate) {
          const uploadTime = new Date(d.uploadDate).getTime();
          if (uploadTime < fiveMinAgo) {
            const isDrawingDoc = d.docType === "drawing";
            useDocumentManagementStore.getState().updateDocument(d.id, {
              processingStatus: isDrawingDoc ? "error" : "complete",
              processingError: isDrawingDoc ? "Processing timed out" : null,
              processingMessage: d.processingMessage ? `${d.processingMessage} (timed out)` : "Processing timed out",
            });
          }
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-show scan results
  const scanResultsPending = useDrawingPipelineStore(s => s.scanResultsPending);
  useEffect(() => {
    if (scanResultsPending && scanResults && !showScanModal) {
      setShowScanModal(true);
      useDrawingPipelineStore.getState().setScanResultsPending(false);
    }
  }, [scanResultsPending, scanResults, showScanModal]);

  const handleUpload = useCallback(async files => {
    setUploadExpanded(false);
    await handleFileUpload(files, {
      showToast,
      onScanComplete: () => setShowScanModal(true),
      onBidInfoReady: () => {
        const eId = useEstimatesStore.getState().activeEstimateId;
        if (eId) navigate(`/estimate/${eId}/info`);
      },
    });
  }, [showToast, navigate]);

  const handleRescan = useCallback(async () => {
    if (rescanning) return;
    setRescanning(true);
    try {
      showToast(`Rescanning ${drawings.length} drawings...`);
      await autoLabelDrawings(drawings.map(d => d.id));
      await runFullScan({ onComplete: () => setRescanning(false), onError: () => setRescanning(false) });
      setRescanning(false);
      autoDetectOutlines().catch(() => {});
    } catch (err) {
      setRescanning(false);
      showToast(`Rescan failed: ${err.message}`, "error");
    }
  }, [rescanning, drawings, showToast]);

  const onDragOver = e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const onDragLeave = e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const onDrop = e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); const files = Array.from(e.dataTransfer.files); if (files.length > 0) handleUpload(files); };

  const handleApplyToEstimate = selectedItems => {
    if (!selectedItems || selectedItems.length === 0) return;
    let count = 0;
    selectedItems.forEach(li => {
      addElement(divFromCode(li.code), { code: li.code, name: li.description, unit: li.unit, material: li.m || 0, labor: li.l || 0, equipment: li.e || 0, quantity: li.qty || 1 });
      count++;
    });
    setShowScanModal(false);
    showToast(`Added ${count} items to estimate`);
    // NOVA learning feedback — show correction count if any
    try {
      const store = useNovaStore.getState();
      const corrCount = store.corrections?.length || 0;
      const patternCount = store.globalPatterns?.length || 0;
      if (corrCount > 0) {
        setTimeout(() => showToast(`NOVA learned from ${corrCount} corrections · ${patternCount} patterns tracked`), 800);
      }
    } catch { /* non-critical */ }
  };

  const handleApplyNotes = selectedNotes => {
    if (!selectedNotes || selectedNotes.length === 0) return;
    selectedNotes.forEach(note => addClarification(note.category ? `[${note.category}]` : "[scan-note]", note.text));
    showToast(`Added ${selectedNotes.length} note${selectedNotes.length > 1 ? "s" : ""} to clarifications`);
  };

  const handleResetAll = () => {
    useDrawingPipelineStore.getState().clearScan();
    useDrawingPipelineStore.getState().setDrawings([]);
    useDrawingPipelineStore.getState().setPdfCanvases({});
    useDrawingPipelineStore.getState().setDrawingScales({});
    useDrawingPipelineStore.getState().setDrawingDpi({});
    useDrawingPipelineStore.getState().setSelectedDrawingId(null);
    useDocumentManagementStore.getState().setDocuments([]);
    useDocumentManagementStore.getState().setSpecs([]);
    useDocumentManagementStore.getState().setExclusions([]);
    useDocumentManagementStore.getState().setClarifications([]);
    useDocumentManagementStore.getState().setSpecPdf(null);
    useDrawingPipelineStore.getState().reset();
    const proj = useProjectStore.getState().project;
    useProjectStore.getState().setProject({ ...proj, floorCount: "", basementCount: "", floors: [], roomCounts: {}, buildingFootprintSF: "", autoDetected: {}, parameterConfidence: {} });
    setShowResetConfirm(false);
    try { saveEstimate(); } catch { /* non-critical */ }
  };

  useEffect(() => {
    if (!previewDrawingId) return;
    const handler = e => {
      if (e.key === "Escape") setPreviewDrawingId(null);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { const idx = drawings.findIndex(d => d.id === previewDrawingId); if (idx < drawings.length - 1) setPreviewDrawingId(drawings[idx + 1].id); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { const idx = drawings.findIndex(d => d.id === previewDrawingId); if (idx > 0) setPreviewDrawingId(drawings[idx - 1].id); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [previewDrawingId, drawings]);

  // ═══════════════════════════════════════════════════════════════════════
  // SETUP MODE
  // ═══════════════════════════════════════════════════════════════════════
  if (isSetupMode) {
    return <SetupModeView C={C} T={T} estId={estId} hasProcessing={hasProcessing} scanProgress={scanProgress} handleUpload={handleUpload} stopScan={stopScan} />;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NORMAL MODE
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: T.space[7], minHeight: "100%" }}>
      <div style={{ maxWidth: 1000 }}>
        {/* Header */}
        <div style={{ marginBottom: T.space[5], display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: T.fontSize.xl, fontWeight: T.fontWeight.bold, color: C.text, margin: 0, display: "flex", alignItems: "center", gap: T.space[3], fontFamily: T.font.sans }}>
              <Ic d={I.plans} size={22} color={C.accent} />
              Discovery
              {documents.length > 0 && <span style={{ fontSize: T.fontSize.xs, color: C.textDim, padding: "2px 8px", borderRadius: T.radius.full, background: C.bg2, fontWeight: T.fontWeight.medium }}>{documents.length} file{documents.length !== 1 ? "s" : ""}</span>}
              {drawings.length > 0 && (
                <button onClick={handleRescan} disabled={rescanning || scanProgress.phase} style={bt(C, { fontSize: 10, fontWeight: 600, padding: "4px 12px", borderRadius: T.radius.sm, color: rescanning || scanProgress.phase ? C.textDim : C.accent, background: rescanning || scanProgress.phase ? `${C.textDim}08` : `${C.accent}08`, border: `1px solid ${rescanning || scanProgress.phase ? C.textDim + "20" : C.accent + "20"}`, cursor: rescanning || scanProgress.phase ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4, marginLeft: 4 })}>
                  {rescanning || scanProgress.phase ? (<><span style={{ display: "inline-block", width: 10, height: 10, border: `2px solid ${C.textDim}40`, borderTop: `2px solid ${C.textDim}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Scanning…</>) : (<><Ic d={I.refresh} size={11} color={C.accent} />Discover</>)}
                </button>
              )}
            </h1>
            <p style={{ fontSize: T.fontSize.xs, color: C.textDim, margin: `${T.space[1]}px 0 0`, fontFamily: T.font.sans }}>Upload documents and view NOVA's analysis — schedules, parameters, and ROM estimate.</p>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {hasData && <button onClick={() => setShowResetConfirm(true)} style={bt(C, { fontSize: 10, padding: "5px 12px", borderRadius: T.radius.sm, color: C.red || "#ef4444", background: `${C.red || "#ef4444"}08`, border: `1px solid ${C.red || "#ef4444"}20` })}><Ic d={I.trash} size={11} color={C.red || "#ef4444"} /> Reset All</button>}
          </div>
        </div>

        {/* Scan progress */}
        {scanProgress.phase && (
          <div style={{ marginBottom: T.space[4], padding: `${T.space[3]}px ${T.space[4]}px`, background: `${C.purple || C.accent}06`, borderRadius: T.radius.md, border: `1px solid ${C.purple || C.accent}20` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[2] }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.purple || C.accent, display: "flex", alignItems: "center", gap: 6 }}><Ic d={I.ai} size={14} color={C.accent} /> {scanProgress.message}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: C.textDim }}>{scanProgress.phase === "detect" ? "Phase 1/4" : scanProgress.phase === "notes" ? "Phase 2/4" : scanProgress.phase === "parse" ? "Phase 3/4" : "Phase 4/4"}</span>
                <button onClick={() => { stopScan(); setRescanning(false); }} style={{ background: "transparent", border: `1px solid ${C.red || "#ef4444"}30`, color: C.red || "#ef4444", fontSize: 9, fontWeight: 600, padding: "3px 10px", borderRadius: 5, cursor: "pointer", fontFamily: T.font.sans }}>Stop</button>
              </div>
            </div>
            <div style={{ height: 4, background: C.bg2, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", background: `linear-gradient(90deg, ${C.purple || C.accent}, ${C.accent})`, borderRadius: 2, transition: "width 0.3s ease", width: scanProgress.total > 0 ? `${Math.round((scanProgress.current / scanProgress.total) * 100)}%` : "0%" }} />
            </div>
          </div>
        )}

        {/* Scan error */}
        {scanError && (
          <div style={{ marginBottom: T.space[4], padding: `${T.space[3]}px ${T.space[4]}px`, background: `${C.red}06`, borderRadius: T.radius.md, border: `1px solid ${C.red}20`, fontSize: 11, color: C.red }}>
            <strong>Scan Error:</strong> {scanError}
            <button onClick={clearScan} style={{ marginLeft: 8, background: "transparent", border: "none", color: C.red, textDecoration: "underline", cursor: "pointer", fontSize: 10 }}>Dismiss</button>
          </div>
        )}

        {/* Documents link */}
        {documents.length > 0 && <div style={{ marginBottom: T.space[4] }}><button onClick={() => navigate(`/estimate/${estId}/documents`)} style={bt(C)}><Ic d={I.folder} size={14} color={C.accent} /><span style={{ marginLeft: 6, fontSize: 11 }}>Manage Documents ({documents.length} files)</span></button></div>}

        {/* Reset confirmation */}
        {showResetConfirm && (
          <div style={{ marginBottom: T.space[4], padding: `${T.space[3]}px ${T.space[4]}px`, background: `${C.red || "#ef4444"}06`, borderRadius: T.radius.md, border: `1px solid ${C.red || "#ef4444"}30`, display: "flex", alignItems: "center", gap: T.space[3] }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Reset all Discovery data?</div><div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>This will clear all drawings, specs, scan results, terrain parameters, and model data. Project info will be preserved.</div></div>
            <button onClick={() => setShowResetConfirm(false)} style={bt(C, { fontSize: 10, padding: "5px 14px", background: "transparent", border: `1px solid ${C.border}`, color: C.textMuted })}>Cancel</button>
            <button onClick={handleResetAll} style={bt(C, { fontSize: 10, padding: "5px 14px", fontWeight: 600, background: C.red || "#ef4444", color: "#fff" })}>Reset</button>
          </div>
        )}

        {/* Processing banner */}
        {processingDocs.length > 0 && (
          <div style={{ marginBottom: T.space[4], padding: `${T.space[3]}px ${T.space[4]}px`, background: `${C.accent}06`, borderRadius: T.radius.md, border: `1px solid ${C.accent}20`, display: "flex", alignItems: "center", gap: T.space[2] }}>
            <span style={{ display: "inline-block", width: 10, height: 10, border: `2px solid ${C.accent}40`, borderTop: `2px solid ${C.accent}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>NOVA is processing {processingDocs.length} document{processingDocs.length > 1 ? "s" : ""}...</span>
            <span style={{ fontSize: 10, color: C.textDim, marginLeft: "auto" }}>Results will appear here automatically</span>
          </div>
        )}

        {!hasData && documents.length === 0 && !uploadExpanded && <div style={{ textAlign: "center", padding: `${T.space[7]}px 0`, color: C.textDim, fontSize: 12 }}>Drop files above to get started</div>}

        {/* Missing Drawings Recovery */}
        {drawingsMissing && !scanProgress.phase && !rescanning && (
          <div style={{ ...card(C), padding: `${T.space[5]}px`, marginBottom: T.space[4], textAlign: "center", border: `1px solid ${failedDrawingDocs.length > 0 ? C.red : C.accent}20` }}>
            <div style={{ width: 48, height: 48, borderRadius: T.radius.md, background: `${failedDrawingDocs.length > 0 ? C.red : C.accent}12`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", marginBottom: T.space[3] }}><Ic d={I.plans} size={22} color={failedDrawingDocs.length > 0 ? C.red : C.accent} /></div>
            <div style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.semibold, color: C.text, marginBottom: T.space[2] }}>{failedDrawingDocs.length > 0 ? "Drawing extraction failed" : "Re-upload plans to start Discovery"}</div>
            <div style={{ fontSize: T.fontSize.xs, color: C.textDim, maxWidth: 420, margin: "0 auto", lineHeight: 1.6, marginBottom: T.space[4] }}>
              {failedDrawingDocs.length > 0 ? <>{failedDrawingDocs.length} file{failedDrawingDocs.length > 1 ? "s" : ""} could not be processed{failedDrawingDocs[0].processingError ? ` — ${failedDrawingDocs[0].processingError}` : ""}. Try re-uploading.</> : "Your previous upload record is here but the extracted pages were lost. Drop your PDF plans below to re-extract and scan automatically."}
            </div>
            <div style={{ display: "flex", gap: T.space[3], justifyContent: "center" }}>
              <button onClick={() => { useDocumentManagementStore.getState().documents.filter(d => d.docType === "drawing").forEach(d => removeDocument(d.id)); setUploadExpanded(true); setTimeout(() => fileInputRef.current?.click(), 50); }} style={{ ...bt(C), padding: "8px 20px", fontSize: T.fontSize.xs, fontWeight: 600, color: "#fff", background: C.accent, borderRadius: T.radius.sm, cursor: "pointer" }}><Ic d={I.upload} size={13} color="#fff" /> Re-upload Plans</button>
            </div>
          </div>
        )}

        {/* No Drawing Plans prompt */}
        {!drawingsMissing && nonDrawingDocs.length > 0 && drawingTypeDocs.length === 0 && drawings.length === 0 && !scanResults && !scanProgress.phase && (
          <div style={{ ...card(C), padding: `${T.space[4]}px ${T.space[5]}px`, marginBottom: T.space[4], display: "flex", alignItems: "center", gap: T.space[3], border: `1px solid ${C.accent}15` }}>
            <Ic d={I.plans} size={18} color={C.accent} />
            <div style={{ flex: 1 }}><div style={{ fontSize: T.fontSize.xs, fontWeight: T.fontWeight.semibold, color: C.text }}>Upload drawing plans to run NOVA Discovery</div><div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>Specs and bid documents are loaded. Add your PDF drawing plans to detect schedules and generate a ROM.</div></div>
            <button onClick={() => { setUploadExpanded(true); setTimeout(() => fileInputRef.current?.click(), 50); }} style={{ ...bt(C), padding: "6px 14px", fontSize: T.fontSize.xs, fontWeight: 600, color: C.accent, background: `${C.accent}08`, border: `1px solid ${C.accent}20`, borderRadius: T.radius.sm, cursor: "pointer", flexShrink: 0 }}>Add Plans</button>
          </div>
        )}

        {hasData && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[4] }}>
            {(drawings.length > 0 || specs.length > 0 || documents.length > 0) && (
              <NovaVisionCard C={C} T={T} estId={estId} drawings={drawings} specs={specs} documents={documents} labeledCount={labeledCount} scaledCount={scaledCount} autoDetected={autoDetected} scanResults={scanResults} scanProgress={scanProgress} outlineCount={outlineCount} rescanning={rescanning} setRescanning={setRescanning} setShowScanModal={setShowScanModal} stopScan={stopScan} />
            )}
            {(outlineCount > 0 || project.buildingFootprintSF || parseInt(project.floorCount) > 0 || floors.length > 0 || project.projectSF) && (
              <div style={{ ...card(C), padding: T.space[5], gridColumn: "1 / -1", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
                <BuildingSketch outlines={outlines} floorAssignments={floorAssignments} floors={floors} project={project} C={C} T={T} />
              </div>
            )}
            <ProjectSummaryCard C={C} T={T} project={project} drawings={drawings} specs={specs} items={items} documents={documents} activeLoc={activeLoc} autoDetected={autoDetected} floors={floors} costColor={costColor} costLevel={costLevel} composite={composite} />
            <NovaROMCard C={C} T={T} scanResults={scanResults} />
            <DrawingLightbox C={C} T={T} drawings={drawings} drawingScales={drawingScales} pdfCanvases={pdfCanvases} previewDrawingId={previewDrawingId} setPreviewDrawingId={setPreviewDrawingId} />
            <SpecificationsCard C={C} T={T} specs={specs} items={items} />
            <div style={{ gridColumn: "1 / -1" }}><BuildingParametersSection /></div>
            {novaHistory.length > 0 && (
              <div style={{ ...card(C), padding: T.space[5], gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[3] }}><Ic d={I.ai} size={16} color={C.textMuted} /><span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.textMuted }}>NOVA Activity Log</span></div>
                <div style={{ maxHeight: 160, overflowY: "auto" }}>
                  {[...novaHistory].reverse().slice(0, 10).map((h, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: T.space[2], padding: "3px 0", borderBottom: `1px solid ${C.border}06`, fontSize: 10 }}>
                      <Ic d={I.check} size={10} color={C.green} />
                      <span style={{ color: C.textDim, fontFamily: T.font.sans, fontSize: 9, minWidth: 60 }}>{new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      <span style={{ color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.result || h.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {estId && hasData && (
          <div style={{ marginTop: T.space[5], ...card(C), padding: T.space[5] }}>
            <div style={{ fontSize: T.fontSize.xs, fontWeight: T.fontWeight.bold, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: T.space[3] }}>Next Steps</div>
            <div style={{ display: "flex", gap: T.space[3], flexWrap: "wrap" }}>
              <button onClick={() => navigate(`/estimate/${estId}/takeoffs`)} style={bt(C, { background: C.accent, color: "#fff", padding: "10px 20px", fontSize: 12, fontWeight: 600, flex: 1, minWidth: 180 })}><Ic d={I.edit} size={15} color="#fff" sw={2} /> Build Estimate<span style={{ display: "block", fontSize: 9, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>Add line items and pricing</span></button>
            </div>
          </div>
        )}

        {scanResults && !scanProgress.phase && !showScanModal && (
          <div style={{ marginTop: T.space[4], ...card(C), padding: `${T.space[3]}px ${T.space[4]}px`, border: `1px solid ${C.purple || C.accent}20` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.purple || C.accent, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}><Ic d={I.ai} size={14} color={C.purple || C.accent} /> NOVA Scan Complete</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{scanResults.schedules?.length || 0} schedule{scanResults.schedules?.length !== 1 ? "s" : ""}{" · "}{scanResults.lineItems?.length || 0} line items{scanResults.rom?.totals ? ` · ROM: $${Math.round(scanResults.rom.totals.low).toLocaleString()} – $${Math.round(scanResults.rom.totals.high).toLocaleString()}` : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {drawings.length >= 2 && <button onClick={() => { const v = drawings.find(d => d.supersedes); if (v) { const o = drawings.find(d => d.id === v.supersedes); if (o) { setShowOverlay({ drawingA: o, drawingB: v }); return; } } setShowOverlay({ drawingA: drawings[0], drawingB: drawings[1] }); }} style={bt(C, { background: "transparent", border: `1px solid ${C.accent}40`, color: C.accent, padding: "6px 12px", fontSize: 10, fontWeight: 600 })}><Ic d={I.layers || I.compare} size={10} color={C.accent} /> Compare</button>}
                <button onClick={() => setShowScanModal(true)} style={bt(C, { background: C.purple || C.accent, color: "#fff", padding: "6px 14px", fontSize: 10, fontWeight: 600 })}>View Results</button>
                <button onClick={clearScan} style={bt(C, { background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, padding: "6px 10px", fontSize: 10 })}>Clear</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showScanModal && scanResults && <ScanResultsModal scanResults={scanResults} onClose={() => setShowScanModal(false)} onApplyToEstimate={handleApplyToEstimate} onApplyNotes={handleApplyNotes} onSaveOnly={() => { setShowScanModal(false); showToast("Scan results saved"); }} />}
      {showOverlay && <Modal extraWide onClose={() => setShowOverlay(null)}><div style={{ height: 600 }}><DrawingOverlay drawingA={showOverlay.drawingA} drawingB={showOverlay.drawingB} drawings={drawings} onClose={() => setShowOverlay(null)} /></div></Modal>}
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx,.ifc,.dwg,.dxf,image/*" style={{ display: "none" }} onChange={e => { handleUpload(Array.from(e.target.files || [])); e.target.value = ""; }} />
    </div>
  );
}
