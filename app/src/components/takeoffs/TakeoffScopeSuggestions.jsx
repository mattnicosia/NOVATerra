// TakeoffScopeSuggestions — AI-generated scope gap suggestions
// Extracted from TakeoffLeftPanel.jsx
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useUiStore } from "@/stores/uiStore";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

export default function TakeoffScopeSuggestions({ addTakeoff }) {
  const C = useTheme();
  const T = C.T;
  const showToast = useUiStore(s => s.showToast);
  const tkScopeSuggestions = useDrawingPipelineStore(s => s.tkScopeSuggestions);
  const setTkScopeSuggestions = useDrawingPipelineStore(s => s.setTkScopeSuggestions);

  if (!tkScopeSuggestions) return null;

  return (
    <div
      style={{
        borderTop: `2px solid ${C.accent}`,
        maxHeight: 260,
        overflowY: "auto",
        background: C.bg,
      }}
    >
      <div
        style={{
          padding: "6px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${C.border}`,
          position: "sticky",
          top: 0,
          background: C.bg,
          zIndex: 2,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Ic d={I.ai} size={12} color={C.accent} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.accent }}>Scope Suggestions</span>
          {tkScopeSuggestions.loading && (
            <span style={{ fontSize: 9, color: C.textDim, fontStyle: "italic" }}>Analyzing...</span>
          )}
        </div>
        <button
          onClick={() => setTkScopeSuggestions(null)}
          style={{ width: 16, height: 16, border: "none", background: "transparent", color: C.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Ic d={I.x} size={9} />
        </button>
      </div>
      {tkScopeSuggestions.loading && (
        <div style={{ padding: 20, textAlign: "center" }}>
          <div style={{ width: 20, height: 20, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 8px" }} />
          <div style={{ fontSize: 10, color: C.textDim }}>AI is reviewing your scope for gaps...</div>
        </div>
      )}
      {!tkScopeSuggestions.loading && tkScopeSuggestions.items.length === 0 && (
        <div style={{ padding: 16, textAlign: "center", fontSize: 10, color: C.textDim }}>
          No suggestions -- your scope looks comprehensive.
        </div>
      )}
      {tkScopeSuggestions.items.map((sg, i) => (
        <div
          key={i}
          style={{
            padding: "6px 10px",
            borderBottom: `1px solid ${C.bg2}`,
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{sg.name}</div>
            <div style={{ fontSize: 9, color: C.textMuted, lineHeight: 1.4, marginTop: 1 }}>
              {sg.desc}
            </div>
            {sg.code && (
              <span style={{ fontSize: 8, fontFamily: T.font.sans, color: C.purple }}>
                {sg.code}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 3, flexShrink: 0, paddingTop: 2 }}>
            <button
              onClick={() => {
                addTakeoff("", sg.name, sg.unit || "SF", sg.code || "");
                setTkScopeSuggestions({
                  ...tkScopeSuggestions,
                  items: tkScopeSuggestions.items.filter((_, j) => j !== i),
                });
                showToast(`Added: ${sg.name}`);
              }}
              title="Add to takeoffs"
              style={bt(C, { padding: "3px 8px", fontSize: 8, fontWeight: 600, background: C.accent, color: "#fff", borderRadius: 3 })}
            >
              + Add
            </button>
            <button
              onClick={() =>
                setTkScopeSuggestions({
                  ...tkScopeSuggestions,
                  items: tkScopeSuggestions.items.filter((_, j) => j !== i),
                })
              }
              title="Dismiss"
              style={bt(C, { padding: "3px 6px", fontSize: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 3 })}
            >
              x
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
