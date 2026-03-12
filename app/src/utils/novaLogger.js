/**
 * NOVA Logger — Centralized error tracking with Sentry integration
 *
 * Replaces scattered console.warn/error calls with structured logging
 * that sends breadcrumbs and events to Sentry with proper categorization.
 *
 * Categories map to Sentry tags for dashboarding:
 *   - data:sync       → Cloud sync operations
 *   - data:idb        → IndexedDB read/write
 *   - data:orphan     → Orphaned index entries
 *   - data:migration  → Solo→org, blob migrations
 *   - data:conflict   → Merge conflicts between devices
 *   - estimate:load   → Estimate loading pipeline
 *   - estimate:save   → Auto-save operations
 *   - ocr:pipeline    → OCR and scan operations
 *   - ocr:circuit     → OCR circuit breaker events
 *   - auth:session    → Authentication / session issues
 *   - collab:lock     → Estimate locking / collaboration
 *   - collab:presence → Real-time presence
 */

import * as Sentry from "@sentry/react";

// Severity levels
const LEVEL = { DEBUG: "debug", INFO: "info", WARN: "warning", ERROR: "error", FATAL: "fatal" };

// In-memory ring buffer for recent events (useful for debug dumps)
const RING_SIZE = 200;
const _ring = [];

function pushRing(entry) {
  _ring.push(entry);
  if (_ring.length > RING_SIZE) _ring.shift();
}

/**
 * Structured log entry
 * @param {string} category - e.g. "data:sync", "estimate:load"
 * @param {string} level - "debug" | "info" | "warning" | "error" | "fatal"
 * @param {string} message - Human-readable message
 * @param {object} [data] - Extra context (merged into Sentry breadcrumb/event)
 */
function log(category, level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const entry = { timestamp, category, level, message, ...data };
  pushRing(entry);

  // Console output (always, for local debugging)
  const prefix = `[NOVA:${category}]`;
  if (level === LEVEL.ERROR || level === LEVEL.FATAL) {
    console.error(prefix, message, data);
  } else if (level === LEVEL.WARN) {
    console.warn(prefix, message, data);
  } else if (level === LEVEL.DEBUG) {
    // Debug only in development
    if (import.meta.env.DEV) console.debug(prefix, message, data);
    return; // Don't send debug to Sentry
  } else {
    console.log(prefix, message, data);
  }

  // Sentry breadcrumb (for all non-debug levels)
  Sentry.addBreadcrumb({
    category,
    message,
    level,
    data: sanitizeForSentry(data),
    timestamp: Date.now() / 1000,
  });

  // For errors/fatals, also capture a Sentry event
  if (level === LEVEL.ERROR || level === LEVEL.FATAL) {
    Sentry.withScope(scope => {
      scope.setTag("nova.category", category);
      scope.setLevel(level);
      for (const [k, v] of Object.entries(sanitizeForSentry(data))) {
        scope.setExtra(k, v);
      }
      if (data.error instanceof Error) {
        Sentry.captureException(data.error);
      } else {
        Sentry.captureMessage(`${category}: ${message}`, level);
      }
    });
  }
}

