import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useProjectStore } from '@/stores/projectStore';
import { useItemsStore } from '@/stores/itemsStore';
import Ic from '@/components/shared/Ic';
import Pill from '@/components/shared/Pill';
import BldgOmniLogo from '@/components/shared/BldgOmniLogo';
import { I } from '@/constants/icons';
import { fmt } from '@/utils/format';

export default function Header() {
  const C = useTheme();
  const T = C.T;
  const navigate = useNavigate();
  const activeId = useEstimatesStore(s => s.activeEstimateId);
  const project = useProjectStore(s => s.project);
  const items = useItemsStore(s => s.items);
  const getTotals = useItemsStore(s => s.getTotals);

  return (
    <div style={{
      height: T.header.height, minHeight: T.header.height,
      padding: `0 ${T.space[6]}px`,
      background: C.glassBg || 'rgba(18,21,28,0.55)',
      backdropFilter: T.glass.blur,
      WebkitBackdropFilter: T.glass.blur,
      borderBottom: `1px solid ${C.glassBorder || C.border}`,
      boxShadow: T.shadow.sm,
      display: "flex", alignItems: "center", justifyContent: "space-between",
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
  );
}
