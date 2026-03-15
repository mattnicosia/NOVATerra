// ============================================================
// NOVA Core — Isolated Supabase Client
// NEVER import from @/utils/supabase (the existing NOVATerra client).
// Uses NOVA_CORE_SUPABASE_URL / NOVA_CORE_SUPABASE_ANON_KEY env vars,
// falling back to VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { NovaCoreTables } from './types';

// Vite exposes env vars via import.meta.env, NOT process.env (browser context)
const supabaseUrl = (
  (import.meta as any).env?.VITE_NOVA_CORE_SUPABASE_URL ||
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  ''
).replace(/\\n/g, '').replace(/\n/g, '').trim();

const supabaseAnonKey = (
  (import.meta as any).env?.VITE_NOVA_CORE_SUPABASE_ANON_KEY ||
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  ''
).replace(/\\n/g, '').replace(/\n/g, '').trim();

// Debug: log client initialization status in dev
if ((import.meta as any).env?.DEV) {
  console.log('[NOVA Core] supabaseUrl:', supabaseUrl ? 'SET' : 'MISSING');
  console.log('[NOVA Core] supabaseAnonKey:', supabaseAnonKey ? 'SET' : 'MISSING');
}

export const novaCoreClient: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * Set the org context for the current Supabase session.
 * Calls the nova_core.set_org_context database function.
 */
export async function setOrgContext(orgId: string) {
  if (!novaCoreClient) throw new Error('NOVA Core Supabase client not initialized');
  const { error } = await novaCoreClient.rpc('set_org_context', { org_id: orgId });
  if (error) throw error;
}

// ── Typed query helpers for each backbone table ──

export function csiCodes() {
  if (!novaCoreClient) throw new Error('NOVA Core Supabase client not initialized');
  return novaCoreClient.from('csi_codes');
}

export function trades() {
  if (!novaCoreClient) throw new Error('NOVA Core Supabase client not initialized');
  return novaCoreClient.from('trades');
}

export function unitsOfMeasure() {
  if (!novaCoreClient) throw new Error('NOVA Core Supabase client not initialized');
  return novaCoreClient.from('units_of_measure');
}

export function buildingTypes() {
  if (!novaCoreClient) throw new Error('NOVA Core Supabase client not initialized');
  return novaCoreClient.from('building_types');
}

export function projectTypes() {
  if (!novaCoreClient) throw new Error('NOVA Core Supabase client not initialized');
  return novaCoreClient.from('project_types');
}

export function deliveryMethods() {
  if (!novaCoreClient) throw new Error('NOVA Core Supabase client not initialized');
  return novaCoreClient.from('delivery_methods');
}

export function costCategories() {
  if (!novaCoreClient) throw new Error('NOVA Core Supabase client not initialized');
  return novaCoreClient.from('cost_categories');
}

export function seasonalAdjustments() {
  if (!novaCoreClient) throw new Error('NOVA Core Supabase client not initialized');
  return novaCoreClient.from('seasonal_adjustments');
}
