import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useUiStore } from "@/stores/uiStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useDocumentManagementStore } from "@/stores/documentManagementStore";
import { callAnthropic, buildProjectContext } from "@/utils/ai";
import { NOVA_TOOLS, executeNovaTool } from "@/utils/novaTools";
import { novaCost } from "@/nova/agents/cost";
import { detectScopeGaps, buildScopeGapSummary } from "@/nova/predictive/scopeGapDetector";
import { motion } from "framer-motion";
import { slidePanelVariants, slidePanelTransition } from "@/utils/motion";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
// NovaSceneLazy removed — backed up in _backup/

const SYSTEM_PROMPT = `You are NOVA, an expert construction estimating AI assistant embedded inside NOVATerra. You have deep knowledge of:
- CSI MasterFormat divisions and specification sections
- RS Means cost data and industry pricing
- Construction takeoff methods and quantity surveying
- Estimating workflows: plan reading → takeoff → pricing → proposal
- Building codes, materials, and construction methods
- Value engineering and cost optimization

You have access to the user's full project context including their estimate items (with IDs), takeoff measurements, specification sections, and drawing sheet list. Use this context to give specific, actionable answers.

You also have tools to MODIFY the estimate directly:
- update_line_items: Change ANY field on existing items — CSI codes, descriptions, divisions, trades, prices, quantities, units, notes, drawing refs, spec sections, bid context. Reference items by their [id:xxx] shown in context.
- add_line_items: Add new scope items with full detail — codes, descriptions, divisions, trades, quantities, units, pricing, notes, drawing refs, specs, bid context.
- remove_line_items: Remove items by ID (always confirm with user first).

IMPORTANT: When the user asks you to modify items, ALWAYS use the appropriate tool. Never just describe changes — execute them. If the user says "change the code" or "assign to division" or "update the trade", use update_line_items with the correct fields. You can update multiple items in a single tool call.

Formatting rules:
- Be concise and direct — estimators are busy on bid day
- Use bullet points for lists
- Reference specific CSI codes when relevant (e.g., "03 30 00 Cast-in-Place Concrete")
- Reference specific sheet numbers when the user asks about drawings
- When suggesting scope items, include unit of measure and CSI code
- When discussing costs, note they are approximate and vary by location
- When providing pricing for tools, use realistic mid-range construction costs

You are helpful, knowledgeable, and construction-savvy. Think like a senior estimator with 20 years of experience.`;

// Quick action suggestions shown when chat is empty
export const QUICK_ACTIONS = [
  { label: "What's missing from my estimate?", icon: "🔍" },
  { label: "How does my pricing compare to my past projects?", icon: "📊" },
  { label: "What should drywall cost on this project?", icon: "💰" },
  { label: "What's my biggest cost risk?", icon: "⚠️" },
  { label: "Suggest value engineering options", icon: "💡" },
  { label: "Help me write scope exclusions", icon: "✏️" },
  { label: "Show me my scope gaps", icon: "🎯" },
];

