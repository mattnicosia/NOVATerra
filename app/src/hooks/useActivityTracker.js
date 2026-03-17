import { useEffect, useRef } from "react";
import { useEstimatesStore } from "@/stores/estimatesStore";
import { useActivityTimerStore } from "@/stores/activityTimerStore";
import { useTimerSync } from "@/hooks/useTimerSync";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const _IDLE_CHECK_INTERVAL_MS = 10 * 1000; // Check every 10 seconds
const MOUSE_THROTTLE_MS = 2000; // Only flush mouse metrics to Zustand every 2s
const ACTIVITY_THROTTLE_MS = 5000; // Only update lastActivity every 5s

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
  // PERF FIX: Accumulate mouse distance in a plain ref, only flush to Zustand
  // store every 2s. The old code called set() 10x/sec creating new objects.
  const mouseDeltaRef = useRef(0); // accumulated distance since last flush
  const _lastFlushTime = useRef(0);
  const lastActivityFlush = useRef(0);

  useEffect(() => {
    if (!activeEstimateId) return;

    // Click handler — only resumes + increments click counter (infrequent)
    const handleClick = () => {
      const s = useActivityTimerStore.getState();
      if (s.isPaused) {
        s.resumeSession();
      }
      s.recordClick();
    };

    // Key handler — just update lastActivity, heavily throttled
    const handleKey = () => {
      const s = useActivityTimerStore.getState();
      if (s.isPaused) {
        s.resumeSession();
        return; // resumeSession already updates lastActivity
      }
      // Throttle lastActivity updates to every 5s
      const now = Date.now();
      if (now - lastActivityFlush.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityFlush.current = now;
      s.recordActivity();
    };

    // Mouse move handler — NO Zustand writes on hot path
    // Only accumulates distance in a plain JS ref. Flushed by interval below.
    const handleMouseMove = e => {
      // Resume from idle (rare path — only when isPaused)
      const s = useActivityTimerStore.getState();
      if (s.isPaused) {
        s.resumeSession();
      }

      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current.x = e.clientX;
      lastMousePos.current.y = e.clientY;

      // Accumulate distance in ref (no Zustand set() call — zero overhead)
      if (dx !== 0 || dy !== 0) {
        mouseDeltaRef.current += Math.sqrt(dx * dx + dy * dy);
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

    // Attach listeners — mousemove is passive (no preventDefault needed)
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // ── Combined idle check + mouse flush interval (every 2s) ──
    // PERF FIX: Replaces the old 100ms mousemove → Zustand set() pattern.
    // Now mouse distance accumulates in a plain ref and flushes here.
    idleCheckRef.current = setInterval(() => {
      const s = useActivityTimerStore.getState();
      if (!s.isRunning || !s.currentSession) return;

      // Flush accumulated mouse distance to store (batched)
      const dist = mouseDeltaRef.current;
      if (dist > 0) {
        mouseDeltaRef.current = 0;
        s.recordMouseMove(dist, 0); // single set() call for all accumulated distance
      }

      // Idle detection
      const idleTime = Date.now() - s.currentSession.lastActivity;
      if (idleTime >= IDLE_TIMEOUT_MS) {
        s.recordIdlePause();
        s.pauseSession();
      }
    }, MOUSE_THROTTLE_MS);

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
 * Peek at pending sessions without removing them.
 * Used to include sessions in save data before the write is confirmed.
 */
export function peekPendingSessions(estimateId) {
  const pending = useActivityTimerStore._pendingSessions || [];
  const forEst = pending.filter(p => p.estimateId === estimateId);

  // Also peek at localStorage recovery sessions (don't remove yet)
  try {
    const key = `bldg-timer-pending-${estimateId}`;
    const lsRaw = localStorage.getItem(key);
    if (lsRaw) {
      const lsSessions = JSON.parse(lsRaw);
      if (Array.isArray(lsSessions) && lsSessions.length > 0) {
        forEst.push(...lsSessions.map(s => ({ estimateId, session: s })));
      }
    }
  } catch {
    // ignore
  }

  return forEst.map(p => p.session);
}

/**
 * Get and clear pending sessions for a given estimate.
 * Called by usePersistence AFTER confirmed IDB write to remove drained sessions.
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
