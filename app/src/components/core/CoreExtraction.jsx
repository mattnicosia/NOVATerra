// CoreExtraction — PDF extraction pipeline tab
// Drag-and-drop upload, queue display, inline line item review

import { useState, useCallback, useRef } from "react";
import { useTheme } from "@/hooks/useTheme";
import useExtractionStore from "@/stores/extractionStore";
import { useUiStore } from "@/stores/uiStore";
import { useDatabaseStore } from "@/stores/databaseStore";
import { saveUserLibrary } from "@/hooks/usePersistence";
import { extractProposal, extractProposalBatch } from "@/utils/proposalExtractor";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

function statusLabel(status, statusMessage) {
  // Prefer live statusMessage from streaming events when available
  if (statusMessage && status !== "done" && status !== "error" && status !== "pending") return statusMessage;
  switch (status) {
    case "pending": return "Queued";
    case "uploading": return "Reading PDF...";
    case "sending": return "Uploading to server...";
    case "processing": return "Processing...";
    case "ocr": return "Running OCR on PDF...";
    case "ocr_done": return "OCR complete";
    case "classifying": return "Identifying document type...";
    case "classified": return "Document classified";
    case "extracting": return "Extracting line items...";
    case "saving": return "Saving to database...";
    case "done": return statusMessage || "Complete";
    case "error": return "Failed";
    default: return statusMessage || status || "Processing...";
  }
}

function statusColor(status, C) {
  if (status === "done") return "#34D399";
  if (status === "error") return "#F87171";
  if (status === "pending") return C.textMuted;
  return C.accent;
}

// ── Line item inline review component ──

// Find similar items in the cost database for dedup warnings
function findDbMatches(item, elements) {
  const desc = (item.description || "").toLowerCase();
  const unit = (item.unit || "").toUpperCase();
  const price = parseFloat(item.unitPrice) || 0;
  const csi = (item.csiCode || "").substring(0, 2);
  const matches = [];

  for (const el of elements) {
    const elName = (el.name || "").toLowerCase();
    const elUnit = (el.unit || "").toUpperCase();
    const elPrice = parseFloat(el.unitCost) || 0;
    const elCsi = (el.code || "").substring(0, 2);

    // Exact match: same name + unit
    if (elName === desc && elUnit === unit) {
      matches.push({ type: "exact", element: el, priceDiff: price - elPrice });
      continue;
    }
    // Fuzzy: same CSI division + same unit + price within 30%
    if (csi && csi === elCsi && elUnit === unit && elPrice > 0 && price > 0) {
      const ratio = Math.abs(price - elPrice) / elPrice;
      if (ratio < 0.3) {
        matches.push({ type: "similar", element: el, priceDiff: price - elPrice });
      }
    }
  }
  return matches;
}

