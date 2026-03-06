import { useEffect, useRef } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useActivityTimerStore } from "@/stores/activityTimerStore";
import { useTimerSync } from "@/hooks/useTimerSync";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const IDLE_CHECK_INTERVAL_MS = 10 * 1000; // Check every 10 seconds
const MOUSE_THROTTLE_MS = 100; // Throttle mousemove to every 100ms

/**
 * useActivityTracker — Mounts in AppContent to track estimator activity.
 *
 * Responsibilities:
 * - Attach mouse/click/key listeners to document
 * - Auto-start timer when an estimate is opened
 * - Auto-pause after 5 minutes of idle
 * - Auto-resume when activity resumes after idle
 * - Pause when tab is hidden, resume when visible
 * - Finalize session and save when estimate changes or closes
 * - Coordinate with useTimerSync for cross-tab deduplication
 */
export function useActivityTracker() {
  const activeEstimateId = useEstimatesStore(s => s.activeEstimateId);
  const prevEstimateIdRef = useRef(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const lastMouseTime = useRef(0);
  const idleCheckRef = useRef(null);

  // Cross-tab sync
  useTimerSync();

  // ── Start/stop timer when estimate changes ──
  useEffect(() => {
    const prevId = prevEstimateIdRef.current;
    const store = useActivityTimerStore.getState();

    if (prevId && prevId !== activeEstimateId) {
      // Estimate changed — finalize old session and save
      const session = store.finalizeSession();
      if (session) {
        appendSessionToEstimate(prevId, session);
      }
    }

    if (activeEstimateId) {
      // Start timing the new estimate
      store.startSession(activeEstimateId);
    } else {
      // No estimate active — stop timing
      const session = store.finalizeSession();
      if (session && prevId) {
        appendSessionToEstimate(prevId, session);
      }
    }

    prevEstimateIdRef.current = activeEstimateId;
  }, [activeEstimateId]);

  // ── Activity listeners ──
  useEffect(() => {
    if (!activeEstimateId) return;

    // Click handler
    const handleClick = () => {
      const s = useActivityTimerStore.getState();
      if (s.isPaused) {
        // Resume from idle on any click
        s.resumeSession();
      }
      s.recordClick();
    };

    // Key handler
    const handleKey = () => {
      const s = useActivityTimerStore.getState();
      if (s.isPaused) {
        s.resumeSession();
      }
      s.recordActivity();
    };

    // Mouse move handler (throttled)
    const handleMouseMove = e => {
      const now = Date.now();
      if (now - lastMouseTime.current < MOUSE_THROTTLE_MS) return;
      lastMouseTime.current = now;

      const s = useActivityTimerStore.getState();
      if (s.isPaused) {
        s.resumeSession();
      }

      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      // Skip first move (no meaningful delta)
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        s.recordMouseMove(dx, dy);
      }
    };

    // Visibility change handler
    const handleVisibility = () => {
      const s = useActivityTimerStore.getState();
      if (document.hidden) {
        if (s.isRunning) {
          s.pauseSession();
        }
      } else {
        // Tab became visible — resume if paused
        if (s.isPaused && s.currentSession) {
          s.resumeSession();
        }
      }
    };

    // Before unload — finalize and save
    const handleBeforeUnload = () => {
      const s = useActivityTimerStore.getState();
      const session = s.finalizeSession();
      if (session) {
        appendSessionToEstimateSync(activeEstimateId, session);
      }
    };

    // Attach listeners
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // ── Idle check interval ──
    idleCheckRef.current = setInterval(() => {
      const s = useActivityTimerStore.getState();
      if (!s.isRunning || !s.currentSession) return;

      const idleTime = Date.now() - s.currentSession.lastActivity;
      if (idleTime >= IDLE_TIMEOUT_MS) {
        s.recordIdlePause();
        s.pauseSession();
      }
    }, IDLE_CHECK_INTERVAL_MS);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);

      if (idleCheckRef.current) {
        clearInterval(idleCheckRef.current);
        idleCheckRef.current = null;
      }
    };
  }, [activeEstimateId]);
}

/**
 * Append a completed session to the estimate's timer data.
 * This is called when a session finalizes (estimate change, idle, tab close).
 * The data will be persisted on the next auto-save cycle.
 */
function appendSessionToEstimate(estimateId, session) {
  if (!estimateId || !session) return;

  // We need to update the estimate data in-memory so the next save picks it up.
  // The timer data is stored as timerSessions[] and timerTotalMs on the project store,
  // since that's the most natural place (it's project-level metadata).
  // We use a lightweight approach: store pending sessions that usePersistence will pick up.
  const pending = useActivityTimerStore._pendingSessions || [];
  pending.push({ estimateId, session });
  useActivityTimerStore._pendingSessions = pending;
}

/**
 * Synchronous version for beforeunload — uses localStorage as a backup
 * since IndexedDB writes are async and may not complete during page unload.
 */
function appendSessionToEstimateSync(estimateId, session) {
  if (!estimateId || !session) return;

  // Store in localStorage as a backup — usePersistence will recover on next load
  try {
    const key = `bldg-timer-pending-${estimateId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    existing.push(session);
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // Best effort — page is closing
  }

  appendSessionToEstimate(estimateId, session);
}

/**
 * Get and clear pending sessions for a given estimate.
 * Called by usePersistence during save to merge timer data into the estimate blob.
 */
export function drainPendingSessions(estimateId) {
  const pending = useActivityTimerStore._pendingSessions || [];
  const forEst = pending.filter(p => p.estimateId === estimateId);
  useActivityTimerStore._pendingSessions = pending.filter(p => p.estimateId !== estimateId);

  // Also recover any sessions saved to localStorage during beforeunload
  try {
    const key = `bldg-timer-pending-${estimateId}`;
    const lsRaw = localStorage.getItem(key);
    if (lsRaw) {
      const lsSessions = JSON.parse(lsRaw);
      if (Array.isArray(lsSessions) && lsSessions.length > 0) {
        forEst.push(...lsSessions.map(s => ({ estimateId, session: s })));
      }
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }

  return forEst.map(p => p.session);
}
