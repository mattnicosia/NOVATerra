import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';

const TABS = [
  { key: "overview", label: "Overview", icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" },
  { key: "proposals", label: "Proposals", icon: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8" },
  { key: "database", label: "Database", icon: "M12 2C6.48 2 2 4.02 2 6.5S6.48 11 12 11s10-2.02 10-4.5S17.52 2 12 2z M2 6.5v5c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5v-5 M2 11.5v5c0 2.48 4.48 4.5 10 4.5s10-2.02 10-4.5v-5" },
  { key: "sources", label: "Sources", icon: "M12 2l2.09 6.26L20 10l-4.69 3.98L16.91 20 12 16.27 7.09 20l1.6-6.02L4 10l5.91-1.74L12 2z" },
  { key: "explorer", label: "Explorer", icon: "M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16" },
];

export default function CoreNav() {
  const C = useTheme();
  const T = C.T;
  const activeTab = useUiStore(s => s.coreActiveTab);
  const setActiveTab = useUiStore(s => s.setCoreActiveTab);

  return (
    <div style={{
      display: "flex", gap: 4, padding: "4px 6px",
      background: C.bg2, borderRadius: T.radius.lg,
      border: `1px solid ${C.border}`,
    }}>
      {TABS.map(tab => {
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: T.radius.md,
              border: "none", cursor: "pointer",
              background: active ? `${C.accent}18` : "transparent",
              color: active ? C.accent : C.textMuted,
              fontSize: 12, fontWeight: active ? 600 : 500,
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
