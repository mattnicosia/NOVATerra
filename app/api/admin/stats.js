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
    // Run all queries in parallel
    const [usersRes, estimatesRes, embeddingsRes, rfpsRes, userDataRes] = await Promise.all([
      // All users (up to 1000)
      supabaseAdmin.auth.admin.listUsers({ perPage: 1000, page: 1 }),
      // Total estimates
      supabaseAdmin.from("user_estimates").select("id", { count: "exact", head: true }),
      // Embeddings — just get kind column for grouping
      supabaseAdmin.from("embeddings").select("kind"),
      // Pending RFPs
      supabaseAdmin.from("pending_rfps").select("id", { count: "exact", head: true }),
      // user_data rows
      supabaseAdmin.from("user_data").select("id", { count: "exact", head: true }),
    ]);

    // Count users
    const totalUsers = usersRes?.data?.users?.length || 0;

    // Count embeddings by kind
    const embeddingsByKind = {};
    let totalEmbeddings = 0;
    if (embeddingsRes?.data && Array.isArray(embeddingsRes.data)) {
      embeddingsRes.data.forEach(row => {
        const kind = row.kind || "unknown";
        embeddingsByKind[kind] = (embeddingsByKind[kind] || 0) + 1;
        totalEmbeddings++;
      });
    }

    // Recent estimates (last 10 updated) — fetch full rows and extract fields
    const { data: recentEstRaw } = await supabaseAdmin
      .from("user_estimates")
      .select("user_id, estimate_id, updated_at, data")
      .order("updated_at", { ascending: false })
      .limit(10);

    const recentEstimates = (recentEstRaw || []).map(e => {
      const pi = e.data?.projectInfo || {};
      return {
        user_id: e.user_id,
        estimate_id: e.estimate_id,
        updated_at: e.updated_at,
        projectName: pi.projectName || pi.name || "Untitled",
        client: pi.client || pi.clientName || null,
      };
    });

    // Recent users (first 5 from the list, sorted by created_at desc)
    const recentUsers = (usersRes?.data?.users || [])
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
      .map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
      }));

    return res.status(200).json({
      totalUsers,
      totalEstimates: estimatesRes?.count || 0,
      totalEmbeddings,
      embeddingsByKind,
      totalRfps: rfpsRes?.count || 0,
      totalUserDataRows: userDataRes?.count || 0,
      recentEstimates,
      recentUsers,
    });
  } catch (err) {
    console.error("Admin stats error:", err.message);
    return res.status(500).json({ error: err.message || "Failed to fetch stats" });
  }
}
