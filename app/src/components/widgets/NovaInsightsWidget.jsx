import { useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useFirmMemoryStore } from "@/nova/learning/firmMemory";
import { useCorrectionStore } from "@/nova/learning/correctionStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

/* ────────────────────────────────────────────────────────
   NovaInsightsWidget — AI observations from recent scans
   Grid widget version of Sprint 4.2 NOVA Insights
   Uses raw state selectors + useMemo to avoid re-render loops
   ──────────────────────────────────────────────────────── */

export default function NovaInsightsWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const ov = useMemo(() => a => (dk ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`), [dk]);

  // Select raw state to avoid creating new objects on every render
  const firms = useFirmMemoryStore(s => s.firms);
  const corrections = useCorrectionStore(s => s.corrections);
  const globalPatterns = useCorrectionStore(s => s.globalPatterns);

  const firmStats = useMemo(() => {
    const firmList = Object.values(firms || {});
    return {
      totalFirms: firmList.length,
      totalPatterns: firmList.reduce((sum, f) => sum + (f.patterns?.length || 0), 0),
    };
  }, [firms]);

  const correctionStats = useMemo(() => {
    const corrList = corrections || [];
    const patterns = globalPatterns || [];
    return {
      totalCorrections: corrList.length,
      uniquePatterns: patterns.length,
      topPatterns: patterns.slice(0, 5),
    };
  }, [corrections, globalPatterns]);

  const insights = useMemo(() => {
    const list = [];

    if (firmStats.totalFirms > 0) {
      list.push({
        text: `NOVA has learned patterns from ${firmStats.totalFirms} architect/engineer firm${firmStats.totalFirms !== 1 ? "s" : ""}`,
        color: C.accent,
        icon: "ai",
      });
    }

    if (firmStats.totalPatterns > 0) {
      list.push({
        text: `${firmStats.totalPatterns} firm-specific convention${firmStats.totalPatterns !== 1 ? "s" : ""} tracked for faster scans`,
        color: C.purple || C.accent,
        icon: "intelligence",
      });
    }

    if (correctionStats.totalCorrections > 0) {
      list.push({
        text: `${correctionStats.totalCorrections} user correction${correctionStats.totalCorrections !== 1 ? "s" : ""} logged — NOVA is learning your preferences`,
        color: C.green,
        icon: "insights",
      });
    }

    if (correctionStats.uniquePatterns > 0) {
      list.push({
        text: `${correctionStats.uniquePatterns} recurring pattern${correctionStats.uniquePatterns !== 1 ? "s" : ""} identified for auto-correction`,
        color: C.blue || C.accent,
        icon: "check",
      });
    }

    if (correctionStats.topPatterns?.length > 0) {
      const top = correctionStats.topPatterns[0];
      list.push({
        text: `Most common correction: ${top.field || top.type} (${top.frequency}x)`,
        color: C.orange,
        icon: "edit",
      });
    }

    if (list.length === 0) {
      list.push({
        text: "Upload and scan drawings to start building NOVA intelligence",
        color: ov(0.35),
        icon: "ai",
      });
    }

    return list.slice(0, 4);
  }, [firmStats, correctionStats, C, ov]);

  return (
    <div style={{ padding: "14px 16px", height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: ov(0.4),
          fontFamily: T.font.display,
          marginBottom: 10,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Ic d={I.ai} size={11} color={C.accent} />
        NOVA Insights
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {insights.map((insight, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              padding: "4px 0",
            }}
          >
            <Ic d={I[insight.icon] || I.ai} size={12} color={insight.color} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 10, color: C.text, lineHeight: 1.5, fontFamily: T.font.display }}>
              {insight.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