export default function AIChatPanel() {
  const C = useTheme();
  const P = C.panel; // dark theme for chat
  const _T = C.T;
  const open = useUiStore(s => s.aiChatOpen);
  const setOpen = useUiStore(s => s.setAiChatOpen);
  const messages = useUiStore(s => s.aiChatMessages);
  const setMessages = useUiStore(s => s.setAiChatMessages);
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const takeoffs = useDrawingPipelineStore(s => s.takeoffs);
  const specs = useDocumentManagementStore(s => s.specs);
  const drawings = useDrawingPipelineStore(s => s.drawings);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Consume pending message from NovaBar
  const pendingMsg = useUiStore(s => s.pendingNovaMessage);
  const setPendingMsg = useUiStore(s => s.setPendingNovaMessage);

  useEffect(() => {
    if (open && pendingMsg) {
      setPendingMsg(null);
      setTimeout(() => handleSend(pendingMsg), 150);
    }
  }, [open, pendingMsg]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = useCallback(
    async text => {
      const msg = (text || input).trim();
      if (!msg || loading) return;
      const userMsg = { role: "user", text: msg };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");
      setLoading(true);

      // Build project context (includes item IDs for tool use)
      const context = buildProjectContext({ project, items, takeoffs, specs, drawings });

      // Auto-detect scope gaps and inject into context for "missing" questions
      let scopeContext = "";
      const lowerMsg = msg.toLowerCase();
      if (lowerMsg.includes("missing") || lowerMsg.includes("gap") || lowerMsg.includes("forgot") || lowerMsg.includes("complete") || lowerMsg.includes("risk") || lowerMsg.includes("coverage")) {
        try {
          const gapResult = detectScopeGaps({
            items,
            buildingType: project?.buildingType,
            workType: project?.workType,
            projectSF: project?.projectSF,
            laborType: project?.laborType,
          });
          if (gapResult.gaps.length > 0 || gapResult.completionPct > 0) {
            scopeContext = "\n\n[SCOPE GAP ANALYSIS — generated from ROM baseline vs current items]\n" + buildScopeGapSummary(gapResult);
          }
        } catch (e) {
          console.warn("[AIChatPanel] Scope gap detection failed:", e);
        }
      }

      // Build API messages — include context in first user message
      const apiMessages = updatedMessages.map((m, i) => {
        // Skip action cards in API messages
        if (m.actions) {
          return { role: "assistant", content: m.text || "Done." };
        }
        if (i === 0 && m.role === "user") {
          return { role: "user", content: `[Project Context]\n${context}${scopeContext}\n\n[Question]\n${m.text}` };
        }
        if (m.role === "user" && i > 0 && i % 6 === 0) {
          return { role: "user", content: `[Updated Context]\n${context}\n\n${m.text}` };
        }
        return { role: m.role, content: m.text };
      });

      try {
        // Multi-round tool loop — NOVA can continue processing in batches
        const MAX_TOOL_ROUNDS = 8;
        let currentMessages = [...apiMessages];
        const allTextParts = [];
        const allToolResults = [];
        let round = 0;
        let _lastResponse = null;

        while (round < MAX_TOOL_ROUNDS) {
          round++;
          // Rebuild context with fresh item state on continuation rounds
          if (round > 1) {
            const freshItems = useItemsStore.getState().items;
            const freshContext = buildProjectContext({ project, items: freshItems, takeoffs, specs, drawings });
            // Inject updated context so NOVA sees progress
            currentMessages.push({
              role: "user",
              content: `[Updated Context — round ${round}]\n${freshContext}\n\nContinue processing remaining items.`,
            });
          }

          // Augment system prompt with NOVA-Cost data context
          const costContext = novaCost.systemPrompt({
            projectSF: project?.projectSF,
            buildingType: project?.buildingType,
            workType: project?.workType,
            laborType: project?.laborType,
            zipCode: project?.zipCode,
            currentItems: useItemsStore.getState().items?.slice(0, 15),
          });
          const augmentedSystem = SYSTEM_PROMPT + "\n\n" + costContext;

          const response = await callAnthropic({
            system: augmentedSystem,
            max_tokens: 4096,
            messages: currentMessages,
            tools: NOVA_TOOLS,
          });

          // Handle plain text response — done
          if (typeof response === "string") {
            allTextParts.push(response);
            break;
          }

          if (!response?.content) break;
          _lastResponse = response;

          // Extract text and tool calls from this round
          const textParts = [];
          const toolCalls = [];
          for (const block of response.content) {
            if (block.type === "text") textParts.push(block.text);
            else if (block.type === "tool_use") toolCalls.push(block);
          }
          if (textParts.length) allTextParts.push(textParts.join("\n"));

          // No tool calls — plain text response, done
          if (toolCalls.length === 0) break;

          // Execute tool calls
          const toolResults = [];
          for (const tc of toolCalls) {
            try {
              const result = await executeNovaTool(tc.name, tc.input);
              toolResults.push({ tool_use_id: tc.id, ...result });
              allToolResults.push({ tool_use_id: tc.id, ...result });
            } catch (err) {
              toolResults.push({ tool_use_id: tc.id, success: false, message: err.message });
              allToolResults.push({ tool_use_id: tc.id, success: false, message: err.message });
            }
          }

          // Update the live message so user sees progress
          const progressMsg = {
            role: "assistant",
            text: allTextParts.join("\n\n") || `Processing... (round ${round})`,
            actions: [...allToolResults],
          };
          setMessages([...updatedMessages, progressMsg]);

          // Build tool result messages for continuation
          const toolResultContent = toolCalls.map((tc, idx) => ({
            type: "tool_result",
            tool_use_id: tc.id,
            content: JSON.stringify(toolResults[idx]),
          }));

          // Add this round to conversation history for next round
          currentMessages = [
            ...currentMessages,
            { role: "assistant", content: response.content },
            { role: "user", content: toolResultContent },
          ];

          // Check if there's more work: if all items now have divisions, stop early
          const freshItems = useItemsStore.getState().items;
          const remaining = freshItems.filter(i => !i.division || i.division === "").length;
          if (remaining === 0) {
            allTextParts.push(`All ${freshItems.length} items are now assigned.`);
            break;
          }
        }

        // Build final message
        const finalMsg = {
          role: "assistant",
          text: allTextParts.join("\n\n") || "",
          actions: allToolResults.length > 0 ? allToolResults : undefined,
        };
        setMessages([...updatedMessages, finalMsg]);
      } catch (err) {
        setMessages([...updatedMessages, { role: "assistant", text: `⚠️ ${err.message}` }]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, project, items, takeoffs, specs, drawings, setMessages],
  );

  const handleClear = () => {
    setMessages([]);
  };

  if (!open) return null;

  const panelWidth = 420;

  return (
    <motion.div
      className="no-print"
      initial="initial"
      animate="animate"
      exit="exit"
      variants={slidePanelVariants}
      transition={slidePanelTransition}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: panelWidth,
        background: P.bg,
        borderLeft: `1px solid ${P.border}`,
        display: "flex",
        flexDirection: "column",
        zIndex: 1000,
        boxShadow: `-4px 0 24px rgba(0,0,0,0.3)`,
        fontFamily: "'Switzer', -apple-system, sans-serif",
      }}
    >
      {/* Header — hero portal */}
      <div
        style={{
          borderBottom: `1px solid ${P.border}`,
          background: `${P.accent}08`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Close / Clear buttons — top right */}
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            display: "flex",
            gap: 4,
            zIndex: 2,
          }}
        >
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              title="Clear conversation"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 6,
                borderRadius: 6,
                display: "flex",
                color: P.textMuted,
              }}
            >
              <Ic d={I.trash} size={14} color={P.textMuted} />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            title="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 6,
              borderRadius: 6,
              display: "flex",
              color: P.textMuted,
            }}
          >
            <Ic d={I.x} size={16} color={P.textMuted} />
          </button>
        </div>

        {/* Hero portal + text */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "24px 20px 20px",
          }}
        >
          {/* Nova Orb — scaled to ~100px */}
          <div
            style={{
              width: 100,
              height: 100,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "visible",
            }}
          >
            <Ic d={I.ai} size={48} color={P.accent || "#8B5CF6"} />
          </div>
          {/* Label */}
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: P.text, letterSpacing: 0.3 }}>NOVA</div>
            <div style={{ fontSize: 11, color: P.textDim, marginTop: 2 }}>
              {project.name ? `${project.name}` : "Project Assistant"}
              {items.length > 0 && ` · ${items.length} items`}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
        {messages.length === 0 && !loading && (
          <div style={{ padding: "12px 0" }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: P.text, marginBottom: 4 }}>How can I help?</div>
              <div style={{ fontSize: 12, color: P.textDim, lineHeight: 1.5, maxWidth: 300, margin: "0 auto" }}>
                Ask me about scope, quantities, specs, pricing — or ask me to update your estimate directly.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {QUICK_ACTIONS.map((qa, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(qa.label)}
                  style={{
                    background: `${P.accent}08`,
                    border: `1px solid ${P.accent}20`,
                    borderRadius: 8,
                    padding: "10px 14px",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 12,
                    color: P.text,
                    fontWeight: 500,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    e.target.style.background = `${P.accent}15`;
                    e.target.style.borderColor = `${P.accent}40`;
                  }}
                  onMouseLeave={e => {
                    e.target.style.background = `${P.accent}08`;
                    e.target.style.borderColor = `${P.accent}20`;
                  }}
                >
                  <span style={{ fontSize: 14 }}>{qa.icon}</span>
                  {qa.label}
                </button>
              ))}
            </div>
            {/* Proactive scope gap indicator */}
            {(() => {
              try {
                if (!items?.length) return null;
                const gapResult = detectScopeGaps({
                  items,
                  buildingType: project?.buildingType,
                  workType: project?.workType,
                  projectSF: project?.projectSF,
                  laborType: project?.laborType,
                });
                if (gapResult.missingCount > 0) {
                  return (
                    <div style={{
                      padding: "8px 12px",
                      marginTop: 10,
                      background: `${P.accent}08`,
                      border: `1px solid ${P.accent}20`,
                      borderRadius: 6,
                      fontSize: 11,
                      color: P.text,
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 2 }}>
                        Estimate {gapResult.completionPct}% complete — {gapResult.missingCount} divisions missing
                      </div>
                      <div style={{ color: P.textDim, fontSize: 10 }}>
                        ~${Math.round(gapResult.totalMissingCost).toLocaleString()} in potential missing scope. Ask NOVA for details.
                      </div>
                    </div>
                  );
                }
              } catch { /* scope gap detection is non-critical */ }
              return null;
            })()}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            <MessageBubble msg={msg} C={P} />
            {msg.actions && <ActionCards actions={msg.actions} C={P} />}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: "flex", gap: 6, padding: "12px 0", alignItems: "center" }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: `linear-gradient(135deg, ${P.accent}, ${P.accentAlt || P.accent})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Ic d={I.ai} size={12} color="#fff" />
            </div>
            <div style={{ display: "flex", gap: 4, padding: "0 8px", alignItems: "center" }}>
              {[0, 1, 2].map(n => (
                <div
                  key={n}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: P.accent,
                    opacity: 0.4,
                    animation: `novaPulse 1.2s ${n * 0.2}s infinite`,
                  }}
                />
              ))}
              <span style={{ fontSize: 11, color: P.textMuted, marginLeft: 6 }}>Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${P.border}` }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
            background: P.bg1 || P.bg,
            borderRadius: 10,
            border: `1px solid ${P.border}`,
            padding: "8px 12px",
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about your project..."
            rows={1}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              color: P.text,
              fontSize: 13,
              fontFamily: "inherit",
              lineHeight: 1.5,
              maxHeight: 120,
              padding: 0,
            }}
            onInput={e => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: input.trim() && !loading ? P.accent : `${P.text}10`,
              color: input.trim() && !loading ? "#fff" : P.textDim,
              cursor: input.trim() && !loading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s",
            }}
          >
            <Ic d={I.send} size={14} color={input.trim() && !loading ? "#fff" : P.textDim} />
          </button>
        </div>
        <div style={{ fontSize: 9, color: P.textDim, textAlign: "center", marginTop: 6, opacity: 0.6 }}>
          NOVA can update your estimate — ask it to modify pricing or add items
        </div>
      </div>

      <style>{`
        @keyframes novaPulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </motion.div>
  );
}

// ─── Action Cards — show tool results inline ─────────────────────────
export function ActionCards({ actions, C }) {
  if (!actions || actions.length === 0) return null;

  const isCostField = f => ["material", "labor", "equipment", "subcontractor"].includes(f);
  const fmtCost = v =>
    `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div style={{ margin: "4px 0 12px 38px", animation: "novaSlideIn 0.25s ease-out" }}>
      <style>{`
        @keyframes novaSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {actions.map((action, i) => {
        // Calculate total cost impact for update actions
        let costDelta = 0;
        if (action.action === "update_line_items" && action.results) {
          action.results.forEach(r => {
            if (r.status !== "updated" || !r.before || !r.after) return;
            for (const [f, newVal] of Object.entries(r.after)) {
              if (isCostField(f)) {
                costDelta += (Number(newVal) || 0) - (Number(r.before[f]) || 0);
              }
            }
          });
        }

        return (
          <div
            key={i}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: action.success ? "rgba(52,199,89,0.08)" : "rgba(255,69,58,0.08)",
              border: `1px solid ${action.success ? "rgba(52,199,89,0.25)" : "rgba(255,69,58,0.25)"}`,
              marginBottom: 6,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: action.success ? "#34C759" : "#FF453A",
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ic d={action.success ? I.check : I.x} size={12} color={action.success ? "#34C759" : "#FF453A"} />
              {action.message}
            </div>
            {action.results?.map((r, j) => (
              <div key={j} style={{ fontSize: 10, color: C.textMuted, marginTop: 3, paddingLeft: 18 }}>
                {r.status === "updated" && r.before && (
                  <div>
                    <span style={{ fontWeight: 600, color: C.text }}>{r.description}</span>
                    {Object.entries(r.after).map(([field, val]) => (
                      <span key={field} style={{ marginLeft: 6 }}>
                        {field}:{" "}
                        <span style={{ textDecoration: "line-through", opacity: 0.5 }}>
                          {isCostField(field) ? fmtCost(r.before[field]) : r.before[field]}
                        </span>
                        {" → "}
                        <span style={{ color: "#34C759", fontWeight: 600 }}>
                          {isCostField(field) ? fmtCost(val) : val}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                {r.status === "no_change" && (
                  <div style={{ opacity: 0.5 }}>
                    <span style={{ fontWeight: 600, color: C.text }}>{r.description}</span>
                    <span style={{ marginLeft: 6, fontStyle: "italic" }}>no changes needed</span>
                  </div>
                )}
                {r.status === "added" && (
                  <div>
                    <span style={{ color: "#34C759" }}>+</span>{" "}
                    <span style={{ fontWeight: 600, color: C.text }}>{r.description}</span>
                    {r.code && <span style={{ marginLeft: 4, opacity: 0.5 }}>({r.code})</span>}
                  </div>
                )}
                {r.status === "removed" && (
                  <div>
                    <span style={{ color: "#FF453A" }}>−</span>{" "}
                    <span style={{ fontWeight: 600, color: C.text, textDecoration: "line-through", opacity: 0.5 }}>
                      {r.description}
                    </span>
                  </div>
                )}
                {r.status === "skipped" && <div style={{ opacity: 0.5, fontStyle: "italic" }}>{r.message}</div>}
                {r.status === "not_found" && <div style={{ color: "#FF453A" }}>Item not found: {r.item_id}</div>}
              </div>
            ))}
            {/* Cost impact summary for updates */}
            {costDelta !== 0 && (
              <div
                style={{
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: costDelta > 0 ? "#FF9F0A" : "#34C759",
                }}
              >
                Unit cost impact: {costDelta > 0 ? "+" : ""}
                {fmtCost(costDelta)}/unit
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────
export function MessageBubble({ msg, C, streaming }) {
  const isUser = msg.role === "user";

  // Simple markdown-lite rendering
  const renderText = text => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, i) => {
      // Headers
      if (line.startsWith("### "))
        return (
          <div key={i} style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 8, marginBottom: 2 }}>
            {line.slice(4)}
          </div>
        );
      if (line.startsWith("## "))
        return (
          <div key={i} style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 10, marginBottom: 2 }}>
            {line.slice(3)}
          </div>
        );
      // Bullet points
      if (line.startsWith("- ") || line.startsWith("• ")) {
        return (
          <div key={i} style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <span style={{ color: C.accent, fontWeight: 700, flexShrink: 0 }}>•</span>
            <span>{renderInline(line.slice(2), C)}</span>
          </div>
        );
      }
      // Numbered lists
      const numMatch = line.match(/^(\d+)\.\s(.+)/);
      if (numMatch) {
        return (
          <div key={i} style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <span style={{ color: C.accent, fontWeight: 600, flexShrink: 0, minWidth: 16, textAlign: "right" }}>
              {numMatch[1]}.
            </span>
            <span>{renderInline(numMatch[2], C)}</span>
          </div>
        );
      }
      // Empty lines
      if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
      // Normal text
      return (
        <div key={i} style={{ marginTop: 1 }}>
          {renderInline(line, C)}
        </div>
      );
    });
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 12,
        flexDirection: isUser ? "row-reverse" : "row",
        alignItems: "flex-start",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 30,
            height: 30,
            flexShrink: 0,
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ic d={I.ai} size={18} color={C.accent || "#8B5CF6"} />
        </div>
      )}
      <div
        style={{
          maxWidth: "85%",
          padding: "10px 14px",
          borderRadius: 12,
          background: isUser ? C.accent : `${C.text}06`,
          color: isUser ? "#fff" : C.text,
          fontSize: 12.5,
          lineHeight: 1.6,
          borderBottomRightRadius: isUser ? 4 : 12,
          borderBottomLeftRadius: isUser ? 12 : 4,
        }}
      >
        {isUser ? msg.text : renderText(msg.text)}
        {streaming && (
          <span
            style={{
              display: "inline-block",
              width: 4,
              height: 14,
              background: C.accent,
              borderRadius: 1,
              marginLeft: 2,
              animation: "novaPulse 0.8s infinite",
              verticalAlign: "text-bottom",
            }}
          />
        )}
      </div>
    </div>
  );
}

// Render inline markdown (bold, code, italic, sheet refs)
function renderInline(text, C) {
  const T = C.T;
  if (!text) return text;

  // Drawing sheet references — make clickable before markdown parsing
  // Match patterns like [Sheet A3.01], (Sheet A3), "Sheet S-201", Sheet A3.01
  const sheetMatch = text.match(/\[?[Ss]heet\s+([A-Z]?[\w.-]+)\]?/);
  if (sheetMatch) {
    const sheetRef = sheetMatch[1];
    const idx = text.indexOf(sheetMatch[0]);
    const before = text.slice(0, idx);
    const after = text.slice(idx + sheetMatch[0].length);

    // Find matching drawing
    const allDrawings = useDrawingPipelineStore.getState().drawings;
    const match = allDrawings.find(d =>
      d.sheetNumber === sheetRef ||
      d.sheetNumber?.replace(/[.-]/g, "") === sheetRef.replace(/[.-]/g, "") ||
      d.label?.includes(sheetRef)
    );

    return (
      <>
        {before && renderInline(before, C)}
        <span
          onClick={match ? () => {
            useDrawingPipelineStore.getState().setSelectedDrawingId(match.id);
            // Navigate to takeoffs if not already there
            if (!window.location.pathname.includes("/takeoffs")) {
              const estMatch = window.location.pathname.match(/\/estimate\/([^/]+)/);
              if (estMatch) window.location.hash = "";
              // Let drawing selection work on current page — user can navigate manually
            }
          } : undefined}
          style={{
            color: match ? (C.accent || "#8B5CF6") : (C.textDim || "#666"),
            cursor: match ? "pointer" : "default",
            fontWeight: 600,
            textDecoration: match ? "underline" : "none",
            fontSize: 11,
            padding: "1px 4px",
            borderRadius: 3,
            background: match ? `${C.accent || "#8B5CF6"}12` : "transparent",
          }}
          title={match ? `Navigate to ${match.sheetTitle || match.label}` : `Sheet not found: ${sheetRef}`}
        >
          {sheetMatch[0].replace(/[[\]]/g, "")}
        </span>
        {after && renderInline(after, C)}
      </>
    );
  }

  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    // Bold **text**
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code `text`
    const codeMatch = remaining.match(/`(.+?)`/);
    // Italic _text_
    const italicMatch = remaining.match(/(?<!\w)_(.+?)_(?!\w)/);

    // Find earliest match
    const matches = [
      boldMatch && { idx: boldMatch.index, len: boldMatch[0].length, inner: boldMatch[1], type: "bold" },
      codeMatch && { idx: codeMatch.index, len: codeMatch[0].length, inner: codeMatch[1], type: "code" },
      italicMatch && { idx: italicMatch.index, len: italicMatch[0].length, inner: italicMatch[1], type: "italic" },
    ]
      .filter(Boolean)
      .sort((a, b) => a.idx - b.idx);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const m = matches[0];
    if (m.idx > 0) parts.push(remaining.slice(0, m.idx));

    if (m.type === "bold") {
      parts.push(
        <strong key={key++} style={{ fontWeight: 700 }}>
          {m.inner}
        </strong>,
      );
    } else if (m.type === "code") {
      parts.push(
        <code
          key={key++}
          style={{
            background: `${C.accent}12`,
            padding: "1px 5px",
            borderRadius: 4,
            fontSize: "0.92em",
            fontFamily: T.font.sans,
            color: C.accent,
          }}
        >
          {m.inner}
        </code>,
      );
    } else if (m.type === "italic") {
      parts.push(<em key={key++}>{m.inner}</em>);
    }

    remaining = remaining.slice(m.idx + m.len);
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}
