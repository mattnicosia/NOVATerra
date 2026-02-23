import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';
import { useProjectStore } from '@/stores/projectStore';
import { useItemsStore } from '@/stores/itemsStore';
import { useTakeoffsStore } from '@/stores/takeoffsStore';
import { useSpecsStore } from '@/stores/specsStore';
import { useDrawingsStore } from '@/stores/drawingsStore';
import { callAnthropicStream, buildProjectContext, createAIAbort } from '@/utils/ai';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';
import NovaPortal from '@/components/nova/NovaPortal';

const SYSTEM_PROMPT = `You are NOVA, an expert construction estimating AI assistant embedded inside BLDG Omni. You have deep knowledge of:
- CSI MasterFormat divisions and specification sections
- RS Means cost data and industry pricing
- Construction takeoff methods and quantity surveying
- Estimating workflows: plan reading → takeoff → pricing → proposal
- Building codes, materials, and construction methods
- Value engineering and cost optimization

You have access to the user's full project context including their estimate items, takeoff measurements, specification sections, and drawing sheet list. Use this context to give specific, actionable answers.

Formatting rules:
- Be concise and direct — estimators are busy on bid day
- Use bullet points for lists
- Reference specific CSI codes when relevant (e.g., "03 30 00 Cast-in-Place Concrete")
- Reference specific sheet numbers when the user asks about drawings
- When suggesting scope items, include unit of measure and CSI code
- When discussing costs, note they are approximate and vary by location
- Never make up specific dollar amounts — say "typically $X-Y range" with ranges

You are helpful, knowledgeable, and construction-savvy. Think like a senior estimator with 20 years of experience.`;

// Quick action suggestions shown when chat is empty
const QUICK_ACTIONS = [
  { label: "What's missing from my estimate?", icon: "🔍" },
  { label: "Review my takeoff quantities", icon: "📐" },
  { label: "Suggest value engineering options", icon: "💡" },
  { label: "Check spec requirements for Division 03", icon: "📋" },
  { label: "Help me write scope exclusions", icon: "✏️" },
  { label: "Compare my costs to industry averages", icon: "📊" },
];

