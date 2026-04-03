import { useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useTaskStore, TASK_TYPES, BID_DAY_TEMPLATES, computeUrgency } from "@/stores/taskStore";
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

const PRIORITY_DOTS = { critical: "\u{1F534}", high: "\u{1F7E0}", medium: "", low: "" };

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
  const generateBidDayChecklist = useTaskStore(s => s.generateBidDayChecklist);

  const estimates = useEstimatesStore(s => s.estimates);
  const estimatesIndex = useEstimatesStore(s => s.estimatesIndex);
  const activeEstimateId = useUiStore(s => s.activeEstimateId);
  const showToast = useUiStore(s => s.showToast);

  const [quickInput, setQuickInput] = useState("");
  const [quickDueDate, setQuickDueDate] = useState(""); // due date for quick-add
  const [filter, setFilter] = useState("active"); // "active" | "all" | "today" | "ai"
  const [hoveredId, setHoveredId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editingDateId, setEditingDateId] = useState(null); // task id being date-edited
  const [showBidMenu, setShowBidMenu] = useState(false);
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
      ai: active.filter(t => t.aiGenerated).length,
    };
  }, [tasks, todayStr]);

  // Bidding estimates with deadlines (for bid day checklist generator)
  const biddingEstimates = useMemo(() => {
    const idx = estimatesIndex || [];
    return idx
      .filter(e => e.bidDue && (e.status === "Bidding" || e.status === "Submitted"))
      .sort((a, b) => new Date(a.bidDue) - new Date(b.bidDue))
      .slice(0, 6);
  }, [estimatesIndex]);

  const displayTasks = useMemo(() => {
    let filtered;
    switch (filter) {
      case "today":
        filtered = tasks.filter(
          t => t.status !== "done" && t.status !== "cancelled" && t.dueDate === todayStr,
        );
        break;
      case "ai":
        filtered = tasks.filter(
          t => t.status !== "done" && t.status !== "cancelled" && t.aiGenerated,
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
      estimateId: activeEstimateId || null,
    });
    setQuickInput("");
    setQuickDueDate("");
    inputRef.current?.focus();
  }, [quickInput, quickDueDate, todayStr, addTask, activeEstimateId]);

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

  // ── Bid day checklist generation ───────────────────────

  const handleGenerateBidDay = useCallback(
    (templateKey, estimate) => {
      const existing = tasks.filter(
        t => t.estimateId === estimate.id && t.tags?.includes("bid-day"),
      );
      if (existing.length > 0) {
        if (showToast) showToast(`Bid day tasks already exist for ${estimate.name || "this estimate"}`);
        setShowBidMenu(false);
        return;
      }
      const created = generateBidDayChecklist(
        templateKey,
        estimate.id,
        estimate.bidDue,
        estimate.name || estimate.projectName || "",
      );
      if (showToast) showToast(`Generated ${created.length} bid day tasks`);
      setShowBidMenu(false);
    },
    [tasks, generateBidDayChecklist, showToast],
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
          {stats.ai > 0 && (
            <span
              style={{
                fontSize: 7,
                fontWeight: 700,
                letterSpacing: 0.5,
                color: C.accent,
                background: `${C.accent}15`,
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              NOVA {stats.ai}
            </span>
          )}
          {/* Bid day checklist generator */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowBidMenu(!showBidMenu)}
              title="Generate bid day checklist"
              style={{
                width: 20,
                height: 20,
                border: `1px solid ${dk ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
                borderRadius: 4,
                background: showBidMenu ? `${C.accent}15` : "transparent",
                color: showBidMenu ? C.accent : C.textDim,
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s",
              }}
            >
              📋
            </button>
            {showBidMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 4,
                  zIndex: 50,
                  background: C.bg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  minWidth: 220,
                  maxHeight: 300,
                  overflowY: "auto",
                }}
                onClick={e => e.stopPropagation()}
              >
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: C.text,
                    marginBottom: 6,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                  }}
                >
                  Bid Day Checklist
                </div>

                {biddingEstimates.length === 0 && (
                  <div style={{ fontSize: 9, color: C.textDim, padding: "8px 0" }}>
                    No bidding estimates with due dates.
                    <br />
                    Set a bid due date on an estimate first.
                  </div>
                )}

                {biddingEstimates.map(est => {
                  const daysLeft = Math.ceil(
                    (new Date(est.bidDue) - new Date()) / 86400000,
                  );
                  const hasExisting = tasks.some(
                    t => t.estimateId === est.id && t.tags?.includes("bid-day"),
                  );
                  return (
                    <div
                      key={est.id}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 5,
                        marginBottom: 4,
                        background: dk ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                        border: `1px solid ${dk ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}`,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: C.text,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 130,
                          }}
                        >
                          {est.name || "Untitled"}
                        </span>
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 600,
                            color:
                              daysLeft <= 3 ? C.red : daysLeft <= 7 ? C.orange : C.textDim,
                          }}
                        >
                          {daysLeft <= 0
                            ? "Overdue!"
                            : daysLeft === 1
                              ? "Tomorrow"
                              : `${daysLeft}d`}
                        </span>
                      </div>
                      {hasExisting ? (
                        <div style={{ fontSize: 8, color: C.green, fontWeight: 600 }}>
                          ✓ Checklist generated
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 3 }}>
                          {Object.entries(BID_DAY_TEMPLATES).map(([key, tmpl]) => (
                            <button
                              key={key}
                              onClick={() => handleGenerateBidDay(key, est)}
                              style={bt(C, {
                                padding: "2px 6px",
                                fontSize: 7,
                                fontWeight: 600,
                                fontFamily: font,
                                background: `${C.accent}10`,
                                color: C.accent,
                                border: `1px solid ${C.accent}30`,
                                borderRadius: 3,
                                cursor: "pointer",
                              })}
                            >
                              {tmpl.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={() => setShowBidMenu(false)}
                  style={{
                    width: "100%",
                    marginTop: 4,
                    padding: "3px 0",
                    fontSize: 8,
                    color: C.textDim,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: font,
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
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
          { key: "ai", label: "NOVA", count: stats.ai },
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
      <div style={{ marginBottom: 6, display: "flex", gap: 3 }}>
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
            <span style={{ fontSize: 20, opacity: 0.5 }}>✓</span>
            <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center" }}>
              {filter === "active"
                ? "All clear"
                : filter === "today"
                  ? "Nothing due today"
                  : filter === "ai"
                    ? "No NOVA suggestions"
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
                  <span style={{ fontSize: 8, color: C.textDim, flexShrink: 0 }}>☐ {checkProgress}</span>
                )}
                {task.aiGenerated && (
                  <span
                    style={{
                      fontSize: 6, fontWeight: 800, letterSpacing: 0.5,
                      color: C.accent, background: `${C.accent}12`,
                      padding: "0px 4px", borderRadius: 2,
                    }}
                  >
                    NOVA
                  </span>
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
                          <span style={{ fontSize: 8 }}>{ci.done ? "☑" : "☐"}</span>
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
                        {task.status === "in-progress" ? "⏸ Pause" : "▶ Start"}
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
                        📅 Set Date
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
