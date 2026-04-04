import { useMemo } from "react";

const DIV_LABELS = {
  "01": "General", "02": "Demo", "03": "Concrete", "04": "Masonry",
  "05": "Steel", "06": "Carpentry", "07": "Roofing", "08": "Openings",
  "09": "Finishes", "10": "Specialties", "11": "Equipment", "14": "Conveying",
  "21": "Fire Protection", "22": "Plumbing", "23": "HVAC", "26": "Electrical",
  "27": "Communications", "28": "Safety", "31": "Earthwork", "32": "Site", "33": "Utilities",
};

const DIV_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
  "#06b6d4", "#d946ef", "#0ea5e9", "#10b981", "#a855f7",
];

export default function CostTreemap({ divTotals, grand, accent, font }) {
  const items = useMemo(() => {
    if (!divTotals || !grand) return [];
    return Object.entries(divTotals)
      .map(([div, val]) => {
        const amount = typeof val === "number" ? val : val?.total || val?.mid || 0;
        return { div, label: DIV_LABELS[div] || `Div ${div}`, amount, pct: (amount / grand) * 100 };
      })
      .filter(d => d.amount > 0 && d.pct >= 1) // Only show divisions >= 1%
      .sort((a, b) => b.amount - a.amount);
  }, [divTotals, grand]);

  if (!items.length) return null;

  // Simple treemap: proportional rectangles in a flex-wrap layout
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 2, borderRadius: 8, overflow: "hidden" }}>
      {items.map((item, i) => (
        <div
          key={item.div}
          style={{
            flexBasis: `${Math.max(item.pct, 8)}%`,
            flexGrow: item.pct,
            minWidth: 80,
            padding: "12px 10px",
            background: DIV_COLORS[i % DIV_COLORS.length],
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: item.pct > 10 ? 80 : 56,
            borderRadius: 4,
            fontFamily: font,
          }}
          title={`${item.label}: $${item.amount.toLocaleString()} (${item.pct.toFixed(1)}%)`}
        >
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.85 }}>
            {item.label}
          </div>
          <div>
            <div style={{ fontSize: item.pct > 10 ? 16 : 12, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>
              ${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div style={{ fontSize: 9, opacity: 0.7 }}>{item.pct.toFixed(1)}%</div>
          </div>
        </div>
      ))}
    </div>
  );
}
