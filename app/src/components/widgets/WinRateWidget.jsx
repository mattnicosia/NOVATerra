/**
 * WinRateWidget — Donut chart of bid Won/Lost/Pending with dollar-volume.
 */
import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDashboardData } from "@/hooks/useDashboardData";

const fmt = n => {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
};

export default function WinRateWidget() {
  const C = useTheme();
  const T = C.T;
  const { companyEstimates } = useDashboardData();

  const data = useMemo(() => {
    let won = 0, lost = 0, active = 0, wonVal = 0, lostVal = 0, activeVal = 0;
    (companyEstimates || []).forEach(e => {
      const status = (e.status || "").toLowerCase();
      const val = e.grandTotal || e.totalCost || 0;
      if (status === "won" || status === "awarded") { won++; wonVal += val; }
      else if (status === "lost" || status === "cancelled") { lost++; lostVal += val; }
      else { active++; activeVal += val; }
    });
    const total = won + lost + active;
    const rate = total > 0 ? Math.round((won / (won + lost || 1)) * 100) : 0;
    return { won, lost, active, wonVal, lostVal, activeVal, total, rate };
  }, [companyEstimates]);

  // SVG donut
  const r = 36, cx = 50, cy = 50, circumference = 2 * Math.PI * r;
  const segments = [];
  if (data.total > 0) {
    const wonPct = data.won / data.total;
    const lostPct = data.lost / data.total;
    const activePct = data.active / data.total;
    let offset = 0;
    if (wonPct > 0) { segments.push({ pct: wonPct, color: C.green, offset }); offset += wonPct; }
    if (lostPct > 0) { segments.push({ pct: lostPct, color: C.red || "#EF4444", offset }); offset += lostPct; }
    if (activePct > 0) { segments.push({ pct: activePct, color: C.accent, offset }); }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: T.space[2], padding: T.space[2] }}>
      {/* Donut */}
      <svg viewBox="0 0 100 100" style={{ width: 90, height: 90 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={`${C.border}15`} strokeWidth={10} />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={10}
            strokeDasharray={`${seg.pct * circumference} ${circumference}`}
            strokeDashoffset={-seg.offset * circumference}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="round"
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill={C.text} fontSize="16" fontWeight="700">
          {data.rate}%
        </text>
        <text x={cx} y={cy + 9} textAnchor="middle" fill={C.textDim} fontSize="6">
          HIT RATE
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: T.space[3], fontSize: 9 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.green, fontWeight: 700 }}>{data.won}</div>
          <div style={{ color: C.textDim }}>Won</div>
          <div style={{ color: C.textDim, fontSize: 8 }}>{fmt(data.wonVal)}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.red || "#EF4444", fontWeight: 700 }}>{data.lost}</div>
          <div style={{ color: C.textDim }}>Lost</div>
          <div style={{ color: C.textDim, fontSize: 8 }}>{fmt(data.lostVal)}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: C.accent, fontWeight: 700 }}>{data.active}</div>
          <div style={{ color: C.textDim }}>Active</div>
          <div style={{ color: C.textDim, fontSize: 8 }}>{fmt(data.activeVal)}</div>
        </div>
      </div>
    </div>
  );
}
