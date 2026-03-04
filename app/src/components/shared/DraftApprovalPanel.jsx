// Draft Approval Panel — glass morphism popover for reviewing/approving auto-response drafts
import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useAutoResponseStore, TRIGGER_TYPES } from "@/stores/autoResponseStore";
import { sendAutoResponse, generateAlternatives } from "@/utils/autoResponseEngine";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

export default function DraftApprovalPanel({ open, onClose }) {
  const C = useTheme();
  const dk = C.isDark !== false;
  const ref = useRef(null);
  const pendingDrafts = useAutoResponseStore((s) => s.getPendingDrafts());
  const updateDraft = useAutoResponseStore((s) => s.updateDraft);
  const dismissDraft = useAutoResponseStore((s) => s.dismissDraft);
  const showToast = useUiStore((s) => s.showToast);

  const [editingId, setEditingId] = useState(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [sendingId, setSendingId] = useState(null);
  const [alternatives, setAlternatives] = useState({});
  const [loadingAlts, setLoadingAlts] = useState(null);

  // Outside click handler
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleApprove = async (draft) => {
    setSendingId(draft.id);
    try {
      await sendAutoResponse(draft);
      showToast(`Response sent to ${draft.recipientName || draft.recipientEmail}`, "success");
    } catch (err) {
      showToast(err.message || "Failed to send", "error");
    } finally {
      setSendingId(null);
    }
  };

  const handleApproveAll = async () => {
    for (const draft of pendingDrafts) {
      try {
        await sendAutoResponse(draft);
      } catch (err) {
        showToast(`Failed: ${draft.recipientName} — ${err.message}`, "error");
      }
    }
    showToast(`${pendingDrafts.length} response(s) sent`, "success");
  };

  const startEdit = (draft) => {
    setEditingId(draft.id);
    setEditSubject(draft.subject);
    setEditBody(draft.body);
  };

  const saveEdit = () => {
    if (editingId) {
      updateDraft(editingId, { subject: editSubject, body: editBody });
      setEditingId(null);
    }
  };

  const cancelEdit = () => setEditingId(null);

  const handleSuggestAlts = async (draft) => {
    setLoadingAlts(draft.id);
    try {
      const alts = await generateAlternatives(draft);
      if (alts.length > 0) {
        setAlternatives(prev => ({ ...prev, [draft.id]: alts }));
      } else {
        showToast("No alternatives generated — try again", "error");
      }
    } catch {
      showToast("Failed to generate alternatives", "error");
    } finally {
      setLoadingAlts(null);
    }
  };

  const handleSelectAlt = (draftId, alt) => {
    updateDraft(draftId, { subject: alt.subject, body: alt.body });
    setAlternatives(prev => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
  };

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: 56,
        right: 16,
        width: 400,
        maxHeight: "calc(100vh - 80px)",
        overflowY: "auto",
        zIndex: 1000,
        background: dk
          ? "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)"
          : "linear-gradient(145deg, rgba(255,255,255,0.97) 0%, rgba(255,255,255,0.92) 100%)",
        backdropFilter: "blur(40px) saturate(1.8)",
        WebkitBackdropFilter: "blur(40px) saturate(1.8)",
        border: `1px solid ${dk ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`,
        borderRadius: 14,
        padding: "14px 12px",
        boxShadow: dk
          ? "0 16px 48px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 8px 32px rgba(0,0,0,0.12), 0 16px 48px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,1)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          padding: "0 4px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Auto-Responses</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#fff",
              background: "linear-gradient(135deg, #7C5CFC, #BF5AF2)",
              borderRadius: 8,
              padding: "1px 6px",
            }}
          >
            {pendingDrafts.length}
          </span>
        </div>
        {pendingDrafts.length > 1 && (
          <button
            onClick={handleApproveAll}
            style={{
              fontSize: 9,
              fontWeight: 700,
              color: "#fff",
              background: C.green,
              border: "none",
              borderRadius: 4,
              padding: "3px 8px",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Approve All
          </button>
        )}
      </div>

      {/* Empty state */}
      {pendingDrafts.length === 0 && (
        <div style={{ padding: "20px 0", textAlign: "center", color: C.textDim, fontSize: 11 }}>
          No pending drafts
        </div>
      )}

      {/* Draft cards */}
      {pendingDrafts.map((draft) => {
        const meta = TRIGGER_TYPES[draft.triggerType] || { label: draft.triggerType, color: "#8E8E93" };
        const isEditing = editingId === draft.id;
        const isSending = sendingId === draft.id;

        return (
          <div
            key={draft.id}
            style={{
              background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 8,
              border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
            }}
          >
            {/* Trigger type pill + recipient */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: "#fff",
                  background: meta.color,
                  borderRadius: 3,
                  padding: "1px 5px",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {meta.label}
              </span>
              <span style={{ fontSize: 10, color: C.textDim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {draft.recipientName || draft.recipientEmail}
              </span>
            </div>

            {/* Project name */}
            {draft.projectName && (
              <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 4 }}>{draft.projectName}</div>
            )}

            {isEditing ? (
              /* ── Edit mode ── */
              <div>
                <input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "4px 8px",
                    fontSize: 11,
                    fontWeight: 600,
                    border: `1px solid ${C.accent}40`,
                    borderRadius: 4,
                    outline: "none",
                    background: C.bg,
                    color: C.text,
                    fontFamily: "'DM Sans', sans-serif",
                    boxSizing: "border-box",
                    marginBottom: 6,
                  }}
                />
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={5}
                  style={{
                    width: "100%",
                    padding: "6px 8px",
                    fontSize: 11,
                    border: `1px solid ${C.accent}40`,
                    borderRadius: 4,
                    outline: "none",
                    background: C.bg,
                    color: C.text,
                    fontFamily: "'DM Sans', sans-serif",
                    resize: "vertical",
                    boxSizing: "border-box",
                    lineHeight: 1.5,
                  }}
                />
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <button
                    onClick={saveEdit}
                    style={{
                      padding: "3px 10px",
                      fontSize: 9,
                      fontWeight: 700,
                      border: "none",
                      borderRadius: 4,
                      background: C.accent,
                      color: "#fff",
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    style={{
                      padding: "3px 8px",
                      fontSize: 9,
                      fontWeight: 600,
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                      background: "transparent",
                      color: C.textDim,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── Preview mode ── */
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 2 }}>{draft.subject}</div>
                <div
                  style={{
                    fontSize: 10,
                    color: C.textDim,
                    lineHeight: 1.4,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    marginBottom: 8,
                  }}
                >
                  {draft.body}
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => handleApprove(draft)}
                    disabled={isSending}
                    style={{
                      padding: "3px 10px",
                      fontSize: 9,
                      fontWeight: 700,
                      border: "none",
                      borderRadius: 4,
                      background: C.green,
                      color: "#fff",
                      cursor: isSending ? "wait" : "pointer",
                      opacity: isSending ? 0.6 : 1,
                      fontFamily: "'DM Sans', sans-serif",
                      transition: "opacity 0.15s",
                    }}
                  >
                    {isSending ? "Sending..." : "Approve"}
                  </button>
                  <button
                    onClick={() => startEdit(draft)}
                    style={{
                      padding: "3px 8px",
                      fontSize: 9,
                      fontWeight: 600,
                      border: `1px solid ${C.accent}30`,
                      borderRadius: 4,
                      background: "transparent",
                      color: C.accent,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => dismissDraft(draft.id)}
                    style={{
                      padding: "3px 8px",
                      fontSize: 9,
                      fontWeight: 600,
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                      background: "transparent",
                      color: C.textDim,
                      cursor: "pointer",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => handleSuggestAlts(draft)}
                    disabled={loadingAlts === draft.id}
                    style={{
                      padding: "3px 8px",
                      fontSize: 9,
                      fontWeight: 600,
                      border: `1px solid ${C.accent}30`,
                      borderRadius: 4,
                      background: "transparent",
                      color: C.accent,
                      cursor: loadingAlts === draft.id ? "wait" : "pointer",
                      opacity: loadingAlts === draft.id ? 0.6 : 1,
                      fontFamily: "'DM Sans', sans-serif",
                      marginLeft: "auto",
                    }}
                  >
                    {loadingAlts === draft.id ? "Generating..." : "Alternatives"}
                  </button>
                </div>

                {/* Alternative suggestions */}
                {alternatives[draft.id]?.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    <div
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        color: C.textDim,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      Alternative Versions
                    </div>
                    {alternatives[draft.id].map((alt, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSelectAlt(draft.id, alt)}
                        style={{
                          padding: "6px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.01)",
                          border: `1px solid ${dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}`,
                          transition: "all 150ms",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent + "40")}
                        onMouseLeave={e =>
                          (e.currentTarget.style.borderColor = dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)")
                        }
                      >
                        <div style={{ fontSize: 10, fontWeight: 600, color: C.text, marginBottom: 1 }}>
                          {alt.subject}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: C.textDim,
                            lineHeight: 1.3,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {alt.body}
                        </div>
                        <div style={{ fontSize: 8, color: C.accent, fontWeight: 600, marginTop: 3 }}>
                          Click to use this version
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
