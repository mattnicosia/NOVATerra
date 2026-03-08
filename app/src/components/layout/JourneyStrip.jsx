// ═══════════════════════════════════════════════════════════════════════════════
// JourneyStrip — Bid lifecycle progress indicator
//
// Visual Board Final Spec:
//   5 nodes: Discover → Define → Estimate → Bid → Propose
//   3 states: active (accent, glow), complete (green, checkmark), available (outline)
//   Connectors: traveled (left node complete) vs untraveled
//   Completion animation: 400ms scale pulse + checkmark stroke-draw
//   Height: 36px desktop, 28px compact (<768px), hidden <480px
//
// Mounts below ProjectTabBar on estimate-scoped routes.
// Non-linear: every node is always clickable. No lockout.
// ═══════════════════════════════════════════════════════════════════════════════
import { Fragment, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useJourneyProgress } from "@/hooks/useJourneyProgress";
import { useProjectStore } from "@/stores/projectStore";
import { useEstimatesStore } from "@/stores/estimatesStore";

// ─── Route → Stage mapping ──────────────────────────────────────────────────
const ROUTE_TO_STAGE = {
  plans: "discover",
  documents: "discover",
  info: "define",
  takeoffs: "estimate",
  alternates: "estimate",
  sov: "estimate",
  bids: "bid",
  reports: "propose",
  insights: null,
};

// ─── Keyframe CSS (injected once) ───────────────────────────────────────────
const KEYFRAMES = `
@keyframes jsPulse {
  0%    { transform: scale(1); }
  37.5% { transform: scale(1.2); }
  62.5% { transform: scale(1.05); }
  100%  { transform: scale(1); }
}
@keyframes jsCheckDraw {
  from { stroke-dashoffset: 12; }
  to   { stroke-dashoffset: 0; }
}
`;

// ─── Checkmark SVG ──────────────────────────────────────────────────────────
// Hand-drawn path: left arm shorter than right. Stroke-only, no fill.
// Draws itself in on completion via stroke-dashoffset animation.
function Checkmark({ animate }) {
  return (
    <svg viewBox="0 0 12 12" width={10} height={10} style={{ display: "block" }}>
      <path
        d="M3 6.5 L5.5 9 L9.5 3.5"
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={animate ? 12 : undefined}
        strokeDashoffset={animate ? 0 : undefined}
        style={animate ? { animation: "jsCheckDraw 200ms ease-out forwards" } : undefined}
      />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function JourneyStrip() {
  const C = useTheme();
  const T = C.T;
  const location = useLocation();
  const navigate = useNavigate();
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const setupComplete = useProjectStore(s => s.project.setupComplete);
  const { stages, justCompleted } = useJourneyProgress();

  // ─── Animation state: tracks which nodes are mid-completion-animation ─────
  const [animatingKeys, setAnimatingKeys] = useState({});
  const [hoveredKey, setHoveredKey] = useState(null);
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [hidden, setHidden] = useState(() => typeof window !== "undefined" && window.innerWidth < 480);

  // ─── Responsive ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      setCompact(window.innerWidth < 768);
      setHidden(window.innerWidth < 480);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ─── Completion animation lifecycle ───────────────────────────────────────
  // When a stage transitions to complete, add it to animatingKeys for 600ms
  useEffect(() => {
    const keys = Object.keys(justCompleted);
    if (keys.length === 0) return;

    setAnimatingKeys(prev => {
      const next = { ...prev };
      keys.forEach(k => {
        next[k] = true;
      });
      return next;
    });

    const timer = setTimeout(() => {
      setAnimatingKeys(prev => {
        const next = { ...prev };
        keys.forEach(k => {
          delete next[k];
        });
        return next;
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [justCompleted]);

  // ─── Route detection ──────────────────────────────────────────────────────
  const pathParts = location.pathname.split("/");
  const routeSegment = pathParts[3] || "";
  const activeKey = ROUTE_TO_STAGE[routeSegment] || null;

  // ─── Visibility guard ─────────────────────────────────────────────────────
  // Same conditions as ProjectTabBar: estimate route + setup complete
  const inEstimate = location.pathname.startsWith("/estimate/");
  if (!inEstimate || !activeEstimateId || setupComplete === false || hidden) return null;

  const handleNav = path => {
    navigate(`/estimate/${activeEstimateId}/${path}`);
  };

  const stripHeight = compact ? 28 : 36;

  return (
    <>
      <style>{KEYFRAMES}</style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: stripHeight,
          minHeight: stripHeight,
          padding: `0 ${T.space[6]}px`,
          background: C.bg,
          borderBottom: `1px solid ${C.border}06`,
          flexShrink: 0,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            maxWidth: 560,
            width: "100%",
          }}
        >
          {stages.map((stage, i) => {
            const isActive = stage.key === activeKey;
            const isComplete = stage.complete;
            const isAnimating = !!animatingKeys[stage.key];
            const isHovered = hoveredKey === stage.key && !isActive;
            const prevComplete = i > 0 && stages[i - 1].complete;

            // ── Circle style by state ──
            let circleStyle = {
              width: 20,
              height: 20,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 300ms ease-out",
              flexShrink: 0,
            };

            if (isActive) {
              circleStyle = {
                ...circleStyle,
                background: C.accent,
                boxShadow: `0 0 0 1px ${C.accent}15, 0 0 8px ${C.accent}30`,
              };
            } else if (isComplete) {
              circleStyle = {
                ...circleStyle,
                background: `${C.green}B3`,
                animation: isAnimating ? "jsPulse 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)" : undefined,
              };
            } else {
              circleStyle = {
                ...circleStyle,
                background: "transparent",
                border: `1.5px solid ${isHovered ? `${C.text}50` : `${C.textDim}40`}`,
              };
            }

            // ── Label style by state ──
            const labelStyle = {
              fontSize: 9,
              letterSpacing: "0.02em",
              transition: "color 150ms ease",
              whiteSpace: "nowrap",
              fontWeight: isActive ? 600 : 500,
              color: isActive ? C.text : isComplete ? C.textMuted : isHovered ? C.textMuted : C.textDim,
            };

            return (
              <Fragment key={stage.key}>
                {/* ── Connector (between previous and current node) ── */}
                {i > 0 && (
                  <div
                    style={{
                      flex: 1,
                      height: 1.5,
                      background: `${C.border}08`,
                      position: "relative",
                      overflow: "hidden",
                      minWidth: 12,
                    }}
                  >
                    {/* Traveled overlay — shows if left node is complete */}
                    {prevComplete && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          height: "100%",
                          width: "100%",
                          background: `${C.accent}20`,
                        }}
                      />
                    )}
                  </div>
                )}

                {/* ── Node (circle + label) ── */}
                <div
                  onClick={() => handleNav(stage.path)}
                  onMouseEnter={() => setHoveredKey(stage.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: compact ? 0 : 3,
                    cursor: "pointer",
                    flexShrink: 0,
                    padding: "0 2px",
                  }}
                  title={compact ? `${stage.label}${isComplete ? " ✓" : ""}` : undefined}
                >
                  {/* Circle */}
                  <div style={circleStyle}>
                    {/* Checkmark — only on complete non-active nodes */}
                    {isComplete && !isActive && <Checkmark animate={isAnimating} />}
                  </div>

                  {/* Label — hidden in compact mode */}
                  {!compact && <span style={labelStyle}>{stage.label}</span>}
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </>
  );
}
