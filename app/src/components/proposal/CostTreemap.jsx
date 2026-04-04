import { useMemo } from "react";

const DIV_LABELS = {
  "01": "General", "02": "Demo", "03": "Concrete", "04": "Masonry",
  "05": "Steel", "06": "Carpentry", "07": "Roofing", "08": "Openings",
  "09": "Finishes", "10": "Specialties", "11": "Equipment", "14": "Conveying",
  "21": "Fire Protection", "22": "Plumbing", "23": "HVAC", "26": "Electrical",
  "27": "Communications", "28": "Safety", "31": "Earthwork", "32": "Site", "33": "Utilities",
};

/**
 * Generate muted, sophisticated color palette from an accent color.
 * Creates variations by adjusting opacity and hue rotation.
 */
function generatePalette(accent) {
  // Base palette: muted tones that work with any accent
  return [
    accent,
    adjustColor(accent, 0.75),
    adjustColor(accent, 0.55),
    adjustColor(accent, 0.40),
    adjustColor(accent, 0.30),
    adjustColor(accent, 0.22),
    adjustColor(accent, 0.16),
    adjustColor(accent, 0.12),
    adjustColor(accent, 0.09),
    adjustColor(accent, 0.07),
  ];
}

function adjustColor(hex, opacity) {
  // Convert hex to rgba with opacity
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

export default function CostTreemap({ divTotals, grand, accent = "#1a1a2e", font }) {
  const items = useMemo(() => {
    if (!divTotals || !grand) return [];
    return Object.entries(divTotals)
      .map(([div, val]) => {
        const amount = typeof val === "number" ? val : val?.total || val?.mid || 0;
        return { div, label: DIV_LABELS[div] || `Div ${div}`, amount, pct: (amount / grand) * 100 };
      })
      .filter(d => d.amount > 0 && d.pct >= 1)
      .sort((a, b) => b.amount - a.amount);
  }, [divTotals, grand]);

  const palette = useMemo(() => generatePalette(accent), [accent]);

  if (!items.length) return null;

  // SVG donut chart
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 88;
  const innerR = 55;

  // Build arc segments
  let cumAngle = -90; // Start from top
  const segments = items.map((item, i) => {
    const angle = (item.pct / 100) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = cx + outerR * Math.cos(startRad);
    const y1 = cy + outerR * Math.sin(startRad);
    const x2 = cx + outerR * Math.cos(endRad);
    const y2 = cy + outerR * Math.sin(endRad);
    const x3 = cx + innerR * Math.cos(endRad);
    const y3 = cy + innerR * Math.sin(endRad);
    const x4 = cx + innerR * Math.cos(startRad);
    const y4 = cy + innerR * Math.sin(startRad);

    const largeArc = angle > 180 ? 1 : 0;

    const path = [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
      `Z`,
    ].join(" ");

    return { ...item, path, color: palette[i % palette.length], index: i };
  });

  const mono = "'JetBrains Mono', monospace";

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 32, fontFamily: font }}>
      {/* Donut chart */}
      <div style={{ flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {segments.map(seg => (
            <path
              key={seg.div}
              d={seg.path}
              fill={seg.color}
              stroke="#fff"
              strokeWidth={1.5}
              style={{ transition: "opacity 0.2s" }}
            >
              <title>{`${seg.label}: $${seg.amount.toLocaleString()} (${seg.pct.toFixed(1)}%)`}</title>
            </path>
          ))}
          {/* Center text */}
          <text x={cx} y={cy - 6} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: accent, fontFamily: font }}>
            TOTAL
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" style={{ fontSize: 14, fontWeight: 800, fill: "#222", fontFamily: mono, fontVariantNumeric: "tabular-nums" }}>
            ${(grand / 1000).toFixed(0)}K
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}>
        {segments.slice(0, 10).map(seg => (
          <div key={seg.div} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 11, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {seg.label}
            </span>
            <span style={{ fontSize: 10, fontFamily: mono, color: "#666", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              ${seg.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span style={{ fontSize: 9, color: "#999", width: 36, textAlign: "right", flexShrink: 0 }}>
              {seg.pct.toFixed(1)}%
            </span>
          </div>
        ))}
        {items.length > 10 && (
          <div style={{ fontSize: 9, color: "#999", marginTop: 2 }}>
            +{items.length - 10} more divisions
          </div>
        )}
      </div>
    </div>
  );
}
