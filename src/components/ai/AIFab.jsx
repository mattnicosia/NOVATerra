import { useTheme } from '@/hooks/useTheme';
import { useUiStore } from '@/stores/uiStore';
import NovaPortal from '@/components/nova/NovaPortal';

export default function AIFab() {
  const C = useTheme();
  const open = useUiStore(s => s.aiChatOpen);
  const setOpen = useUiStore(s => s.setAiChatOpen);

  // Don't show FAB when panel is open
  if (open) return null;

  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 999 }}>
      <button
        onClick={() => setOpen(true)}
        title="NOVA — AI Assistant"
        style={{
          position: "relative",
          width: 56, height: 56, borderRadius: "50%",
          background: "transparent",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0,
          transition: "transform 0.2s ease",
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
      >
        {/* Glow ring */}
        <div style={{
          position: "absolute", top: -6, left: -6, right: -6, bottom: -6,
          borderRadius: "50%",
          boxShadow: "0 0 16px rgba(160,100,255,0.4), 0 0 32px rgba(100,50,220,0.15)",
          animation: "novaFabGlow 4s ease-in-out infinite",
          pointerEvents: "none",
        }} />
        <NovaPortal size="floating" state="idle" />
      </button>
      <style>{`@keyframes novaFabGlow { 0%, 100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }`}</style>
    </div>
  );
}