function ExtractionResult({ id, result, C, T }) {
  const cls = result.classification || {};
  const parsed = result.parsedData || {};
  const company = parsed.companyName || parsed.subcontractorName || parsed.vendorName || cls.companyName || "Unknown";
  const project = parsed.projectName || cls.projectName || "Untitled";
  const total = parsed.totalBid || cls.totalBid;
  const items = parsed.lineItems || [];
  const dbElements = useDatabaseStore(s => s.elements);

  // Per-item decision state: { [index]: { status: "accepted"|"rejected"|null, edits: {...} } }
  const [decisions, setDecisions] = useState({});
  const [editingIdx, setEditingIdx] = useState(null);
  const [pushed, setPushed] = useState(false);

  const fmtMoney = (v) => {
    const n = Number(v);
    return isNaN(n) ? v : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getItem = (idx) => {
    const base = items[idx];
    const edits = decisions[idx]?.edits || {};
    return { ...base, ...edits };
  };

  const setDecision = (idx, status) => {
    setDecisions(prev => ({
      ...prev,
      [idx]: { ...prev[idx], status },
    }));
  };

  const setEdit = (idx, field, value) => {
    setDecisions(prev => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        edits: { ...(prev[idx]?.edits || {}), [field]: value },
      },
    }));
  };

  const acceptedItems = items
    .map((_, i) => i)
    .filter(i => decisions[i]?.status === "accepted");

  const handleAcceptAll = () => {
    const next = { ...decisions };
    items.forEach((_, i) => {
      if (!next[i]?.status) next[i] = { ...next[i], status: "accepted" };
    });
    setDecisions(next);
  };

  const handleRejectAll = () => {
    const next = { ...decisions };
    items.forEach((_, i) => {
      if (!next[i]?.status) next[i] = { ...next[i], status: "rejected" };
    });
    setDecisions(next);
  };

  const handlePushAccepted = () => {
    const store = useDatabaseStore.getState();
    let count = 0;
    let skipped = 0;
    for (const idx of acceptedItems) {
      const item = getItem(idx);
      // Check for exact duplicate (same description + unit)
      const isDupe = store.elements.some(
        e => (e.name || "").toLowerCase() === (item.description || "").toLowerCase() && e.unit === (item.unit || "").toUpperCase()
      );
      if (isDupe) { skipped++; continue; }

      store.addElement({
        code: item.csiCode || "00.0000",
        name: item.description || `Item ${idx + 1}`,
        unit: (item.unit || "EA").toUpperCase(),
        unitCost: parseFloat(item.unitPrice) || 0,
        source: `Extracted: ${company}`,
        batchApproved: true,
        ...(item.notes ? { notes: item.notes } : {}),
      });
      count++;
    }
    saveUserLibrary();
    setPushed(true);
    const msg = skipped > 0
      ? `${count} added, ${skipped} skipped (already in database)`
      : `${count} unit rate${count !== 1 ? "s" : ""} added to cost database`;
    useUiStore.getState().showToast(msg, "success");
  };

  const typeLabels = { gc_proposal: "GC Proposal", sub_proposal: "Sub Proposal", vendor_quote: "Vendor Quote" };

  // Cell style helpers
  const cellBase = { fontSize: 11, padding: "8px 10px", borderBottom: `1px solid ${C.border}33` };
  const headerCell = { ...cellBase, fontWeight: 600, color: C.textMuted, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", padding: "10px 10px 8px" };
  const inputStyle = {
    background: `${C.bg3 || C.bg2}`, border: `1px solid ${C.accent}44`,
    borderRadius: 4, padding: "4px 8px", fontSize: 11, color: C.text,
    width: "100%", outline: "none",
  };

  // Action button helper
  const actionBtn = (label, color, bgColor, active, onClick, extraStyle = {}) => (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
      display: "flex", alignItems: "center", gap: 4,
      color: active ? "#000" : color,
      background: active ? color : bgColor,
      border: `1px solid ${active ? color : color + "33"}`,
      transition: "all 0.15s",
      ...extraStyle,
    }}>
      {label}
    </button>
  );

  return (
    <div style={{
      borderRadius: T.radius.md, background: C.bg2,
      border: `1px solid ${C.border}`, overflow: "hidden",
    }}>
      {/* ── Header ── */}
      <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          {cls.documentType && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
              padding: "3px 10px", borderRadius: 8,
              background: `${C.accent}14`, color: C.accent,
              textTransform: "uppercase",
            }}>
              {typeLabels[cls.documentType] || cls.documentType}
            </span>
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{project}</span>
          {total != null && (
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text, marginLeft: "auto" }}>
              {fmtMoney(total)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: C.textDim }}>
          {company}
          <span style={{ color: C.textMuted, marginLeft: 12 }}>
            {items.length} line item{items.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── Line items table ── */}
      {items.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          {/* Bulk actions bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 20px", borderBottom: `1px solid ${C.border}`,
            background: `${C.bg3 || C.bg2}`,
          }}>
            {actionBtn("Accept All", "#34D399", "rgba(52,211,153,0.08)", false, handleAcceptAll)}
            {actionBtn("Reject All", "#F87171", "rgba(248,113,113,0.08)", false, handleRejectAll)}

            <div style={{ flex: 1 }} />

            {acceptedItems.length > 0 && !pushed && (
              <button onClick={handlePushAccepted} style={{
                fontSize: 12, fontWeight: 700, color: "#000", background: C.accent,
                border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer",
                boxShadow: `0 2px 8px ${C.accent}44`,
                transition: "all 0.15s",
              }}>
                Add {acceptedItems.length} Unit Rate{acceptedItems.length !== 1 ? "s" : ""} to Cost Database
              </button>
            )}
            {pushed && (
              <span style={{ fontSize: 12, fontWeight: 600, color: "#34D399" }}>
                Added to database
              </span>
            )}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: `${C.bg3 || C.bg2}55` }}>
                <th style={{ ...headerCell, width: 50, textAlign: "center" }}>Status</th>
                <th style={{ ...headerCell, textAlign: "left", minWidth: 200 }}>Description</th>
                <th style={{ ...headerCell, textAlign: "left", width: 80 }}>CSI</th>
                <th style={{ ...headerCell, textAlign: "right", width: 60 }}>Qty</th>
                <th style={{ ...headerCell, textAlign: "left", width: 50 }}>Unit</th>
                <th style={{ ...headerCell, textAlign: "right", width: 90 }}>Unit Price</th>
                <th style={{ ...headerCell, textAlign: "right", width: 100 }}>Amount</th>
                <th style={{ ...headerCell, width: 180, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((li, idx) => {
                const item = getItem(idx);
                const decision = decisions[idx]?.status;
                const isEditing = editingIdx === idx;
                const dbMatches = findDbMatches(item, dbElements);
                const hasExact = dbMatches.some(m => m.type === "exact");
                const hasSimilar = dbMatches.some(m => m.type === "similar");
                const rowBg = decision === "accepted" ? "rgba(52,211,153,0.06)"
                  : decision === "rejected" ? "rgba(248,113,113,0.06)" : "transparent";

                return (
                  <tr key={idx} style={{ background: rowBg, transition: "background 0.15s" }}>
                    {/* Status */}
                    <td style={{ ...cellBase, textAlign: "center", width: 50 }}>
                      {decision === "accepted" && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 22, height: 22, borderRadius: 12, background: "rgba(52,211,153,0.15)",
                          color: "#34D399", fontSize: 13, fontWeight: 700,
                        }}>✓</span>
                      )}
                      {decision === "rejected" && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 22, height: 22, borderRadius: 12, background: "rgba(248,113,113,0.15)",
                          color: "#F87171", fontSize: 13, fontWeight: 700,
                        }}>✗</span>
                      )}
                      {!decision && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 22, height: 22, borderRadius: 12, background: `${C.border}`,
                          color: C.textMuted, fontSize: 9, fontWeight: 600,
                        }}>{idx + 1}</span>
                      )}
                    </td>

                    {/* Description + dedup warning */}
                    <td style={{ ...cellBase, color: C.text, maxWidth: 300 }}>
                      {isEditing ? (
                        <input style={inputStyle} value={item.description || ""} onChange={e => setEdit(idx, "description", e.target.value)} />
                      ) : (
                        <div>
                          <span style={{
                            display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            ...(decision === "rejected" ? { textDecoration: "line-through", opacity: 0.5 } : {}),
                          }}>
                            {item.description || `Item ${idx + 1}`}
                          </span>
                          {hasExact && (
                            <div style={{
                              fontSize: 10, color: "#F59E0B", marginTop: 3, display: "flex", alignItems: "center", gap: 4,
                            }}>
                              <span style={{ fontSize: 12 }}>⚠</span>
                              Exact match exists in database
                              {dbMatches.filter(m => m.type === "exact").map((m, i) => (
                                <span key={i} style={{ color: C.textMuted, marginLeft: 4 }}>
                                  (current: {fmtMoney(m.element.unitCost)}, diff: {m.priceDiff >= 0 ? "+" : ""}{fmtMoney(m.priceDiff)})
                                </span>
                              ))}
                            </div>
                          )}
                          {!hasExact && hasSimilar && (
                            <div style={{
                              fontSize: 10, color: "#60A5FA", marginTop: 3, display: "flex", alignItems: "center", gap: 4,
                            }}>
                              <span style={{ fontSize: 12 }}>ℹ</span>
                              Similar item: {dbMatches.find(m => m.type === "similar").element.name}
                              <span style={{ color: C.textMuted, marginLeft: 4 }}>
                                ({fmtMoney(dbMatches.find(m => m.type === "similar").element.unitCost)}/{dbMatches.find(m => m.type === "similar").element.unit})
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* CSI Code */}
                    <td style={{ ...cellBase, color: C.textDim }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: 70 }} value={item.csiCode || ""} onChange={e => setEdit(idx, "csiCode", e.target.value)} placeholder="00.0000" />
                      ) : (
                        <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 10 }}>
                          {item.csiCode || "—"}
                        </span>
                      )}
                    </td>

                    {/* Qty */}
                    <td style={{ ...cellBase, textAlign: "right", color: C.text }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: 50, textAlign: "right" }} type="number" value={item.quantity ?? ""} onChange={e => setEdit(idx, "quantity", e.target.value)} />
                      ) : (
                        item.quantity != null ? Number(item.quantity).toLocaleString() : "—"
                      )}
                    </td>

                    {/* Unit */}
                    <td style={{ ...cellBase, color: C.textDim }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: 40 }} value={item.unit || ""} onChange={e => setEdit(idx, "unit", e.target.value)} />
                      ) : (
                        (item.unit || "—").toUpperCase()
                      )}
                    </td>

                    {/* Unit Price */}
                    <td style={{ ...cellBase, textAlign: "right", color: C.text, fontWeight: 600, fontSize: 12 }}>
                      {isEditing ? (
                        <input style={{ ...inputStyle, width: 70, textAlign: "right" }} type="number" step="0.01" value={item.unitPrice ?? ""} onChange={e => setEdit(idx, "unitPrice", e.target.value)} />
                      ) : (
                        item.unitPrice != null ? fmtMoney(item.unitPrice) : "—"
                      )}
                    </td>

                    {/* Amount */}
                    <td style={{ ...cellBase, textAlign: "right", color: C.textDim, fontWeight: 500 }}>
                      {item.amount != null ? fmtMoney(item.amount) : "—"}
                    </td>

                    {/* Actions — clear labeled buttons */}
                    <td style={{ ...cellBase, textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                        {actionBtn(
                          decision === "accepted" ? "Accepted" : "Accept",
                          "#34D399", "rgba(52,211,153,0.08)",
                          decision === "accepted",
                          () => setDecision(idx, decision === "accepted" ? null : "accepted"),
                          { fontSize: 10, padding: "3px 8px" }
                        )}
                        {actionBtn(
                          decision === "rejected" ? "Rejected" : "Reject",
                          "#F87171", "rgba(248,113,113,0.08)",
                          decision === "rejected",
                          () => setDecision(idx, decision === "rejected" ? null : "rejected"),
                          { fontSize: 10, padding: "3px 8px" }
                        )}
                        <button
                          onClick={() => setEditingIdx(isEditing ? null : idx)}
                          style={{
                            fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, cursor: "pointer",
                            color: isEditing ? "#000" : C.accent,
                            background: isEditing ? C.accent : `${C.accent}11`,
                            border: `1px solid ${isEditing ? C.accent : C.accent + "33"}`,
                            transition: "all 0.15s",
                          }}
                        >{isEditing ? "Done" : "Edit"}</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items.length === 0 && (
        <div style={{ padding: "16px", fontSize: 11, color: C.textMuted, fontStyle: "italic" }}>
          No line items extracted from this document
        </div>
      )}
    </div>
  );
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
                <div style={{ fontSize: 11, color: statusColor(entry.status, C), marginTop: 2, transition: "all 0.2s" }}>
                  {statusLabel(entry.status, entry.statusMessage)}
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

      {/* ── Results with inline review ── */}
      {Object.keys(results).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            Extracted Results
          </div>

          {Object.entries(results).map(([id, r]) => (
            <ExtractionResult key={id} id={id} result={r} C={C} T={T} />
          ))}
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
