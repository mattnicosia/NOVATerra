import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useUiStore } from "@/stores/uiStore";
import { autoSchedule } from "@/utils/autoScheduler";
import { bt, cardSolid } from "@/utils/styles";
import Avatar from "@/components/shared/Avatar";

/* ────────────────────────────────────────────────────────
   AutoScheduleModal — Shows proposed schedule optimization
   with diff view (current → proposed) and apply controls.
   ──────────────────────────────────────────────────────── */

export default function AutoScheduleModal({ workload, onClose }) {
  const C = useTheme();
  const T = C.T;
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const estimators = useMasterDataStore(s => s.masterData?.estimators) || [];
  const effectiveHoursPerDay = workload.effectiveHoursPerDay || 5.95;

  const [selected, setSelected] = useState(new Set());
  const [applied, setApplied] = useState(false);

  // Build specialties map
  const specialtiesMap = useMemo(() => {
    const m = new Map();
    for (const e of estimators) {
      if (e.name && e.specialties) m.set(e.name, e.specialties);
    }
    return m;
  }, [estimators]);

  // Run auto-scheduler
  const result = useMemo(() => {
    return autoSchedule(estimatesIndex, estimators, {
      effectiveHoursPerDay,
      specialtiesMap,
    });
  }, [estimatesIndex, estimators, effectiveHoursPerDay, specialtiesMap]);

  const { changes, stats } = result;

  // Toggle selection
  const toggleAll = () => {
    if (selected.size === changes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(changes.map(c => c.estId)));
    }
  };

  const toggle = id => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const applySelected = () => {
    const toApply = changes.filter(c => selected.has(c.estId));
    for (const c of toApply) {
      useEstimatesStore.getState().updateIndexEntry(c.estId, { estimator: c.to });
    }
    useUiStore.getState().showToast(`Applied ${toApply.length} assignment${toApply.length !== 1 ? "s" : ""}`);
    setApplied(true);
    setTimeout(onClose, 800);
  };

  const applyAll = () => {
    for (const c of changes) {
      useEstimatesStore.getState().updateIndexEntry(c.estId, { estimator: c.to });
    }
    useUiStore.getState().showToast(`Applied all ${changes.length} assignments`);
    setApplied(true);
    setTimeout(onClose, 800);
  };

  const estimatorColor = name => {
    const row = workload.estimatorRows.find(r => r.name === name);
    return row?.color || "#A78BFA";
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.bg1,
          borderRadius: T.radius.lg,
          border: `1px solid ${C.border}`,
          boxShadow: T.shadow?.lg || "0 8px 30px rgba(0,0,0,0.25)",
          width: "90%",
          maxWidth: 640,
          maxHeight: "80vh",
          overflow: "auto",
          padding: T.space[5],
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.space[4] }}>
          <div>
            <div style={{ fontSize: T.fontSize.lg, fontWeight: 700, color: C.text }}>Schedule Optimizer</div>
            <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>AI-proposed assignment changes to reduce conflicts and balance load</div>
          </div>
          <button onClick={onClose} style={{ ...bt(C), padding: "6px 10px", fontSize: T.fontSize.xs, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: T.radius.sm }}>
            Close
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: T.space[3], marginBottom: T.space[4] }}>
          {[
            { label: "Current Conflicts", value: stats.currentConflicts, color: "#FF3B30" },
            { label: "Changes Proposed", value: stats.changesProposed, color: "#A78BFA" },
            { label: "Conflicts Resolved", value: stats.conflictsResolved, color: "#30D158" },
          ].map(s => (
            <div key={s.label} style={{ ...cardSolid(C), padding: `${T.space[2]}px ${T.space[3]}px`, flex: 1 }}>
              <div style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Changes List */}
        {changes.length === 0 ? (
          <div style={{ textAlign: "center", padding: T.space[5], color: C.textDim }}>
            <div style={{ fontSize: 24, marginBottom: T.space[2] }}>✓</div>
            <div style={{ fontSize: T.fontSize.sm, fontWeight: 600 }}>Schedule is already optimal</div>
            <div style={{ fontSize: T.fontSize.xs }}>No changes needed</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.space[2] }}>
              <button
                onClick={toggleAll}
                style={{ ...bt(C), padding: "4px 10px", fontSize: 9, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: T.radius.sm }}
              >
                {selected.size === changes.length ? "Deselect All" : "Select All"}
              </button>
              <span style={{ fontSize: 9, color: C.textDim }}>{selected.size} of {changes.length} selected</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: T.space[4] }}>
              {changes.map(c => (
                <div
                  key={c.estId}
                  onClick={() => toggle(c.estId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: T.space[3],
                    padding: `${T.space[2]}px ${T.space[3]}px`,
                    borderRadius: T.radius.md,
                    background: selected.has(c.estId) ? `${C.accent}08` : (C.isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)"),
                    border: `1px solid ${selected.has(c.estId) ? C.accent + "30" : C.border + "40"}`,
                    cursor: "pointer",
                  }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `2px solid ${selected.has(c.estId) ? C.accent : C.border}`,
                    background: selected.has(c.estId) ? C.accent : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "#fff",
                    flexShrink: 0,
                  }}>
                    {selected.has(c.estId) && "✓"}
                  </div>

                  {/* Estimate info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: T.fontSize.xs, fontWeight: 600, color: C.text, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {c.estName}
                    </div>
                    <div style={{ fontSize: 8, color: C.textDim }}>{c.hours}h · Due {c.bidDue}</div>
                  </div>

                  {/* From → To */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <Avatar name={c.from} color={estimatorColor(c.from)} size={18} fontSize={7} />
                    <span style={{ fontSize: 9, color: C.textDim }}>→</span>
                    <Avatar name={c.to} color={estimatorColor(c.to)} size={18} fontSize={7} />
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.text }}>{c.to}</span>
                  </div>

                  {/* Reason */}
                  {c.skillMatch && (
                    <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 10, background: "#30D15815", color: "#30D158", fontWeight: 600, flexShrink: 0 }}>
                      skill match
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            {!applied && (
              <div style={{ display: "flex", gap: T.space[3], justifyContent: "flex-end" }}>
                <button
                  onClick={applySelected}
                  disabled={selected.size === 0}
                  style={{
                    ...bt(C),
                    padding: "8px 18px",
                    fontSize: T.fontSize.xs,
                    fontWeight: 600,
                    color: selected.size > 0 ? C.accent : C.textDim,
                    background: selected.size > 0 ? `${C.accent}12` : "transparent",
                    border: `1px solid ${selected.size > 0 ? C.accent + "30" : C.border}`,
                    borderRadius: T.radius.sm,
                    opacity: selected.size > 0 ? 1 : 0.5,
                  }}
                >
                  Apply Selected ({selected.size})
                </button>
                <button
                  onClick={applyAll}
                  style={{
                    ...bt(C),
                    padding: "8px 18px",
                    fontSize: T.fontSize.xs,
                    fontWeight: 600,
                    color: "#fff",
                    background: C.accent,
                    border: "none",
                    borderRadius: T.radius.sm,
                  }}
                >
                  Apply All ({changes.length})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
