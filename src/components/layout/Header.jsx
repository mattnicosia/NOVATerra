import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useEstimatesStore } from '@/stores/estimatesStore';
import { useProjectStore } from '@/stores/projectStore';
import { useItemsStore } from '@/stores/itemsStore';
import Ic from '@/components/shared/Ic';
import Pill from '@/components/shared/Pill';
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
      <div style={{ display: "flex", alignItems: "center", gap: T.space[3] }}>
        {activeId && (
          <>
            <button
              onClick={() => {
                useEstimatesStore.getState().setActiveEstimateId(null);
                navigate("/");
              }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: T.fontSize.sm, color: C.textMuted, display: "flex", alignItems: "center", gap: T.space[1],
                transition: T.transition.fast,
              }}
            >
              <Ic d={I.chevron} size={12} color={C.textDim} sw={2} style={{ transform: "rotate(180deg)" }} />
              All Estimates
            </button>
            <span style={{ color: C.textDim, fontSize: T.fontSize.sm }}>›</span>
            <span style={{ fontSize: T.fontSize.md, fontWeight: T.fontWeight.bold, color: C.text }}>{project.name || "Untitled"}</span>
          </>
        )}
        {!activeId && (
          <span style={{
            fontSize: T.fontSize.md, fontWeight: T.fontWeight.heavy, color: C.text,
          }}>
            <span style={{
              letterSpacing: "0.08em",
              display: "inline-block",
              ...(C.isDark && C.gradient
                ? {
                    background: C.gradient,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }
                : { color: C.accent }),
            }}>BLDG Omni</span>
          </span>
        )}
      </div>

      {activeId && (
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <Pill label="Items" value={items.length} />
          <Pill label="Total" value={fmt(getTotals().grand)} accent />
        </div>
      )}
    </div>
  );
}
