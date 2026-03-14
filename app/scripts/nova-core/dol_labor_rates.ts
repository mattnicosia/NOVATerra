// ============================================================
// NOVA Core — DOL Wage Determination API Import
// scripts/nova-core/dol_labor_rates.ts
//
// Hits the DOL SCA Wage Determination API, pulls prevailing wage
// rates for all SOC 47-xxxx construction trades across all US
// counties, maps to trade_ids, computes open_shop_rate, and
// upserts to labor_rates.
//
// Env: DOL_API_KEY, NOVA_CORE_SUPABASE_URL (or SUPABASE_URL),
//      NOVA_CORE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
//
// Run: npx tsx scripts/nova-core/dol_labor_rates.ts
// ============================================================

import { createClient } from '@supabase/supabase-js';

// ── Config ──
const DOL_API_KEY = process.env.DOL_API_KEY;
const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DOL_API_BASE = 'https://api.dol.gov/V1/SCA/WageRates';
const BATCH_SIZE = 500;
const BATCH_DELAY_MS = 1000;

if (!DOL_API_KEY) {
  console.error('ERROR: DOL_API_KEY environment variable is required.');
  console.error('Register at https://developer.dol.gov for a free API key.');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Supabase URL and service role key required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Types ──
interface TradeRow {
  id: string;
  code: string;
  soc_codes: string[];
  burden_multiplier: number;
  open_shop_ratio: number;
}

interface LaborRateRecord {
  trade_id: string;
  soc_code: string;
  county: string;
  state: string;
  metro_area: string;
  base_rate: number;
  burden_multiplier: number;
  open_shop_rate: number;
  source: 'dol_sca';
  data_vintage: string;
  created_at: string;
}

// ── SOC code to trade mapping ──
async function buildSocTradeMap(): Promise<Map<string, TradeRow>> {
  const { data: trades, error } = await supabase
    .from('trades')
    .select('id, code, soc_codes, burden_multiplier, open_shop_ratio');

  if (error) throw new Error(`Failed to fetch trades: ${error.message}`);
  if (!trades || trades.length === 0) throw new Error('No trades found. Run seed data first.');

  const socMap = new Map<string, TradeRow>();
  for (const trade of trades) {
    for (const soc of trade.soc_codes) {
      socMap.set(soc, trade as TradeRow);
    }
  }

  console.log(`Loaded ${trades.length} trades, mapped ${socMap.size} SOC codes.`);
  return socMap;
}

// ── Fetch DOL wage rates ──
async function fetchDolWageRates(skip: number, top: number): Promise<any[]> {
  const url = `${DOL_API_BASE}?$skip=${skip}&$top=${top}&$filter=startswith(OccupationCode,'47-')`;
  const res = await fetch(url, {
    headers: {
      'X-API-KEY': DOL_API_KEY!,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`DOL API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json.d?.results || json.value || json || [];
}

// ── Main import ──
async function main() {
  console.log('NOVA Core — DOL Labor Rates Import');
  console.log('==================================');

  const socMap = await buildSocTradeMap();

  let totalFetched = 0;
  let totalImported = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let hasMore = true;
  let skip = 0;
  const pageSize = 1000;
  const batch: LaborRateRecord[] = [];

  while (hasMore) {
    console.log(`Fetching DOL records (skip=${skip})...`);

    let records: any[];
    try {
      records = await fetchDolWageRates(skip, pageSize);
    } catch (err: any) {
      console.error(`Fetch error at skip=${skip}: ${err.message}`);
      // Retry once after delay
      await sleep(2000);
      try {
        records = await fetchDolWageRates(skip, pageSize);
      } catch (retryErr: any) {
        console.error(`Retry failed: ${retryErr.message}. Stopping.`);
        break;
      }
    }

    if (!records || records.length === 0) {
      hasMore = false;
      break;
    }

    totalFetched += records.length;

    for (const rec of records) {
      const socCode = rec.OccupationCode || rec.occupationCode || '';
      const trade = socMap.get(socCode);

      if (!trade) {
        totalSkipped++;
        continue;
      }

      const baseRate = parseFloat(rec.Rate || rec.rate || '0');
      if (baseRate <= 0) {
        totalSkipped++;
        continue;
      }

      batch.push({
        trade_id: trade.id,
        soc_code: socCode,
        county: rec.County || rec.county || rec.AreaName || '',
        state: rec.State || rec.state || rec.StateCode || '',
        metro_area: rec.MSAName || rec.msaName || rec.MetroArea || '',
        base_rate: baseRate,
        burden_multiplier: trade.burden_multiplier,
        open_shop_rate: parseFloat((baseRate * trade.open_shop_ratio).toFixed(2)),
        source: 'dol_sca',
        data_vintage: rec.EffectiveDate || rec.effectiveDate || new Date().toISOString().split('T')[0],
        created_at: new Date().toISOString(),
      });

      // Flush batch when full
      if (batch.length >= BATCH_SIZE) {
        const result = await flushBatch(batch);
        totalImported += result.imported;
        totalFailed += result.failed;
        batch.length = 0;
        await sleep(BATCH_DELAY_MS);
      }
    }

    skip += pageSize;

    if (records.length < pageSize) {
      hasMore = false;
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const result = await flushBatch(batch);
    totalImported += result.imported;
    totalFailed += result.failed;
  }

  console.log('\n==================================');
  console.log(`Import complete.`);
  console.log(`  Fetched:  ${totalFetched}`);
  console.log(`  Imported: ${totalImported}`);
  console.log(`  Skipped:  ${totalSkipped} (no matching trade or zero rate)`);
  console.log(`  Failed:   ${totalFailed}`);
}

async function flushBatch(batch: LaborRateRecord[]): Promise<{ imported: number; failed: number }> {
  const { error } = await supabase
    .from('labor_rates')
    .upsert(batch, { onConflict: 'trade_id,soc_code,county,state' });

  if (error) {
    console.error(`Batch upsert error (${batch.length} records): ${error.message}`);
    return { imported: 0, failed: batch.length };
  }

  console.log(`  Upserted ${batch.length} records.`);
  return { imported: batch.length, failed: 0 };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
