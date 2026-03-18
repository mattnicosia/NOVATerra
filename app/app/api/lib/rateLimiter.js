/**
 * Rate Limiter — Simple in-memory rate limiting for API endpoints.
 *
 * In serverless environments, this resets per cold start. That's acceptable
 * because it primarily prevents burst abuse within a single function invocation.
 *
 * Uses a sliding window approach per key (provider, user, endpoint).
 */

const buckets = new Map();

// Requests per minute by key prefix
const MAX_REQUESTS = {
  // Cloud providers
  dropbox: 30,
  google_drive: 50,
  box: 20,
  onedrive: 30,
  generic: 40,
  // AI/ML endpoints (per-user)
  ai: 20,
  ocr: 15,
  embed: 30,
  vector_search: 30,
  parse_proposal: 10,
  retry_parse: 10,
  scope_gap: 10,
  // Email endpoints (per-user)
  send_proposal: 10,
  send_bid_invite: 20,
  send_team_invite: 10,
  award_bid: 10,
};

const WINDOW_MS = 60_000; // 1 minute

/**
 * Check if a request is allowed for the given key.
 * @param {string} key - Rate limit key (e.g., "ai_userId", "dropbox", etc.)
 * @returns {{ allowed: boolean, retryAfter?: number }}
 */
export function checkRateLimit(key) {
  const now = Date.now();
  const bucketKey = key || "generic";
  let bucket = buckets.get(bucketKey);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    // Start new window
    bucket = { count: 0, windowStart: now };
  }

  // Extract prefix for limit lookup (e.g., "ai_abc123" → "ai")
  const prefix = bucketKey.split("_")[0];
  const limit = MAX_REQUESTS[bucketKey] || MAX_REQUESTS[prefix] || MAX_REQUESTS.generic;

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }

  bucket.count++;
  buckets.set(bucketKey, bucket);
  return { allowed: true };
}

/**
 * Reset rate limit state (useful for testing).
 */
export function resetRateLimits() {
  buckets.clear();
}
