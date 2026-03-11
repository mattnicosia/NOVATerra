import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useProjectStore } from "@/stores/projectStore";
import { useItemsStore } from "@/stores/itemsStore";
import Ic from "@/components/shared/Ic";
import Pill from "@/components/shared/Pill";
import NovaTerraLogo from "@/components/shared/NovaTerraLogo";
import { I } from "@/constants/icons";
import { fmt } from "@/utils/format";
import ActivityTimerPill from "@/components/shared/ActivityTimerPill";

const estimateNav = [
  { key: "info", path: "info", icon: I.settings, label: "Project Info" },
  { key: "plans", path: "plans", icon: I.plans, label: "Discovery" },
  { key: "takeoffs", path: "takeoffs", icon: I.takeoff, label: "Estimate" },
  { key: "alternates", path: "alternates", icon: I.change, label: "Alternates" },
  { key: "sov", path: "sov", icon: I.dollar, label: "SOV" },
  { key: "reports", path: "reports", icon: I.report, label: "Reports" },
  { key: "insights", path: "insights", icon: I.insights, label: "Insights" },
];

export default function Header() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const location = useLocation();
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const getTotals = useItemsStore(s => s.getTotals);

  // Determine which estimate nav tab is active
  const currentPath = location.pathname;
  const activeTab = activeId ? estimateNav.find(n => currentPath.endsWith(`/${n.path}`))?.key : null;

  return (
    <div
      className={!C.isDark ? "scroll-edge-soft" : undefined}
      style={{
        minHeight: T.header.height,
        padding: `0 ${T.space[6]}px`,
        background: C.isDark
          ? C.glassBg || "rgba(15,15,30,0.38)"
          : `linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 50%), ${C.glassBg || "rgba(255,255,255,0.32)"}`,
        backdropFilter: T.glass.blur,
        WebkitBackdropFilter: T.glass.blur,
        borderBottom: `1px solid ${
          C.isDark ? T.glass.border || "rgba(255,255,255,0.12)" : C.glassBorder || C.border || "rgba(0,0,0,0.08)"
        }`,
        boxShadow: C.isDark
          ? [T.glass.specular, T.shadow.sm, T.glass.edge].filter(Boolean).join(", ")
          : "inset 0 -1px 0 rgba(255,255,255,0.5), 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.03)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        position: "relative",
        zIndex: T.z.sticky,
      }}
    >
      {/* Subtle gradient line along bottom edge */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent 0%, ${C.accent}15 30%, ${C.accent}25 50%, ${C.accent}15 70%, transparent 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* Top row: breadcrumb + pills */}
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: T.header.height }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
          {activeId && (
            <>
              <button
                onClick={() => {
                  useEstimatesStore.getState().setActiveEstimateId(null);
                  navigate("/");
                }}
                className="ghost-btn"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: T.fontSize.sm,
                  color: C.textMuted,
                  display: "flex",
                  alignItems: "center",
                  gap: T.space[1],
                  padding: "4px 8px",
                  borderRadius: T.radius.sm,
                }}
              >
                <Ic d={I.chevron} size={12} color={C.textDim} sw={2} style={{ transform: "rotate(180deg)" }} />
                All Estimates
              </button>
              <span style={{ color: C.textDim, fontSize: T.fontSize.sm, opacity: 0.4 }}>›</span>
              <span
                style={{
                  fontSize: T.fontSize.md,
                  fontWeight: T.fontWeight.bold,
                  color: C.text,
                  animation: "fadeIn 0.2s ease-out",
                }}
              >
                {project.name || "Untitled"}
              </span>
            </>
          )}
          {!activeId && (
            <div style={{ animation: "fadeIn 0.3s ease-out" }}>
              <NovaTerraLogo size={61} />
            </div>
          )}
        </div>

        {activeId && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: T.space[2],
              animation: "staggerFadeRight 0.4s cubic-bezier(0.16,1,0.3,1) 0.1s both",
            }}
          >
            <ActivityTimerPill />
            <Pill label="Items" value={items.length} />
            <Pill label="Total" value={fmt(getTotals().grand)} accent />
          </div>
        )}
      </div>

      {/* Estimate horizontal nav tabs */}
      {activeId && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            paddingBottom: T.space[2],
            animation: "staggerFadeRight 0.3s cubic-bezier(0.16,1,0.3,1) 0.05s both",
          }}
        >
          {estimateNav.map(item => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(`/estimate/${activeId}/${item.path}`)}
                className="ghost-btn"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  background: isActive ? C.accentBg : "transparent",
                  border: "none",
                  borderRadius: T.radius.sm,
                  cursor: "pointer",
                  fontSize: T.fontSize.xs,
                  fontWeight: isActive ? T.fontWeight.semibold : T.fontWeight.medium,
                  fontFamily: T.font.sans,
                  color: isActive ? C.accent : C.textMuted,
                  transition: T.transition.fast,
                  position: "relative",
                  whiteSpace: "nowrap",
                }}
              >
                <Ic d={item.icon} size={13} color={isActive ? C.accent : C.textMuted} sw={isActive ? 2 : 1.7} />
                {item.label}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: -2,
                      left: 8,
                      right: 8,
                      height: 2,
                      borderRadius: 1,
                      background: C.gradient || C.accent,
                      boxShadow: `0 0 6px ${C.accent}40`,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
