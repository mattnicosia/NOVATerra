import { useState, useCallback } from "react";
import { callAnthropic } from "@/utils/ai-core";

export default function ScopeNarrativeBlock({ division, items, T }) {
  const [narrative, setNarrative] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    // Check cache first (stored on first item of group)
    if (items[0]?.narrative) {
      setNarrative(items[0].narrative);
      return;
    }

    setLoading(true);
    try {
      const divCode = division.split(" ")[0] || "";
      const itemSummary = items
        .slice(0, 15)
        .map(i => `${i.code} ${i.description} (${i.quantity || "?"} ${i.unit || "EA"})`)
        .join("\n");

      const result = await callAnthropic({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `Write a 2-3 sentence scope narrative for CSI Division ${division} based on these items:\n${itemSummary}\n\nBe specific about quantities and materials. Professional estimating tone. No bullet points.`,
          },
        ],
      });

      const text = result?.content?.[0]?.text || "";
      setNarrative(text);
    } catch {
      // Fall back to hardcoded trade narrative
      const divCode = division.split(" ")[0]?.replace(/^0/, "") || "";
      const fallback = `Division ${division} scope items as detected from the drawing set.`;
      setNarrative(fallback);
    } finally {
      setLoading(false);
    }
  }, [division, items]);

  if (!narrative && !loading) {
    generate();
    return (
      <div style={{ padding: "8px 12px", fontSize: 12, color: T.fg + "66", fontStyle: "italic" }}>
        Generating narrative...
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "8px 12px", fontSize: 12, color: T.fg + "66", fontStyle: "italic" }}>
        Generating narrative...
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "8px 12px",
        fontSize: 12,
        lineHeight: 1.5,
        color: T.fg + "cc",
        background: `${T.accent}06`,
        borderRadius: 6,
        margin: "4px 10px 8px",
      }}
    >
      {narrative}
    </div>
  );
}
