import { useTheme } from "@/hooks/useTheme";
import { fmt } from "@/utils/format";

export default function EstimateTotalsBar({ totals, filteredItemCount, grandTotalRef }) {
  const C = useTheme();
  const T = C.T;

  return (
    <div
      style={{
        padding: "8px 20px",
        borderTop: `1px solid ${C.border}`,
        background: `linear-gradient(180deg, ${C.bg1}, ${C.bg2}40)`,
        flexShrink: 0,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>
          Direct{" "}
          <span
            style={{
              color: C.textMuted,
              fontFamily: T.font.sans,
              fontFeatureSettings: "'tnum'",
              fontWeight: 600,
            }}
          >
            {fmt(totals.direct)}
          </span>
        </span>
        <span style={{ fontSize: 10, color: C.textDim, fontWeight: 500 }}>{filteredItemCount} items</span>
      </div>
      <span
        ref={grandTotalRef}
        style={{
          fontSize: T.fontSize["2xl"] || 28,
          fontWeight: 800,
          fontFeatureSettings: "'tnum'",
          fontFamily: T.font.sans,
          display: "inline-block",
          letterSpacing: -0.5,
          ...(C.isDark && C.gradient
            ? {
                background: C.gradient,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }
            : { color: C.accent }),
        }}
      >
        {fmt(totals.grand)}
      </span>
    </div>
  );
}
