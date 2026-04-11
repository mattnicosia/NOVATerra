import { useState, useCallback } from "react";
import { callAnthropic } from "@/utils/ai-core";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { SCOPE_SOURCE } from "@/constants/scopeSources";
import { bt } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const EXAMPLES = [
  "Add fire caulking to Div 07",
  "Remove all lighting fixtures",
  "Change D-1 quantity to 15",
  "Select only Div 08 and 09",
];

export default function ScopeNovaChat({ T }) {
  const [input, setInput] = useState("");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    setLoading(true);
    setResponse(null);

    const scopeItems = useDrawingPipelineStore.getState().scopeItems;
    const itemsSummary = scopeItems
      .slice(0, 40)
      .map(si => `[${si.selected ? "✓" : "○"}] ${si.code} ${si.description} (${si.division}, qty:${si.quantity}, id:${si.id})`)
      .join("\n");

    try {
      const result = await callAnthropic({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        system: `You are NOVA, an AI construction estimating assistant. The user is reviewing scope items detected from drawings. You can:
1. ADD items: Return JSON { "action": "add", "items": [{ "code": "XX.XXX", "description": "...", "division": "XX - Name", "quantity": N, "unit": "EA" }] }
2. REMOVE items: Return JSON { "action": "deselect", "ids": ["si_..."] } or { "action": "deselect_match", "match": "description keyword" }
3. MODIFY items: Return JSON { "action": "update", "id": "si_...", "updates": { "quantity": N } }
4. SELECT: Return JSON { "action": "select_only", "divisions": ["08", "09"] }
5. ANSWER: Return JSON { "action": "answer", "text": "..." }

Current scope items:\n${itemsSummary}

Always return valid JSON. Be concise.`,
        messages: [{ role: "user", content: msg }],
      });

      const text = result?.content?.[0]?.text || "";
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { action: "answer", text };
      }

      const store = useDrawingPipelineStore.getState();

      if (parsed.action === "add" && parsed.items) {
        const newItems = parsed.items.map((item, i) => ({
          id: `si_chat_${Date.now()}_${i}`,
          code: item.code || "",
          description: item.description || "",
          division: item.division || "",
          quantity: item.quantity || 1,
          unit: item.unit || "EA",
          confidence: 0.5,
          source: SCOPE_SOURCE.NOVA_CHAT,
          scheduleType: null,
          drawingRef: null,
          selected: true,
          pushed: false,
          pushedAt: null,
          narrative: null,
        }));
        store.setScopeItems([...store.scopeItems, ...newItems]);
        setResponse(`Added ${newItems.length} item(s)`);
      } else if (parsed.action === "deselect" && parsed.ids) {
        for (const id of parsed.ids) store.updateScopeItem(id, { selected: false });
        setResponse(`Deselected ${parsed.ids.length} item(s)`);
      } else if (parsed.action === "deselect_match" && parsed.match) {
        const kw = parsed.match.toLowerCase();
        const matches = store.scopeItems.filter(si => si.description.toLowerCase().includes(kw) && si.selected);
        for (const si of matches) store.updateScopeItem(si.id, { selected: false });
        setResponse(`Deselected ${matches.length} item(s) matching "${parsed.match}"`);
      } else if (parsed.action === "update" && parsed.id) {
        store.updateScopeItem(parsed.id, parsed.updates || {});
        setResponse(`Updated item`);
      } else if (parsed.action === "select_only" && parsed.divisions) {
        const divSet = new Set(parsed.divisions);
        const updated = store.scopeItems.map(si => ({
          ...si,
          selected: si.pushed ? si.selected : divSet.has(si.division.split(" ")[0]?.replace(/^0/, "")),
        }));
        store.setScopeItems(updated);
        setResponse(`Selected divisions: ${parsed.divisions.join(", ")}`);
      } else if (parsed.action === "answer") {
        setResponse(parsed.text);
      } else {
        setResponse(text.slice(0, 200));
      }
    } catch (err) {
      setResponse("Sorry, couldn't process that. Try again.");
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  return (
    <div style={{ padding: "8px 12px" }}>
      {response && (
        <div
          style={{
            fontSize: 11,
            color: T.accent,
            padding: "4px 8px",
            marginBottom: 6,
            background: `${T.accent}0a`,
            borderRadius: 4,
            lineHeight: 1.4,
          }}
        >
          <Ic icon={I.sparkle || I.star} size={11} color={T.accent} /> {response}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          placeholder={EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]}
          style={{
            flex: 1,
            background: T.inputBg || T.bg,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12,
            color: T.fg,
            outline: "none",
          }}
          disabled={loading}
        />
        <button
          onClick={handleSubmit}
          disabled={loading || !input.trim()}
          style={{
            ...bt(T),
            padding: "6px 12px",
            fontSize: 11,
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          {loading ? "..." : "Ask"}
        </button>
      </div>
    </div>
  );
}
