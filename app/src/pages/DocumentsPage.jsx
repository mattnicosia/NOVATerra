// ═══════════════════════════════════════════════════════════════════════════════
// DocumentsPage — Upload, organize, and manage project documents
//
// "Docs" pill in the journey bar. Features:
//   - Category cards for each construction document type
//   - Drag-and-drop upload zone (global + per-category)
//   - Full DocumentsPanel with folders, tags, versions, transmittals
//   - Smart change type detection from filenames
//   - Setup mode for first-time upload
// ═══════════════════════════════════════════════════════════════════════════════
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useProjectStore } from "@/stores/projectStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";
import { handleFileUpload } from "@/utils/uploadPipeline";
import DocumentsPanel from "@/components/planroom/DocumentsPanel";
import { getScaleLabel } from "@/utils/drawingUtils";

// ── Drawing Index (moved from PlanRoomPage) ──────────────────────────────────
function DrawingIndex() {
  const C = useTheme();
  const T = C.T;
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const drawingScales = useDrawingPipelineStore(s => s.drawingScales);
  const pdfCanvases = useDrawingPipelineStore(s => s.pdfCanvases);
  const [expanded, setExpanded] = useState(false);
  const [discipline, setDiscipline] = useState(null);
  const [previewId, setPreviewId] = useState(null);

  const labeledCount = drawings.filter(d => d.sheetNumber).length;
  const scaledCount = drawings.filter(d => drawingScales[d.id]).length;

  // Discipline breakdown
  const disciplines = {};
  drawings.forEach(d => {
    const prefix = (d.sheetNumber || "").match(/^([A-Z])/i)?.[1]?.toUpperCase() || "?";
    const labels = { A: "Architectural", S: "Structural", M: "Mechanical", E: "Electrical", P: "Plumbing", L: "Landscape", C: "Civil", G: "General" };
    const name = labels[prefix] || "Other";
    disciplines[name] = (disciplines[name] || 0) + 1;
  });

  const filtered = drawings.filter(d => {
    if (!discipline) return true;
    const prefix = (d.sheetNumber || "").match(/^([A-Z])/i)?.[1]?.toUpperCase() || "?";
    const labels = { A: "Architectural", S: "Structural", M: "Mechanical", E: "Electrical", P: "Plumbing", L: "Landscape", C: "Civil", G: "General" };
    return (labels[prefix] || "Other") === discipline;
  });

  return (
    <div style={{ ...card(C), padding: T.space[5], marginTop: T.space[4] }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.space[3], cursor: "pointer" }}
        onClick={() => setExpanded(!expanded)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <Ic d={I.layers} size={16} color={"#4A90D9"} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Drawing Index</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <span style={{ fontSize: 10, color: labeledCount === drawings.length ? "#22c55e" : C.textMuted, fontWeight: 600 }}>
            {labeledCount}/{drawings.length} labeled
          </span>
          <span style={{ fontSize: 10, color: scaledCount === drawings.length ? "#22c55e" : C.textMuted, fontWeight: 600 }}>
            {scaledCount}/{drawings.length} scaled
          </span>
          <Ic d={I.chevron} size={10} color={C.textDim}
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
          />
        </div>
      </div>

      {/* Discipline filter pills */}
      {Object.keys(disciplines).length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: T.space[2] }}>
          <button onClick={() => setDiscipline(null)} style={{
            padding: "2px 8px", borderRadius: 99, fontSize: 10, cursor: "pointer",
            background: !discipline ? "#4A90D918" : "#4A90D908",
            border: !discipline ? "1px solid #4A90D930" : "1px solid transparent",
            fontWeight: !discipline ? 700 : 500, color: "#4A90D9", fontFamily: T.font.sans,
          }}>All ({drawings.length})</button>
          {Object.entries(disciplines).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
            <button key={name} onClick={() => setDiscipline(discipline === name ? null : name)} style={{
              padding: "2px 8px", borderRadius: 99, fontSize: 10, cursor: "pointer",
              background: discipline === name ? "#4A90D918" : "#4A90D908",
              border: discipline === name ? "1px solid #4A90D930" : "1px solid transparent",
              fontWeight: discipline === name ? 700 : 500, color: "#4A90D9", fontFamily: T.font.sans,
            }}>{name}: {count}</button>
          ))}
        </div>
      )}

      {/* Drawing list */}
      <div style={{ maxHeight: expanded ? "none" : 260, overflowY: expanded ? "visible" : "auto" }}>
        {filtered.map(d => (
          <div key={d.id} style={{
            display: "flex", alignItems: "center", gap: T.space[2],
            padding: "5px 4px", borderBottom: `1px solid ${C.border}08`,
            fontSize: 10, borderRadius: 4, transition: "background 0.15s",
          }}
            onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}06`)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {/* Thumbnail */}
            <div onClick={() => setPreviewId(d.id)} title="Click to preview" style={{
              width: 48, height: 32, borderRadius: 3, overflow: "hidden",
              background: C.bg2, flexShrink: 0, cursor: "pointer",
              border: `1px solid ${C.border}20`,
            }}>
              {pdfCanvases[d.id] ? (
                <img src={pdfCanvases[d.id]} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : d.type === "image" && d.data ? (
                <img src={d.data} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontSize: 7, color: C.textDim, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>PDF</span>
              )}
            </div>
            <input value={d.sheetNumber || ""} placeholder="—"
              onChange={e => useDrawingPipelineStore.getState().updateDrawing(d.id, "sheetNumber", e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{
                fontFamily: T.font.sans, fontWeight: 700, color: C.accent,
                width: 70, fontSize: 10, background: "transparent",
                border: "1px solid transparent", borderRadius: 3, padding: "2px 4px", outline: "none",
              }}
              onFocus={e => { e.target.style.borderColor = C.accent + "4D"; e.target.style.background = `${C.accent}06`; }}
              onBlur={e => { e.target.style.borderColor = "transparent"; e.target.style.background = "transparent"; }}
            />
            <input value={d.sheetTitle || ""} placeholder={d.label || "Untitled"}
              onChange={e => useDrawingPipelineStore.getState().updateDrawing(d.id, "sheetTitle", e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{
                flex: 1, color: C.text, fontSize: 10, background: "transparent",
                border: "1px solid transparent", borderRadius: 3, padding: "2px 4px",
                outline: "none", minWidth: 0,
              }}
              onFocus={e => { e.target.style.borderColor = C.border; e.target.style.background = `${C.accent}06`; }}
              onBlur={e => { e.target.style.borderColor = "transparent"; e.target.style.background = "transparent"; }}
            />
            {drawingScales[d.id] && (
              <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 500 }}>
                {getScaleLabel(drawingScales[d.id])}
              </span>
            )}
          </div>
        ))}
      </div>
      {!expanded && drawings.length > 8 && (
        <div onClick={() => setExpanded(true)} style={{
          textAlign: "center", padding: "6px 0", fontSize: 10,
          color: C.accent, cursor: "pointer", fontWeight: 600, marginTop: 2,
        }}>Show all {drawings.length} drawings</div>
      )}

      {/* Lightbox preview */}
      {previewId && (() => {
        const d = drawings.find(dr => dr.id === previewId);
        if (!d) return null;
        const imgSrc = pdfCanvases[d.id] || (d.type === "image" ? d.data : null);
        return (
          <div onClick={() => setPreviewId(null)} style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.85)", display: "flex",
            alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}>
            <div onClick={e => e.stopPropagation()} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 8 }}>
                {d.sheetNumber || ""} {d.sheetTitle || d.label || ""}
              </div>
              {imgSrc ? (
                <img src={imgSrc} style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 8, boxShadow: "0 0 40px rgba(0,0,0,0.5)" }} />
              ) : (
                <div style={{ color: "#888", fontSize: 14 }}>No preview available</div>
              )}
              <div style={{ fontSize: 10, color: "#888", marginTop: 8 }}>Click outside to close</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Document Category Definitions ────────────────────────────────────────────
// Based on AIA/CSI construction document standards
const DOC_CATEGORIES = [
  {
    key: "drawings",
    label: "Drawings",
    description: "Architectural, structural, MEP, civil plans",
    icon: I.plans,
    color: "#4A90D9",
    docTypes: ["drawing"],
    fileHints: [".dwg", ".dxf"],
  },
  {
    key: "specifications",
    label: "Specifications",
    description: "Project manual, CSI divisions, product data",
    icon: I.file,
    color: "#8B5CF6",
    docTypes: ["specification"],
    fileHints: ["spec", "project manual", "division"],
  },
  {
    key: "bidding",
    label: "RFPs & Bidding",
    description: "Invitations to bid, bid forms, instructions",
    icon: I.send,
    color: "#E8913A",
    docTypes: ["rfp", "bidding"],
    fileHints: ["rfp", "itb", "invitation", "bid form", "proposal form"],
  },
  {
    key: "addenda",
    label: "Addenda & Bulletins",
    description: "Pre-bid modifications, ASIs, bulletins",
    icon: I.change,
    color: "#D94A4A",
    docTypes: [],
    changeTypes: ["addendum", "bulletin", "asi"],
    fileHints: ["addendum", "addenda", "bulletin", "asi"],
  },
  {
    key: "contracts",
    label: "Contracts",
    description: "Agreements, subcontracts, purchase orders",
    icon: I.estimate,
    color: "#2EAA7B",
    docTypes: ["contract"],
    fileHints: ["contract", "agreement", "subcontract", "purchase order", "po"],
  },
  {
    key: "insurance",
    label: "Insurance & Bonds",
    description: "COIs, performance bonds, payment bonds",
    icon: I.shield,
    color: "#47C1BF",
    docTypes: ["insurance"],
    fileHints: ["insurance", "coi", "bond", "surety", "certificate of insurance"],
  },
  {
    key: "permits",
    label: "Permits & Approvals",
    description: "Building permits, zoning, fire dept approvals",
    icon: I.check,
    color: "#50B83C",
    docTypes: ["permit"],
    fileHints: ["permit", "approval", "zoning", "variance"],
  },
  {
    key: "reports",
    label: "Reports & Studies",
    description: "Geotech, environmental, surveys, energy models",
    icon: I.report,
    color: "#F49342",
    docTypes: ["report"],
    fileHints: ["geotech", "environmental", "survey", "alta", "phase i", "phase ii", "report"],
  },
  {
    key: "submittals",
    label: "Submittals",
    description: "Shop drawings, product data, samples",
    icon: I.layers,
    color: "#9C6ADE",
    docTypes: ["submittal"],
    fileHints: ["submittal", "shop drawing", "product data"],
  },
  {
    key: "photos",
    label: "Photos & Renderings",
    description: "Progress photos, renderings, drone captures",
    icon: I.image,
    color: "#DE3618",
    docTypes: ["photo", "rendering"],
    fileHints: ["render", "photo", "drone", "360"],
  },
  {
    key: "schedule",
    label: "Schedules",
    description: "Construction schedule, look-aheads, procurement log",
    icon: I.calendar,
    color: "#6B7280",
    docTypes: ["schedule"],
    fileHints: ["schedule", "gantt", "look-ahead", "procurement"],
  },
  {
    key: "rules",
    label: "Building Rules & Regs",
    description: "Building-specific access, hours, logistics rules",
    icon: I.lock,
    color: "#8B95A2",
    docTypes: ["rules"],
    fileHints: ["rules", "regulations", "building rules", "tenant"],
  },
];

// Count documents per category
function countByCategory(documents, drawings) {
  const counts = {};
  for (const cat of DOC_CATEGORIES) {
    let count = 0;
    // Count by docType
    if (cat.docTypes?.length > 0) {
      count += documents.filter(d => cat.docTypes.includes(d.docType)).length;
    }
    // Count by changeType
    if (cat.changeTypes?.length > 0) {
      count += documents.filter(d => cat.changeTypes.includes(d.changeType)).length;
    }
    // Special: drawings category includes drawing store
    if (cat.key === "drawings") {
      count = Math.max(count, drawings.length);
    }
    counts[cat.key] = count;
  }
  return counts;
}


export default function DocumentsPage() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const navigate = useNavigate();
  const { id: estimateId } = useParams();
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const estId = activeEstimateId || estimateId;

  const project = useProjectStore(s => s.project);
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const documents = useDocumentManagementStore(s => s.documents);
  const removeDocument = useDocumentManagementStore(s => s.removeDocument);
  const scanProgress = useDrawingPipelineStore(s => s.scanProgress);
  const scanResults = useDrawingPipelineStore(s => s.scanResults);
  const stopScan = useDrawingPipelineStore(s => s.stopScan);
  const showToast = useUiStore(s => s.showToast);

  const [dragOver, setDragOver] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null); // null = all, or category key
  const fileInputRef = useRef(null);
  const isSetupMode = project.setupComplete === false;
  const hasProcessing = documents.some(d => d.processingStatus === "processing");
  const hasData = drawings.length > 0 || documents.length > 0;
  const isProcessing = hasProcessing || scanProgress.phase;

  const categoryCounts = useMemo(() => countByCategory(documents, drawings), [documents, drawings]);
  const totalFiles = documents.length + drawings.length;

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
            });
          }
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Upload handler
  const handleUpload = useCallback(
    async files => {
      setShowUpload(false);
      await handleFileUpload(files, {
        showToast,
        onScanComplete: () => { if (estId) navigate(`/estimate/${estId}/plans`); },
        onBidInfoReady: () => {
          const eid = useEstimatesStore.getState().activeEstimateId;
          if (eid) navigate(`/estimate/${eid}/info`);
        },
      });
    },
    [showToast, navigate, estId],
  );

  const onDragOver = e => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = e => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUpload(files);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // SETUP MODE
  // ═══════════════════════════════════════════════════════════════════════
  if (isSetupMode) {
    const handleSkip = () => {
      useProjectStore.getState().setProject({ ...useProjectStore.getState().project, setupComplete: true });
      if (estId) navigate(`/estimate/${estId}/info`);
    };

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: "100%", padding: T.space[7], fontFamily: T.font.sans,
      }}>
        <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0, marginBottom: 6 }}>
            Upload Your Construction Plans
          </h1>
          <p style={{ fontSize: 12, color: C.textDim, margin: 0, marginBottom: 28, lineHeight: 1.6 }}>
            Drop your PDF plans below and NOVA will automatically extract project details, detect schedules,
            and generate a rough order of magnitude estimate.
          </p>
          {isProcessing ? (
            <div style={{ ...card(C), padding: "24px 28px", marginBottom: 20, textAlign: "left", border: `1px solid ${C.accent}20` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Ic d={I.ai} size={18} color={C.accent} />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>NOVA is analyzing your drawings...</div>
              </div>
              {scanProgress.phase && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4 }}>
                    {scanProgress.message}
                    <span style={{ float: "right" }}>
                      {scanProgress.phase === "detect" ? "Phase 1/4" : scanProgress.phase === "notes" ? "Phase 2/4" : scanProgress.phase === "parse" ? "Phase 3/4" : "Phase 4/4"}
                    </span>
                  </div>
                  <div style={{ height: 4, background: C.bg2, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 2, transition: "width 0.3s ease",
                      background: `linear-gradient(90deg, ${C.accent}, ${C.purple || C.accent})`,
                      width: scanProgress.total > 0 ? `${Math.round((scanProgress.current / scanProgress.total) * 100)}%` : "0%",
                    }} />
                  </div>
                </div>
              )}
              {!scanProgress.phase && hasProcessing && (
                <div style={{ fontSize: 10, color: C.textDim }}>Processing uploaded documents...</div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                <div style={{ fontSize: 9, color: C.textDim }}>This may take a minute.</div>
                <button onClick={() => stopScan()} style={{
                  background: "transparent", border: `1px solid ${C.red || "#ef4444"}30`,
                  color: C.red || "#ef4444", fontSize: 9, fontWeight: 600,
                  padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontFamily: T.font.sans,
                }}>Stop</button>
              </div>
            </div>
          ) : (
            <div
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                ...card(C), padding: "40px 24px", textAlign: "center", cursor: "pointer",
                border: dragOver ? `2px dashed ${C.accent}` : `2px dashed ${C.border}`,
                background: dragOver ? `${C.accent}08` : C.glassBg, transition: "all 0.2s ease", marginBottom: 20,
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: T.radius.lg,
                background: `${C.accent}12`, display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto", marginBottom: 14,
              }}>
                <Ic d={I.upload} size={26} color={C.accent} />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {dragOver ? "Drop files here" : "Drop PDF plans here or click to browse"}
              </div>
              <div style={{ fontSize: 10, color: C.textDim }}>
                PDF drawings, specifications, addenda — any project document
              </div>
              <input ref={fileInputRef} type="file" multiple
                accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx,.ifc,.dwg,.dxf,image/*"
                style={{ display: "none" }}
                onChange={e => { handleUpload(Array.from(e.target.files || [])); e.target.value = ""; }}
              />
            </div>
          )}
          {!isProcessing && (
            <button onClick={handleSkip} style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 11, color: C.textDim, padding: "8px 16px", fontFamily: T.font.sans,
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
  // NORMAL MODE: Category cards + DocumentsPanel
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <div
      style={{ padding: T.space[6], minHeight: "100%", fontFamily: T.font.sans }}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
    >
      {/* Global drag overlay */}
      {dragOver && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: `${C.accent}10`, backdropFilter: "blur(2px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `3px dashed ${C.accent}`,
        }}>
          <div style={{ textAlign: "center" }}>
            <Ic d={I.upload} size={48} color={C.accent} />
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 12 }}>Drop files to upload</div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 1100 }}>
        {/* ── Header ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: T.space[5],
        }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0, marginBottom: 2 }}>
              Documents
            </h1>
            <p style={{ fontSize: 11, color: C.textDim, margin: 0 }}>
              {totalFiles > 0 ? `${totalFiles} files uploaded` : "Upload and organize your project files"}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Upload button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: T.radius.md,
                background: C.accent, color: "#fff", border: "none",
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                fontFamily: T.font.sans, transition: "opacity 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
              <Ic d={I.upload} size={13} color="#fff" />
              Upload Files
            </button>
            <input ref={fileInputRef} type="file" multiple
              accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.doc,.docx,.xls,.xlsx,.ifc,.dwg,.dxf,image/*"
              style={{ display: "none" }}
              onChange={e => { handleUpload(Array.from(e.target.files || [])); e.target.value = ""; }}
            />
            {/* View Scan Results */}
            {scanResults && (
              <button
                onClick={() => navigate(`/estimate/${estId}/plans`)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: T.radius.md,
                  background: `${C.accent}12`, color: C.accent, border: `1px solid ${C.accent}25`,
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  fontFamily: T.font.sans, transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${C.accent}20`; }}
                onMouseLeave={e => { e.currentTarget.style.background = `${C.accent}12`; }}
              >
                <Ic d={I.ai} size={13} color={C.accent} />
                NOVA Scan Results
              </button>
            )}
          </div>
        </div>

        {/* ── Scan Progress ── */}
        {isProcessing && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 16px", marginBottom: T.space[4],
            borderRadius: T.radius.md, background: `${C.accent}06`,
            border: `1px solid ${C.accent}15`,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%", background: C.accent,
              animation: "pulse 1.5s ease infinite",
            }} />
            <div style={{ flex: 1, fontSize: 11, fontWeight: 500, color: C.text }}>
              {scanProgress.phase ? `NOVA scanning... ${scanProgress.message || ""}` : "Processing documents..."}
            </div>
            {scanProgress.total > 0 && (
              <span style={{ fontSize: 10, fontWeight: 600, color: C.accent }}>
                {Math.round((scanProgress.current / scanProgress.total) * 100)}%
              </span>
            )}
            <button onClick={() => stopScan()} style={{
              background: "transparent", border: `1px solid ${C.red || "#ef4444"}25`,
              color: C.red || "#ef4444", fontSize: 9, fontWeight: 600,
              padding: "3px 10px", borderRadius: T.radius.sm, cursor: "pointer", fontFamily: T.font.sans,
            }}>Stop</button>
          </div>
        )}

        {/* ── Category Cards Grid ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))",
          gap: 8,
          marginBottom: T.space[5],
        }}>
          {/* "All" card */}
          <button
            onClick={() => setActiveCategory(null)}
            className="ghost-btn"
            style={{
              display: "flex", flexDirection: "column", gap: 6,
              padding: "12px 14px", borderRadius: T.radius.md,
              background: activeCategory === null
                ? (dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)")
                : C.bg1,
              border: activeCategory === null
                ? `1px solid ${C.accent}30`
                : `1px solid ${C.border}`,
              cursor: "pointer", textAlign: "left",
              fontFamily: T.font.sans, transition: "all 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Ic d={I.folder} size={16} color={activeCategory === null ? C.accent : C.textDim} />
              {totalFiles > 0 && (
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{totalFiles}</span>
              )}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: activeCategory === null ? C.text : C.textMuted }}>
              All Files
            </div>
          </button>

          {/* Category cards */}
          {DOC_CATEGORIES.map(cat => {
            const count = categoryCounts[cat.key] || 0;
            const isActive = activeCategory === cat.key;

            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(isActive ? null : cat.key)}
                className="ghost-btn"
                style={{
                  display: "flex", flexDirection: "column", gap: 6,
                  padding: "12px 14px", borderRadius: T.radius.md,
                  background: isActive
                    ? `${cat.color}08`
                    : C.bg1,
                  border: isActive
                    ? `1px solid ${cat.color}30`
                    : `1px solid ${C.border}`,
                  cursor: "pointer", textAlign: "left",
                  fontFamily: T.font.sans, transition: "all 0.15s",
                  opacity: count === 0 && !isActive ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Ic d={cat.icon} size={16} color={isActive ? cat.color : C.textDim} />
                  {count > 0 && (
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: isActive ? cat.color : C.text,
                    }}>{count}</span>
                  )}
                </div>
                <div>
                  <div style={{
                    fontSize: 10, fontWeight: 600,
                    color: isActive ? cat.color : C.textMuted,
                    marginBottom: 1,
                  }}>{cat.label}</div>
                  <div style={{ fontSize: 8, color: C.textDim, lineHeight: 1.3 }}>
                    {cat.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Empty state (no files at all) ── */}
        {!hasData && (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              ...card(C), padding: "48px 24px", textAlign: "center", cursor: "pointer",
              border: `2px dashed ${C.border}`, background: C.glassBg,
              transition: "all 0.2s ease", marginBottom: T.space[5],
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.background = `${C.accent}04`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.glassBg; }}
          >
            <Ic d={I.upload} size={32} color={C.textDim} />
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 12, marginBottom: 4 }}>
              No documents yet
            </div>
            <div style={{ fontSize: 11, color: C.textDim }}>
              Click here or drag files anywhere on this page to upload
            </div>
          </div>
        )}

        {/* ── Documents Panel (filtered by active category) ── */}
        {hasData && <DocumentsPanel onRemove={removeDocument} categoryFilter={activeCategory} />}

        {/* ── Drawing Index ── */}
        {drawings.length > 0 && <DrawingIndex />}
      </div>

      {/* Pulse animation for scan indicator */}
      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
    </div>
  );
}
