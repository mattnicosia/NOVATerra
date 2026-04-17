/**
 * Rate Limiter — Distributed (Upstash Redis) with in-memory fallback.
 *
 * Serverless-safe. If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars
 * are set, uses Upstash REST API for distributed rate limiting (consistent
 * across instances and cold starts). Otherwise falls back to in-memory
 * per-instance counters (better than nothing, but resets on cold start).
 *
 * No new npm deps — uses raw fetch against Upstash REST.
 *
 * API is unchanged: checkRateLimit(key, options?) returns { allowed, retryAfter? }
 * Callers stay in sync through a best-effort pattern: if Upstash responds fast
 * (typical: <20ms), we use its decision; if it's slow/unreachable, we fall
 * back to in-memory to avoid blocking the request. The tradeoff is worth it —
 * a brief cache miss is better than a 2s hang.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const HAS_UPSTASH = !!(UPSTASH_URL && UPSTASH_TOKEN);

if (!HAS_UPSTASH) {
  console.warn(
    "[rateLimiter] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — falling back to in-memory (cold-start resets, not distributed).",
  );
}

// ─── Shared limit config ─────────────────────────────────────────
const MAX_REQUESTS = {
  // Cloud providers
  dropbox: 30, google_drive: 50, box: 20, onedrive: 30, generic: 40,
  // AI/ML endpoints (per-user)
  ai: 20, ocr: 15, embed: 30, vector_search: 30,
  parse_proposal: 10, retry_parse: 10, scope_gap: 10,
  // Email endpoints (per-user)
  send_proposal: 10, send_bid_invite: 20, send_team_invite: 10, award_bid: 10,
  // Public endpoints
  rom: 5, rom_ip: 12, rom_recipient: 10, rom_project: 3, portal: 20,
};

const WINDOW_MS = 60_000; // 1 minute

function resolveLimit(bucketKey) {
  if (MAX_REQUESTS[bucketKey]) return MAX_REQUESTS[bucketKey];
  const parts = String(bucketKey || "generic").split("_");
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const prefix = parts.slice(0, i).join("_");
    if (MAX_REQUESTS[prefix]) return MAX_REQUESTS[prefix];
  }
  return MAX_REQUESTS[parts[0]] || MAX_REQUESTS.generic;
}

// ─── In-memory fallback (original implementation) ────────────────
const buckets = new Map();
const SWEEP_INTERVAL = 100;
let requestCount = 0;

function sweepExpiredBuckets(now) {
  for (const [key, bucket] of buckets.entries()) {
    if (!bucket || now - bucket.windowStart > bucket.windowMs) buckets.delete(key);
  }
}

function checkRateLimitInMemory(bucketKey, limit, windowMs) {
  const now = Date.now();
  requestCount += 1;
  if (requestCount % SWEEP_INTERVAL === 0 || buckets.size > 5000) sweepExpiredBuckets(now);

  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.windowMs !== windowMs || now - bucket.windowStart > windowMs) {
    bucket = { count: 0, windowStart: now, windowMs };
  }
  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }
  bucket.count++;
  buckets.set(bucketKey, bucket);
  return { allowed: true };
}

// ─── Upstash distributed counter ─────────────────────────────────
// Uses INCR + EXPIRE to implement a fixed-window counter. 2 pipelined commands.
async function checkRateLimitUpstash(bucketKey, limit, windowMs) {
  const windowSec = Math.ceil(windowMs / 1000);
  const redisKey = `rl:${bucketKey}:${Math.floor(Date.now() / windowMs)}`;

  try {
    // Pipeline: INCR key, EXPIRE key windowSec NX (only set TTL if missing)
    const resp = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
      },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, String(windowSec), "NX"],
      ]),
      signal: AbortSignal.timeout(1500), // don't hang the request
    });

    if (!resp.ok) throw new Error(`Upstash HTTP ${resp.status}`);
    const results = await resp.json();
    const count = Number(results?.[0]?.result ?? 0);
    if (!Number.isFinite(count)) throw new Error("Upstash returned non-numeric count");

    if (count > limit) {
      return { allowed: false, retryAfter: windowSec };
    }
    return { allowed: true };
  } catch (err) {
    // Degrade gracefully — don't block the request on Upstash outage
    console.warn(`[rateLimiter] Upstash failed, falling back to in-memory: ${err.message}`);
    return checkRateLimitInMemory(bucketKey, limit, windowMs);
  }
}

// ─── Public API ──────────────────────────────────────────────────
/**
 * Check if a request is allowed for the given key.
 * @param {string} key   Rate limit key (e.g., "ai_userId", "dropbox")
 * @param {{ maxRequests?: number, windowMs?: number }} options
 * @returns {Promise<{ allowed: boolean, retryAfter?: number }>}
 */
export function checkRateLimit(key, options = {}) {
  const bucketKey = key || "generic";
  const windowMs = Number.isFinite(options.windowMs) ? options.windowMs : WINDOW_MS;
  const limit = Number.isFinite(options.maxRequests) ? options.maxRequests : resolveLimit(bucketKey);

  if (HAS_UPSTASH) {
    return checkRateLimitUpstash(bucketKey, limit, windowMs);
  }
  // Synchronous result wrapped in a resolved promise so callers can `await` uniformly
  return Promise.resolve(checkRateLimitInMemory(bucketKey, limit, windowMs));
}

/** Reset in-memory rate limit state (test helper). */
export function resetRateLimits() {
  buckets.clear();
}
