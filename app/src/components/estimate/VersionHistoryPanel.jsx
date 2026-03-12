// VersionHistoryPanel — Shows estimate snapshot timeline with diff comparisons
// Sprint 2.2: Version history / snapshots — diff view, restore naming

import { useState, useMemo } from "react";
import { useTheme } from "@/hooks/useTheme";
import { useSnapshotsStore } from "@/stores/snapshotsStore";
import { useItemsStore } from "@/stores/itemsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { captureManualSnapshot } from "@/hooks/useAutoSnapshot";
import Ic from "@/components/shared/Ic";
import { I } from "@/constants/icons";
import { bt, card } from "@/utils/styles";

const fmt = n => {
  if (!n && n !== 0) return "$0";
  return "$" + Math.round(n).toLocaleString();
};

const pct = n => {
  if (!n) return "0%";
  return (n > 0 ? "+" : "") + n.toFixed(1) + "%";
};

export default function VersionHistoryPanel({ estimateId, onClose }) {
  const C = useTheme();
  const T = C.T;
  const [compareMode, setCompareMode] = useState(false);
  const [selectedA, setSelectedA] = useState(null);
  const [selectedB, setSelectedB] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const snapshots = useSnapshotsStore(s => s.snapshots[estimateId] ?? []);
  const computeDelta = useSnapshotsStore(s => s.computeDelta);
  const deleteSnapshot = useSnapshotsStore(s => s.deleteSnapshot);
  const renameSnapshot = useSnapshotsStore(s => s.renameSnapshot);
  const buildLiveSnapshot = useSnapshotsStore(s => s.buildLiveSnapshot);

  // Build live snapshot for comparison
  const liveSnap = useMemo(() => {
    const items = useItemsStore.getState().items;
    const totals = useItemsStore.getState().getTotals();
    const project = useProjectStore.getState().project;
    return buildLiveSnapshot(estimateId, items, totals, project);
  }, [estimateId, buildLiveSnapshot]);

  const allSnaps = useMemo(() => [...snapshots, liveSnap], [snapshots, liveSnap]);

  const delta = useMemo(() => {
    if (!compareMode || !selectedA || !selectedB) return null;
    const a = allSnaps.find(s => s.id === selectedA);
    const b = allSnaps.find(s => s.id === selectedB);
    return computeDelta(a, b);
  }, [compareMode, selectedA, selectedB, allSnaps, computeDelta]);

  const handleCapture = () => {
    const label = prompt("Snapshot label:", `Snapshot ${snapshots.length + 1}`);
    if (label === null) return;
    captureManualSnapshot(estimateId, label || `Snapshot ${snapshots.length + 1}`);
  };

  const handleStartRename = (snap) => {
    setRenaming(snap.id);
    setRenameValue(snap.label || "");
  };

  const handleFinishRename = () => {
    if (renaming && renameValue.trim()) {
      renameSnapshot(estimateId, renaming, renameValue.trim());
    }
    setRenaming(null);
    setRenameValue("");
  };

  return (
    <div
      style={{
        ...card(C),
        padding: T.space[4],
        maxHeight: 500,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: T.space[3] }}>
        <div style={{ display: "flex", alignItems: "center", gap: T.space[2] }}>
          <Ic d={I.clock || I.calendar} size={16} color={C.accent} />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Version History</span>
          <span style={{ fontSize: 10, color: C.textDim }}>({snapshots.length} snapshots)</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setCompareMode(v => !v)}
            style={bt(C, {
              padding: "4px 10px",
              fontSize: 9,
              fontWeight: 600,
              background: compareMode ? `${C.accent}15` : "transparent",
              color: compareMode ? C.accent : C.textDim,
              border: `1px solid ${compareMode ? C.accent + "40" : C.border}`,
            })}
          >
            Compare
          </button>
          <button
            onClick={handleCapture}
            style={bt(C, {
              padding: "4px 10px",
              fontSize: 9,
              fontWeight: 600,
              background: C.accent,
              color: "#fff",
            })}
          >
            + Snapshot
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={bt(C, {
                padding: "4px 8px",
                fontSize: 10,
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textDim,
              })}
            >
              <Ic d={I.close} size={10} color={C.textDim} />
            </button>
          )}
        </div>
      </div>

      {/* Compare mode: selection hint */}
      {compareMode && (
        <div style={{ fontSize: 10, color: C.accent, marginBottom: T.space[2], fontWeight: 600 }}>
          {!selectedA
            ? "Select the BASELINE snapshot (A)"
            : !selectedB
              ? "Select the COMPARISON snapshot (B)"
              : `Comparing: ${allSnaps.find(s => s.id === selectedA)?.label || "A"} → ${allSnaps.find(s => s.id === selectedB)?.label || "B"}`}
        </div>
      )}

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {allSnaps.length === 0 && (
          <div style={{ padding: T.space[5], textAlign: "center", color: C.textDim, fontSize: 11 }}>
            No snapshots yet. Snapshots are captured automatically when your estimate changes significantly, or create one manually.
          </div>
        )}
        {[...allSnaps].reverse().map((snap, i) => {
          const isLive = snap.id === "_live";
          const prevSnap = i < allSnaps.length - 1 ? [...allSnaps].reverse()[i + 1] : null;
          const change = prevSnap ? snap.grandTotal - prevSnap.grandTotal : 0;
          const changePct = prevSnap?.grandTotal ? (change / prevSnap.grandTotal) * 100 : 0;
          const isSelectedA = compareMode && selectedA === snap.id;
          const isSelectedB = compareMode && selectedB === snap.id;

          return (
            <div
              key={snap.id}
              onClick={() => {
                if (!compareMode) return;
                if (!selectedA) setSelectedA(snap.id);
                else if (!selectedB && snap.id !== selectedA) setSelectedB(snap.id);
                else {
                  setSelectedA(snap.id);
                  setSelectedB(null);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: T.space[3],
                padding: `${T.space[2]}px ${T.space[3]}px`,
                borderRadius: T.radius.sm,
                background: isSelectedA
                  ? `${C.blue}10`
                  : isSelectedB
                    ? `${C.green}10`
                    : isLive
                      ? `${C.accent}06`
                      : "transparent",
                border: isSelectedA
                  ? `1px solid ${C.blue}30`
                  : isSelectedB
                    ? `1px solid ${C.green}30`
                    : `1px solid transparent`,
                cursor: compareMode ? "pointer" : "default",
                transition: T.transition.fast,
              }}
            >
              {/* Timeline dot */}
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: isLive ? C.green : snap.trigger === "manual" ? C.accent : C.textDim,
                  flexShrink: 0,
                }}
              />

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {renaming === snap.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={handleFinishRename}
                      onKeyDown={e => e.key === "Enter" && handleFinishRename()}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: C.text,
                        background: C.bg2,
                        border: `1px solid ${C.accent}40`,
                        borderRadius: 4,
                        padding: "1px 6px",
                        outline: "none",
                        fontFamily: T.font.sans,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: isLive ? C.green : C.text,
                      }}
                      onDoubleClick={() => !isLive && handleStartRename(snap)}
                    >
                      {snap.label || "Auto"}
                    </span>
                  )}
                  {isSelectedA && (
                    <span
                      style={{
                        fontSize: 7,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: T.radius.full,
                        background: `${C.blue}20`,
                        color: C.blue,
                      }}
                    >
                      A
                    </span>
                  )}
                  {isSelectedB && (
                    <span
                      style={{
                        fontSize: 7,
                        fontWeight: 700,
                        padding: "1px 5px",
                        borderRadius: T.radius.full,
                        background: `${C.green}20`,
                        color: C.green,
                      }}
                    >
                      B
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
                  {isLive ? "Live" : snap.dateStr || new Date(snap.timestamp).toLocaleDateString()}
                  {" · "}
                  {snap.itemCount} items
                </div>
              </div>

              {/* Grand total + change */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{fmt(snap.grandTotal)}</div>
                {change !== 0 && (
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: change > 0 ? C.red : C.green,
                    }}
                  >
                    {change > 0 ? "+" : ""}
                    {fmt(change)} ({pct(changePct)})
                  </div>
                )}
              </div>

              {/* Actions */}
              {!isLive && !compareMode && (
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleStartRename(snap);
                    }}
                    title="Rename"
                    style={bt(C, { padding: 4, background: "transparent", border: "none", color: C.textDim })}
                  >
                    <Ic d={I.edit || I.settings} size={10} color={C.textDim} />
                  </button>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (confirm("Delete this snapshot?")) deleteSnapshot(estimateId, snap.id);
                    }}
                    title="Delete"
                    style={bt(C, { padding: 4, background: "transparent", border: "none", color: C.textDim })}
                  >
                    <Ic d={I.trash} size={10} color={C.textDim} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delta summary (compare mode) */}
      {delta && (
        <div
          style={{
            marginTop: T.space[3],
            padding: T.space[3],
            background: C.bg2,
            borderRadius: T.radius.md,
            border: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: C.text, marginBottom: T.space[2] }}>
            Comparison Summary
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: T.space[2] }}>
            {[
              { label: "Grand Total", val: delta.grandTotal, pc: delta.grandTotalPct },
              { label: "Direct Cost", val: delta.direct, pc: delta.directPct },
              { label: "Material", val: delta.material },
              { label: "Labor", val: delta.labor },
              { label: "Equipment", val: delta.equipment },
              { label: "Subcontractor", val: delta.sub },
              { label: "Markup", val: delta.markupTotal },
              { label: "Items", val: delta.itemCount, isCurrency: false },
            ].map(d => (
              <div key={d.label}>
                <div style={{ fontSize: 8, color: C.textDim, fontWeight: 600 }}>{d.label}</div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: d.val > 0 ? C.red : d.val < 0 ? C.green : C.textDim,
                  }}
                >
                  {d.isCurrency === false
                    ? (d.val > 0 ? "+" : "") + d.val
                    : (d.val > 0 ? "+" : "") + fmt(d.val)}
                  {d.pc !== undefined && d.pc !== 0 && (
                    <span style={{ fontSize: 8, marginLeft: 3 }}>({pct(d.pc)})</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Division deltas */}
          {Object.keys(delta.divisions || {}).length > 0 && (
            <div style={{ marginTop: T.space[2] }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: C.textDim, marginBottom: 4 }}>By Division</div>
              {Object.entries(delta.divisions)
                .filter(([, d]) => Math.abs(d.totalDelta) > 0)
                .sort(([, a], [, b]) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta))
                .slice(0, 8)
                .map(([div, d]) => (
                  <div
                    key={div}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 9,
                      padding: "1px 0",
                    }}
                  >
                    <span style={{ color: C.textDim }}>{div}</span>
                    <span style={{ fontWeight: 600, color: d.totalDelta > 0 ? C.red : C.green }}>
                      {d.totalDelta > 0 ? "+" : ""}
                      {fmt(d.totalDelta)} ({pct(d.pct)})
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
