import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useSpecsStore } from "@/stores/specsStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useDrawingsStore } from "@/stores/drawingsStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";
import { nn, fmt2 } from "@/utils/format";
import { hasAllowance, getAllowanceFields, getItemAllowanceTotal, generateAllowanceNote } from "@/utils/allowances";
import { callAnthropicStream, buildProjectContext } from "@/utils/ai";

export default function NotesPanel({ inline = false }) {
  const C = useTheme();
  const T = C.T;
  const exclusions = useSpecsStore(s => s.exclusions);
  const setExclusions = useSpecsStore(s => s.setExclusions);
  const addExclusion = useSpecsStore(s => s.addExclusion);
  const removeExclusion = useSpecsStore(s => s.removeExclusion);
  const clarifications = useSpecsStore(s => s.clarifications);
  const addClarification = useSpecsStore(s => s.addClarification);
  const updateClarification = useSpecsStore(s => s.updateClarification);
  const removeClarification = useSpecsStore(s => s.removeClarification);
  const aiExclusionLoading = useSpecsStore(s => s.aiExclusionLoading);
  const items = useItemsStore(s => s.items);
  const setShowNotesPanel = useUiStore(s => s.setShowNotesPanel);
  const showToast = useUiStore(s => s.showToast);

  const project = useProjectStore(s => s.project);
  const specs = useSpecsStore(s => s.specs);
  const drawings = useDrawingsStore(s => s.drawings);
  const [tab, setTab] = useState("exclusions");
  const allowanceItems = items.filter(hasAllowance);
  const catColors = { note: C.green, clarification: C.blue, qualification: C.purple };

  // AI RFI Generator
  const [rfiLoading, setRfiLoading] = useState(false);
  const [rfis, setRfis] = useState([]);
  const [rfiStream, setRfiStream] = useState("");

  const generateRFIs = async () => {
    setRfiLoading(true);
    setRfis([]);
    setRfiStream("");
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
        onText: t => setRfiStream(t),
      });
      setRfiStream("");
      // Parse the RFIs from the text
      const rfiBlocks = fullText.split(/\*\*RFI #\d+/).filter(b => b.trim());
      const parsed = rfiBlocks
        .map((block, i) => {
          const subjectMatch = block.match(/:\s*(.+?)\*\*/);
          const refMatch = block.match(/Reference:\s*(.+?)(?:\n|$)/);
          const impactMatch = block.match(/Impact:\s*(.+?)(?:\n|$)/);
          const lines = block
            .split("\n")
            .filter(l => l.trim() && !l.startsWith("**") && !l.startsWith("Reference:") && !l.startsWith("Impact:"));
          return {
            id: i + 1,
            subject: subjectMatch?.[1]?.trim() || `RFI ${i + 1}`,
            reference: refMatch?.[1]?.trim() || "",
            question: lines.join("\n").trim(),
            impact: impactMatch?.[1]?.trim() || "",
          };
        })
        .filter(r => r.subject && r.question);
      setRfis(
        parsed.length > 0
          ? parsed
          : [{ id: 1, subject: "Review Complete", reference: "", question: fullText, impact: "" }],
      );
    } catch (err) {
      showToast(`RFI error: ${err.message}`, "error");
    } finally {
      setRfiLoading(false);
    }
  };

  const copyRFI = rfi => {
    const text = `RFI #${rfi.id}: ${rfi.subject}\nReference: ${rfi.reference}\n\n${rfi.question}\n\nImpact: ${rfi.impact}`;
    navigator.clipboard.writeText(text);
    showToast("RFI copied to clipboard");
  };

  const copyAllRFIs = () => {
    const text = rfis
      .map(r => `RFI #${r.id}: ${r.subject}\nReference: ${r.reference}\n\n${r.question}\n\nImpact: ${r.impact}`)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    showToast(`${rfis.length} RFIs copied to clipboard`);
  };

  const addRFIToClarifications = rfi => {
    addClarification("clarification");
    // Get the newly added clarification and update its text
    setTimeout(() => {
      const allClars = useSpecsStore.getState().clarifications;
      const last = allClars[allClars.length - 1];
      if (last) updateClarification(last.id, "text", `RFI: ${rfi.subject}\nRef: ${rfi.reference}\n${rfi.question}`);
    }, 50);
    showToast("Added to clarifications");
  };

  const handleCopyAllowances = () => {
    const text = allowanceItems.map((it, i) => `${i + 1}. ${generateAllowanceNote(it)}`).join("\n");
    navigator.clipboard.writeText(text);
    showToast("Allowance notes copied");
  };

  return (
    <>
      {/* Backdrop overlay — skip in inline mode */}
      {!inline && (
        <div
          onClick={() => setShowNotesPanel(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.25)",
            zIndex: (T.z.overlay || 100) - 1,
            animation: "fadeIn 0.15s ease-out",
          }}
        />
      )}
      <div
        style={
          inline
            ? {
                position: "relative",
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: "transparent",
              }
            : {
                position: "fixed",
                right: 0,
                top: 52,
                bottom: 0,
                width: 420,
                background: C.glassBg || C.bg1,
                backdropFilter: T.glass?.blur || "blur(16px)",
                WebkitBackdropFilter: T.glass?.blur || "blur(16px)",
                borderLeft: `1px solid ${C.glassBorder || C.border}`,
                boxShadow: "-8px 0 30px rgba(0,0,0,0.25), -2px 0 8px rgba(0,0,0,0.1)",
                zIndex: T.z.overlay || 100,
                display: "flex",
                flexDirection: "column",
                animation: "slideIn 0.2s ease-out",
              }
        }
      >
        {/* Header — hidden in inline mode (parent has its own toggle) */}
        {!inline && (
          <div
            style={{
              padding: "12px 16px",
              borderBottom: `1px solid ${C.glassBorder || C.border}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: `linear-gradient(180deg, ${C.accent}08 0%, transparent 100%)`,
            }}
          >
            <h3
              style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: T.font.sans }}
            >
              Notes & Exclusions
            </h3>
            <button
              onClick={() => setShowNotesPanel(false)}
              style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer" }}
            >
              <Ic d={I.x} size={16} />
            </button>
          </div>
        )}

        {/* Tabs — pill style, title case */}
        <div style={{ display: "flex", gap: 4, padding: "8px 12px", borderBottom: `1px solid ${C.border}` }}>
          {[
            { key: "allowances", label: "Allowances", count: allowanceItems.length, color: C.orange },
            { key: "notes", label: "Notes", count: clarifications.length, color: C.blue },
            { key: "rfis", label: "RFIs", count: rfis.length, color: C.accent },
            { key: "exclusions", label: "Exclusions", count: exclusions.length, color: C.purple },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1,
                padding: "6px 4px",
                fontSize: 11,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                fontFamily: T.font.sans,
                background: tab === t.key ? `${t.color}15` : "transparent",
                color: tab === t.key ? t.color : C.textDim,
                borderRadius: 6,
                transition: "all 0.15s",
              }}
            >
              {t.label}{" "}
              {t.count > 0 && (
                <span
                  style={{
                    background: `${t.color}25`,
                    padding: "1px 5px",
                    borderRadius: 8,
                    fontSize: 10,
                    marginLeft: 3,
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {/* EXCLUSIONS TAB */}
          {tab === "exclusions" && (
            <div>
              {exclusions.map(ex => (
                <div
                  key={ex.id}
                  style={{
                    marginBottom: 8,
                    borderLeft: `3px solid ${C.purple}`,
                    padding: "6px 10px",
                    background: `${C.purple}06`,
                    borderRadius: 4,
                  }}
                >
                  {ex.description && (
                    <div style={{ fontSize: 11, color: C.textDim, marginBottom: 3 }}>
                      {ex.code && <span style={{ color: C.purple, fontWeight: 600 }}>{ex.code} </span>}
                      {ex.description}
                    </div>
                  )}
                  <textarea
                    value={ex.aiText || ex.text || ""}
                    onChange={e => {
                      const updated = exclusions.map(x => (x.id === ex.id ? { ...x, aiText: e.target.value } : x));
                      setExclusions(updated);
                    }}
                    placeholder="Exclusion text..."
                    rows={2}
                    style={inp(C, {
                      width: "100%",
                      fontSize: 12,
                      padding: "5px 8px",
                      resize: "vertical",
                      minHeight: 36,
                    })}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
                    {ex.source && (
                      <span
                        style={{
                          fontSize: 10,
                          color: C.textDim,
                          background: C.bg2,
                          padding: "1px 6px",
                          borderRadius: 3,
                        }}
                      >
                        {ex.source}
                      </span>
                    )}
                    <button
                      onClick={() => removeExclusion(ex.id)}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: C.textDim,
                        cursor: "pointer",
                        fontSize: 11,
                        opacity: 0.6,
                      }}
                    >
                      <Ic d={I.trash} size={10} /> Remove
                    </button>
                  </div>
                </div>
              ))}
              {aiExclusionLoading && (
                <div style={{ padding: 10, textAlign: "center", fontSize: 12, color: C.accent }}>
                  AI generating exclusion text...
                </div>
              )}
              <button
                onClick={() => addExclusion({ text: "", source: "manual" })}
                style={bt(C, {
                  background: "transparent",
                  border: `1px dashed ${C.purple}40`,
                  color: C.purple,
                  padding: "5px 12px",
                  fontSize: 12,
                  width: "100%",
                  marginTop: 4,
                })}
              >
                <Ic d={I.plus} size={10} /> Add Exclusion
              </button>
            </div>
          )}

          {/* ALLOWANCES TAB */}
          {tab === "allowances" && (
            <div>
              {allowanceItems.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: C.textDim, fontSize: 12 }}>
                  No allowance items. Flag cost cells with the "A" button on estimate items.
                </div>
              )}
              {allowanceItems.map(item => {
                const fields = getAllowanceFields(item);
                const total = getItemAllowanceTotal(item);
                return (
                  <div
                    key={item.id}
                    style={{
                      marginBottom: 8,
                      borderLeft: `3px solid ${C.orange}`,
                      padding: "6px 10px",
                      background: `${C.orange}06`,
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{item.description}</div>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                      {item.code && <span style={{ color: C.purple }}>{item.code} </span>}Flagged: {fields.join(", ")}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: C.orange,
                        fontWeight: 600,
                        marginTop: 3,
                        fontFeatureSettings: "'tnum'",
                      }}
                    >
                      Total: {fmt2(total)}
                      {nn(item.allowanceSubMarkup) > 0 && ` (+${item.allowanceSubMarkup}% markup)`}
                    </div>
                    <div
                      style={{ fontSize: 11, color: C.textMuted, marginTop: 3, lineHeight: 1.4, fontStyle: "italic" }}
                    >
                      {generateAllowanceNote(item)}
                    </div>
                  </div>
                );
              })}
              {allowanceItems.length > 0 && (
                <button
                  onClick={handleCopyAllowances}
                  style={bt(C, {
                    background: "transparent",
                    border: `1px solid ${C.orange}40`,
                    color: C.orange,
                    padding: "5px 12px",
                    fontSize: 12,
                    width: "100%",
                    marginTop: 4,
                  })}
                >
                  <Ic d={I.copy} size={10} /> Copy All Allowance Notes
                </button>
              )}
            </div>
          )}

          {/* NOTES & CLARIFICATIONS TAB */}
          {tab === "notes" && (
            <div>
              {clarifications.map(c => (
                <div
                  key={c.id}
                  style={{
                    marginBottom: 8,
                    borderLeft: `3px solid ${catColors[c.category] || C.blue}`,
                    padding: "6px 10px",
                    background: `${catColors[c.category] || C.blue}06`,
                    borderRadius: 4,
                  }}
                >
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                    <select
                      value={c.category || ""}
                      onChange={e => updateClarification(c.id, "category", e.target.value)}
                      style={inp(C, { padding: "2px 6px", fontSize: 11, fontWeight: 600, width: 100 })}
                    >
                      <option value="note">Note</option>
                      <option value="clarification">Clarification</option>
                      <option value="qualification">Qualification</option>
                    </select>
                    <button
                      onClick={() => removeClarification(c.id)}
                      style={{
                        marginLeft: "auto",
                        border: "none",
                        background: "transparent",
                        color: C.red,
                        cursor: "pointer",
                        opacity: 0.6,
                      }}
                    >
                      <Ic d={I.trash} size={10} />
                    </button>
                  </div>
                  <textarea
                    value={c.text}
                    onChange={e => updateClarification(c.id, "text", e.target.value)}
                    placeholder="Enter text..."
                    rows={2}
                    style={inp(C, {
                      width: "100%",
                      fontSize: 12,
                      padding: "5px 8px",
                      resize: "vertical",
                      minHeight: 36,
                    })}
                  />
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {["note", "clarification", "qualification"].map(cat => (
                  <button
                    key={cat}
                    onClick={() => addClarification(cat)}
                    style={bt(C, {
                      flex: 1,
                      background: "transparent",
                      border: `1px dashed ${catColors[cat]}40`,
                      color: catColors[cat],
                      padding: "5px 4px",
                      fontSize: 11,
                      textTransform: "capitalize",
                    })}
                  >
                    <Ic d={I.plus} size={9} /> {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* RFI TAB */}
          {tab === "rfis" && (
            <div>
              <div
                style={{
                  marginBottom: 10,
                  padding: "10px 12px",
                  background: `${C.accent}06`,
                  borderRadius: 6,
                  border: `1px solid ${C.accent}15`,
                }}
              >
                <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>
                  AI analyzes your specs, drawings, and estimate for ambiguities, conflicts, and missing information —
                  then generates professional RFIs ready to send to the architect.
                </div>
                <button
                  onClick={generateRFIs}
                  disabled={rfiLoading}
                  style={bt(C, {
                    width: "100%",
                    padding: "8px 0",
                    fontSize: 12,
                    fontWeight: 700,
                    background: rfiLoading ? C.bg3 : `linear-gradient(135deg, ${C.accent}, ${C.purple || C.accent})`,
                    color: rfiLoading ? C.textDim : "#fff",
                    boxShadow: rfiLoading ? "none" : `0 2px 8px ${C.accent}30`,
                  })}
                >
                  {rfiLoading ? (
                    <>
                      <span
                        style={{
                          display: "inline-block",
                          width: 12,
                          height: 12,
                          border: "2px solid #fff3",
                          borderTop: "2px solid #fff",
                          borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
                          marginRight: 6,
                        }}
                      />{" "}
                      Analyzing Project...
                    </>
                  ) : (
                    <>
                      <Ic d={I.ai} size={13} color="#fff" /> Generate RFIs
                    </>
                  )}
                </button>
              </div>

              {/* Streaming text while generating */}
              {rfiLoading && rfiStream && (
                <div
                  style={{
                    padding: 10,
                    fontSize: 11,
                    color: C.textDim,
                    lineHeight: 1.6,
                    background: C.bg,
                    borderRadius: 6,
                    border: `1px solid ${C.border}`,
                    whiteSpace: "pre-wrap",
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {rfiStream}
                  <span
                    style={{
                      display: "inline-block",
                      width: 4,
                      height: 12,
                      background: C.accent,
                      borderRadius: 1,
                      animation: "pulse 0.8s infinite",
                      verticalAlign: "text-bottom",
                      marginLeft: 2,
                    }}
                  />
                </div>
              )}

              {/* Generated RFIs */}
              {rfis.length > 0 && (
                <>
                  <div
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.accent }}>{rfis.length} RFIs Generated</span>
                    <button
                      onClick={copyAllRFIs}
                      style={bt(C, {
                        background: `${C.accent}12`,
                        border: `1px solid ${C.accent}30`,
                        color: C.accent,
                        padding: "3px 10px",
                        fontSize: 9,
                        fontWeight: 600,
                      })}
                    >
                      <Ic d={I.copy} size={9} color={C.accent} /> Copy All
                    </button>
                  </div>
                  {rfis.map(rfi => (
                    <div
                      key={rfi.id}
                      style={{
                        marginBottom: 10,
                        borderLeft: `3px solid ${C.accent}`,
                        padding: "8px 10px",
                        background: `${C.accent}04`,
                        borderRadius: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: 4,
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                          RFI #{rfi.id}: {rfi.subject}
                        </div>
                      </div>
                      {rfi.reference && (
                        <div
                          style={{
                            fontSize: 10,
                            color: C.purple,
                            fontWeight: 600,
                            marginBottom: 4,
                            fontFamily: T.font.sans,
                          }}
                        >
                          Ref: {rfi.reference}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: 11,
                          color: C.text,
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                          marginBottom: 4,
                        }}
                      >
                        {rfi.question}
                      </div>
                      {rfi.impact && (
                        <div style={{ fontSize: 10, color: C.orange, fontWeight: 500, fontStyle: "italic" }}>
                          Impact: {rfi.impact}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                        <button
                          onClick={() => copyRFI(rfi)}
                          title="Copy to clipboard"
                          style={bt(C, {
                            background: "transparent",
                            border: `1px solid ${C.border}`,
                            color: C.textMuted,
                            padding: "2px 8px",
                            fontSize: 9,
                          })}
                        >
                          <Ic d={I.copy} size={8} /> Copy
                        </button>
                        <button
                          onClick={() => addRFIToClarifications(rfi)}
                          title="Add to clarifications"
                          style={bt(C, {
                            background: "transparent",
                            border: `1px solid ${C.blue}30`,
                            color: C.blue,
                            padding: "2px 8px",
                            fontSize: 9,
                          })}
                        >
                          <Ic d={I.plus} size={8} /> To Notes
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      </div>
    </>
  );
}
