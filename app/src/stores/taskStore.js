import { create } from "zustand";
import { uid, today } from "@/utils/format";

/* NOTE: scheduleStore was consolidated into this file (Phase 3 tech debt).
   Schedule state is prefixed with `sched` to avoid name collisions. */

/* ────────────────────────────────────────────────────────
   taskStore — intelligent task management for NOVATerra

   Rich task model with urgency scoring, context binding,
   and NOVA AI integration hooks.
   ──────────────────────────────────────────────────────── */

// ── Task type definitions ────────────────────────────────
// action: manual one-off action
// scope-gap: NOVA-detected missing scope item
// rfi: RFI to issue or respond to
// bid-prep: bid day preparation checklist item
// review: drawing/estimate review
// follow-up: correspondence follow-up
// deadline: milestone with hard due date
// procurement: buyout / material ordering

export const TASK_TYPES = {
  action:      { label: "Action",      icon: "⚡", color: null },
  "scope-gap": { label: "Scope Gap",   icon: "🔍", color: "#F59E0B" },
  rfi:         { label: "RFI",         icon: "❓", color: "#6366F1" },
  "bid-prep":  { label: "Bid Prep",    icon: "📋", color: "#EF4444" },
  review:      { label: "Review",      icon: "👁", color: "#10B981" },
  "follow-up": { label: "Follow-up",   icon: "↩",  color: "#8B5CF6" },
  deadline:    { label: "Deadline",     icon: "🎯", color: "#DC2626" },
  procurement: { label: "Procurement",  icon: "📦", color: "#0EA5E9" },
};

export const TASK_STATUSES = ["todo", "in-progress", "blocked", "waiting", "done", "cancelled"];

export const TASK_PRIORITIES = ["critical", "high", "medium", "low"];

// ── Urgency scoring ──────────────────────────────────────
// Real-time urgency score: 0–100, accounts for due date proximity,
// priority weight, task type, and staleness.

export function computeUrgency(task) {
  if (!task || task.status === "done" || task.status === "cancelled") return 0;

  let score = 0;
  const now = Date.now();

  // Due date proximity (0-50 pts)
  if (task.dueDate) {
    const due = new Date(task.dueDate).getTime();
    const hoursLeft = (due - now) / 3600000;
    if (hoursLeft < 0) score += 50;              // overdue
    else if (hoursLeft < 4) score += 45;         // < 4 hours
    else if (hoursLeft < 24) score += 35;        // today
    else if (hoursLeft < 48) score += 25;        // tomorrow
    else if (hoursLeft < 168) score += 15;       // this week
    else score += 5;
  }

  // Priority weight (0-30 pts)
  const pMap = { critical: 30, high: 20, medium: 10, low: 3 };
  score += pMap[task.priority] || 10;

  // Task type weight (0-10 pts) — bid-prep and deadlines score higher
  const tMap = { "bid-prep": 10, deadline: 10, "scope-gap": 8, rfi: 7, procurement: 6 };
  score += tMap[task.type] || 4;

  // Staleness — tasks sitting idle gain urgency (0-10 pts)
  if (task.createdAt) {
    const daysOld = (now - new Date(task.createdAt).getTime()) / 86400000;
    score += Math.min(10, Math.floor(daysOld / 2));
  }

  // Blocked/waiting penalty — reduce urgency slightly (can't act on it)
  if (task.status === "blocked") score -= 10;
  if (task.status === "waiting") score -= 5;

  return Math.max(0, Math.min(100, score));
}

// ── Default task factory ─────────────────────────────────

function createTask(partial = {}) {
  return {
    id: uid(),
    title: partial.title || "",
    description: partial.description || "",
    type: partial.type || "action",
    status: partial.status || "todo",
    priority: partial.priority || "medium",
    dueDate: partial.dueDate || null,           // ISO date string "2026-04-05"
    dueTime: partial.dueTime || null,           // "14:00"
    tags: partial.tags || [],

    // Context binding — click to navigate
    estimateId: partial.estimateId || null,
    drawingId: partial.drawingId || null,
    correspondenceId: partial.correspondenceId || null,
    takeoffId: partial.takeoffId || null,
    divisionCode: partial.divisionCode || null, // CSI division

    // AI metadata
    aiGenerated: partial.aiGenerated || false,
    aiSource: partial.aiSource || null,         // "scope-gap", "bid-checklist", "nova"
    aiConfidence: partial.aiConfidence || null,  // 0-1

    // Checklist sub-items
    checklist: partial.checklist || [],         // [{ id, text, done }]

    // Timestamps
    createdAt: partial.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: partial.completedAt || null,
  };
}

// ── Bid day checklist templates ──────────────────────────
// Battle-tested from real GC estimating workflows.
// Each template generates tasks relative to a bid due date.

