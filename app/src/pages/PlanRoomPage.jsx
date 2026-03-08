import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useScanStore } from "@/stores/scanStore";
import { useDocumentsStore } from "@/stores/documentsStore";
import { useModelStore } from "@/stores/modelStore";
import { useNovaStore } from "@/stores/novaStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";
import { getScaleLabel } from "@/utils/drawingUtils";
import { resolveLocationFactors, METRO_AREAS } from "@/constants/locationFactors";
import BuildingParametersSection from "@/components/planroom/BuildingParametersSection";
import BuildingSketch from "@/components/planroom/BuildingSketch";
import { getBuildingTypeLabel, getWorkTypeLabel } from "@/constants/constructionTypes";
import { runFullScan } from "@/utils/scanRunner";
import { saveEstimate } from "@/hooks/usePersistence";
import { handleFileUpload, autoLabelDrawings, autoDetectOutlines } from "@/utils/uploadPipeline";
import ScanResultsModal from "@/components/planroom/ScanResultsModal";
import NovaOrb from "@/components/dashboard/NovaOrb";
import EmptyState from "@/components/shared/EmptyState";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// ═══════════════════════════════════════════════════════════════════════════════
// Discovery Page — Combined upload + findings dashboard
// Upload zone at top (collapses when files exist), then project summary,
// drawing index, spec summary, terrain, ROM, and analysis pipeline status.
// ═══════════════════════════════════════════════════════════════════════════════
export default function PlanRoomPage() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const { id: estimateId } = useParams();
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const estId = activeEstimateId || estimateId;

  // Stores (read-only)
  const project = useProjectStore(s => s.project);
  const drawings = useDrawingsStore(s => s.drawings);
  const drawingScales = useDrawingsStore(s => s.drawingScales);
  const pdfCanvases = useDrawingsStore(s => s.pdfCanvases);
  const specs = useSpecsStore(s => s.specs);
  const items = useItemsStore(s => s.items);
  const scanResults = useScanStore(s => s.scanResults);
  const scanProgress = useScanStore(s => s.scanProgress);
  const documents = useDocumentsStore(s => s.documents);
  const outlines = useModelStore(s => s.outlines);
  const floorAssignments = useModelStore(s => s.floorAssignments);
  const novaHistory = useNovaStore(s => s.history);

  // Drawing stats
  const labeledCount = drawings.filter(d => d.sheetNumber).length;
  const scaledCount = drawings.filter(d => drawingScales[d.id]).length;
  const outlineCount = Object.keys(outlines).length;

  // Drawing discipline breakdown
  const disciplines = {};
  drawings.forEach(d => {
    const num = d.sheetNumber || "";
    const prefix = num.match(/^([A-Z])/i)?.[1]?.toUpperCase() || "?";
    const labels = {
      A: "Architectural",
      S: "Structural",
      M: "Mechanical",
      E: "Electrical",
      P: "Plumbing",
      L: "Landscape",
      C: "Civil",
      G: "General",
    };
    const name = labels[prefix] || "Other";
    disciplines[name] = (disciplines[name] || 0) + 1;
  });

  // Spec stats
  const allocatedSpecs = specs.filter(sp => items.some(i => i.specSection === sp.section));

  // Auto-detected fields tracking
  const autoDetected = project.autoDetected || {};

  // Room counts
  const roomCounts = project.roomCounts || {};
  const filledRooms = Object.entries(roomCounts).filter(([, v]) => v > 0);

  // Floor data
  const floors = project.floors || [];

  // Location factors (for inline geography in Project Summary)
  const zip = project.zipCode;
  const locRaw = zip && zip.length >= 3 ? resolveLocationFactors(zip) : null;
  const hasMetro = locRaw && locRaw.source !== "none";
  const manualMetro = project.locationMetroId ? METRO_AREAS.find(m => m.id === project.locationMetroId) : null;
  const activeLoc = manualMetro
    ? {
        mat: manualMetro.mat,
        lab: manualMetro.lab,
        equip: manualMetro.equip,
        label: manualMetro.label,
        source: "metro",
      }
    : locRaw;
  const composite =
    activeLoc && activeLoc.source !== "none"
      ? ((activeLoc.mat + activeLoc.lab + activeLoc.equip) / 3).toFixed(2)
      : null;
  const compositeNum = composite ? parseFloat(composite) : 1;
  const costLevel =
    compositeNum > 1.15
      ? "High"
      : compositeNum > 1.02
        ? "Above Avg"
        : compositeNum > 0.95
          ? "Average"
          : compositeNum > 0.82
            ? "Below Avg"
            : "Low";
  const costColor =
    compositeNum > 1.15
      ? C.red
      : compositeNum > 1.02
        ? C.orange
        : compositeNum > 0.95
          ? C.green
          : compositeNum > 0.82
            ? C.blue
            : C.green;

  // Processing documents
  const processingDocs = documents.filter(d => d.processingStatus === "processing");

  const hasData =
    drawings.length > 0 ||
    specs.length > 0 ||
    floors.length > 0 ||
    filledRooms.length > 0 ||
    scanResults ||
    Object.keys(autoDetected).length > 0 ||
    documents.length > 0;

  // Detect stale state: drawing-type documents exist but drawing pages are missing
  // Only consider drawing-type docs (not specs/RFPs/general) to avoid false "re-upload" prompts
  const drawingTypeDocs = documents.filter(d => d.docType === "drawing");
  const failedDrawingDocs = drawingTypeDocs.filter(d => d.processingStatus === "error");
  const drawingsMissing = drawingTypeDocs.length > 0 && drawings.length === 0 && !scanResults && processingDocs.length === 0;

  // Upload state
  const showToast = useUiStore(s => s.showToast);
  const removeDocument = useDocumentsStore(s => s.removeDocument);
  const clearScan = useScanStore(s => s.clearScan);
  const stopScan = useScanStore(s => s.stopScan);
  const scanError = useScanStore(s => s.scanError);
  const divFromCode = useProjectStore(s => s.divFromCode);
  const addElement = useItemsStore(s => s.addElement);
  const addClarification = useSpecsStore(s => s.addClarification);
  const [dragOver, setDragOver] = useState(false);
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const fileInputRef = useRef(null);
  const isSetupMode = project.setupComplete === false;
  const hasProcessing = documents.some(d => d.processingStatus === "processing");

  // Stale processing recovery — mark documents stuck in "processing" for >5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      const docs = useDocumentsStore.getState().documents;
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      docs.forEach(d => {
        if (d.processingStatus === "processing" && d.uploadDate) {
          const uploadTime = new Date(d.uploadDate).getTime();
          if (uploadTime < fiveMinAgo) {
            // Drawing docs that timed out = extraction failed, mark as error
            // Non-drawing docs = probably completed but status wasn't updated
            const isDrawingDoc = d.docType === "drawing";
            useDocumentsStore.getState().updateDocument(d.id, {
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

  // Auto-show scan results if user returns to PlanRoom with pending results
  const scanResultsPending = useScanStore(s => s.scanResultsPending);
  useEffect(() => {
    if (scanResultsPending && scanResults && !showScanModal) {
      setShowScanModal(true);
      useScanStore.getState().setScanResultsPending(false);
    }
  }, [scanResultsPending, scanResults, showScanModal]);

  // Auto-scan recovery is handled globally by useAutoDiscovery() in App.jsx.
  // It triggers runFullScan() when drawings exist without results, on any page.
  // When it completes, scanResultsPending=true causes the modal to auto-open above.

  // Upload handler
  const handleUpload = useCallback(
    async files => {
      setUploadExpanded(false);
      await handleFileUpload(files, {
        showToast,
        onScanComplete: () => setShowScanModal(true),
        onBidInfoReady: () => {
          // Auto-advance to Project Info when bid info is extracted
          const estId = useEstimatesStore.getState().activeEstimateId;
          if (estId) navigate(`/estimate/${estId}/info`);
        },
      });
    },
    [showToast, navigate],
  );

  // Rescan handler
  const handleRescan = useCallback(async () => {
    if (rescanning) return;
    setRescanning(true);
    try {
      const allDrawingIds = drawings.map(d => d.id);
      showToast(`Rescanning ${drawings.length} drawings...`);
      await autoLabelDrawings(allDrawingIds);
      await runFullScan({
        onComplete: () => setRescanning(false),
        onError: () => setRescanning(false),
      });
      setRescanning(false);
      autoDetectOutlines().catch(() => {});
    } catch (err) {
      setRescanning(false);
      showToast(`Rescan failed: ${err.message}`, "error");
    }
  }, [rescanning, drawings, showToast]);

  // Drag & drop handlers
  const onDragOver = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };
  const onDrop = e => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUpload(files);
  };

  // Scan result handlers
  const handleApplyToEstimate = selectedItems => {
    if (!selectedItems || selectedItems.length === 0) return;
    let count = 0;
    selectedItems.forEach(li => {
      const division = divFromCode(li.code);
      addElement(division, {
        code: li.code,
        name: li.description,
        unit: li.unit,
        material: li.m || 0,
        labor: li.l || 0,
        equipment: li.e || 0,
        quantity: li.qty || 1,
      });
      count++;
    });
    setShowScanModal(false);
    showToast(`Added ${count} items to estimate`);
  };

  const handleApplyNotes = selectedNotes => {
    if (!selectedNotes || selectedNotes.length === 0) return;
    selectedNotes.forEach(note => addClarification(note.category ? `[${note.category}]` : "[scan-note]", note.text));
    showToast(`Added ${selectedNotes.length} note${selectedNotes.length > 1 ? "s" : ""} to clarifications`);
  };

  // Document groups (drawingTypeDocs already computed above for drawingsMissing check)
  const drawingDocs = drawingTypeDocs;
  const specDocs = documents.filter(d => d.docType === "specification");
  const generalDocs = documents.filter(d => d.docType === "general" || (!d.docType && d.source !== "rfp"));
  const handleResetAll = () => {
    // Clear scan results
    useScanStore.getState().clearScan();

    // Clear drawings + related caches
    useDrawingsStore.getState().setDrawings([]);
    useDrawingsStore.getState().setPdfCanvases({});
    useDrawingsStore.getState().setDrawingScales({});
    useDrawingsStore.getState().setDrawingDpi({});
    useDrawingsStore.getState().setSelectedDrawingId(null);

    // Clear documents
    useDocumentsStore.getState().setDocuments([]);

    // Clear specs
    useSpecsStore.getState().setSpecs([]);
    useSpecsStore.getState().setExclusions([]);
    useSpecsStore.getState().setClarifications([]);
    useSpecsStore.getState().setSpecPdf(null);

    // Clear model/outline data
    useModelStore.getState().reset();

    // Reset building parameters + auto-detected flags (preserve project identity)
    const proj = useProjectStore.getState().project;
    useProjectStore.getState().setProject({
      ...proj,
      floorCount: "",
      basementCount: "",
      floors: [],
      roomCounts: {},
      buildingFootprintSF: "",
      autoDetected: {},
      parameterConfidence: {},
    });

    setShowResetConfirm(false);

    // Persist the cleared state
    try {
      saveEstimate();
    } catch {
      /* non-critical */
    }
  };

  // Drawing index expansion toggle
  const [drawingsExpanded, setDrawingsExpanded] = useState(false);
  const [specsExpanded, setSpecsExpanded] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════
  // SETUP MODE: First-time focused upload experience for new estimates
  // ═══════════════════════════════════════════════════════════════════════
  if (isSetupMode) {
    const isProcessing = hasProcessing || scanProgress.phase;
    const handleSkip = () => {
      useProjectStore.getState().setProject({ ...useProjectStore.getState().project, setupComplete: true });
      if (estId) navigate(`/estimate/${estId}/info`);
    };

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100%",
          padding: T.space[7],
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <div style={{ marginBottom: 24, display: "flex", justifyContent: "center" }}>
            <NovaOrb size={48} scheme="nova" />
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: C.text,
              margin: 0,
              marginBottom: 6,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Upload Your Construction Plans
          </h1>
          <p style={{ fontSize: 12, color: C.textDim, margin: 0, marginBottom: 28, lineHeight: 1.6 }}>
            Drop your PDF plans below and NOVA will automatically extract project details, detect schedules, and
            generate a rough order of magnitude estimate.
          </p>
          {isProcessing ? (
            <div
              style={{
                ...card(C),
                padding: "24px 28px",
                marginBottom: 20,
                textAlign: "left",
                border: `1px solid ${C.accent}20`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <NovaOrb size={22} scheme="nova" />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>NOVA is analyzing your drawings...</div>
              </div>
              {scanProgress.phase && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>
                    {scanProgress.message}
                    <span style={{ float: "right" }}>
                      {scanProgress.phase === "detect"
                        ? "Phase 1/4"
                        : scanProgress.phase === "notes"
                          ? "Phase 2/4"
                          : scanProgress.phase === "parse"
                            ? "Phase 3/4"
                            : "Phase 4/4"}
                    </span>
                  </div>
                  <div style={{ height: 4, background: C.bg2, borderRadius: 2, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        borderRadius: 2,
                        transition: "width 0.3s ease",
                        background: `linear-gradient(90deg, ${C.accent}, ${C.purple || C.accent})`,
                        width:
                          scanProgress.total > 0
                            ? `${Math.round((scanProgress.current / scanProgress.total) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              )}
              {!scanProgress.phase && hasProcessing && (
                <div style={{ fontSize: 10, color: C.textDim }}>Processing uploaded documents...</div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <div style={{ fontSize: 9, color: C.textDim }}>
                  This may take a minute depending on the number of sheets. Project info will be auto-filled from your
                  title blocks.
                </div>
                <button
                  onClick={() => {
                    stopScan();
                    setRescanning(false);
                  }}
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.red || "#ef4444"}30`,
                    color: C.red || "#ef4444",
                    fontSize: 9,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    flexShrink: 0,
                    marginLeft: 12,
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = `${C.red || "#ef4444"}10`;
                    e.currentTarget.style.borderColor = `${C.red || "#ef4444"}50`;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = `${C.red || "#ef4444"}30`;
                  }}
                >
                  Stop
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                ...card(C),
                padding: "40px 24px",
                textAlign: "center",
                cursor: "pointer",
                border: dragOver ? `2px dashed ${C.accent}` : `2px dashed ${C.border}`,
                background: dragOver ? `${C.accent}08` : C.glassBg,
                transition: "all 0.2s ease",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: T.radius.lg,
                  background: `${C.accent}12`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto",
                  marginBottom: 14,
                }}
              >
                <Ic d={I.upload} size={26} color={C.accent} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {dragOver ? "Drop files here" : "Drop PDF plans here or click to browse"}
              </div>
              <div style={{ fontSize: 10, color: C.textDim }}>
                PDF drawings, specifications, addenda — any project document
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx,image/*"
                style={{ display: "none" }}
                onChange={e => {
                  handleUpload(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
              />
            </div>
          )}
          {!isProcessing && (
            <button
              onClick={handleSkip}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                color: C.textDim,
                padding: "8px 16px",
                fontFamily: "'DM Sans', sans-serif",
                transition: "color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)}
              onMouseLeave={e => (e.currentTarget.style.color = C.textDim)}
            >
              Skip — I don't have plans yet →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NORMAL MODE: Combined upload zone + Discovery content
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: T.space[7], minHeight: "100%" }}>
      <div style={{ maxWidth: 1000 }}>
        {/* Header */}
        <div
          style={{
            marginBottom: T.space[5],
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: T.fontSize.xl,
                fontWeight: T.fontWeight.bold,
                color: C.text,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: T.space[3],
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <Ic d={I.plans} size={22} color={C.accent} />
              Discovery
              {documents.length > 0 && (
                <span
                  style={{
                    fontSize: T.fontSize.xs,
                    color: C.textDim,
                    padding: "2px 8px",
                    borderRadius: T.radius.full,
                    background: C.bg2,
                    fontWeight: T.fontWeight.medium,
                  }}
                >
                  {documents.length} file{documents.length !== 1 ? "s" : ""}
                </span>
              )}
            </h1>
            <p
              style={{
                fontSize: T.fontSize.xs,
                color: C.textDim,
                margin: `${T.space[1]}px 0 0`,
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              Upload documents and view NOVA's analysis — schedules, parameters, and ROM estimate.
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {hasData && (
              <button
                onClick={() => setShowResetConfirm(true)}
                style={bt(C, {
                  fontSize: 10,
                  padding: "5px 12px",
                  borderRadius: T.radius.sm,
                  color: C.red || "#ef4444",
                  background: `${C.red || "#ef4444"}08`,
                  border: `1px solid ${C.red || "#ef4444"}20`,
                })}
              >
                <Ic d={I.trash} size={11} color={C.red || "#ef4444"} /> Reset All
              </button>
            )}
          </div>
        </div>

        {/* ─── Collapsible Upload Zone ─── */}
        {documents.length === 0 || uploadExpanded ? (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              ...card(C),
              padding: documents.length === 0 ? T.space[6] : T.space[4],
              textAlign: "center",
              cursor: "pointer",
              border: dragOver ? `2px dashed ${C.accent}` : `2px dashed ${C.border}`,
              background: dragOver ? `${C.accent}08` : C.glassBg,
              transition: "all 0.2s ease",
              marginBottom: T.space[4],
            }}
          >
            {documents.length === 0 ? (
              <>
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: T.radius.md,
                    background: `${C.accent}12`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto",
                    marginBottom: T.space[3],
                  }}
                >
                  <Ic d={I.upload} size={22} color={C.accent} />
                </div>
                <div
                  style={{
                    fontSize: T.fontSize.sm,
                    fontWeight: T.fontWeight.semibold,
                    color: C.text,
                    marginBottom: T.space[1],
                  }}
                >
                  {dragOver ? "Drop files here" : "Drop files here or click to browse"}
                </div>
                <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
                  PDF drawings, specifications, addenda, or any project document
                </div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <Ic d={I.upload} size={16} color={C.accent} />
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                  {dragOver ? "Drop files here" : "Drop more files or click to browse"}
                </span>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setUploadExpanded(false);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 6px",
                    color: C.textDim,
                    fontSize: 10,
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx,image/*"
              style={{ display: "none" }}
              onChange={e => {
                handleUpload(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <button
            onClick={() => setUploadExpanded(true)}
            style={bt(C, {
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 500,
              color: C.accent,
              padding: "6px 14px",
              marginBottom: T.space[4],
              background: `${C.accent}06`,
              border: `1px solid ${C.accent}20`,
              borderRadius: T.radius.sm,
              cursor: "pointer",
              transition: "all 0.15s ease",
            })}
            onMouseEnter={e => {
              e.currentTarget.style.background = `${C.accent}12`;
              e.currentTarget.style.borderColor = `${C.accent}40`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = `${C.accent}06`;
              e.currentTarget.style.borderColor = `${C.accent}20`;
            }}
          >
            <Ic d={I.upload} size={13} color={C.accent} /> Add More Documents
          </button>
        )}

        {/* Scan progress */}
        {scanProgress.phase && (
          <div
            style={{
              marginBottom: T.space[4],
              padding: `${T.space[3]}px ${T.space[4]}px`,
              background: `${C.purple || C.accent}06`,
              borderRadius: T.radius.md,
              border: `1px solid ${C.purple || C.accent}20`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: T.space[2],
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.purple || C.accent,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <NovaOrb size={18} scheme="nova" />
                {scanProgress.message}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: C.textDim }}>
                  {scanProgress.phase === "detect"
                    ? "Phase 1/4"
                    : scanProgress.phase === "notes"
                      ? "Phase 2/4"
                      : scanProgress.phase === "parse"
                        ? "Phase 3/4"
                        : "Phase 4/4"}
                </span>
                <button
                  onClick={() => {
                    stopScan();
                    setRescanning(false);
                  }}
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.red || "#ef4444"}30`,
                    color: C.red || "#ef4444",
                    fontSize: 9,
                    fontWeight: 600,
                    padding: "3px 10px",
                    borderRadius: 5,
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = `${C.red || "#ef4444"}10`;
                    e.currentTarget.style.borderColor = `${C.red || "#ef4444"}50`;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = `${C.red || "#ef4444"}30`;
                  }}
                >
                  Stop
                </button>
              </div>
            </div>
            <div style={{ height: 4, background: C.bg2, borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  background: `linear-gradient(90deg, ${C.purple || C.accent}, ${C.accent})`,
                  borderRadius: 2,
                  transition: "width 0.3s ease",
                  width:
                    scanProgress.total > 0 ? `${Math.round((scanProgress.current / scanProgress.total) * 100)}%` : "0%",
                }}
              />
            </div>
          </div>
        )}

        {/* Scan error */}
        {scanError && (
          <div
            style={{
              marginBottom: T.space[4],
              padding: `${T.space[3]}px ${T.space[4]}px`,
              background: `${C.red}06`,
              borderRadius: T.radius.md,
              border: `1px solid ${C.red}20`,
              fontSize: 11,
              color: C.red,
            }}
          >
            <strong>Scan Error:</strong> {scanError}
            <button
              onClick={clearScan}
              style={{
                marginLeft: 8,
                background: "transparent",
                border: "none",
                color: C.red,
                textDecoration: "underline",
                cursor: "pointer",
                fontSize: 10,
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ─── Compact Document List ─── */}
        {documents.length > 0 && (
          <CompactDocList
            drawingDocs={drawingDocs}
            specDocs={specDocs}
            generalDocs={generalDocs}
            onRemove={removeDocument}
            C={C}
            T={T}
          />
        )}

        {/* Reset All confirmation */}
        {showResetConfirm && (
          <div
            style={{
              marginBottom: T.space[4],
              padding: `${T.space[3]}px ${T.space[4]}px`,
              background: `${C.red || "#ef4444"}06`,
              borderRadius: T.radius.md,
              border: `1px solid ${C.red || "#ef4444"}30`,
              display: "flex",
              alignItems: "center",
              gap: T.space[3],
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Reset all Discovery data?</div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                This will clear all drawings, specs, scan results, terrain parameters, and model data. Project info
                (name, client, dates) will be preserved.
              </div>
            </div>
            <button
              onClick={() => setShowResetConfirm(false)}
              style={bt(C, {
                fontSize: 10,
                padding: "5px 14px",
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textMuted,
              })}
            >
              Cancel
            </button>
            <button
              onClick={handleResetAll}
              style={bt(C, {
                fontSize: 10,
                padding: "5px 14px",
                fontWeight: 600,
                background: C.red || "#ef4444",
                color: "#fff",
              })}
            >
              Reset
            </button>
          </div>
        )}

        {/* Processing banner */}
        {processingDocs.length > 0 && (
          <div
            style={{
              marginBottom: T.space[4],
              padding: `${T.space[3]}px ${T.space[4]}px`,
              background: `${C.accent}06`,
              borderRadius: T.radius.md,
              border: `1px solid ${C.accent}20`,
              display: "flex",
              alignItems: "center",
              gap: T.space[2],
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                border: `2px solid ${C.accent}40`,
                borderTop: `2px solid ${C.accent}`,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: C.accent }}>
              NOVA is processing {processingDocs.length} document{processingDocs.length > 1 ? "s" : ""}...
            </span>
            <span style={{ fontSize: 10, color: C.textDim, marginLeft: "auto" }}>
              Results will appear here automatically
            </span>
          </div>
        )}

        {/* Empty state — only shows when no documents AND no data (upload zone handles the CTA) */}
        {!hasData && documents.length === 0 && !uploadExpanded && (
          <div style={{ textAlign: "center", padding: `${T.space[7]}px 0`, color: C.textDim, fontSize: 12 }}>
            Drop files above to get started
          </div>
        )}

        {/* ─── Missing Drawings Recovery ─── */}
        {/* When drawing-type documents exist but drawing pages were never extracted or were lost */}
        {drawingsMissing && !scanProgress.phase && !rescanning && (
          <div
            style={{
              ...card(C),
              padding: `${T.space[5]}px`,
              marginBottom: T.space[4],
              textAlign: "center",
              border: `1px solid ${failedDrawingDocs.length > 0 ? C.red : C.accent}20`,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: T.radius.md,
                background: `${failedDrawingDocs.length > 0 ? C.red : C.accent}12`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                marginBottom: T.space[3],
              }}
            >
              <Ic d={I.plans} size={22} color={failedDrawingDocs.length > 0 ? C.red : C.accent} />
            </div>
            <div
              style={{
                fontSize: T.fontSize.sm,
                fontWeight: T.fontWeight.semibold,
                color: C.text,
                marginBottom: T.space[2],
              }}
            >
              {failedDrawingDocs.length > 0
                ? "Drawing extraction failed"
                : "Re-upload plans to start Discovery"}
            </div>
            <div
              style={{
                fontSize: T.fontSize.xs,
                color: C.textDim,
                maxWidth: 420,
                margin: "0 auto",
                lineHeight: 1.6,
                marginBottom: T.space[4],
              }}
            >
              {failedDrawingDocs.length > 0 ? (
                <>
                  {failedDrawingDocs.length} file{failedDrawingDocs.length > 1 ? "s" : ""} could not be processed
                  {failedDrawingDocs[0].processingError ? ` — ${failedDrawingDocs[0].processingError}` : ""}.
                  Try re-uploading or use a different PDF version.
                </>
              ) : (
                "Your previous upload record is here but the extracted pages were lost. Drop your PDF plans below to re-extract and scan automatically."
              )}
            </div>
            <div style={{ display: "flex", gap: T.space[3], justifyContent: "center" }}>
              <button
                onClick={() => {
                  // Clear stale drawing-type document entries so duplicate-filename check won't block re-upload
                  const staleDocs = useDocumentsStore.getState().documents.filter(d => d.docType === "drawing");
                  staleDocs.forEach(d => removeDocument(d.id));
                  setUploadExpanded(true);
                  // Small delay to let state settle before opening picker
                  setTimeout(() => fileInputRef.current?.click(), 50);
                }}
                style={{
                  ...bt(C),
                  padding: "8px 20px",
                  fontSize: T.fontSize.xs,
                  fontWeight: 600,
                  color: "#fff",
                  background: C.accent,
                  borderRadius: T.radius.sm,
                  cursor: "pointer",
                }}
              >
                <Ic d={I.upload} size={13} color="#fff" /> Re-upload Plans
              </button>
            </div>
          </div>
        )}

        {/* ─── No Drawing Plans Uploaded ─── */}
        {/* Non-drawing docs exist (specs, RFPs) but no drawing-type files and no drawings */}
        {!drawingsMissing && documents.length > 0 && drawingTypeDocs.length === 0 && drawings.length === 0 && !scanResults && !scanProgress.phase && (
          <div
            style={{
              ...card(C),
              padding: `${T.space[4]}px ${T.space[5]}px`,
              marginBottom: T.space[4],
              display: "flex",
              alignItems: "center",
              gap: T.space[3],
              border: `1px solid ${C.accent}15`,
            }}
          >
            <Ic d={I.plans} size={18} color={C.accent} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: T.fontSize.xs, fontWeight: T.fontWeight.semibold, color: C.text }}>
                Upload drawing plans to run NOVA Discovery
              </div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                Specs and bid documents are loaded. Add your PDF drawing plans to detect schedules and generate a ROM.
              </div>
            </div>
            <button
              onClick={() => { setUploadExpanded(true); setTimeout(() => fileInputRef.current?.click(), 50); }}
              style={{
                ...bt(C),
                padding: "6px 14px",
                fontSize: T.fontSize.xs,
                fontWeight: 600,
                color: C.accent,
                background: `${C.accent}08`,
                border: `1px solid ${C.accent}20`,
                borderRadius: T.radius.sm,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Add Plans
            </button>
          </div>
        )}

        {hasData && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: T.space[4] }}>
            {/* ─── Nova Vision Card ─── */}
            {(drawings.length > 0 || specs.length > 0 || documents.length > 0) && (
              <div style={{ ...card(C), padding: T.space[5], gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[3] }}>
                  <Ic d={I.ai} size={16} color={C.purple || C.accent} />
                  <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>
                    Nova Vision
                  </span>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={handleRescan}
                    disabled={rescanning || drawings.length === 0}
                    style={bt(C, {
                      fontSize: 10,
                      padding: "4px 10px",
                      borderRadius: T.radius.sm,
                      color: rescanning ? C.textDim : C.orange || "#F59E0B",
                      background: rescanning ? `${C.textDim}08` : `${C.orange || "#F59E0B"}08`,
                      border: `1px solid ${rescanning ? C.textDim + "20" : (C.orange || "#F59E0B") + "20"}`,
                      opacity: drawings.length === 0 ? 0.4 : 1,
                      cursor: rescanning || drawings.length === 0 ? "not-allowed" : "pointer",
                    })}
                  >
                    {rescanning ? (
                      <>
                        <span
                          style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            border: `2px solid ${C.textDim}40`,
                            borderTop: `2px solid ${C.textDim}`,
                            borderRadius: "50%",
                            animation: "spin 0.8s linear infinite",
                            marginRight: 4,
                          }}
                        />
                        Scanning…
                      </>
                    ) : (
                      <>
                        <Ic d={I.refresh} size={11} color={C.orange || "#F59E0B"} /> Rescan
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => navigate(`/estimate/${estId}/insights`)}
                    style={bt(C, {
                      fontSize: 10,
                      color: C.accent,
                      padding: "4px 10px",
                      background: `${C.accent}08`,
                      border: `1px solid ${C.accent}20`,
                      borderRadius: T.radius.sm,
                    })}
                  >
                    <Ic d={I.insights} size={11} color={C.accent} /> View Insights
                  </button>
                </div>
                {/* Scan progress banner */}
                {rescanning && scanProgress?.phase && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 14px",
                      marginBottom: T.space[3],
                      borderRadius: T.radius.sm,
                      background: `linear-gradient(135deg, ${C.orange || "#F59E0B"}08, ${C.orange || "#F59E0B"}04)`,
                      border: `1px solid ${C.orange || "#F59E0B"}18`,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 12,
                        height: 12,
                        border: `2px solid ${C.orange || "#F59E0B"}40`,
                        borderTop: `2px solid ${C.orange || "#F59E0B"}`,
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>
                      {scanProgress.message || "Scanning..."}
                    </span>
                    {scanProgress.total > 0 && (
                      <span style={{ fontSize: 10, color: C.textDim, fontFamily: "'DM Sans', sans-serif" }}>
                        {scanProgress.current}/{scanProgress.total}
                      </span>
                    )}
                    <div style={{ flex: 1 }} />
                    <div
                      style={{
                        width: 80,
                        height: 4,
                        borderRadius: 2,
                        background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 2,
                          width:
                            scanProgress.total > 0
                              ? `${Math.round((scanProgress.current / scanProgress.total) * 100)}%`
                              : "30%",
                          background: C.orange || "#F59E0B",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                    <button
                      onClick={() => {
                        stopScan();
                        setRescanning(false);
                      }}
                      style={{
                        background: "transparent",
                        border: `1px solid ${C.red || "#ef4444"}30`,
                        color: C.red || "#ef4444",
                        fontSize: 9,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 5,
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = `${C.red || "#ef4444"}10`;
                        e.currentTarget.style.borderColor = `${C.red || "#ef4444"}50`;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.borderColor = `${C.red || "#ef4444"}30`;
                      }}
                    >
                      Stop
                    </button>
                  </div>
                )}

                {/* ── Run Discovery prompt when scan hasn't run ── */}
                {!scanResults && !scanProgress.phase && !rescanning && drawings.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 16px",
                      marginBottom: T.space[3],
                      borderRadius: T.radius.sm,
                      background: `linear-gradient(135deg, ${C.accent}08, ${C.accent}04)`,
                      border: `1px solid ${C.accent}20`,
                    }}
                  >
                    <NovaOrb size={20} scheme="nova" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
                        {drawings.length} drawings ready for discovery
                      </div>
                      <div style={{ fontSize: 9, color: C.textDim, marginTop: 2 }}>
                        NOVA will detect schedules, extract notes, and generate a rough order of magnitude estimate.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setRescanning(true);
                        runFullScan({
                          onComplete: () => { setRescanning(false); setShowScanModal(true); },
                          onError: () => setRescanning(false),
                        });
                      }}
                      style={bt(C, {
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "6px 16px",
                        borderRadius: T.radius.sm,
                        color: "#fff",
                        background: C.accent,
                        border: "none",
                        cursor: "pointer",
                        flexShrink: 0,
                      })}
                    >
                      Run Discovery
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", gap: T.space[3], flexWrap: "wrap" }}>
                  <PipelineStep
                    label="Page Extraction"
                    done={drawings.length > 0}
                    detail={drawings.length > 0 ? `${drawings.length} pages` : null}
                    C={C}
                    T={T}
                  />
                  <PipelineStep
                    label="Sheet Labeling"
                    done={labeledCount > 0}
                    detail={labeledCount > 0 ? `${labeledCount}/${drawings.length}` : null}
                    C={C}
                    T={T}
                  />
                  <PipelineStep
                    label="Scale Detection"
                    done={scaledCount > 0}
                    detail={scaledCount > 0 ? `${scaledCount}/${drawings.length}` : null}
                    C={C}
                    T={T}
                  />
                  <PipelineStep
                    label="Metadata Extraction"
                    done={Object.keys(autoDetected).length > 0}
                    detail={Object.keys(autoDetected).length > 0 ? `${Object.keys(autoDetected).length} fields` : null}
                    C={C}
                    T={T}
                  />
                  <PipelineStep
                    label="Schedule Detection"
                    done={!!scanResults?.schedules}
                    detail={scanResults?.schedules ? `${scanResults.schedules.length} found` : null}
                    C={C}
                    T={T}
                  />
                  <PipelineStep
                    label="Drawing Notes"
                    done={!!scanResults?.drawingNotes}
                    detail={
                      scanResults?.drawingNotes
                        ? `${scanResults.drawingNotes.reduce((s, r) => s + (r.notes?.length || 0), 0)} notes`
                        : null
                    }
                    C={C}
                    T={T}
                  />
                  <PipelineStep
                    label="ROM Generation"
                    done={!!scanResults?.rom}
                    detail={scanResults?.rom?.totals ? `$${Math.round(scanResults.rom.totals.mid / 1000)}K` : null}
                    C={C}
                    T={T}
                  />
                  <PipelineStep
                    label="Building Outline"
                    done={outlineCount > 0}
                    detail={outlineCount > 0 ? `${outlineCount} plan${outlineCount > 1 ? "s" : ""}` : null}
                    C={C}
                    T={T}
                  />
                  <PipelineStep
                    label="Spec Parsing"
                    done={specs.length > 0}
                    detail={specs.length > 0 ? `${specs.length} sections` : null}
                    C={C}
                    T={T}
                  />
                </div>
              </div>
            )}

            {/* ─── Building Sketch ─── */}
            {(outlineCount > 0 ||
              project.buildingFootprintSF ||
              parseInt(project.floorCount) > 0 ||
              floors.length > 0 ||
              project.projectSF) && (
              <div
                style={{
                  ...card(C),
                  padding: T.space[5],
                  gridColumn: "1 / -1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 180,
                }}
              >
                <BuildingSketch
                  outlines={outlines}
                  floorAssignments={floorAssignments}
                  floors={floors}
                  project={project}
                  C={C}
                  T={T}
                />
              </div>
            )}

            {/* ─── Project Summary Card ─── */}
            <div style={{ ...card(C), padding: T.space[5], gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[3] }}>
                <Ic d={I.settings} size={16} color={C.accent} />
                <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>
                  Project Summary
                </span>
                {Object.keys(autoDetected).length > 0 && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: C.green,
                      background: `${C.green}12`,
                      padding: "2px 8px",
                      borderRadius: T.radius.full,
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <Ic d={I.ai} size={8} color={C.green} /> {Object.keys(autoDetected).length} auto-detected
                  </span>
                )}
              </div>

              {/* Auto-detected project info */}
              {(project.name && project.name !== "New Estimate") ||
              project.architect ||
              project.client ||
              project.address ||
              project.projectNumber ||
              project.engineer ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: `${T.space[2]}px ${T.space[4]}px`,
                    marginBottom: T.space[3],
                    padding: `${T.space[3]}px`,
                    background: `${C.accent}04`,
                    borderRadius: T.radius.sm,
                    border: `1px solid ${C.border}08`,
                  }}
                >
                  {project.name && project.name !== "New Estimate" && (
                    <MetaField label="Project" value={project.name} detected={autoDetected.name} C={C} T={T} />
                  )}
                  {project.architect && (
                    <MetaField
                      label="Architect"
                      value={project.architect}
                      detected={autoDetected.architect}
                      C={C}
                      T={T}
                    />
                  )}
                  {project.client && (
                    <MetaField label="Client" value={project.client} detected={autoDetected.client} C={C} T={T} />
                  )}
                  {project.engineer && (
                    <MetaField label="Engineer" value={project.engineer} detected={autoDetected.engineer} C={C} T={T} />
                  )}
                  {project.address && (
                    <MetaField label="Address" value={project.address} detected={autoDetected.address} C={C} T={T} />
                  )}
                  {project.projectNumber && (
                    <MetaField
                      label="Project #"
                      value={project.projectNumber}
                      detected={autoDetected.projectNumber}
                      C={C}
                      T={T}
                    />
                  )}
                </div>
              ) : null}

              {/* Project narrative */}
              {(() => {
                const narrative = buildProjectNarrative(project, drawings, specs, activeLoc);
                return narrative.length > 20 ? (
                  <div
                    style={{
                      fontSize: T.fontSize.sm,
                      color: C.textMuted,
                      lineHeight: 1.7,
                      marginBottom: T.space[3],
                      padding: `${T.space[3]}px ${T.space[4]}px`,
                      background: `${C.accent}03`,
                      borderRadius: T.radius.sm,
                      borderLeft: `3px solid ${C.accent}30`,
                    }}
                  >
                    {narrative}
                  </div>
                ) : null;
              })()}

              {/* Stats + Geography side by side */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: activeLoc && activeLoc.source !== "none" ? "1fr 1fr" : "1fr",
                  gap: T.space[4],
                }}
              >
                {/* Left: stat pills */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[4], alignContent: "start" }}>
                  {project.projectSF && (
                    <StatPill
                      label="Total SF"
                      value={parseFloat(project.projectSF).toLocaleString()}
                      unit="SF"
                      C={C}
                      T={T}
                    />
                  )}
                  {project.floorCount > 0 && (
                    <StatPill
                      label="Floors"
                      value={project.floorCount}
                      unit={project.basementCount > 0 ? `+ ${project.basementCount} below` : "above grade"}
                      C={C}
                      T={T}
                    />
                  )}
                  {project.buildingFootprintSF && (
                    <StatPill
                      label="Footprint"
                      value={parseFloat(project.buildingFootprintSF).toLocaleString()}
                      unit="SF/floor"
                      C={C}
                      T={T}
                    />
                  )}
                  {project.buildingType && (
                    <StatPill label="Building Type" value={getBuildingTypeLabel(project.buildingType)} C={C} T={T} />
                  )}
                  {project.workType && (
                    <StatPill label="Work Type" value={getWorkTypeLabel(project.workType)} C={C} T={T} />
                  )}
                  {floors.length > 0 && (
                    <StatPill
                      label="Building Height"
                      value={floors.reduce((s, f) => s + (f.height || 12), 0)}
                      unit="ft"
                      C={C}
                      T={T}
                    />
                  )}
                  {drawings.length > 0 && (
                    <StatPill label="Drawings" value={drawings.length} unit={`${labeledCount} labeled`} C={C} T={T} />
                  )}
                  {specs.length > 0 && (
                    <StatPill
                      label="Spec Sections"
                      value={specs.length}
                      unit={`${allocatedSpecs.length} allocated`}
                      C={C}
                      T={T}
                    />
                  )}
                  {documents.length > 0 && (
                    <StatPill label="Documents" value={documents.length} unit="files" C={C} T={T} />
                  )}
                </div>

                {/* Right: Geography / Cost Index */}
                {activeLoc && activeLoc.source !== "none" && (
                  <div
                    style={{
                      padding: `${T.space[3]}px`,
                      background: `${C.text}03`,
                      borderRadius: T.radius.sm,
                      border: `1px solid ${C.border}08`,
                    }}
                  >
                    {/* Metro badge */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: T.space[3],
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: `linear-gradient(135deg, ${costColor}25, ${costColor}08)`,
                          border: `2px solid ${costColor}40`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{ fontSize: 9, fontWeight: 800, color: costColor, fontFamily: "'DM Sans',sans-serif" }}
                        >
                          {composite}
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{activeLoc.label}</div>
                        <div style={{ fontSize: 9, color: costColor, fontWeight: 600 }}>
                          {costLevel} Cost Market
                          {activeLoc.source === "state" && " (state avg)"}
                        </div>
                      </div>
                    </div>
                    {/* Cost factor bars */}
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: C.textDim,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        marginBottom: T.space[2],
                      }}
                    >
                      Cost Index vs National Avg
                    </div>
                    <FactorBar label="Material" value={activeLoc.mat} color={C.blue} C={C} />
                    <FactorBar label="Labor" value={activeLoc.lab} color={C.orange} C={C} />
                    <FactorBar label="Equipment" value={activeLoc.equip} color={C.green} C={C} />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 4,
                        fontSize: 8,
                        color: C.textDim,
                      }}
                    >
                      <span>0.60×</span>
                      <span style={{ fontWeight: 600 }}>1.00× avg</span>
                      <span>1.40×</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ─── NOVA ROM Card ─── */}
            {scanResults && (
              <div
                style={{
                  ...card(C),
                  padding: T.space[5],
                  gridColumn: "1 / -1",
                  border: `1px solid ${C.purple || C.accent}15`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: T.space[3],
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
                    <Ic d={I.ai} size={16} color={C.purple || C.accent} />
                    <span
                      style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.purple || C.accent }}
                    >
                      NOVA ROM
                    </span>
                  </div>
                  {scanResults.rom?.sfEstimated && (
                    <span
                      style={{
                        fontSize: 9,
                        color: C.orange,
                        fontWeight: 500,
                        background: `${C.orange}10`,
                        padding: "2px 8px",
                        borderRadius: T.radius.full,
                      }}
                    >
                      SF estimated by AI
                    </span>
                  )}
                </div>

                {/* ROM totals as prominent display */}
                {scanResults.rom?.totals && (
                  <div
                    style={{
                      display: "flex",
                      gap: T.space[5],
                      marginBottom: T.space[4],
                      padding: `${T.space[4]}px`,
                      background: `${C.purple || C.accent}04`,
                      borderRadius: T.radius.sm,
                      border: `1px solid ${C.purple || C.accent}10`,
                    }}
                  >
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div
                        style={{
                          fontSize: 9,
                          color: C.textDim,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Low Estimate
                      </div>
                      <div
                        style={{
                          fontSize: T.fontSize.xl,
                          fontWeight: T.fontWeight.bold,
                          color: C.purple || C.accent,
                          fontFamily: "'DM Sans',sans-serif",
                        }}
                      >
                        ${Math.round(scanResults.rom.totals.low).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ width: 1, background: `${C.purple || C.accent}15` }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div
                        style={{
                          fontSize: 9,
                          color: C.textDim,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Mid Estimate
                      </div>
                      <div
                        style={{
                          fontSize: T.fontSize.xl,
                          fontWeight: T.fontWeight.bold,
                          color: C.text,
                          fontFamily: "'DM Sans',sans-serif",
                        }}
                      >
                        ${Math.round(scanResults.rom.totals.mid).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ width: 1, background: `${C.purple || C.accent}15` }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div
                        style={{
                          fontSize: 9,
                          color: C.textDim,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        High Estimate
                      </div>
                      <div
                        style={{
                          fontSize: T.fontSize.xl,
                          fontWeight: T.fontWeight.bold,
                          color: C.purple || C.accent,
                          fontFamily: "'DM Sans',sans-serif",
                        }}
                      >
                        ${Math.round(scanResults.rom.totals.high).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[4] }}>
                  {scanResults.rom?.projectSF && scanResults.rom?.totals && (
                    <StatPill
                      label="Cost/SF"
                      value={`$${Math.round(scanResults.rom.totals.mid / scanResults.rom.projectSF)}`}
                      unit="/SF"
                      C={C}
                      T={T}
                      accent
                    />
                  )}
                  <StatPill label="Schedules" value={scanResults.schedules?.length || 0} unit="detected" C={C} T={T} />
                  <StatPill
                    label="Line Items"
                    value={scanResults.lineItems?.length || 0}
                    unit="generated"
                    C={C}
                    T={T}
                  />
                  {scanResults.drawingNotes && (
                    <StatPill
                      label="Drawing Notes"
                      value={scanResults.drawingNotes.reduce((s, r) => s + (r.notes?.length || 0), 0)}
                      unit="extracted"
                      C={C}
                      T={T}
                    />
                  )}
                </div>

                {/* Schedule type breakdown */}
                {scanResults.schedules?.length > 0 && (
                  <div style={{ marginTop: T.space[3], display: "flex", flexWrap: "wrap", gap: T.space[2] }}>
                    {scanResults.schedules.map((s, i) => (
                      <span
                        key={i}
                        style={{
                          padding: "3px 8px",
                          borderRadius: T.radius.full,
                          background: `${C.purple || C.accent}08`,
                          fontSize: 10,
                          color: C.purple || C.accent,
                          fontWeight: 500,
                        }}
                      >
                        {s.title || s.type} · {s.entries?.length || 0} items · {s.sheetLabel}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── Drawing Index Card ─── */}
            {drawings.length > 0 && (
              <div style={{ ...card(C), padding: T.space[5] }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: T.space[3],
                    cursor: "pointer",
                  }}
                  onClick={() => setDrawingsExpanded(!drawingsExpanded)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
                    <Ic d={I.layers} size={16} color={C.blue} />
                    <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>
                      Drawing Index
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: labeledCount === drawings.length ? C.green : C.textMuted,
                        fontWeight: 600,
                      }}
                    >
                      {labeledCount}/{drawings.length} labeled
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: scaledCount === drawings.length ? C.green : C.textMuted,
                        fontWeight: 600,
                      }}
                    >
                      {scaledCount}/{drawings.length} scaled
                    </span>
                    <Ic
                      d={I.chevron}
                      size={10}
                      color={C.textDim}
                      style={{
                        transform: drawingsExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.2s",
                      }}
                    />
                  </div>
                </div>

                {/* Discipline breakdown */}
                {Object.keys(disciplines).length > 1 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: T.space[2], marginBottom: T.space[2] }}>
                    {Object.entries(disciplines)
                      .sort((a, b) => b[1] - a[1])
                      .map(([name, count]) => (
                        <span
                          key={name}
                          style={{
                            padding: "2px 8px",
                            borderRadius: T.radius.full,
                            background: `${C.blue}08`,
                            fontSize: 10,
                            fontWeight: 500,
                            color: C.blue,
                          }}
                        >
                          {name}: {count}
                        </span>
                      ))}
                  </div>
                )}

                <div
                  style={{
                    maxHeight: drawingsExpanded ? "none" : 200,
                    overflowY: drawingsExpanded ? "visible" : "auto",
                    transition: "max-height 0.3s ease",
                  }}
                >
                  {drawings.map(d => (
                    <div
                      key={d.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: T.space[2],
                        padding: "4px 0",
                        borderBottom: `1px solid ${C.border}08`,
                        fontSize: T.fontSize.xs,
                      }}
                    >
                      {/* Thumbnail */}
                      <div
                        style={{
                          width: 32,
                          height: 22,
                          borderRadius: 2,
                          overflow: "hidden",
                          background: C.bg2,
                          flexShrink: 0,
                        }}
                      >
                        {pdfCanvases[d.id] ? (
                          <img src={pdfCanvases[d.id]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : d.type === "image" && d.data ? (
                          <img src={d.data} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span
                            style={{
                              fontSize: 6,
                              color: C.textDim,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              height: "100%",
                            }}
                          >
                            PDF
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontFamily: "'DM Sans',sans-serif",
                          fontWeight: 700,
                          color: C.accent,
                          minWidth: 70,
                          fontSize: 10,
                        }}
                      >
                        {d.sheetNumber || "—"}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          color: C.text,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.sheetTitle || d.label || "Untitled"}
                      </span>
                      {outlines[d.id] && (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 600,
                            color: C.green,
                            background: `${C.green}12`,
                            padding: "1px 5px",
                            borderRadius: 3,
                          }}
                        >
                          OUTLINE
                        </span>
                      )}
                      {drawingScales[d.id] && (
                        <span style={{ fontSize: 9, color: C.green, fontWeight: 500 }}>
                          {getScaleLabel(drawingScales[d.id])}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {!drawingsExpanded && drawings.length > 8 && (
                  <div
                    onClick={() => setDrawingsExpanded(true)}
                    style={{
                      textAlign: "center",
                      padding: "6px 0",
                      fontSize: 10,
                      color: C.accent,
                      cursor: "pointer",
                      fontWeight: 600,
                      marginTop: 2,
                    }}
                  >
                    Show all {drawings.length} drawings
                  </div>
                )}
              </div>
            )}

            {/* ─── Specifications Card ─── */}
            {specs.length > 0 && (
              <div style={{ ...card(C), padding: T.space[5] }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: T.space[3],
                    cursor: "pointer",
                  }}
                  onClick={() => setSpecsExpanded(!specsExpanded)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
                    <Ic d={I.plans} size={16} color={C.purple || C.accent} />
                    <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.text }}>
                      Specifications
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
                    <span
                      style={{
                        fontSize: 10,
                        color: allocatedSpecs.length === specs.length ? C.green : C.orange,
                        fontWeight: 600,
                      }}
                    >
                      {allocatedSpecs.length}/{specs.length} allocated
                    </span>
                    <Ic
                      d={I.chevron}
                      size={10}
                      color={C.textDim}
                      style={{
                        transform: specsExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.2s",
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    maxHeight: specsExpanded ? "none" : 200,
                    overflowY: specsExpanded ? "visible" : "auto",
                    transition: "max-height 0.3s ease",
                  }}
                >
                  {specs.map(sp => {
                    const allocated = items.some(i => i.specSection === sp.section);
                    return (
                      <div
                        key={sp.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: T.space[2],
                          padding: "4px 0",
                          borderBottom: `1px solid ${C.border}08`,
                          fontSize: T.fontSize.xs,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "'DM Sans',sans-serif",
                            fontWeight: 600,
                            color: C.purple || C.accent,
                            minWidth: 70,
                            fontSize: 10,
                          }}
                        >
                          {sp.section || "—"}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            color: C.text,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {sp.title || "Untitled"}
                        </span>
                        {allocated ? (
                          <span
                            style={{
                              fontSize: 8,
                              fontWeight: 700,
                              color: C.green,
                              background: `${C.green}12`,
                              padding: "2px 6px",
                              borderRadius: 3,
                            }}
                          >
                            ALLOC
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 8,
                              fontWeight: 600,
                              color: C.orange,
                              background: `${C.orange}12`,
                              padding: "2px 6px",
                              borderRadius: 3,
                            }}
                          >
                            GAP
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {specs.length > 0 && allocatedSpecs.length < specs.length && (
                  <div style={{ marginTop: T.space[2], fontSize: 10, color: C.orange, fontWeight: 500 }}>
                    {specs.length - allocatedSpecs.length} unallocated spec section
                    {specs.length - allocatedSpecs.length > 1 ? "s" : ""} — add scope items to cover
                  </div>
                )}
                {!specsExpanded && specs.length > 8 && (
                  <div
                    onClick={() => setSpecsExpanded(true)}
                    style={{
                      textAlign: "center",
                      padding: "6px 0",
                      fontSize: 10,
                      color: C.accent,
                      cursor: "pointer",
                      fontWeight: 600,
                      marginTop: 2,
                    }}
                  >
                    Show all {specs.length} sections
                  </div>
                )}
              </div>
            )}

            {/* ─── Terrain Card ─── */}
            <div style={{ gridColumn: "1 / -1" }}>
              <BuildingParametersSection />
            </div>

            {/* ─── NOVA Activity Log ─── */}
            {novaHistory.length > 0 && (
              <div style={{ ...card(C), padding: T.space[5], gridColumn: "1 / -1" }}>
                <div style={{ display: "flex", alignItems: "center", gap: T.space[2], marginBottom: T.space[3] }}>
                  <Ic d={I.ai} size={16} color={C.textMuted} />
                  <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: C.textMuted }}>
                    NOVA Activity Log
                  </span>
                </div>
                <div style={{ maxHeight: 160, overflowY: "auto" }}>
                  {[...novaHistory]
                    .reverse()
                    .slice(0, 10)
                    .map((h, i) => (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: T.space[2],
                          padding: "3px 0",
                          borderBottom: `1px solid ${C.border}06`,
                          fontSize: 10,
                        }}
                      >
                        <Ic d={I.check} size={10} color={C.green} />
                        <span
                          style={{ color: C.textDim, fontFamily: "'DM Sans',sans-serif", fontSize: 9, minWidth: 60 }}
                        >
                          {new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span
                          style={{
                            color: C.text,
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h.result || h.action}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Next Steps ─── */}
        {estId && hasData && (
          <div style={{ marginTop: T.space[5], ...card(C), padding: T.space[5] }}>
            <div
              style={{
                fontSize: T.fontSize.xs,
                fontWeight: T.fontWeight.bold,
                color: C.textMuted,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: T.space[3],
              }}
            >
              Next Steps
            </div>
            <div style={{ display: "flex", gap: T.space[3], flexWrap: "wrap" }}>
              <button
                onClick={() => navigate(`/estimate/${estId}/takeoffs`)}
                style={bt(C, {
                  background: C.accent,
                  color: "#fff",
                  padding: "10px 20px",
                  fontSize: 12,
                  fontWeight: 600,
                  flex: 1,
                  minWidth: 180,
                })}
              >
                <Ic d={I.edit} size={15} color="#fff" sw={2} /> Build Estimate
                <span style={{ display: "block", fontSize: 9, fontWeight: 400, opacity: 0.8, marginTop: 2 }}>
                  Add line items and pricing
                </span>
              </button>
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  setUploadExpanded(true);
                }}
                style={bt(C, {
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textMuted,
                  padding: "10px 20px",
                  fontSize: 12,
                  fontWeight: 500,
                  flex: 1,
                  minWidth: 180,
                })}
              >
                <Ic d={I.upload} size={15} color={C.textMuted} sw={2} /> Upload More Documents
                <span style={{ display: "block", fontSize: 9, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>
                  Add drawings, specs, or addenda
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Scan results summary card */}
        {scanResults && !scanProgress.phase && !showScanModal && (
          <div
            style={{
              marginTop: T.space[4],
              ...card(C),
              padding: `${T.space[3]}px ${T.space[4]}px`,
              border: `1px solid ${C.purple || C.accent}20`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.purple || C.accent,
                    marginBottom: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Ic d={I.ai} size={14} color={C.purple || C.accent} /> NOVA Scan Complete
                </div>
                <div style={{ fontSize: 10, color: C.textDim }}>
                  {scanResults.schedules?.length || 0} schedule{scanResults.schedules?.length !== 1 ? "s" : ""}
                  {" · "}
                  {scanResults.lineItems?.length || 0} line items
                  {scanResults.rom?.totals
                    ? ` · ROM: $${Math.round(scanResults.rom.totals.low).toLocaleString()} – $${Math.round(scanResults.rom.totals.high).toLocaleString()}`
                    : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => setShowScanModal(true)}
                  style={bt(C, {
                    background: C.purple || C.accent,
                    color: "#fff",
                    padding: "6px 14px",
                    fontSize: 10,
                    fontWeight: 600,
                  })}
                >
                  View Results
                </button>
                <button
                  onClick={clearScan}
                  style={bt(C, {
                    background: "transparent",
                    border: `1px solid ${C.border}`,
                    color: C.textDim,
                    padding: "6px 10px",
                    fontSize: 10,
                  })}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scan Results Modal */}
      {showScanModal && scanResults && (
        <ScanResultsModal
          scanResults={scanResults}
          onClose={() => setShowScanModal(false)}
          onApplyToEstimate={handleApplyToEstimate}
          onApplyNotes={handleApplyNotes}
          onSaveOnly={() => {
            setShowScanModal(false);
            showToast("Scan results saved");
          }}
        />
      )}
    </div>
  );
}

// ─── Compact document list (inline in Discovery) ─────────────────────────────
function CompactDocList({ drawingDocs, specDocs, generalDocs, onRemove, C, T }) {
  const [expanded, setExpanded] = useState(false);
  const allDocs = [...drawingDocs, ...specDocs, ...generalDocs];
  if (allDocs.length === 0) return null;
  const preview = expanded ? allDocs : allDocs.slice(0, 4);

  return (
    <div style={{ marginBottom: T.space[4], ...card(C), padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: `${T.space[2]}px ${T.space[3]}px`,
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderBottom: `1px solid ${C.border}08`,
        }}
      >
        <Ic d={I.folder} size={12} color={C.textMuted} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: C.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Uploaded Files
        </span>
        {drawingDocs.length > 0 && (
          <span style={{ fontSize: 9, color: C.blue, fontWeight: 500 }}>
            {drawingDocs.length} drawing{drawingDocs.length !== 1 ? "s" : ""}
          </span>
        )}
        {specDocs.length > 0 && (
          <span style={{ fontSize: 9, color: C.purple || C.accent, fontWeight: 500 }}>
            {specDocs.length} spec{specDocs.length !== 1 ? "s" : ""}
          </span>
        )}
        {generalDocs.length > 0 && (
          <span style={{ fontSize: 9, color: C.textDim, fontWeight: 500 }}>{generalDocs.length} other</span>
        )}
      </div>
      {preview.map(doc => (
        <div
          key={doc.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: T.space[2],
            padding: `4px ${T.space[3]}px`,
            borderBottom: `1px solid ${C.border}06`,
            fontSize: 11,
          }}
        >
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              color:
                doc.docType === "drawing" ? C.blue : doc.docType === "specification" ? C.purple || C.accent : C.textDim,
              textTransform: "uppercase",
              minWidth: 30,
            }}
          >
            {doc.docType === "drawing" ? "DWG" : doc.docType === "specification" ? "SPEC" : "DOC"}
          </span>
          <span style={{ flex: 1, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.filename}
          </span>
          <span style={{ fontSize: 9, color: C.textDim }}>{formatBytes(doc.size)}</span>
          {doc.processingStatus === "processing" && (
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                border: `2px solid ${C.accent}40`,
                borderTop: `2px solid ${C.accent}`,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          )}
          {doc.processingStatus === "complete" && <Ic d={I.check} size={10} color={C.green} />}
          <button
            onClick={() => onRemove(doc.id)}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, opacity: 0.4 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "0.4")}
          >
            <Ic d={I.trash} size={10} color={C.textDim} />
          </button>
        </div>
      ))}
      {allDocs.length > 4 && !expanded && (
        <div
          onClick={() => setExpanded(true)}
          style={{
            padding: "4px 0",
            textAlign: "center",
            fontSize: 10,
            color: C.accent,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Show all {allDocs.length} files
        </div>
      )}
    </div>
  );
}

// ─── Factor bar (used in Project Summary for cost index) ─────────────────────
function FactorBar({ label, value, color, C }) {
  const pct = Math.min(Math.max((value - 0.6) / 0.8, 0), 1) * 100;
  const natPct = ((1.0 - 0.6) / 0.8) * 100;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: value > 1.05 ? C.orange : value < 0.95 ? C.green : C.text,
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          {value.toFixed(2)}×
        </span>
      </div>
      <div style={{ height: 6, background: C.bg2, borderRadius: 3, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: `${natPct}%`,
            top: 0,
            width: 1,
            height: 6,
            background: `${C.textDim}40`,
            zIndex: 1,
          }}
        />
        <div
          style={{
            height: "100%",
            borderRadius: 3,
            background: `linear-gradient(90deg, ${color}60, ${color})`,
            width: `${pct}%`,
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  );
}

// ─── Stat pill component ──────────────────────────────────────────────────────
function StatPill({ label, value, unit, C, T, accent }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div
        style={{
          fontSize: 9,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontSize: T.fontSize.lg,
            fontWeight: T.fontWeight.bold,
            color: accent ? C.purple || C.accent : C.text,
            fontFamily:
              typeof value === "number" || String(value).startsWith("$")
                ? "'DM Sans',sans-serif"
                : "'DM Sans',sans-serif",
          }}
        >
          {value}
        </span>
        {unit && <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>{unit}</span>}
      </div>
    </div>
  );
}

// ─── Metadata field (auto-detected project info) ─────────────────────────────
function MetaField({ label, value, detected, C, T }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
        <span
          style={{
            fontSize: 9,
            color: C.textDim,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        {detected && (
          <span
            style={{
              fontSize: 7,
              fontWeight: 700,
              color: C.green,
              background: `${C.green}15`,
              padding: "1px 4px",
              borderRadius: 3,
              textTransform: "uppercase",
              letterSpacing: "0.03em",
            }}
          >
            AI
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: T.fontSize.xs,
          color: C.text,
          fontWeight: T.fontWeight.medium,
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Project narrative builder ────────────────────────────────────────────────
function buildProjectNarrative(project, drawings, specs, activeLoc) {
  const parts = [];
  const name = project.name && project.name !== "New Estimate" ? project.name : null;
  const btLabel = getBuildingTypeLabel(project.buildingType);
  const wtLabel = getWorkTypeLabel(project.workType);
  const sf = project.projectSF ? parseFloat(project.projectSF) : null;
  const fc = parseInt(project.floorCount) || 0;
  const bc = parseInt(project.basementCount) || 0;
  const fp = project.buildingFootprintSF ? parseFloat(project.buildingFootprintSF) : null;
  const rooms = project.roomCounts || {};
  const address = project.address;

  // Sentence 1: What is this project?
  // "611 Crescent Hill Ln is a 2-story residential new construction located in Nashville, TN."
  let s1 = name || "This project";
  const descriptors = [];
  if (fc > 0) descriptors.push(`${fc}-story`);
  if (btLabel !== "Unclassified") descriptors.push(btLabel.toLowerCase());
  if (wtLabel) descriptors.push(wtLabel.toLowerCase());
  if (descriptors.length > 0) {
    s1 += ` is a ${descriptors.join(" ")}`;
  }
  if (activeLoc && activeLoc.label && activeLoc.source !== "none") {
    s1 +=
      descriptors.length > 0 ? ` located in the ${activeLoc.label} area` : ` is located in the ${activeLoc.label} area`;
  } else if (address) {
    // Try to extract city/state from address for a cleaner read
    const cityMatch = address.match(/,\s*([^,]+),?\s*[A-Z]{2}/);
    if (cityMatch)
      s1 += descriptors.length > 0 ? ` located in ${cityMatch[1].trim()}` : ` is located in ${cityMatch[1].trim()}`;
  }
  s1 += ".";
  parts.push(s1);

  // Sentence 2: Size and structure
  // "The building encompasses approximately 3,200 SF across a 1,600 SF footprint with a basement level."
  const sizeParts = [];
  if (sf) sizeParts.push(`approximately ${Math.round(sf).toLocaleString()} SF`);
  if (fp) sizeParts.push(`a ${Math.round(fp).toLocaleString()} SF per-floor footprint`);
  if (bc > 0) sizeParts.push(`${bc} basement level${bc > 1 ? "s" : ""}`);
  if (sizeParts.length > 0) {
    parts.push("The building encompasses " + sizeParts.join(" across ") + ".");
  }

  // Sentence 3: Interior features
  // "The interior includes 3 bathrooms, a kitchen, and 2 staircases."
  const feats = [];
  const roomLabels = {
    bathrooms: "bathroom",
    kitchens: "kitchen",
    bedrooms: "bedroom",
    offices: "office",
    conferenceRooms: "conference room",
    breakRooms: "break room",
    lobbies: "lobby",
    staircases: "staircase",
    elevators: "elevator",
    storageRooms: "storage room",
    parkingSpaces: "parking space",
    residentialUnits: "residential unit",
  };
  Object.entries(roomLabels).forEach(([key, singular]) => {
    const v = parseInt(rooms[key]);
    if (v > 0) feats.push(v === 1 ? `a ${singular}` : `${v} ${singular}s`);
  });
  if (feats.length > 0) {
    const last = feats.pop();
    parts.push("The interior includes " + (feats.length > 0 ? feats.join(", ") + ", and " + last : last) + ".");
  }

  // Sentence 4: Document scope
  // "NOVA has analyzed 24 drawings across 5 disciplines and 18 specification sections for this project."
  if (drawings.length > 0 || specs.length > 0) {
    const docParts = [];
    if (drawings.length > 0) docParts.push(`${drawings.length} drawing${drawings.length > 1 ? "s" : ""}`);
    if (specs.length > 0) docParts.push(`${specs.length} specification section${specs.length > 1 ? "s" : ""}`);
    parts.push("NOVA has analyzed " + docParts.join(" and ") + " for this project.");
  }

  return parts.join(" ");
}

// ─── Pipeline step indicator ─────────────────────────────────────────────────
function PipelineStep({ label, done, detail, C, T }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: T.radius.sm,
        background: done ? `${C.green}08` : `${C.textDim}06`,
        border: `1px solid ${done ? C.green : C.textDim}12`,
        minWidth: 120,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: done ? C.green : "transparent",
          border: done ? "none" : `2px solid ${C.textDim}30`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {done && <Ic d={I.check} size={8} color="#fff" />}
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: done ? C.text : C.textDim }}>{label}</div>
        {detail && (
          <div style={{ fontSize: 8, color: done ? C.green : C.textDim, fontWeight: 500, marginTop: 1 }}>{detail}</div>
        )}
      </div>
    </div>
  );
}
