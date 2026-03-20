/**
 * Product Categories API — /api/products/categories
 *
 * Returns available product categories and source configuration status.
 * Used by MaterialPicker to populate category filters and show source badges.
 */

import { cors } from "../lib/cors.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const hasHD = !!process.env.BIGBOX_API_KEY;
  const hasBIM = !!(process.env.BIMOBJECT_CLIENT_ID && process.env.BIMOBJECT_CLIENT_SECRET);

  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=172800");

  return res.status(200).json({
    sources: {
      homedepot: { configured: hasHD, provider: "BigBox API" },
      bimobject: { configured: hasBIM, provider: "BIMobject Search API" },
    },
  });
}
