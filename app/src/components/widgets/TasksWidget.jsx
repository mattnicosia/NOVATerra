import { useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useTaskStore, TASK_TYPES, computeUrgency } from "@/stores/taskStore";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useUiStore } from "@/stores/uiStore";
import { today } from "@/utils/format";
import { bt } from "@/utils/styles";

/* ────────────────────────────────────────────────────────
   TasksWidget — compact task list with urgency-sorted
   display, inline quick-add with due date, bid day
   checklists, context navigation, and calendar sync.
   ──────────────────────────────────────────────────────── */

const STATUS_COLORS = {
  todo: null,
  "in-progress": "accent",
  blocked: "red",
  waiting: "orange",
  done: "green",
  cancelled: "dim",
};

const PRIORITY_DOTS = { critical: "!", high: "!", medium: "", low: "" };

function relativeDate(dateStr) {
  if (!dateStr) return null;
  const todayStr = today();
  if (dateStr === todayStr) return "Today";
  const d = new Date(dateStr);
  const t = new Date(todayStr);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < -1) return `${Math.abs(diff)}d overdue`;
  if (diff <= 7) return `${diff}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TasksWidget() {
  const C = useTheme();
  const T = C.T;
  const dk = C.isDark;
  const font = T.font.display;
  const navigate = useNavigate();

  const tasks = useTaskStore(s => s.tasks);
  const addTask = useTaskStore(s => s.addTask);
  const toggleComplete = useTaskStore(s => s.toggleComplete);
  const deleteTask = useTaskStore(s => s.deleteTask);
  const estimates = useEstimatesStore(s => s.estimates);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const activeEstimateId = useUiStore(s => s.activeEstimateId);

  const [quickInput, setQuickInput] = useState("");
  const [quickDueDate, setQuickDueDate] = useState(""); // due date for quick-add
  const [quickProjectId, setQuickProjectId] = useState(""); // assign to project
  const [filter, setFilter] = useState("active"); // "active" | "all" | "today"
  const [hoveredId, setHoveredId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editingDateId, setEditingDateId] = useState(null); // task id being date-edited
  const inputRef = useRef(null);

  // ── Computed lists ──────────────────────────────────────

  const todayStr = today();

  const stats = useMemo(() => {
    const active = tasks.filter(t => t.status !== "done" && t.status !== "cancelled");
    return {
      active: active.length,
      overdue: active.filter(t => t.dueDate && t.dueDate < todayStr).length,
      dueToday: active.filter(t => t.dueDate === todayStr).length,
      done: tasks.filter(t => t.status === "done").length,
    };
  }, [tasks, todayStr]);

  const displayTasks = useMemo(() => {
    let filtered;
    switch (filter) {
      case "today":
        filtered = tasks.filter(
          t => t.status !== "done" && t.status !== "cancelled" && t.dueDate === todayStr,
        );
        break;
      case "all":
        filtered = tasks;
        break;
      default: // "active"
        filtered = tasks.filter(t => t.status !== "done" && t.status !== "cancelled");
    }
    return filtered
      .map(t => ({ ...t, _urgency: computeUrgency(t) }))
      .sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (b.status === "done" && a.status !== "done") return -1;
        return b._urgency - a._urgency;
      });
  }, [tasks, filter, todayStr]);

  // ── Quick-add with smart parsing ───────────────────────

  const handleQuickAdd = useCallback(() => {
    const raw = quickInput.trim();
    if (!raw) return;

    let title = raw;
    let priority = "medium";
    let type = "action";
    let dueDate = quickDueDate || null;

    // Priority markers
    if (raw.startsWith("!!! ") || raw.startsWith("!!!")) {
      priority = "critical";
      title = raw.replace(/^!{3}\s*/, "");
    } else if (raw.startsWith("!! ") || raw.startsWith("!!")) {
      priority = "high";
      title = raw.replace(/^!{2}\s*/, "");
    } else if (raw.startsWith("! ") || raw.startsWith("!")) {
      priority = "high";
      title = raw.replace(/^!\s*/, "");
    }

    // Date keywords (only if no explicit date was picked)
    if (!dueDate) {
      const todayMatch = title.match(/\b(today)\b/i);
      const tomorrowMatch = title.match(/\b(tomorrow|tmrw)\b/i);
      const nextWeekMatch = title.match(/\bnext\s*week\b/i);
      if (todayMatch) {
        dueDate = todayStr;
        title = title.replace(todayMatch[0], "").trim();
      } else if (tomorrowMatch) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        dueDate = d.toISOString().split("T")[0];
        title = title.replace(tomorrowMatch[0], "").trim();
      } else if (nextWeekMatch) {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        dueDate = d.toISOString().split("T")[0];
        title = title.replace(nextWeekMatch[0], "").trim();
      }
    }

    // Type detection keywords
    const typeKeywords = {
      rfi: /\brfi\b/i,
      "scope-gap": /\bscope\s*(gap|miss)/i,
      review: /\breview\b/i,
      "follow-up": /\bfollow[\s-]?up\b/i,
      procurement: /\b(buyout|order|procure|material)\b/i,
      "bid-prep": /\bbid\s*(prep|day|submit)\b/i,
      deadline: /\bdeadline\b/i,
    };
    for (const [t, re] of Object.entries(typeKeywords)) {
      if (re.test(title)) {
        type = t;
        break;
      }
    }

    addTask({
      title: title.replace(/\s+/g, " ").trim(),
      type,
      priority,
      dueDate,
      estimateId: quickProjectId || activeEstimateId || null,
    });
    setQuickInput("");
    setQuickDueDate("");
    setQuickProjectId("");
    inputRef.current?.focus();
  }, [quickInput, quickDueDate, quickProjectId, todayStr, addTask, activeEstimateId]);

  const handleKeyDown = useCallback(
    e => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleQuickAdd();
      }
      if (e.key === "Escape") {
        setQuickInput("");
        setQuickDueDate("");
        inputRef.current?.blur();
      }
    },
    [handleQuickAdd],
  );

  // ── Context navigation ─────────────────────────────────

  const handleNavigateContext = useCallback(
    (e, task) => {
      e.stopPropagation();
      if (task.estimateId) {
        const page =
          task.type === "scope-gap" || task.type === "review"
            ? "estimate"
            : task.drawingId || task.takeoffId
              ? "takeoffs"
              : "estimate";
        navigate(`/estimate/${task.estimateId}/${page}`);
      }
    },
    [navigate],
  );

  // ── Due date update for existing task ──────────────────

  const handleSetDueDate = useCallback((taskId, newDate) => {
    useTaskStore.getState().updateTask(taskId, { dueDate: newDate || null });
    setEditingDateId(null);
  }, []);

  // ── Urgency color helper ───────────────────────────────

  const urgencyColor = u => {
    if (u >= 70) return C.red;
    if (u >= 45) return C.orange;
    if (u >= 20) return C.accent;
    return C.textDim;
  };

  const resolveColor = key => {
    if (!key) return null;
    const map = { accent: C.accent, red: C.red, orange: C.orange, green: C.green, dim: C.textDim };
    return map[key] || C.textDim;
  };

  const maxVisible = 8;

  return (
    <div style={{ fontFamily: font, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.textDim,
            fontFamily: font,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          TASKS
          {stats.active > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "#fff",
                background: stats.overdue > 0 ? C.red : C.accent,
                borderRadius: 10,
                padding: "1px 6px",
                minWidth: 16,
                textAlign: "center",
                letterSpacing: 0,
              }}
            >
              {stats.active}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        </div>
      </div>

      {/* ── Status summary bar ─────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 1,
          height: 3,
          borderRadius: 2,
          overflow: "hidden",
          marginBottom: 8,
          background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
        }}
      >
        {stats.overdue > 0 && (
          <div
            style={{ flex: stats.overdue, background: C.red, borderRadius: 2, transition: "flex 0.3s ease" }}
            title={`${stats.overdue} overdue`}
          />
        )}
        {stats.dueToday > 0 && (
          <div
            style={{ flex: stats.dueToday, background: C.orange, borderRadius: 2, transition: "flex 0.3s ease" }}
            title={`${stats.dueToday} due today`}
          />
        )}
        {stats.active - stats.overdue - stats.dueToday > 0 && (
          <div
            style={{
              flex: stats.active - stats.overdue - stats.dueToday,
              background: C.accent,
              borderRadius: 2,
              transition: "flex 0.3s ease",
            }}
            title={`${stats.active - stats.overdue - stats.dueToday} upcoming`}
          />
        )}
        {stats.done > 0 && (
          <div
            style={{ flex: stats.done, background: C.green, opacity: 0.4, borderRadius: 2, transition: "flex 0.3s ease" }}
            title={`${stats.done} done`}
          />
        )}
      </div>

      {/* ── Filter tabs ────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
        {[
          { key: "active", label: "Active", count: stats.active },
          { key: "today", label: "Today", count: stats.dueToday },
          { key: "all", label: "All", count: null },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: "2px 6px",
              fontSize: 8,
              fontWeight: filter === tab.key ? 700 : 500,
              color: filter === tab.key ? C.accent : C.textDim,
              background: filter === tab.key ? `${C.accent}12` : "transparent",
              border: "none",
              borderRadius: 3,
              cursor: "pointer",
              fontFamily: font,
              transition: "all 0.15s",
            }}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 ? ` ${tab.count}` : ""}
          </button>
        ))}
      </div>

      {/* ── Quick-add input (moved to top) ────────────────── */}
      <div style={{ marginBottom: 6, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", gap: 3 }}>
          <input
            ref={inputRef}
            type="text"
            value={quickInput}
            onChange={e => setQuickInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add task..."
            style={{
              flex: 1, padding: "4px 7px", fontSize: 9.5,
              fontFamily: font, fontWeight: 500,
              background: dk ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
              border: `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
              borderRadius: 5, color: C.text, outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = C.accent)}
            onBlur={e => (e.currentTarget.style.borderColor = dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)")}
          />
          <button
            onClick={handleQuickAdd}
            disabled={!quickInput.trim()}
            style={bt(C, {
              padding: "4px 8px", fontSize: 9, fontWeight: 600, fontFamily: font,
              background: quickInput.trim() ? C.accent : "transparent",
              color: quickInput.trim() ? "#fff" : C.textDim,
              border: quickInput.trim() ? "none" : `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
              borderRadius: 5, cursor: quickInput.trim() ? "pointer" : "default",
            })}
          >
            +
          </button>
        </div>
        {/* Due date + project assignment row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="date"
            value={quickDueDate}
            onChange={e => setQuickDueDate(e.target.value)}
            style={{
              fontSize: 8, fontFamily: font, padding: "2px 4px",
              borderRadius: 3, width: 0, flex: 1,
              border: `1px solid ${quickDueDate ? C.accent + "60" : dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
              background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              color: quickDueDate ? C.text : C.textDim, outline: "none",
            }}
          />
          {["Today", "Tmrw", "+7d"].map(label => {
            const getDate = () => {
              const d = new Date();
              if (label === "Tmrw") d.setDate(d.getDate() + 1);
              if (label === "+7d") d.setDate(d.getDate() + 7);
              return d.toISOString().split("T")[0];
            };
            const targetDate = getDate();
            const isActive = quickDueDate === targetDate;
            return (
              <button
                key={label}
                onClick={() => setQuickDueDate(isActive ? "" : targetDate)}
                style={{
                  padding: "2px 4px", fontSize: 7, fontWeight: 600,
                  color: isActive ? C.accent : C.textDim,
                  background: isActive ? `${C.accent}12` : "transparent",
                  border: "none", borderRadius: 3, cursor: "pointer",
                  fontFamily: font, transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
          {/* Project assignment */}
          <select
            value={quickProjectId}
            onChange={e => setQuickProjectId(e.target.value)}
            title="Assign to project"
            style={{
              fontSize: 8, fontFamily: font, padding: "2px 3px",
              borderRadius: 3, width: 0, flex: 1,
              border: `1px solid ${quickProjectId ? C.accent + "60" : dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
              background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              color: quickProjectId ? C.text : C.textDim, outline: "none",
            }}
          >
            <option value="">No project</option>
            {(estimatesIndex || []).filter(e => !e.deleted_at).slice(0, 20).map(e => (
              <option key={e.id} value={e.id}>{(e.name || e.projectName || "Untitled").slice(0, 25)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Task list ──────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 3 }}>
        {displayTasks.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "12px 0",
            }}
          >
            <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center" }}>
              {filter === "active"
                ? "All clear"
                : filter === "today"
                  ? "Nothing due today"
                  : "No tasks yet"}
            </div>
          </div>
        )}

        {displayTasks.slice(0, maxVisible).map(task => {
          const typeInfo = TASK_TYPES[task.type] || TASK_TYPES.action;
          const isHovered = hoveredId === task.id;
          const isExpanded = expandedId === task.id;
          const isDone = task.status === "done";
          const isOverdue = !isDone && task.dueDate && task.dueDate < todayStr;
          const statusColor = resolveColor(STATUS_COLORS[task.status]);
          const estimate = task.estimateId
            ? (estimates?.find(e => e.id === task.estimateId) ||
               estimatesIndex?.find(e => e.id === task.estimateId))
            : null;
          const dateBadge = relativeDate(task.dueDate);
          const checkProgress =
            task.checklist?.length > 0
              ? `${task.checklist.filter(c => c.done).length}/${task.checklist.length}`
              : null;
          const isEditingDate = editingDateId === task.id;

          return (
            <div
              key={task.id}
              onMouseEnter={() => setHoveredId(task.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => setExpandedId(isExpanded ? null : task.id)}
              style={{
                padding: "5px 7px",
                borderRadius: 6,
                cursor: "pointer",
                background: isHovered
                  ? dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"
                  : dk ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.02)",
                border: `1px solid ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`,
                borderLeft: statusColor
                  ? `3px solid ${statusColor}`
                  : isOverdue
                    ? `3px solid ${C.red}`
                    : `1px solid ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`,
                transition: "background 0.15s",
                opacity: isDone ? 0.5 : 1,
              }}
            >
              {/* Row 1: checkbox + title + urgency */}
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div
                  onClick={e => { e.stopPropagation(); toggleComplete(task.id); }}
                  style={{
                    width: 14, height: 14, borderRadius: 3,
                    border: `1.5px solid ${isDone ? C.green : isOverdue ? C.red : C.border}`,
                    background: isDone ? C.green : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, transition: "all 0.15s", cursor: "pointer",
                  }}
                >
                  {isDone && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3.5 6L6.5 2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: 10, flexShrink: 0 }}>{typeInfo.icon}</span>
                {PRIORITY_DOTS[task.priority] && (
                  <span style={{ fontSize: 6, flexShrink: 0 }}>{PRIORITY_DOTS[task.priority]}</span>
                )}
                <span
                  style={{
                    fontSize: 11, fontWeight: isDone ? 400 : 600,
                    color: isDone ? C.textMuted : C.text,
                    textDecoration: isDone ? "line-through" : "none",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    flex: 1, minWidth: 0, lineHeight: 1.3,
                  }}
                >
                  {task.title}
                </span>
                {!isDone && task._urgency >= 40 && (
                  <div
                    style={{
                      width: 4, height: 4, borderRadius: "50%",
                      background: urgencyColor(task._urgency), flexShrink: 0,
                      boxShadow: task._urgency >= 70 ? `0 0 6px ${C.red}` : "none",
                      animation: task._urgency >= 70 ? "pulse 2s infinite" : "none",
                    }}
                  />
                )}
                {isHovered && (
                  <div
                    onClick={e => { e.stopPropagation(); deleteTask(task.id); }}
                    style={{ fontSize: 10, color: C.textDim, cursor: "pointer", flexShrink: 0, opacity: 0.6, transition: "opacity 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                  >
                    ×
                  </div>
                )}
              </div>

              {/* Row 2: metadata */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, paddingLeft: 19 }}>
                {/* Due date badge — click to edit */}
                {dateBadge && !isEditingDate && (
                  <span
                    onClick={e => { e.stopPropagation(); setEditingDateId(task.id); }}
                    title="Click to change due date"
                    style={{
                      fontSize: 8, fontWeight: 600,
                      color: isOverdue ? C.red : task.dueDate === todayStr ? C.orange : C.textDim,
                      flexShrink: 0, cursor: "pointer",
                      borderBottom: `1px dotted ${isOverdue ? C.red : C.textDim}40`,
                    }}
                  >
                    {dateBadge}
                  </span>
                )}
                {/* No date — show "add date" on hover */}
                {!task.dueDate && !isEditingDate && isHovered && (
                  <span
                    onClick={e => { e.stopPropagation(); setEditingDateId(task.id); }}
                    style={{
                      fontSize: 7, color: C.textDim, cursor: "pointer",
                      borderBottom: `1px dotted ${C.textDim}40`,
                    }}
                  >
                    + date
                  </span>
                )}
                {/* Inline date picker */}
                {isEditingDate && (
                  <input
                    type="date"
                    autoFocus
                    defaultValue={task.dueDate || ""}
                    onClick={e => e.stopPropagation()}
                    onChange={e => handleSetDueDate(task.id, e.target.value)}
                    onBlur={() => setEditingDateId(null)}
                    onKeyDown={e => {
                      if (e.key === "Escape") setEditingDateId(null);
                    }}
                    style={{
                      fontSize: 8, fontFamily: font, fontWeight: 600,
                      padding: "1px 3px", borderRadius: 3,
                      border: `1px solid ${C.accent}`,
                      background: dk ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                      color: C.text, outline: "none", width: 95,
                    }}
                  />
                )}
                {checkProgress && (
                  <span style={{ fontSize: 8, color: C.textDim, flexShrink: 0 }}>{checkProgress}</span>
                )}
                {estimate && (
                  <span
                    onClick={e => handleNavigateContext(e, task)}
                    style={{
                      fontSize: 8, color: C.accent, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80,
                      cursor: "pointer", borderBottom: `1px dotted ${C.accent}40`,
                      transition: "color 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                    onMouseLeave={e => (e.currentTarget.style.color = C.accent)}
                    title={`Open ${estimate.name || ""}`}
                  >
                    {estimate.name || estimate.projectName || ""}
                  </span>
                )}
              </div>

              {/* Expanded: description + checklist + actions */}
              {isExpanded && (
                <div style={{ paddingLeft: 19, marginTop: 4 }}>
                  {task.description && (
                    <div style={{ fontSize: 9, color: C.textMuted, marginBottom: 4, lineHeight: 1.4, whiteSpace: "pre-line" }}>
                      {task.description}
                    </div>
                  )}
                  {task.checklist?.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 4 }}>
                      {task.checklist.map(ci => (
                        <div
                          key={ci.id}
                          onClick={e => { e.stopPropagation(); useTaskStore.getState().toggleChecklistItem(task.id, ci.id); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 4, fontSize: 9,
                            color: ci.done ? C.textDim : C.text,
                            textDecoration: ci.done ? "line-through" : "none", cursor: "pointer",
                          }}
                        >
                          <span style={{ fontSize: 8, color: ci.done ? C.green : C.textDim }}>{ci.done ? "x" : "-"}</span>
                          {ci.text}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                    {task.estimateId && (
                      <button
                        onClick={e => handleNavigateContext(e, task)}
                        style={bt(C, {
                          padding: "2px 6px", fontSize: 7, fontWeight: 600, fontFamily: font,
                          background: `${C.accent}10`, color: C.accent,
                          border: `1px solid ${C.accent}25`, borderRadius: 3, cursor: "pointer",
                        })}
                      >
                        Open Estimate →
                      </button>
                    )}
                    {!isDone && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          useTaskStore.getState().setStatus(task.id, task.status === "in-progress" ? "todo" : "in-progress");
                        }}
                        style={bt(C, {
                          padding: "2px 6px", fontSize: 7, fontWeight: 600, fontFamily: font,
                          background: task.status === "in-progress" ? `${C.accent}20` : "transparent",
                          color: task.status === "in-progress" ? C.accent : C.textDim,
                          border: `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                          borderRadius: 3, cursor: "pointer",
                        })}
                      >
                        {task.status === "in-progress" ? "Pause" : "Start"}
                      </button>
                    )}
                    {/* Quick date set from expanded view */}
                    {!isDone && !task.dueDate && (
                      <button
                        onClick={e => { e.stopPropagation(); setEditingDateId(task.id); }}
                        style={bt(C, {
                          padding: "2px 6px", fontSize: 7, fontWeight: 600, fontFamily: font,
                          background: "transparent", color: C.textDim,
                          border: `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                          borderRadius: 3, cursor: "pointer",
                        })}
                      >
                        Set Date
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {displayTasks.length > maxVisible && (
          <div style={{ fontSize: 9, color: C.textDim, textAlign: "center", padding: "4px 0" }}>
            +{displayTasks.length - maxVisible} more
          </div>
        )}
      </div>

      {/* Quick-add moved to top of widget */}
    </div>
  );
}
