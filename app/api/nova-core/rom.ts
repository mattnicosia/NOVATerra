// ============================================================
// NOVA Core — ROM API Route
// POST /api/nova-core/rom
//
// Server-side only. Accepts project parameters, returns a
// RomResult with optional extended costs for a given quantity.
// Never exposes stack traces or database errors to the client.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRomResult } from '../src/lib/nova-core/rom';
import { logRomQuery } from '../src/lib/nova-core/romQueryLog';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── M2: Guard against malformed JSON ──
  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.body || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  try {
    // ── Validate required fields ──

    const { csi_code_id, metro_area, project_type_code } = body;

    const missing: string[] = [];
    if (!csi_code_id) missing.push('csi_code_id');
    if (!metro_area) missing.push('metro_area');
    if (!project_type_code) missing.push('project_type_code');

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    // ── Assemble request (M3: warn on missing trade_id / state) ──

    const trade_id = (body.trade_id as string) || '';
    const state = (body.state as string) || '';

    if (!trade_id) {
      console.warn('[rom] Missing trade_id — location factor will default to 1.000');
    }
    if (!state) {
      console.warn('[rom] Missing state — location factor will default to 1.000');
    }

    const request = {
      csi_code_id: csi_code_id as string,
      trade_id,
      building_type_id: (body.building_type_id as string) || null,
      project_type_code: project_type_code as string,
      delivery_method_code: (body.delivery_method_code as string) || 'DBB',
      state,
      metro_area: metro_area as string,
      gross_sf: Number(body.gross_sf) || 0,
    };

    // ── Call ROM engine ──

    const result = await getRomResult(request);

    // ── Extended costs ──

    let extended_costs: {
      p10_extended: number | null;
      p50_extended: number | null;
      p90_extended: number | null;
      co2e_extended: number | null;
    } | null = null;

    if (body.quantity != null && Number(body.quantity) > 0) {
      const q = Number(body.quantity);
      const { adjusted_band, carbon } = result;

      extended_costs = {
        p10_extended:
          adjusted_band.p10 !== null
            ? Math.round(adjusted_band.p10 * q * 100) / 100
            : null,
        p50_extended:
          adjusted_band.p50 !== null
            ? Math.round(adjusted_band.p50 * q * 100) / 100
            : null,
        p90_extended:
          adjusted_band.p90 !== null
            ? Math.round(adjusted_band.p90 * q * 100) / 100
            : null,
        co2e_extended:
          carbon?.total_co2e != null
            ? Math.round(carbon.total_co2e * q * 10000) / 10000
            : null,
      };
    }

    // ── Log query (awaited, but failure must not break response) ──

    try {
      await logRomQuery({
        csi_code_id: request.csi_code_id,
        metro_area: request.metro_area,
        display_flag: result.display_flag,
        is_national: result.is_national,
      });
    } catch (logErr) {
      console.error('[rom] logRomQuery failed:', logErr instanceof Error ? logErr.message : logErr);
    }

    return res.status(200).json({ ...result, extended_costs });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
