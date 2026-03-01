// Vercel Serverless Function — Public portal endpoint (no auth required)
// GET ?token=xxx — returns bid package info, scope, drawings for sub portal

import { supabaseAdmin } from './lib/supabaseAdmin.js';
import { cors } from './lib/cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' });

  const { token } = req.query || {};
  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }

  try {
    // Look up invitation by token
    const { data: inv, error: invErr } = await supabaseAdmin
      .from('bid_invitations')
      .select('*, bid_packages(*)')
      .eq('token', token)
      .single();

    if (invErr || !inv) {
      return res.status(404).json({ error: 'Invalid or expired invitation' });
    }

    const pkg = inv.bid_packages;

    // Update opened_at timestamp (first open only)
    if (!inv.opened_at) {
      await supabaseAdmin
        .from('bid_invitations')
        .update({
          opened_at: new Date().toISOString(),
          status: inv.status === 'sent' || inv.status === 'pending' ? 'opened' : inv.status,
        })
        .eq('id', inv.id);
    }

    // Get GC user info for display
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(inv.user_id);
    const gcCompany = userData?.user?.user_metadata?.company || 'General Contractor';

    // Generate signed download URLs for drawings
    const drawingUrls = [];
    const drawingIds = Array.isArray(pkg.drawing_ids) ? pkg.drawing_ids : [];

    if (drawingIds.length > 0) {
      // Fetch estimate data to get drawing metadata
      const { data: estData } = await supabaseAdmin
        .from('user_estimates')
        .select('data')
        .eq('user_id', inv.user_id)
        .eq('estimate_id', pkg.estimate_id)
        .single();

      if (estData?.data?.drawings) {
        const drawings = estData.data.drawings;
        for (const drawingId of drawingIds) {
          const drawing = drawings.find(d => d.id === drawingId);
          if (drawing?.storagePath) {
            const { data: urlData } = await supabaseAdmin.storage
              .from('blobs')
              .createSignedUrl(drawing.storagePath, 7200); // 2-hour expiry

            if (urlData?.signedUrl) {
              drawingUrls.push({
                id: drawing.id,
                name: drawing.name || drawing.label || `Drawing ${drawingId}`,
                label: drawing.label || '',
                url: urlData.signedUrl,
              });
            }
          }
        }
      }
    }

    // Check if already submitted
    const { data: existing } = await supabaseAdmin
      .from('bid_proposals')
      .select('id')
      .eq('invitation_id', inv.id)
      .limit(1);

    const alreadySubmitted = existing && existing.length > 0;

    return res.status(200).json({
      invitation: {
        id: inv.id,
        subCompany: inv.sub_company,
        subContact: inv.sub_contact,
        status: inv.status,
      },
      package: {
        id: pkg.id,
        name: pkg.name,
        scopeItems: pkg.scope_items,
        coverMessage: pkg.cover_message,
        dueDate: pkg.due_date,
        status: pkg.status,
      },
      gcCompany,
      drawings: drawingUrls,
      alreadySubmitted,
    });
  } catch (err) {
    console.error('[portal] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
