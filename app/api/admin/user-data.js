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

  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  try {
    // Get user auth info
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError) throw userError;

    // Run all queries in parallel
    const [userDataRes, estimatesRes, embeddingsRes, rfpsRes] = await Promise.all([
      // All user_data rows
      supabaseAdmin.from("user_data").select("*").eq("user_id", userId),
      // All estimates (summary only — data is JSONB, extract key fields)
      supabaseAdmin.from("user_estimates").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
      // Embedding count by kind
      supabaseAdmin.from("embeddings").select("kind").eq("user_id", userId),
      // Pending RFPs
      supabaseAdmin.from("pending_rfps").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    ]);

    // Parse user_data by key
    const dataByKey = {};
    (userDataRes?.data || []).forEach(row => {
      dataByKey[row.key] = {
        id: row.id,
        data: row.data,
        updated_at: row.updated_at,
      };
    });

    // Compute embedding counts by kind
    const embeddingsByKind = {};
    let totalEmbeddings = 0;
    (embeddingsRes?.data || []).forEach(row => {
      embeddingsByKind[row.kind] = (embeddingsByKind[row.kind] || 0) + 1;
      totalEmbeddings++;
    });

    // Map estimates to summary format
    const estimates = (estimatesRes?.data || []).map(e => {
      const d = e.data || {};
      const pi = d.projectInfo || {};
      return {
        id: e.id,
        estimate_id: e.estimate_id,
        projectName: pi.projectName || pi.name || "Untitled",
        client: pi.client || pi.clientName || null,
        totalCost: d.totalCost || null,
        squareFeet: pi.squareFeet || pi.sf || null,
        status: pi.status || null,
        updated_at: e.updated_at,
      };
    });

    return res.status(200).json({
      user: user ? {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      } : null,
      dataByKey,
      estimates,
      embeddingsByKind,
      totalEmbeddings,
      rfps: rfpsRes?.data || [],
    });
  } catch (err) {
    console.error("Admin user-data error:", err.message);
    return res.status(500).json({ error: "Failed to fetch user data" });
  }
}
