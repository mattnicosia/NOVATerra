/**
 * RomChat — NOVA chatbot for live ROM estimate adjustments.
 * User types "bump HVAC by 20%" → estimate updates in real-time.
 *
 * Uses Haiku for intent parsing (cheapest model, ~$0.01/message).
 * Mutates romResult in romStore directly for instant UI updates.
 */
import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useRomStore } from "@/stores/romStore";
import { bt, inp } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const SYSTEM_PROMPT = `You are NOVA, a construction estimating AI assistant. The user has a ROM (Rough Order of Magnitude) estimate and wants to adjust it.

You will receive the current estimate state as JSON. The user will ask to make changes.

Respond with ONLY a JSON object (no markdown, no explanation) with this structure:
{
  "action": "adjust_division" | "toggle_item" | "change_param" | "info",
  "divisions": { "09": 1.2 },  // division code → multiplier (1.2 = +20%)
  "message": "Increased Finishes by 20% — now $X/SF",
  "laborType": "union" | null,  // if changing labor type
  "workType": "renovation" | null  // if changing work type
}

Examples:
- "bump HVAC by 20%" → { "action": "adjust_division", "divisions": { "23": 1.2 }, "message": "Increased HVAC by 20%" }
- "go union" → { "action": "change_param", "laborType": "union", "message": "Switched to union labor rates — costs increased ~25%" }
- "remove landscaping" → { "action": "adjust_division", "divisions": { "32": 0 }, "message": "Removed Exterior Improvements (Division 32)" }
- "double the electrical" → { "action": "adjust_division", "divisions": { "26": 2.0 }, "message": "Doubled Electrical budget" }
- "what's the biggest cost?" → { "action": "info", "message": "Division 09 (Finishes) is your largest cost at $X/SF" }
- "cut 10% across the board" → { "action": "adjust_division", "divisions": {"01":0.9,"03":0.9,"05":0.9,"06":0.9,"07":0.9,"08":0.9,"09":0.9,"22":0.9,"23":0.9,"26":0.9}, "message": "Cut 10% across all divisions" }

Always respond with valid JSON. For "info" actions, just provide the message.`;

