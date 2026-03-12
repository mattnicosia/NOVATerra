// NovaMarketBrief — AI-generated market summary with NOVA avatar
import { useTheme } from "@/hooks/useTheme";
import { useIntelligenceStore } from "@/stores/intelligenceStore";
import NovaSceneLazy from "@/components/nova/NovaSceneLazy";

export default function NovaMarketBrief({ contextData }) {
  const C = useTheme();
  const T = C.T;
  const { novaBrief, generateNovaBrief } = useIntelligenceStore();

  const handleRefresh = () => {
    if (contextData) {
      generateNovaBrief(contextData);
    }
  };

  const timeAgo = novaBrief.generatedAt
    ? (() => {
        const mins = Math.round((Date.now() - novaBrief.generatedAt) / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        return `${Math.round(mins / 60)}h ago`;
      })()
    : null;

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: T.radius.md,
        background: C.glassBg || "rgba(18,21,28,0.55)",
        backdropFilter: T.glass.blur,
        WebkitBackdropFilter: T.glass.blur,
        border: `1px solid ${C.accent}20`,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      {/* NOVA avatar */}
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <NovaSceneLazy width={42} height={42} size={0.8} intensity={0.6} lightweight />
      </div>

      {/* Brief content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: C.accent,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 6,
          }}
        >
          ARTIFACT Market Brief
        </div>

        {novaBrief.text ? (
          <div
            style={{
              fontSize: 12,
              color: C.text,
              lineHeight: 1.6,
              fontStyle: "italic",
            }}
          >
            "{novaBrief.text}"
          </div>
        ) : novaBrief.loading ? (
          <div style={{ fontSize: 11, color: C.textDim }}>Analyzing market conditions...</div>
        ) : (
          <div style={{ fontSize: 11, color: C.textDim }}>Click refresh to generate a market intelligence brief.</div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <button
            onClick={handleRefresh}
            disabled={novaBrief.loading}
            style={{
              background: "none",
              border: `1px solid ${C.accent}30`,
              borderRadius: 4,
              color: C.accent,
              fontSize: 9,
              fontWeight: 600,
              cursor: "pointer",
              padding: "3px 8px",
              opacity: novaBrief.loading ? 0.5 : 1,
            }}
          >
            {novaBrief.loading ? "Thinking..." : "Refresh Brief"}
          </button>
          {timeAgo && <span style={{ fontSize: 9, color: C.textDim }}>Updated {timeAgo}</span>}
        </div>
      </div>
    </div>
  );
}
