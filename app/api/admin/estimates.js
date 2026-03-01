import { supabaseAdmin, verifyAdmin } from '../lib/supabaseAdmin.js';
import { cors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: "Forbidden" });

  try {
    const userId = req.query.userId || null;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(100, parseInt(req.query.perPage) || 50);
    const offset = (page - 1) * perPage;

    let query = supabaseAdmin
      .from("user_estimates")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(offset, offset + perPage - 1);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    // Get user emails for display
    const userIds = [...new Set((data || []).map(e => e.user_id))];
    const userMap = {};
    if (userIds.length > 0) {
      // Fetch user info for each unique user_id
      const promises = userIds.map(id =>
        supabaseAdmin.auth.admin.getUserById(id).then(r => r?.data?.user).catch(() => null)
      );
      const users = await Promise.all(promises);
      users.forEach(u => {
        if (u) userMap[u.id] = u.email;
      });
    }

    // Map to summary format
    const estimates = (data || []).map(e => {
      const d = e.data || {};
      const pi = d.projectInfo || {};
      return {
        id: e.id,
        estimate_id: e.estimate_id,
        user_id: e.user_id,
        userEmail: userMap[e.user_id] || "unknown",
        projectName: pi.projectName || pi.name || "Untitled",
        client: pi.client || pi.clientName || null,
        totalCost: d.totalCost || null,
        squareFeet: pi.squareFeet || pi.sf || null,
        status: pi.status || null,
        lineItemCount: Array.isArray(d.lineItems) ? d.lineItems.length : 0,
        updated_at: e.updated_at,
      };
    });

    return res.status(200).json({ estimates, total: count || 0, page, perPage });
  } catch (err) {
    console.error("Admin estimates error:", err.message);
    return res.status(500).json({ error: "Failed to fetch estimates" });
  }
}
