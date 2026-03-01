// Vercel Serverless Function — Sub Pool query
// GET with optional trade/market filters — requires auth

import { supabaseAdmin, verifyUser } from './lib/supabaseAdmin.js';
import { cors } from './lib/cors.js';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) return res.status(500).json({ error: 'Database not configured' });

  const user = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { trade, market, search, limit: limitStr } = req.query || {};
  const limit = Math.min(parseInt(limitStr) || 50, 200);

  try {
    let query = supabaseAdmin
      .from('sub_pool')
      .select('*')
      .order('last_activity', { ascending: false })
      .limit(limit);

    if (trade) {
      query = query.ilike('trade', `%${trade}%`);
    }

    if (market) {
      query = query.ilike('market', `%${market}%`);
    }

    if (search) {
      query = query.or(`company.ilike.%${search}%,contact.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.status(200).json({ subs: data || [] });
  } catch (err) {
    console.error('[sub-pool] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to query sub pool' });
  }
}
