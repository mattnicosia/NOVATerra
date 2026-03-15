// ============================================================
// NOVA Core — BLS OEWS State-Level Supplement
// scripts/nova-core/bls_state_supplement.ts
//
// Supplements metro-level import with state-level and
// nonmetropolitan area wage data from BLS OEWS.
//
// Run after bls_labor_rates.ts to fill gaps.
//
// Env: BLS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Run: npx tsx scripts/nova-core/bls_state_supplement.ts
// ============================================================

import { createClient } from '@supabase/supabase-js';

const BLS_API_KEY = process.env.BLS_API_KEY || '';
const SUPABASE_URL = process.env.NOVA_CORE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.NOVA_CORE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BLS_API_URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
const SERIES_PER_REQUEST = BLS_API_KEY ? 50 : 10;
const REQUEST_DELAY_MS = BLS_API_KEY ? 500 : 2000;
const BATCH_SIZE = 500;

// System org UUID for system-imported data (BLS seed data is cross-org)
const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000';

// State → climate zone mapping for seasonal adjustment lookups
const STATE_CLIMATE_ZONE: Record<string, string> = {
  // Northern
  AK: 'northern', CT: 'northern', IL: 'northern', IN: 'northern', IA: 'northern',
  ME: 'northern', MA: 'northern', MI: 'northern', MN: 'northern', NH: 'northern',
  NJ: 'northern', NY: 'northern', ND: 'northern', OH: 'northern', PA: 'northern',
  RI: 'northern', SD: 'northern', VT: 'northern', WI: 'northern',
  // Mountain
  CO: 'mountain', ID: 'mountain', MT: 'mountain', NV: 'mountain', NM: 'mountain',
  UT: 'mountain', WY: 'mountain',
  // Southern
  AL: 'southern', AR: 'southern', FL: 'southern', GA: 'southern', KY: 'southern',
  LA: 'southern', MS: 'southern', NC: 'southern', OK: 'southern', SC: 'southern',
  TN: 'southern', TX: 'southern', VA: 'southern', WV: 'southern',
  // Western
  AZ: 'western', CA: 'western', HI: 'western', OR: 'western', WA: 'western',
  // Central
  KS: 'central', MO: 'central', NE: 'central', DC: 'central', DE: 'central',
  MD: 'central', PR: 'southern',
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: Supabase credentials required.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface TradeRow {
  id: string;
  code: string;
  soc_codes: string[];
  burden_multiplier: number;
  open_shop_ratio: number;
}

interface LaborRateRecord {
  org_id: string;
  trade_id: string;
  soc_code: string;
  county: string;
  state: string;
  metro_area: string;
  climate_zone: string;
  base_rate: number;
  burden_multiplier: number;
  open_shop_rate: number;
  source: string;
  data_vintage: string;
  is_active: boolean;
  created_at: string;
}

// All 50 US states + DC + PR with FIPS codes
const STATES: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR',
};

// State FIPS → full name for metro_area field
const STATE_NAMES: Record<string, string> = {
  '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas', '06': 'California',
  '08': 'Colorado', '09': 'Connecticut', '10': 'Delaware', '11': 'District of Columbia', '12': 'Florida',
  '13': 'Georgia', '15': 'Hawaii', '16': 'Idaho', '17': 'Illinois', '18': 'Indiana',
  '19': 'Iowa', '20': 'Kansas', '21': 'Kentucky', '22': 'Louisiana', '23': 'Maine',
  '24': 'Maryland', '25': 'Massachusetts', '26': 'Michigan', '27': 'Minnesota', '28': 'Mississippi',
  '29': 'Missouri', '30': 'Montana', '31': 'Nebraska', '32': 'Nevada', '33': 'New Hampshire',
  '34': 'New Jersey', '35': 'New Mexico', '36': 'New York', '37': 'North Carolina', '38': 'North Dakota',
  '39': 'Ohio', '40': 'Oklahoma', '41': 'Oregon', '42': 'Pennsylvania', '44': 'Rhode Island',
  '45': 'South Carolina', '46': 'South Dakota', '47': 'Tennessee', '48': 'Texas', '49': 'Utah',
  '50': 'Vermont', '51': 'Virginia', '53': 'Washington', '54': 'West Virginia', '55': 'Wisconsin',
  '56': 'Wyoming', '72': 'Puerto Rico',
};

// BLS OEWS series ID formats:
// State: OEUS + FIPS(2) + 00000 + industry(6) + SOC(6) + datatype(2)
// Nonmetro: OEUM + stateNM(7) + industry(6) + SOC(6) + datatype(2)
// National: OEUN + 0000000 + industry(6) + SOC(6) + datatype(2)

function stateSeriesId(fips: string, socCode: string): string {
  const occ = socCode.replace('-', '');
  return `OEUS${fips}00000000000${occ}03`;
}

function nonmetroSeriesId(fips: string, socCode: string): string {
  const occ = socCode.replace('-', '');
  // Nonmetro area code format: state FIPS + 99999 padded to 7
  return `OEUM${fips}99999000000${occ}03`;
}

function nationalSeriesId(socCode: string): string {
  const occ = socCode.replace('-', '');
  return `OEUN0000000000000${occ}03`;
}

async function buildSocTradeMap(): Promise<Map<string, TradeRow[]>> {
  const { data: trades, error } = await supabase
    .from('trades')
    .select('id, code, soc_codes, burden_multiplier, open_shop_ratio');

  if (error) throw new Error(`Failed to fetch trades: ${error.message}`);
  if (!trades || trades.length === 0) throw new Error('No trades found.');

  const socMap = new Map<string, TradeRow[]>();
  for (const trade of trades) {
    for (const soc of trade.soc_codes) {
      const existing = socMap.get(soc) || [];
      existing.push(trade as TradeRow);
      socMap.set(soc, existing);
    }
  }
  return socMap;
}

