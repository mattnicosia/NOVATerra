/**
 * Product Search API — /api/products/search
 *
 * Proxies product search to Home Depot affiliate API (Impact Radius)
 * and BIMobject API. Keeps API credentials server-side.
 *
 * Query params:
 *   q        — search keyword (required)
 *   source   — "homedepot" | "bimobject" | "all" (default: "all")
 *   category — filter by category (e.g., "Building Materials")
 *   page     — pagination (default: 1)
 *   limit    — results per page (default: 20, max: 50)
 */

import { cors } from "../lib/cors.js";

// ── Home Depot (Impact Radius) ────────────────────────────────────
async function searchHomeDepot(query, category, page, limit) {
  const accountSid = process.env.IMPACT_ACCOUNT_SID;
  const authToken = process.env.IMPACT_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    return { source: "homedepot", items: [], error: "Home Depot API not configured" };
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  // Build query filter
  let filterParts = [];
  if (category) filterParts.push(`Category=${encodeURIComponent(category)}`);
  if (query) filterParts.push(`Keyword=${encodeURIComponent(query)}`);

  const params = new URLSearchParams({
    PageSize: String(Math.min(limit, 50)),
    Page: String(page),
  });
  if (query) params.set("Keyword", query);
  if (category) params.set("Query", `Category=${category}`);

  const url = `https://api.impact.com/Mediapartners/${accountSid}/Catalogs/ItemSearch.json?${params}`;

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { source: "homedepot", items: [], error: `HD API ${resp.status}: ${text.slice(0, 200)}` };
    }

    const data = await resp.json();
    const items = (data.Items || []).map(item => ({
      id: `hd-${item.CatalogItemId}`,
      source: "homedepot",
      name: item.Name,
      description: item.Description,
      manufacturer: item.Manufacturer || "",
      category: item.Category || "",
      subCategory: item.SubCategory || "",
      price: parseFloat(item.CurrentPrice) || 0,
      originalPrice: parseFloat(item.OriginalPrice) || 0,
      currency: item.Currency || "USD",
      unit: "EA",
      imageUrl: item.ImageUrl || "",
      additionalImages: item.AdditionalImageUrls || [],
      productUrl: item.Url || "",
      mpn: item.Mpn || "",
      gtin: item.Gtin || "",
      inStock: item.StockAvailability !== "OutOfStock",
    }));

    return {
      source: "homedepot",
      items,
      total: data["@total"] || items.length,
      page,
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
  // Expire 5 min early to be safe
  _bimTokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return _bimToken;
}

async function searchBIMobject(query, category, page, limit) {
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
      price: 0, // BIMobject doesn't provide pricing
      originalPrice: 0,
      currency: "USD",
      unit: "EA",
      imageUrl: p.imageUrl || "",
      additionalImages: [],
      productUrl: p.permalink || "",
      mpn: "",
      gtin: p.gtinCode || "",
      inStock: true,
      // BIMobject-specific
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

  const { q, source = "all", category, page = "1", limit = "20" } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({ error: "Query parameter 'q' is required (min 2 chars)" });
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));

  const results = {};

  if (source === "all" || source === "homedepot") {
    results.homedepot = await searchHomeDepot(q, category, pageNum, limitNum);
  }

  if (source === "all" || source === "bimobject") {
    results.bimobject = await searchBIMobject(q, category, pageNum, limitNum);
  }

  // Merge into unified results
  const allItems = [];
  for (const [, result] of Object.entries(results)) {
    if (result.items) allItems.push(...result.items);
  }

  // Cache for 1 hour — product data doesn't change that fast
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=7200");

  return res.status(200).json({
    query: q,
    source,
    category: category || null,
    page: pageNum,
    limit: limitNum,
    totalItems: allItems.length,
    items: allItems,
    sources: results,
  });
}
