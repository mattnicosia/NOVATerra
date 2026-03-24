// DimensionPanel.jsx — Left panel with editable dimension inputs

import { useState } from "react";

const PANEL_STYLE = {
  position: "absolute",
  top: 80,
  left: 24,
  width: 220,
  background: "rgba(8,8,10,0.85)",
  border: "1px solid #1a1a1a",
  padding: "16px",
  fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
  color: "#e8e0d4",
  zIndex: 10,
  backdropFilter: "blur(8px)",
};

const INPUT_STYLE = {
  width: "100%",
  height: 32,
  background: "#0d0d0f",
  border: "1px solid #1a1a1a",
  color: "#e8e0d4",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 13,
  padding: "0 8px",
  outline: "none",
  borderRadius: 0,
};

const LABEL_STYLE = {
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#777",
  marginBottom: 4,
  display: "block",
};

const SELECT_STYLE = {
  ...INPUT_STYLE,
  appearance: "none",
  cursor: "pointer",
};

export default function DimensionPanel({ config, onChange, onSave }) {
  const [local, setLocal] = useState(config);

  const update = (key, value) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    onChange?.(next);
  };

  return (
    <div style={PANEL_STYLE}>
      <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#e85c30", marginBottom: 12 }}>
        DIMENSIONS
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={LABEL_STYLE}>Width (ft)</label>
        <input
          type="number"
          style={INPUT_STYLE}
          defaultValue={local.widthFt}
          onBlur={e => update("widthFt", Math.max(10, parseInt(e.target.value) || 60))}
          onKeyDown={e => e.key === "Enter" && e.target.blur()}
          onFocus={e => e.target.select()}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={LABEL_STYLE}>Depth (ft)</label>
        <input
          type="number"
          style={INPUT_STYLE}
          defaultValue={local.depthFt}
          onBlur={e => update("depthFt", Math.max(10, parseInt(e.target.value) || 40))}
          onKeyDown={e => e.key === "Enter" && e.target.blur()}
          onFocus={e => e.target.select()}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={LABEL_STYLE}>Floors</label>
        <input
          type="number"
          style={INPUT_STYLE}
          defaultValue={local.numFloors}
          onBlur={e => update("numFloors", Math.max(1, Math.min(50, parseInt(e.target.value) || 4)))}
          onKeyDown={e => e.key === "Enter" && e.target.blur()}
          onFocus={e => e.target.select()}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={LABEL_STYLE}>Floor Height (ft)</label>
        <input
          type="number"
          style={INPUT_STYLE}
          defaultValue={local.floorHeightFt}
          onBlur={e => update("floorHeightFt", Math.max(8, Math.min(20, parseFloat(e.target.value) || 12)))}
          onKeyDown={e => e.key === "Enter" && e.target.blur()}
          onFocus={e => e.target.select()}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={LABEL_STYLE}>Building Type</label>
        <select
          style={SELECT_STYLE}
          value={local.buildingType}
          onChange={e => update("buildingType", e.target.value)}
        >
          <option value="commercial">Commercial</option>
          <option value="residential">Residential</option>
          <option value="mixed-use">Mixed-Use</option>
        </select>
      </div>

      {onSave && (
        <button
          onClick={() => onSave(local)}
          style={{
            width: "100%",
            height: 36,
            background: "#e85c30",
            border: "none",
            color: "#fff",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            borderRadius: 0,
          }}
        >
          Save
        </button>
      )}
    </div>
  );
}
