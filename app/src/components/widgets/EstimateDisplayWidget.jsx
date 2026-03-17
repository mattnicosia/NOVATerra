import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDashboardData } from "@/hooks/useDashboardData";

/* ────────────────────────────────────────────────────────
   EstimateDisplayWidget — active estimate dollar display
   ──────────────────────────────────────────────────────── */

const nn = v => (typeof v === "number" && !isNaN(v) ? v : 0);

export default function EstimateDisplayWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const { activeProject } = useDashboardData();

  const project = activeProject || {};
  const name = project.name || "Nova";
  const value = nn(project.value);
  const deltaText = project.deltaText || "";

  const formatted = useMemo(() => {
    if (value === 0 && !activeProject) return { dollars: "0", cents: "00" };
    const parts = value
      .toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      .split(".");
    return { dollars: parts[0], cents: parts[1] };
  }, [value, activeProject]);

  const deltaColor = deltaText.includes("OVERDUE") ? C.red : deltaText.includes("Won") ? C.green : C.textMuted;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: C.textDim,
          fontFamily: T.font.display,
        }}
      >
        {name}
      </div>

      <div
        style={{
          fontSize: 56,
          fontWeight: 300,
          color: C.text,
          fontFamily: T.font.display,
          lineHeight: 1,
          marginTop: 4,
          textShadow: dk
            ? `0 0 40px ${C.accent}40, 0 0 80px ${C.accentDim}28, 0 0 120px ${C.accent}14, 0 4px 12px rgba(0,0,0,0.45)`
            : `0 0 30px ${C.accent}20, 0 0 60px ${C.accentDim}10, 0 1px 2px rgba(0,0,0,0.06)`,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 400, color: C.accent, verticalAlign: 14 }}>$</span>
        {formatted.dollars}
        <span style={{ fontSize: 18, fontWeight: 300, color: C.textDim, verticalAlign: 3 }}>.{formatted.cents}</span>
      </div>

      {deltaText && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.07em",
            color: deltaColor,
            fontFamily: T.font.display,
            marginTop: 6,
          }}
        >
          {deltaText}
        </div>
      )}
    </div>
  );
}
