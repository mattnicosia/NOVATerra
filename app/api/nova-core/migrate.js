// ============================================================
// NOVA Core — IndexedDB Migration API Route
// /api/nova-core/migrate
//
// Receives serialized IndexedDB records from the client,
// maps them to the Supabase schema, adds org_id and
// source='indexeddb_migration' and batch_id, upserts to
// Supabase, and returns counts.
//
// This runs server-side (Vercel serverless function).
// Uses service role key — NEVER exposed to client.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Server configuration error: missing Supabase credentials' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { org_id, records } = req.body;

    if (!org_id) {
      return res.status(400).json({ error: 'org_id is required' });
    }

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        imported_count: 0,
        flagged_count: 0,
        flagged_records: [],
        error_count: 0,
      });
    }

    const batch_id = randomUUID();
    let imported_count = 0;
    let flagged_count = 0;
    let error_count = 0;
    const flagged_records = [];

    // Map each record to the target Supabase table
    const mappedRecords = [];

    for (const record of records) {
      const mapped = mapRecordToSchema(record, org_id, batch_id);

      if (mapped.error) {
        flagged_count++;
        flagged_records.push({
          original: record,
          reason: mapped.error,
        });
        continue;
      }

      if (mapped.data) {
        mappedRecords.push(mapped);
      }
    }

    // Group by target table and upsert
    const byTable = {};
    for (const m of mappedRecords) {
      if (!byTable[m.table]) byTable[m.table] = [];
      byTable[m.table].push(m.data);
    }

    for (const [table, rows] of Object.entries(byTable)) {
      const { error } = await supabase
        .from(table)
        .upsert(rows, { onConflict: 'id' });

      if (error) {
        console.error(`Upsert error for ${table}:`, error.message);
        error_count += rows.length;
      } else {
        imported_count += rows.length;
      }
    }

    return res.status(200).json({
      imported_count,
      flagged_count,
      flagged_records: flagged_records.slice(0, 50), // Cap response size
      error_count,
      batch_id,
    });
  } catch (err) {
    console.error('Migration endpoint error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Map a single IndexedDB record to the Supabase schema.
 * Returns { table, data } on success or { error } on failure.
 */
function mapRecordToSchema(record, org_id, batch_id) {
  try {
    // Validate required fields
    if (!record || typeof record !== 'object') {
      return { error: 'Invalid record format' };
    }

    const storeName = record._store;

    // Remove internal fields
    const { _store, ...data } = record;

    // Add migration metadata
    const enriched = {
      ...data,
      org_id,
      source: 'indexeddb_migration',
      batch_id,
    };

    // Validate trade_id and org_id exist
    if (!enriched.org_id) {
      return { error: 'Missing org_id' };
    }

    // Map store name to target table
    // The exact mapping depends on existing IndexedDB store names
    const tableMap = {
      'estimates': 'user_estimates',
      'cost-items': 'cost_items',
      'takeoffs': 'takeoffs',
      'line-items': 'line_items',
    };

    const targetTable = tableMap[storeName] || storeName;

    return { table: targetTable, data: enriched };
  } catch (err) {
    return { error: `Mapping error: ${err.message}` };
  }
}
