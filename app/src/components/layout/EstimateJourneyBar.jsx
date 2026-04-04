// ═══════════════════════════════════════════════════════════════════════════════
// EstimateJourneyBar — Unified journey-driven navigation
//
// Visual Board Spec:
//   5 stages: Discover → Define → Estimate → Network → Propose
//   Active stage expands to show sub-tab pills underneath
//   Single-page stages (Define, Network) navigate directly on click
//   Non-linear: all stages always clickable regardless of completion
//
// Replaces ProjectTabBar. Consumes useJourneyProgress for completion state.
// ═══════════════════════════════════════════════════════════════════════════════
import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useJourneyProgress } from "@/hooks/useJourneyProgress";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useItemsStore } from "@/stores/itemsStore";
import Pill from "@/components/shared/Pill";
import { fmt } from "@/utils/format";
import { detectScopeGaps } from "@/nova/predictive/scopeGapDetector";

// ─── Stage definitions (7 pills, no sub-tabs) ──────────────────────────────
const JOURNEY_STAGES = [
  { key: "define",     label: "Info",      defaultPath: "info",       subTabs: [] },
  { key: "documents",  label: "Docs",      defaultPath: "documents",  subTabs: [] },
  { key: "discover",   label: "Discovery", defaultPath: "plans",      subTabs: [] },
  { key: "estimate",   label: "Estimate",  defaultPath: "takeoffs",   subTabs: [] },
  { key: "network",    label: "Network",   defaultPath: "network",    subTabs: [] },
  { key: "review",     label: "Review",    defaultPath: "review",     subTabs: [] },
  { key: "propose",    label: "Reports",   defaultPath: "reports",    subTabs: [] },
];

// Flat route segment → stage key lookup
const ROUTE_TO_STAGE = {};
JOURNEY_STAGES.forEach(stage => {
  // Default path
  ROUTE_TO_STAGE[stage.defaultPath] = stage.key;
  // Sub-tab paths
  stage.subTabs.forEach(tab => {
    ROUTE_TO_STAGE[tab.path] = stage.key;
  });
});
// Also map legacy routes
ROUTE_TO_STAGE.alternates = "estimate"; // alternates live within estimate now
ROUTE_TO_STAGE.sov = "review";          // SOV moved to review stage

