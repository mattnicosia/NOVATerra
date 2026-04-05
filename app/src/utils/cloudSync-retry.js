/**
 * Cloud Sync — Retry & error classification helpers.
 * Extracted from cloudSync.js. Self-contained retry logic.
 */

// Per-operation cooldown: each operation (e.g. pushData("settings"), pushEstimate("abc"))
// tracks its own cooldown independently. A failure in one operation no longer blocks others.
export const _syncErrors = new Map(); // key -> timestamp of last exhausted-retry failure
export const SYNC_COOLDOWN = 30000; // 30s cooldown after all retries exhausted
export let _activeSyncs = 0;
export const MAX_CONCURRENT_SYNCS = 3; // limit parallel uploads

/** Classify errors: permanent (don't retry) vs transient (do retry). */
export const isPermanentError = err => {
  const msg = (err?.message || "").toLowerCase();
  const status = err?.status || err?.statusCode || 0;
  if (status === 401 || status === 403 || status === 404) return true;
  if (msg.includes("jwt expired") || msg.includes("invalid jwt")) return true;
  if (msg.includes("row-level security") || msg.includes("rls")) return true;
  if (msg.includes("violates foreign key")) return true;
  return false;
};

/** Exponential-backoff retry wrapper with per-operation cooldown and concurrency gate. */
export const withRetry = async (label, fn, retries = 2) => {
  const lastError = _syncErrors.get(label) || 0;
  if (Date.now() - lastError < SYNC_COOLDOWN) {
    console.warn(`[cloudSync] ${label} skipped — cooling down after recent failure`);
    return;
  }
  if (_activeSyncs >= MAX_CONCURRENT_SYNCS) {
    console.warn(`[cloudSync] ${label} skipped — ${_activeSyncs} syncs in flight`);
    return;
  }
  _activeSyncs++;
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await fn();
        _syncErrors.delete(label);
        return result;
      } catch (err) {
        if (isPermanentError(err)) {
          console.error(`[cloudSync] ${label} permanent error — not retrying:`, err.message);
          _syncErrors.set(label, Date.now());
          throw err;
        }
        if (attempt < retries) {
          const delay = Math.min(2000 * Math.pow(2, attempt), 16000);
          console.warn(`[cloudSync] ${label} attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          _syncErrors.set(label, Date.now());
          throw err;
        }
      }
    }
  } finally {
    _activeSyncs--;
  }
};
