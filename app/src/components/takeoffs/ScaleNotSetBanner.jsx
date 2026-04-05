import { useTheme } from "@/hooks/useTheme";
import { inp, bt } from "@/utils/styles";

export default function ScaleNotSetBanner({ selectedDrawingId, hasScale, tkMeasureState, drawingScales, setDrawingScales, setTkTool, setTkActivePoints, setTkMeasureState }) {
  const C = useTheme();

  if (!selectedDrawingId || hasScale(selectedDrawingId) || (tkMeasureState !== "measuring" && tkMeasureState !== "paused")) {
    return null;
  }

  return (
    <div
      style={{
        padding: "6px 14px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#FEF3C7",
        borderLeft: "3px solid #F59E0B",
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, color: "#92400E" }}>
        ⚠ No scale set for this drawing. Measurements saved but quantities won't calculate until you set a
        scale.
      </span>
      <select
        value=""
        onChange={e => {
          if (e.target.value === "custom") {
            setTkTool("calibrate");
            setTkActivePoints([]);
            setTkMeasureState("idle");
            setDrawingScales({ ...drawingScales, [selectedDrawingId]: "custom" });
          } else if (e.target.value) {
            setDrawingScales({ ...drawingScales, [selectedDrawingId]: e.target.value });
          }
        }}
        style={inp(C, {
          width: 110,
          padding: "3px 6px",
          fontSize: 9,
          fontWeight: 600,
          background: "#fff",
          border: "1px solid #F59E0B",
        })}
      >
        <option value="">Set Scale ▼</option>
        <option value="quarter">1/4"=1'</option>
        <option value="eighth">1/8"=1'</option>
        <option value="half">1/2"=1'</option>
        <option value="3-8">3/8"=1'</option>
        <option value="eng20">1"=20'</option>
        <option value="eng50">1"=50'</option>
        <option value="custom">Calibrate...</option>
      </select>
      <button
        onClick={() => {
          setTkTool("calibrate");
          setTkActivePoints([]);
          setTkMeasureState("idle");
          setDrawingScales({ ...drawingScales, [selectedDrawingId]: "custom" });
        }}
        style={bt(C, {
          padding: "3px 10px",
          fontSize: 8,
          fontWeight: 700,
          borderRadius: 4,
          background: "#F59E0B",
          color: "#fff",
        })}
      >
        📐 Calibrate
      </button>
    </div>
  );
}
