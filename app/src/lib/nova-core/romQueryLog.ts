// ============================================================
// NOVA Core — ROM Query Logger
// Server-side only. Logs every ROM query to rom_query_log
// for admin intelligence analytics.
// Uses NOVA_CORE_SERVICE_ROLE_KEY — never import on client.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NOVA_CORE_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';

const SERVICE_ROLE_KEY =
  process.env.NOVA_CORE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

function getServiceClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

export type RomQueryLogEntry = {
  csi_code_id: string;
  metro_area: string;
  display_flag: string;
  is_national: boolean;
};

/**
 * Log a ROM query to rom_query_log.
 * Fire-and-forget — errors are swallowed to never block the ROM response.
 */
export async function logRomQuery(entry: RomQueryLogEntry): Promise<void> {
  try {
    const client = getServiceClient();
    if (!client) return;

    await client.from('rom_query_log').insert({
      csi_code_id: entry.csi_code_id,
      metro_area: entry.metro_area,
      display_flag: entry.display_flag,
      is_national: entry.is_national,
    });
  } catch {
    // Swallow — never block ROM response for logging failures
  }
}
