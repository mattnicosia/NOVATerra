/**
 * Product Search API — /api/products/search
 *
 * Proxies product search to BigBox API (Home Depot data)
 * and BIMobject API. Keeps API credentials server-side.
 *
 * Query params:
 *   q        — search keyword (required)
 *   source   — "homedepot" | "bimobject" | "all" (default: "all")
 *   sort     — "best_seller" | "price_low_to_high" | "price_high_to_low" | "highest_rating"
 *   zip      — US zip code for localized pricing/availability
 *   page     — pagination (default: 1)
 *   limit    — results per page (default: 20, max: 50)
 */

import { cors } from "../lib/cors.js";

// ── Home Depot (BigBox API by Traject Data) ───────────────────────
// Single endpoint: https://api.bigboxapi.com/request
// Auth: api_key query param
// 500 credits/mo @ $15/mo, 100 free trial requests

async function searchHomeDepot(query, { page, sort, zip }) {
  const apiKey = process.env.BIGBOX_API_KEY;

  if (!apiKey) {
    return { source: "homedepot", items: [], error: "BigBox API not configured" };
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    type: "search",
    search_term: query,
    page: String(page),
  });
  if (sort) params.set("sort_by", sort);
  if (zip) params.set("customer_zipcode", zip);

  const url = `https://api.bigboxapi.com/request?${params}`;

  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(15000), // BigBox can take 1-6s
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { source: "homedepot", items: [], error: `BigBox API ${resp.status}: ${text.slice(0, 200)}` };
    }

    const data = await resp.json();

    if (!data.request_info?.success) {
      return { source: "homedepot", items: [], error: data.request_info?.message || "BigBox request failed" };
    }

    const items = (data.search_results || []).map(r => {
      const p = r.product || {};
      const offer = r.offers?.primary || {};
      const fulfillment = r.fulfillment || {};

      return {
        id: `hd-${p.item_id || p.store_sku}`,
        source: "homedepot",
        name: p.title || "",
        description: "",
        manufacturer: p.brand || "",
        category: "",
        subCategory: "",
        price: offer.price || 0,
        originalPrice: offer.regular_price || offer.price || 0,
        currency: offer.currency || "USD",
        unit: "EA",
        imageUrl: p.primary_image || "",
        additionalImages: p.images || [],
        productUrl: p.link || "",
        mpn: p.model_number || "",
        gtin: "",
        inStock: fulfillment.pickup_info?.in_stock || fulfillment.ship_to_home_info?.in_stock || false,
        rating: p.rating || 0,
        ratingsTotal: p.ratings_total || 0,
        isBestseller: p.is_bestseller || false,
        isTopRated: p.is_top_rated || false,
        features: (p.features || []).slice(0, 5),
      };
    });

    return {
      source: "homedepot",
      items,
      total: data.pagination?.total_results || items.length,
      page,
      creditsRemaining: data.request_info?.credits_remaining,
    };
  } catch (err) {
    return { source: "homedepot", items: [], error: err.message };
  }
}

// ── BIMobject (OAuth2 Client Credentials) ─────────────────────────
// Token endpoint: https://auth.bim.com/connect/token
// Search API: https://api.bimobject.com/search/v1/products
// Supports MasterFormat 2014 filtering for CSI division mapping

let _bimToken = null;
let _bimTokenExpiry = 0;

async function getBIMobjectToken() {
  if (_bimToken && Date.now() < _bimTokenExpiry) return _bimToken;

  const clientId = process.env.BIMOBJECT_CLIENT_ID;
  const clientSecret = process.env.BIMOBJECT_CLIENT_SECRET;

  const resp = await fetch("https://auth.bim.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "search",
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) throw new Error(`BIMobject auth failed: ${resp.status}`);

  const data = await resp.json();
  _bimToken = data.access_token;
  _bimTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return _bimToken;
}

async function searchBIMobject(query, { page, limit }) {
  const clientId = process.env.BIMOBJECT_CLIENT_ID;
  const clientSecret = process.env.BIMOBJECT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { source: "bimobject", items: [], error: "BIMobject API not configured" };
  }

  try {
    const token = await getBIMobjectToken();

    const params = new URLSearchParams({
      "filter.fullText": query || "",
      page: String(page),
      pageSize: String(Math.min(limit, 50)),
    });

    const url = `https://api.bimobject.com/search/v1/products?${params}`;

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { source: "bimobject", items: [], error: `BIMobject API ${resp.status}: ${text.slice(0, 200)}` };
    }

    const data = await resp.json();
    const results = data.data || data.products || data.results || data || [];

    const items = (Array.isArray(results) ? results : []).map(p => ({
      id: `bim-${p.id}`,
      source: "bimobject",
      name: p.name || "",
      description: "",
      manufacturer: p.brand?.name || "",
      category: p.bimObjectCategory?.name || "",
      subCategory: "",
      price: 0,
      originalPrice: 0,
      currency: "USD",
      unit: "EA",
      imageUrl: p.imageUrl || "",
      additionalImages: [],
      productUrl: p.permalink || "",
      mpn: "",
      gtin: p.gtinCode || "",
      inStock: true,
      masterFormat: p.masterFormat2014 || null,
      specifications: {},
    }));

    return {
      source: "bimobject",
      items,
      total: data.totalCount || data.count || items.length,
      page,
    };
  } catch (err) {
    return { source: "bimobject", items: [], error: err.message };
  }
}

// ── Handler ───────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { q, source = "all", sort, zip, page = "1", limit = "20" } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Query parameter 'q' is required (min 2 chars)" });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  const results = {};

  // Run sources in parallel
  const promises = [];

  if (source === "all" || source === "homedepot") {
    promises.push(
      searchHomeDepot(q, { page: pageNum, sort, zip }).then(r => { results.homedepot = r; })
    );
  }

  if (source === "all" || source === "bimobject") {
    promises.push(
      searchBIMobject(q, { page: pageNum, limit: limitNum }).then(r => { results.bimobject = r; })
    );
  }

  await Promise.all(promises);

  // Merge into unified results
  const allItems = [];
  for (const [, result] of Object.entries(results)) {
    if (result.items) allItems.push(...result.items);
  }

  // Cache for 1 hour
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");

  return res.status(200).json({
    query: q,
    source,
    page: pageNum,
    limit: limitNum,
    totalItems: allItems.length,
    items: allItems,
    sources: results,
  });
}
