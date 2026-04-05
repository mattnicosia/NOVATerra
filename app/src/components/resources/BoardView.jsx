import React, { useState } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { cardSolid } from "@/utils/styles";
import { SCHEDULE_COLORS, hexAlpha, utilizationColor } from "@/utils/resourceColors";
import { parseDateStr } from "@/utils/dateHelpers";
import Avatar from "@/components/shared/Avatar";

export default function BoardView({ workload, C, T, navigate, onDrop, onProjectClick }) {
  const { estimatorRows, unassignedEstimates, CAPACITY_HOURS, effectiveHoursPerDay, dailyLoad } = workload;
  const capHours = effectiveHoursPerDay || CAPACITY_HOURS;
  const todayStr = new Date().toISOString().slice(0, 10);
  const [dragOverTarget, setDragOverTarget] = useState(null); // estimator name or "__unassigned__"

  // Inline hours editor state
  const [editingHoursId, setEditingHoursId] = useState(null);
  const [editingHoursVal, setEditingHoursVal] = useState("");

  // Draggable Project Card
  const ProjectCard = ({ est, estimatorName }) => {
    const statusColor = SCHEDULE_COLORS[est.scheduleStatus] || C.purple;
    const pct = est.estimatedHours > 0 ? Math.min(100, (est.hoursLogged / est.estimatedHours) * 100) : 0;
    const isEditingHours = editingHoursId === est.id;

    const saveHours = () => {
      const h = Number(editingHoursVal);
      if (h >= 0) {
        useEstimatesStore.getState().updateIndexEntry(est.id, { estimatedHours: h });
        useUiStore.getState().showToast(`Updated "${est.name}" to ${h}h`);
      }
      setEditingHoursId(null);
    };

    return (
      <div
        draggable={!isEditingHours}
        onDragStart={e => {
          if (isEditingHours) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData("estimateId", est.id);
          e.dataTransfer.setData("fromEstimator", estimatorName || "");
          e.dataTransfer.effectAllowed = "move";
        }}
        onClick={e => {
          if (isEditingHours) return;
          if (onProjectClick) onProjectClick({ ...est, estimator: estimatorName || "" }, e);
        }}
        onDoubleClick={() => {
          if (!isEditingHours) navigate(`/estimate/${est.id}/info`);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          borderRadius: T.radius.sm,
          background: C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
          border: `1px solid ${C.border}40`,
          cursor: isEditingHours ? "default" : "grab",
          transition: "background 100ms, box-shadow 100ms",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = C.isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {/* Grab handle */}
        <div style={{ fontSize: 10, color: C.textDim, cursor: "grab", userSelect: "none", lineHeight: 1 }}>⠿</div>

        {/* Status dot */}
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: T.fontSize.xs,
              fontWeight: T.fontWeight.semibold,
              color: C.text,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {est.name}
          </div>
          <div style={{ fontSize: 9, color: C.textDim, marginTop: 1, display: "flex", gap: 6 }}>
            {est.bidDue && (
              <span>
                {parseDateStr(est.bidDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {est.daysRemaining > 0
                  ? ` · ${est.daysRemaining}d`
                  : est.daysRemaining === 0
                    ? " · Today"
                    : " · Overdue"}
              </span>
            )}
          </div>
        </div>

        {/* Hours progress — click to edit */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: statusColor,
                borderRadius: 2,
              }}
            />
          </div>
          {isEditingHours ? (
            <input
              type="number"
              min={0}
              step={1}
              autoFocus
              value={editingHoursVal}
              onChange={e => setEditingHoursVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") saveHours();
                if (e.key === "Escape") setEditingHoursId(null);
              }}
              onBlur={saveHours}
              onClick={e => e.stopPropagation()}
              style={{
                width: 48,
                padding: "2px 4px",
                fontSize: 9,
                fontWeight: 600,
                borderRadius: 4,
                border: `1px solid ${C.accent}`,
                background: C.isDark ? "rgba(255,255,255,0.08)" : "#fff",
                color: C.text,
                outline: "none",
                textAlign: "right",
              }}
            />
          ) : (
            <span
              onClick={e => {
                e.stopPropagation();
                setEditingHoursId(est.id);
                setEditingHoursVal(est.estimatedHours || 0);
              }}
              title="Click to edit estimated hours"
              style={{
                fontSize: 9,
                color: C.textMuted,
                fontWeight: 600,
                minWidth: 50,
                textAlign: "right",
                cursor: "text",
                padding: "2px 4px",
                borderRadius: 4,
                transition: "background 100ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = `${C.accent}15`)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              {est.hoursLogged}h/{est.estimatedHours}h
            </span>
          )}
        </div>
      </div>
    );
  };

  // Drop zone handlers
  const onDragOver = (e, target) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTarget(target);
  };
  const onDragLeave = () => setDragOverTarget(null);
  const onDropHandler = (e, targetEstimator) => {
    e.preventDefault();
    setDragOverTarget(null);
    const estimateId = e.dataTransfer.getData("estimateId");
    const fromEstimator = e.dataTransfer.getData("fromEstimator");
    if (estimateId && onDrop) {
      onDrop(estimateId, targetEstimator, fromEstimator);
    }
  };

  return (
    <div>
      {/* Unassigned Tray */}
      {unassignedEstimates.length > 0 && (
        <div
          onDragOver={e => onDragOver(e, "__unassigned__")}
          onDragLeave={onDragLeave}
          onDrop={e => onDropHandler(e, "")}
          style={{
            ...cardSolid(C),
            padding: T.space[4],
            marginBottom: T.space[4],
            border: `1px solid ${dragOverTarget === "__unassigned__" ? "#FBBF24" : "#FBBF2430"}`,
            background:
              dragOverTarget === "__unassigned__"
                ? C.isDark
                  ? "rgba(251,191,36,0.08)"
                  : "rgba(251,191,36,0.05)"
                : undefined,
            transition: "border-color 150ms, background 150ms",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[3] }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "#FBBF2420",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                color: "#FBBF24",
                fontWeight: 700,
              }}
            >
              ?
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: T.fontSize.base, fontWeight: T.fontWeight.bold, color: "#FBBF24" }}>
                Unassigned
              </div>
              <div style={{ fontSize: 9, color: C.textDim }}>
                {unassignedEstimates.length} project{unassignedEstimates.length !== 1 ? "s" : ""} need assignment — drag
                to an estimator below
              </div>
            </div>
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: T.space[2] }}
          >
            {unassignedEstimates.map(est => (
              <ProjectCard key={est.id} est={est} estimatorName="" />
            ))}
          </div>
        </div>
      )}

      {/* Estimator Columns Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: T.space[4],
        }}
      >
        {estimatorRows.map(row => {
          const todayLoad = dailyLoad?.get(todayStr)?.get(row.name);
          const dailyHours = todayLoad?.totalHours || 0;
          const utilPct = Math.round((dailyHours / capHours) * 100);
          const utilColor = utilizationColor(dailyHours, capHours);
          const isOver = dragOverTarget === row.name;
          const sorted = [...row.estimates].sort((a, b) => {
            if (!a.bidDue) return 1;
            if (!b.bidDue) return -1;
            return a.bidDue.localeCompare(b.bidDue);
          });

          return (
            <div
              key={row.name}
              onDragOver={e => onDragOver(e, row.name)}
              onDragLeave={onDragLeave}
              onDrop={e => onDropHandler(e, row.name)}
              style={{
                ...cardSolid(C),
                padding: T.space[4],
                border: isOver ? `1px solid ${C.accent}` : undefined,
                background: isOver ? (C.isDark ? C.accentBg : C.accentBg) : undefined,
                transition: "border-color 150ms, background 150ms",
                minHeight: 120,
              }}
            >
              {/* Estimator Header */}
              <div style={{ display: "flex", alignItems: "center", gap: T.space[3], marginBottom: T.space[3] }}>
                <div style={{ position: "relative" }}>
                  <Avatar name={row.name} color={row.pending ? "#666" : row.color} size={32} fontSize={12} />
                  {row.pending && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: -2,
                        right: -2,
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        background: "#FBBF24",
                        border: `2px solid ${C.isDark ? "#1a1a2e" : "#fff"}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 7,
                        fontWeight: 700,
                      }}
                    >
                      ✉
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span
                      style={{
                        fontSize: T.fontSize.base,
                        fontWeight: T.fontWeight.bold,
                        color: row.pending ? C.textMuted : C.text,
                      }}
                    >
                      {row.name}
                    </span>
                    {row.pending && (
                      <span
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          color: "#FBBF24",
                          background: "#FBBF2418",
                          border: "1px solid #FBBF2430",
                          padding: "1px 6px",
                          borderRadius: T.radius.sm,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        Invited
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim }}>
                    {row.pending
                      ? row.email || "Pending acceptance"
                      : `${row.estimates.length} project${row.estimates.length !== 1 ? "s" : ""}`}
                  </div>
                </div>
                {/* Utilization badge */}
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: utilColor,
                    padding: "3px 8px",
                    borderRadius: T.radius.sm,
                    background: hexAlpha(utilColor === "transparent" ? "#30D158" : utilColor, 0.12),
                  }}
                >
                  {utilPct}%
                </div>
              </div>

              {/* Pipeline revenue — revenue-linked allocation */}
              {!row.pending && sorted.length > 0 && (() => {
                const pipeline = sorted.reduce((s, e) => s + (e.grandTotal || 0), 0);
                if (pipeline <= 0) return null;
                const fmtPipeline = pipeline >= 1000000
                  ? `$${(pipeline / 1000000).toFixed(1)}M`
                  : pipeline >= 1000
                    ? `$${(pipeline / 1000).toFixed(0)}K`
                    : `$${pipeline.toLocaleString()}`;
                return (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: T.space[2],
                      padding: "4px 8px",
                      borderRadius: T.radius.sm,
                      background: C.isDark ? "rgba(48,209,88,0.06)" : "rgba(48,209,88,0.04)",
                      border: `1px solid ${C.isDark ? "rgba(48,209,88,0.15)" : "rgba(48,209,88,0.10)"}`,
                    }}
                  >
                    <span style={{ fontSize: 9, color: C.textDim, fontWeight: 600 }}>Pipeline</span>
                    <span style={{ fontSize: T.fontSize.sm, fontWeight: T.fontWeight.bold, color: "#30D158" }}>
                      {fmtPipeline}
                    </span>
                  </div>
                );
              })()}

              {/* Utilization bar */}
              <div style={{ marginBottom: T.space[3] }}>
                <div
                  style={{
                    height: 3,
                    borderRadius: 2,
                    background: C.isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, utilPct)}%`,
                      background: utilColor === "transparent" ? "#30D158" : utilColor,
                      borderRadius: 2,
                      transition: "width 300ms",
                    }}
                  />
                </div>
              </div>

              {/* Project cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: T.space[2] }}>
                {sorted.map(est => (
                  <ProjectCard key={est.id} est={est} estimatorName={row.name} />
                ))}
                {row.estimates.length === 0 && (
                  <div
                    style={{
                      padding: "16px 12px",
                      textAlign: "center",
                      fontSize: T.fontSize.xs,
                      color: C.textDim,
                      borderRadius: T.radius.sm,
                      border: `1px dashed ${row.pending ? "#FBBF2430" : `${C.border}40`}`,
                    }}
                  >
                    {row.pending ? "Awaiting acceptance — assign projects after they join" : "Drop projects here"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state — no estimators and no unassigned */}
      {estimatorRows.length === 0 && unassignedEstimates.length === 0 && (
        <div
          style={{
            ...cardSolid(C),
            padding: `${T.space[8]}px ${T.space[6]}px`,
            textAlign: "center",
          }}
        >
          <div
            style={{ fontSize: T.fontSize.lg, fontWeight: T.fontWeight.bold, color: C.text, marginBottom: T.space[2] }}
          >
            No active bids
          </div>
          <div style={{ fontSize: T.fontSize.sm, color: C.textMuted }}>
            Create an estimate and set it to "Bidding" status to see it here.
          </div>
        </div>
      )}
    </div>
  );
}