// ─── Keyframes ────────────────────────────────────────────────────────────────
const KEYFRAMES = `
@keyframes jbPulse {
  0%    { box-shadow: 0 0 0 0 var(--jb-accent30); }
  50%   { box-shadow: 0 0 0 4px var(--jb-accent10); }
  100%  { box-shadow: 0 0 0 0 var(--jb-accent00); }
}
@keyframes jbCheckDraw {
  from { stroke-dashoffset: 12; }
  to   { stroke-dashoffset: 0; }
}
@keyframes jbCompletePulse {
  0%    { transform: scale(1); }
  40%   { transform: scale(1.15); }
  70%   { transform: scale(1.04); }
  100%  { transform: scale(1); }
}
@keyframes jbShimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

// ─── Checkmark SVG ────────────────────────────────────────────────────────────
function Checkmark({ animate }) {
  return (
    <svg viewBox="0 0 12 12" width={9} height={9} style={{ display: "block" }}>
      <path
        d="M3 6.5 L5.5 9 L9.5 3.5"
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={animate ? 12 : undefined}
        strokeDashoffset={animate ? 0 : undefined}
        style={animate ? { animation: "jbCheckDraw 200ms ease-out forwards" } : undefined}
      />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function EstimateJourneyBar() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const location = useLocation();
  const navigate = useNavigate();
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const setupComplete = useProjectStore(s => s.project.setupComplete);
  const project = useProjectStore(s => s.project);
  const getCompanyInfo = useMasterDataStore(s => s.getCompanyInfo);
  const items = useItemsStore(s => s.items);
  const getTotals = useItemsStore(s => s.getTotals);
  const { stages, justCompleted } = useJourneyProgress();

  const companyInfo = getCompanyInfo(project.companyProfileId);
  const companyInitial = (companyInfo?.name || "?")[0].toUpperCase();

  // ─── Animation state ────────────────────────────────────────────────────
  const [animatingKeys, setAnimatingKeys] = useState({});
  const [hoveredStage, setHoveredStage] = useState(null);
  const [hoveredSubTab, setHoveredSubTab] = useState(null);
  const allCompleteRef = useRef(false);
  const [showShimmer, setShowShimmer] = useState(false);

  // ─── Responsive ─────────────────────────────────────────────────────────
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.innerWidth < 1024);
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.innerWidth < 700);

  useEffect(() => {
    const handler = () => {
      setCompact(window.innerWidth < 1024);
      setCollapsed(window.innerWidth < 700);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ─── Completion animation lifecycle ─────────────────────────────────────
  useEffect(() => {
    const keys = Object.keys(justCompleted);
    if (keys.length === 0) return;
    setAnimatingKeys(prev => {
      const next = { ...prev };
      keys.forEach(k => (next[k] = true));
      return next;
    });
    const timer = setTimeout(() => {
      setAnimatingKeys(prev => {
        const next = { ...prev };
        keys.forEach(k => delete next[k]);
        return next;
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [justCompleted]);

  // ─── All-complete shimmer (one-time) ────────────────────────────────────
  useEffect(() => {
    const allDone = stages.every(s => s.complete);
    if (allDone && !allCompleteRef.current) {
      allCompleteRef.current = true;
      setShowShimmer(true);
      const t = setTimeout(() => setShowShimmer(false), 1500);
      return () => clearTimeout(t);
    }
  }, [stages]);

  // ─── Route detection ────────────────────────────────────────────────────
  const pathParts = location.pathname.split("/");
  const routeSegment = pathParts[3] || "";
  const activeStageKey = ROUTE_TO_STAGE[routeSegment] || null;

  const activeStage = JOURNEY_STAGES.find(s => s.key === activeStageKey);
  const activeSubTabs = activeStage?.subTabs || [];
  const showSubTabs = activeSubTabs.length >= 2;

  // Build stage completion map from journey progress
  const stageMap = useMemo(() => {
    const m = {};
    stages.forEach(s => (m[s.key] = s.complete));
    return m;
  }, [stages]);

  // ─── Visibility guard ──────────────────────────────────────────────────
  const inEstimate = location.pathname.startsWith("/estimate/");
  if (!inEstimate || !activeId || setupComplete === false) return null;

  const handleStageClick = stage => {
    navigate(`/estimate/${activeId}/${stage.defaultPath}`);
  };

  const handleSubTabClick = tab => {
    navigate(`/estimate/${activeId}/${tab.path}`);
  };

  // ─── Collapsed mode (< 700px): dropdown ────────────────────────────────
  if (collapsed) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: `0 ${T.space[4]}px`,
          height: 40,
          minHeight: 40,
          background: C.bg,
          borderBottom: `1px solid ${C.border}`,
          fontFamily: T.font.sans,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: C.text, flexShrink: 0 }}>
          {project.name || "Untitled"}
        </span>
        <div style={{ flex: 1 }} />
        <select
          value={routeSegment}
          onChange={e => navigate(`/estimate/${activeId}/${e.target.value}`)}
          style={{
            background: C.bg1,
            color: C.text,
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.sm,
            padding: "4px 8px",
            fontSize: 11,
            fontFamily: T.font.sans,
            cursor: "pointer",
            outline: "none",
          }}
        >
          {JOURNEY_STAGES.map(stage =>
            stage.subTabs.length <= 1 ? (
              <option key={stage.key} value={stage.defaultPath}>
                {stage.label}
              </option>
            ) : (
              <optgroup key={stage.key} label={stage.label}>
                {stage.subTabs.map(tab => (
                  <option key={tab.key} value={tab.path}>
                    {tab.label}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </select>
      </div>
    );
  }

  // ─── Full render ────────────────────────────────────────────────────────
  const barHeight = showSubTabs ? 68 : 44;

  return (
    <>
      <style>
        {KEYFRAMES.replace(/var\(--jb-accent30\)/g, `${C.accent}30`)
          .replace(/var\(--jb-accent10\)/g, `${C.accent}10`)
          .replace(/var\(--jb-accent00\)/g, `${C.accent}00`)}
      </style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: barHeight,
          background: C.bg,
          borderBottom: `1px solid ${C.border}`,
          fontFamily: T.font.sans,
          transition: "min-height 250ms ease",
          position: "relative",
          overflow: "visible",
        }}
      >
        {/* ── Row 1: Project | Journey Nodes | Pills ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 44,
            minHeight: 44,
            padding: `0 ${T.space[5]}px`,
            gap: 8,
          }}
        >
          {/* LEFT — Project identity */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingRight: 12,
              marginRight: 4,
              borderRight: `1px solid ${C.border}`,
              flexShrink: 0,
            }}
          >
            {companyInfo?.logo ? (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  flexShrink: 0,
                  background: dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.03)",
                  border: dk ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.04)",
                  overflow: "hidden",
                }}
              >
                <img src={companyInfo.logo} alt="" style={{ maxHeight: 18, maxWidth: 18, objectFit: "contain" }} />
              </div>
            ) : (
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: `${C.accent}18`,
                  border: `1px solid ${C.accent}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.accent,
                  flexShrink: 0,
                }}
              >
                {companyInitial}
              </div>
            )}
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: C.text,
                maxWidth: compact ? 100 : 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {project.name || "Untitled"}
            </span>
          </div>

          {/* CENTER — Journey nodes */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                maxWidth: 480,
                width: "100%",
                position: "relative",
              }}
            >
              {JOURNEY_STAGES.map((stage, i) => {
                const isActive = stage.key === activeStageKey;
                const isComplete = !isActive && !!stageMap[stage.key];
                const isAnimating = !!animatingKeys[stage.key];
                const isHovered = hoveredStage === stage.key && !isActive;
                const prevStage = i > 0 ? JOURNEY_STAGES[i - 1] : null;
                const prevComplete = prevStage && !!stageMap[prevStage.key];
                const prevIsActive = prevStage && prevStage.key === activeStageKey;
                const connectorTraveled = prevComplete || prevIsActive;

                // Pill style by state
                let pillStyle = {
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 12px",
                  borderRadius: 99,
                  fontSize: 10,
                  fontWeight: isActive ? 600 : 500,
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  transition: "all 200ms ease",
                  flexShrink: 0,
                  border: "none",
                  fontFamily: T.font.sans,
                };

                if (isActive) {
                  pillStyle = {
                    ...pillStyle,
                    background: `${C.accent}18`,
                    color: C.accent,
                    boxShadow: `0 0 0 1px ${C.accent}25`,
                  };
                } else if (isComplete) {
                  pillStyle = {
                    ...pillStyle,
                    background: `${C.green}10`,
                    color: `${C.green}CC`,
                    animation: isAnimating ? "jbCompletePulse 400ms cubic-bezier(0.175,0.885,0.32,1.275)" : undefined,
                  };
                } else {
                  pillStyle = {
                    ...pillStyle,
                    background: "transparent",
                    color: isHovered ? C.textMuted : C.textDim,
                  };
                }

                return (
                  <Fragment key={stage.key}>
                    {/* Connector */}
                    {i > 0 && (
                      <div
                        style={{
                          flex: 1,
                          height: 1.5,
                          minWidth: compact ? 16 : 24,
                          borderRadius: 1,
                          position: "relative",
                          overflow: "hidden",
                          background: `${C.border}10`,
                        }}
                      >
                        {/* Fill overlay */}
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            height: "100%",
                            width: connectorTraveled ? "100%" : "0%",
                            background: showShimmer
                              ? `linear-gradient(90deg, ${C.accent}30, #FFD70060, ${C.accent}30)`
                              : `${C.accent}25`,
                            backgroundSize: showShimmer ? "200% 100%" : undefined,
                            animation: showShimmer ? "jbShimmer 1.2s ease-in-out" : undefined,
                            transition: "width 400ms ease",
                          }}
                        />
                      </div>
                    )}

                    {/* Pill node */}
                    <div
                      onClick={() => handleStageClick(stage)}
                      onMouseEnter={() => setHoveredStage(stage.key)}
                      onMouseLeave={() => setHoveredStage(null)}
                      style={pillStyle}
                      title={`${stage.label}${isComplete ? " ✓" : ""}`}
                    >
                      {isComplete && !isActive && <Checkmark animate={isAnimating} />}
                      {stage.label}
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </div>

          {/* RIGHT — Scope coverage + Item count + total pills */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: T.space[2],
              flexShrink: 0,
              paddingLeft: 8,
              marginLeft: 4,
              borderLeft: `1px solid ${C.border}`,
            }}
          >
            {/* Ambient scope gap indicator */}
            {(() => {
              if (!project.buildingType || !project.projectSF || items.length === 0) return null;
              try {
                const gaps = detectScopeGaps({
                  items,
                  buildingType: project.buildingType,
                  workType: project.workType,
                  projectSF: project.projectSF,
                  laborType: project.laborType,
                });
                if (gaps.missingCount === 0) return (
                  <div title="All expected divisions covered" style={{
                    display: "flex", alignItems: "center", gap: 3,
                    padding: "2px 8px", borderRadius: 99,
                    background: "rgba(34,197,94,0.08)", fontSize: 9, fontWeight: 600,
                    color: "#22c55e", letterSpacing: "0.02em",
                  }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} />
                    {gaps.completionPct}%
                  </div>
                );
                const color = gaps.missingCount >= 5 ? "#ef4444" : gaps.missingCount >= 3 ? "#eab308" : "#f97316";
                return (
                  <div
                    title={`${gaps.missingCount} missing division${gaps.missingCount !== 1 ? "s" : ""} — $${gaps.totalMissingCost.toLocaleString()} not in estimate. Ask NOVA "What am I missing?"`}
                    style={{
                      display: "flex", alignItems: "center", gap: 3,
                      padding: "2px 8px", borderRadius: 99,
                      background: `${color}10`, fontSize: 9, fontWeight: 600,
                      color, letterSpacing: "0.02em", cursor: "default",
                    }}
                  >
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
                    {gaps.missingCount} gap{gaps.missingCount !== 1 ? "s" : ""}
                  </div>
                );
              } catch { return null; }
            })()}
            <Pill label="Items" value={items.length} />
            {project.projectSF > 0 && (
              <Pill label="$/SF" value={`$${(getTotals().grand / project.projectSF).toFixed(0)}`} />
            )}
            <Pill label="Total" value={fmt(getTotals().grand)} accent />
          </div>
        </div>

        {/* ── Row 2: Sub-tab expansion ── */}
        <div
          style={{
            overflow: "hidden",
            maxHeight: showSubTabs ? 28 : 0,
            opacity: showSubTabs ? 1 : 0,
            transition: "max-height 250ms ease, opacity 200ms ease",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 24,
              gap: 2,
              paddingBottom: 4,
            }}
          >
            {activeSubTabs.map(tab => {
              const isActiveTab = routeSegment === tab.path;
              const isTabHovered = hoveredSubTab === tab.key && !isActiveTab;

              return (
                <button
                  key={tab.key}
                  onClick={() => handleSubTabClick(tab)}
                  onMouseEnter={() => setHoveredSubTab(tab.key)}
                  onMouseLeave={() => setHoveredSubTab(null)}
                  className="ghost-btn"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 12px",
                    background: isActiveTab ? `${C.accent}12` : "transparent",
                    border: "none",
                    borderRadius: T.radius.full,
                    cursor: "pointer",
                    fontSize: 10,
                    fontWeight: isActiveTab ? 600 : 500,
                    fontFamily: T.font.sans,
                    color: isActiveTab ? C.accent : isTabHovered ? C.textMuted : C.textDim,
                    transition: "all 150ms ease",
                    whiteSpace: "nowrap",
                    position: "relative",
                  }}
                >
                  {tab.label}
                  {isActiveTab && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 10,
                        right: 10,
                        height: 1.5,
                        borderRadius: 1,
                        background: C.gradient || C.accent,
                        boxShadow: `0 0 4px ${C.accent}30`,
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
