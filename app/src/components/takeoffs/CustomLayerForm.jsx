// CustomLayerForm — Inline form for adding user-defined assembly layers
import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { inp } from "@/utils/styles";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";

const UNITS = ["SF", "LF", "EA", "CY", "LBS", "GAL", "ROLL", "LS"];

export default function CustomLayerForm({ customLayers, onAdd, onRemove, onUpdate }) {
  const C = useTheme();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("SF");

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), unit, quantity: 0, manualQty: true });
    setName("");
    setUnit("SF");
    setAdding(false);
  };

  return (
    <div style={{ padding: "2px 8px 4px" }}>
      {/* Existing custom layers */}
      {(customLayers || []).map(cl => (
        <div
          key={cl.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 6px",
            background: `${C.accent}06`,
            borderRadius: 4,
            marginBottom: 2,
          }}
        >
          <span style={{ fontSize: 7, color: C.accent, fontWeight: 700 }}>CUSTOM</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {cl.name}
          </span>
          <input
            type="number"
            value={cl.quantity || ""}
            onChange={e => onUpdate(cl.id, { quantity: parseFloat(e.target.value) || 0 })}
            placeholder="Qty"
            style={inp(C, {
              width: 56,
              padding: "1px 3px",
              fontSize: 10,
              textAlign: "right",
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
            })}
          />
          <span style={{ fontSize: 9, color: C.textDim, minWidth: 18 }}>{cl.unit}</span>
          <button
            onClick={() => onRemove(cl.id)}
            style={{
              border: "none",
              background: "transparent",
              color: C.red,
              cursor: "pointer",
              padding: 0,
              display: "flex",
              opacity: 0.6,
            }}
          >
            <Ic d={I.xCircle} size={10} />
          </button>
        </div>
      ))}

      {/* Add button / inline form */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          style={{
            width: "100%",
            padding: "4px 0",
            fontSize: 9,
            fontWeight: 600,
            color: C.textDim,
            background: "transparent",
            border: `1px dashed ${C.border}`,
            borderRadius: 4,
            cursor: "pointer",
            marginTop: 2,
          }}
        >
          + Custom Layer
        </button>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 3,
            alignItems: "center",
            padding: "4px 6px",
            background: C.bg2,
            borderRadius: 4,
            marginTop: 2,
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="Layer name..."
            style={inp(C, {
              flex: 1,
              padding: "2px 4px",
              fontSize: 10,
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
            })}
          />
          <select
            value={unit}
            onChange={e => setUnit(e.target.value)}
            style={inp(C, {
              padding: "2px 2px",
              fontSize: 10,
              background: C.bg1,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              cursor: "pointer",
              width: 44,
            })}
          >
            {UNITS.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            style={{
              padding: "2px 8px",
              fontSize: 9,
              fontWeight: 700,
              border: "none",
              borderRadius: 3,
              background: name.trim() ? C.accent : C.bg1,
              color: name.trim() ? "#fff" : C.textDim,
              cursor: name.trim() ? "pointer" : "not-allowed",
            }}
          >
            Add
          </button>
          <button
            onClick={() => { setAdding(false); setName(""); }}
            style={{
              border: "none",
              background: "transparent",
              color: C.textDim,
              cursor: "pointer",
              fontSize: 9,
              padding: "2px 4px",
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
