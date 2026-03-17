/**
 * RFIPanel — Full RFI Generator + Manager
 * Extracted from NotesPanel's internal RFI tab, enhanced with:
 * - Persistent storage (rfiStore)
 * - Status tracking (open/answered/closed)
 * - Due dates with overdue indicators
 * - Linked estimate items
 * - NOVA-assisted generation
 */
import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useRfiStore } from "@/stores/rfiStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSpecsStore } from "@/stores/specsStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, inp } from "@/utils/styles";
import { callAnthropicStream, buildProjectContext } from "@/utils/ai";

const STATUS_CONFIG = {
  open: { label: "Open", color: "orange" },
  answered: { label: "Answered", color: "green" },
  closed: { label: "Closed", color: "textDim" },
};

export default function RFIPanel() {
  const C = useTheme();
  const T = C.T;
  const estimateId = useEstimatesStore(s => s.activeEstimateId);
  const showToast = useUiStore(s => s.showToast);
  const rfis = useRfiStore(s => s.rfis);
  const loaded = useRfiStore(s => s.loaded);
  const addBulkRFIs = useRfiStore(s => s.addBulkRFIs);
  const addRFI = useRfiStore(s => s.addRFI);
  const updateRFI = useRfiStore(s => s.updateRFI);
  const setRFIStatus = useRfiStore(s => s.setRFIStatus);
  const removeRFI = useRfiStore(s => s.removeRFI);

  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const specs = useSpecsStore(s => s.specs);
  const drawings = useDrawingsStore(s => s.drawings);

  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "open" | "answered" | "closed"
  const [expandedRFI, setExpandedRFI] = useState(null);
  const [editField, setEditField] = useState(null); // "rfiId::field"

  // Load RFIs on mount
  useEffect(() => {
    if (estimateId && !loaded) useRfiStore.getState().loadRFIs(estimateId);
  }, [estimateId, loaded]);

  const filteredRFIs = useMemo(
    () => (filter === "all" ? rfis : rfis.filter(r => r.status === filter)),
    [rfis, filter],
  );

  const counts = useMemo(
    () => ({
      all: rfis.length,
      open: rfis.filter(r => r.status === "open").length,
      answered: rfis.filter(r => r.status === "answered").length,
      closed: rfis.filter(r => r.status === "closed").length,
    }),
    [rfis],
  );

  // ── AI Generate ────────────────────────────────────────────
  const generateRFIs = async () => {
    setGenerating(true);
    setStreamText("");
    try {
      const context = buildProjectContext({ project, items, specs, drawings });
      const fullText = await callAnthropicStream({
        max_tokens: 3000,
        system: `You are a senior construction estimator reviewing project documents for ambiguities, conflicts, and missing information that would require Requests for Information (RFIs) before bidding.

You analyze specs, drawings, and estimate items to find:
- Conflicts between spec sections and drawings
- Missing dimensions, details, or specifications
- Ambiguous material/product specifications
- Unclear scope boundaries between trades
- Missing or incomplete finish schedules
- Structural/architectural coordination issues
- Code compliance questions`,
        messages: [
          {
            role: "user",
            content: `Review this project for potential RFIs. Identify issues that need clarification before an accurate bid can be submitted.

${context}

For each RFI, provide:
1. A professional subject line
2. The question/concern
3. Which spec section or drawing sheet is referenced
4. Why this matters for pricing

Format each RFI as:
**RFI #X: [Subject]**
Reference: [Spec section or Sheet #]
[Question text - professional tone suitable for sending to architect]
Impact: [How this affects the bid]

Generate 5-10 RFIs, prioritized by impact on bid accuracy.`,
          },
        ],
        onText: t => setStreamText(t),
      });
      setStreamText("");
      // Parse the generated RFIs
      const rfiBlocks = fullText.split(/\*\*RFI #\d+/).filter(b => b.trim());
      const parsed = rfiBlocks
        .map((block, i) => {
          const subjectMatch = block.match(/:\s*(.+?)\*\*/);
          const refMatch = block.match(/Reference:\s*(.+?)(?:\n|$)/);
          const impactMatch = block.match(/Impact:\s*(.+?)(?:\n|$)/);
          const lines = block
            .split("\n")
            .filter(
              l =>
                l.trim() &&
                !l.startsWith("**") &&
                !l.startsWith("Reference:") &&
                !l.startsWith("Impact:"),
            );
          return {
            subject: subjectMatch?.[1]?.trim() || `RFI ${i + 1}`,
            reference: refMatch?.[1]?.trim() || "",
            question: lines.join("\n").trim(),
            impact: impactMatch?.[1]?.trim() || "",
          };
        })
        .filter(r => r.subject && r.question);

      if (parsed.length > 0) {
        addBulkRFIs(estimateId, parsed);
        showToast?.(`${parsed.length} RFIs generated`);
      }
    } catch (err) {
      showToast?.(`RFI error: ${err.message}`, "error");
    } finally {
      setGenerating(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────
  const copyRFI = rfi => {
    const text = `RFI #${rfi.number}: ${rfi.subject}\nReference: ${rfi.reference}\n\n${rfi.question}\n\nImpact: ${rfi.impact}`;
    navigator.clipboard.writeText(text);
    showToast?.("RFI copied to clipboard");
  };

  const copyAllRFIs = () => {
    const text = filteredRFIs
      .map(
        r =>
          `RFI #${r.number}: ${r.subject}\nReference: ${r.reference}\n\n${r.question}\n\nImpact: ${r.impact}`,
      )
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    showToast?.(`${filteredRFIs.length} RFIs copied`);
  };

  const handleAddManual = () => {
    addRFI(estimateId, { source: "manual" });
    const newRfi = useRfiStore.getState().rfis.at(-1);
    if (newRfi) setExpandedRFI(newRfi.id);
  };

  const isOverdue = rfi =>
    rfi.status === "open" && rfi.dateDue && new Date(rfi.dateDue).getTime() < Date.now();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Generate bar — card-style CTA */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <button
          onClick={generateRFIs}
          disabled={generating}
          style={bt(C, {
            width: "100%",
            padding: "10px 12px",
            fontSize: 11,
            fontWeight: 700,
            background: generating
              ? C.bg3
              : `linear-gradient(135deg, ${C.accent}18, ${(C.purple || C.accent)}12)`,
            color: generating ? C.textDim : C.accent,
            border: `1px solid ${generating ? C.border : C.accent + "30"}`,
            borderRadius: T.radius.md,
            boxShadow: generating ? "none" : `0 1px 4px ${C.accent}10`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          })}
        >
          {generating ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  border: `2px solid ${C.accent}30`,
                  borderTop: `2px solid ${C.accent}`,
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Analyzing specs & drawings...
            </>
          ) : (
            <>
              <Ic d={I.ai} size={12} color={C.accent} />
              <span>Generate RFIs</span>
              <span style={{ fontSize: 8, opacity: 0.6, fontWeight: 500 }}>AI</span>
            </>
          )}
        </button>
        <button
          onClick={handleAddManual}
          title="Add manual RFI"
          style={bt(C, {
            width: "100%",
            padding: "6px 10px",
            fontSize: 10,
            fontWeight: 500,
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textDim,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          })}
        >
          <Ic d={I.plus} size={9} color={C.textDim} /> Add Manual RFI
        </button>
      </div>

      {/* Streaming preview */}
      {generating && streamText && (
        <div
          style={{
            padding: 8,
            fontSize: 10,
            color: C.textDim,
            lineHeight: 1.5,
            background: C.bg,
            borderBottom: `1px solid ${C.border}`,
            whiteSpace: "pre-wrap",
            maxHeight: 120,
            overflowY: "auto",
          }}
        >
          {streamText}
          <span
            style={{
              display: "inline-block",
              width: 3,
              height: 10,
              background: C.accent,
              borderRadius: 1,
              animation: "pulse 0.8s infinite",
              verticalAlign: "text-bottom",
              marginLeft: 2,
            }}
          />
        </div>
      )}

      {/* Filter pills */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "6px 10px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        {["all", "open", "answered", "closed"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              flex: 1,
              padding: "4px 0",
              fontSize: 9,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              fontFamily: T.font.sans,
              background: filter === f ? `${C.accent}15` : "transparent",
              color: filter === f ? C.accent : C.textDim,
              borderRadius: 4,
              textTransform: "capitalize",
            }}
          >
            {f} {counts[f] > 0 && `(${counts[f]})`}
          </button>
        ))}
      </div>

      {/* RFI List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {filteredRFIs.length === 0 && !generating && (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: C.textDim,
              fontSize: 11,
              lineHeight: 1.6,
            }}
          >
            {rfis.length === 0
              ? "No RFIs yet. Click Generate to have NOVA analyze your project for potential RFIs, or add one manually."
              : `No ${filter} RFIs`}
          </div>
        )}
        {filteredRFIs.map(rfi => {
          const expanded = expandedRFI === rfi.id;
          const overdue = isOverdue(rfi);
          const statusColor = C[STATUS_CONFIG[rfi.status]?.color] || C.textDim;
          return (
            <div
              key={rfi.id}
              style={{
                marginBottom: 6,
                borderLeft: `3px solid ${overdue ? C.red : statusColor}`,
                borderRadius: 4,
                background: expanded ? `${C.accent}04` : "transparent",
                border: expanded
                  ? `1px solid ${C.accent}20`
                  : `1px solid ${C.border}40`,
                borderLeftWidth: 3,
                borderLeftColor: overdue ? C.red : statusColor,
                overflow: "hidden",
              }}
            >
              {/* RFI Header (always visible) */}
              <div
                onClick={() => setExpandedRFI(expanded ? null : rfi.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 8px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: C.textDim, flexShrink: 0 }}>
                  #{rfi.number}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.text,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {rfi.subject || "Untitled RFI"}
                </span>
                {overdue && (
                  <span
                    style={{
                      fontSize: 7,
                      padding: "1px 4px",
                      borderRadius: 2,
                      fontWeight: 700,
                      background: `${C.red}15`,
                      color: C.red,
                      flexShrink: 0,
                    }}
                  >
                    OVERDUE
                  </span>
                )}
                <span
                  style={{
                    fontSize: 7,
                    padding: "1px 5px",
                    borderRadius: 2,
                    fontWeight: 700,
                    background: `${statusColor}15`,
                    color: statusColor,
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {rfi.status}
                </span>
              </div>

              {/* Expanded detail */}
              {expanded && (
                <div style={{ padding: "0 8px 8px", fontSize: 10 }}>
                  {/* Subject (editable) */}
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Subject
                    </label>
                    <input
                      value={rfi.subject}
                      onChange={e => updateRFI(estimateId, rfi.id, "subject", e.target.value)}
                      placeholder="RFI subject..."
                      style={inp(C, { width: "100%", fontSize: 11, padding: "4px 6px", fontWeight: 600 })}
                    />
                  </div>

                  {/* Reference */}
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Reference (Spec / Drawing)
                    </label>
                    <input
                      value={rfi.reference}
                      onChange={e => updateRFI(estimateId, rfi.id, "reference", e.target.value)}
                      placeholder="Spec section or sheet #..."
                      style={inp(C, { width: "100%", fontSize: 10, padding: "3px 6px" })}
                    />
                  </div>

                  {/* Question */}
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Question
                    </label>
                    <textarea
                      value={rfi.question}
                      onChange={e => updateRFI(estimateId, rfi.id, "question", e.target.value)}
                      placeholder="Describe the issue..."
                      rows={3}
                      style={inp(C, {
                        width: "100%",
                        fontSize: 10,
                        padding: "4px 6px",
                        resize: "vertical",
                        lineHeight: 1.5,
                        fontFamily: T.font.sans,
                      })}
                    />
                  </div>

                  {/* Impact */}
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Cost Impact
                    </label>
                    <input
                      value={rfi.impact}
                      onChange={e => updateRFI(estimateId, rfi.id, "impact", e.target.value)}
                      placeholder="How this affects the bid..."
                      style={inp(C, { width: "100%", fontSize: 10, padding: "3px 6px" })}
                    />
                  </div>

                  {/* Status + Due date row */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Status
                      </label>
                      <select
                        value={rfi.status}
                        onChange={e => setRFIStatus(estimateId, rfi.id, e.target.value)}
                        style={inp(C, { width: "100%", fontSize: 10, padding: "3px 4px" })}
                      >
                        <option value="open">Open</option>
                        <option value="answered">Answered</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={rfi.dateDue}
                        onChange={e => updateRFI(estimateId, rfi.id, "dateDue", e.target.value)}
                        style={inp(C, { width: "100%", fontSize: 10, padding: "3px 4px" })}
                      />
                    </div>
                  </div>

                  {/* Responsible party */}
                  <div style={{ marginBottom: 6 }}>
                    <label style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Responsible Party
                    </label>
                    <input
                      value={rfi.responsibleParty}
                      onChange={e => updateRFI(estimateId, rfi.id, "responsibleParty", e.target.value)}
                      placeholder="Architect, engineer, owner..."
                      style={inp(C, { width: "100%", fontSize: 10, padding: "3px 6px" })}
                    />
                  </div>

                  {/* Answer (if answered) */}
                  {(rfi.status === "answered" || rfi.status === "closed") && (
                    <div style={{ marginBottom: 6 }}>
                      <label style={{ fontSize: 8, color: C.green, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        Answer
                      </label>
                      <textarea
                        value={rfi.answer}
                        onChange={e => updateRFI(estimateId, rfi.id, "answer", e.target.value)}
                        placeholder="Response received..."
                        rows={2}
                        style={inp(C, {
                          width: "100%",
                          fontSize: 10,
                          padding: "4px 6px",
                          resize: "vertical",
                          lineHeight: 1.5,
                          fontFamily: T.font.sans,
                          borderColor: `${C.green}30`,
                        })}
                      />
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <button
                      onClick={() => copyRFI(rfi)}
                      style={bt(C, {
                        background: "transparent",
                        border: `1px solid ${C.border}`,
                        color: C.textMuted,
                        padding: "3px 8px",
                        fontSize: 9,
                      })}
                    >
                      <Ic d={I.copy} size={8} /> Copy
                    </button>
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={() => {
                        if (confirm("Delete this RFI?")) removeRFI(estimateId, rfi.id);
                      }}
                      style={bt(C, {
                        background: "transparent",
                        border: `1px solid ${C.red}20`,
                        color: C.red,
                        padding: "3px 8px",
                        fontSize: 9,
                        opacity: 0.7,
                      })}
                    >
                      <Ic d={I.trash} size={8} /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: Copy all */}
      {filteredRFIs.length > 0 && (
        <div
          style={{
            padding: "6px 10px",
            borderTop: `1px solid ${C.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 9, color: C.textDim }}>
            {filteredRFIs.length} RFI{filteredRFIs.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={copyAllRFIs}
            style={bt(C, {
              background: `${C.accent}10`,
              border: `1px solid ${C.accent}25`,
              color: C.accent,
              padding: "3px 10px",
              fontSize: 9,
              fontWeight: 600,
            })}
          >
            <Ic d={I.copy} size={8} color={C.accent} /> Copy All
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
