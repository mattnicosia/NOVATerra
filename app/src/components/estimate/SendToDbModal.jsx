import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDatabaseStore } from "@/stores/databaseStore";
import { useUiStore } from "@/stores/uiStore";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { inp, bt } from "@/utils/styles";
import { nn, fmt2 } from "@/utils/format";

export default function SendToDbModal({ item, onClose }) {
  const C = useTheme();
  const elements = useDatabaseStore(s => s.elements);
  const addElement = useDatabaseStore(s => s.addElement);
  const updateElement = useDatabaseStore(s => s.updateElement);
  const showToast = useUiStore(s => s.showToast);

  const [code, setCode] = useState(item?.code || "");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  if (!item) return null;

  const existing = elements.find(e => e.code === code && code);

  const handleSend = () => {
    if (existing && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    const data = {
      code,
      name: item.description,
      unit: item.unit || "EA",
      material: nn(item.material),
      labor: nn(item.labor),
      equipment: nn(item.equipment),
      trade: item.trade || "",
    };
    if (existing) {
      Object.entries(data).forEach(([k, v]) => updateElement(existing.id, k, v));
      showToast(`Updated "${data.name}" in your cost library`);
    } else {
      addElement(data);
      showToast(`Saved "${data.name}" to your cost library`);
    }
    onClose();
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
          <Ic d={I.send} size={14} color={C.green} /> Send to Cost Database
        </h3>
        <button
          onClick={onClose}
          style={{ border: "none", background: "transparent", color: C.textDim, cursor: "pointer" }}
        >
          <Ic d={I.x} size={16} />
        </button>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>
          Description
        </div>
        <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{item.description || "Unnamed"}</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>
            Code
          </div>
          <input
            value={code}
            onChange={e => {
              setCode(e.target.value);
              setConfirmOverwrite(false);
            }}
            placeholder="e.g. 09.600.010"
            style={inp(C, { width: "100%", padding: "6px 10px", fontSize: 12 })}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.textDim, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>
            Unit
          </div>
          <div style={{ fontSize: 12, color: C.text, padding: "6px 0" }}>{item.unit || "EA"}</div>
        </div>
      </div>

      <div
        style={{ display: "flex", gap: 12, marginBottom: 12, padding: "8px 10px", background: C.bg2, borderRadius: 4 }}
      >
        {[
          { label: "Material", value: item.material, color: C.green },
          { label: "Labor", value: item.labor, color: C.blue },
          { label: "Equipment", value: item.equipment, color: C.orange },
        ].map(f => (
          <div key={f.label} style={{ textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 10, color: f.color, fontWeight: 700, textTransform: "uppercase" }}>{f.label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: f.color, fontFeatureSettings: "'tnum'", marginTop: 2 }}>
              {fmt2(nn(f.value))}
            </div>
          </div>
        ))}
      </div>

      {existing && !confirmOverwrite && (
        <div
          style={{
            padding: "6px 10px",
            background: `${C.orange}10`,
            border: `1px solid ${C.orange}30`,
            borderRadius: 4,
            fontSize: 12,
            color: C.orange,
            marginBottom: 8,
          }}
        >
          Code "{code}" already exists in database. Click again to overwrite.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={onClose}
          style={bt(C, {
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textMuted,
            padding: "6px 14px",
            fontSize: 12,
          })}
        >
          Cancel
        </button>
        <button
          onClick={handleSend}
          style={bt(C, {
            background: confirmOverwrite ? C.orange : C.green,
            color: "#fff",
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 700,
          })}
        >
          {confirmOverwrite ? "Confirm Overwrite" : existing ? "Overwrite" : "Send to Database"}
        </button>
      </div>
    </Modal>
  );
}
