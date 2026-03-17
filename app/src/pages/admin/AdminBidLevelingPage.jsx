// ============================================================
// NOVA Core — Bid Leveling Dashboard
// /admin/bid-leveling
//
// Two views:
//   1. Parse jobs list — parser_audit_log entries, sorted by date
//   2. Line review — bid_leveling_queue rows for a selected job
//
// GC can Accept / Modify / Reject individual lines.
// Bulk accept processes all pending lines above confidence threshold.
// ============================================================

import { useState, useCallback } from "react";
import { useAdminFetch } from "@/hooks/useAdminFetch";

const CONFIDENCE_COLORS = {
  high: "#639922",   // green — ≥0.80
  mid: "#BA7517",    // amber — 0.60–0.79
  low: "#A63030",    // red   — <0.60
};

function confidenceBand(score) {
  if (score >= 0.80) return "high";
  if (score >= 0.60) return "mid";
  return "low";
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDollars(n) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AdminBidLevelingPage() {
  const [selectedJobId, setSelectedJobId] = useState(null);

  if (selectedJobId) {
    return <LineReviewView jobId={selectedJobId} onBack={() => setSelectedJobId(null)} />;
  }

  return <JobListView onSelectJob={setSelectedJobId} />;
}

// ── Parse Jobs List View ──

function JobListView({ onSelectJob }) {
  const { data, loading, error, refetch } = useAdminFetch("nova-bid-leveling");
  const jobs = data?.jobs || [];

  if (loading) return <div style={S.msg}>Loading parse jobs...</div>;
  if (error) return <div style={{ ...S.msg, color: "#A63030" }}>Error: {error}</div>;

  return (
    <div>
      <div style={S.header}>
        <div>
          <h2 style={S.title}>Bid Leveling</h2>
          <p style={S.subtitle}>{jobs.length} parse job{jobs.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={refetch} style={S.refreshBtn}>Refresh</button>
      </div>

      {jobs.length === 0 ? (
        <div style={S.empty}>No proposals parsed yet. Proposals emailed to bids@novaterra.ai will appear here.</div>
      ) : (
        <div style={S.table}>
          <div style={S.tableHeader}>
            <span style={{ ...S.th, flex: "0 0 140px" }}>Date</span>
            <span style={{ ...S.th, flex: "1 1 180px" }}>Sub Company</span>
            <span style={{ ...S.th, flex: "0 0 60px", textAlign: "right" }}>Lines</span>
            <span style={{ ...S.th, flex: "0 0 80px", textAlign: "right" }}>Auto</span>
            <span style={{ ...S.th, flex: "0 0 80px", textAlign: "right" }}>Review</span>
            <span style={{ ...S.th, flex: "0 0 120px", textAlign: "right" }}>Total Bid</span>
            <span style={{ ...S.th, flex: "0 0 110px", textAlign: "center" }}>Status</span>
          </div>

          {jobs.map(job => (
            <div
              key={job.id}
              style={S.row}
              onClick={() => onSelectJob(job.id)}
              onMouseEnter={e => { e.currentTarget.style.background = "#1A1A18"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ ...S.td, flex: "0 0 140px", color: "#888780" }}>{formatDate(job.created_at)}</span>
              <span style={{ ...S.td, flex: "1 1 180px", fontWeight: 600 }}>{job.sub_company_name || job.source_email || "—"}</span>
              <span style={{ ...S.td, flex: "0 0 60px", textAlign: "right" }}>{job.total_lines_parsed}</span>
              <span style={{ ...S.td, flex: "0 0 80px", textAlign: "right", color: CONFIDENCE_COLORS.high }}>{job.auto_written}</span>
              <span style={{ ...S.td, flex: "0 0 80px", textAlign: "right", color: CONFIDENCE_COLORS.mid }}>{job.pending_count}</span>
              <span style={{ ...S.td, flex: "0 0 120px", textAlign: "right" }}>{formatDollars(job.total_bid_amount)}</span>
              <span style={{ ...S.td, flex: "0 0 110px", textAlign: "center" }}>
                <span style={{
                  ...S.badge,
                  background: job.status_badge === "Error" ? "#A6303020" : job.status_badge === "Action needed" ? "#BA751720" : "#63992220",
                  color: job.status_badge === "Error" ? "#A63030" : job.status_badge === "Action needed" ? "#BA7517" : "#639922",
                }}>
                  {job.status_badge}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Line Review View ──

function LineReviewView({ jobId, onBack }) {
  const { data, loading, error, refetch } = useAdminFetch("nova-bid-leveling", { params: { job_id: jobId } });
  const [acting, setActing] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [editCsi, setEditCsi] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const rows = data?.rows || [];
  const job = data?.job || {};

  // Group by confidence band
  const autoAccepted = [];
  const needsReview = [];
  const manualReview = [];

  for (const row of rows) {
    const conf = row.csi_confidence || 0;
    if (conf >= 0.80) autoAccepted.push(row);
    else if (conf >= 0.60) needsReview.push(row);
    else manualReview.push(row);
  }

  const pendingRows = rows.filter(r => r.review_status === "pending");

  const handleAccept = useCallback(async (queueId, gcCsiCode, gcNotes) => {
    setActing(queueId);
    try {
      const res = await fetch("/api/nova-core/approve-queue-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ queue_id: queueId, gc_csi_code: gcCsiCode || undefined, gc_notes: gcNotes || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      refetch();
    } catch (err) {
      alert(`Accept failed: ${err.message}`);
    } finally {
      setActing(null);
      setEditingRow(null);
    }
  }, [refetch]);

  const handleBulkAccept = useCallback(async () => {
    const eligible = pendingRows.filter(r => (r.csi_confidence || 0) >= 0.80);
    if (eligible.length === 0) return;
    if (!confirm(`Accept ${eligible.length} pending line${eligible.length > 1 ? "s" : ""} with confidence ≥ 80%?`)) return;

    for (const row of eligible) {
      await handleAccept(row.id, null, null);
    }
  }, [pendingRows, handleAccept]);

  const handleReject = useCallback(async (queueId) => {
    setActing(queueId);
    try {
      const res = await fetch("/api/admin/nova-bid-leveling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "reject", queue_id: queueId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      refetch();
    } catch (err) {
      alert(`Reject failed: ${err.message}`);
    } finally {
      setActing(null);
    }
  }, [refetch]);

  if (loading) return <div style={S.msg}>Loading lines...</div>;
  if (error) return <div style={{ ...S.msg, color: "#A63030" }}>Error: {error}</div>;

  return (
    <div>
      {/* Header with job metadata */}
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={onBack} style={S.backBtn}>← Back</button>
          <div>
            <h2 style={S.title}>{job.sub_company_name || "Line Review"}</h2>
            <p style={S.subtitle}>
              {formatDate(job.created_at)}
              {job.total_bid_amount != null && <> · {formatDollars(job.total_bid_amount)}</>}
              {job.auto_written != null && <> · {job.auto_written} auto-written</>}
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {pendingRows.filter(r => (r.csi_confidence || 0) >= 0.80).length > 0 && (
            <button onClick={handleBulkAccept} style={S.bulkBtn}>
              Accept all pending ≥ 0.80
            </button>
          )}
          <button onClick={refetch} style={S.refreshBtn}>Refresh</button>
        </div>
      </div>

      {/* Auto-Accepted Section */}
      {autoAccepted.length > 0 && (
        <LineSection
          title="Auto-Accepted"
          lines={autoAccepted}
          acting={acting}
          onAccept={handleAccept}
          onReject={handleReject}
          onModify={(row) => { setEditingRow(row.id); setEditCsi(row.suggested_csi_code || ""); setEditNotes(""); }}
        />
      )}

      {/* Needs Review Section */}
      {needsReview.length > 0 && (
        <LineSection
          title="Needs Review"
          lines={needsReview}
          acting={acting}
          onAccept={handleAccept}
          onReject={handleReject}
          onModify={(row) => { setEditingRow(row.id); setEditCsi(row.suggested_csi_code || ""); setEditNotes(""); }}
        />
      )}

      {/* Manual Review Section */}
      {manualReview.length > 0 && (
        <LineSection
          title="Manual Review"
          lines={manualReview}
          acting={acting}
          onAccept={handleAccept}
          onReject={handleReject}
          onModify={(row) => { setEditingRow(row.id); setEditCsi(row.suggested_csi_code || ""); setEditNotes(""); }}
        />
      )}

      {rows.length === 0 && (
        <div style={S.empty}>No lines for this parse job.</div>
      )}

      {/* Modify Modal */}
      {editingRow && (
        <div style={S.modalOverlay}>
          <div style={S.modal}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: "0 0 16px" }}>Modify CSI Code</h3>
            <label style={S.label}>CSI Code</label>
            <input
              value={editCsi}
              onChange={e => setEditCsi(e.target.value)}
              placeholder="XX.XXX"
              style={S.input}
            />
            <label style={{ ...S.label, marginTop: 12 }}>Notes (optional)</label>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Reason for modification..."
              style={S.textarea}
              rows={2}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setEditingRow(null)} style={S.cancelBtn}>Cancel</button>
              <button
                onClick={() => handleAccept(editingRow, editCsi || undefined, editNotes || undefined)}
                style={S.submitBtn}
              >
                Accept with Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Line Section Component ──

function LineSection({ title, lines, acting, onAccept, onReject, onModify }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={S.sectionTitle}>{title} ({lines.length})</h3>
      <div style={S.table}>
        <div style={S.tableHeader}>
          <span style={{ ...S.th, flex: "0 0 50px", textAlign: "center" }}>Conf</span>
          <span style={{ ...S.th, flex: "1 1 240px" }}>Description</span>
          <span style={{ ...S.th, flex: "0 0 100px" }}>CSI Code</span>
          <span style={{ ...S.th, flex: "0 0 70px", textAlign: "right" }}>Qty</span>
          <span style={{ ...S.th, flex: "0 0 60px" }}>Unit</span>
          <span style={{ ...S.th, flex: "0 0 90px", textAlign: "right" }}>Unit Cost</span>
          <span style={{ ...S.th, flex: "0 0 100px", textAlign: "right" }}>Total</span>
          <span style={{ ...S.th, flex: "0 0 100px", textAlign: "center" }}>Status</span>
          <span style={{ ...S.th, flex: "0 0 180px", textAlign: "right" }}>Actions</span>
        </div>
        {lines.map(row => {
          const isPending = row.review_status === "pending";
          const isRejected = row.review_status === "rejected";
          return (
            <div key={row.id} style={{ ...S.row, opacity: isRejected ? 0.5 : isPending ? 1 : 0.7 }}>
              <span style={{ ...S.td, flex: "0 0 50px", textAlign: "center" }}>
                <span style={{
                  ...S.confDot,
                  background: CONFIDENCE_COLORS[confidenceBand(row.csi_confidence || 0)],
                }}>
                  {Math.round((row.csi_confidence || 0) * 100)}
                </span>
              </span>
              <span style={{ ...S.td, flex: "1 1 240px", fontSize: 12, textDecoration: isRejected ? "line-through" : "none" }}>
                {row.raw_description}
              </span>
              <span style={{ ...S.td, flex: "0 0 100px", fontFamily: "monospace", fontSize: 12, color: "#888780" }}>
                {row.gc_csi_code || row.suggested_csi_code || "—"}
              </span>
              <span style={{ ...S.td, flex: "0 0 70px", textAlign: "right" }}>{row.quantity ?? "—"}</span>
              <span style={{ ...S.td, flex: "0 0 60px", color: "#888780" }}>{row.unit || "—"}</span>
              <span style={{ ...S.td, flex: "0 0 90px", textAlign: "right" }}>{formatDollars(row.unit_cost)}</span>
              <span style={{ ...S.td, flex: "0 0 100px", textAlign: "right", fontWeight: 600 }}>{formatDollars(row.total_cost)}</span>
              <span style={{ ...S.td, flex: "0 0 100px", textAlign: "center" }}>
                <span style={{
                  ...S.badge,
                  background: row.review_status === "approved" ? "#63992220" : row.review_status === "rejected" ? "#A6303020" : "#BA751720",
                  color: row.review_status === "approved" ? "#639922" : row.review_status === "rejected" ? "#A63030" : "#BA7517",
                }}>
                  {row.review_status}
                </span>
              </span>
              <span style={{ ...S.td, flex: "0 0 180px", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                {isPending && (
                  <>
                    <button
                      onClick={() => onAccept(row.id, row.suggested_csi_code, null)}
                      disabled={acting === row.id}
                      style={S.acceptBtn}
                    >
                      {acting === row.id ? "..." : "Accept"}
                    </button>
                    <button onClick={() => onModify(row)} style={S.modifyBtn}>Modify</button>
                    <button
                      onClick={() => onReject(row.id)}
                      disabled={acting === row.id}
                      style={S.rejectBtn}
                    >
                      Reject
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Styles ──

const S = {
  msg: { color: "#888780", fontSize: 14, padding: 40, textAlign: "center" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 600, color: "#fff", margin: 0 },
  subtitle: { fontSize: 12, color: "#888780", margin: "4px 0 0" },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: "#888780", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" },

  refreshBtn: {
    padding: "8px 16px", background: "#1E1E1C", border: "1px solid #2A2A28",
    borderRadius: 6, color: "#888780", fontSize: 13, cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  },
  backBtn: {
    padding: "6px 14px", background: "transparent", border: "1px solid #2A2A28",
    borderRadius: 6, color: "#888780", fontSize: 13, cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  },
  bulkBtn: {
    padding: "8px 16px", background: "#639922", border: "none",
    borderRadius: 6, color: "#fff", fontSize: 13, fontWeight: 600,
    cursor: "pointer", fontFamily: "system-ui, sans-serif",
  },

  empty: {
    textAlign: "center", padding: 60, color: "#888780", fontSize: 14,
    background: "#1E1E1C", borderRadius: 8, border: "1px solid #2A2A28",
  },

  table: { background: "#1E1E1C", borderRadius: 8, border: "1px solid #2A2A28", overflow: "hidden" },
  tableHeader: {
    display: "flex", alignItems: "center", padding: "10px 16px",
    borderBottom: "1px solid #2A2A28", background: "#161614",
  },
  th: { fontSize: 10, fontWeight: 600, color: "#888780", textTransform: "uppercase", letterSpacing: "0.04em" },
  row: {
    display: "flex", alignItems: "center", padding: "10px 16px",
    borderBottom: "1px solid #1A1A18", cursor: "pointer", transition: "background 0.1s",
  },
  td: { fontSize: 13, color: "#fff" },

  badge: {
    fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4, display: "inline-block",
  },
  confDot: {
    display: "inline-block", fontSize: 10, fontWeight: 700, color: "#fff",
    padding: "2px 6px", borderRadius: 4, minWidth: 28, textAlign: "center",
  },

  acceptBtn: {
    padding: "4px 10px", background: "#639922", border: "none",
    borderRadius: 4, color: "#fff", fontSize: 11, fontWeight: 600,
    cursor: "pointer", fontFamily: "system-ui, sans-serif",
  },
  modifyBtn: {
    padding: "4px 10px", background: "transparent", border: "1px solid #BA7517",
    borderRadius: 4, color: "#BA7517", fontSize: 11, fontWeight: 600,
    cursor: "pointer", fontFamily: "system-ui, sans-serif",
  },
  rejectBtn: {
    padding: "4px 10px", background: "transparent", border: "1px solid #A63030",
    borderRadius: 4, color: "#A63030", fontSize: 11, fontWeight: 600,
    cursor: "pointer", fontFamily: "system-ui, sans-serif",
  },

  // Modal
  modalOverlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center",
    justifyContent: "center", zIndex: 9999,
  },
  modal: {
    background: "#1E1E1C", border: "1px solid #2A2A28", borderRadius: 10,
    padding: 24, width: 440, maxWidth: "90vw",
  },
  label: { display: "block", fontSize: 11, fontWeight: 600, color: "#888780", marginBottom: 4 },
  input: {
    width: "100%", background: "#161614", border: "1px solid #2A2A28",
    borderRadius: 6, color: "#fff", fontSize: 14, padding: "8px 10px",
    fontFamily: "monospace", boxSizing: "border-box",
  },
  textarea: {
    width: "100%", background: "#161614", border: "1px solid #2A2A28",
    borderRadius: 6, color: "#fff", fontSize: 13, padding: 10,
    fontFamily: "system-ui, sans-serif", resize: "vertical", boxSizing: "border-box",
  },
  cancelBtn: {
    padding: "6px 16px", background: "transparent", border: "1px solid #2A2A28",
    borderRadius: 4, color: "#888780", fontSize: 12, cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  },
  submitBtn: {
    padding: "6px 16px", background: "#BA7517", border: "none",
    borderRadius: 4, color: "#fff", fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "system-ui, sans-serif",
  },
};
