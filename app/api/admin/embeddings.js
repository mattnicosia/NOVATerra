import { supabaseAdmin, verifyAdmin } from '../lib/supabaseAdmin.js';
import { cors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const admin = await verifyAdmin(req);
  if (!admin) return res.status(403).json({ error: "Forbidden" });

  try {
    const byUser = req.query.byUser === 'true';

    // Get all embeddings (kind + user_id for grouping)
    const { data, error } = await supabaseAdmin
      .from("embeddings")
      .select("kind, user_id");

    if (error) throw error;

    // Group by kind
    const byKind = {};
    const byUserKind = {};
    let total = 0;

    (data || []).forEach(row => {
      const kind = row.kind || "unknown";
      byKind[kind] = (byKind[kind] || 0) + 1;
      total++;

      if (byUser) {
        const uid = row.user_id || "system";
        if (!byUserKind[uid]) byUserKind[uid] = {};
        byUserKind[uid][kind] = (byUserKind[uid][kind] || 0) + 1;
      }
    });

    // If byUser, get user emails
    let userEmails = {};
    if (byUser) {
      const userIds = Object.keys(byUserKind).filter(id => id !== "system");
      const promises = userIds.map(id =>
        supabaseAdmin.auth.admin.getUserById(id).then(r => r?.data?.user).catch(() => null)
      );
      const users = await Promise.all(promises);
      users.forEach(u => {
        if (u) userEmails[u.id] = u.email;
      });
    }

    const result = { total, byKind };
    if (byUser) {
      result.byUser = Object.entries(byUserKind).map(([uid, kinds]) => ({
        userId: uid,
        email: userEmails[uid] || (uid === "system" ? "system" : "unknown"),
        kinds,
        total: Object.values(kinds).reduce((s, n) => s + n, 0),
      }));
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Admin embeddings error:", err.message);
    return res.status(500).json({ error: "Failed to fetch embeddings" });
  }
}
