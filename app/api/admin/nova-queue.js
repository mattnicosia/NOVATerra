// ============================================================
// NOVA Core — Admin Queue Endpoint
// GET  /api/admin/nova-queue  — fetch flagged records
// POST /api/admin/nova-queue  — resolve or escalate a record
//
// Flagged records:
//   unit_costs where outlier_flag=true
//   proposals where potential_duplicate=true or pending_context=true
// Uses NOVA_CORE_SERVICE_ROLE_KEY (server-side only).
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  const cookie = parseCookies(req.headers.cookie || '');
  const ADMIN_SECRET = process.env.NOVA_ADMIN_SECRET;
  if (!ADMIN_SECRET || cookie.nova_admin_token !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ── GET: fetch all flagged records ──
  if (req.method === 'GET') {
    try {
      const items = [];

      // unit_costs: outlier_flag=true
      const { data: outliers, error: oErr } = await supabase
        .from('unit_costs')
        .select('id, csi_code_id, trade_id, unit_cost, outlier_flag, outlier_pass, created_at')
        .eq('outlier_flag', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!oErr && outliers) {
        for (const r of outliers) {
          items.push({
            table: 'unit_costs',
            record_id: r.id,
            reason: `Outlier (pass ${r.outlier_pass})`,
            unit_cost: r.unit_cost,
            date_flagged: r.created_at,
          });
        }
      }

      // proposals: potential_duplicate=true
      const { data: dupes, error: dErr } = await supabase
        .from('proposals')
        .select('id, submitting_org_name, base_bid_value, potential_duplicate, duplicate_of, created_at')
        .eq('potential_duplicate', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!dErr && dupes) {
        for (const r of dupes) {
          items.push({
            table: 'proposals',
            record_id: r.id,
            reason: `Potential duplicate${r.duplicate_of ? ` of ${r.duplicate_of}` : ''}`,
            detail: `${r.submitting_org_name} — $${Number(r.base_bid_value).toLocaleString()}`,
            date_flagged: r.created_at,
          });
        }
      }

      // proposals: pending_context=true
      const { data: pending, error: pErr } = await supabase
        .from('proposals')
        .select('id, submitting_org_name, base_bid_value, pending_context, created_at')
        .eq('pending_context', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!pErr && pending) {
        for (const r of pending) {
          items.push({
            table: 'proposals',
            record_id: r.id,
            reason: 'Pending context',
            detail: `${r.submitting_org_name} — $${Number(r.base_bid_value).toLocaleString()}`,
            date_flagged: r.created_at,
          });
        }
      }

      // Sort all by date descending
      items.sort((a, b) => new Date(b.date_flagged) - new Date(a.date_flagged));

      return res.status(200).json({ items, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('Admin nova-queue GET error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ── POST: resolve or escalate a flagged record ──
  if (req.method === 'POST') {
    try {
      const { action, table, record_id, note } = req.body || {};

      if (!action || !table || !record_id) {
        return res.status(400).json({ error: 'Missing action, table, or record_id' });
      }

      if (!['resolve', 'escalate'].includes(action)) {
        return res.status(400).json({ error: 'Action must be resolve or escalate' });
      }

      if (!['unit_costs', 'proposals'].includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
      }

      // Resolve: clear the flag
      if (action === 'resolve') {
        if (table === 'unit_costs') {
          const { error } = await supabase
            .from('unit_costs')
            .update({ outlier_flag: false, updated_at: new Date().toISOString() })
            .eq('id', record_id);
          if (error) return res.status(500).json({ error: error.message });
        } else if (table === 'proposals') {
          const { error } = await supabase
            .from('proposals')
            .update({ potential_duplicate: false, pending_context: false })
            .eq('id', record_id);
          if (error) return res.status(500).json({ error: error.message });
        }
      }

      // Write to admin_action_log (both resolve and escalate)
      const { error: logErr } = await supabase
        .from('admin_action_log')
        .insert({
          action_type: action,
          record_table: table,
          record_id,
          admin_note: note || null,
        });

      if (logErr) {
        console.error('Failed to write admin_action_log:', logErr.message);
      }

      return res.status(200).json({ success: true, action, table, record_id });
    } catch (err) {
      console.error('Admin nova-queue POST error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(';').forEach(part => {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key] = rest.join('=');
  });
  return cookies;
}
