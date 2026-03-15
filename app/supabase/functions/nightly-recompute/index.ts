// ============================================================
// NOVA Core — Nightly Recompute Edge Function
// Scheduled via cron at 2 AM Eastern (7 AM UTC).
// 6-step pipeline:
//   1. Recalculate recency_weight on all unit_costs
//   2. Rebuild contribution_weight = source × recency × geo × outlier
//   3. Rebuild sf_benchmarks running state from scratch
//   4. Recompute Market Tension Index for all metros
//   5. Recompute PDC benchmarks P10/P50/P90
//   6. REFRESH MATERIALIZED VIEW CONCURRENTLY market_intelligence_view
// Uses NOVA_CORE_SERVICE_ROLE_KEY for all operations.
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ── Supabase admin client (service role — bypasses RLS) ──

const SUPABASE_URL = Deno.env.get('NOVA_CORE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('NOVA_CORE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Constants ──

// System org UUID for cross-org / system-generated rows (location_factors, etc.)
const SYSTEM_ORG_ID = '00000000-0000-0000-0000-000000000000';

const RECENCY_DECAY = 0.015; // λ for EXP(-λ × days)
const SECONDS_PER_DAY = 86400.0;

// Market Tension Index weights
const MTI_WEIGHTS = {
  proposal_volume: 0.30,
  bid_count_per_project: 0.25,
  bid_spread: 0.25,
  cost_trend: 0.20,
} as const;

// MTI label thresholds
function mtiLabel(score: number): string {
  if (score <= 20) return 'Cold';
  if (score <= 40) return 'Soft';
  if (score <= 60) return 'Balanced';
  if (score <= 80) return 'Competitive';
  return 'Hot';
}

// ── Helpers ──

interface StepResult {
  step: string;
  records: number;
  error: string | null;
}

async function executeStep(
  name: string,
  fn: () => Promise<number>,
): Promise<StepResult> {
  try {
    const records = await fn();
    return { step: name, records, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { step: name, records: 0, error: msg };
  }
}

// ── Paginated fetch helper (Supabase caps at 1000 rows per request) ──

const PAGE_SIZE = 1000;

async function paginatedFetch<T>(
  buildQuery: (from: number, to: number) => ReturnType<ReturnType<typeof supabase.from>['select']>,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

// ── Step 1: Recalculate recency_weight on all unit_costs ──

async function step1_recencyWeights(): Promise<number> {
  // Single bulk UPDATE via exec_sql — no row-by-row fallback
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      UPDATE unit_costs
      SET recency_weight = EXP(-${RECENCY_DECAY} * EXTRACT(EPOCH FROM (now() - created_at)) / ${SECONDS_PER_DAY}),
          updated_at = now()
      WHERE is_active = true
        AND is_current_revision = true;
    `,
  });

  if (error) {
    if (error.message?.includes('function') && error.message?.includes('exec_sql') && error.message?.includes('does not exist')) {
      throw new Error(`Step 1 failed: the exec_sql RPC function does not exist. Deploy it before running nightly-recompute.`);
    }
    throw new Error(`Step 1 bulk UPDATE failed: ${error.message}`);
  }

  return typeof data === 'number' ? data : await countActiveUnitCosts();
}

async function countActiveUnitCosts(): Promise<number> {
  const { count, error } = await supabase
    .from('unit_costs')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('is_current_revision', true);
  if (error) return 0;
  return count ?? 0;
}

// ── Step 2: Rebuild contribution_weight ──

async function step2_contributionWeights(): Promise<number> {
  // Single bulk UPDATE via exec_sql — no row-by-row fallback
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      UPDATE unit_costs
      SET contribution_weight = source_weight * recency_weight * geo_weight * outlier_pass,
          updated_at = now()
      WHERE is_active = true
        AND is_current_revision = true;
    `,
  });

  if (error) {
    if (error.message?.includes('function') && error.message?.includes('exec_sql') && error.message?.includes('does not exist')) {
      throw new Error(`Step 2 failed: the exec_sql RPC function does not exist. Deploy it before running nightly-recompute.`);
    }
    throw new Error(`Step 2 bulk UPDATE failed: ${error.message}`);
  }

  return typeof data === 'number' ? data : await countActiveUnitCosts();
}

// ── Step 3: Rebuild sf_benchmarks running state from scratch ──

async function step3_sfBenchmarks(): Promise<number> {
  // Fetch all sf_benchmark rows
  const { data: benchmarks, error: bErr } = await supabase
    .from('sf_benchmarks')
    .select('id, org_id, building_type_id, project_type_id, delivery_method_id, state, metro_area');

  if (bErr) throw new Error(`Step 3 benchmark fetch: ${bErr.message}`);
  if (!benchmarks || benchmarks.length === 0) return 0;

  let updated = 0;

  for (const bm of benchmarks) {
    // Aggregate unit_costs matching this benchmark's dimensions
    // unit_costs are linked to sf_benchmarks via org_id + state + metro_area
    // We join through csi_codes → building_type context, but the simplest
    // aggregation is by org + geography since sf_benchmarks are the rollup
    const costs = await paginatedFetch<{ unit_cost: number; contribution_weight: number }>(
      (from, to) => {
        let q = supabase
          .from('unit_costs')
          .select('unit_cost, contribution_weight')
          .eq('org_id', bm.org_id)
          .eq('state', bm.state)
          .eq('is_active', true)
          .eq('is_current_revision', true)
          .eq('outlier_flag', false)
          .range(from, to);

        if (bm.metro_area) {
          q = q.eq('metro_area', bm.metro_area);
        } else {
          q = q.is('metro_area', null);
        }
        return q;
      },
    ).catch(e => { throw new Error(`Step 3 costs fetch for ${bm.id}: ${e.message}`); });

    // Compute running state
    let weightedSum = 0;
    let weightSum = 0;
    let sampleCount = 0;

    if (costs && costs.length > 0) {
      for (const c of costs) {
        weightedSum += c.unit_cost * c.contribution_weight;
        weightSum += c.contribution_weight;
        sampleCount++;
      }

      // Compute percentiles from sorted unit_costs
      const sorted = costs.map((c: { unit_cost: number }) => c.unit_cost).sort((a: number, b: number) => a - b);
      const p10 = percentile(sorted, 0.10);
      const p50 = percentile(sorted, 0.50);
      const p90 = percentile(sorted, 0.90);

      // Determine price_basis and display_flag
      let priceBasis: string;
      let displayFlag: string;
      if (sampleCount >= 30) {
        priceBasis = 'market_all_in';
        displayFlag = 'none';
      } else if (sampleCount >= 5) {
        priceBasis = 'blended';
        displayFlag = 'indicative';
      } else if (sampleCount >= 1) {
        priceBasis = 'sf_seed';
        displayFlag = 'insufficient_data';
      } else {
        priceBasis = 'national_fallback';
        displayFlag = 'national_fallback';
      }

      const { error: updErr } = await supabase
        .from('sf_benchmarks')
        .update({
          weighted_sum: parseFloat(weightedSum.toFixed(4)),
          weight_sum: parseFloat(weightSum.toFixed(6)),
          sample_count: sampleCount,
          p10_cost_per_sf: parseFloat(p10.toFixed(2)),
          p50_cost_per_sf: parseFloat(p50.toFixed(2)),
          p90_cost_per_sf: parseFloat(p90.toFixed(2)),
          price_basis: priceBasis,
          display_flag: displayFlag,
          last_recomputed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', bm.id);

      if (updErr) throw new Error(`Step 3 update ${bm.id}: ${updErr.message}`);
    } else {
      // No data — reset to zero
      const { error: updErr } = await supabase
        .from('sf_benchmarks')
        .update({
          weighted_sum: 0,
          weight_sum: 0,
          sample_count: 0,
          p10_cost_per_sf: null,
          p50_cost_per_sf: null,
          p90_cost_per_sf: null,
          price_basis: 'national_fallback',
          display_flag: 'national_fallback',
          last_recomputed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', bm.id);
      if (updErr) throw new Error(`Step 3 reset ${bm.id}: ${updErr.message}`);
    }

    updated++;
  }

  return updated;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ── Step 4: Recompute Market Tension Index for all metros ──

async function step4_marketTension(): Promise<number> {
  // Get distinct metro_area values from projects within the last 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  const cutoff = twelveMonthsAgo.toISOString();

  const metros = await paginatedFetch<{ metro_area: string }>(
    (from, to) => supabase
      .from('projects')
      .select('metro_area')
      .eq('is_active', true)
      .not('metro_area', 'is', null)
      .gte('created_at', cutoff)
      .range(from, to),
  ).catch(e => { throw new Error(`Step 4 metro fetch: ${e.message}`); });

  if (metros.length === 0) return 0;

  // Deduplicate metros
  const uniqueMetros = [...new Set(metros.map((m: { metro_area: string }) => m.metro_area))];

  // Compute 12-month rolling baselines (across ALL metros for normalization)
  const allProjects = await paginatedFetch<{ metro_area: string; id: string }>(
    (from, to) => supabase
      .from('projects')
      .select('metro_area, id')
      .eq('is_active', true)
      .gte('created_at', cutoff)
      .range(from, to),
  ).catch(e => { throw new Error(`Step 4 baseline projects: ${e.message}`); });

  const allProposals = await paginatedFetch<{ project_id: string; base_bid_value: number; award_status: string; submitted_at: string }>(
    (from, to) => supabase
      .from('proposals')
      .select('project_id, base_bid_value, award_status, submitted_at')
      .eq('is_active', true)
      .eq('is_current_revision', true)
      .gte('submitted_at', cutoff)
      .range(from, to),
  ).catch(e => { throw new Error(`Step 4 baseline proposals: ${e.message}`); });

  // Build project→metro lookup
  const projectMetro: Record<string, string> = {};
  for (const p of allProjects) {
    if (p.metro_area) projectMetro[p.id] = p.metro_area;
  }

  // Aggregate per-metro stats
  interface MetroStats {
    proposalCount: number;
    projectIds: Set<string>;
    bidValues: number[];
    recentBidValues: number[];   // last 3 months
    olderBidValues: number[];    // 3-12 months ago
  }

  const metroStats: Record<string, MetroStats> = {};
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  for (const metro of uniqueMetros) {
    metroStats[metro] = {
      proposalCount: 0,
      projectIds: new Set(),
      bidValues: [],
      recentBidValues: [],
      olderBidValues: [],
    };
  }

  for (const prop of allProposals) {
    const metro = prop.project_id ? projectMetro[prop.project_id] : null;
    if (!metro || !metroStats[metro]) continue;

    const stats = metroStats[metro];
    stats.proposalCount++;
    if (prop.project_id) stats.projectIds.add(prop.project_id);
    stats.bidValues.push(Number(prop.base_bid_value));

    const submittedDate = new Date(prop.submitted_at);
    if (submittedDate >= threeMonthsAgo) {
      stats.recentBidValues.push(Number(prop.base_bid_value));
    } else {
      stats.olderBidValues.push(Number(prop.base_bid_value));
    }
  }

  // Compute global baselines for normalization
  let globalProposalVolume = 0;
  let globalBidCountPerProject = 0;
  let globalBidSpread = 0;
  let metroCount = 0;

  for (const metro of uniqueMetros) {
    const stats = metroStats[metro];
    if (stats.proposalCount === 0) continue;
    metroCount++;
    globalProposalVolume += stats.proposalCount;
    const projectCount = stats.projectIds.size || 1;
    globalBidCountPerProject += stats.proposalCount / projectCount;
    if (stats.bidValues.length >= 2) {
      const sorted = [...stats.bidValues].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      globalBidSpread += median > 0 ? (sorted[sorted.length - 1] - sorted[0]) / median : 0;
    }
  }

  const avgProposalVolume = metroCount > 0 ? globalProposalVolume / metroCount : 1;
  const avgBidCountPerProject = metroCount > 0 ? globalBidCountPerProject / metroCount : 1;
  const avgBidSpread = metroCount > 0 ? globalBidSpread / metroCount : 1;

  // Compute and upsert MTI for each metro
  let updated = 0;

  for (const metro of uniqueMetros) {
    const stats = metroStats[metro];
    if (stats.proposalCount === 0) continue;

    const projectCount = stats.projectIds.size || 1;

    // Sub-scores normalized against 12-month rolling baseline (0-100)
    const proposalVolumeRaw = stats.proposalCount / (avgProposalVolume || 1);
    const proposalVolumeScore = Math.min(100, Math.max(0, proposalVolumeRaw * 50));

    const bidCountRaw = (stats.proposalCount / projectCount) / (avgBidCountPerProject || 1);
    const bidCountScore = Math.min(100, Math.max(0, bidCountRaw * 50));

    // Bid spread: tighter spread = more competitive
    let bidSpreadScore = 50;
    if (stats.bidValues.length >= 2) {
      const sorted = [...stats.bidValues].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const spread = median > 0 ? (sorted[sorted.length - 1] - sorted[0]) / median : 0;
      const normalizedSpread = spread / (avgBidSpread || 1);
      // Tighter spread (lower ratio) = more competitive = higher score
      bidSpreadScore = Math.min(100, Math.max(0, (2 - normalizedSpread) * 50));
    }

    // Cost trend: rising costs = hotter market
    let costTrendScore = 50;
    if (stats.recentBidValues.length > 0 && stats.olderBidValues.length > 0) {
      const recentMedian = median(stats.recentBidValues);
      const olderMedian = median(stats.olderBidValues);
      if (olderMedian > 0) {
        const trendPct = ((recentMedian - olderMedian) / olderMedian) * 100;
        // +10% trend → 100, -10% trend → 0, 0% → 50
        costTrendScore = Math.min(100, Math.max(0, 50 + trendPct * 5));
      }
    }

    // Weighted composite score
    const mtiScore = Math.round(
      MTI_WEIGHTS.proposal_volume * proposalVolumeScore +
      MTI_WEIGHTS.bid_count_per_project * bidCountScore +
      MTI_WEIGHTS.bid_spread * bidSpreadScore +
      MTI_WEIGHTS.cost_trend * costTrendScore
    );

    const clampedScore = Math.min(100, Math.max(0, mtiScore));
    const label = mtiLabel(clampedScore);

    // Upsert into market_tension_index (via rpc or direct)
    // Since market_tension_index may not exist as a table yet,
    // we use a location_factors entry or a dedicated upsert
    const { error: upsErr } = await supabase
      .from('location_factors')
      .upsert(
        {
          org_id: SYSTEM_ORG_ID,
          geo_level: 'metro',
          geo_value: metro,
          trade_factors: {
            market_tension_index: clampedScore,
            market_tension_label: label,
            proposal_volume_score: Math.round(proposalVolumeScore),
            bid_count_score: Math.round(bidCountScore),
            bid_spread_score: Math.round(bidSpreadScore),
            cost_trend_score: Math.round(costTrendScore),
            computed_at: new Date().toISOString(),
          },
          overall_factor: clampedScore / 100,
          sample_count: stats.proposalCount,
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'org_id,geo_level,geo_value', ignoreDuplicates: false },
      );

    if (upsErr) {
      console.warn(`MTI upsert warning for ${metro}: ${upsErr.message}`);
    }

    updated++;
  }

  return updated;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ── Step 5: Recompute PDC benchmarks P10/P50/P90 ──

async function step5_pdcBenchmarks(): Promise<number> {
  // Fetch all pdc_benchmark rows
  const { data: benchmarks, error: bErr } = await supabase
    .from('pdc_benchmarks')
    .select('id, org_id, building_type_id, project_type_id, state, metro_area, pdc_bucket');

  if (bErr) throw new Error(`Step 5 benchmark fetch: ${bErr.message}`);
  if (!benchmarks || benchmarks.length === 0) return 0;

  // Group by org for efficient proposal fetching
  const orgBuckets: Record<string, typeof benchmarks> = {};
  for (const bm of benchmarks) {
    if (!orgBuckets[bm.org_id]) orgBuckets[bm.org_id] = [];
    orgBuckets[bm.org_id].push(bm);
  }

  let updated = 0;

  for (const [orgId, orgBenchmarks] of Object.entries(orgBuckets)) {
    // Fetch all active proposals for this org with PDC lines
    const pdcLines = await paginatedFetch<{ proposal_id: string; line_type: string; normalized_pct: number }>(
      (from, to) => supabase
        .from('pdc_lines')
        .select('proposal_id, line_type, normalized_pct')
        .eq('org_id', orgId)
        .not('normalized_pct', 'is', null)
        .range(from, to),
    ).catch(e => { throw new Error(`Step 5 pdc_lines fetch for org ${orgId}: ${e.message}`); });

    if (pdcLines.length === 0) continue;

    // Fetch active proposals to filter
    const proposalIds = [...new Set(pdcLines.map((pl: { proposal_id: string }) => pl.proposal_id))];
    const proposals = await paginatedFetch<{ id: string; submitted_at: string }>(
      (from, to) => supabase
        .from('proposals')
        .select('id, submitted_at')
        .in('id', proposalIds)
        .eq('is_active', true)
        .eq('is_current_revision', true)
        .range(from, to),
    ).catch(e => { throw new Error(`Step 5 proposals fetch: ${e.message}`); });

    const activeProposalIds = new Set(proposals.map((p: { id: string }) => p.id));
    const proposalDates: Record<string, string> = {};
    for (const p of proposals) {
      proposalDates[p.id] = p.submitted_at;
    }

    // Group PDC lines by bucket
    const bucketValues: Record<string, { pct: number; recencyWeight: number }[]> = {};
    const now = Date.now();

    for (const pl of pdcLines) {
      if (!activeProposalIds.has(pl.proposal_id)) continue;
      if (!bucketValues[pl.line_type]) bucketValues[pl.line_type] = [];

      const submittedAt = proposalDates[pl.proposal_id];
      const daysSince = submittedAt
        ? (now - new Date(submittedAt).getTime()) / (1000 * SECONDS_PER_DAY)
        : 0;
      const recencyW = Math.exp(-RECENCY_DECAY * daysSince);

      bucketValues[pl.line_type].push({
        pct: Number(pl.normalized_pct),
        recencyWeight: recencyW,
      });
    }

    // Update each benchmark row
    for (const bm of orgBenchmarks) {
      const values = bucketValues[bm.pdc_bucket];
      if (!values || values.length === 0) continue;

      const sorted = values.map(v => v.pct).sort((a, b) => a - b);
      const p10 = percentile(sorted, 0.10);
      const p50 = percentile(sorted, 0.50);
      const p90 = percentile(sorted, 0.90);

      // Recency-weighted average for org_running_pdc_pct
      let weightedSum = 0;
      let weightSum = 0;
      for (const v of values) {
        weightedSum += v.pct * v.recencyWeight;
        weightSum += v.recencyWeight;
      }
      const orgRunning = weightSum > 0 ? weightedSum / weightSum : null;

      const { error: updErr } = await supabase
        .from('pdc_benchmarks')
        .update({
          p10_pct: parseFloat(p10.toFixed(4)),
          p50_pct: parseFloat(p50.toFixed(4)),
          p90_pct: parseFloat(p90.toFixed(4)),
          org_running_pdc_pct: orgRunning ? parseFloat(orgRunning.toFixed(4)) : null,
          awarded_count: values.length,
          total_count: values.length,
          last_recomputed_at: new Date().toISOString(),
        })
        .eq('id', bm.id);

      if (updErr) throw new Error(`Step 5 update ${bm.id}: ${updErr.message}`);
      updated++;
    }
  }

  return updated;
}

// ── Step 6: Refresh materialized view ──

async function step6_refreshView(): Promise<number> {
  const { error } = await supabase.rpc('exec_sql', {
    query: `REFRESH MATERIALIZED VIEW CONCURRENTLY market_intelligence_view;`,
  });

  if (error) {
    // M11: Distinguish between exec_sql RPC missing vs view missing
    if (error.message?.includes('function') && error.message?.includes('exec_sql') && error.message?.includes('does not exist')) {
      throw new Error(`Step 6 failed: the exec_sql RPC function does not exist. Deploy it before running nightly-recompute.`);
    }
    if (error.message?.includes('market_intelligence_view') && (error.message?.includes('does not exist') || error.message?.includes('relation'))) {
      console.warn('market_intelligence_view does not exist yet — skipping refresh');
      return 0;
    }
    throw new Error(`Step 6 refresh view: ${error.message}`);
  }

  return 1;
}

// ── Main handler ──

serve(async (_req: Request) => {
  const startTime = Date.now();
  const results: StepResult[] = [];
  const errors: string[] = [];
  const completed = new Set<string>();

  // ── Step dependency map (H7) ──
  // Step 1 → no deps
  // Step 2 → requires Step 1 (needs fresh recency_weight)
  // Steps 3, 4, 5 → require Step 2 (needs fresh contribution_weight), independent of each other
  // Step 6 → requires at least one of Steps 3, 4, 5 to succeed
  const deps: Record<string, string[]> = {
    '1_recency_weights': [],
    '2_contribution_weights': ['1_recency_weights'],
    '3_sf_benchmarks': ['2_contribution_weights'],
    '4_market_tension': ['2_contribution_weights'],
    '5_pdc_benchmarks': ['2_contribution_weights'],
    '6_refresh_view': [], // special: needs at least one of 3/4/5
  };

  const steps: [string, () => Promise<number>][] = [
    ['1_recency_weights', step1_recencyWeights],
    ['2_contribution_weights', step2_contributionWeights],
    ['3_sf_benchmarks', step3_sfBenchmarks],
    ['4_market_tension', step4_marketTension],
    ['5_pdc_benchmarks', step5_pdcBenchmarks],
    ['6_refresh_view', step6_refreshView],
  ];

  let totalRecords = 0;

  for (const [name, fn] of steps) {
    // Step 6 special gate: at least one of 3/4/5 must have succeeded
    if (name === '6_refresh_view') {
      const anyDataStepOk =
        completed.has('3_sf_benchmarks') ||
        completed.has('4_market_tension') ||
        completed.has('5_pdc_benchmarks');
      if (!anyDataStepOk) {
        const skipResult: StepResult = { step: name, records: 0, error: 'Skipped — no data steps (3/4/5) succeeded' };
        results.push(skipResult);
        errors.push(`${name}: ${skipResult.error}`);
        continue;
      }
    }

    // Check standard dependency gates
    const missing = deps[name]?.filter(d => !completed.has(d)) ?? [];
    if (missing.length > 0) {
      const skipResult: StepResult = { step: name, records: 0, error: `Skipped — failed dependencies: ${missing.join(', ')}` };
      results.push(skipResult);
      errors.push(`${name}: ${skipResult.error}`);
      continue;
    }

    const result = await executeStep(name, fn);
    results.push(result);
    totalRecords += result.records;
    if (result.error) {
      errors.push(`${name}: ${result.error}`);
    } else {
      completed.add(name);
    }
  }

  const durationMs = Date.now() - startTime;

  // Write recompute_log entry
  const logEntry = {
    timestamp: new Date().toISOString(),
    duration_ms: durationMs,
    records_processed: totalRecords,
    errors: errors.length > 0 ? errors : null,
    step_results: results,
  };

  const { error: logErr } = await supabase.from('recompute_log').insert(logEntry);

  if (logErr) {
    console.error(`Failed to write recompute_log: ${logErr.message}`);
  }

  const status = errors.length === 0 ? 'success' : 'completed_with_errors';

  return new Response(
    JSON.stringify({
      status,
      duration_ms: durationMs,
      records_processed: totalRecords,
      steps: results,
      errors,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
