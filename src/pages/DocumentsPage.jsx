import { useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useDocumentsStore } from '@/stores/documentsStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUiStore } from '@/stores/uiStore';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useInboxStore } from '@/stores/inboxStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import { bt, pageContainer, card, sectionLabel } from '@/utils/styles';

const FILE_ICONS = {
  "application/pdf": I.plans,
  "image/png": I.plans,
  "image/jpeg": I.plans,
  "image/gif": I.plans,
};

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fileExtension(filename) {
  if (!filename) return "";
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop().toUpperCase() : "";
}

export default function DocumentsPage() {
  const C = useTheme();
  const T = C.T;
  const showToast = useUiStore(s => s.showToast);
  const project = useProjectStore(s => s.project);
  const documents = useDocumentsStore(s => s.documents);
  const addDocument = useDocumentsStore(s => s.addDocument);
  const removeDocument = useDocumentsStore(s => s.removeDocument);
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const fileInputRef = useRef(null);

  const API_BASE = import.meta.env.DEV
    ? "https://app-nova-42373ca7.vercel.app"
    : "";

  const rfpDocs = documents.filter(d => d.source === "rfp");
  const uploadedDocs = documents.filter(d => d.source === "upload");

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        addDocument({
          filename: file.name,
          contentType: file.type,
          size: file.size,
          source: "upload",
          data: reader.result,
        });
        showToast(`Added ${file.name}`);
      };
      reader.readAsDataURL(file);
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownloadRfpDoc = async (doc) => {
    if (!doc.storagePath) {
      showToast("No download path available");
      return;
    }
    try {
      const url = `${API_BASE}/api/attachment?path=${encodeURIComponent(doc.storagePath)}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Download failed");
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      showToast("Download failed: " + err.message);
    }
  };

  const handleDownloadUploadedDoc = (doc) => {
    if (!doc.data) {
      showToast("No file data available");
      return;
    }
    const a = document.createElement("a");
    a.href = doc.data;
    a.download = doc.filename;
    a.click();
  };

  const handleDownload = (doc) => {
    if (doc.source === "rfp") {
      handleDownloadRfpDoc(doc);
    } else {
      handleDownloadUploadedDoc(doc);
    }
  };

  const DocRow = ({ doc }) => {
    const ext = fileExtension(doc.filename);
    const iconPath = FILE_ICONS[doc.contentType] || I.folder;

    return (
      <div style={{
        display: "flex", alignItems: "center", gap: T.space[3],
        padding: `${T.space[3]}px ${T.space[4]}px`,
        borderBottom: `1px solid ${C.border}`,
        transition: T.transition.fast,
      }}
        onMouseEnter={e => e.currentTarget.style.background = C.bg1}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      >
        {/* File type badge */}
        <div style={{
          width: 40, height: 40, borderRadius: T.radius.sm,
          background: `${C.accent}12`, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {ext ? (
            <span style={{
              fontSize: 10, fontWeight: T.fontWeight.bold,
              color: C.accent, letterSpacing: "0.02em",
            }}>{ext}</span>
          ) : (
            <Ic d={iconPath} size={18} color={C.accent} />
          )}
        </div>

        {/* File info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: T.fontSize.sm, fontWeight: T.fontWeight.medium, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {doc.filename}
          </div>
          <div style={{ fontSize: T.fontSize.xs, color: C.textDim, marginTop: 2 }}>
            {formatBytes(doc.size)}
            {doc.source === "rfp" && (
              <span style={{
                marginLeft: T.space[2], padding: "1px 6px", borderRadius: T.radius.sm,
                background: `${C.accent}12`, color: C.accent, fontSize: 10,
              }}>RFP</span>
            )}
            {doc.uploadDate && (
              <span style={{ marginLeft: T.space[2] }}>
                {new Date(doc.uploadDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: T.space[2], flexShrink: 0 }}>
          <button
            style={bt(C, {
              padding: "6px 12px", fontSize: T.fontSize.xs,
              background: "transparent", color: C.textMuted,
              border: `1px solid ${C.border}`,
            })}
            onClick={() => handleDownload(doc)}
            title="Download"
          >
            <Ic d={I.download} size={14} color={C.textMuted} />
          </button>
          <button
            style={bt(C, {
              padding: "6px 12px", fontSize: T.fontSize.xs,
              background: "transparent", color: C.textDim,
              border: `1px solid ${C.border}`,
            })}
            onClick={() => {
              removeDocument(doc.id);
              showToast(`Removed ${doc.filename}`);
            }}
            title="Remove"
          >
            <Ic d={I.trash} size={14} color={C.textDim} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={pageContainer(C)}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[5] }}>
          <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
            <Ic d={I.folder} size={22} color={C.accent} />
            <h1 style={{ fontSize: T.fontSize.xl, fontWeight: T.fontWeight.bold, color: C.text, margin: 0 }}>
              Documents
            </h1>
            {documents.length > 0 && (
              <span style={{
                fontSize: T.fontSize.xs, color: C.textDim,
                padding: "2px 8px", borderRadius: T.radius.full,
                background: C.bg1,
              }}>
                {documents.length} file{documents.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            style={bt(C, {
              padding: "8px 16px", fontSize: T.fontSize.sm,
              background: C.accent, color: "#fff",
              display: "flex", alignItems: "center", gap: T.space[2],
            })}
            onClick={() => fileInputRef.current?.click()}
          >
            <Ic d={I.plus} size={14} color="#fff" />
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={handleUpload}
          />
        </div>

        {/* RFP Attachments section */}
        {rfpDocs.length > 0 && (
          <div style={{ marginBottom: T.space[5] }}>
            <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>
              RFP Attachments
            </div>
            <div style={{
              ...card(C), overflow: "hidden", padding: 0,
            }}>
              {rfpDocs.map(doc => <DocRow key={doc.id} doc={doc} />)}
            </div>
          </div>
        )}

        {/* Uploaded Documents section */}
        {uploadedDocs.length > 0 && (
          <div style={{ marginBottom: T.space[5] }}>
            <div style={{ ...sectionLabel(C), marginBottom: T.space[3] }}>
              Uploaded Documents
            </div>
            <div style={{
              ...card(C), overflow: "hidden", padding: 0,
            }}>
              {uploadedDocs.map(doc => <DocRow key={doc.id} doc={doc} />)}
            </div>
          </div>
        )}

        {/* Empty state */}
        {documents.length === 0 && (
          <div style={{
            textAlign: "center", padding: T.space[7],
            ...card(C), border: `2px dashed ${C.border}`,
          }}>
            <Ic d={I.folder} size={32} color={C.textDim} />
            <div style={{ color: C.textMuted, marginTop: T.space[3], fontSize: T.fontSize.sm }}>
              No documents yet
            </div>
            <div style={{ color: C.textDim, marginTop: T.space[2], fontSize: T.fontSize.xs }}>
              Upload project documents or import an RFP with attachments
            </div>
            <button
              style={bt(C, {
                padding: "8px 16px", fontSize: T.fontSize.sm,
                background: C.accent, color: "#fff", marginTop: T.space[4],
                display: "inline-flex", alignItems: "center", gap: T.space[2],
              })}
              onClick={() => fileInputRef.current?.click()}
            >
              <Ic d={I.plus} size={14} color="#fff" />
              Upload Documents
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
