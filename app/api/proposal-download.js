// Vercel Serverless Function — Generate signed download URL for a proposal PDF
// POST { proposalId } → returns { url, filename }

import { supabaseAdmin } from './lib/supabaseAdmin.js';
import { cors } from './lib/cors.js';
import { authGuard } from './lib/authGuard.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authGuard(req, res);
  if (!user) return;

  if (!supabaseAdmin) return res.status(500).json({ error: 'Storage not configured' });

  const { proposalId } = req.body || {};
  if (!proposalId) return res.status(400).json({ error: 'Missing proposalId' });

  try {
    // Fetch proposal record
    const { data: proposal, error: propErr } = await supabaseAdmin
      .from('bid_proposals')
      .select('id, storage_path, filename, package_id, bid_packages(user_id)')
      .eq('id', proposalId)
      .single();

    if (propErr || !proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Verify ownership — package must belong to requesting user
    if (proposal.bid_packages?.user_id !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!proposal.storage_path) {
      return res.status(404).json({ error: 'No file stored for this proposal' });
    }

    // Generate signed download URL (1 hour expiry)
    const { data: urlData, error: urlErr } = await supabaseAdmin.storage
      .from('proposals')
      .createSignedUrl(proposal.storage_path, 3600);

    if (urlErr) throw urlErr;

    return res.status(200).json({
      url: urlData.signedUrl,
      filename: proposal.filename || 'proposal.pdf',
    });
  } catch (err) {
    console.error('[proposal-download] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate download URL' });
  }
}
