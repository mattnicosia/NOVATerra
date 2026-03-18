import { useTheme } from "@/hooks/useTheme";
import { useDashboardData } from "@/hooks/useDashboardData";

/* ────────────────────────────────────────────────────────
   BenchmarksWidget — KPI benchmarks (Cost/SF, Win Rate, etc.)
   ──────────────────────────────────────────────────────── */

function formatValue(v) {
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function formatBenchmarkValue(v) {
  if (v >= 1000) return `$${Math.round(v).toLocaleString()}`;
  if (v >= 1) return `$${Math.round(v)}`;
  return "$0";
}

export default function BenchmarksWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`);
  const font = T.font.display;
  const { benchmarks } = useDashboardData();

  const costPerSF = benchmarks.costPerSF || 0;
  const winRate = benchmarks.winRate;
  const openBids = benchmarks.openBids || 0;

  const rows = [
    {
      label: "Cost/SF",
      value: costPerSF > 0 ? formatBenchmarkValue(costPerSF) : "\u2014",
      fill: `linear-gradient(90deg, ${C.accent}B3, ${C.accentAlt || C.accent}80)`,
      width: costPerSF > 0 ? `${Math.min(100, (costPerSF / 800) * 100)}%` : "0%",
      color: C.accent,
    },
    {
      label: "Win Rate",
      value: winRate !== null && winRate !== undefined ? `${winRate}%` : "N/A",
      fill: `linear-gradient(90deg, ${C.green}B3, ${C.green}80)`,
      width: winRate !== null && winRate !== undefined ? `${winRate}%` : "0%",
      color: C.green,
    },
    {
      label: "Pipeline",
      value: benchmarks.pipeline > 0 ? formatValue(benchmarks.pipeline) : "\u2014",
      fill: `linear-gradient(90deg, ${C.orange}B3, ${C.orange}80)`,
      width: benchmarks.pipeline > 0 ? `${Math.min(100, (benchmarks.pipeline / 20000000) * 100)}%` : "0%",
      color: C.orange,
    },
    {
      label: "Open Bids",
      value: `${openBids}`,
      fill: dk
        ? "linear-gradient(90deg, rgba(255,255,255,0.35), rgba(255,255,255,0.15))"
        : "linear-gradient(90deg, rgba(0,0,0,0.25), rgba(0,0,0,0.10))",
      width: `${Math.min(100, openBids * 10)}%`,
      color: C.text,
    },
  ];

  return (
    <div style={{ fontFamily: font, height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: C.textDim,
          fontFamily: font,
          marginBottom: 10,
        }}
      >
        BENCHMARKS
      </div>
      <div style={{ flex: 1 }}>
        {rows.map((b, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: i < rows.length - 1 ? 10 : 0,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 400, color: C.textMuted, fontFamily: font, flex: 1, minWidth: 0 }}>
              {b.label}
            </span>
            <div
              style={{
                width: 36,
                height: 2,
                borderRadius: 1,
                background: ov(0.06),
                position: "relative",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: b.width,
                  borderRadius: 1,
                  background: b.fill,
                  transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: b.color,
                fontFamily: font,
                minWidth: 28,
                textAlign: "right",
              }}
            >
              {b.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
