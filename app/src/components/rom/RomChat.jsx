/**
 * RomChat v2 — NOVA chatbot for live ROM estimate adjustments.
 *
 * Features:
 * - Streaming responses (SSE via public proxy)
 * - Multi-turn conversation (last 8 messages as context)
 * - Conversational + JSON action hybrid (natural language + embedded mutations)
 * - Undo system (snapshot ROM state before each mutation)
 * - Quick action chips for common operations
 * - Framer Motion open/close animation
 */
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";
import { useRomStore } from "@/stores/romStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

// ─── Constants ───────────────────────────────────────────────────

const MAX_HISTORY = 8;
const MAX_UNDO = 10;

const QUICK_ACTIONS = [
  "What's my biggest cost?",
  "Cut 10% across the board",
  "Switch to union labor",
  "Remove landscaping",
  "Double the electrical",
  "Add 15% contingency",
];

const SYSTEM_PROMPT = `You are NOVA, a construction estimating AI. You help users adjust their ROM (Rough Order of Magnitude) estimate through conversation.

RESPONSE FORMAT:
Respond naturally in 1-3 concise sentences. Estimators are busy — be direct.
When making changes to the estimate, append a JSON action block at the very end:

\`\`\`json-action
{"actions": [{"type": "adjust_division", "divCode": "23", "multiplier": 1.2}]}
\`\`\`

AVAILABLE ACTIONS:
- adjust_division: {"type":"adjust_division", "divCode":"XX", "multiplier": N}
  multiplier: 1.2 = +20%, 0.8 = -20%, 0 = remove, 2.0 = double
  Can batch multiple: {"actions": [{"type":"adjust_division","divCode":"09","multiplier":1.1}, {"type":"adjust_division","divCode":"23","multiplier":0.9}]}
- For "cut X% across the board": apply multiplier to ALL divisions in one action block

DIVISION CODES:
01=General Requirements, 02=Sitework, 03=Concrete, 04=Masonry, 05=Metals,
06=Wood/Plastics, 07=Thermal/Moisture, 08=Doors/Windows, 09=Finishes,
10=Specialties, 11=Equipment, 12=Furnishings, 13=Special Construction,
14=Conveying, 21=Fire Suppression, 22=Plumbing, 23=HVAC, 26=Electrical,
27=Communications, 28=Electronic Safety, 31=Earthwork, 32=Exterior Improvements,
33=Utilities

RULES:
- Reference specific $ amounts from the estimate context
- For questions or info, respond WITHOUT an action block
- Never fabricate cost data — use the numbers provided
- If the user says "undo", respond confirming the undo (the UI handles it automatically)
- "Go union" means laborType change — tell the user this adds ~25% and suggest adjusting all divisions by 1.25
- Be conversational but efficient`;

// ─── Helpers ─────────────────────────────────────────────────────

function buildContext(rom) {
  if (!rom) return "No estimate loaded.";
  const divLines = Object.entries(rom.divisions || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, d]) => {
      const mid = d.perSF?.mid ?? 0;
      const total = d.total?.mid ?? 0;
      const conf = d.confidence || "baseline";
      return `  ${code} ${d.label}: $${mid.toFixed(2)}/SF, $${Math.round(total).toLocaleString()} (${conf}, ${d.sampleCount || 0} samples)`;
    })
    .join("\n");

  return `Building: ${rom.buildingType || rom.jobType || "unknown"}, ${rom.projectSF?.toLocaleString() || "?"} SF
Location: ${rom.location || "unknown"}
Labor: ${rom.laborType || "open-shop"} | Work: ${rom.workType || "new-construction"}
Total: $${Math.round(rom.totals?.mid || 0).toLocaleString()} ($${(rom.perSF?.mid || 0).toFixed(2)}/SF)
Range: Low $${Math.round(rom.totals?.low || 0).toLocaleString()} — High $${Math.round(rom.totals?.high || 0).toLocaleString()}
Divisions:
${divLines}`;
}

function parseResponse(fullText) {
  // Extract action block if present
  const actionMatch = fullText.match(/```json-action\s*\n([\s\S]*?)\n```/);
  let actions = [];
  let displayText = fullText;

  if (actionMatch) {
    displayText = fullText.replace(/```json-action[\s\S]*?```/g, "").trim();
    try {
      const parsed = JSON.parse(actionMatch[1]);
      actions = Array.isArray(parsed.actions) ? parsed.actions : [];
    } catch { /* malformed JSON — skip actions */ }
  } else {
    // Fallback: try to parse entire response as JSON (legacy format)
    try {
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.action === "adjust_division" && parsed.divisions) {
          actions = Object.entries(parsed.divisions).map(([divCode, multiplier]) => ({
            type: "adjust_division", divCode, multiplier,
          }));
          displayText = parsed.message || "Adjustment applied.";
        } else if (parsed.message) {
          displayText = parsed.message;
        }
      }
    } catch { /* not JSON — use as plain text */ }
  }

  return { displayText, actions };
}

