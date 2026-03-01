// NovaIntelligenceMeter — Animated visual showing NOVA's intelligence level
// Based on how much data has been fed (proposals, cost items, assemblies, etc.)

import { useMemo } from 'react';
import { useTheme } from '@/hooks/useTheme';

export default function NovaIntelligenceMeter({ proposalCount, elementCount, assemblyCount, drawingNoteCount }) {
  const C = useTheme();
  const T = C.T;

  // Calculate intelligence score (0-100)
  const score = useMemo(() => {
    let s = 0;
    // Proposals: most impactful (each worth 8 pts, max 40)
    s += Math.min(40, proposalCount * 8);
    // Cost DB items: moderate (each worth 0.5 pts, max 25)
    s += Math.min(25, elementCount * 0.5);
    // Assemblies: moderate (each worth 2 pts, max 20)
    s += Math.min(20, assemblyCount * 2);
    // Drawing notes: lightweight (each worth 1 pt, max 15)
    s += Math.min(15, drawingNoteCount * 1);
    return Math.min(100, Math.round(s));
  }, [proposalCount, elementCount, assemblyCount, drawingNoteCount]);

  const level = score < 20 ? "Initializing" : score < 40 ? "Learning" : score < 65 ? "Developing" : score < 85 ? "Proficient" : "Expert";
  const levelColor = score < 20 ? "#EF4444" : score < 40 ? "#F59E0B" : score < 65 ? "#3B82F6" : score < 85 ? "#8B5CF6" : "#10B981";

  const totalItems = proposalCount + elementCount + assemblyCount + drawingNoteCount;

  return (
    <div style={{
      padding: "20px 24px",
      borderRadius: T.radius.lg,
      background: `linear-gradient(145deg, ${C.bg2} 0%, ${C.bg1} 100%)`,
      border: `1px solid ${C.border}`,
      position: "relative", overflow: "hidden",
    }}>
      {/* Subtle gradient glow */}
      <div style={{
        position: "absolute", top: -40, right: -40,
        width: 160, height: 160, borderRadius: "50%",
        background: `radial-gradient(circle, ${levelColor}08 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap", position: "relative" }}>
        {/* Left: label + description */}
        <div style={{ flex: "1 1 280px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>NOVA Intelligence</span>
            <span style={{
              fontSize: 9, fontWeight: 600, letterSpacing: "0.06em",
              padding: "2px 8px", borderRadius: 10,
              background: `${levelColor}15`, color: levelColor,
              textTransform: "uppercase",
            }}>
              {level}
            </span>
          </div>
          <p style={{ fontSize: 11.5, color: C.textMuted, margin: 0, lineHeight: 1.5 }}>
            {totalItems === 0
              ? "Upload proposals and cost data to begin training NOVA's intelligence engine."
              : `NOVA has learned from ${totalItems.toLocaleString()} data ${totalItems === 1 ? 'point' : 'points'} — ${proposalCount} proposal${proposalCount !== 1 ? 's' : ''}, ${elementCount} cost item${elementCount !== 1 ? 's' : ''}, ${assemblyCount} assembl${assemblyCount !== 1 ? 'ies' : 'y'}, ${drawingNoteCount} drawing note${drawingNoteCount !== 1 ? 's' : ''}.`
            }
          </p>
        </div>

        {/* Right: score + bar */}
        <div style={{ flex: "0 0 200px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{
              fontSize: 28, fontWeight: 700, color: levelColor,
              fontFamily: "'DM Mono', monospace", lineHeight: 1,
            }}>
              {score}
            </span>
            <span style={{ fontSize: 11, color: C.textDim, fontWeight: 500 }}>/ 100</span>
          </div>

          {/* Progress bar */}
          <div style={{
            height: 6, borderRadius: 3,
            background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 3,
              width: `${score}%`,
              background: `linear-gradient(90deg, ${levelColor}, ${levelColor}CC)`,
              boxShadow: `0 0 8px ${levelColor}40`,
              transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
            }} />
          </div>

          {/* Segment labels */}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.textDim, letterSpacing: "0.04em" }}>
            <span>Init</span>
            <span>Learning</span>
            <span>Proficient</span>
            <span>Expert</span>
          </div>
        </div>
      </div>
    </div>
  );
}
