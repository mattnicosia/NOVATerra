/**
 * Rate Limiter — Simple in-memory rate limiting for cloud provider APIs.
 *
 * In serverless environments, this resets per cold start. That's acceptable
 * because it primarily prevents burst abuse within a single function invocation
 * (e.g., importing an RFP with 50 cloud links).
 *
 * Uses a sliding window approach per provider.
 */

const buckets = new Map();

// Requests per minute per provider
const MAX_REQUESTS = {
  dropbox: 30,
  google_drive: 50,
  box: 20,
  onedrive: 30,
  generic: 40,
};

const WINDOW_MS = 60_000; // 1 minute

/**
 * Check if a request is allowed for the given provider.
 * @param {string} provider - Provider name (dropbox, google_drive, etc.)
 * @returns {{ allowed: boolean, retryAfter?: number }}
 */
export function checkRateLimit(provider) {
  const now = Date.now();
  const key = provider || "generic";
  let bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    // Start new window
    bucket = { count: 0, windowStart: now };
  }

  const limit = MAX_REQUESTS[key] || MAX_REQUESTS.generic;

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }

  bucket.count++;
  buckets.set(key, bucket);
  return { allowed: true };
}

/**
 * Reset rate limit state (useful for testing).
 */
export function resetRateLimits() {
  buckets.clear();
}
