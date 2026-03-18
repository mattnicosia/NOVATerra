import { create } from "zustand";
import { useAuthStore } from "@/stores/authStore";
import { useOrgStore } from "@/stores/orgStore";

/**
 * Activity Timer Store
 *
 * Tracks time spent on each estimate with engagement metrics (clicks, mouse distance).
 * Timer data is stored per-estimate inside the estimate's data blob, so it flows
 * through the existing persistence/cloud-sync pipeline.
 *
 * Key design decisions:
 * - Timer data lives IN the estimate (timerSessions[], timerTotalMs) — not separate IDB keys
 * - Sessions are per-work-period (start → idle/close). A day might have 5-10 sessions.
 * - Idle timeout: 5 minutes of zero mouse/keyboard activity → auto-pause
 * - Cross-tab: Only ONE tab times at a time (managed by useTimerSync via BroadcastChannel)
 */
export const useActivityTimerStore = create((set, get) => ({
  // ── State ──
  currentSession: null,
  // Shape: { estimateId, startTime, clicks, mouseDistance, lastActivity, idlePauses, accumulatedMs }
  // accumulatedMs tracks time from pause/resume cycles within a single session

  isRunning: false,
  isPaused: false, // true when paused by idle or cross-tab (can resume)

  // ── Actions ──

  /**
   * Start a new timing session for the given estimate.
   * Called when an estimate is opened or when this tab claims timing rights.
   */
  startSession: estimateId => {
    const current = get().currentSession;
    // If already timing this estimate, don't restart
    if (current?.estimateId === estimateId && get().isRunning) return;

    // If timing a different estimate, finalize the old session first
    if (current && current.estimateId !== estimateId) {
      get().finalizeSession();
    }

    const now = Date.now();
    set({
      currentSession: {
        estimateId,
        startTime: now,
        clicks: 0,
        mouseDistance: 0,
        lastActivity: now,
        idlePauses: 0,
        accumulatedMs: 0,
      },
      isRunning: true,
      isPaused: false,
    });
  },

  /**
   * Pause the timer (idle detection or tab switch).
   * Does NOT finalize — session can be resumed.
   */
  pauseSession: () => {
    const session = get().currentSession;
    if (!session || !get().isRunning) return;

    const now = Date.now();
    const elapsed = now - session.startTime;
    set({
      currentSession: {
        ...session,
        accumulatedMs: session.accumulatedMs + elapsed,
        startTime: now, // reset start for next resume
      },
      isRunning: false,
      isPaused: true,
    });
  },

  /**
   * Resume after idle or tab switch.
   */
  resumeSession: () => {
    const session = get().currentSession;
    if (!session || get().isRunning) return;

    set({
      currentSession: {
        ...session,
        startTime: Date.now(),
        lastActivity: Date.now(),
      },
      isRunning: true,
      isPaused: false,
    });
  },

  /**
   * Record a click event.
   */
  recordClick: () => {
    const session = get().currentSession;
    if (!session) return;
    set({
      currentSession: {
        ...session,
        clicks: session.clicks + 1,
        lastActivity: Date.now(),
      },
    });
  },

  /**
   * Record mouse movement distance.
   * PERF: Accepts pre-computed distance (batched from useActivityTracker).
   * Called at most every 2s — not on every mousemove.
   */
  recordMouseMove: dist => {
    const session = get().currentSession;
    if (!session || dist <= 0) return;
    set({
      currentSession: {
        ...session,
        mouseDistance: session.mouseDistance + dist,
        lastActivity: Date.now(),
      },
    });
  },

  /**
   * Record any activity (resets idle timer without incrementing metrics).
   */
  recordActivity: () => {
    const session = get().currentSession;
    if (!session) return;
    set({
      currentSession: {
        ...session,
        lastActivity: Date.now(),
      },
    });
  },

  /**
   * Record an idle pause (for metrics).
   */
  recordIdlePause: () => {
    const session = get().currentSession;
    if (!session) return;
    set({
      currentSession: {
        ...session,
        idlePauses: (session.idlePauses || 0) + 1,
      },
    });
  },

  /**
   * Finalize the current session — returns the completed session object
   * to be appended to the estimate's timerSessions array.
   * Returns null if no session to finalize.
   */
  finalizeSession: () => {
    const session = get().currentSession;
    if (!session) return null;

    const now = Date.now();
    const runningMs = get().isRunning ? now - session.startTime : 0;
    const totalMs = session.accumulatedMs + runningMs;

    // Skip tiny sessions (< 5 seconds) — likely just page transitions
    if (totalMs < 5000) {
      set({ currentSession: null, isRunning: false, isPaused: false });
      return null;
    }

    const user = useAuthStore.getState().user;
    const membership = useOrgStore.getState().membership;

    const completedSession = {
      date: new Date().toISOString().split("T")[0],
      startTime: now - totalMs,
      endTime: now,
      durationMs: totalMs,
      clicks: session.clicks,
      mouseDistancePx: Math.round(session.mouseDistance),
      idlePauses: session.idlePauses || 0,
      estimatorId: user?.id || null,
      estimatorName: membership?.display_name || user?.email?.split("@")[0] || "Unknown",
    };

    set({ currentSession: null, isRunning: false, isPaused: false });

    return completedSession;
  },

  /**
   * Get the current elapsed time in ms (for display).
   * Includes accumulated time from pause/resume cycles + current running segment.
   */
  getElapsedMs: () => {
    const session = get().currentSession;
    if (!session) return 0;
    const runningMs = get().isRunning ? Date.now() - session.startTime : 0;
    return session.accumulatedMs + runningMs;
  },

  /**
   * Stop timing entirely (estimate closed, navigated away).
   * Finalizes and returns the session.
   */
  stopSession: () => {
    return get().finalizeSession();
  },
}));
