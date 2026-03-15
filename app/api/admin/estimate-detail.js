import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { cors } from '../lib/cors.js';

function parseCookies(h) { const c = {}; (h||'').split(';').forEach(p => { const [k,...r] = p.trim().split('='); if (k) c[k] = r.join('='); }); return c; }

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const cookie = parseCookies(req.headers.cookie);
  const ADMIN_SECRET = process.env.NOVA_ADMIN_SECRET;
  if (!ADMIN_SECRET || cookie.nova_admin_token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { userId, estimateId } = req.query;
  if (!userId || !estimateId) {
    return res.status(400).json({ error: "userId and estimateId are required" });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("user_estimates")
      .select("*")
      .eq("user_id", userId)
      .eq("estimate_id", estimateId)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Estimate not found" });

    // Get user email
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId);

    return res.status(200).json({
      id: data.id,
      estimate_id: data.estimate_id,
      user_id: data.user_id,
      userEmail: user?.email || "unknown",
      updated_at: data.updated_at,
      data: data.data, // Full JSONB payload
    });
  } catch (err) {
    console.error("Admin estimate-detail error:", err.message);
    return res.status(500).json({ error: "Failed to fetch estimate detail" });
  }
}
