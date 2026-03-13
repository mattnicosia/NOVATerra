// Vercel Serverless Function — Sub Pool query with reputation sorting
// GET with optional trade/market/search/exclude_emails filters — requires auth

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

  const { trade, trades, market, search, exclude_emails, limit: limitStr } = req.query || {};
  const limit = Math.min(parseInt(limitStr) || 50, 200);

  try {
    let query = supabaseAdmin
      .from('sub_pool')
      .select('*')
      .order('last_activity', { ascending: false })
      .limit(limit);

    // Multi-trade filter: match any of the provided trades
    if (trades) {
      const tradeList = trades.split(',').map(t => t.trim()).filter(Boolean);
      if (tradeList.length === 1) {
        query = query.ilike('trade', `%${tradeList[0]}%`);
      } else if (tradeList.length > 1) {
        // OR filter across trades
        const orFilter = tradeList.map(t => `trade.ilike.%${t}%`).join(',');
        query = query.or(orFilter);
      }
    } else if (trade) {
      query = query.ilike('trade', `%${trade}%`);
    }

    if (market) {
      query = query.ilike('market', `%${market}%`);
    }

    if (search) {
      query = query.or(`company.ilike.%${search}%,contact.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Exclude emails already in user's contacts (dedup)
    if (exclude_emails) {
      const emails = exclude_emails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
      if (emails.length > 0) {
        // Supabase PostgREST: not.in filter
        query = query.not('email', 'in', `(${emails.join(',')})`);
      }
    }

    const { data, error } = await query;
    if (error) throw error;

    // Compute reputation score and sort
    const scored = (data || []).map(s => {
      const proposals = s.proposal_count || 0;
      const wins = s.win_count || 0;
      const losses = s.loss_count || 0;
      const coverage = s.avg_coverage_score || 0;
      const responseHrs = s.avg_response_hours || 48; // default 48h if unknown
      const totalBids = wins + losses;
      const winRate = totalBids > 0 ? wins / totalBids : 0;

      return {
        ...s,
        _reputationScore: Math.round(
          (proposals * 0.3 + wins * 0.4 + coverage * 0.003 - responseHrs * 0.001) * 100
        ) / 100,
        _winRate: totalBids > 0 ? Math.round(winRate * 100) : null,
      };
    });

    scored.sort((a, b) => b._reputationScore - a._reputationScore);

    return res.status(200).json({ subs: scored });
  } catch (err) {
    console.error('[sub-pool] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to query sub pool' });
  }
}
