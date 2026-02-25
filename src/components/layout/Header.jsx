import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useProjectStore } from '@/stores/projectStore';
import { useItemsStore } from '@/stores/itemsStore';
import Ic from '@/components/shared/Ic';
import Pill from '@/components/shared/Pill';
import BldgOmniLogo from '@/components/shared/BldgOmniLogo';
import { I } from '@/constants/icons';
import { fmt } from '@/utils/format';

const estimateNav = [
  { key: "info",       path: "info",       icon: I.settings,  label: "Project Info" },
  { key: "plans",      path: "plans",      icon: I.plans,     label: "Plan Room" },
  { key: "takeoffs",   path: "takeoffs",   icon: I.takeoff,   label: "Takeoffs" },
  { key: "estimate",   path: "estimate",   icon: I.estimate,  label: "Estimate" },
  { key: "alternates", path: "alternates", icon: I.change,    label: "Alternates" },
  { key: "sov",        path: "sov",        icon: I.dollar,    label: "SOV" },
  { key: "reports",    path: "reports",    icon: I.report,    label: "Reports" },
  { key: "insights",   path: "insights",   icon: I.insights,  label: "Insights" },
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
    <div style={{
      minHeight: T.header.height,
      padding: `0 ${T.space[6]}px`,
      background: C.glassBg || 'rgba(18,21,28,0.55)',
      backdropFilter: T.glass.blur,
      WebkitBackdropFilter: T.glass.blur,
      borderBottom: `1px solid ${C.glassBorder || C.border}`,
      boxShadow: T.shadow.sm,
      display: "flex", flexDirection: "column", justifyContent: "center",
      position: "relative", zIndex: T.z.sticky,
    }}>
      {/* Subtle gradient line along bottom edge */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        height: 1,
        background: `linear-gradient(90deg, transparent 0%, ${C.accent}15 30%, ${C.accent}25 50%, ${C.accent}15 70%, transparent 100%)`,
        pointerEvents: "none",
      }} />

      {/* Top row: breadcrumb + pills */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: T.header.height }}>
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
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: T.fontSize.sm, color: C.textMuted, display: "flex", alignItems: "center", gap: T.space[1],
                  padding: "4px 8px", borderRadius: T.radius.sm,
                }}
              >
                <Ic d={I.chevron} size={12} color={C.textDim} sw={2} style={{ transform: "rotate(180deg)" }} />
                All Estimates
              </button>
              <span style={{ color: C.textDim, fontSize: T.fontSize.sm, opacity: 0.4 }}>›</span>
              <span style={{
                fontSize: T.fontSize.md, fontWeight: T.fontWeight.bold, color: C.text,
                animation: "fadeIn 0.2s ease-out",
              }}>{project.name || "Untitled"}</span>
            </>
          )}
          {!activeId && (
            <div style={{ animation: "fadeIn 0.3s ease-out" }}>
              <BldgOmniLogo size={16} />
            </div>
          )}
        </div>

        {activeId && (
          <div style={{
            display: "flex", alignItems: "center", gap: T.space[2],
            animation: "staggerFadeRight 0.4s cubic-bezier(0.16,1,0.3,1) 0.1s both",
          }}>
            <Pill label="Items" value={items.length} />
            <Pill label="Total" value={fmt(getTotals().grand)} accent />
          </div>
        )}
      </div>

      {/* Estimate horizontal nav tabs */}
      {activeId && (
        <div style={{
          display: "flex", alignItems: "center", gap: 2,
          paddingBottom: T.space[2],
          animation: "staggerFadeRight 0.3s cubic-bezier(0.16,1,0.3,1) 0.05s both",
        }}>
          {estimateNav.map(item => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(`/estimate/${activeId}/${item.path}`)}
                className="ghost-btn"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 10px",
                  background: isActive ? C.accentBg : "transparent",
                  border: "none",
                  borderRadius: T.radius.sm,
                  cursor: "pointer",
                  fontSize: T.fontSize.xs,
                  fontWeight: isActive ? T.fontWeight.semibold : T.fontWeight.medium,
                  fontFamily: "'DM Sans',sans-serif",
                  color: isActive ? C.accent : C.textMuted,
                  transition: T.transition.fast,
                  position: "relative",
                  whiteSpace: "nowrap",
                }}
              >
                <Ic d={item.icon} size={13} color={isActive ? C.accent : C.textMuted} sw={isActive ? 2 : 1.7} />
                {item.label}
                {isActive && (
                  <div style={{
                    position: "absolute", bottom: -2, left: 8, right: 8,
                    height: 2, borderRadius: 1,
                    background: C.gradient || C.accent,
                    boxShadow: `0 0 6px ${C.accent}40`,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