export default function RomChat() {
  const C = useTheme();
  const T = C.T;
  const ff = { fontFamily: "Switzer, -apple-system, sans-serif" };
  const romResult = useRomStore(s => s.romResult);
  const setRomResult = useRomStore(s => s.setRomResult);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: "I'm NOVA. Ask me to adjust your estimate — \"bump HVAC 20%\", \"go union\", \"remove landscaping\", or ask questions about the numbers." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  if (!romResult) return null;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text }]);
    setLoading(true);

    try {
      // Build estimate context for AI
      const divSummary = Object.entries(romResult.divisions || {})
        .map(([code, d]) => `${code} ${d.label}: $${d.perSF?.mid}/SF, total $${d.total?.mid}`)
        .join("\n");
      const context = `Building: ${romResult.buildingType}, ${romResult.projectSF} SF, ${romResult.location || "unknown location"}
Labor: ${romResult.laborType || "open-shop"}
Total: $${romResult.totals?.mid?.toLocaleString()} (${romResult.perSF?.mid}/SF)
Divisions:\n${divSummary}`;

      const { callAnthropic, SCAN_MODEL } = await import("@/utils/ai");
      const response = await callAnthropic({
        model: SCAN_MODEL,
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `Current estimate:\n${context}\n\nUser request: ${text}` }
        ],
        _publicProxy: true,
      });

      const responseText = typeof response === "string" ? response : response?.content?.[0]?.text || "";

      // Parse JSON response
      let parsed;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch { parsed = null; }

      if (!parsed) {
        setMessages(prev => [...prev, { role: "assistant", text: responseText || "I didn't understand that. Try something like 'bump HVAC by 20%' or 'go union'." }]);
        setLoading(false);
        return;
      }

      // Apply adjustments to ROM result
      if (parsed.action === "adjust_division" && parsed.divisions) {
        const newResult = { ...romResult, divisions: { ...romResult.divisions } };
        let newTotalLow = 0, newTotalMid = 0, newTotalHigh = 0;

        for (const [code, div] of Object.entries(newResult.divisions)) {
          const mult = parsed.divisions[code];
          if (mult !== undefined) {
            newResult.divisions[code] = {
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
          }
          newTotalLow += newResult.divisions[code].total.low;
          newTotalMid += newResult.divisions[code].total.mid;
          newTotalHigh += newResult.divisions[code].total.high;
        }

        newResult.totals = { low: Math.round(newTotalLow), mid: Math.round(newTotalMid), high: Math.round(newTotalHigh) };
        const sf = newResult.projectSF || 1;
        newResult.perSF = {
          low: Math.round(newTotalLow / sf * 100) / 100,
          mid: Math.round(newTotalMid / sf * 100) / 100,
          high: Math.round(newTotalHigh / sf * 100) / 100,
        };
        setRomResult(newResult);
      }

      // Show response
      const msg = parsed.message || "Adjustment applied.";
      const newTotal = useRomStore.getState().romResult?.totals?.mid;
      const displayMsg = newTotal ? `${msg}\n\nNew total: $${Math.round(newTotal).toLocaleString()} ($${useRomStore.getState().romResult?.perSF?.mid}/SF)` : msg;
      setMessages(prev => [...prev, { role: "assistant", text: displayMsg }]);

    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", text: `Error: ${err.message}. Try again.` }]);
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 100,
          width: 48, height: 48, borderRadius: "50%",
          background: "#00D4AA", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(0,212,170,0.4)",
        }}
      >
        <Ic d={I.ai} size={20} color="#000" />
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 100,
      width: 340, maxHeight: 440,
      background: C.isDark ? "rgba(10,10,26,0.95)" : "rgba(255,255,255,0.97)",
      backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
      border: `1px solid ${C.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
      borderRadius: 16, overflow: "hidden",
      display: "flex", flexDirection: "column",
      boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px", display: "flex", alignItems: "center", gap: 8,
        borderBottom: `1px solid ${C.border}10`,
        background: "rgba(0,212,170,0.06)",
      }}>
        <Ic d={I.ai} size={14} color="#00D4AA" />
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flex: 1, ...ff }}>NOVA</span>
        <span style={{ fontSize: 9, color: C.textDim, ...ff }}>Adjust your estimate</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
          <Ic d={I.x} size={12} color={C.textDim} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: "10px 14px", maxHeight: 300 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            marginBottom: 8,
            padding: "6px 10px", borderRadius: 10,
            background: m.role === "user" ? `${C.accent}12` : "rgba(255,255,255,0.04)",
            fontSize: 11, lineHeight: 1.5, color: C.text, ...ff,
            whiteSpace: "pre-wrap",
            maxWidth: "90%",
            marginLeft: m.role === "user" ? "auto" : 0,
          }}>
            {m.text}
          </div>
        ))}
        {loading && (
          <div style={{ fontSize: 10, color: C.textDim, ...ff }}>NOVA is thinking...</div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "8px 10px", borderTop: `1px solid ${C.border}10`, display: "flex", gap: 6 }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSend()}
          placeholder="e.g. bump HVAC 20%..."
          style={{
            flex: 1, padding: "6px 10px", fontSize: 11, ...ff,
            background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}15`,
            borderRadius: 8, color: C.text, outline: "none",
          }}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()} style={{
          padding: "6px 12px", fontSize: 10, fontWeight: 600, ...ff,
          background: input.trim() && !loading ? "#00D4AA" : "transparent",
          color: input.trim() && !loading ? "#000" : C.textDim,
          border: "none", borderRadius: 8, cursor: "pointer",
        }}>
          Send
        </button>
      </div>
    </div>
  );
}
