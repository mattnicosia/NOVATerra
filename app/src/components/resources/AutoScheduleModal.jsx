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
   with mode selector (All / Single / Multi), match scores,
   and diff view (current → proposed) with apply controls.
   ──────────────────────────────────────────────────────── */

export default function AutoScheduleModal({ workload, onClose }) {
  const C = useTheme();
  const T = C.T;
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const estimators = useMasterDataStore(s => s.masterData?.estimators) || [];
  const effectiveHoursPerDay = workload.effectiveHoursPerDay || 5.95;

  const [selected, setSelected] = useState(new Set());
  const [applied, setApplied] = useState(false);
  const [mode, setMode] = useState("all"); // "all" | "single" | "multi"
  const [singlePick, setSinglePick] = useState(estimators[0]?.name || "");
  const [multiPicks, setMultiPicks] = useState(new Set(estimators.map(e => e.name)));

  // Build specialties map
  const specialtiesMap = useMemo(() => {
    const m = new Map();
    for (const e of estimators) {
      if (e.name && e.specialties) m.set(e.name, e.specialties);
    }
    return m;
  }, [estimators]);

  // Build progress map from workload rows
  const progressMap = useMemo(() => {
    const m = new Map();
    if (workload?.estimatorRows) {
      for (const row of workload.estimatorRows) {
        for (const bar of row.bars || []) {
          if (bar.id && bar.percentComplete !== undefined) {
            m.set(bar.id, {
              percentComplete: bar.percentComplete || 0,
              scheduleStatus: bar.scheduleStatus || "on-track",
            });
          }
        }
      }
    }
    return m;
  }, [workload]);

  // Build selected estimators list based on mode
  const selectedEstimators = useMemo(() => {
    if (mode === "single") return singlePick ? [singlePick] : [];
    if (mode === "multi") return [...multiPicks];
    return [];
  }, [mode, singlePick, multiPicks]);

  // Run auto-scheduler
  const result = useMemo(() => {
    return autoSchedule(estimatesIndex, estimators, {
      effectiveHoursPerDay,
      specialtiesMap,
      allEstimates: estimatesIndex,
      mode,
      selectedEstimators,
      progressMap,
    });
  }, [estimatesIndex, estimators, effectiveHoursPerDay, specialtiesMap, mode, selectedEstimators, progressMap]);

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
    const est = estimators.find(e => e.name === name);
    if (est?.color) return est.color;
    const row = workload.estimatorRows?.find(r => r.name === name);
    return row?.color || "#A78BFA";
  };

  const matchBadgeColor = score => {
    if (score >= 70) return "#30D158";
    if (score >= 40) return "#FF9500";
    return "#FF3B30";
  };

  const toggleMulti = name => {
    const next = new Set(multiPicks);
    next.has(name) ? next.delete(name) : next.add(name);
    setMultiPicks(next);
  };

  const pillBtn = (label, active, onClick) => ({
    ...bt(C),
    padding: "5px 14px",
    fontSize: 10,
    fontWeight: active ? 700 : 500,
    color: active ? "#fff" : C.textMuted,
    background: active ? C.accent : C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    border: `1px solid ${active ? C.accent : C.border}`,
    borderRadius: 20,
    transition: "all 120ms",
  });

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
          maxWidth: 680,
          maxHeight: "85vh",
          overflow: "auto",
          padding: T.space[5],
        }}
      >
        {/* Header */}
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: T.space[4] }}
        >
          <div>
            <div style={{ fontSize: T.fontSize.lg, fontWeight: 700, color: C.text }}>Schedule Optimizer</div>
            <div style={{ fontSize: T.fontSize.xs, color: C.textDim }}>Experience-weighted assignment optimization</div>
          </div>
          <button
            onClick={onClose}
            style={{
              ...bt(C),
              padding: "6px 10px",
              fontSize: T.fontSize.xs,
              color: C.textMuted,
              border: `1px solid ${C.border}`,
              borderRadius: T.radius.sm,
            }}
          >
            Close
          </button>
        </div>

        {/* Mode Selector */}
        <div style={{ marginBottom: T.space[4] }}>
          <div style={{ display: "flex", gap: 6, marginBottom: T.space[2] }}>
            <button onClick={() => setMode("all")} style={pillBtn("All", mode === "all")}>
              All Estimators
            </button>
            <button onClick={() => setMode("single")} style={pillBtn("Single", mode === "single")}>
              Single Estimator
            </button>
            <button onClick={() => setMode("multi")} style={pillBtn("Multi", mode === "multi")}>
              Selected Team
            </button>
          </div>

          {/* Single estimator picker */}
          {mode === "single" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: T.space[2] }}>
              {estimators.map(e => (
                <button
                  key={e.id}
                  onClick={() => setSinglePick(e.name)}
                  style={{
                    ...bt(C),
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 12px",
                    fontSize: 10,
                    fontWeight: singlePick === e.name ? 600 : 400,
                    color: singlePick === e.name ? "#fff" : C.text,
                    background:
                      singlePick === e.name
                        ? e.color || C.accent
                        : C.isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.03)",
                    border: `1px solid ${singlePick === e.name ? e.color || C.accent : C.border}`,
                    borderRadius: 20,
                  }}
                >
                  <Avatar name={e.name} color={e.color || "#A78BFA"} size={16} fontSize={7} />
                  {e.name}
                </button>
              ))}
            </div>
          )}

          {/* Multi estimator picker */}
          {mode === "multi" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: T.space[2] }}>
              {estimators.map(e => {
                const active = multiPicks.has(e.name);
                return (
                  <button
                    key={e.id}
                    onClick={() => toggleMulti(e.name)}
                    style={{
                      ...bt(C),
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 12px",
                      fontSize: 10,
                      fontWeight: active ? 600 : 400,
                      color: active ? "#fff" : C.textMuted,
                      background: active
                        ? e.color || C.accent
                        : C.isDark
                          ? "rgba(255,255,255,0.04)"
                          : "rgba(0,0,0,0.03)",
                      border: `1px solid ${active ? e.color || C.accent : C.border}`,
                      borderRadius: 20,
                      opacity: active ? 1 : 0.6,
                    }}
                  >
                    <Avatar name={e.name} color={e.color || "#A78BFA"} size={16} fontSize={7} />
                    {e.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: T.space[3], marginBottom: T.space[4] }}>
          {[
            { label: "Total Estimates", value: stats.totalEstimates, color: C.text },
            {
              label: "Current Conflicts",
              value: stats.currentConflicts,
              color: stats.currentConflicts > 0 ? "#FF3B30" : "#30D158",
            },
            { label: "Changes Proposed", value: stats.changesProposed, color: "#A78BFA" },
            { label: "Conflicts Resolved", value: stats.conflictsResolved, color: "#30D158" },
          ].map(s => (
            <div key={s.label} style={{ ...cardSolid(C), padding: `${T.space[2]}px ${T.space[3]}px`, flex: 1 }}>
              <div style={{ fontSize: 8, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Changes List */}
        {changes.length === 0 ? (
          <div style={{ textAlign: "center", padding: T.space[5], color: C.textDim }}>
            <div style={{ fontSize: 24, marginBottom: T.space[2] }}>✓</div>
            <div style={{ fontSize: T.fontSize.sm, fontWeight: 600 }}>
              {mode === "single" ? "Queue is already optimal" : "Schedule is already optimal"}
            </div>
            <div style={{ fontSize: T.fontSize.xs }}>No changes needed</div>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: T.space[2],
              }}
            >
              {!changes[0]?.isReorder && (
                <button
                  onClick={toggleAll}
                  style={{
                    ...bt(C),
                    padding: "4px 10px",
                    fontSize: 9,
                    color: C.textMuted,
                    border: `1px solid ${C.border}`,
                    borderRadius: T.radius.sm,
                  }}
                >
                  {selected.size === changes.length ? "Deselect All" : "Select All"}
                </button>
              )}
              <span style={{ fontSize: 9, color: C.textDim }}>
                {changes[0]?.isReorder
                  ? `${changes.length} item${changes.length !== 1 ? "s" : ""} need attention`
                  : `${selected.size} of ${changes.length} selected`}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: T.space[4] }}>
              {changes.map((c, idx) => (
                <div
                  key={c.estId}
                  onClick={() => !c.isReorder && toggle(c.estId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: T.space[2],
                    padding: `${T.space[2]}px ${T.space[3]}px`,
                    borderRadius: T.radius.md,
                    background: selected.has(c.estId)
                      ? `${C.accent}08`
                      : C.isDark
                        ? "rgba(255,255,255,0.02)"
                        : "rgba(0,0,0,0.02)",
                    border: `1px solid ${selected.has(c.estId) ? C.accent + "30" : C.border + "40"}`,
                    cursor: c.isReorder ? "default" : "pointer",
                  }}
                >
                  {/* Checkbox (not for reorder mode) */}
                  {!c.isReorder && (
                    <div
                      style={{
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
                      }}
                    >
                      {selected.has(c.estId) && "✓"}
                    </div>
                  )}

                  {/* Match score badge */}
                  {c.matchScore !== undefined && !c.isReorder && (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 9,
                        fontWeight: 700,
                        color: matchBadgeColor(c.matchScore),
                        background: `${matchBadgeColor(c.matchScore)}12`,
                        border: `1px solid ${matchBadgeColor(c.matchScore)}30`,
                      }}
                    >
                      {c.matchScore}
                    </div>
                  )}

                  {/* Estimate info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          fontSize: T.fontSize.xs,
                          fontWeight: 600,
                          color: C.text,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.estName}
                      </span>
                      {idx === 0 && !c.isReorder && c.matchScore >= 60 && (
                        <span
                          style={{
                            fontSize: 7,
                            fontWeight: 700,
                            color: "#30D158",
                            background: "#30D15810",
                            padding: "1px 5px",
                            borderRadius: 6,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          Top Pick
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 8, color: C.textDim }}>
                      {c.hours}h · Due {c.bidDue}
                      {c.reason && <span style={{ marginLeft: 6 }}>· {c.reason}</span>}
                    </div>
                  </div>

                  {/* From → To (or flags for reorder) */}
                  {c.isReorder ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: 2,
                        flexShrink: 0,
                      }}
                    >
                      {c.flags?.map((f, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: 8,
                            padding: "2px 6px",
                            borderRadius: 8,
                            background: "#FF3B3010",
                            color: "#FF3B30",
                            fontWeight: 500,
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <Avatar name={c.from} color={estimatorColor(c.from)} size={18} fontSize={7} />
                      <span style={{ fontSize: 9, color: C.textDim }}>→</span>
                      <Avatar name={c.to} color={estimatorColor(c.to)} size={18} fontSize={7} />
                      <span style={{ fontSize: 9, fontWeight: 600, color: C.text }}>{c.to}</span>
                    </div>
                  )}

                  {/* Experience flags */}
                  {!c.isReorder && c.flags?.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                      {c.flags.slice(0, 1).map((f, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: 7,
                            padding: "2px 5px",
                            borderRadius: 8,
                            fontWeight: 500,
                            color: f.startsWith("Strong") ? "#30D158" : f.startsWith("No ") ? "#FF9500" : C.textDim,
                            background: f.startsWith("Strong")
                              ? "#30D15810"
                              : f.startsWith("No ")
                                ? "#FF950010"
                                : `${C.border}10`,
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            {!applied && !changes[0]?.isReorder && (
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
