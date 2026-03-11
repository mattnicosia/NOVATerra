// novaStore — Central NOVA AI state management
// Tracks what NOVA is doing across the entire app.
// All AI actions report here so the UI can show unified status.
import { create } from "zustand";

export const useNovaStore = create((set, get) => ({
  // Current emotional state — drives NovaOrb visuals everywhere
  // idle | thinking | learning | alert | affirm
  status: "idle",

  // What NOVA is currently doing (shown in header/UI)
  activity: null, // e.g. "Scanning sheet A-101..."

  // Active task metadata
  activeTask: null, // { type: "scan" | "assembly" | "import" | "map" | "rom" | "label", context: string, progress: 0-100 }

  // Notification queue — things NOVA wants to tell the user
  notifications: [], // [{ id, message, severity: "info"|"warn"|"success", timestamp, read }]

  // Session history — what NOVA has done
  history: [], // [{ action, result, timestamp }]

  // ── Actions ────────────────────────────────────────────────

  // Start a NOVA task — sets thinking state + activity text
  startTask: (type, activity) =>
    set({
      status: "thinking",
      activity,
      activeTask: { type, context: activity, progress: 0 },
    }),

  // Update progress during a task
  updateProgress: (progress, activity) =>
    set(s => ({
      activity: activity || s.activity,
      activeTask: s.activeTask ? { ...s.activeTask, progress } : null,
    })),

  // Complete a task — flash affirm, then idle
  completeTask: result => {
    const history = get().history;
    set({
      status: "affirm",
      activity: null,
      activeTask: null,
      history: [...history, { action: get().activity || "Task", result, timestamp: Date.now() }].slice(-100),
    });
    // Return to idle after affirm flash
    setTimeout(() => {
      if (get().status === "affirm") set({ status: "idle" });
    }, 1500);
  },

  // Fail a task — return to idle
  failTask: error =>
    set({
      status: "idle",
      activity: null,
      activeTask: null,
    }),

  // Set alert state (NOVA noticed something)
  setAlert: message => {
    const id = Date.now().toString(36);
    set(s => ({
      status: "alert",
      notifications: [...s.notifications, { id, message, severity: "warn", timestamp: Date.now(), read: false }].slice(
        -50,
      ),
    }));
  },

  // Push a notification without changing status
  notify: (message, severity = "info") => {
    const id = Date.now().toString(36);
    set(s => ({
      notifications: [...s.notifications, { id, message, severity, timestamp: Date.now(), read: false }].slice(-50),
    }));
  },

  // Dismiss notification
  dismissNotification: id =>
    set(s => ({
      notifications: s.notifications.filter(n => n.id !== id),
    })),

  // Reset to idle
  resetStatus: () => set({ status: "idle", activity: null, activeTask: null }),
}));
