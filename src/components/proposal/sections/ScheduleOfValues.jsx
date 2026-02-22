import { nn, fmt } from '@/utils/format';
import { getTradeLabel, getTradeSortOrder } from '@/constants/tradeGroupings';

export default function ScheduleOfValues({ data }) {
  const { project, totals, items, T } = data;
  const sovFont = "'DM Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
  const sovMono = "'DM Mono', 'SF Mono', 'Menlo', monospace";

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
      <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12, fontFamily: sovFont }}>
        Schedule of Values
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "48px 2fr 1fr", gap: 10, paddingBottom: 8, marginBottom: 2, borderBottom: "1.5px solid #1a1a2e", fontSize: 9, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 0.8, fontFamily: sovFont }}>
        <span>No.</span>
        <span>Description of Work</span>
        <span style={{ textAlign: "right" }}>Scheduled Value</span>
      </div>

      {/* Rows */}
      {rows.map(row => (
        <div key={row.num} style={{ display: "grid", gridTemplateColumns: "48px 2fr 1fr", gap: 10, padding: "8px 0", borderBottom: "1px solid #eee", alignItems: "center" }}>
          <span style={{ fontFamily: sovMono, fontSize: 10, color: "#aaa", fontVariantNumeric: "tabular-nums" }}>{String(row.num).padStart(3, "0")}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: "#222", fontFamily: sovFont }}>{row.label}</span>
          <span style={{ textAlign: "right", fontFamily: sovMono, fontSize: 12, fontWeight: 600, color: "#222", fontVariantNumeric: "tabular-nums" }}>{fmt(row.value)}</span>
        </div>
      ))}

      {/* Grand Total */}
      <div style={{ display: "grid", gridTemplateColumns: "48px 2fr 1fr", gap: 10, padding: "14px 0 8px", borderTop: "2.5px solid #1a1a2e", marginTop: 6 }}>
        <span />
        <span style={{ fontSize: 14, fontWeight: 800, color: "#1a1a2e", fontFamily: sovFont }}>TOTAL CONTRACT SUM</span>
        <span style={{ textAlign: "right", fontFamily: sovMono, fontSize: 16, fontWeight: 800, color: "#1a1a2e", fontVariantNumeric: "tabular-nums" }}>{fmt(totals.grand)}</span>
      </div>
    </div>
  );
}