async function fetchBlsSeries(seriesIds: string[]): Promise<Map<string, number>> {
  const body: any = {
    seriesid: seriesIds,
    startyear: '2024',
    endyear: '2024',
  };
  if (BLS_API_KEY) body.registrationkey = BLS_API_KEY;

  const res = await fetch(BLS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`BLS API error: ${res.status}`);
  const json = await res.json();
  if (json.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS: ${json.message?.join('; ')}`);
  }

  const results = new Map<string, number>();
  for (const series of json.Results?.series || []) {
    const latest = series.data?.[0];
    if (latest?.value) {
      const rate = parseFloat(latest.value);
      if (rate > 0) results.set(series.seriesID, rate);
    }
  }
  return results;
}

async function main() {
  console.log('NOVA Core — BLS State-Level Supplement');
  console.log('======================================');

  const socMap = await buildSocTradeMap();
  const uniqueSocs = Array.from(socMap.keys());
  const fipsCodes = Object.keys(STATES);

  // Build all series: state-level + nonmetro + national
  interface SeriesMeta {
    seriesId: string;
    socCode: string;
    state: string;
    metroArea: string;
    type: 'state' | 'nonmetro' | 'national';
  }

  const allSeries: SeriesMeta[] = [];

  // National-level
  for (const soc of uniqueSocs) {
    allSeries.push({
      seriesId: nationalSeriesId(soc),
      socCode: soc,
      state: 'US',
      metroArea: 'National',
      type: 'national',
    });
  }

  // State-level
  for (const fips of fipsCodes) {
    for (const soc of uniqueSocs) {
      allSeries.push({
        seriesId: stateSeriesId(fips, soc),
        socCode: soc,
        state: STATES[fips],
        metroArea: `${STATE_NAMES[fips]} (Statewide)`,
        type: 'state',
      });
    }
  }

  // Nonmetro areas
  for (const fips of fipsCodes) {
    for (const soc of uniqueSocs) {
      allSeries.push({
        seriesId: nonmetroSeriesId(fips, soc),
        socCode: soc,
        state: STATES[fips],
        metroArea: `${STATE_NAMES[fips]} (Nonmetropolitan)`,
        type: 'nonmetro',
      });
    }
  }

  console.log(`Total series to fetch: ${allSeries.length}`);
  console.log(`  National: ${uniqueSocs.length}`);
  console.log(`  State-level: ${fipsCodes.length * uniqueSocs.length}`);
  console.log(`  Nonmetro: ${fipsCodes.length * uniqueSocs.length}`);

  // Chunk and fetch
  const chunks: SeriesMeta[][] = [];
  for (let i = 0; i < allSeries.length; i += SERIES_PER_REQUEST) {
    chunks.push(allSeries.slice(i, i + SERIES_PER_REQUEST));
  }

  console.log(`API requests needed: ${chunks.length}\n`);

  let totalImported = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let requestCount = 0;
  const dbBatch: LaborRateRecord[] = [];
  const now = new Date().toISOString();

  for (const chunk of chunks) {
    requestCount++;
    if (requestCount % 5 === 0 || requestCount === 1) {
      console.log(`Request ${requestCount}/${chunks.length} (${totalImported} imported)...`);
    }

    let results: Map<string, number>;
    try {
      results = await fetchBlsSeries(chunk.map(s => s.seriesId));
    } catch (err: any) {
      if (err.message.includes('threshold') || err.message.includes('limit')) {
        console.error(`Rate limit hit. Stopping with ${totalImported} imported.`);
        break;
      }
      console.error(`Request ${requestCount} failed: ${err.message}`);
      totalSkipped += chunk.length;
      await sleep(REQUEST_DELAY_MS * 2);
      continue;
    }

    for (const meta of chunk) {
      const baseRate = results.get(meta.seriesId);
      if (!baseRate) { totalSkipped++; continue; }

      const trades = socMap.get(meta.socCode) || [];
      for (const trade of trades) {
        dbBatch.push({
          org_id: SYSTEM_ORG_ID,
          trade_id: trade.id,
          soc_code: meta.socCode,
          county: '',
          state: meta.state,
          metro_area: meta.metroArea,
          climate_zone: STATE_CLIMATE_ZONE[meta.state] || 'central',
          base_rate: baseRate,
          burden_multiplier: trade.burden_multiplier,
          open_shop_rate: parseFloat((baseRate * trade.open_shop_ratio).toFixed(2)),
          source: 'bls_oews',
          data_vintage: '2024',
          is_active: true,
          created_at: now,
        });
      }
    }

    if (dbBatch.length >= BATCH_SIZE) {
      const result = await flushBatch(dbBatch.splice(0, BATCH_SIZE));
      totalImported += result.imported;
      totalFailed += result.failed;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  if (dbBatch.length > 0) {
    const result = await flushBatch(dbBatch);
    totalImported += result.imported;
    totalFailed += result.failed;
  }

  console.log('\n======================================');
  console.log(`Supplement complete.`);
  console.log(`  Imported: ${totalImported}`);
  console.log(`  Skipped: ${totalSkipped}`);
  console.log(`  Failed: ${totalFailed}`);
}

async function flushBatch(batch: LaborRateRecord[]): Promise<{ imported: number; failed: number }> {
  const { error } = await supabase
    .from('labor_rates')
    .upsert(batch, { onConflict: 'trade_id,soc_code,metro_area,state' });

  if (error) {
    console.error(`Upsert error (${batch.length}): ${error.message}`);
    return { imported: 0, failed: batch.length };
  }
  return { imported: batch.length, failed: 0 };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
