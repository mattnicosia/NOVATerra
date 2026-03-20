/**
 * productDataService.js — Client-side service for fetching product data
 *
 * Searches Home Depot + BIMobject via our server proxy (/api/products/search).
 * Results are cached in IndexedDB to minimize API calls.
 */

import { storage } from "@/utils/storage";

// Cache TTL: 24 hours for product searches
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_PREFIX = "product-cache-";

// ── Cache helpers ─────────────────────────────────────────────────

function cacheKey(query, source, category, page) {
  return `${CACHE_PREFIX}${source}-${category || "all"}-${query}-p${page}`;
}

async function getCached(key) {
  try {
    const entry = await storage.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      storage.delete(key); // fire-and-forget cleanup
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

async function setCache(key, data) {
  try {
    await storage.set(key, { ts: Date.now(), data });
  } catch {
    // Cache write failure is non-critical
  }
}

// ── API calls ─────────────────────────────────────────────────────

const API_BASE = import.meta.env.DEV
  ? "https://app-nova-42373ca7.vercel.app"
  : "";

/**
 * Search products across configured sources
 * @param {string} query — search keyword
 * @param {object} opts
 * @param {string} opts.source — "homedepot" | "bimobject" | "all"
 * @param {string} opts.category — HD category filter
 * @param {number} opts.page — page number (1-based)
 * @param {number} opts.limit — results per page
 * @param {boolean} opts.skipCache — force fresh fetch
 * @returns {Promise<{items: Array, sources: object, totalItems: number}>}
 */
export async function searchProducts(query, opts = {}) {
  const { source = "all", category = "", page = 1, limit = 20, skipCache = false } = opts;

  if (!query || query.trim().length < 2) return { items: [], sources: {}, totalItems: 0 };

  const key = cacheKey(query.trim().toLowerCase(), source, category, page);

  // Check cache first
  if (!skipCache) {
    const cached = await getCached(key);
    if (cached) return cached;
  }

  // Fetch from API
  const params = new URLSearchParams({
    q: query.trim(),
    source,
    page: String(page),
    limit: String(limit),
  });
  if (category) params.set("category", category);

  const resp = await fetch(`${API_BASE}/api/products/search?${params}`, {
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    throw new Error(`Product search failed: ${resp.status}`);
  }

  const data = await resp.json();

  // Cache result
  await setCache(key, data);

  return data;
}

/**
 * Get available product categories from configured sources
 * @returns {Promise<{sources: object}>}
 */
export async function getProductCategories() {
  const key = `${CACHE_PREFIX}categories`;

  const cached = await getCached(key);
  if (cached) return cached;

  const resp = await fetch(`${API_BASE}/api/products/categories`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch categories: ${resp.status}`);
  }

  const data = await resp.json();
  await setCache(key, data);
  return data;
}

/**
 * Clear all product caches (useful when API credentials change)
 */
export async function clearProductCache() {
  try {
    const allKeys = await storage.keys();
    const productKeys = allKeys.filter(k => k.startsWith(CACHE_PREFIX));
    await Promise.all(productKeys.map(k => storage.delete(k)));
    return productKeys.length;
  } catch {
    return 0;
  }
}
