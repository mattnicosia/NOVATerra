import { useTheme } from "@/hooks/useTheme";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

export default function DrawingAnalysisPanel({ aiDrawingAnalysis, setAiDrawingAnalysis, acceptAllDrawingItems, acceptDrawingItem }) {
  const C = useTheme();
  const T = C.T;

  if (!aiDrawingAnalysis || aiDrawingAnalysis.loading || aiDrawingAnalysis.results.length === 0) return null;

  return (
    <div
      style={{
        borderBottom: `1px solid ${C.accent}30`,
        background: `${C.accent}06`,
        maxHeight: 200,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          padding: "5px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${C.accent}15`,
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: C.accent }}>
          <Ic d={I.ai} size={10} color={C.accent} /> {aiDrawingAnalysis.results.length} Elements Detected
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={acceptAllDrawingItems}
            style={bt(C, {
              background: C.green,
              color: "#fff",
              padding: "2px 8px",
              fontSize: 8,
              fontWeight: 600,
            })}
          >
            Add All
          </button>
          <button
            onClick={() => setAiDrawingAnalysis(null)}
            style={bt(C, {
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textDim,
              padding: "2px 6px",
              fontSize: 8,
            })}
          >
            ✕
          </button>
        </div>
      </div>
      {aiDrawingAnalysis.results.map((item, i) => {
        const isCount = item.type === "count";
        const hasLocs = (item.locations || []).length > 0;
        return (
          <div
            key={i}
            style={{
              padding: "3px 10px",
              display: "flex",
              gap: 6,
              alignItems: "center",
              borderBottom: `1px solid ${C.bg2}`,
              fontSize: 10,
            }}
          >
            <span
              style={{
                fontSize: 7,
                fontWeight: 700,
                padding: "1px 4px",
                borderRadius: 3,
                flexShrink: 0,
                background:
                  item.type === "count"
                    ? `${C.green}15`
                    : item.type === "linear"
                      ? `${C.blue}15`
                      : `${C.purple}15`,
                color: item.type === "count" ? C.green : item.type === "linear" ? C.blue : C.purple,
              }}
            >
              {item.type?.toUpperCase()}
            </span>
            <span
              style={{
                flex: 1,
                color: C.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={item.notes || item.name}
            >
              {item.name}
            </span>
            {isCount ? (
              <span
                style={{
                  fontFamily: T.font.sans,
                  fontSize: 9,
                  color: C.accent,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {item.quantity || (item.locations || []).length} {item.unit}
              </span>
            ) : (
              <span
                style={{ fontSize: 8, color: C.orange, fontWeight: 500, flexShrink: 0, fontStyle: "italic" }}
              >
                needs measuring
              </span>
            )}
            <span
              style={{
                fontSize: 7,
                color:
                  item.confidence === "high" ? C.green : item.confidence === "low" ? C.orange : C.textDim,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {item.confidence}
            </span>
            {hasLocs && (
              <span style={{ fontSize: 7, color: C.accent, flexShrink: 0 }} title="Located on drawing">
                📍
              </span>
            )}
            <button
              onClick={() => acceptDrawingItem(item)}
              title={isCount ? "Add to takeoffs" : "Add to takeoffs — measure for accurate qty"}
              style={bt(C, {
                background: `${C.green}15`,
                border: `1px solid ${C.green}30`,
                color: C.green,
                padding: "1px 6px",
                fontSize: 8,
                fontWeight: 600,
                flexShrink: 0,
              })}
            >
              +
            </button>
          </div>
        );
      })}
    </div>
  );
}