function applyActions(actions, romResult, setRomResult) {
  if (!actions.length || !romResult) return [];
  const newResult = { ...romResult, divisions: { ...romResult.divisions } };
  const applied = [];

  for (const action of actions) {
    if (action.type === "adjust_division" && action.divCode && action.multiplier !== undefined) {
      const div = newResult.divisions[action.divCode];
      if (!div) continue;
      const mult = Number(action.multiplier);
      newResult.divisions[action.divCode] = {
        ...div,
        perSF: {
          low: Math.round(div.perSF.low * mult * 100) / 100,
          mid: Math.round(div.perSF.mid * mult * 100) / 100,
          high: Math.round(div.perSF.high * mult * 100) / 100,
        },
        total: {
          low: Math.round(div.total.low * mult),
          mid: Math.round(div.total.mid * mult),
          high: Math.round(div.total.high * mult),
        },
      };
      const pctChange = Math.round((mult - 1) * 100);
      const label = mult === 0 ? `Removed ${div.label}` :
        `${div.label} ${pctChange >= 0 ? "+" : ""}${pctChange}%`;
      applied.push(label);
    }
  }

  // Recalculate totals
  let low = 0, mid = 0, high = 0;
  for (const div of Object.values(newResult.divisions)) {
    low += div.total.low;
    mid += div.total.mid;
    high += div.total.high;
  }
  newResult.totals = { low: Math.round(low), mid: Math.round(mid), high: Math.round(high) };
  const sf = newResult.projectSF || 1;
  newResult.perSF = {
    low: Math.round(low / sf * 100) / 100,
    mid: Math.round(mid / sf * 100) / 100,
    high: Math.round(high / sf * 100) / 100,
  };

  setRomResult(newResult);
  return applied;
}

// ─── Component ───────────────────────────────────────────────────

