import { useState, useMemo, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useOrgStore, selectIsManager } from "@/stores/orgStore";
import { useAuthStore } from "@/stores/authStore";
import { useReviewStore } from "@/stores/reviewStore";
import { useWorkloadData } from "@/hooks/useWorkloadData";
import { callAnthropicStream } from "@/utils/ai";
import Avatar from "@/components/shared/Avatar";
import Modal from "@/components/shared/Modal";
import { bt, inp } from "@/utils/styles";

/**
 * ReviewPanel — Estimate review system with NOVA AI briefings.
 *
 * Flow:
 *   Estimator → "Request Review" → selects manager → review created
 *   Manager → "Setup Review" → selects estimator + estimates → review created
 *   NOVA generates briefing for reviewer (manager)
 *
 * Phase 1: In-memory reviews (not persisted).
 * Phase 2: Supabase persistence + notifications.
 */

const REVIEW_SYSTEM_PROMPT = `You are NOVA, an AI construction estimating assistant reviewing estimates for a manager briefing.

Generate a concise but thorough review briefing covering:

1. **Overview** — Estimator workload snapshot (how many estimates, hours tracked, deadlines)
2. **Performance Summary** — Win rate, accuracy trends, areas of strength
3. **Current Estimates** — For each estimate under review:
   - Scope assessment (are hours reasonable for the project?)
   - Time budget health (on track vs at risk)
   - Key risks or concerns
4. **Discussion Points** — 3-5 specific talking points for the 1:1 review meeting
5. **Recognition** — What the estimator is doing well (strengths-based feedback)

Keep it brief but actionable. Use bullet points. Be constructive, not critical.
Format with markdown headers and bullet points.`;