export const BID_DAY_TEMPLATES = {
  gc: {
    label: "GC Bid Day",
    description: "General contractor bid submission prep",
    tasks: [
      // Week before
      { title: "Confirm all sub bids received or chase missing trades", daysBeforeDue: 7, priority: "high", type: "bid-prep" },
      { title: "Verify plan addenda — all subs on latest rev", daysBeforeDue: 7, priority: "high", type: "review" },
      { title: "Run NOVA scope gap check on all packages", daysBeforeDue: 7, priority: "high", type: "scope-gap" },
      { title: "Confirm insurance/bonding capacity", daysBeforeDue: 5, priority: "medium", type: "bid-prep" },
      // 3 days before
      { title: "Level sub bids — apples to apples", daysBeforeDue: 3, priority: "critical", type: "bid-prep" },
      { title: "Complete GC general conditions estimate", daysBeforeDue: 3, priority: "high", type: "bid-prep" },
      { title: "Draft exclusions list", daysBeforeDue: 3, priority: "high", type: "bid-prep" },
      { title: "Price GC self-performed work", daysBeforeDue: 3, priority: "high", type: "bid-prep" },
      // Day before
      { title: "Final sub bid selection — plug numbers", daysBeforeDue: 1, priority: "critical", type: "bid-prep" },
      { title: "Calculate overhead, profit, insurance markup", daysBeforeDue: 1, priority: "critical", type: "bid-prep" },
      { title: "Review alternates — price add/deducts", daysBeforeDue: 1, priority: "high", type: "bid-prep" },
      { title: "Draft proposal letter / cover page", daysBeforeDue: 1, priority: "medium", type: "bid-prep" },
      { title: "Prepare bid bond (if required)", daysBeforeDue: 1, priority: "high", type: "bid-prep" },
      // Bid day
      { title: "Morning: last-minute sub bid updates", daysBeforeDue: 0, priority: "critical", type: "bid-prep" },
      { title: "Final number review — sanity check $/SF", daysBeforeDue: 0, priority: "critical", type: "review" },
      { title: "Print/compile bid package", daysBeforeDue: 0, priority: "critical", type: "bid-prep" },
      { title: "Submit bid before deadline", daysBeforeDue: 0, priority: "critical", type: "deadline" },
      // After
      { title: "Send thank-you to subcontractors who bid", daysBeforeDue: -1, priority: "medium", type: "follow-up" },
      { title: "Log final bid number in CORE", daysBeforeDue: -1, priority: "medium", type: "action" },
    ],
  },
  sub: {
    label: "Sub Bid Day",
    description: "Subcontractor trade-specific bid prep",
    tasks: [
      { title: "Verify takeoff quantities are complete", daysBeforeDue: 5, priority: "high", type: "review" },
      { title: "Get material pricing from vendors", daysBeforeDue: 5, priority: "high", type: "procurement" },
      { title: "Check labor rates — prevailing wage?", daysBeforeDue: 5, priority: "medium", type: "bid-prep" },
      { title: "Review all addenda for scope changes", daysBeforeDue: 3, priority: "high", type: "review" },
      { title: "Calculate production rates and crew costs", daysBeforeDue: 3, priority: "high", type: "bid-prep" },
      { title: "Draft inclusions/exclusions/clarifications", daysBeforeDue: 2, priority: "high", type: "bid-prep" },
      { title: "Price alternates", daysBeforeDue: 2, priority: "medium", type: "bid-prep" },
      { title: "Final number — apply markup", daysBeforeDue: 1, priority: "critical", type: "bid-prep" },
      { title: "Format proposal on letterhead", daysBeforeDue: 1, priority: "medium", type: "bid-prep" },
      { title: "Submit bid to GC(s)", daysBeforeDue: 0, priority: "critical", type: "deadline" },
      { title: "Follow up with GC — confirm receipt", daysBeforeDue: -1, priority: "medium", type: "follow-up" },
    ],
  },
  design_build: {
    label: "Design-Build",
    description: "Design-build / negotiated project prep",
    tasks: [
      { title: "Coordinate with architect on design progress", daysBeforeDue: 14, priority: "high", type: "follow-up" },
      { title: "Price based on current design (may be incomplete)", daysBeforeDue: 10, priority: "high", type: "bid-prep" },
      { title: "Identify design assumptions and allowances", daysBeforeDue: 10, priority: "high", type: "scope-gap" },
      { title: "Get preliminary sub pricing", daysBeforeDue: 7, priority: "high", type: "bid-prep" },
      { title: "Draft qualifications and assumptions letter", daysBeforeDue: 5, priority: "high", type: "bid-prep" },
      { title: "Build preliminary schedule", daysBeforeDue: 5, priority: "medium", type: "bid-prep" },
      { title: "Internal estimate review — check assumptions", daysBeforeDue: 3, priority: "critical", type: "review" },
      { title: "Format GMP / budget proposal", daysBeforeDue: 2, priority: "high", type: "bid-prep" },
      { title: "Submit proposal", daysBeforeDue: 0, priority: "critical", type: "deadline" },
    ],
  },
};