export default function AIChatPanel() {
  const C = useTheme();
  const T = C.T;
  const open = useUiStore(s => s.aiChatOpen);
  const setOpen = useUiStore(s => s.setAiChatOpen);
  const messages = useUiStore(s => s.aiChatMessages);
  const setMessages = useUiStore(s => s.setAiChatMessages);
  const apiKey = useUiStore(s => s.appSettings.apiKey);

  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const takeoffs = useTakeoffsStore(s => s.takeoffs);
  const specs = useSpecsStore(s => s.specs);
  const drawings = useDrawingsStore(s => s.drawings);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamText]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSend = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    if (!apiKey) {
      setMessages([...messages, { role: "user", text: msg }, { role: "assistant", text: "⚠️ No API key configured. Go to Settings to add your Anthropic API key." }]);
      setInput("");
      return;
    }

    const userMsg = { role: "user", text: msg };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    setStreamText("");

    // Build project context
    const context = buildProjectContext({ project, items, takeoffs, specs, drawings });

    // Build API messages — include context in first user message
    const apiMessages = updatedMessages.map((m, i) => {
      if (i === 0 && m.role === "user") {
        return { role: "user", content: `[Project Context]\n${context}\n\n[Question]\n${m.text}` };
      }
      // For subsequent messages, inject fresh context periodically (every 6 messages)
      if (m.role === "user" && i > 0 && i % 6 === 0) {
        return { role: "user", content: `[Updated Context]\n${context}\n\n${m.text}` };
      }
      return { role: m.role, content: m.text };
    });

    try {
      abortRef.current = createAIAbort();
      const fullText = await callAnthropicStream({
        apiKey,
        system: SYSTEM_PROMPT,
        max_tokens: 2000,
        messages: apiMessages,
        signal: abortRef.current.signal,
        onText: (t) => setStreamText(t),
      });
      setMessages([...updatedMessages, { role: "assistant", text: fullText }]);
      setStreamText("");
    } catch (err) {
      if (err.name === "AbortError") {
        // User cancelled
        if (streamText) {
          setMessages([...updatedMessages, { role: "assistant", text: streamText + "\n\n_(cancelled)_" }]);
        }
      } else {
        setMessages([...updatedMessages, { role: "assistant", text: `⚠️ ${err.message}` }]);
      }
      setStreamText("");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, messages, apiKey, project, items, takeoffs, specs, drawings, setMessages, streamText]);

  const handleStop = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  const handleClear = () => {
    setMessages([]);
    setStreamText("");
  };

  if (!open) return null;

  const panelWidth = 420;

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: panelWidth,
      background: C.bg, borderLeft: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", zIndex: 1000,
      boxShadow: `-4px 0 24px ${C.text}10`,
      fontFamily: "'DM Sans', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: `${C.accent}08`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, position: "relative",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              position: "absolute", top: -3, left: -3, right: -3, bottom: -3,
              borderRadius: "50%",
              boxShadow: loading
                ? "0 0 14px rgba(160,100,255,0.5), 0 0 28px rgba(120,60,220,0.25)"
                : "0 0 10px rgba(160,100,255,0.3), 0 0 20px rgba(100,50,220,0.1)",
              transition: "box-shadow 0.4s ease",
              pointerEvents: "none",
            }} />
            <NovaPortal size="avatar" state={loading ? "thinking" : "idle"} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>NOVA</div>
            <div style={{ fontSize: 10, color: C.textDim }}>
              {project.name ? `${project.name}` : "Project Assistant"}
              {items.length > 0 && ` • ${items.length} items`}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {messages.length > 0 && (
            <button onClick={handleClear} title="Clear conversation"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, display: "flex", color: C.textMuted }}>
              <Ic d={I.trash} size={14} color={C.textMuted} />
            </button>
          )}
          <button onClick={() => setOpen(false)} title="Close"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 6, display: "flex", color: C.textMuted }}>
            <Ic d={I.x} size={16} color={C.textMuted} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px" }}>
        {messages.length === 0 && !streamText && (
          <div style={{ padding: "20px 0" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12, margin: "0 auto 12px",
                background: `linear-gradient(135deg, ${C.accent}20, ${C.purple || C.accent}20)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Ic d={I.ai} size={24} color={C.accent} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                How can I help?
              </div>
              <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.5, maxWidth: 300, margin: "0 auto" }}>
                I have access to your project data — ask me about scope, quantities, specs, pricing, or anything estimating-related.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {QUICK_ACTIONS.map((qa, i) => (
                <button key={i} onClick={() => handleSend(qa.label)}
                  style={{
                    background: `${C.accent}08`, border: `1px solid ${C.accent}20`,
                    borderRadius: 8, padding: "10px 14px", cursor: "pointer",
                    textAlign: "left", fontSize: 12, color: C.text, fontWeight: 500,
                    display: "flex", alignItems: "center", gap: 8,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { e.target.style.background = `${C.accent}15`; e.target.style.borderColor = `${C.accent}40`; }}
                  onMouseLeave={e => { e.target.style.background = `${C.accent}08`; e.target.style.borderColor = `${C.accent}20`; }}
                >
                  <span style={{ fontSize: 14 }}>{qa.icon}</span>
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} C={C} />
        ))}

        {/* Streaming response */}
        {streamText && (
          <MessageBubble msg={{ role: "assistant", text: streamText }} C={C} streaming />
        )}

        {/* Loading indicator */}
        {loading && !streamText && (
          <div style={{ display: "flex", gap: 6, padding: "12px 0", alignItems: "center" }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: `linear-gradient(135deg, ${C.accent}, ${C.accentAlt || C.accent})`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Ic d={I.ai} size={12} color="#fff" />
            </div>
            <div style={{ display: "flex", gap: 4, padding: "0 8px" }}>
              {[0, 1, 2].map(n => (
                <div key={n} style={{
                  width: 6, height: 6, borderRadius: 3, background: C.accent,
                  opacity: 0.4, animation: `pulse 1.2s ${n * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${C.border}` }}>
        {loading && (
          <button onClick={handleStop} style={{
            width: "100%", marginBottom: 8, padding: "6px 0",
            background: `${C.orange}15`, border: `1px solid ${C.orange}30`, borderRadius: 6,
            color: C.orange, fontSize: 11, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <Ic d={I.x} size={10} color={C.orange} /> Stop generating
          </button>
        )}
        <div style={{
          display: "flex", gap: 8, alignItems: "flex-end",
          background: C.bg1 || C.bg, borderRadius: 10,
          border: `1px solid ${C.border}`, padding: "8px 12px",
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Ask about your project..."
            rows={1}
            style={{
              flex: 1, border: "none", outline: "none", resize: "none",
              background: "transparent", color: C.text, fontSize: 13,
              fontFamily: "inherit", lineHeight: 1.5, maxHeight: 120,
              padding: 0,
            }}
            onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "none",
              background: input.trim() && !loading ? C.accent : `${C.text}10`,
              color: input.trim() && !loading ? "#fff" : C.textDim,
              cursor: input.trim() && !loading ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "all 0.15s",
            }}
          >
            <Ic d={I.send} size={14} color={input.trim() && !loading ? "#fff" : C.textDim} />
          </button>
        </div>
        <div style={{ fontSize: 9, color: C.textDim, textAlign: "center", marginTop: 6, opacity: 0.6 }}>
          AI responses are estimates — always verify critical numbers
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────
function MessageBubble({ msg, C, streaming }) {
  const isUser = msg.role === "user";

  // Simple markdown-lite rendering
  const renderText = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, i) => {
      // Headers
      if (line.startsWith("### ")) return <div key={i} style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 8, marginBottom: 2 }}>{line.slice(4)}</div>;
      if (line.startsWith("## ")) return <div key={i} style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 10, marginBottom: 2 }}>{line.slice(3)}</div>;
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
            <span style={{ color: C.accent, fontWeight: 600, flexShrink: 0, minWidth: 16, textAlign: "right" }}>{numMatch[1]}.</span>
            <span>{renderInline(numMatch[2], C)}</span>
          </div>
        );
      }
      // Empty lines
      if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
      // Normal text
      return <div key={i} style={{ marginTop: 1 }}>{renderInline(line, C)}</div>;
    });
  };

  return (
    <div style={{
      display: "flex", gap: 8, marginBottom: 12,
      flexDirection: isUser ? "row-reverse" : "row",
      alignItems: "flex-start",
    }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, flexShrink: 0, marginTop: 2,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <NovaPortal size="mini" state={streaming ? "thinking" : "idle"} />
        </div>
      )}
      <div style={{
        maxWidth: "85%", padding: "10px 14px", borderRadius: 12,
        background: isUser ? C.accent : `${C.text}06`,
        color: isUser ? "#fff" : C.text,
        fontSize: 12.5, lineHeight: 1.6,
        borderBottomRightRadius: isUser ? 4 : 12,
        borderBottomLeftRadius: isUser ? 12 : 4,
      }}>
        {isUser ? msg.text : renderText(msg.text)}
        {streaming && (
          <span style={{
            display: "inline-block", width: 4, height: 14,
            background: C.accent, borderRadius: 1, marginLeft: 2,
            animation: "pulse 0.8s infinite",
            verticalAlign: "text-bottom",
          }} />
        )}
      </div>
    </div>
  );
}

// Render inline markdown (bold, code, italic)
function renderInline(text, C) {
  if (!text) return text;
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
    ].filter(Boolean).sort((a, b) => a.idx - b.idx);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const m = matches[0];
    if (m.idx > 0) parts.push(remaining.slice(0, m.idx));

    if (m.type === "bold") {
      parts.push(<strong key={key++} style={{ fontWeight: 700 }}>{m.inner}</strong>);
    } else if (m.type === "code") {
      parts.push(<code key={key++} style={{
        background: `${C.accent}12`, padding: "1px 5px", borderRadius: 4,
        fontSize: "0.92em", fontFamily: "'DM Mono', monospace", color: C.accent,
      }}>{m.inner}</code>);
    } else if (m.type === "italic") {
      parts.push(<em key={key++}>{m.inner}</em>);
    }

    remaining = remaining.slice(m.idx + m.len);
  }

  return parts.length === 1 && typeof parts[0] === "string" ? parts[0] : <>{parts}</>;
}