export default function ReviewPanel({ open, onClose }) {
  const C = useTheme();
  const T = C.T;
  const isManager = useOrgStore(selectIsManager);
  const membership = useOrgStore(s => s.membership);
  const members = useOrgStore(s => s.members);
  const user = useAuthStore(s => s.user);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const workload = useWorkloadData();

  const reviews = useReviewStore(s => s.reviews);
  const createReview = useReviewStore(s => s.createReview);
  const setBriefing = useReviewStore(s => s.setBriefing);
  const updateStatus = useReviewStore(s => s.updateStatus);
  const deleteReview = useReviewStore(s => s.deleteReview);

  const [mode, setMode] = useState("list"); // list | create | view
  const [createType, setCreateType] = useState("request"); // request | setup
  const [selectedManager, setSelectedManager] = useState("");
  const [selectedEstimator, setSelectedEstimator] = useState("");
  const [selectedEstimates, setSelectedEstimates] = useState([]);
  const [activeReview, setActiveReview] = useState(null);
  const [generatingBriefing, setGeneratingBriefing] = useState(false);
  const [briefingText, setBriefingText] = useState("");

  const myName = membership?.display_name || user?.email?.split("@")[0] || "Unknown";

  // Get managers and estimators from members
  const managers = useMemo(() => members.filter(m => m.role === "owner" || m.role === "manager"), [members]);

  const estimators = useMemo(
    () => members.filter(m => m.role === "estimator" || m.role === "owner" || m.role === "manager"),
    [members],
  );

  // Get estimates for selected estimator
  const estimatorEstimates = useMemo(() => {
    const name = createType === "setup" ? selectedEstimator : myName;
    return estimatesIndex.filter(e => e.estimator === name && (e.status === "Bidding" || e.status === "Pending"));
  }, [estimatesIndex, selectedEstimator, createType, myName]);

  const handleCreate = useCallback(() => {
    const estNames =
      selectedEstimates.length > 0
        ? selectedEstimates.map(id => estimatesIndex.find(e => e.id === id)?.name || "Unknown")
        : estimatorEstimates.map(e => e.name);
    const estIds = selectedEstimates.length > 0 ? selectedEstimates : estimatorEstimates.map(e => e.id);

    createReview({
      type: createType,
      estimatorName: createType === "setup" ? selectedEstimator : myName,
      managerName: createType === "request" ? selectedManager : myName,
      estimateIds: estIds,
      estimateNames: estNames,
    });

    setMode("list");
    setSelectedManager("");
    setSelectedEstimator("");
    setSelectedEstimates([]);
  }, [
    createType,
    selectedManager,
    selectedEstimator,
    selectedEstimates,
    estimatorEstimates,
    myName,
    createReview,
    estimatesIndex,
  ]);

  const generateBriefing = useCallback(
    async review => {
      setGeneratingBriefing(true);
      setBriefingText("");

      // Build context about the estimator's work
      const estData = review.estimateIds.map(id => estimatesIndex.find(e => e.id === id)).filter(Boolean);

      const context = estData
        .map(e => {
          const spentHours = ((e.timerTotalMs || 0) / 3600000).toFixed(1);
          const budgetHours = e.estimatedHours || "not set";
          return `- **${e.name}** (${e.status}): Client: ${e.client || "N/A"}, Building: ${e.buildingType || "N/A"}, ${e.projectSF || "N/A"} SF, Budget: ${budgetHours}h, Spent: ${spentHours}h, Bid Due: ${e.bidDue || "N/A"}, Total: $${(e.grandTotal || 0).toLocaleString()}`;
        })
        .join("\n");

      // Get workload data for the estimator
      const estRow = workload.estimatorRows.find(r => r.name === review.estimatorName);
      const workloadContext = estRow
        ? `Active estimates: ${estRow.estimates.length}, covering ${estRow.estimates.reduce((s, e) => s + (e.estimatedHours || 0), 0)}h total budget`
        : "No active workload data";

      const prompt = `Generate a review briefing for a manager meeting with estimator "${review.estimatorName}".

Workload: ${workloadContext}

Estimates under review:
${context || "No specific estimates selected"}

Review type: ${review.type === "request" ? "Estimator-requested review" : "Manager-initiated review"}
Review notes: ${review.notes || "None provided"}`;

      try {
        await callAnthropicStream({
          system: REVIEW_SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 1500,
          temperature: 0.3,
          onText: text => {
            setBriefingText(text);
          },
        });
        // Save the final briefing
        const finalText = useReviewStore.getState().reviews.find(r => r.id === review.id)?.briefing;
        if (!finalText) {
          // Get latest briefing text from closure
          setBriefing(review.id, "briefing_pending");
        }
      } catch (err) {
        console.error("[ReviewPanel] Briefing generation failed:", err);
        setBriefingText("Failed to generate briefing. Please try again.");
      } finally {
        setGeneratingBriefing(false);
      }
    },
    [estimatesIndex, workload, setBriefing],
  );

  const openReview = useCallback(
    review => {
      setActiveReview(review);
      setMode("view");
      if (!review.briefing && review.briefing !== "briefing_pending") {
        generateBriefing(review);
      } else {
        setBriefingText(review.briefing || "");
      }
    },
    [generateBriefing],
  );

  if (!open) return null;

  // ── Rendering helpers ──
  const statusBadge = status => {
    const colors = {
      pending: { bg: "#FBBF2418", color: "#FBBF24" },
      in_progress: { bg: "#60A5FA18", color: "#60A5FA" },
      completed: { bg: "#30D15818", color: "#30D158" },
    };
    const c = colors[status] || colors.pending;
    return (
      <span
        style={{
          fontSize: 8,
          fontWeight: 700,
          color: c.color,
          background: c.bg,
          padding: "2px 6px",
          borderRadius: T.radius.full,
          textTransform: "uppercase",
        }}
      >
        {status.replace("_", " ")}
      </span>
    );
  };

  return (
    <Modal onClose={onClose} width={680}>
      <div style={{ padding: T.space[4] }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: T.space[4],
            paddingBottom: T.space[3],
            borderBottom: `1px solid ${C.border}`,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text }}>
              {mode === "create" ? "New Review" : mode === "view" ? "Review Briefing" : "Reviews"}
            </h2>
            <div style={{ fontSize: T.fontSize.xs, color: C.textDim, marginTop: 2 }}>
              {mode === "create"
                ? "Set up an estimate review meeting"
                : mode === "view"
                  ? "NOVA-generated briefing for your review"
                  : "Manage estimate reviews and NOVA briefings"}
            </div>
          </div>
          {mode !== "list" && (
            <button
              onClick={() => {
                setMode("list");
                setActiveReview(null);
                setBriefingText("");
              }}
              style={{
                ...bt(C),
                padding: "4px 12px",
                fontSize: T.fontSize.xs,
                color: C.textMuted,
                background: "transparent",
                border: `1px solid ${C.border}`,
                borderRadius: T.radius.sm,
              }}
            >
              ← Back
            </button>
          )}
        </div>

        {/* ── LIST VIEW ── */}
        {mode === "list" && (
          <>
            {/* Action buttons */}
            <div style={{ display: "flex", gap: T.space[2], marginBottom: T.space[4] }}>
              <button
                onClick={() => {
                  setCreateType("request");
                  setMode("create");
                }}
                style={{
                  ...bt(C),
                  padding: "8px 16px",
                  fontSize: T.fontSize.xs,
                  fontWeight: 600,
                  color: "#fff",
                  background: C.accent,
                  border: "none",
                  borderRadius: T.radius.md,
                  flex: 1,
                }}
              >
                Request Review
              </button>
              {isManager && (
                <button
                  onClick={() => {
                    setCreateType("setup");
                    setMode("create");
                  }}
                  style={{
                    ...bt(C),
                    padding: "8px 16px",
                    fontSize: T.fontSize.xs,
                    fontWeight: 600,
                    color: C.text,
                    background: `${C.border}10`,
                    border: `1px solid ${C.border}`,
                    borderRadius: T.radius.md,
                    flex: 1,
                  }}
                >
                  Setup Review
                </button>
              )}
            </div>

            {/* Review list */}
            {reviews.length === 0 ? (
              <div
                style={{
                  padding: T.space[8],
                  textAlign: "center",
                  color: C.textDim,
                  fontSize: T.fontSize.sm,
                }}
              >
                <div style={{ fontSize: 24, marginBottom: T.space[2], opacity: 0.5 }}>📋</div>
                No reviews yet. Request or set up a review to get started.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
                {reviews.map(review => (
                  <div
                    key={review.id}
                    onClick={() => openReview(review)}
                    style={{
                      padding: T.space[3],
                      background: `${C.border}06`,
                      border: `1px solid ${C.border}`,
                      borderRadius: T.radius.md,
                      cursor: "pointer",
                      transition: "background 100ms",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = `${C.border}12`;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = `${C.border}06`;
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
                        <Avatar name={review.estimatorName} size={20} />
                        <span style={{ fontSize: T.fontSize.sm, fontWeight: 600, color: C.text }}>
                          {review.estimatorName}
                        </span>
                        <span style={{ fontSize: 9, color: C.textDim }}>
                          {review.type === "request" ? "requested" : "setup by"}{" "}
                          {review.type === "request" ? review.estimatorName : review.managerName}
                        </span>
                      </div>
                      {statusBadge(review.status)}
                    </div>
                    <div style={{ fontSize: 9, color: C.textDim }}>
                      {review.estimateNames.length > 0
                        ? `${review.estimateNames.length} estimate${review.estimateNames.length !== 1 ? "s" : ""}: ${review.estimateNames.slice(0, 3).join(", ")}${review.estimateNames.length > 3 ? ` +${review.estimateNames.length - 3}` : ""}`
                        : "All active estimates"}
                    </div>
                    <div style={{ fontSize: 8, color: C.textDim, marginTop: 2 }}>
                      {new Date(review.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {review.briefing && " · NOVA briefing ready"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── CREATE VIEW ── */}
        {mode === "create" && (
          <div style={{ display: "flex", flexDirection: "column", gap: T.space[4] }}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: C.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {createType === "request" ? "Request a Review" : "Setup a Review"}
            </div>

            {/* Estimator selection (manager setup only) */}
            {createType === "setup" && (
              <div>
                <label
                  style={{
                    fontSize: T.fontSize.xs,
                    color: C.textMuted,
                    fontWeight: 600,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Select Estimator
                </label>
                <select
                  value={selectedEstimator}
                  onChange={e => {
                    setSelectedEstimator(e.target.value);
                    setSelectedEstimates([]);
                  }}
                  style={{
                    ...inp(C),
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: T.fontSize.sm,
                  }}
                >
                  <option value="">Choose estimator...</option>
                  {estimators.map(m => (
                    <option key={m.id} value={m.display_name}>
                      {m.display_name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Manager selection (estimator request) */}
            {createType === "request" && (
              <div>
                <label
                  style={{
                    fontSize: T.fontSize.xs,
                    color: C.textMuted,
                    fontWeight: 600,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Review With
                </label>
                {managers.length > 0 ? (
                  <select
                    value={selectedManager}
                    onChange={e => setSelectedManager(e.target.value)}
                    style={{
                      ...inp(C),
                      width: "100%",
                      padding: "8px 10px",
                      fontSize: T.fontSize.sm,
                    }}
                  >
                    <option value="">Choose manager...</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.display_name}>
                        {m.display_name} ({m.role})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>
                    No managers found. You can still create a self-review.
                  </div>
                )}
              </div>
            )}

            {/* Estimate selection */}
            {(createType === "request" || (createType === "setup" && selectedEstimator)) && (
              <div>
                <label
                  style={{
                    fontSize: T.fontSize.xs,
                    color: C.textMuted,
                    fontWeight: 600,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Estimates to Review ({estimatorEstimates.length} active)
                </label>
                {estimatorEstimates.length > 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      maxHeight: 200,
                      overflowY: "auto",
                      padding: T.space[2],
                      background: `${C.border}06`,
                      borderRadius: T.radius.md,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: T.fontSize.xs,
                        color: C.accent,
                        fontWeight: 600,
                        padding: "4px 0",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEstimates.length === 0}
                        onChange={() => setSelectedEstimates([])}
                      />
                      All active estimates
                    </label>
                    {estimatorEstimates.map(est => (
                      <label
                        key={est.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: T.fontSize.xs,
                          color: C.text,
                          padding: "4px 0",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedEstimates.includes(est.id)}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedEstimates(prev => [...prev, est.id]);
                            } else {
                              setSelectedEstimates(prev => prev.filter(id => id !== est.id));
                            }
                          }}
                        />
                        <span style={{ flex: 1 }}>{est.name}</span>
                        <span style={{ fontSize: 9, color: C.textDim }}>
                          {est.bidDue
                            ? new Date(est.bidDue + "T00:00:00").toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>No active estimates found.</div>
                )}
              </div>
            )}

            {/* Create button */}
            <button
              onClick={handleCreate}
              disabled={
                (createType === "request" && !selectedManager && managers.length > 0) ||
                (createType === "setup" && !selectedEstimator)
              }
              style={{
                ...bt(C),
                padding: "10px 20px",
                fontSize: T.fontSize.sm,
                fontWeight: 600,
                color: "#fff",
                background: C.accent,
                border: "none",
                borderRadius: T.radius.md,
                opacity:
                  (createType === "request" && !selectedManager && managers.length > 0) ||
                  (createType === "setup" && !selectedEstimator)
                    ? 0.5
                    : 1,
              }}
            >
              Create Review & Generate NOVA Briefing
            </button>
          </div>
        )}

        {/* ── VIEW REVIEW ── */}
        {mode === "view" && activeReview && (
          <div>
            {/* Review header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: T.space[3],
                marginBottom: T.space[4],
                padding: T.space[3],
                background: `${C.border}06`,
                borderRadius: T.radius.md,
              }}
            >
              <Avatar name={activeReview.estimatorName} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: T.fontSize.sm, fontWeight: 700, color: C.text }}>
                  {activeReview.estimatorName}
                </div>
                <div style={{ fontSize: 9, color: C.textDim }}>
                  {activeReview.estimateNames.length} estimates ·{" "}
                  {activeReview.type === "request" ? "Self-requested" : `Setup by ${activeReview.managerName}`}
                </div>
              </div>
              {statusBadge(activeReview.status)}
            </div>

            {/* NOVA Briefing */}
            <div
              style={{
                marginBottom: T.space[4],
                padding: T.space[4],
                background: `${C.accent}08`,
                border: `1px solid ${C.accent}20`,
                borderRadius: T.radius.lg,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[2],
                  marginBottom: T.space[3],
                }}
              >
                <span style={{ fontSize: 14 }}>✦</span>
                <span
                  style={{
                    fontSize: T.fontSize.xs,
                    fontWeight: 700,
                    color: C.accent,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  NOVA Briefing
                </span>
                {generatingBriefing && (
                  <span style={{ fontSize: 9, color: C.textDim, fontStyle: "italic" }}>Generating...</span>
                )}
              </div>

              {briefingText ? (
                <div
                  style={{
                    fontSize: T.fontSize.xs,
                    color: C.text,
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {/* Simple markdown rendering */}
                  {briefingText.split("\n").map((line, i) => {
                    if (line.startsWith("## ")) {
                      return (
                        <div
                          key={i}
                          style={{
                            fontSize: T.fontSize.sm,
                            fontWeight: 700,
                            color: C.text,
                            marginTop: i > 0 ? T.space[3] : 0,
                            marginBottom: 4,
                          }}
                        >
                          {line.replace("## ", "")}
                        </div>
                      );
                    }
                    if (line.startsWith("# ")) {
                      return (
                        <div
                          key={i}
                          style={{
                            fontSize: T.fontSize.md,
                            fontWeight: 700,
                            color: C.text,
                            marginTop: i > 0 ? T.space[4] : 0,
                            marginBottom: 4,
                          }}
                        >
                          {line.replace("# ", "")}
                        </div>
                      );
                    }
                    if (line.startsWith("- **") || line.startsWith("* **")) {
                      const parts = line.replace(/^[-*]\s*/, "").split("**");
                      return (
                        <div key={i} style={{ paddingLeft: 12, marginBottom: 2 }}>
                          <span style={{ color: C.textDim }}>•</span>{" "}
                          {parts.map((p, j) =>
                            j % 2 === 1 ? (
                              <strong key={j} style={{ color: C.text }}>
                                {p}
                              </strong>
                            ) : (
                              <span key={j}>{p}</span>
                            ),
                          )}
                        </div>
                      );
                    }
                    if (line.startsWith("- ") || line.startsWith("* ")) {
                      return (
                        <div key={i} style={{ paddingLeft: 12, marginBottom: 2 }}>
                          <span style={{ color: C.textDim }}>•</span> {line.replace(/^[-*]\s*/, "")}
                        </div>
                      );
                    }
                    if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
                    // Bold in inline text
                    const boldParts = line.split("**");
                    if (boldParts.length > 1) {
                      return (
                        <div key={i}>
                          {boldParts.map((p, j) =>
                            j % 2 === 1 ? (
                              <strong key={j} style={{ color: C.text }}>
                                {p}
                              </strong>
                            ) : (
                              <span key={j}>{p}</span>
                            ),
                          )}
                        </div>
                      );
                    }
                    return <div key={i}>{line}</div>;
                  })}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: T.fontSize.xs,
                    color: C.textDim,
                    fontStyle: "italic",
                    textAlign: "center",
                    padding: T.space[4],
                  }}
                >
                  {generatingBriefing ? "NOVA is analyzing the estimates..." : "No briefing generated yet."}
                </div>
              )}
            </div>

            {/* Manager actions */}
            {activeReview.status !== "completed" && (
              <div
                style={{
                  display: "flex",
                  gap: T.space[2],
                  paddingTop: T.space[3],
                  borderTop: `1px solid ${C.border}`,
                }}
              >
                <button
                  onClick={() => {
                    updateStatus(activeReview.id, "completed", "Review completed");
                    // Save final briefing
                    if (briefingText) setBriefing(activeReview.id, briefingText);
                    setMode("list");
                    setActiveReview(null);
                  }}
                  style={{
                    ...bt(C),
                    padding: "8px 16px",
                    fontSize: T.fontSize.xs,
                    fontWeight: 600,
                    color: "#fff",
                    background: "#30D158",
                    border: "none",
                    borderRadius: T.radius.md,
                    flex: 1,
                  }}
                >
                  Complete Review
                </button>
                <button
                  onClick={() => generateBriefing(activeReview)}
                  disabled={generatingBriefing}
                  style={{
                    ...bt(C),
                    padding: "8px 16px",
                    fontSize: T.fontSize.xs,
                    fontWeight: 600,
                    color: C.accent,
                    background: `${C.accent}10`,
                    border: `1px solid ${C.accent}30`,
                    borderRadius: T.radius.md,
                    opacity: generatingBriefing ? 0.5 : 1,
                  }}
                >
                  {generatingBriefing ? "Generating..." : "Regenerate Briefing"}
                </button>
                <button
                  onClick={() => {
                    deleteReview(activeReview.id);
                    setMode("list");
                    setActiveReview(null);
                  }}
                  style={{
                    ...bt(C),
                    padding: "8px 16px",
                    fontSize: T.fontSize.xs,
                    color: "#FF3B30",
                    background: "transparent",
                    border: `1px solid #FF3B3030`,
                    borderRadius: T.radius.md,
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
