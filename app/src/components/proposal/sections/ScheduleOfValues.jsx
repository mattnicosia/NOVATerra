import { nn, fmt } from "@/utils/format";
import { getTradeLabel, getTradeSortOrder } from "@/constants/tradeGroupings";

export default function ScheduleOfValues({ data, proposalStyles: PS, sectionNumber }) {
  const { totals, items, T } = data;

  const font = PS?.font?.body || "'Inter', sans-serif";
  const mono = PS?.font?.mono || "monospace";
  const type = PS?.type || {};
  const color = PS?.color || { text: "#1a1a2e", textDim: "#666", accent: "#1a1a2e", bgSubtle: "#f8f9fa" };

  // Build trade breakdown rows with markup wrapped in
  const wrappedMultiplier = totals.direct > 0 ? totals.grand / totals.direct : 1;
  const trades = {};
  items.forEach(it => {
    const label = getTradeLabel(it);
    const sort = getTradeSortOrder(it);
    if (!trades[label]) trades[label] = { total: 0, sort };
    const q = nn(it.quantity);
    trades[label].total += q * (nn(it.material) + nn(it.labor) + nn(it.equipment) + nn(it.subcontractor));
  });
  const rows = Object.entries(trades)
    .sort(([, a], [, b]) => a.sort - b.sort)
    .map(([label, d], i) => ({
      num: i + 1,
      label,
      value: d.total * wrappedMultiplier,
    }));

  return (
    <div style={{ marginTop: 24, marginBottom: 16 }}>
      {/* Section title */}
      <div
        style={{
          ...type.h2,
          fontFamily: font,
          color: color.accent,
          fontSize: type.h2?.fontSize || 14,
          fontWeight: type.h2?.fontWeight || 800,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        {sectionNumber ? `${sectionNumber}.0  ` : ""}Schedule of Values
      </div>

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "48px 2fr 1fr",
          gap: 10,
          paddingBottom: 8,
          marginBottom: 2,
          borderBottom: `2px solid ${color.accent}`,
          ...type.label,
          fontFamily: font,
          fontSize: type.label?.fontSize || 9,
          fontWeight: type.label?.fontWeight || 700,
          color: color.accent,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        <span>No.</span>
        <span>Description of Work</span>
        <span style={{ textAlign: "right" }}>Scheduled Value</span>
      </div>

      {/* Rows */}
      {rows.map((row, idx) => (
        <div
          key={row.num}
          style={{
            display: "grid",
            gridTemplateColumns: "48px 2fr 1fr",
            gap: 10,
            padding: "8px 0",
            borderBottom: `1px solid ${color.border || "#eee"}`,
            alignItems: "center",
            background: idx % 2 === 1 ? (color.bgSubtle || "transparent") : "transparent",
          }}
        >
          <span style={{ fontFamily: mono, fontSize: 10, color: color.textMuted || "#aaa", fontVariantNumeric: "tabular-nums" }}>
            {String(row.num).padStart(3, "0")}
          </span>
          <span style={{ ...type.body, fontFamily: font, fontSize: type.body?.fontSize || 12, fontWeight: 500, color: color.text }}>{row.label}</span>
          <span
            style={{
              textAlign: "right",
              ...type.money,
              fontFamily: mono,
              fontSize: type.money?.fontSize || 12,
              fontWeight: type.money?.fontWeight || 600,
              color: color.text,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmt(row.value)}
          </span>
        </div>
      ))}

      {/* Grand Total */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "48px 2fr 1fr",
          gap: 10,
          padding: "14px 0 8px",
          borderTop: `2px solid ${color.accent}`,
          marginTop: 6,
        }}
      >
        <span />
        <span style={{ ...type.moneyLg, fontFamily: font, color: color.accent, fontSize: type.moneyLg?.fontSize || 14, fontWeight: type.moneyLg?.fontWeight || 800 }}>TOTAL CONTRACT SUM</span>
        <span
          style={{
            textAlign: "right",
            ...type.moneyLg,
            fontFamily: mono,
            fontSize: type.moneyLg?.fontSize ? type.moneyLg.fontSize + 2 : 16,
            fontWeight: type.moneyLg?.fontWeight || 800,
            color: color.accent,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmt(totals.grand)}
        </span>
      </div>
    </div>
  );
}
