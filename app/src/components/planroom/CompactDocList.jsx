import { useState } from "react";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { card } from "@/utils/styles";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function CompactDocList({ drawingDocs, specDocs, generalDocs, onRemove, C, T }) {
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
