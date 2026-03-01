import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';
import { useMasterDataStore } from '@/stores/masterDataStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

export default function CompanySwitcher() {
  const C = useTheme();
  const T = C.T;
  const activeCompanyId = useUiStore(s => s.appSettings.activeCompanyId);
  const updateSetting = useUiStore(s => s.updateSetting);
  const companyInfo = useMasterDataStore(s => s.masterData.companyInfo);
  const companyProfiles = useMasterDataStore(s => s.masterData.companyProfiles || []);

  const set = (id) => updateSetting("activeCompanyId", id);

  const cardStyle = (active) => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 56, height: 40, borderRadius: 8,
    background: active ? `${C.accent}15` : C.bg2,
    border: `2px solid ${active ? C.accent : C.border}`,
    cursor: "pointer", transition: "all 0.15s",
    boxShadow: active ? `0 0 8px ${C.accent}20` : "none",
    overflow: "hidden", flexShrink: 0, padding: 4,
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {/* All */}
      <button onClick={() => set("__all__")} title="All Companies"
        style={cardStyle(activeCompanyId === "__all__")}>
        <Ic d={I.layers} size={16} color={activeCompanyId === "__all__" ? C.accent : C.textDim} />
      </button>

      {/* Primary profile */}
      <button onClick={() => set("")} title={companyInfo?.name || "Primary"}
        style={cardStyle(activeCompanyId === "")}>
        {companyInfo?.logo
          ? <img src={companyInfo.logo} style={{ maxHeight: 28, maxWidth: 44, objectFit: "contain" }} />
          : <Ic d={I.folder} size={18} color={activeCompanyId === "" ? C.accent : C.textMuted} />
        }
      </button>

      {/* Additional profiles */}
      {companyProfiles.map(p => (
        <button key={p.id} onClick={() => set(p.id)} title={p.name || "Unnamed"}
          style={cardStyle(activeCompanyId === p.id)}>
          {p.logo
            ? <img src={p.logo} style={{ maxHeight: 28, maxWidth: 44, objectFit: "contain" }} />
            : <Ic d={I.folder} size={18} color={activeCompanyId === p.id ? C.accent : C.textMuted} />
          }
        </button>
      ))}
    </div>
  );
}
