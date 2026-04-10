// Vercel Serverless Function — Portal upload (no auth required)
// POST { token, filename, contentType } → returns signed upload URL + proposalId
// Sub uploads file directly to Supabase Storage (bypasses Vercel 4.5MB limit)

import { supabaseAdmin } from './lib/supabaseAdmin.js';
import { cors } from './lib/cors.js';
import { isPastDueDate, isPortalSubmissionLocked } from "./lib/portalAccess.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: 'Storage not configured' });

  const { token, filename, contentType } = req.body || {};

  if (!token || !filename) {
    return res.status(400).json({ error: 'Missing token or filename' });
  }

  try {
    // Verify token
    const { data: inv, error: invErr } = await supabaseAdmin
      .from('bid_invitations')
      .select('id, package_id, user_id, status, bid_packages(due_date)')
      .eq('token', token)
      .single();

    if (invErr || !inv) {
      return res.status(404).json({ error: 'Invalid invitation token' });
    }
    if (isPortalSubmissionLocked(inv.status)) {
      return res.status(400).json({ error: 'This invitation has already been submitted' });
    }

    // Check if past due
    const pkg = inv.bid_packages;
    if (isPastDueDate(pkg?.due_date)) {
      return res.status(410).json({ error: 'This bid invitation has passed its due date' });
    }

    // Create proposal record
    const storagePath = `proposals/${inv.user_id}/${inv.package_id}/${inv.id}/${filename}`;

    const { data: proposal, error: propErr } = await supabaseAdmin
      .from('bid_proposals')
      .insert({
        invitation_id: inv.id,
        package_id: inv.package_id,
        storage_path: storagePath,
        filename,
        content_type: contentType || 'application/pdf',
        parse_status: 'pending',
      })
      .select()
      .single();

    if (propErr) throw propErr;

    // Generate signed upload URL
    const { data: uploadData, error: uploadErr } = await supabaseAdmin.storage
      .from('proposals')
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (uploadErr) throw uploadErr;

    return res.status(200).json({
      proposalId: proposal.id,
      signedUrl: uploadData.signedUrl,
      token: uploadData.token,
      storagePath,
    });
  } catch (err) {
    console.error('[portal-upload] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to create upload URL' });
  }
}
