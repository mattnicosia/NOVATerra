import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";
import {
  readProposalPassword,
  upgradeLegacyProposalPasswordHash,
  verifyProposalPassword,
} from "./lib/livingProposalAuth.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { token } = req.query || {};
  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    const { data: proposal, error } = await supabaseAdmin
      .from("living_proposals")
      .select("*")
      .eq("token", token)
      .eq("is_active", true)
      .single();

    if (error || !proposal) {
      return res.status(404).json({ error: "Proposal not found or expired" });
    }

    // Check expiry
    if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
      return res.status(410).json({ error: "This proposal has expired" });
    }

    // Check password
    let pwd = "";
    if (proposal.password_hash) {
      pwd = readProposalPassword(req);
      if (!pwd) return res.status(403).json({ error: "Password required", passwordRequired: true });
      if (!verifyProposalPassword(pwd, proposal.password_hash)) {
        return res.status(403).json({ error: "Incorrect password", passwordRequired: true });
      }
    }

    // Increment view count
    const updates = {
      view_count: (proposal.view_count || 0) + 1,
      last_viewed_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from("living_proposals")
      .update(updates)
      .eq("id", proposal.id);

    if (proposal.password_hash) {
      await upgradeLegacyProposalPasswordHash({
        supabase: supabaseAdmin,
        proposalId: proposal.id,
        storedHash: proposal.password_hash,
        password: pwd,
        logLabel: "living-proposal",
      });
    }

    // Return data (strip sensitive fields)
    const { user_id: _userId, org_id: _orgId, password_hash: _passwordHash, ...publicData } = proposal;
    return res.status(200).json(publicData);
  } catch (err) {
    console.error("[living-proposal]", err);
    return res.status(500).json({ error: "Failed to load proposal" });
  }
}
