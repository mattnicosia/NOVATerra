import { useState } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import Modal from "./Modal";
import { bt, inp } from "@/utils/styles";

export default function NewEstimateModal({ onCreated, onClose, companyProfileId }) {
  const C = useTheme();
  const T = C.T;
  const [estNum, setEstNum] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    const trimmed = estNum.trim();
    if (!trimmed) {
      setError("Estimate number is required");
      return;
    }

    // Check uniqueness against existing estimates
    const existing = useEstimatesStore.getState().estimatesIndex;
    const duplicate = existing.find(e => e.estimateNumber === trimmed);
    if (duplicate) {
      setError(`Estimate #${trimmed} already exists ("${duplicate.name}")`);
      return;
    }

    setCreating(true);
    const id = await useEstimatesStore.getState().createEstimate(companyProfileId || "", trimmed);
    onCreated(id);
  };

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: T.space[5] }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: T.space[4] }}>New Estimate</div>
        <label
          style={{ fontSize: 10, fontWeight: 600, color: C.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          Estimate Number
        </label>
        <input
          autoFocus
          value={estNum}
          onChange={e => {
            setEstNum(e.target.value);
            setError("");
          }}
          onKeyDown={e => e.key === "Enter" && handleCreate()}
          placeholder="e.g. EST-2026-001"
          style={inp(C, { width: "100%", marginTop: 4, marginBottom: error ? 4 : T.space[4], fontSize: 13 })}
        />
        {error && <div style={{ fontSize: 11, color: C.red || "#f44", marginBottom: T.space[3] }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={bt(C, {
              padding: "8px 16px",
              fontSize: 12,
              background: "transparent",
              color: C.textMuted,
              border: `1px solid ${C.border}`,
            })}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={bt(C, {
              padding: "8px 16px",
              fontSize: 12,
              background: C.accent,
              color: "#fff",
              opacity: creating ? 0.6 : 1,
            })}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
