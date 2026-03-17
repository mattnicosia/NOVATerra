// Vercel Serverless Function — Create a Living Proposal
// POST: creates a new living_proposals record with slug + access_token

import { cors } from "./lib/cors.js";
import { verifyUser } from "./lib/supabaseAdmin.js";
import { supabaseAdmin } from "./lib/supabaseAdmin.js";
import { generateSlug, generateAccessToken } from "./lib/slugGenerator.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await verifyUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const {
    estimateId,
    projectName,
    projectAddress,
    gcCompanyName,
    gcLogoUrl,
    gcAccentColor,
    gcPhone,
    gcEmail,
    ownerName,
    ownerEmail,
    ownerContactName,
    validDays,
    orgId,
  } = req.body || {};

  if (!estimateId || !projectName || !gcCompanyName) {
    return res.status(400).json({ error: "Missing required fields: estimateId, projectName, gcCompanyName" });
  }

  // Generate unique slug (retry on collision)
  let slug, accessToken;
  let attempts = 0;
  while (attempts < 5) {
    slug = generateSlug();
    accessToken = generateAccessToken();
    const { data: existing } = await supabaseAdmin
      .from("living_proposals")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    attempts++;
  }

  if (attempts >= 5) {
    return res.status(500).json({ error: "Failed to generate unique slug" });
  }

  const validUntil = validDays
    ? new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const { data, error } = await supabaseAdmin
    .from("living_proposals")
    .insert({
      org_id: orgId || user.user_metadata?.org_id || null,
      estimate_id: estimateId,
      user_id: user.id,
      slug,
      access_token: accessToken,
      status: "draft",
      gc_company_name: gcCompanyName,
      gc_logo_url: gcLogoUrl || null,
      gc_accent_color: gcAccentColor || "#7C5CFC",
      gc_phone: gcPhone || null,
      gc_email: gcEmail || user.email || null,
      project_name: projectName,
      project_address: projectAddress || null,
      owner_name: ownerName || null,
      owner_email: ownerEmail || null,
      owner_contact_name: ownerContactName || null,
      valid_days: validDays || null,
      valid_until: validUntil,
    })
    .select()
    .single();

  if (error) {
    console.error("[living-proposal-create] DB error:", error);
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    status: "ok",
    proposal: data,
    url: `${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:5173'}/p/${slug}`,
  });
}
