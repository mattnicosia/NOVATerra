import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

/* ────────────────────────────────────────────────────────
   POST /api/cleanup-cloud-files
   Deletes temporary cloud-downloaded files from Supabase Storage
   after the frontend has extracted them into IndexedDB.
   ──────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { paths = [] } = req.body || {};
  if (!paths.length) return res.status(200).json({ deleted: 0 });

  // Security: validate every path belongs to this user
  const validPaths = paths.filter(p => typeof p === "string" && p.startsWith(`${user.id}/`));
  if (validPaths.length === 0) return res.status(200).json({ deleted: 0 });

  try {
    const { error } = await supabaseAdmin.storage.from("rfp-attachments").remove(validPaths);

    if (error) {
      console.error("Cleanup error:", error.message);
      return res.status(500).json({ error: "Cleanup failed", message: error.message });
    }

    return res.status(200).json({ deleted: validPaths.length });
  } catch (err) {
    console.error("Cleanup error:", err.message);
    return res.status(500).json({ error: "Cleanup failed" });
  }
}
