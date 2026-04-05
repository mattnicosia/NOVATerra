import { useState, useEffect, useRef, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useMasterDataStore } from "@/stores/masterDataStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useCollaborationStore } from "@/stores/collaborationStore";
import { useUiStore } from "@/stores/uiStore";
import { loadEstimate } from "@/hooks/usePersistence";
import { computeEstimatorExperience, computeMatchScore } from "@/utils/estimatorExperience";

export default function BarContextMenu({ pos, bar, currentEstimator, onClose }) {
  const C = useTheme();
  const ref = useRef(null);
  const [submenu, setSubmenu] = useState(null);
  const [editHours, setEditHours] = useState(false);
  const [hoursVal, setHoursVal] = useState(bar.estimatedHours);
  const [addCorr, setAddCorr] = useState(false);
  const [corrTitle, setCorrTitle] = useState("");
  const [corrDue, setCorrDue] = useState("");
  const [corrHours, setCorrHours] = useState("");
  const [addPause, setAddPause] = useState(false);
  const [pauseStart, setPauseStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [pauseEnd, setPauseEnd] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [pauseReason, setPauseReason] = useState("");
  const [managePauses, setManagePauses] = useState(false);
  const isSubmittedOrWon = bar.status === "Submitted" || bar.status === "Won";
  const existingPauses = bar.schedulePauses || [];

  const rawEstimators = useMasterDataStore(s => s.masterData?.estimators);
  const estimators = useMemo(() => rawEstimators || [], [rawEstimators]);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);

  // Team members for this bar
  const barTeam = useMemo(() => {
    const lead = bar.estimator || currentEstimator || "";
    return [lead, ...(bar._teamMembers || bar.coEstimators || [])].filter(Boolean);
  }, [bar, currentEstimator]);

  // Compute match scores for smart reassign ranking
  const rankedEstimators = useMemo(() => {
    const teamSet = new Set(barTeam);
    const others = estimators.filter(e => !teamSet.has(e.name));
    return others
      .map(est => {
        const experience = computeEstimatorExperience(estimatesIndex, est.name);
        const matchResult = computeMatchScore(experience, bar, est);
        return { ...est, matchScore: matchResult.score, matchFlags: matchResult.flags };
      })
      .sort((a, b) => b.matchScore - a.matchScore);
  }, [estimators, estimatesIndex, bar, barTeam]);

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = e => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const x = Math.min(pos.x, window.innerWidth - 200);
  const y = Math.min(pos.y, window.innerHeight - 300);

  const menuItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    color: C.text,
    cursor: "pointer",
    transition: "background 80ms",
    border: "none",
    background: "transparent",
    width: "100%",
    textAlign: "left",
  };

  const doReassign = name => {
    const store = useEstimatesStore.getState();
    const est = store.estimatesIndex.find(e => e.id === bar.id);
    const lead = est?.estimator || "";
    const coEsts = [...(est?.coEstimators || [])];
    const team = [lead, ...coEsts].filter(Boolean);

    if (!name) {
      // Move to unassigned — remove this member from team
      if (team.length <= 1) {
        store.updateIndexEntry(bar.id, { estimator: "", coEstimators: [] });
      } else if (currentEstimator === lead) {
        store.updateIndexEntry(bar.id, { estimator: coEsts[0] || "", coEstimators: coEsts.slice(1) });
      } else {
        store.updateIndexEntry(bar.id, { coEstimators: coEsts.filter(c => c !== currentEstimator) });
      }
      useUiStore.getState().showToast(`Removed ${currentEstimator || "estimator"} from "${bar.name}"`);
    } else if (team.length <= 1) {
      // Solo → simple reassign
      store.updateIndexEntry(bar.id, { estimator: name });
      useUiStore.getState().showToast(`Assigned "${bar.name}" to ${name}`);
    } else {
      // Team → replace this member
      if (currentEstimator === lead) {
        store.updateIndexEntry(bar.id, { estimator: name });
      } else {
        store.updateIndexEntry(bar.id, { coEstimators: coEsts.map(c => (c === currentEstimator ? name : c)) });
      }
      useUiStore.getState().showToast(`Replaced ${currentEstimator} with ${name} on "${bar.name}"`);
    }
    onClose();
  };

  const doAddToTeam = name => {
    const store = useEstimatesStore.getState();
    const est = store.estimatesIndex.find(e => e.id === bar.id);
    if (!est?.estimator) {
      store.updateIndexEntry(bar.id, { estimator: name });
    } else {
      store.updateIndexEntry(bar.id, { coEstimators: [...(est.coEstimators || []), name] });
    }
    useUiStore.getState().showToast(`Added ${name} to team on "${bar.name}"`);
    onClose();
  };

  const doAdjustHours = () => {
    const h = Number(hoursVal);
    if (h >= 0) {
      useEstimatesStore.getState().updateIndexEntry(bar.id, { estimatedHours: h });
      useUiStore.getState().showToast(`Updated "${bar.name}" to ${h}h`);
    }
    onClose();
  };

  const doAddCorrespondence = async () => {
    if (!corrTitle.trim()) return;
    // Ensure this estimate is loaded so correspondence store writes to the right context
    const activeId = useEstimatesStore.getState().activeEstimateId;
    if (activeId !== bar.id) {
      await loadEstimate(bar.id);
    }
    useCollaborationStore.getState().addCorrespondence({
      title: corrTitle.trim(),
      dueDate: corrDue,
      estimatedHours: Number(corrHours) || 0,
    });
    useUiStore.getState().showToast(`Added correspondence to "${bar.name}"`);
    onClose();
  };

  const doAddPause = () => {
    if (!pauseStart || !pauseEnd || pauseStart > pauseEnd) return;
    const newPauses = [...existingPauses, { start: pauseStart, end: pauseEnd, reason: pauseReason.trim() }];
    useEstimatesStore.getState().updateIndexEntry(bar.id, { schedulePauses: newPauses });
    useUiStore.getState().showToast(`Added pause to "${bar.name}"`);
    onClose();
  };

  const doRemovePause = idx => {
    const newPauses = existingPauses.filter((_, i) => i !== idx);
    useEstimatesStore.getState().updateIndexEntry(bar.id, { schedulePauses: newPauses });
    useUiStore.getState().showToast(`Removed pause from "${bar.name}"`);
    onClose();
  };

  const doPushNextWeek = () => {
    // Find next Monday
    const due = new Date(bar.bidDue + "T00:00:00");
    const dayOfWeek = due.getDay();
    const daysToAdd = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMon = new Date(due);
    nextMon.setDate(due.getDate() + daysToAdd);
    // Add estimate's work days to get new due date
    const newDue = new Date(nextMon);
    newDue.setDate(nextMon.getDate() + 4); // Friday of next week
    const fmt = d => d.toISOString().slice(0, 10);
    useEstimatesStore.getState().updateIndexEntry(bar.id, { bidDue: fmt(newDue) });
    useUiStore.getState().showToast(`Pushed "${bar.name}" to week of ${fmt(nextMon)}`);
    onClose();
  };

  return (
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 1000,
        background: C.isDark
          ? "linear-gradient(135deg, rgba(30,30,38,0.98), rgba(22,22,28,0.98))"
          : "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(248,248,250,0.98))",
        backdropFilter: "blur(40px) saturate(1.8)",
        WebkitBackdropFilter: "blur(40px) saturate(1.8)",
        border: `1px solid ${C.isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.10)"}`,
        borderRadius: 10,
        padding: "6px 4px",
        minWidth: 180,
        boxShadow: C.isDark
          ? "0 12px 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 8px 30px rgba(0,0,0,0.15)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "4px 12px 6px",
          fontSize: 9,
          fontWeight: 700,
          color: C.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          borderBottom: `1px solid ${C.border}20`,
          marginBottom: 2,
        }}
      >
        {bar.name}
      </div>

      {/* Reassign submenu (smart-ranked) */}
      {submenu === "reassign" ? (
        <div style={{ minWidth: 240 }}>
          <button
            onClick={() => setSubmenu(null)}
            style={{ ...menuItemStyle, color: C.textDim, fontSize: 9 }}
            onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
            onMouseLeave={e => (e.target.style.background = "transparent")}
          >
            ← Back
          </button>
          {rankedEstimators.map((e, idx) => {
            const badgeColor = e.matchScore >= 70 ? "#30D158" : e.matchScore >= 40 ? "#FF9500" : "#FF3B30";
            const topFlag = e.matchFlags?.[0];
            return (
              <button
                key={e.id}
                onClick={() => doReassign(e.name)}
                style={{ ...menuItemStyle, alignItems: "flex-start", gap: 8, padding: "6px 12px" }}
                onMouseEnter={ev => (ev.currentTarget.style.background = `${C.accent}12`)}
                onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: e.color || C.purple,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 8,
                    fontWeight: 700,
                    color: "#fff",
                  }}
                >
                  {(e.name || "?")[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 500 }}>{e.name}</span>
                    {idx === 0 && e.matchScore >= 40 && (
                      <span
                        style={{
                          fontSize: 7,
                          fontWeight: 700,
                          color: "#30D158",
                          background: "#30D15810",
                          padding: "1px 4px",
                          borderRadius: 4,
                          textTransform: "uppercase",
                        }}
                      >
                        Best
                      </span>
                    )}
                  </div>
                  {topFlag && (
                    <div
                      style={{
                        fontSize: 8,
                        color: C.textDim,
                        marginTop: 1,
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {topFlag}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 9,
                    fontWeight: 700,
                    color: badgeColor,
                    background: `${badgeColor}12`,
                  }}
                >
                  {e.matchScore}
                </div>
              </button>
            );
          })}
          {currentEstimator && (
            <>
              <div style={{ height: 1, background: `${C.border}40`, margin: "4px 8px" }} />
              <button
                onClick={() => doReassign("")}
                style={{ ...menuItemStyle, color: "#FBBF24" }}
                onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
                onMouseLeave={e => (e.target.style.background = "transparent")}
              >
                Move to Unassigned
              </button>
            </>
          )}
        </div>
      ) : submenu === "addToTeam" ? (
        <div style={{ minWidth: 240 }}>
          <button
            onClick={() => setSubmenu(null)}
            style={{ ...menuItemStyle, color: C.textDim, fontSize: 9 }}
            onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
            onMouseLeave={e => (e.target.style.background = "transparent")}
          >
            ← Back
          </button>
          <div style={{ padding: "2px 12px 4px", fontSize: 9, color: C.textDim }}>
            Add estimator to team ({barTeam.length} current)
          </div>
          {rankedEstimators.map(e => (
            <button
              key={e.id}
              onClick={() => doAddToTeam(e.name)}
              style={{ ...menuItemStyle, padding: "6px 12px" }}
              onMouseEnter={ev => (ev.currentTarget.style.background = `${C.accent}12`)}
              onMouseLeave={ev => (ev.currentTarget.style.background = "transparent")}
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: e.color || C.purple,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 8,
                  fontWeight: 700,
                  color: "#fff",
                }}
              >
                {(e.name || "?")[0]}
              </div>
              <span style={{ fontSize: 11, fontWeight: 500 }}>{e.name}</span>
            </button>
          ))}
        </div>
      ) : editHours ? (
        <div style={{ padding: "6px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: C.textDim, marginBottom: 4 }}>Estimated Hours</div>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              type="number"
              min={0}
              step={1}
              value={hoursVal}
              onChange={e => setHoursVal(e.target.value)}
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter") doAdjustHours();
                if (e.key === "Escape") onClose();
              }}
              style={{
                width: 70,
                padding: "4px 8px",
                fontSize: 11,
                borderRadius: 4,
                border: `1px solid ${C.border}`,
                background: C.bg1,
                color: C.text,
                outline: "none",
              }}
            />
            <button
              onClick={doAdjustHours}
              style={{
                ...menuItemStyle,
                width: "auto",
                padding: "4px 10px",
                background: `${C.accent}20`,
                color: C.accent,
                fontWeight: 600,
                borderRadius: 4,
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : addCorr ? (
        <div style={{ padding: "6px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: C.textDim, marginBottom: 6 }}>Add Correspondence</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input
              autoFocus
              placeholder="Title..."
              value={corrTitle}
              onChange={e => setCorrTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") doAddCorrespondence();
                if (e.key === "Escape") onClose();
              }}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                borderRadius: 4,
                border: `1px solid ${C.border}`,
                background: C.bg1,
                color: C.text,
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              <input
                type="date"
                placeholder="Due date"
                value={corrDue}
                onChange={e => setCorrDue(e.target.value)}
                style={{
                  flex: 1,
                  padding: "4px 6px",
                  fontSize: 10,
                  borderRadius: 4,
                  border: `1px solid ${C.border}`,
                  background: C.bg1,
                  color: C.text,
                  outline: "none",
                }}
              />
              <input
                type="number"
                min={0}
                placeholder="Hrs"
                value={corrHours}
                onChange={e => setCorrHours(e.target.value)}
                style={{
                  width: 42,
                  padding: "4px 6px",
                  fontSize: 10,
                  borderRadius: 4,
                  border: `1px solid ${C.border}`,
                  background: C.bg1,
                  color: C.text,
                  outline: "none",
                  textAlign: "center",
                }}
              />
            </div>
            <button
              onClick={doAddCorrespondence}
              style={{
                ...menuItemStyle,
                width: "100%",
                padding: "4px 10px",
                background: `${C.accent}20`,
                color: C.accent,
                fontWeight: 600,
                borderRadius: 4,
                justifyContent: "center",
              }}
            >
              Add
            </button>
          </div>
        </div>
      ) : addPause ? (
        <div style={{ padding: "6px 12px" }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: C.textDim, marginBottom: 6 }}>Add Pause / Split</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, color: C.textDim, marginBottom: 2 }}>From</div>
                <input
                  type="date"
                  value={pauseStart}
                  onChange={e => setPauseStart(e.target.value)}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "4px 6px",
                    fontSize: 10,
                    borderRadius: 4,
                    border: `1px solid ${C.border}`,
                    background: C.bg1,
                    color: C.text,
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 8, color: C.textDim, marginBottom: 2 }}>To</div>
                <input
                  type="date"
                  value={pauseEnd}
                  onChange={e => setPauseEnd(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "4px 6px",
                    fontSize: 10,
                    borderRadius: 4,
                    border: `1px solid ${C.border}`,
                    background: C.bg1,
                    color: C.text,
                    outline: "none",
                  }}
                />
              </div>
            </div>
            <input
              placeholder="Reason (optional)"
              value={pauseReason}
              onChange={e => setPauseReason(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") doAddPause();
                if (e.key === "Escape") onClose();
              }}
              style={{
                padding: "4px 8px",
                fontSize: 10,
                borderRadius: 4,
                border: `1px solid ${C.border}`,
                background: C.bg1,
                color: C.text,
                outline: "none",
              }}
            />
            <button
              onClick={doAddPause}
              style={{
                ...menuItemStyle,
                width: "100%",
                padding: "4px 10px",
                background: `${C.accent}20`,
                color: C.accent,
                fontWeight: 600,
                borderRadius: 4,
                justifyContent: "center",
              }}
            >
              Add Pause
            </button>
          </div>
        </div>
      ) : managePauses ? (
        <div style={{ padding: "6px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.textDim }}>Pauses ({existingPauses.length})</div>
            <button
              onClick={() => setManagePauses(false)}
              style={{ ...menuItemStyle, width: "auto", padding: "2px 8px", color: C.textDim, fontSize: 9 }}
            >
              ← Back
            </button>
          </div>
          {existingPauses.map((p, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 0",
                borderBottom: idx < existingPauses.length - 1 ? `1px solid ${C.border}10` : "none",
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: C.text, fontWeight: 500 }}>
                  {p.start} → {p.end}
                </div>
                {p.reason && <div style={{ fontSize: 9, color: C.textDim }}>{p.reason}</div>}
              </div>
              <button
                onClick={() => doRemovePause(idx)}
                style={{ ...menuItemStyle, width: "auto", padding: "2px 6px", color: "#FF3B30", fontSize: 9 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <button
            onClick={() => setSubmenu("reassign")}
            style={menuItemStyle}
            onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
            onMouseLeave={e => (e.target.style.background = "transparent")}
          >
            <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>👤</span>
            {barTeam.length > 1 ? `Replace ${currentEstimator}...` : "Reassign to..."}
          </button>
          {rankedEstimators.length > 0 && (
            <button
              onClick={() => setSubmenu("addToTeam")}
              style={menuItemStyle}
              onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
              onMouseLeave={e => (e.target.style.background = "transparent")}
            >
              <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>👥</span>
              Add to team...
            </button>
          )}
          <button
            onClick={() => setEditHours(true)}
            style={menuItemStyle}
            onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
            onMouseLeave={e => (e.target.style.background = "transparent")}
          >
            <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>⏱</span>
            Adjust Hours...
          </button>
          <button
            onClick={doPushNextWeek}
            style={menuItemStyle}
            onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
            onMouseLeave={e => (e.target.style.background = "transparent")}
          >
            <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>→</span>
            Push to Next Week
          </button>
          <div style={{ height: 1, background: `${C.border}40`, margin: "4px 8px" }} />
          <button
            onClick={() => setAddPause(true)}
            style={menuItemStyle}
            onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
            onMouseLeave={e => (e.target.style.background = "transparent")}
          >
            <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>✂</span>
            Split / Pause...
          </button>
          {existingPauses.length > 0 && (
            <button
              onClick={() => setManagePauses(true)}
              style={menuItemStyle}
              onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
              onMouseLeave={e => (e.target.style.background = "transparent")}
            >
              <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>📋</span>
              Manage Pauses ({existingPauses.length})
            </button>
          )}
          {isSubmittedOrWon && (
            <>
              <div style={{ height: 1, background: `${C.border}40`, margin: "4px 8px" }} />
              <button
                onClick={() => setAddCorr(true)}
                style={menuItemStyle}
                onMouseEnter={e => (e.target.style.background = `${C.accent}12`)}
                onMouseLeave={e => (e.target.style.background = "transparent")}
              >
                <span style={{ fontSize: 13, width: 18, textAlign: "center" }}>✉</span>
                Add Correspondence...
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
