/**
 * Rate Limiter — Simple in-memory rate limiting for API endpoints.
 *
 * In serverless environments, this resets per cold start. That's acceptable
 * because it primarily prevents burst abuse within a single function invocation.
 *
 * Uses a fixed-window counter per key (provider, user, endpoint).
 */

const buckets = new Map();
const SWEEP_INTERVAL = 100;
let requestCount = 0;

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
  // Public endpoints
  rom: 5,
  rom_ip: 12,
  rom_recipient: 10,
  rom_project: 3,
  portal: 20,
};

const WINDOW_MS = 60_000; // 1 minute

function sweepExpiredBuckets(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (!bucket || now - bucket.windowStart > bucket.windowMs) {
      buckets.delete(key);
    }
  }
}

function resolveLimit(bucketKey) {
  if (MAX_REQUESTS[bucketKey]) return MAX_REQUESTS[bucketKey];

  const parts = String(bucketKey || "generic").split("_");
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const prefix = parts.slice(0, i).join("_");
    if (MAX_REQUESTS[prefix]) return MAX_REQUESTS[prefix];
  }

  return MAX_REQUESTS[parts[0]] || MAX_REQUESTS.generic;
}

/**
 * Check if a request is allowed for the given key.
 * @param {string} key - Rate limit key (e.g., "ai_userId", "dropbox", etc.)
 * @param {{ maxRequests?: number, windowMs?: number }} options
 * @returns {{ allowed: boolean, retryAfter?: number }}
 */
export function checkRateLimit(key, options = {}) {
  const now = Date.now();
  const bucketKey = key || "generic";
  const windowMs = Number.isFinite(options.windowMs) ? options.windowMs : WINDOW_MS;

  requestCount += 1;
  if (requestCount % SWEEP_INTERVAL === 0 || buckets.size > 5000) {
    sweepExpiredBuckets(now);
  }

  let bucket = buckets.get(bucketKey);

  if (!bucket || bucket.windowMs !== windowMs || now - bucket.windowStart > windowMs) {
    // Start new window
    bucket = { count: 0, windowStart: now, windowMs };
  }

  const limit = Number.isFinite(options.maxRequests) ? options.maxRequests : resolveLimit(bucketKey);

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
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
