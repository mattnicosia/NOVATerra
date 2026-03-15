// Vercel Serverless Function — Add invitations to an existing bid package
// POST: create invitation rows for additional subs on a package

import { supabaseAdmin, verifyUser } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

// nanoid-like token generator (21-char URL-safe)
function generateToken(len = 21) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let token = "";
  for (let i = 0; i < len; i++) token += chars[bytes[i] % chars.length];
  return token;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (!supabaseAdmin) return res.status(500).json({ error: "Database not configured" });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  // ── DELETE: Remove an invitation ──
  if (req.method === "DELETE") {
    const { invitationId } = req.body || {};
    if (!invitationId) return res.status(400).json({ error: "Missing invitationId" });

    try {
      // Verify invitation belongs to user's package
      const { data: inv, error: invErr } = await supabaseAdmin
        .from("bid_invitations")
        .select("id, user_id, package_id, status")
        .eq("id", invitationId)
        .single();

      if (invErr || !inv) return res.status(404).json({ error: "Invitation not found" });
      if (inv.user_id !== user.id) return res.status(403).json({ error: "Not authorized" });

      // Only allow removing pending/sent invitations (not submitted/awarded)
      if (["submitted", "parsed", "awarded"].includes(inv.status)) {
        return res.status(400).json({ error: "Cannot remove invitation after proposal submitted" });
      }

      const { error: delErr } = await supabaseAdmin.from("bid_invitations").delete().eq("id", invitationId);
      if (delErr) throw delErr;

      console.log(`[bid-invitation] Removed invitation=${invitationId} from package=${inv.package_id}`);
      return res.status(200).json({ removed: invitationId });
    } catch (err) {
      console.error("[bid-invitation] Delete error:", err);
      return res.status(500).json({ error: err.message || "Failed to remove invitation" });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { packageId, subs } = req.body || {};

  if (!packageId || !Array.isArray(subs) || subs.length === 0) {
    return res.status(400).json({ error: "Missing required fields: packageId, subs (non-empty array)" });
  }

  try {
    // Verify package exists and belongs to user
    const { data: pkg, error: pkgError } = await supabaseAdmin
      .from("bid_packages")
      .select("id, user_id")
      .eq("id", packageId)
      .single();

    if (pkgError || !pkg) {
      return res.status(404).json({ error: "Bid package not found" });
    }

    if (pkg.user_id !== user.id) {
      return res.status(403).json({ error: "Not authorized to modify this package" });
    }

    // Create invitation rows with unique tokens
    const inviteRows = subs.map(sub => ({
      package_id: packageId,
      user_id: user.id,
      token: generateToken(),
      sub_company: sub.company || "",
      sub_contact: sub.contact || "",
      sub_email: sub.email,
      sub_phone: sub.phone || "",
      sub_trade: sub.trade || "",
      status: "pending",
    }));

    const { data: invData, error: invError } = await supabaseAdmin.from("bid_invitations").insert(inviteRows).select();

    if (invError) throw invError;

    const invitations = invData || [];
    console.log(`[bid-invitation] Added ${invitations.length} invitations to package=${packageId}`);
    return res.status(200).json({ invitations });
  } catch (err) {
    console.error("[bid-invitation] Error:", err);
    return res.status(500).json({ error: err.message || "Failed to create invitations" });
  }
}
