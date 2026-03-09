import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { bt } from "@/utils/styles";

/* ────────────────────────────────────────────────────────
   EstimatorSkillsEditor — Multi-select chips for editing
   estimator specialties (disciplines they can estimate).
   ──────────────────────────────────────────────────────── */

const DISCIPLINES = [
  "structural",
  "MEP",
  "civil",
  "interiors",
  "finishes",
  "sitework",
  "general",
];

export default function EstimatorSkillsEditor({ estimatorId, estimatorName, specialties = [], onClose }) {
  const C = useTheme();
  const T = C.T;
  const [selected, setSelected] = useState(new Set(specialties));

  const toggle = d => {
    const next = new Set(selected);
    next.has(d) ? next.delete(d) : next.add(d);
    setSelected(next);
  };

  const save = () => {
    useMasterDataStore.getState().updateMasterItem(
      "estimators",
      estimatorId,
      { specialties: Array.from(selected) },
    );
    onClose?.();
  };

  return (
    <div style={{ padding: T.space[3] }}>
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        color: C.textDim,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: T.space[2],
      }}>
        {estimatorName} — Specialties
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: T.space[3] }}>
        {DISCIPLINES.map(d => {
          const active = selected.has(d);
          return (
            <button
              key={d}
              onClick={() => toggle(d)}
              style={{
                ...bt(C),
                padding: "4px 10px",
                fontSize: 10,
                fontWeight: active ? 600 : 400,
                color: active ? "#fff" : C.textMuted,
                background: active ? C.accent : (C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"),
                border: `1px solid ${active ? C.accent : C.border}`,
                borderRadius: 20,
                transition: "all 120ms",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={save}
          style={{
            ...bt(C),
            padding: "5px 14px",
            fontSize: T.fontSize.xs,
            fontWeight: 600,
            color: "#fff",
            background: C.accent,
            border: "none",
            borderRadius: T.radius.sm,
          }}
        >
          Save
        </button>
        <button
          onClick={onClose}
          style={{
            ...bt(C),
            padding: "5px 14px",
            fontSize: T.fontSize.xs,
            color: C.textMuted,
            background: "transparent",
            border: `1px solid ${C.border}`,
            borderRadius: T.radius.sm,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
