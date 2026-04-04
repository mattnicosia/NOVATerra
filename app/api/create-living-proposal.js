import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { cors } from "./lib/cors.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Verify JWT
  const auth = req.headers.authorization?.replace("Bearer ", "");
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(auth);
  if (authErr || !user) return res.status(401).json({ error: "Invalid token" });

  const { estimateId, proposalData, designConfig, companyInfo, projectInfo, recipientName, recipientEmail, password, expiresInDays } = req.body || {};

  if (!estimateId || !proposalData) {
    return res.status(400).json({ error: "Missing estimateId or proposalData" });
  }

  // Generate unique token (URL-safe, 12 chars)
  const token = Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map(b => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"[b % 64])
    .join("");

  // Optional password hash
  let passwordHash = null;
  if (password) {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(password));
    passwordHash = btoa(String.fromCharCode(...new Uint8Array(hash)));
  }

  // Compute expiry
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  try {
    const { data, error } = await supabaseAdmin
      .from("living_proposals")
      .insert({
        token,
        estimate_id: estimateId,
        user_id: user.id,
        org_id: user.user_metadata?.org_id || null,
        proposal_data: proposalData,
        design_config: designConfig || {},
        company_info: companyInfo || {},
        project_info: projectInfo || {},
        recipient_name: recipientName || null,
        recipient_email: recipientEmail || null,
        password_hash: passwordHash,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) throw error;

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://app-nova-42373ca7.vercel.app";

    return res.status(200).json({
      id: data.id,
      token: data.token,
      url: `${baseUrl}/p/${data.token}`,
      expiresAt: data.expires_at,
    });
  } catch (err) {
    console.error("[create-living-proposal]", err);
    return res.status(500).json({ error: "Failed to create proposal" });
  }
}