// Strip large data (blobs, full estimate objects) before sending to Sentry
function sanitizeForSentry(data) {
  const clean = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === "error" && v instanceof Error) {
      clean.errorMessage = v.message;
      clean.errorStack = v.stack?.slice(0, 500);
    } else if (typeof v === "string" && v.length > 500) {
      clean[k] = v.slice(0, 500) + "…";
    } else if (v && typeof v === "object" && !(v instanceof Error)) {
      try {
        const json = JSON.stringify(v);
        clean[k] = json.length > 500 ? json.slice(0, 500) + "…" : v;
      } catch {
        clean[k] = "[unserializable]";
      }
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

// ── Convenience methods ──

/** Data sync operations */
export const sync = {
  info: (msg, data) => log("data:sync", LEVEL.INFO, msg, data),
  warn: (msg, data) => log("data:sync", LEVEL.WARN, msg, data),
  error: (msg, data) => log("data:sync", LEVEL.ERROR, msg, data),
  conflict: (msg, data) => log("data:conflict", LEVEL.WARN, msg, { ...data, isConflict: true }),
};

/** IndexedDB operations */
export const idb = {
  info: (msg, data) => log("data:idb", LEVEL.INFO, msg, data),
  warn: (msg, data) => log("data:idb", LEVEL.WARN, msg, data),
  error: (msg, data) => log("data:idb", LEVEL.ERROR, msg, data),
};

/** Orphan detection */
export const orphan = {
  warn: (msg, data) => log("data:orphan", LEVEL.WARN, msg, data),
  error: (msg, data) => log("data:orphan", LEVEL.ERROR, msg, data),
  cleaned: (count, ids) =>
    log("data:orphan", LEVEL.WARN, `Cleaned ${count} orphaned estimate(s)`, { orphanIds: ids }),
};

/** Migration events */
export const migration = {
  info: (msg, data) => log("data:migration", LEVEL.INFO, msg, data),
  warn: (msg, data) => log("data:migration", LEVEL.WARN, msg, data),
  error: (msg, data) => log("data:migration", LEVEL.ERROR, msg, data),
};

/** Estimate loading */
export const estimate = {
  debug: (msg, data) => log("estimate:load", LEVEL.DEBUG, msg, data),
  info: (msg, data) => log("estimate:load", LEVEL.INFO, msg, data),
  warn: (msg, data) => log("estimate:load", LEVEL.WARN, msg, data),
  error: (msg, data) => log("estimate:load", LEVEL.ERROR, msg, data),
  saveError: (msg, data) => log("estimate:save", LEVEL.ERROR, msg, data),
};

/** OCR / scan pipeline */
export const ocr = {
  info: (msg, data) => log("ocr:pipeline", LEVEL.INFO, msg, data),
  warn: (msg, data) => log("ocr:pipeline", LEVEL.WARN, msg, data),
  error: (msg, data) => log("ocr:pipeline", LEVEL.ERROR, msg, data),
  circuit: (msg, data) => log("ocr:circuit", LEVEL.WARN, msg, data),
};

/** Auth / session */
export const auth = {
  info: (msg, data) => log("auth:session", LEVEL.INFO, msg, data),
  warn: (msg, data) => log("auth:session", LEVEL.WARN, msg, data),
  error: (msg, data) => log("auth:session", LEVEL.ERROR, msg, data),
};

/** Collaboration */
export const collab = {
  info: (msg, data) => log("collab:lock", LEVEL.INFO, msg, data),
  warn: (msg, data) => log("collab:lock", LEVEL.WARN, msg, data),
  error: (msg, data) => log("collab:lock", LEVEL.ERROR, msg, data),
  presence: (msg, data) => log("collab:presence", LEVEL.INFO, msg, data),
};

/** Get the in-memory ring buffer (for debug dumps) */
export function getRecentLogs() {
  return [..._ring];
}

/** Get only error-level entries from ring buffer */
export function getRecentErrors() {
  return _ring.filter(e => e.level === LEVEL.ERROR || e.level === LEVEL.FATAL);
}

/**
 * Startup integrity check — validates IDB index matches actual data blobs.
 * Returns { healthy, orphanCount, totalCount, orphanIds }
 */
export async function runIntegrityCheck(storage, idbKeyFn) {
  const startTime = Date.now();
  log("data:idb", LEVEL.INFO, "Running startup integrity check...");

  try {
    const indexKey = idbKeyFn("bldg-index");
    const indexRaw = await storage.get(indexKey);
    if (!indexRaw?.value) {
      log("data:idb", LEVEL.INFO, "Integrity check: no index found (new user or empty)");
      return { healthy: true, orphanCount: 0, totalCount: 0, orphanIds: [] };
    }

    const index = JSON.parse(indexRaw.value);
    if (!Array.isArray(index)) {
      log("data:idb", LEVEL.ERROR, "Integrity check: index is not an array", {
        type: typeof index,
      });
      return { healthy: false, orphanCount: 0, totalCount: 0, orphanIds: [] };
    }

    const orphanIds = [];
    for (const entry of index) {
      if (!entry?.id) continue;
      const estKey = idbKeyFn(`bldg-est-${entry.id}`);
      const estRaw = await storage.get(estKey);
      if (!estRaw?.value) {
        orphanIds.push(entry.id);
      }
    }

    const duration = Date.now() - startTime;
    const healthy = orphanIds.length === 0;

    if (healthy) {
      log("data:idb", LEVEL.INFO, `Integrity check passed: ${index.length} estimates OK (${duration}ms)`);
    } else {
      log("data:idb", LEVEL.WARN, `Integrity check: ${orphanIds.length}/${index.length} orphaned entries (${duration}ms)`, {
        orphanIds,
      });
    }

    return { healthy, orphanCount: orphanIds.length, totalCount: index.length, orphanIds };
  } catch (err) {
    log("data:idb", LEVEL.ERROR, "Integrity check failed", { error: err });
    return { healthy: false, orphanCount: -1, totalCount: -1, orphanIds: [] };
  }
}

export default { sync, idb, orphan, migration, estimate, ocr, auth, collab, getRecentLogs, getRecentErrors, runIntegrityCheck };
