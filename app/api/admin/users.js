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

  try {
    const search = (req.query.search || '').toLowerCase();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(100, parseInt(req.query.perPage) || 50);

    // Get all users from auth
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    // Filter by search if provided
    let filtered = users || [];
    if (search) {
      filtered = filtered.filter(u =>
        (u.email || '').toLowerCase().includes(search) ||
        (u.user_metadata?.full_name || '').toLowerCase().includes(search) ||
        (u.user_metadata?.name || '').toLowerCase().includes(search)
      );
    }

    // Get estimate counts per user
    const userIds = filtered.map(u => u.id);
    const estimateCounts = {};
    const embeddingCounts = {};

    if (userIds.length > 0) {
      // Count estimates per user
      const { data: estData } = await supabaseAdmin
        .from("user_estimates")
        .select("user_id")
        .in("user_id", userIds);
      (estData || []).forEach(row => {
        estimateCounts[row.user_id] = (estimateCounts[row.user_id] || 0) + 1;
      });

      // Count embeddings per user
      const { data: embData } = await supabaseAdmin
        .from("embeddings")
        .select("user_id")
        .in("user_id", userIds);
      (embData || []).forEach(row => {
        embeddingCounts[row.user_id] = (embeddingCounts[row.user_id] || 0) + 1;
      });
    }

    // Map to response
    const result = filtered.map(u => ({
      id: u.id,
      email: u.email,
      name: u.user_metadata?.full_name || u.user_metadata?.name || null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      provider: u.app_metadata?.provider || 'email',
      estimateCount: estimateCounts[u.id] || 0,
      embeddingCount: embeddingCounts[u.id] || 0,
    }));

    return res.status(200).json({ users: result, total: result.length });
  } catch (err) {
    console.error("Admin users error:", err.message);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
}
