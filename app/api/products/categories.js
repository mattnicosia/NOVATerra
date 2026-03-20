/**
 * Product Categories API — /api/products/categories
 *
 * Returns available product categories from configured sources.
 * Used by MaterialPicker to populate category filters.
 */

import { cors } from "../lib/cors.js";

// Construction-relevant HD categories
const HD_CATEGORIES = [
  "Building Materials",
  "Lumber & Composites",
  "Hardware",
  "Plumbing",
  "Electrical",
  "Heating, Venting & Cooling",
  "Paint",
  "Flooring",
  "Kitchen",
  "Bath",
  "Doors & Windows",
  "Lighting",
  "Tools",
];

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const hasHD = !!(process.env.IMPACT_ACCOUNT_SID && process.env.IMPACT_AUTH_TOKEN);
  const hasBIM = !!(process.env.BIMOBJECT_CLIENT_ID && process.env.BIMOBJECT_CLIENT_SECRET);

  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=172800");

  return res.status(200).json({
    sources: {
      homedepot: { configured: hasHD, categories: hasHD ? HD_CATEGORIES : [] },
      bimobject: { configured: hasBIM, categories: [] }, // BIMobject categories fetched dynamically
    },
  });
}
