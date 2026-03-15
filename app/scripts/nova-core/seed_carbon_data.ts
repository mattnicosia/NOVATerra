// ============================================================
// NOVA Core — Carbon Data Seed (ICE Database Generic Averages)
// scripts/nova-core/seed_carbon_data.ts
//
// Populates the carbon_data table with ICE Database generic
// averages for all 19 NOVA Core trades. Reads the trades table
// to get trade_ids, then inserts one carbon_data record per
// CSI code per trade with these fields:
//   - csi_code_id, trade_id, material_name, canonical_unit
//   - ice_co2e, a1_a3_co2e, transport_co2e_pct, a4_co2e, a5_co2e
//   - total_co2e, active_co2e_source, transport_assumption_disclosed
//   - data_vintage, org_id = SYSTEM_ORG_ID
//
// Run: npx tsx scripts/nova-core/seed_carbon_data.ts
// ============================================================

import { createClient } from '@supabase/supabase-js';

// ── Config ──
const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BATCH_SIZE = 500;

// Org ID — fetched dynamically from organizations table.
// Unlike labor_rates (which use a zero-UUID system org), carbon_data
// uses the first real org since organizations requires an owner_id FK.
let SYSTEM_ORG_ID = '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Supabase URL and service role key required.');
  console.error('Set NOVA_CORE_SUPABASE_URL and NOVA_CORE_SERVICE_ROLE_KEY (or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── ICE Database generic averages ──
// kg CO2e per canonical unit, keyed by material_name.
// Source: ICE (Inventory of Carbon and Energy) Database v3.0
// These are generic averages by material type — Sprint 6 adds EPD-specific values.
interface IceMaterial {
  material_name: string;
  ice_co2e: number;           // kg CO2e per canonical unit
  canonical_unit: string;     // Must match csi_codes.canonical_unit
  transport_co2e_pct: number; // Heavy structural: 0.12, light: 0.05
}

// Trade code → array of materials with ICE generic averages
// Trade codes must match the `code` column in the trades table exactly.
const TRADE_MATERIALS: Record<string, IceMaterial[]> = {
  // Heavy structural — transport 12%
  CONC: [
    { material_name: 'concrete', ice_co2e: 350, canonical_unit: 'CY', transport_co2e_pct: 0.12 },
    { material_name: 'rebar', ice_co2e: 0.62, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
  ],
  STRUCT_STEEL: [
    { material_name: 'structural steel', ice_co2e: 0.54, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
  ],
  MISC_METALS: [
    { material_name: 'structural steel', ice_co2e: 0.54, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
    { material_name: 'aluminum', ice_co2e: 4.20, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
  ],
  MASON: [
    { material_name: 'masonry', ice_co2e: 0.05, canonical_unit: 'SF', transport_co2e_pct: 0.05 },
  ],
  // Carpentry — light materials
  ROUGH_CARP: [
    { material_name: 'dimensional lumber', ice_co2e: 0.45, canonical_unit: 'BF', transport_co2e_pct: 0.05 },
  ],
  FINISH_CARP: [
    { material_name: 'dimensional lumber', ice_co2e: 0.45, canonical_unit: 'BF', transport_co2e_pct: 0.05 },
  ],
  // Envelope
  WATERPROOF: [
    { material_name: 'insulation', ice_co2e: 0.12, canonical_unit: 'SF', transport_co2e_pct: 0.05 },
  ],
  INSULATION: [
    { material_name: 'insulation', ice_co2e: 0.12, canonical_unit: 'SF', transport_co2e_pct: 0.05 },
  ],
  DOORS_WINDOWS: [
    { material_name: 'glass', ice_co2e: 0.85, canonical_unit: 'SF', transport_co2e_pct: 0.05 },
    { material_name: 'aluminum', ice_co2e: 4.20, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
  ],
  // Interior finishes — light
  FINISHES: [
    { material_name: 'drywall', ice_co2e: 0.0025, canonical_unit: 'SF', transport_co2e_pct: 0.05 },
    { material_name: 'finishes', ice_co2e: 0.05, canonical_unit: 'SF', transport_co2e_pct: 0.05 },
  ],
  FLOORING: [
    { material_name: 'finishes', ice_co2e: 0.05, canonical_unit: 'SF', transport_co2e_pct: 0.05 },
  ],
  SPECIALTIES: [
    { material_name: 'structural steel', ice_co2e: 0.54, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
  ],
  // MEP — mixed heavy/light
  PLUMBING: [
    { material_name: 'PVC', ice_co2e: 0.18, canonical_unit: 'LF', transport_co2e_pct: 0.05 },
    { material_name: 'copper', ice_co2e: 2.80, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
  ],
  FIRE_PROT: [
    { material_name: 'structural steel', ice_co2e: 0.54, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
  ],
  HVAC: [
    { material_name: 'structural steel', ice_co2e: 0.54, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
    { material_name: 'copper', ice_co2e: 2.80, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
  ],
  ELECTRICAL: [
    { material_name: 'copper', ice_co2e: 2.80, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
    { material_name: 'PVC', ice_co2e: 0.18, canonical_unit: 'LF', transport_co2e_pct: 0.05 },
  ],
  ELEVATOR: [
    { material_name: 'structural steel', ice_co2e: 0.54, canonical_unit: 'LB', transport_co2e_pct: 0.12 },
  ],
  // Site
  SITEWORK: [
    { material_name: 'concrete', ice_co2e: 350, canonical_unit: 'CY', transport_co2e_pct: 0.12 },
  ],
  DEMO: [
    { material_name: 'concrete', ice_co2e: 350, canonical_unit: 'CY', transport_co2e_pct: 0.12 },
  ],
};

// ── Types ──
interface TradeRow {
  id: string;
  code: string;
  name: string;
  csi_divisions: number[];
}

interface CsiCodeRow {
  id: string;
  division: number;
  section: string;
  title: string;
  canonical_unit: string | null;
}

interface CarbonDataRecord {
  org_id: string;
  csi_code_id: string;
  trade_id: string;
  material_name: string;
  canonical_unit: string;
  ice_co2e: number;
  a1_a3_co2e: number;
  transport_co2e_pct: number;
  a4_co2e: number;
  a5_co2e: number;
  total_co2e: number;
  active_co2e_source: string;
  transport_assumption_disclosed: boolean;
  data_vintage: string;
}

// ── Main ──
async function main() {
  console.log('NOVA Core — Carbon Data Seed (ICE Database Generic Averages)');
  console.log('=============================================================');

  // 0. Resolve org_id — use first organization (system seed data)
  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .limit(1)
    .single();

  if (orgError || !orgs) throw new Error(`Failed to fetch organization: ${orgError?.message}`);
  SYSTEM_ORG_ID = orgs.id;
  console.log(`Using org: ${orgs.name} (${SYSTEM_ORG_ID})`);

  // 1. Fetch all trades
  const { data: trades, error: tradesError } = await supabase
    .from('trades')
    .select('id, code, name, csi_divisions');

  if (tradesError) throw new Error(`Failed to fetch trades: ${tradesError.message}`);
  if (!trades || trades.length === 0) throw new Error('No trades found. Run backbone seed first.');

  console.log(`Loaded ${trades.length} trades.`);

  // 2. Fetch all CSI codes (level 2 = section level, most useful for carbon mapping)
  const { data: csiCodes, error: csiError } = await supabase
    .from('csi_codes')
    .select('id, division, section, title, canonical_unit');

  if (csiError) throw new Error(`Failed to fetch CSI codes: ${csiError.message}`);
  if (!csiCodes || csiCodes.length === 0) throw new Error('No CSI codes found. Run backbone seed first.');

  console.log(`Loaded ${csiCodes.length} CSI codes.`);

  // 3. Build carbon_data records
  const records: CarbonDataRecord[] = [];
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  let matchedTrades = 0;
  let skippedTrades = 0;

  for (const trade of trades as TradeRow[]) {
    const materials = TRADE_MATERIALS[trade.code];
    if (!materials) {
      console.log(`  SKIP: No ICE data mapped for trade ${trade.code} (${trade.name})`);
      skippedTrades++;
      continue;
    }

    matchedTrades++;

    // Find CSI codes in this trade's divisions
    const tradeCsiCodes = (csiCodes as CsiCodeRow[]).filter(
      c => trade.csi_divisions.includes(c.division)
    );

    if (tradeCsiCodes.length === 0) {
      console.log(`  SKIP: No CSI codes found for trade ${trade.code} divisions [${trade.csi_divisions.join(', ')}]`);
      continue;
    }

    // For each material in this trade, create a record for each matching CSI code
    for (const mat of materials) {
      for (const csi of tradeCsiCodes) {
        const a1_a3_co2e = mat.ice_co2e; // Same as ice_co2e — product stage
        const a4_co2e = parseFloat((a1_a3_co2e * mat.transport_co2e_pct).toFixed(4));
        const a5_co2e = parseFloat((a1_a3_co2e * 0.05).toFixed(4));
        const total_co2e = parseFloat((a1_a3_co2e + a4_co2e + a5_co2e).toFixed(4));

        records.push({
          org_id: SYSTEM_ORG_ID,
          csi_code_id: csi.id,
          trade_id: trade.id,
          material_name: mat.material_name,
          canonical_unit: mat.canonical_unit,
          ice_co2e: mat.ice_co2e,
          a1_a3_co2e,
          transport_co2e_pct: mat.transport_co2e_pct,
          a4_co2e,
          a5_co2e,
          total_co2e,
          active_co2e_source: 'ice_generic',
          transport_assumption_disclosed: true,
          data_vintage: today,
        });
      }
    }
  }

  console.log(`\nTrades matched: ${matchedTrades}, skipped: ${skippedTrades}`);
  console.log(`Total carbon_data records to insert: ${records.length}`);

  if (records.length === 0) {
    console.error('No records generated. Check trade codes and CSI divisions.');
    process.exit(1);
  }

  // 4. Batch upsert to carbon_data
  let totalInserted = 0;
  let totalFailed = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('carbon_data')
      .insert(batch);

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error.message}`);
      totalFailed += batch.length;
    } else {
      totalInserted += batch.length;
    }
  }

  console.log('\n=============================================================');
  console.log('Seed complete.');
  console.log(`  Records inserted: ${totalInserted}`);
  console.log(`  Records failed: ${totalFailed}`);

  // 5. Verification query
  const { count } = await supabase
    .from('carbon_data')
    .select('*', { count: 'exact', head: true })
    .eq('active_co2e_source', 'ice_generic');

  console.log(`  Verification: ${count} ice_generic records in carbon_data.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
