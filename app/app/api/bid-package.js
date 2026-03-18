// Vercel Serverless Function — Bid Package CRUD
// POST: create package + generate invitation tokens
// GET: list packages for user with invitation statuses

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

  // ── CREATE BID PACKAGE (POST) ──
  if (req.method === "POST") {
    const { estimateId, name, scopeItems, scopeSheet, drawingIds, coverMessage, dueDate, subs } = req.body || {};

    if (!estimateId || !name) {
      return res.status(400).json({ error: "Missing required fields: estimateId, name" });
    }

    try {
      // Insert bid package
      // NOTE: estimate_id column must be TEXT (not UUID) — local IDs are short random strings
      const { data: pkg, error: pkgError } = await supabaseAdmin
        .from("bid_packages")
        .insert({
          user_id: user.id,
          estimate_id: estimateId,
          name,
          scope_items: scopeItems || [],
          drawing_ids: drawingIds || [],
          cover_message: coverMessage || "",
          scope_sheet: scopeSheet || "",
          due_date: dueDate || null,
          status: "active",
        })
        .select()
        .single();

      if (pkgError) throw pkgError;

      // Create invitations with unique tokens for each sub
      const invitations = [];
      if (Array.isArray(subs) && subs.length > 0) {
        const inviteRows = subs.map(sub => ({
          package_id: pkg.id,
          user_id: user.id,
          token: generateToken(),
          sub_company: sub.company || "",
          sub_contact: sub.contact || "",
          sub_email: sub.email,
          sub_phone: sub.phone || "",
          sub_trade: sub.trade || "",
          status: "pending",
        }));

        const { data: invData, error: invError } = await supabaseAdmin
          .from("bid_invitations")
          .insert(inviteRows)
          .select();

        if (invError) throw invError;
        invitations.push(...(invData || []));
      }

      console.log(`[bid-package] Created package=${pkg.id} invitations=${invitations.length}`);
      return res.status(200).json({ package: pkg, invitations });
    } catch (err) {
      console.error("[bid-package] Create error:", err);
      return res.status(500).json({ error: err.message || "Failed to create bid package" });
    }
  }

  // ── LIST BID PACKAGES (GET) ──
  if (req.method === "GET") {
    const { estimateId } = req.query || {};

    try {
      let query = supabaseAdmin
        .from("bid_packages")
        .select("*, bid_invitations(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (estimateId) {
        query = query.eq("estimate_id", estimateId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return res.status(200).json({ packages: data || [] });
    } catch (err) {
      console.error("[bid-package] List error:", err);
      return res.status(500).json({ error: err.message || "Failed to list packages" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
