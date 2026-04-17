// NovaChatPanel — Multi-turn AI chat console, docked at the bottom of EstimatePage.
// Collapsed by default (40px tab). Click to expand. NOVA holds full conversation
// history in novaStore so context persists across messages within the same session.
//
// Architecture:
//   chatMessages  = display list (what the user sees)
//   apiMessages   = Anthropic message array (full content blocks, passed every call)
//   Agentic loop  = tool_use → executeNovaTool → tool_result → final response

import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useNovaStore } from "@/stores/novaStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { callAnthropicStreamingWithTools, buildProjectContext, buildCachedSystem, INTERPRET_MODEL } from "@/utils/ai-core";
import { NOVA_TOOLS, executeNovaTool } from "@/utils/novaTools";
import { attachReferencedPdfs, buildUserContentWithPdfs, stripPdfBlocksFromHistory } from "@/utils/novaPdfAttach";
import { NOVA_PERSONA, getThinkingConfig } from "@/utils/novaPrompt";
import NovaPresence from "@/components/nova/NovaPresence";
import { fmt } from "@/utils/format";

const MAX_TOOL_ITERS = 5;

// ── Suggestion chips shown when chat opens on a populated estimate ──
const SUGGESTIONS = [
  "What am I missing?",
  "Show $/SF by division",
  "Is my concrete cost reasonable?",
  "Write my scope narrative",
];

