// Vercel Serverless Function — Receive engagement beacon from living proposal page
// POST (public) — receives duration + sections viewed via navigator.sendBeacon

import { supabaseAdmin } from "./lib/supabaseAdmin.js";

export default async function handler(req, res) {
  // No CORS needed for sendBeacon (same-origin POST)
  if (req.method !== "POST") return res.status(405).end();

  const { viewId, durationSeconds, sectionsViewed } = req.body || {};

  if (!viewId) return res.status(400).end();

  await supabaseAdmin
    .from("living_proposal_views")
    .update({
      duration_seconds: Math.min(parseInt(durationSeconds) || 0, 7200),
      sections_viewed: Array.isArray(sectionsViewed) ? sectionsViewed.slice(0, 20) : null,
    })
    .eq("id", viewId)
    .catch(() => {});

  return res.status(200).json({ ok: true });
}
