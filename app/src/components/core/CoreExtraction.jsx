// CoreExtraction — PDF extraction pipeline tab
// Drag-and-drop upload, queue display, extraction results

import { useState, useCallback, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import useExtractionStore from "@/stores/extractionStore";
import { useUiStore } from "@/stores/uiStore";
import { extractProposal, extractProposalBatch } from "@/utils/proposalExtractor";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

function statusLabel(status) {
  switch (status) {
    case "pending": return "Queued";
    case "uploading": return "Uploading...";
    case "converting": return "Converting PDF...";
    case "classifying": return "Classifying...";
    case "extracting": return "Extracting data...";
    case "normalizing": return "Normalizing...";
    case "done": return "Complete";
    case "error": return "Failed";
    default: return status;
  }
}

function statusColor(status, C) {
  if (status === "done") return "#34D399";
  if (status === "error") return "#F87171";
  if (status === "pending") return C.textMuted;
  return C.accent;
}

export default function CoreExtraction() {
  const C = useTheme();
  const T = C.T;
  const queue = useExtractionStore(s => s.queue);
  const results = useExtractionStore(s => s.results);
  const clearCompleted = useExtractionStore(s => s.clearCompleted);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const MAX_FILE_SIZE = 35 * 1024 * 1024; // 35 MB

  const handleFiles = useCallback((files) => {
    const pdfs = Array.from(files).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    if (pdfs.length === 0) return;

    // Client-side file size check
    const oversized = pdfs.filter(f => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      const names = oversized.map(f => f.name).join(", ");
      const sizeMB = Math.round(oversized[0].size / 1024 / 1024);
      useUiStore.getState().showToast(
        `File${oversized.length > 1 ? "s" : ""} too large (max 35 MB): ${names} (${sizeMB} MB)`,
        "error"
      );
      // Filter out oversized files and continue with the rest
      const valid = pdfs.filter(f => f.size <= MAX_FILE_SIZE);
      if (valid.length === 0) return;
      if (valid.length === 1) {
        extractProposal(valid[0]);
      } else {
        extractProposalBatch(valid);
      }
      return;
    }

    if (pdfs.length === 1) {
      extractProposal(pdfs[0]);
    } else {
      extractProposalBatch(pdfs);
    }
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const completedCount = queue.filter(e => e.status === "done" || e.status === "error").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Drop Zone ── */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: "40px 24px",
          borderRadius: T.radius.lg,
          border: `2px dashed ${dragOver ? C.accent : C.border}`,
          background: dragOver ? `${C.accent}08` : C.bg2,
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
        <div style={{
          width: 48, height: 48, borderRadius: 14,
          background: `${C.accent}12`, display: "flex",
          alignItems: "center", justifyContent: "center",
          margin: "0 auto 12px",
        }}>
          <Ic path={I.upload} size={22} color={C.accent} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>
          Drop proposal PDFs here
        </div>
        <div style={{ fontSize: 12, color: C.textMuted }}>
          or click to browse — supports single or batch upload
        </div>
      </div>

      {/* ── Queue ── */}
      {queue.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              Extraction Queue
              <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 500, marginLeft: 8 }}>
                {queue.length} item{queue.length !== 1 ? "s" : ""}
              </span>
            </div>
            {completedCount > 0 && (
              <button
                onClick={clearCompleted}
                style={{
                  fontSize: 11, fontWeight: 500, color: C.textMuted,
                  background: "none", border: "none", cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Clear completed
              </button>
            )}
          </div>

          {queue.map(entry => (
            <div key={entry.id} style={{
              padding: "12px 16px", borderRadius: T.radius.md,
              background: C.bg2, border: `1px solid ${C.border}`,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: 4,
                background: statusColor(entry.status, C),
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: C.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {entry.fileName}
                </div>
                <div style={{ fontSize: 11, color: statusColor(entry.status, C), marginTop: 2 }}>
                  {statusLabel(entry.status)}
                  {entry.error && <span style={{ color: "#F87171", marginLeft: 6 }}>{entry.error}</span>}
                </div>
              </div>
              {entry.status !== "done" && entry.status !== "error" && entry.status !== "pending" && (
                <div style={{
                  width: 60, height: 4, borderRadius: 2,
                  background: `${C.accent}20`, overflow: "hidden",
                }}>
                  <div style={{
                    width: `${entry.progress || 0}%`, height: "100%",
                    background: C.accent, borderRadius: 2,
                    transition: "width 0.3s",
                  }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Results ── */}
      {Object.keys(results).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            Extracted Results
          </div>

          {Object.entries(results).map(([id, r]) => {
            const cls = r.classification || {};
            const parsed = r.parsedData || {};
            const company = parsed.companyName || parsed.subcontractorName || parsed.vendorName || cls.companyName || "Unknown";
            const project = parsed.projectName || cls.projectName || "Untitled";
            const total = parsed.totalBid || cls.totalBid;
            const items = parsed.lineItems || [];
            const count = r.lineItemCount || items.length;

            return (
              <div key={id} style={{
                padding: "16px 20px", borderRadius: T.radius.md,
                background: C.bg2, border: `1px solid ${C.border}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  {cls.documentType && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
                      padding: "2px 8px", borderRadius: 8,
                      background: `${C.accent}14`, color: C.accent,
                      textTransform: "uppercase",
                    }}>
                      {cls.documentType}
                    </span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{project}</span>
                </div>

                <div style={{ fontSize: 12, color: C.textDim, marginBottom: 4 }}>
                  {company}
                </div>

                {total != null && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                    ${typeof total === "number" ? total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : total}
                  </div>
                )}

                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8 }}>
                  {count} line item{count !== 1 ? "s" : ""} extracted
                </div>

                {items.length > 0 && (
                  <div style={{
                    borderTop: `1px solid ${C.border}`, paddingTop: 8,
                    display: "flex", flexDirection: "column", gap: 4,
                  }}>
                    {items.slice(0, 5).map((li, i) => (
                      <div key={i} style={{
                        fontSize: 11, color: C.textDim,
                        display: "flex", justifyContent: "space-between", gap: 12,
                      }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {li.description || li.name || `Item ${i + 1}`}
                        </span>
                        {li.totalCost != null && (
                          <span style={{ flexShrink: 0, fontWeight: 500 }}>
                            ${Number(li.totalCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                      </div>
                    ))}
                    {items.length > 5 && (
                      <div style={{ fontSize: 10, color: C.textMuted, fontStyle: "italic" }}>
                        + {items.length - 5} more
                      </div>
                    )}
                  </div>
                )}

                <div style={{
                  fontSize: 10, color: C.textMuted, marginTop: 10,
                  fontStyle: "italic", opacity: 0.7,
                }}>
                  Saved to ingestion queue — review in Admin &rarr; Unit Rates
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Empty State ── */}
      {queue.length === 0 && Object.keys(results).length === 0 && (
        <div style={{
          padding: "48px 24px", textAlign: "center",
          borderRadius: T.radius.lg, background: C.bg2,
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.textDim, marginBottom: 6 }}>
            No extractions yet
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, maxWidth: 360, margin: "0 auto", lineHeight: 1.5 }}>
            Upload proposal PDFs to extract project data, line items, and pricing.
            Results feed directly into NOVA's cost intelligence.
          </div>
        </div>
      )}
    </div>
  );
}
