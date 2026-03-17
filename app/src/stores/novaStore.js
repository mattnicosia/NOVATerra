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

  // v15: Sphere crystallization — driven by scan/task progress
  // null = auto mode (Hodgin temporal layers run freely)
  // 0-1  = manual override (scan pipeline drives crystallize proportional to progress)
  crystallize: null,

  // ── Actions ────────────────────────────────────────────────

  // Start a NOVA task — sets thinking state + activity text + begins crystallization
  startTask: (type, activity) =>
    set({
      status: "thinking",
      activity,
      activeTask: { type, context: activity, progress: 0 },
      crystallize: 0.08, // Subtle initial crystal formation
    }),

  // Update progress during a task — crystallize scales with progress
  updateProgress: (progress, activity) =>
    set(s => ({
      activity: activity || s.activity,
      activeTask: s.activeTask ? { ...s.activeTask, progress } : null,
      // Crystallize ramps from 0.08 → 0.55 across 0-100% progress
      // Cubic ramp: more crystal formation in later phases (ROM generation)
      crystallize: s.activeTask ? 0.08 + (progress / 100) * (progress / 100) * 0.47 : s.crystallize,
    })),

  // Complete a task — flash-freeze crystal moment, then release to auto
  completeTask: result => {
    const history = get().history;
    set({
      status: "affirm",
      activity: null,
      activeTask: null,
      crystallize: 0.65, // Peak crystallization at completion flash
      history: [...history, { action: get().activity || "Task", result, timestamp: Date.now() }].slice(-100),
    });
    // Return to idle + release crystallize to auto after affirm flash
    setTimeout(() => {
      if (get().status === "affirm") set({ status: "idle", crystallize: null });
    }, 1500);
  },

  // Fail a task — return to idle, release crystallize
  failTask: _error =>
    set({
      status: "idle",
      activity: null,
      activeTask: null,
      crystallize: null,
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
