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

  const chipStyle = (active) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "5px 12px", borderRadius: 20,
    background: active ? C.accent : C.bg2,
    color: active ? "#fff" : C.textMuted,
    border: `1px solid ${active ? C.accent : C.border}`,
    fontSize: 11, fontWeight: 600,
    cursor: "pointer", transition: "all 0.15s",
    boxShadow: active ? `0 0 8px ${C.accent}30` : "none",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {/* All */}
      <button onClick={() => set("__all__")} style={chipStyle(activeCompanyId === "__all__")}>
        <Ic d={I.layers} size={12} color={activeCompanyId === "__all__" ? "#fff" : C.textDim} />
        All
      </button>

      {/* Primary profile */}
      <button onClick={() => set("")} style={chipStyle(activeCompanyId === "")}>
        {companyInfo?.logo
          ? <img src={companyInfo.logo} style={{ height: 16, maxWidth: 32, objectFit: "contain", borderRadius: 2 }} />
          : <Ic d={I.folder} size={12} color={activeCompanyId === "" ? "#fff" : C.accent} />
        }
        {companyInfo?.name || "Primary"}
      </button>

      {/* Additional profiles */}
      {companyProfiles.map(p => (
        <button key={p.id} onClick={() => set(p.id)} style={chipStyle(activeCompanyId === p.id)}>
          {p.logo
            ? <img src={p.logo} style={{ height: 16, maxWidth: 32, objectFit: "contain", borderRadius: 2 }} />
            : <Ic d={I.folder} size={12} color={activeCompanyId === p.id ? "#fff" : C.purple} />
          }
          {p.name || "Unnamed"}
        </button>
      ))}
    </div>
  );
}
