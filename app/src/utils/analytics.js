/**
 * analytics — Lightweight event tracking for beta usage analytics
 *
 * Sprint 5.3: Captures key user actions for understanding beta usage patterns.
 * Events are batched and stored in localStorage, then pushed to Supabase
 * on a timer (every 60s) or on page unload.
 *
 * No external analytics SDK required — can be swapped for PostHog/Mixpanel later.
 *
 * Usage:
 *   import { track } from "@/utils/analytics";
 *   track("estimate_created", { estimateId: id, source: "dashboard" });
 */

const BATCH_KEY = "nova_analytics_batch";
const FLUSH_INTERVAL = 60_000; // 60 seconds
const MAX_BATCH_SIZE = 200;

let batch = [];
let flushTimer = null;

// Initialize batch from localStorage (in case of crash recovery)
try {
  const stored = JSON.parse(localStorage.getItem(BATCH_KEY) || "[]");
  if (Array.isArray(stored)) batch = stored;
} catch {
  batch = [];
}

/**
 * Track an event with optional properties.
 */
export function track(event, properties = {}) {
  try {
    batch.push({
      event,
      properties,
      timestamp: new Date().toISOString(),
      page: window.location.pathname,
      screen: `${window.innerWidth}x${window.innerHeight}`,
    });

    // Persist to localStorage
    if (batch.length > MAX_BATCH_SIZE) {
      batch = batch.slice(-MAX_BATCH_SIZE);
    }
    localStorage.setItem(BATCH_KEY, JSON.stringify(batch));

    // Auto-start flush timer
    if (!flushTimer) {
      flushTimer = setInterval(flush, FLUSH_INTERVAL);
    }
  } catch {
    // Silent fail — analytics should never break the app
  }
}

/**
 * Flush batched events to Supabase (or just clear if no connection).
 */
async function flush() {
  if (batch.length === 0) return;

  const toSend = [...batch];
  batch = [];
  localStorage.setItem(BATCH_KEY, "[]");

  try {
    // Dynamic import to avoid loading Supabase in the critical path
    const { supabase } = await import("@/utils/supabase");
    await supabase.from("beta_analytics").insert(
      toSend.map(e => ({
        event: e.event,
        properties: e.properties,
        page: e.page,
        screen: e.screen,
        created_at: e.timestamp,
      })),
    );
  } catch {
    // Re-queue failed events
    batch = [...toSend, ...batch].slice(-MAX_BATCH_SIZE);
    localStorage.setItem(BATCH_KEY, JSON.stringify(batch));
  }
}

// Flush on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (batch.length > 0) {
      localStorage.setItem(BATCH_KEY, JSON.stringify(batch));
    }
  });
}

/**
 * Pre-defined event names for consistency.
 */
export const EVENTS = {
  // Estimates
  ESTIMATE_CREATED: "estimate_created",
  ESTIMATE_OPENED: "estimate_opened",
  ESTIMATE_EXPORTED: "estimate_exported",

  // Scans
  SCAN_STARTED: "scan_started",
  SCAN_COMPLETED: "scan_completed",
  SCAN_SCHEDULES_FOUND: "scan_schedules_found",

  // NOVA
  NOVA_SUGGESTION_ACCEPTED: "nova_suggestion_accepted",
  NOVA_SUGGESTION_REJECTED: "nova_suggestion_rejected",
  NOVA_PREDICTIONS_APPLIED: "nova_predictions_applied",

  // Plans
  PLAN_UPLOADED: "plan_uploaded",
  DRAWING_OVERLAY_USED: "drawing_overlay_used",

  // Navigation
  PAGE_VIEW: "page_view",
  FEATURE_USED: "feature_used",

  // Beta
  FEEDBACK_SUBMITTED: "feedback_submitted",
  ONBOARDING_COMPLETED: "onboarding_completed",
  ONBOARDING_SKIPPED: "onboarding_skipped",
};
