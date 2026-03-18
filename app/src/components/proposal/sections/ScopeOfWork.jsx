import { useState, useMemo } from "react";
import { useReportsStore } from "@/stores/reportsStore";
import { callAnthropic } from "@/utils/ai";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { getTradeLabel, getTradeSortOrder } from "@/constants/tradeGroupings";

export default function ScopeOfWork({ data }) {
  const { items, T } = data;

  const scopeNarratives = useReportsStore(s => s.scopeNarratives);
  const scopeNarrativeLoading = useReportsStore(s => s.scopeNarrativeLoading);
  const setScopeNarrative = useReportsStore(s => s.setScopeNarrative);
  const setScopeNarrativeLoading = useReportsStore(s => s.setScopeNarrativeLoading);
  const scopeShowQuantities = useReportsStore(s => s.scopeShowQuantities);
  const setScopeShowQuantities = useReportsStore(s => s.setScopeShowQuantities);
  const [narrativeMode, setNarrativeMode] = useState({});

  // Group items by trade bundle label, sorted by trade bundle sort order
  const tradeGroups = useMemo(() => {
    const grouped = {};
    (items || []).forEach(item => {
      const label = getTradeLabel(item);
      const sort = getTradeSortOrder(item);
      if (!grouped[label]) grouped[label] = { items: [], sort };
      grouped[label].items.push(item);
    });
    return Object.entries(grouped)
      .sort(([, a], [, b]) => a.sort - b.sort)
      .map(([label, g]) => ({ label, items: g.items }));
  }, [items]);

  const generateNarrative = async tradeLabel => {
    setScopeNarrativeLoading(tradeLabel, true);
    try {
      const group = tradeGroups.find(g => g.label === tradeLabel);
      const groupItems = group?.items || [];
      const itemList = groupItems
        .slice(0, 50)
        .map(it => `${it.description} (${it.quantity} ${it.unit})`)
        .join("; ");
      const extra = groupItems.length > 50 ? ` ...and ${groupItems.length - 50} additional items.` : "";

      const text = await callAnthropic({
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `You are writing a scope of work section for a construction proposal letter. Write a professional, concise paragraph summarizing the following work items for "${tradeLabel}". Use industry-standard construction proposal language suitable for an owner-facing proposal. Do not include pricing or dollar amounts. Be specific about materials and methods where the item descriptions provide that detail.\n\nItems: ${itemList}${extra}`,
          },
        ],
      });
      setScopeNarrative(tradeLabel, text);
    } catch {
      setScopeNarrative(tradeLabel, "Failed to generate — check API key in Settings.");
    } finally {
      setScopeNarrativeLoading(tradeLabel, false);
    }
  };

  const toggleMode = tradeLabel => {
    const isNarrative = narrativeMode[tradeLabel];
    setNarrativeMode(prev => ({ ...prev, [tradeLabel]: !isNarrative }));
    if (!isNarrative && !scopeNarratives[tradeLabel]) {
      generateNarrative(tradeLabel);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: T.space[2],
          borderBottom: "1px solid #ddd",
          paddingBottom: T.space[1],
        }}
      >
        <span style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold }}>SCOPE OF WORK</span>
        <label
          className="no-print"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            fontSize: 9,
            color: "#888",
          }}
        >
          <input
            type="checkbox"
            checked={scopeShowQuantities}
            onChange={e => setScopeShowQuantities(e.target.checked)}
            style={{ width: 12, height: 12, accentColor: "#0A84FF" }}
          />
          Show Quantities
        </label>
      </div>

      {tradeGroups.map(({ label, items: groupItems }) => {
        const isNarrative = narrativeMode[label];

        return (
          <div key={label} style={{ marginBottom: 10 }}>
            {/* Trade header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 0",
                borderBottom: "1px solid #e8e8e8",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a2e" }}>{label}</span>
              <button
                className="no-print"
                onClick={() => toggleMode(label)}
                style={{
                  background: isNarrative ? "rgba(10,132,255,0.08)" : "transparent",
                  border: `1px solid ${isNarrative ? "rgba(10,132,255,0.3)" : "#ddd"}`,
                  borderRadius: 4,
                  padding: "2px 8px",
                  fontSize: 9,
                  cursor: "pointer",
                  color: isNarrative ? "#0A84FF" : "#888",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <Ic d={I.ai} size={9} color={isNarrative ? "#0A84FF" : "#888"} />
                {isNarrative ? "Show Items" : "AI Summary"}
              </button>
            </div>

            {/* Content */}
            {isNarrative ? (
              scopeNarrativeLoading[label] ? (
                <div style={{ fontSize: 11, color: "#888", padding: "6px 0 6px 12px", fontStyle: "italic" }}>
                  Generating scope narrative...
                </div>
              ) : (
                <div style={{ padding: "4px 0 4px 12px" }}>
                  <div style={{ fontSize: 11, lineHeight: 1.7, color: "#333" }}>
                    {scopeNarratives[label] || "No narrative generated."}
                  </div>
                  <button
                    className="no-print"
                    onClick={() => generateNarrative(label)}
                    style={{
                      background: "none",
                      border: "none",
                      fontSize: 9,
                      color: "#999",
                      cursor: "pointer",
                      padding: "4px 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <Ic d={I.refresh} size={9} color="#999" /> Regenerate
                  </button>
                </div>
              )
            ) : (
              groupItems.map(item => (
                <div
                  key={item.id}
                  style={{
                    fontSize: 11,
                    padding: "2px 0 2px 12px",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    borderBottom: "1px solid #f5f5f5",
                  }}
                >
                  <span style={{ color: "#333" }}>{item.description || "Unnamed item"}</span>
                  {scopeShowQuantities && (
                    <span style={{ fontFamily: T.font.mono, fontSize: 10, color: "#888", whiteSpace: "nowrap" }}>
                      {item.quantity} {item.unit}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
