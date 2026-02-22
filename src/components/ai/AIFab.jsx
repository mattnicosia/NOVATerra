import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';
import Ic from '@/components/shared/Ic';
import { I } from '@/constants/icons';

export default function AIFab() {
  const C = useTheme();
  const open = useUiStore(s => s.aiChatOpen);
  const setOpen = useUiStore(s => s.setAiChatOpen);

  // Don't show FAB when panel is open
  if (open) return null;

  return (
    <button
      onClick={() => setOpen(true)}
      title="NOVA AI Assistant"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 999,
        width: 52, height: 52, borderRadius: 14,
        background: `linear-gradient(135deg, ${C.accent}, ${C.accentAlt || C.purple || C.accent})`,
        border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 4px 16px ${C.accent}40, 0 2px 4px rgba(0,0,0,0.1)`,
        transition: "all 0.2s ease",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "scale(1.08)";
        e.currentTarget.style.boxShadow = `0 6px 24px ${C.accent}50, 0 2px 8px rgba(0,0,0,0.15)`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = `0 4px 16px ${C.accent}40, 0 2px 4px rgba(0,0,0,0.1)`;
      }}
    >
      <Ic d={I.ai} size={22} color="#fff" />
    </button>
  );
}