export default function NovaChatPanel() {
  const C = useTheme();
  const T = C.T;

  const chatOpen     = useNovaStore(s => s.chatOpen);
  const chatMessages = useNovaStore(s => s.chatMessages);
  const chatThinking = useNovaStore(s => s.chatThinking);
  const chatEstimateId = useNovaStore(s => s.chatEstimateId);

  const items   = useItemsStore(s => s.items);
  const project = useProjectStore(s => s.project);
  const drawings = useDrawingPipelineStore(s => s.drawings);
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);

  const [input, setInput] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [thinkingActive, setThinkingActive] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // ── Clear chat when navigating to a different estimate ──
  useEffect(() => {
    if (activeEstimateId && activeEstimateId !== chatEstimateId) {
      useNovaStore.getState().clearChat(activeEstimateId);
    }
  }, [activeEstimateId, chatEstimateId]);

  // ── Auto-scroll to latest message ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, chatThinking]);

  // ── Focus input when panel opens ──
  useEffect(() => {
    if (chatOpen) setTimeout(() => inputRef.current?.focus(), 120);
  }, [chatOpen]);

  // ── System prompt — cached array, rebuilt with fresh store state each call ──
  const buildSystemPromptArray = useCallback(() => {
    const ctx = buildProjectContext({
      project: useProjectStore.getState().project,
      items: useItemsStore.getState().items,
      drawings: useDrawingPipelineStore.getState().drawings,
    });
    return buildCachedSystem(`${NOVA_PERSONA}\n\n${ctx}`);
  }, []);

  // ── Core send handler — streaming agentic loop with extended thinking ──
  const handleSend = useCallback(async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || chatThinking) return;
    setInput("");
    setStreamingText("");
    setThinkingActive(false);

    const store = useNovaStore.getState();
    store.setChatThinking(true);

    // Resolve any PDF attachments BEFORE rendering the user bubble so we can show
    // a "📎 attached: A101" chip directly in the message.
    const drawingsNow = useDrawingPipelineStore.getState().drawings;
    const pdfAttachments = await attachReferencedPdfs(text, drawingsNow);
    const attachedLabels = pdfAttachments.map(a => a.drawing.sheetNumber || a.drawing.label || "Sheet");

    // Hand off PDFs to the sub-agent layer so NOVA-Plans can attach them when
    // consulted. Cleared in finally to avoid leaking into the next turn.
    globalThis.__novaPendingPdfs = pdfAttachments;

    store.appendDisplayMessage({
      role: "user",
      text,
      attachedDrawings: attachedLabels.length ? attachedLabels : undefined,
      ts: Date.now(),
    });

    const thinkingConfig = getThinkingConfig(text);

    try {
      const systemArr = buildSystemPromptArray();
      // Strip PDFs from older user turns — only the current turn carries documents
      const cleanedHistory = stripPdfBlocksFromHistory(store.apiMessages);
      const userContent = buildUserContentWithPdfs(text, pdfAttachments);
      let currentApiMsgs = [...cleanedHistory, { role: "user", content: userContent }];
      const toolActions = [];
      let finalText = "";

      for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
        const response = await callAnthropicStreamingWithTools({
          model: INTERPRET_MODEL,
          // When thinking is enabled, max_tokens must cover budget + output
          max_tokens: thinkingConfig ? 12000 : 2000,
          system: systemArr,
          messages: currentApiMsgs,
          tools: NOVA_TOOLS,
          thinking: thinkingConfig,
          onThinking: () => { setThinkingActive(true); setStreamingText(""); },
          onText: (t) => { setThinkingActive(false); setStreamingText(t); },
        });

        const { content, stop_reason, text: responseText } = response;
        const toolUses = content.filter(c => c.type === "tool_use");

        // Preserve full content (including thinking blocks) in multi-turn history
        currentApiMsgs = [...currentApiMsgs, { role: "assistant", content }];

        if (toolUses.length === 0 || stop_reason === "end_turn") {
          finalText = responseText;
          break;
        }

        // Execute tools in parallel — Promise.all so multiple consult_specialist
        // calls (or any independent tools) actually fan out simultaneously.
        setStreamingText("");
        setThinkingActive(toolUses.some(tu => tu.name === "consult_specialist"));
        const executedAll = await Promise.all(
          toolUses.map(async tu => {
            let result;
            try { result = await executeNovaTool(tu.name, tu.input); }
            catch (toolErr) { result = { error: toolErr.message }; }
            return { tu, result };
          }),
        );
        const toolResultBlocks = [];
        for (const { tu, result } of executedAll) {
          toolActions.push({ toolName: tu.name, input: tu.input, result });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: typeof result === "string" ? result : JSON.stringify(result),
          });
        }
        setThinkingActive(false);

        currentApiMsgs = [...currentApiMsgs, { role: "user", content: toolResultBlocks }];
        if (iter === MAX_TOOL_ITERS - 1) finalText = responseText || "Done.";
      }

      setStreamingText("");
      setThinkingActive(false);
      useNovaStore.getState().setApiMessages(currentApiMsgs);
      useNovaStore.getState().appendDisplayMessage({
        role: "assistant",
        text: finalText,
        toolActions,
        ts: Date.now(),
      });
    } catch (err) {
      setStreamingText("");
      setThinkingActive(false);
      useNovaStore.getState().appendDisplayMessage({
        role: "assistant",
        text: `Something went wrong: ${err.message}`,
        ts: Date.now(),
        error: true,
      });
    } finally {
      useNovaStore.getState().setChatThinking(false);
      globalThis.__novaPendingPdfs = [];
    }
  }, [input, chatThinking, buildSystemPromptArray]);

  const handleKeyDown = useCallback(e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const toggle = useCallback(() => {
    useNovaStore.getState().setChatOpen(!chatOpen);
  }, [chatOpen]);

  // ── Estimate summary for the tab bar context line ──
  const itemCount = items.length;
  const total = items.reduce((s, i) => {
    const u = (i.material || 0) + (i.labor || 0) + (i.equipment || 0) + (i.subcontractor || 0);
    return s + u * (i.quantity || 0);
  }, 0);
  const contextLine = itemCount > 0
    ? `${project?.name || "Estimate"} · ${itemCount} items · $${fmt(Math.round(total))}`
    : project?.name || "No estimate loaded";

  // ── Colours ──
  const bg        = C.isDark ? "#11111B" : "#F8F8FB";
  const surface   = C.isDark ? "#1A1A24" : "#FFFFFF";
  const border    = C.isDark ? "#25253A" : "#E4E4EF";
  const accent    = C.accent || "#7C6BF0";
  const textPri   = C.text;
  const textSec   = C.textDim;
  const green     = "#22C55E";
  const amber     = "#F59E0B";

  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: `1px solid ${border}`,
        background: bg,
        display: "flex",
        flexDirection: "column",
        height: chatOpen ? 320 : 40,
        transition: "height 220ms cubic-bezier(0.16,1,0.3,1)",
        overflow: "hidden",
      }}
    >
      {/* ── Tab bar ── */}
      <div
        onClick={toggle}
        style={{
          height: 40,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: 8,
          cursor: "pointer",
          userSelect: "none",
          borderBottom: chatOpen ? `1px solid ${border}` : "1px solid transparent",
        }}
      >
        {/* Orb — canonical NOVA presence, state-driven */}
        <NovaPresence
          size={20}
          accent={accent}
          state={
            thinkingActive ? "thinking"
            : streamingText ? "speaking"
            : chatThinking  ? "thinking"
            : chatOpen      ? "sensing"
            : "dormant"
          }
          trackCursor={chatOpen && !chatThinking}
          live
        />

        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: accent,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          fontFamily: T.font.sans,
        }}>
          NOVA
        </span>

        {chatOpen ? (
          <span style={{ fontSize: 11, color: textSec, fontFamily: T.font.sans }}>
            {contextLine}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: textSec, fontFamily: T.font.sans }}>
            — Ask anything about this estimate
          </span>
        )}

        {/* Live dot */}
        <div style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: green,
          boxShadow: `0 0 4px ${green}99`,
          marginLeft: "auto",
          marginRight: 4,
        }} />

        <span style={{ fontSize: 10, color: textSec, transform: chatOpen ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 200ms" }}>
          ▲
        </span>
      </div>

      {/* ── Messages ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Empty state — show suggestions */}
        {chatMessages.length === 0 && !chatThinking && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12, color: textSec, fontFamily: T.font.sans }}>
              {itemCount > 0 ? "Ready. Try asking:" : "Load an estimate to get started."}
            </span>
            {itemCount > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    style={{
                      background: surface,
                      border: `1px solid ${border}`,
                      borderRadius: 20,
                      padding: "4px 10px",
                      fontSize: 11,
                      color: textSec,
                      cursor: "pointer",
                      fontFamily: T.font.sans,
                      transition: "all 100ms",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = `${accent}66`;
                      e.currentTarget.style.color = accent;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = border;
                      e.currentTarget.style.color = textSec;
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Message list */}
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ display: "flex", gap: 7, flexDirection: msg.role === "user" ? "row-reverse" : "row", alignItems: "flex-start" }}>
            {/* Avatar */}
            {msg.role === "assistant" ? (
              <div style={{ width: 20, height: 20, marginTop: 1 }}>
                <NovaPresence size={20} accent={accent} state="dormant" live={false} />
              </div>
            ) : (
              <div style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, fontWeight: 700, marginTop: 1,
                background: surface, border: `1px solid ${border}`, color: textSec,
              }}>
                S
              </div>
            )}

            {/* Bubble */}
            <div style={{
              maxWidth: "75%",
              padding: "8px 11px",
              borderRadius: msg.role === "user" ? "10px 2px 10px 10px" : "2px 10px 10px 10px",
              fontSize: 13,
              lineHeight: 1.5,
              fontFamily: T.font.sans,
              ...(msg.role === "user"
                ? { background: `${accent}18`, border: `1px solid ${accent}33`, color: textPri }
                : { background: surface, border: `1px solid ${border}`, color: textPri }),
              ...(msg.error ? { border: `1px solid #EF444440`, color: "#EF4444" } : {}),
            }}>
              {msg.text}

              {/* PDF attachments — show what was sent to NOVA */}
              {msg.attachedDrawings?.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {msg.attachedDrawings.map((label, k) => (
                    <span key={k} style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: accent,
                      background: `${accent}1A`,
                      border: `1px solid ${accent}40`,
                      borderRadius: 10,
                      padding: "2px 7px",
                      letterSpacing: "0.02em",
                      fontFamily: T.font.sans,
                    }}>
                      📎 {label}
                    </span>
                  ))}
                </div>
              )}

              {/* Tool action cards */}
              {msg.toolActions?.length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  {msg.toolActions.map((ta, j) => (
                    <ToolActionCard key={j} action={ta} accent={accent} surface={C.isDark ? "#08090E" : "#F0F0F8"} border={border} green={green} amber={amber} textSec={textSec} font={T.font} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming text — live response bubble */}
        {streamingText && !chatThinking && (
          <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <div style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }}>
              <NovaPresence size={20} accent={accent} state="speaking" live={false} />
            </div>
            <div style={{
              maxWidth: "75%", padding: "8px 11px", fontSize: 13, lineHeight: 1.5,
              fontFamily: T.font.sans, borderRadius: "2px 10px 10px 10px",
              background: surface, border: `1px solid ${accent}44`, color: textPri,
            }}>
              {streamingText}
              <span style={{ display: "inline-block", width: 2, height: "1em", background: accent, marginLeft: 2, verticalAlign: "middle", animation: "novaCursor 0.8s step-end infinite" }} />
            </div>
          </div>
        )}

        {/* Thinking indicator — extended reasoning active */}
        {thinkingActive && (
          <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <div style={{ width: 22, height: 22, flexShrink: 0 }}>
              <NovaPresence size={22} accent={accent} state="thinking" live={false} />
            </div>
            <div style={{
              padding: "8px 12px", background: surface, border: `1px solid ${accent}33`,
              borderRadius: "2px 10px 10px 10px", display: "flex", alignItems: "center", gap: 7,
            }}>
              <span style={{ fontSize: 11, color: accent, fontFamily: T.font.sans, fontWeight: 500, letterSpacing: "0.03em" }}>
                NOVA is thinking
              </span>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 3, height: 3, borderRadius: "50%", background: accent,
                  animation: `novaDotBounce 1.4s ease-in-out ${i * 0.25}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Standard thinking indicator — waiting for first token */}
        {chatThinking && !thinkingActive && !streamingText && (
          <div style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <div style={{ width: 20, height: 20, flexShrink: 0 }}>
              <NovaPresence size={20} accent={accent} state="thinking" live={false} />
            </div>
            <div style={{
              padding: "10px 12px", background: surface, border: `1px solid ${border}`,
              borderRadius: "2px 10px 10px 10px", display: "flex", gap: 4, alignItems: "center",
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: "50%", background: accent,
                  animation: `novaDotBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input bar ── */}
      <div style={{
        padding: "8px 12px",
        borderTop: `1px solid ${border}`,
        display: "flex",
        alignItems: "center",
        gap: 7,
        flexShrink: 0,
      }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={'Ask NOVA — "What am I missing?" "Add vapor barrier" "Show $/SF by division"'}
          disabled={chatThinking}
          style={{
            flex: 1,
            background: surface,
            border: `1px solid ${border}`,
            borderRadius: 7,
            padding: "7px 11px",
            fontSize: 12,
            color: textPri,
            outline: "none",
            fontFamily: T.font.sans,
            opacity: chatThinking ? 0.5 : 1,
          }}
          onFocus={e => (e.target.style.borderColor = `${accent}80`)}
          onBlur={e => (e.target.style.borderColor = border)}
        />
        <button
          onClick={() => handleSend()}
          disabled={!input.trim() || chatThinking}
          style={{
            width: 30,
            height: 30,
            borderRadius: 7,
            background: input.trim() && !chatThinking ? accent : `${accent}40`,
            border: "none",
            cursor: input.trim() && !chatThinking ? "pointer" : "default",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 100ms",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M10.5 6L1.5 1.5l1.5 4.5-1.5 4.5 9-4.5z" fill="white" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes novaDotBounce {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        @keyframes novaCursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes novaThinkPulse {
          0%, 100% { box-shadow: 0 0 8px ${accent}99; }
          50% { box-shadow: 0 0 18px ${accent}; }
        }
      `}</style>
    </div>
  );
}

// ── Tool action card — shown inside assistant messages after tool use ──
function ToolActionCard({ action, accent, surface, border, green, amber, textSec, font }) {
  const { toolName, input: toolInput, result } = action;

  const specialistLabel = toolName === "consult_specialist" ? (result?.label || toolInput?.specialist || "Specialist") : null;

  const label = specialistLabel
    ? `Consulted: ${specialistLabel}`
    : {
        add_line_items:    "Added to Estimate",
        update_line_items: "Updated",
        remove_line_items: "Removed",
        search_cost_database: "Cost DB",
        search_proposals:  "Historical Data",
        search_my_history: "My Past Work",
        calculate_totals:  "Totals",
        query_project_info: "Project Info",
      }[toolName] || toolName;

  const labelColor = specialistLabel
    ? accent
    : {
        add_line_items:    green,
        update_line_items: accent,
        remove_line_items: "#EF4444",
        search_cost_database: amber,
        search_proposals:  amber,
        search_my_history: green,
        calculate_totals:  accent,
      }[toolName] || textSec;

  // Summarise what was added/updated for display
  let summary = null;
  if (toolName === "add_line_items" && toolInput?.items?.length) {
    const itemsAdded = toolInput.items;
    const costSum = itemsAdded.reduce((s, i) => {
      const u = (i.material || 0) + (i.labor || 0) + (i.equipment || 0) + (i.subcontractor || 0);
      return s + u * (i.quantity || 1);
    }, 0);
    summary = (
      <div>
        {itemsAdded.slice(0, 3).map((it, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 3 }}>
            <span style={{ color: textSec }}>{it.description}</span>
            <span style={{ fontFamily: font.mono || "monospace", fontSize: 10, color: textSec }}>{it.code}</span>
          </div>
        ))}
        {costSum > 0 && (
          <div style={{ marginTop: 5, fontSize: 11, color: green, fontWeight: 600 }}>
            +${Math.round(costSum).toLocaleString()}
          </div>
        )}
      </div>
    );
  } else if (toolName === "update_line_items" && result?.updated) {
    summary = (
      <div style={{ fontSize: 11, color: textSec }}>
        {result.updated} item{result.updated !== 1 ? "s" : ""} updated
      </div>
    );
  } else if (toolName === "remove_line_items") {
    const ids = toolInput?.item_ids || [];
    summary = (
      <div style={{ fontSize: 11, color: textSec }}>
        {ids.length} item{ids.length !== 1 ? "s" : ""} removed
      </div>
    );
  } else if (toolName === "calculate_totals" && result) {
    const resText = typeof result === "string" ? result : JSON.stringify(result);
    summary = <div style={{ fontSize: 11, color: textSec, whiteSpace: "pre-wrap" }}>{resText.slice(0, 200)}</div>;
  } else if (toolName === "consult_specialist") {
    const q = toolInput?.query;
    const t = result?.text;
    const err = result?.error;
    summary = (
      <div style={{ fontSize: 11, color: textSec, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
        {q && <div style={{ opacity: 0.75, fontStyle: "italic", marginBottom: 4 }}>“{q}”</div>}
        {err ? <div style={{ color: "#EF4444" }}>Error: {err}</div> : (t || "").slice(0, 400)}
        {(t || "").length > 400 && <span style={{ opacity: 0.6 }}>…</span>}
      </div>
    );
  }

  return (
    <div style={{
      background: surface,
      border: `1px solid ${border}`,
      borderLeft: `3px solid ${labelColor}`,
      borderRadius: 7,
      padding: "8px 10px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10,
        fontWeight: 700,
        color: labelColor,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        fontFamily: font.sans,
        marginBottom: summary ? 5 : 0,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: "50%", background: labelColor }} />
        {label}
      </div>
      {summary}
    </div>
  );
}
