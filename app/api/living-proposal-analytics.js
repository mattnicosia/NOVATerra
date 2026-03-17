// Vercel Serverless Function — Living Proposal Analytics
// GET ?id=xxx (auth required) — returns view counts, engagement data

import { cors } from "./lib/cors.js";
import { verifyUser } from "./lib/supabaseAdmin.js";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id parameter" });

  // Verify ownership
  const { data: proposal } = await supabaseAdmin
    .from("living_proposals")
    .select("id, user_id, view_count, comment_count, version_count, last_viewed_at")
    .eq("id", id)
    .single();

  if (!proposal || proposal.user_id !== user.id) {
    return res.status(404).json({ error: "Not found" });
  }

  // Get view data (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: views } = await supabaseAdmin
    .from("living_proposal_views")
    .select("viewed_at, duration_seconds, sections_viewed, viewer_fingerprint")
    .eq("living_proposal_id", id)
    .gte("viewed_at", thirtyDaysAgo)
    .order("viewed_at", { ascending: false })
    .limit(200);

  // Compute analytics
  const uniqueVisitors = new Set((views || []).map(v => v.viewer_fingerprint)).size;
  const totalViews = (views || []).length;
  const avgDuration = totalViews > 0
    ? Math.round((views || []).reduce((s, v) => s + (v.duration_seconds || 0), 0) / totalViews)
    : 0;

  // Section engagement
  const sectionCounts = {};
  for (const v of (views || [])) {
    for (const s of (v.sections_viewed || [])) {
      sectionCounts[s] = (sectionCounts[s] || 0) + 1;
    }
  }

  // Views by day
  const viewsByDay = {};
  for (const v of (views || [])) {
    const day = v.viewed_at.split("T")[0];
    viewsByDay[day] = (viewsByDay[day] || 0) + 1;
  }

  // Get unread comments count
  const { count: unreadComments } = await supabaseAdmin
    .from("living_proposal_comments")
    .select("id", { count: "exact", head: true })
    .eq("living_proposal_id", id)
    .eq("author_type", "owner")
    .eq("is_read", false);

  return res.status(200).json({
    status: "ok",
    summary: {
      total_views: proposal.view_count,
      views_30d: totalViews,
      unique_visitors_30d: uniqueVisitors,
      avg_duration_seconds: avgDuration,
      last_viewed_at: proposal.last_viewed_at,
      unread_comments: unreadComments || 0,
      total_comments: proposal.comment_count,
      total_versions: proposal.version_count,
    },
    sectionEngagement: sectionCounts,
    viewsByDay,
  });
}