// Generate bid day tasks from a template for a specific estimate
export function generateBidDayTasks(templateKey, estimateId, bidDueDate, estimateName) {
  const template = BID_DAY_TEMPLATES[templateKey];
  if (!template || !bidDueDate) return [];

  const dueDate = new Date(bidDueDate);

  return template.tasks.map(t => {
    const taskDate = new Date(dueDate);
    taskDate.setDate(taskDate.getDate() - t.daysBeforeDue);
    const dateStr = taskDate.toISOString().split("T")[0];

    return {
      title: t.title,
      type: t.type,
      priority: t.priority,
      dueDate: dateStr,
      estimateId,
      aiGenerated: true,
      aiSource: "bid-checklist",
      aiConfidence: 1,
      tags: ["bid-day", templateKey],
      description: estimateName ? `For: ${estimateName}` : "",
    };
  });
}

// Generate tasks from scope gap detection results
export function generateScopeGapTasks(gaps, estimateId, estimateName) {
  if (!gaps || !Array.isArray(gaps)) return [];
  return gaps.map(gap => ({
    title: `Missing scope: ${gap.description || gap.division || "Unknown"}`,
    type: "scope-gap",
    priority: gap.exposure > 50000 ? "critical" : gap.exposure > 10000 ? "high" : "medium",
    estimateId,
    divisionCode: gap.division || null,
    aiGenerated: true,
    aiSource: "scope-gap",
    aiConfidence: gap.confidence || 0.8,
    description: [
      estimateName ? `Project: ${estimateName}` : "",
      gap.division ? `Division ${gap.division}` : "",
      gap.exposure ? `Est. exposure: $${Math.round(gap.exposure).toLocaleString()}` : "",
      gap.recommendation || "",
    ]
      .filter(Boolean)
      .join("\n"),
    tags: ["scope-gap", gap.division].filter(Boolean),
  }));
}

// ── Store ────────────────────────────────────────────────

