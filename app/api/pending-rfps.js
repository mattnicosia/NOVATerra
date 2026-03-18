import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const statusFilter = req.query.status ? req.query.status.split(",") : ["pending", "parsed"];
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    const companyProfileId = req.query.companyProfileId; // optional filter

    let query = supabaseAdmin
      .from("pending_rfps")
      .select("*", { count: "exact" })
      .eq("user_id", user.id)
      .in("status", statusFilter);

    // Filter by company profile if specified (matches estimate filtering logic)
    // '__all__' = no filter; '' = primary + unassigned; specific id = that id + unassigned
    if (companyProfileId !== undefined && companyProfileId !== "__all__") {
      query = query.or(`company_profile_id.eq.${companyProfileId},company_profile_id.eq.,company_profile_id.is.null`);
    }

    const { data, error, count } = await query
      .order("received_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.status(200).json({ rfps: data || [], total: count || 0 });
  } catch (err) {
    console.error("List RFPs error:", err.message);
    return res.status(500).json({ error: "Failed to fetch RFPs" });
  }
}
