// LayerToggleBar — Horizontal layer toggle pills for assembly layer builder
import { useTheme } from "@/hooks/useTheme";
import { evalCondition } from "@/utils/moduleCalc";

export default function LayerToggleBar({ layers, layerEnabled, specCtx, onToggle }) {
  const C = useTheme();
  if (!layers || layers.length === 0) return null;

  // Filter layers whose conditions are met (material-dependent layers)
  const visibleLayers = layers.filter(l => !l.condition || evalCondition(l.condition, specCtx));
  if (visibleLayers.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 3,
        padding: "5px 8px",
        borderBottom: `1px solid ${C.border}20`,
      }}
    >
      <span
        style={{
          fontSize: 7,
          fontWeight: 700,
          color: C.textDimmer,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          alignSelf: "center",
          marginRight: 2,
        }}
      >
        Layers
      </span>
      {visibleLayers.map(layer => {
        const enabled = layerEnabled?.[layer.id] !== false;
        const isRequired = layer.required;
        return (
          <button
            key={layer.id}
            onClick={isRequired ? undefined : () => onToggle(layer.id)}
            style={{
              padding: "2px 7px",
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: 0.3,
              border: `1px solid ${enabled ? C.accent + "50" : C.border}`,
              borderRadius: 10,
              background: enabled ? `${C.accent}12` : "transparent",
              color: enabled ? C.accent : C.textDimmer,
              cursor: isRequired ? "default" : "pointer",
              opacity: isRequired ? 0.7 : 1,
              textDecoration: !enabled ? "line-through" : "none",
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
            title={isRequired ? `${layer.name} (required)` : `Toggle ${layer.name}`}
          >
            {layer.name}
            {isRequired && " *"}
          </button>
        );
      })}
    </div>
  );
}