export const useTaskStore = create((set, get) => ({
  tasks: [],

  // ── Quick-add parsing state ──
  quickAddInput: "",
  setQuickAddInput: v => set({ quickAddInput: v }),

  // ── CRUD ──────────────────────────────────────────────

  addTask: (partial = {}) => {
    const task = createTask(partial);
    set(s => ({ tasks: [...s.tasks, task] }));
    return task;
  },

  updateTask: (id, updates) => {
    set(s => ({
      tasks: s.tasks.map(t =>
        t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t,
      ),
    }));
  },

  deleteTask: id => {
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }));
  },

  // ── Status transitions ────────────────────────────────

  toggleComplete: id => {
    set(s => ({
      tasks: s.tasks.map(t => {
        if (t.id !== id) return t;
        const done = t.status !== "done";
        return {
          ...t,
          status: done ? "done" : "todo",
          completedAt: done ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  },

  setStatus: (id, status) => {
    set(s => ({
      tasks: s.tasks.map(t =>
        t.id === id
          ? {
              ...t,
              status,
              completedAt: status === "done" ? new Date().toISOString() : t.completedAt,
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    }));
  },

  // ── Checklist management ──────────────────────────────

  addChecklistItem: (taskId, text) => {
    set(s => ({
      tasks: s.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          checklist: [...t.checklist, { id: uid(), text, done: false }],
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  },

  toggleChecklistItem: (taskId, itemId) => {
    set(s => ({
      tasks: s.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          checklist: t.checklist.map(ci => (ci.id === itemId ? { ...ci, done: !ci.done } : ci)),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  },

  // ── Batch operations ──────────────────────────────────

  addTasks: (partials = []) => {
    const tasks = partials.map(p => createTask(p));
    set(s => ({ tasks: [...s.tasks, ...tasks] }));
    return tasks;
  },

  clearCompleted: () => {
    set(s => ({ tasks: s.tasks.filter(t => t.status !== "done" && t.status !== "cancelled") }));
  },

  // ── Bid day checklist generation ───────────────────────

  generateBidDayChecklist: (templateKey, estimateId, bidDueDate, estimateName) => {
    const partials = generateBidDayTasks(templateKey, estimateId, bidDueDate, estimateName);
    if (partials.length === 0) return [];
    const tasks = partials.map(p => createTask(p));
    set(s => ({ tasks: [...s.tasks, ...tasks] }));
    return tasks;
  },

  // ── Scope gap → tasks ────────────────────────────────

  generateScopeGapTasksForEstimate: (gaps, estimateId, estimateName) => {
    const partials = generateScopeGapTasks(gaps, estimateId, estimateName);
    if (partials.length === 0) return [];
    const tasks = partials.map(p => createTask(p));
    set(s => ({ tasks: [...s.tasks, ...tasks] }));
    return tasks;
  },

  // ── Bulk set (persistence restore) ────────────────────

  setTasks: tasks => set({ tasks: Array.isArray(tasks) ? tasks : [] }),

  // ── Selectors (computed) ──────────────────────────────

  getActiveTasks: () => {
    const { tasks } = get();
    return tasks
      .filter(t => t.status !== "done" && t.status !== "cancelled")
      .map(t => ({ ...t, _urgency: computeUrgency(t) }))
      .sort((a, b) => b._urgency - a._urgency);
  },

  getTasksByEstimate: estimateId => {
    const { tasks } = get();
    return tasks.filter(t => t.estimateId === estimateId);
  },

  getOverdueTasks: () => {
    const { tasks } = get();
    const nowStr = today();
    return tasks.filter(
      t => t.status !== "done" && t.status !== "cancelled" && t.dueDate && t.dueDate < nowStr,
    );
  },

  getDueTodayTasks: () => {
    const { tasks } = get();
    const todayStr = today();
    return tasks.filter(
      t => t.status !== "done" && t.status !== "cancelled" && t.dueDate === todayStr,
    );
  },

  getStats: () => {
    const { tasks } = get();
    const active = tasks.filter(t => t.status !== "done" && t.status !== "cancelled");
    const todayStr = today();
    return {
      total: tasks.length,
      active: active.length,
      overdue: active.filter(t => t.dueDate && t.dueDate < todayStr).length,
      dueToday: active.filter(t => t.dueDate === todayStr).length,
      blocked: active.filter(t => t.status === "blocked").length,
      completed: tasks.filter(t => t.status === "done").length,
      aiGenerated: active.filter(t => t.aiGenerated).length,
    };
  },

  // ── Schedule / Gantt (was scheduleStore) ───────────────
  schedActivities: [],
  schedProjectStartDate: today(),
  schedWorkDaysPerWeek: 5,
  schedTradeOverrides: {},
  schedZones: ["Zone 1"],
  schedViewMode: "gantt",
  schedSelectedActivityId: null,
  schedGenerated: false,
  schedGenerating: false,

  setSchedActivities: v => set({ schedActivities: v, schedGenerated: true, schedGenerating: false }),
  setSchedProjectStartDate: v => set({ schedProjectStartDate: v }),
  setSchedWorkDaysPerWeek: v => set({ schedWorkDaysPerWeek: v }),
  setSchedViewMode: v => set({ schedViewMode: v }),
  setSchedSelectedActivityId: v => set({ schedSelectedActivityId: v }),
  setSchedZones: v => set({ schedZones: v }),
  setSchedGenerating: v => set({ schedGenerating: v }),

  setSchedTradeOverride: (tradeKey, field, value) => set(s => ({
    schedTradeOverrides: {
      ...s.schedTradeOverrides,
      [tradeKey]: { ...(s.schedTradeOverrides[tradeKey] || {}), [field]: value },
    },
  })),
  clearSchedTradeOverride: tradeKey => set(s => {
    const next = { ...s.schedTradeOverrides };
    delete next[tradeKey];
    return { schedTradeOverrides: next };
  }),

  addSchedZone: label => set(s => ({ schedZones: [...s.schedZones, label] })),
  removeSchedZone: idx => set(s => ({ schedZones: s.schedZones.filter((_, i) => i !== idx) })),
  renameSchedZone: (idx, label) => set(s => ({ schedZones: s.schedZones.map((z, i) => i === idx ? label : z) })),

  getSchedSelectedActivity: () => {
    const { schedActivities, schedSelectedActivityId } = get();
    return schedActivities.find(a => a.id === schedSelectedActivityId) || null;
  },
  getSchedProjectEndDay: () => {
    const { schedActivities } = get();
    if (schedActivities.length === 0) return 0;
    return Math.max(...schedActivities.map(a => a.earlyFinish || 0));
  },
  getSchedCriticalPathLength: () => {
    const { schedActivities } = get();
    return schedActivities.filter(a => a.isCritical).reduce((s, a) => s + a.duration, 0);
  },
  resetSchedule: () => set({
    schedActivities: [], schedProjectStartDate: today(), schedWorkDaysPerWeek: 5,
    schedTradeOverrides: {}, schedZones: ["Zone 1"], schedViewMode: "gantt",
    schedSelectedActivityId: null, schedGenerated: false, schedGenerating: false,
  }),
}));