export default function RomChat() {
  const C = useTheme();
  const ff = { fontFamily: "Switzer, -apple-system, sans-serif" };
  const romResult = useRomStore(s => s.romResult);
  const setRomResult = useRomStore(s => s.setRomResult);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "I'm NOVA. Ask me to adjust your estimate — \"bump HVAC 20%\", \"cut 10% across the board\", or ask about the numbers.", ts: Date.now() },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [undoStack, setUndoStack] = useState([]);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  // Auto-scroll on new messages or streaming text
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamText]);

  if (!romResult) return null;

  // ─── Send message ────────────────────────────────────

  const handleSend = async (overrideText) => {
    const text = (overrideText || input).trim();
    if (!text || streaming) return;
    if (!overrideText) setInput("");

    // Handle "undo" locally
    if (text.toLowerCase() === "undo" || text.toLowerCase() === "undo last change") {
      handleUndo();
      return;
    }

    const userMsg = { role: "user", text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamText("");

    try {
      // Build message history (last MAX_HISTORY messages)
      const allMessages = [...messages, userMsg];
      const recent = allMessages.slice(-MAX_HISTORY);

      // Build API messages with context in first user message
      const rom = useRomStore.getState().romResult;
      const context = buildContext(rom);
      const apiMessages = [];

      for (let i = 0; i < recent.length; i++) {
        const m = recent[i];
        if (m.role === "user") {
          // Inject context into the first user message in the window
          const isFirstUser = !apiMessages.some(am => am.role === "user");
          const content = isFirstUser
            ? `[Current Estimate]\n${context}\n\n${m.text}`
            : m.text;
          apiMessages.push({ role: "user", content });
        } else {
          // Strip action blocks from assistant messages
          const clean = m.text.replace(/```json-action[\s\S]*?```/g, "").trim();
          if (clean) apiMessages.push({ role: "assistant", content: clean });
        }
      }

      // Ensure messages start with user role (API requirement)
      while (apiMessages.length && apiMessages[0].role !== "user") {
        apiMessages.shift();
      }

      // Ensure alternating roles
      const cleaned = [];
      for (const msg of apiMessages) {
        if (cleaned.length && cleaned[cleaned.length - 1].role === msg.role) {
          cleaned[cleaned.length - 1].content += "\n" + msg.content;
        } else {
          cleaned.push({ ...msg });
        }
      }

      if (!cleaned.length) {
        cleaned.push({ role: "user", content: text });
      }

      // Create abort controller
      abortRef.current = new AbortController();

      const { callAnthropicStreamPublic, SCAN_MODEL } = await import("@/utils/ai");
      const fullText = await callAnthropicStreamPublic({
        model: SCAN_MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: cleaned,
        temperature: 0.3,
        onText: (accumulated) => setStreamText(accumulated),
        signal: abortRef.current.signal,
      });

      // Parse response and apply actions
      const { displayText, actions } = parseResponse(fullText);
      let appliedLabels = [];

      if (actions.length) {
        // Snapshot for undo before mutating
        const currentRom = useRomStore.getState().romResult;
        setUndoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), {
          rom: JSON.parse(JSON.stringify(currentRom)),
          label: text,
          ts: Date.now(),
        }]);
        appliedLabels = applyActions(actions, currentRom, setRomResult);
      }

      // Build final message with action confirmation
      const newRom = useRomStore.getState().romResult;
      let finalText = displayText;
      if (appliedLabels.length) {
        const newTotal = `$${Math.round(newRom?.totals?.mid || 0).toLocaleString()} ($${(newRom?.perSF?.mid || 0).toFixed(2)}/SF)`;
        finalText += `\n\nNew total: ${newTotal}`;
      }

      setMessages(prev => [...prev, {
        role: "assistant",
        text: finalText,
        ts: Date.now(),
        applied: appliedLabels.length ? appliedLabels : undefined,
      }]);

    } catch (err) {
      if (err.name === "AbortError") {
        setMessages(prev => [...prev, { role: "assistant", text: "Cancelled.", ts: Date.now() }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", text: `Error: ${err.message}. Try again.`, ts: Date.now() }]);
      }
    } finally {
      setStreaming(false);
      setStreamText("");
      abortRef.current = null;
    }
  };

  // ─── Undo ────────────────────────────────────────────

  const handleUndo = () => {
    setUndoStack(prev => {
      if (!prev.length) {
        setMessages(m => [...m, { role: "assistant", text: "Nothing to undo.", ts: Date.now() }]);
        return prev;
      }
      const stack = [...prev];
      const snapshot = stack.pop();
      setRomResult(snapshot.rom);
      const newRom = snapshot.rom;
      const total = `$${Math.round(newRom.totals?.mid || 0).toLocaleString()} ($${(newRom.perSF?.mid || 0).toFixed(2)}/SF)`;
      setMessages(m => [...m, { role: "assistant", text: `Undone: "${snapshot.label}"\n\nTotal restored to ${total}`, ts: Date.now(), applied: ["Undo"] }]);
      return stack;
    });
  };

  // ─── Cancel streaming ────────────────────────────────

  const handleCancel = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  // ─── Relative time ───────────────────────────────────

  const relTime = (ts) => {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  // ─── Bubble (closed state) ───────────────────────────

  if (!open) {
    return (
      <motion.button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 150); }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 100,
          width: 52, height: 52, borderRadius: "50%",
          background: "linear-gradient(135deg, #00D4AA, #00B894)",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 24px rgba(0,212,170,0.35)",
        }}
      >
        <Ic d={I.ai} size={22} color="#000" />
      </motion.button>
    );
  }

  // ─── Panel (open state) ──────────────────────────────

  const showChips = messages.length <= 1 && !streaming;

  return (
    <>
      <style>{`@keyframes romchat-blink { 0%,100% { opacity: 0.4 } 50% { opacity: 0 } }`}</style>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 100,
          width: 400, maxHeight: 520,
          background: C.isDark ? "rgba(10,10,26,0.96)" : "rgba(255,255,255,0.97)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          border: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          borderRadius: 16, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: C.isDark
            ? "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,170,0.08)"
            : "0 8px 40px rgba(0,0,0,0.15)",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
          borderBottom: `1px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          background: "rgba(0,212,170,0.04)",
        }}>
          <Ic d={I.ai} size={14} color="#00D4AA" />
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1, ...ff }}>NOVA</span>
          {undoStack.length > 0 && (
            <button
              onClick={handleUndo}
              title="Undo last change"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 2,
                opacity: 0.6, display: "flex", alignItems: "center", gap: 3,
              }}
            >
              <Ic d={I.refresh} size={11} color={C.textDim} />
              <span style={{ fontSize: 9, color: C.textDim, ...ff }}>Undo</span>
            </button>
          )}
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
            <Ic d={I.x} size={12} color={C.textDim} />
          </button>
        </div>

        {/* ── Messages ── */}
        <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: "10px 14px", maxHeight: 360 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{
                padding: "7px 11px", borderRadius: 10,
                background: m.role === "user"
                  ? (C.isDark ? "rgba(0,212,170,0.1)" : "rgba(0,212,170,0.08)")
                  : (C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"),
                fontSize: 11.5, lineHeight: 1.55, color: C.text, ...ff,
                whiteSpace: "pre-wrap",
                maxWidth: m.role === "user" ? "85%" : "92%",
                marginLeft: m.role === "user" ? "auto" : 0,
              }}>
                {m.text}
              </div>
              {/* Action confirmation pills */}
              {m.applied && m.applied.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, marginLeft: 2 }}>
                  {m.applied.map((label, j) => (
                    <span key={j} style={{
                      fontSize: 9, padding: "2px 7px", borderRadius: 6,
                      background: label === "Undo" ? "rgba(251,113,133,0.12)" : "rgba(0,212,170,0.12)",
                      color: label === "Undo" ? "#FB7185" : "#00D4AA",
                      fontWeight: 500, ...ff,
                    }}>
                      {label}
                    </span>
                  ))}
                </div>
              )}
              {/* Timestamp */}
              <div style={{ fontSize: 9, color: C.textDim, marginTop: 2, opacity: 0.5, marginLeft: m.role === "user" ? "auto" : 2, textAlign: m.role === "user" ? "right" : "left", ...ff }}>
                {relTime(m.ts)}
              </div>
            </div>
          ))}

          {/* Streaming text */}
          {streaming && streamText && (
            <div style={{ marginBottom: 10 }}>
              <div style={{
                padding: "7px 11px", borderRadius: 10,
                background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
                fontSize: 11.5, lineHeight: 1.55, color: C.text, ...ff,
                whiteSpace: "pre-wrap", maxWidth: "92%",
              }}>
                {streamText.replace(/```json-action[\s\S]*$/g, "").trim()}
                <span style={{ opacity: 0.4, animation: "romchat-blink 1s infinite" }}>|</span>
              </div>
            </div>
          )}

          {/* Typing indicator (before any text arrives) */}
          {streaming && !streamText && (
            <div style={{
              padding: "7px 11px", borderRadius: 10, maxWidth: 60,
              background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)",
              display: "flex", gap: 4, alignItems: "center",
            }}>
              {[0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  style={{ width: 5, height: 5, borderRadius: "50%", background: "#00D4AA", display: "block" }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Quick action chips ── */}
        {showChips && (
          <div style={{
            padding: "4px 12px 8px", display: "flex", flexWrap: "wrap", gap: 5,
          }}>
            {QUICK_ACTIONS.map(label => (
              <button key={label} onClick={() => handleSend(label)} style={{
                padding: "4px 10px", borderRadius: 8, border: `1px solid ${C.isDark ? "rgba(0,212,170,0.15)" : "rgba(0,212,170,0.25)"}`,
                background: "transparent", color: "#00D4AA", cursor: "pointer",
                fontSize: 10, fontWeight: 500, ...ff,
                whiteSpace: "nowrap",
              }}>
                {label}
              </button>
            ))}
            {undoStack.length > 0 && (
              <button onClick={handleUndo} style={{
                padding: "4px 10px", borderRadius: 8, border: "1px solid rgba(251,113,133,0.2)",
                background: "transparent", color: "#FB7185", cursor: "pointer",
                fontSize: 10, fontWeight: 500, ...ff,
              }}>
                Undo last change
              </button>
            )}
          </div>
        )}

        {/* ── Input ── */}
        <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, display: "flex", gap: 6 }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="e.g. bump HVAC 20%..."
            disabled={streaming}
            style={{
              flex: 1, padding: "7px 11px", fontSize: 11.5, ...ff,
              background: C.isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
              border: `1px solid ${C.isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
              borderRadius: 8, color: C.text, outline: "none",
              opacity: streaming ? 0.5 : 1,
            }}
          />
          {streaming ? (
            <button onClick={handleCancel} style={{
              padding: "6px 12px", fontSize: 10, fontWeight: 600, ...ff,
              background: "rgba(251,113,133,0.15)", color: "#FB7185",
              border: "none", borderRadius: 8, cursor: "pointer",
            }}>
              Stop
            </button>
          ) : (
            <button onClick={() => handleSend()} disabled={!input.trim()} style={{
              padding: "6px 12px", fontSize: 10, fontWeight: 600, ...ff,
              background: input.trim() ? "linear-gradient(135deg, #00D4AA, #00B894)" : "transparent",
              color: input.trim() ? "#000" : C.textDim,
              border: "none", borderRadius: 8, cursor: input.trim() ? "pointer" : "default",
            }}>
              Send
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}
