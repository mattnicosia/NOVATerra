// ============================================================
// NOVA Core — Admin Queue Panel (Live)
// /admin/queue
// Shows: unit_costs outliers, proposals duplicates, pending context.
// Actions: Resolve (clears flag) + Escalate (writes to admin log).
// ============================================================

import { useState, useCallback } from "react";
import { useAdminFetch } from "@/hooks/useAdminFetch";

export default function AdminQueuePage() {
  const { data: queueData, loading, error, refetch: fetchQueue } = useAdminFetch("nova-queue");
  const [acting, setActing] = useState(null); // record_id being acted on
  const [noteModal, setNoteModal] = useState(null); // { action, table, record_id }
  const [removedIds, setRemovedIds] = useState([]);

  const items = (queueData?.items || []).filter(i => !removedIds.includes(i.record_id));

  const handleAction = useCallback(async (action, table, record_id, note) => {
    setActing(record_id);
    try {
      const res = await fetch("/api/admin/nova-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action, table, record_id, note }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      if (action === "resolve") {
        setRemovedIds(prev => [...prev, record_id]);
      }
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setActing(null);
      setNoteModal(null);
    }
  }, []);

  if (loading) return <div style={S.msg}>Loading queue...</div>;
  if (error) return <div style={{ ...S.msg, color: "#A63030" }}>Error: {error}</div>;

  return (
    <div>
      <div style={S.header}>
        <div>
          <h2 style={S.title}>Queue</h2>
          <p style={S.subtitle}>{items.length} flagged record{items.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={fetchQueue} style={S.refresh}>Refresh</button>
      </div>

      {items.length === 0 ? (
        <div style={S.empty}>All clear — no flagged records.</div>
      ) : (
        <div style={S.table}>
          {/* Table Header */}
          <div style={S.tableHeader}>
            <span style={{ ...S.th, flex: "0 0 120px" }}>Table</span>
            <span style={{ ...S.th, flex: "0 0 240px" }}>Record ID</span>
            <span style={{ ...S.th, flex: 1 }}>Reason</span>
            <span style={{ ...S.th, flex: "0 0 140px" }}>Date Flagged</span>
            <span style={{ ...S.th, flex: "0 0 160px", textAlign: "right" }}>Actions</span>
          </div>

          {/* Rows */}
          {items.map((item) => (
            <div key={`${item.table}-${item.record_id}`} style={S.row}>
              <span style={{ ...S.td, flex: "0 0 120px" }}>
                <span style={{
                  ...S.tableBadge,
                  background: item.table === "unit_costs" ? "#534AB720" : "#BA751720",
                  color: item.table === "unit_costs" ? "#7C6FDB" : "#D4952B",
                }}>
                  {item.table}
                </span>
              </span>
              <span style={{ ...S.td, flex: "0 0 240px", fontSize: 11, fontFamily: "monospace", color: "#888780" }}>
                {item.record_id}
              </span>
              <span style={{ ...S.td, flex: 1 }}>
                <span style={{ color: "#fff", fontSize: 13 }}>{item.reason}</span>
                {item.detail && <span style={{ display: "block", fontSize: 11, color: "#888780", marginTop: 2 }}>{item.detail}</span>}
              </span>
              <span style={{ ...S.td, flex: "0 0 140px", fontSize: 12, color: "#888780" }}>
                {item.date_flagged ? new Date(item.date_flagged).toLocaleDateString() : "—"}
              </span>
              <span style={{ ...S.td, flex: "0 0 160px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  onClick={() => handleAction("resolve", item.table, item.record_id, null)}
                  disabled={acting === item.record_id}
                  style={S.resolveBtn}
                >
                  {acting === item.record_id ? "..." : "Resolve"}
                </button>
                <button
                  onClick={() => setNoteModal({ action: "escalate", table: item.table, record_id: item.record_id })}
                  disabled={acting === item.record_id}
                  style={S.escalateBtn}
                >
                  Escalate
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Escalate Note Modal */}
      {noteModal && (
        <EscalateModal
          onSubmit={(note) => handleAction(noteModal.action, noteModal.table, noteModal.record_id, note)}
          onCancel={() => setNoteModal(null)}
        />
      )}
    </div>
  );
}

function EscalateModal({ onSubmit, onCancel }) {
  const [note, setNote] = useState("");
  return (
    <div style={S.modalOverlay}>
      <div style={S.modal}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: "0 0 12px" }}>Escalate Record</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Admin note (optional)..."
          style={S.textarea}
          rows={3}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onCancel} style={S.cancelBtn}>Cancel</button>
          <button onClick={() => onSubmit(note)} style={S.submitBtn}>Escalate</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  msg: { color: "#888780", fontSize: 14, padding: 40, textAlign: "center" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 600, color: "#fff", margin: 0 },
  subtitle: { fontSize: 12, color: "#888780", margin: "4px 0 0" },
  refresh: {
    padding: "8px 16px", background: "#1E1E1C", border: "1px solid #2A2A28",
    borderRadius: 6, color: "#888780", fontSize: 13, cursor: "pointer",
    fontFamily: "system-ui, sans-serif",
  },
  empty: {
    textAlign: "center", padding: 60, color: "#639922", fontSize: 14,
    background: "#1E1E1C", borderRadius: 8, border: "1px solid #2A2A28",
  },

  // Table
  table: { background: "#1E1E1C", borderRadius: 8, border: "1px solid #2A2A28", overflow: "hidden" },
  tableHeader: {
    display: "flex", alignItems: "center", padding: "12px 16px",
    borderBottom: "1px solid #2A2A28", background: "#161614",
  },
  th: { fontSize: 11, fontWeight: 600, color: "#888780", textTransform: "uppercase", letterSpacing: "0.04em" },
  row: {
    display: "flex", alignItems: "center", padding: "12px 16px",
    borderBottom: "1px solid #1A1A18",
  },
  td: { fontSize: 13, color: "#fff" },
  tableBadge: {
    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
  },

  // Buttons
  resolveBtn: {
    padding: "5px 12px", background: "#639922", border: "none",
    borderRadius: 4, color: "#fff", fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "system-ui, sans-serif",
  },
  escalateBtn: {
    padding: "5px 12px", background: "transparent", border: "1px solid #BA7517",
    borderRadius: 4, color: "#BA7517", fontSize: 12, fontWeight: 600,
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
    padding: 24, width: 420, maxWidth: "90vw",
  },
  textarea: {
    width: "100%", background: "#161614", border: "1px solid #2A2A28",
    borderRadius: 6, color: "#fff", fontSize: 13, padding: 10,
    fontFamily: "system-ui, sans-serif", resize: "vertical",
    boxSizing: "border-box",
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
