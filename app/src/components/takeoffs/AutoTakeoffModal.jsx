import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useDrawingPipelineStore } from "@/stores/drawingPipelineStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useUiStore } from "@/stores/uiStore";
import { useCorrectionStore } from "@/nova/learning/correctionStore";
import { generateTakeoffSuggestions } from "@/nova/predictive/generateSuggestions";
import Modal from "@/components/shared/Modal";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt } from "@/utils/styles";

const CONF_COLORS = { high: "#22c55e", medium: "#f59e0b", low: "#ef4444" };

export default function AutoTakeoffModal({ onClose }) {
  const C = useTheme();
  const T = C.T;
  const scanResults = useDrawingPipelineStore(s => s.scanResults);
  const showToast = useUiStore(s => s.showToast);

  const suggestions = useMemo(() => generateTakeoffSuggestions(scanResults), [scanResults]);
  const [selected, setSelected] = useState(
    () => new Set(suggestions.filter(s => s.confidence !== "low").map(s => s.id)),
  );

  // Group by division
  const grouped = useMemo(() => {
    const map = {};
    suggestions.forEach(s => {
      const div = s.division || "Unassigned";
      if (!map[div]) map[div] = [];
      map[div].push(s);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [suggestions]);

  const toggle = id =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (selected.size === suggestions.length) setSelected(new Set());
    else setSelected(new Set(suggestions.map(s => s.id)));
  };

  const handleGenerate = () => {
    const toAdd = suggestions.filter(s => selected.has(s.id));
    if (!toAdd.length) return;

    const { addTakeoff } = useDrawingPipelineStore.getState();
    const { addElement } = useItemsStore.getState();
    const { logCorrection } = useCorrectionStore.getState();

    toAdd.forEach(s => {
      // Create takeoff measurement item
      addTakeoff(
        s.division?.split(" — ")[0] || "",
        s.description,
        s.unit,
        s.code,
        "base",
      );

      // If we have estimated cost, also create an estimate line item
      if (s.estimatedCost) {
        const cost = s.estimatedCost;
        addElement(s.division?.split(" — ")[0] || "", {
          code: s.code,
          name: s.description,
          unit: s.unit,
          quantity: s.quantity || 1,
          material: cost.material || 0,
          labor: cost.labor || 0,
          equipment: cost.equipment || 0,
          subcontractor: cost.sub || 0,
          source: {
            category: "nova-scan",
            label: `Auto from ${s.source?.type || "scan"}${s.source?.scheduleType ? ` (${s.source.scheduleType})` : ""}`,
          },
          novaProposed: true,
        }, "base");
      }

      // Log acceptance for learning
      logCorrection("scope:accept", {
        context: `Auto-takeoff: accepted "${s.description}" from ${s.source?.type}`,
        original: null,
        corrected: s.description,
        scheduleType: s.source?.scheduleType || null,
        field: s.code,
      });
    });

    // Log rejections for items not selected
    const rejected = suggestions.filter(s => !selected.has(s.id));
    rejected.forEach(s => {
      logCorrection("scope:reject", {
        context: `Auto-takeoff: rejected "${s.description}" from ${s.source?.type}`,
        original: s.description,
        corrected: null,
        scheduleType: s.source?.scheduleType || null,
        field: s.code,
      });
    });

    showToast(`${toAdd.length} takeoff items generated from plans`);
    onClose();
  };

  const selectedTotal = suggestions
    .filter(s => selected.has(s.id))
    .reduce((sum, s) => {
      if (!s.estimatedCost) return sum;
      const c = s.estimatedCost;
      return sum + ((c.material || 0) + (c.labor || 0) + (c.equipment || 0) + (c.sub || 0)) * (s.quantity || 1);
    }, 0);

  if (!suggestions.length) {
    return (
      <Modal onClose={onClose} wide>
        <div style={{ padding: 30, textAlign: "center" }}>
          <Ic d={I.ai} size={32} color={C.textDim} />
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginTop: 12 }}>No Scan Data Available</div>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
            Upload drawings and run a scan first. NOVA will detect schedules and generate takeoff suggestions.
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} extraWide>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <Ic d={I.ai} size={16} color={C.accent} /> Auto-Generate from Plans
          </h3>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
            {suggestions.length} items detected from scan &bull; Review and select items to add
          </div>
        </div>
      </div>

      {/* Select all bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "6px 10px",
          background: C.bg2,
          borderRadius: 6,
          marginBottom: 10,
          fontSize: 12,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: C.text }}>
          <input
            type="checkbox"
            checked={selected.size === suggestions.length}
            onChange={toggleAll}
            style={{ accentColor: C.accent }}
          />
          <span>
            Select All ({selected.size}/{suggestions.length})
          </span>
        </label>
        <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.textDim }}>
          <span style={{ color: CONF_COLORS.high }}>
            ● High: {suggestions.filter(s => s.confidence === "high").length}
          </span>
          <span style={{ color: CONF_COLORS.medium }}>
            ● Med: {suggestions.filter(s => s.confidence === "medium").length}
          </span>
          <span style={{ color: CONF_COLORS.low }}>
            ● Low: {suggestions.filter(s => s.confidence === "low").length}
          </span>
        </div>
      </div>

      {/* Grouped suggestions */}
      <div style={{ maxHeight: "50vh", overflowY: "auto", marginBottom: 12 }}>
        {grouped.map(([div, items]) => (
          <div key={div} style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: C.accent,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                padding: "4px 0",
                borderBottom: `1px solid ${C.border}`,
                marginBottom: 4,
              }}
            >
              {div} ({items.length})
            </div>
            {items.map(s => {
              const isSelected = selected.has(s.id);
              const totalCost = s.estimatedCost
                ? ((s.estimatedCost.material || 0) +
                    (s.estimatedCost.labor || 0) +
                    (s.estimatedCost.equipment || 0) +
                    (s.estimatedCost.sub || 0)) *
                  (s.quantity || 1)
                : 0;
              return (
                <div
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    background: isSelected ? `${C.accent}08` : "transparent",
                    borderRadius: 4,
                    cursor: "pointer",
                    marginBottom: 2,
                    border: `1px solid ${isSelected ? `${C.accent}30` : "transparent"}`,
                    transition: "all 0.15s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(s.id)}
                    onClick={e => e.stopPropagation()}
                    style={{ accentColor: C.accent, flexShrink: 0 }}
                  />
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      flexShrink: 0,
                      background: CONF_COLORS[s.confidence] || CONF_COLORS.low,
                    }}
                    title={`${s.confidence} confidence`}
                  />
                  {s.code && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: C.purple || C.accent,
                        fontFamily: "'IBM Plex Mono', monospace",
                        flexShrink: 0,
                        width: 48,
                      }}
                    >
                      {s.code}
                    </span>
                  )}
                  <span
                    style={{
                      flex: 1,
                      fontSize: 11,
                      color: C.text,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.description}
                  </span>
                  <span style={{ fontSize: 10, color: C.textDim, flexShrink: 0 }}>
                    {s.quantity > 1 ? `${s.quantity} ` : ""}
                    {s.unit}
                  </span>
                  {totalCost > 0 && (
                    <span
                      style={{
                        fontSize: 10,
                        color: C.green || "#22c55e",
                        fontWeight: 600,
                        fontFeatureSettings: "'tnum'",
                        flexShrink: 0,
                        width: 70,
                        textAlign: "right",
                      }}
                    >
                      ${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 9,
                      color: C.textDim,
                      flexShrink: 0,
                      width: 60,
                      textAlign: "right",
                    }}
                  >
                    {s.source?.type === "schedule"
                      ? "SCHEDULE"
                      : s.source?.type === "line-item"
                        ? "PARSED"
                        : s.source?.type === "notes"
                          ? "NOTE"
                          : "ROM"}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 0",
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <div style={{ fontSize: 12, color: C.textDim }}>
          {selected.size} items selected
          {selectedTotal > 0 && (
            <span style={{ marginLeft: 8 }}>
              &bull; Est. total:{" "}
              <strong style={{ color: C.accent }}>
                ${selectedTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </strong>
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={bt(C, {
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.textDim,
              padding: "7px 14px",
              fontSize: 12,
            })}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={selected.size === 0}
            style={bt(C, {
              background: selected.size > 0 ? C.gradient || C.accent : C.bg2,
              color: selected.size > 0 ? "#fff" : C.textDim,
              padding: "7px 18px",
              fontSize: 12,
              fontWeight: 700,
              opacity: selected.size > 0 ? 1 : 0.5,
              cursor: selected.size > 0 ? "pointer" : "not-allowed",
            })}
          >
            <Ic d={I.ai} size={12} color={selected.size > 0 ? "#fff" : C.textDim} /> Generate {selected.size} Items
          </button>
        </div>
      </div>
    </Modal>
  );
}
