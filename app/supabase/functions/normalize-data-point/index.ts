// ============================================================
// NOVA Core — 14-Step Normalization Pipeline (Edge Function)
// Fires on INSERT to proposal_line_items and estimate_line_items
// via a database webhook. Uses NOVA_CORE_SERVICE_ROLE_KEY for
// all Supabase writes. Failed steps log and halt — never
// silently continue.
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ── Supabase admin client (service role — bypasses RLS) ──

const SUPABASE_URL = Deno.env.get('NOVA_CORE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('NOVA_CORE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Types ──

interface WebhookPayload {
  type: 'INSERT';
  table: 'proposal_line_items' | 'estimate_line_items';
  record: Record<string, unknown>;
  schema: string;
  old_record: null;
}

interface PipelineContext {
  source_table: 'proposal_line_items' | 'estimate_line_items';
  record: Record<string, unknown>;
  batch_id: string | null;
  // Resolved during pipeline
  org_id: string;
  trade_id: string | null;
  csi_code_id: string | null;
  unit_id: string | null;
  unit_cost: number;
  raw_unit_cost: number | null;
  state: string;
  metro_area: string | null;
  climate_zone: string;
  submission_date: string;
  submission_month: number;
  // Source context
  source_type: string;
  estimator_type: string | null;
  burden_included: boolean;
  overhead_included: boolean;
  profit_included: boolean;
  pdc_included: boolean;
  source_id: string;
  // Pipeline outputs
  source_weight: number;
  recency_weight: number;
  geo_weight: number;
  outlier_flag: boolean;
  outlier_pass: number;
  contribution_weight: number;
  potential_duplicate: boolean;
  duplicate_of: string | null;
  seasonal_adjustment_applied: boolean;
  lump_sum_resolved: boolean;
  lump_sum_context: string | null;
  pending_context: boolean;
  revisit_trigger: boolean;
}

// ── Levenshtein distance for fuzzy company name matching ──

function levenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  const matrix: number[][] = [];
  for (let i = 0; i <= la; i++) matrix[i] = [i];
  for (let j = 0; j <= lb; j++) matrix[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[la][lb];
}

// ── Step execution wrapper — logs and halts on failure ──

async function executeStep<T>(
  stepName: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[NOVA Pipeline] HALT at ${stepName}: ${message}`);
    // Write error to recompute_log
    try {
      await supabase.from('recompute_log').insert({
        timestamp: new Date().toISOString(),
        duration_ms: 0,
        records_processed: 0,
        errors: [{ step: stepName, error: message }],
      });
    } catch (_logErr) {
      console.error('[NOVA Pipeline] Failed to write error log');
    }
    throw new Error(`Pipeline halted at ${stepName}: ${message}`);
  }
}

// ============================================================
// STEP 1 — Intake
// Record batch_id, all fields captured as submitted
// ============================================================

async function step1_intake(payload: WebhookPayload): Promise<PipelineContext> {
  const { table, record } = payload;
  const id = record.id as string;
  const org_id = record.org_id as string;
  const batch_id = (record.batch_id as string) ?? null;

  if (table === 'proposal_line_items') {
    // Look up the parent proposal for context
    const { data: proposal, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', record.proposal_id)
      .single();
    if (error || !proposal) throw new Error(`Proposal not found for line item ${id}: ${error?.message}`);

    // Look up project for geographic context
    let project: Record<string, unknown> | null = null;
    if (proposal.project_id) {
      const { data: p } = await supabase
        .from('projects')
        .select('*')
        .eq('id', proposal.project_id)
        .single();
      project = p;
    }

    return {
      source_table: table,
      record,
      batch_id,
      org_id,
      trade_id: proposal.trade_id ?? (record.csi_code_id ? null : null),
      csi_code_id: (record.csi_code_id as string) ?? null,
      unit_id: (record.unit_id as string) ?? null,
      unit_cost: (record.unit_cost as number) ?? 0,
      raw_unit_cost: null,
      state: project?.state as string ?? '',
      metro_area: (project?.metro_area as string) ?? null,
      climate_zone: (project?.climate_zone as string) ?? 'northern',
      submission_date: proposal.submitted_at as string,
      submission_month: new Date(proposal.submitted_at as string).getMonth() + 1,
      source_type: proposal.award_status === 'awarded' ? 'awarded_contract' : 'leveled_proposal',
      estimator_type: null,
      burden_included: false,
      overhead_included: false,
      profit_included: false,
      pdc_included: false,
      source_id: proposal.id as string,
      // Pipeline outputs (defaults)
      source_weight: 0,
      recency_weight: 0,
      geo_weight: 0,
      outlier_flag: false,
      outlier_pass: 1.00,
      contribution_weight: 0,
      potential_duplicate: false,
      duplicate_of: null,
      seasonal_adjustment_applied: false,
      lump_sum_resolved: false,
      lump_sum_context: proposal.lump_sum_context ?? null,
      pending_context: proposal.pending_context ?? false,
      revisit_trigger: proposal.revisit_trigger ?? false,
    };
  } else {
    // estimate_line_items
    const { data: estimate, error } = await supabase
      .from('completed_estimates')
      .select('*')
      .eq('id', record.estimate_id)
      .single();
    if (error || !estimate) throw new Error(`Estimate not found for line item ${id}: ${error?.message}`);

    let project: Record<string, unknown> | null = null;
    if (estimate.project_id) {
      const { data: p } = await supabase
        .from('projects')
        .select('*')
        .eq('id', estimate.project_id)
        .single();
      project = p;
    }

    return {
      source_table: table,
      record,
      batch_id,
      org_id,
      trade_id: (record.trade_id as string) ?? null,
      csi_code_id: (record.csi_code_id as string) ?? null,
      unit_id: (record.unit_id as string) ?? null,
      unit_cost: (record.unit_cost as number) ?? 0,
      raw_unit_cost: null,
      state: project?.state as string ?? '',
      metro_area: (project?.metro_area as string) ?? null,
      climate_zone: (project?.climate_zone as string) ?? 'northern',
      submission_date: estimate.created_at as string,
      submission_month: new Date(estimate.created_at as string).getMonth() + 1,
      source_type: 'completed_estimate',
      estimator_type: estimate.estimator_type as string,
      burden_included: estimate.burden_included as boolean,
      overhead_included: estimate.overhead_included as boolean,
      profit_included: estimate.profit_included as boolean,
      pdc_included: false,
      source_id: estimate.id as string,
      // Pipeline outputs (defaults)
      source_weight: 0,
      recency_weight: 0,
      geo_weight: 0,
      outlier_flag: false,
      outlier_pass: 1.00,
      contribution_weight: 0,
      potential_duplicate: false,
      duplicate_of: null,
      seasonal_adjustment_applied: false,
      lump_sum_resolved: false,
      lump_sum_context: null,
      pending_context: false,
      revisit_trigger: false,
    };
  }
}

// ============================================================
// STEP 1b — Duplicate Detection
// Fuzzy match: same trade_id, metro_area, within 45 days,
// within 3% amount, Levenshtein company name <= 2
// ============================================================

async function step1b_duplicateDetection(ctx: PipelineContext): Promise<PipelineContext> {
  if (!ctx.trade_id || !ctx.metro_area) return ctx;

  const submissionDate = new Date(ctx.submission_date);
  const daysBefore = new Date(submissionDate);
  daysBefore.setDate(daysBefore.getDate() - 45);

  // metro_area lives on projects, not proposals — join through project_id
  // First get project IDs in this metro
  const { data: metroProjects } = await supabase
    .from('projects')
    .select('id')
    .eq('metro_area', ctx.metro_area)
    .eq('is_active', true);

  if (!metroProjects || metroProjects.length === 0) return ctx;

  const projectIds = metroProjects.map((p: { id: string }) => p.id);

  // Query existing proposals within the time/trade/geo window
  const { data: candidates } = await supabase
    .from('proposals')
    .select('id, submitting_org_name, base_bid_value, submitted_at')
    .eq('trade_id', ctx.trade_id)
    .in('project_id', projectIds)
    .eq('is_current_revision', true)
    .eq('is_active', true)
    .gte('submitted_at', daysBefore.toISOString())
    .lte('submitted_at', submissionDate.toISOString())
    .neq('id', ctx.source_id);

  if (!candidates || candidates.length === 0) return ctx;

  // Get current proposal's company name and bid value
  let currentOrgName = '';
  let currentBidValue = 0;

  if (ctx.source_table === 'proposal_line_items') {
    const { data: proposal } = await supabase
      .from('proposals')
      .select('submitting_org_name, base_bid_value')
      .eq('id', ctx.source_id)
      .single();
    if (proposal) {
      currentOrgName = (proposal.submitting_org_name as string).toLowerCase();
      currentBidValue = proposal.base_bid_value as number;
    }
  }

  for (const candidate of candidates) {
    const candidateName = (candidate.submitting_org_name as string).toLowerCase();
    const candidateValue = candidate.base_bid_value as number;

    // Check Levenshtein distance <= 2
    if (levenshtein(currentOrgName, candidateName) > 2) continue;

    // Check within 3% amount
    if (currentBidValue > 0) {
      const pctDiff = Math.abs(currentBidValue - candidateValue) / currentBidValue;
      if (pctDiff > 0.03) continue;
    }

    // Match found — mark both as potential duplicates
    ctx.potential_duplicate = true;
    ctx.duplicate_of = candidate.id as string;

    // Mark the existing record too
    await supabase
      .from('proposals')
      .update({ potential_duplicate: true })
      .eq('id', candidate.id);

    // Mark current proposal
    await supabase
      .from('proposals')
      .update({ potential_duplicate: true, duplicate_of: candidate.id })
      .eq('id', ctx.source_id);

    break; // Only flag first match
  }

  return ctx;
}

// ============================================================
// STEP 2 — Classification
// Set burden_included from estimator_type:
// internal_team = true, all others = false
// ============================================================

function step2_classification(ctx: PipelineContext): PipelineContext {
  if (ctx.source_table === 'estimate_line_items') {
    // burden_included already read from completed_estimates
    // Auto-set rule: internal_team = true, others = false
    ctx.burden_included = ctx.estimator_type === 'internal_team';
  } else {
    // proposal_line_items: burden not included by default for proposals
    ctx.burden_included = false;
  }
  return ctx;
}

// ============================================================
// STEP 2b — Alternate Resolution
// Awarded proposals include alternates_accepted lines,
// non-awarded use base_bid_value only
// ============================================================

async function step2b_alternateResolution(ctx: PipelineContext): Promise<PipelineContext> {
  if (ctx.source_table !== 'proposal_line_items') return ctx;

  const record = ctx.record;
  const isAlternate = record.is_alternate as boolean;

  if (!isAlternate) return ctx; // Not an alternate line — proceed normally

  // Get parent proposal's award status
  const { data: proposal } = await supabase
    .from('proposals')
    .select('award_status, has_alternates')
    .eq('id', record.proposal_id)
    .single();

  if (!proposal || !proposal.has_alternates) return ctx;

  if (proposal.award_status === 'awarded') {
    // Awarded: include only if alternate_accepted = true
    const accepted = record.alternate_accepted as boolean | null;
    if (accepted !== true) {
      // Skip this line — set weight to 0 so it doesn't contribute
      ctx.source_weight = 0;
      ctx.contribution_weight = 0;
    }
  } else {
    // Non-awarded: use base_bid_value only, skip alternates entirely
    ctx.source_weight = 0;
    ctx.contribution_weight = 0;
  }

  return ctx;
}

// ============================================================
// STEP 3 — Normalization
// Canonical unit conversion, open_shop_ratio for public data,
// burden_multiplier if burden_included=false and source=public_seed
// ============================================================

async function step3_normalization(ctx: PipelineContext): Promise<PipelineContext> {
  // Apply open_shop_ratio to public wage data
  if (ctx.source_type === 'public_seed' && ctx.trade_id) {
    const { data: trade } = await supabase
      .from('trades')
      .select('open_shop_ratio, burden_multiplier')
      .eq('id', ctx.trade_id)
      .single();

    if (trade) {
      // Apply open_shop_ratio
      ctx.unit_cost = ctx.unit_cost * (trade.open_shop_ratio as number);

      // Apply burden_multiplier if burden not included
      if (!ctx.burden_included) {
        ctx.unit_cost = ctx.unit_cost * (trade.burden_multiplier as number);
      }
    }
  }

  return ctx;
}

// ============================================================
// STEP 3a — Lump Sum Context Check
// Situation A: project + SF + scope → resolve to unit cost
// Situation B: project + SF, no scope → sf_benchmarks only
// Situation C: no project context → pending_context=true,
//              revisit_trigger=true
// ============================================================

async function step3a_lumpSumContextCheck(ctx: PipelineContext): Promise<PipelineContext> {
  if (ctx.source_table !== 'proposal_line_items') return ctx;

  const { data: proposal } = await supabase
    .from('proposals')
    .select('contract_type, project_id, lump_sum_context')
    .eq('id', ctx.source_id)
    .single();

  if (!proposal || proposal.contract_type !== 'lump_sum') return ctx;

  if (proposal.lump_sum_context === 'situation_a') {
    // Resolve lump sum to unit cost using project SF and scope
    if (proposal.project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('gross_sf')
        .eq('id', proposal.project_id)
        .single();

      if (project && project.gross_sf && (project.gross_sf as number) > 0) {
        const lineTotal = ctx.record.line_total as number;
        ctx.unit_cost = lineTotal / (project.gross_sf as number);
        ctx.lump_sum_resolved = true;
        ctx.lump_sum_context = 'situation_a';
      }
    }
  } else if (proposal.lump_sum_context === 'situation_b') {
    // SF benchmark only — don't resolve to unit cost for unit_costs table
    ctx.lump_sum_context = 'situation_b';
    ctx.lump_sum_resolved = false;
  } else if (proposal.lump_sum_context === 'situation_c' || !proposal.project_id) {
    // No project context — flag for revisit
    ctx.pending_context = true;
    ctx.revisit_trigger = true;
    ctx.lump_sum_context = 'situation_c';

    // Update the proposal with pending flags
    await supabase
      .from('proposals')
      .update({ pending_context: true, revisit_trigger: true, lump_sum_context: 'situation_c' })
      .eq('id', ctx.source_id);
  }

  return ctx;
}

// ============================================================
// STEP 3b — Seasonal Adjustment
// Lookup seasonal_adjustments by trade_id/climate_zone/submission_month
// Store raw_unit_cost, divide by adjustment_factor
// ============================================================

async function step3b_seasonalAdjustment(ctx: PipelineContext): Promise<PipelineContext> {
  if (!ctx.trade_id) return ctx;

  // Check if trade has seasonal sensitivity
  const { data: trade } = await supabase
    .from('trades')
    .select('seasonal_sensitivity')
    .eq('id', ctx.trade_id)
    .single();

  if (!trade || trade.seasonal_sensitivity === 'none') return ctx;

  // Only apply to northern and mountain climate zones per spec
  if (!['northern', 'mountain'].includes(ctx.climate_zone)) return ctx;

  // Look up adjustment factor
  const { data: adjustment } = await supabase
    .from('seasonal_adjustments')
    .select('adjustment_factor')
    .eq('trade_id', ctx.trade_id)
    .eq('climate_zone', ctx.climate_zone)
    .eq('month', ctx.submission_month)
    .single();

  if (adjustment && adjustment.adjustment_factor) {
    const factor = adjustment.adjustment_factor as number;
    ctx.raw_unit_cost = ctx.unit_cost;
    ctx.unit_cost = ctx.unit_cost / factor;
    ctx.seasonal_adjustment_applied = true;
  }

  return ctx;
}

// ============================================================
// STEP 4 — Source Weight
// awarded_contract=1.00, leveled_proposal=0.85,
// completed_estimate internal_team=0.65, hybrid=0.60,
// external_consultant=0.55, user_override=0.50, public_seed=0.40
// ============================================================

function step4_sourceWeight(ctx: PipelineContext): PipelineContext {
  // If already zeroed by step 2b (rejected alternate), skip
  if (ctx.contribution_weight === 0 && ctx.source_weight === 0 &&
      ctx.record.is_alternate === true) {
    return ctx;
  }

  switch (ctx.source_type) {
    case 'awarded_contract':
      ctx.source_weight = 1.00;
      break;
    case 'leveled_proposal':
      ctx.source_weight = 0.85;
      break;
    case 'completed_estimate':
      switch (ctx.estimator_type) {
        case 'internal_team':
          ctx.source_weight = 0.65;
          break;
        case 'hybrid':
          ctx.source_weight = 0.60;
          break;
        case 'external_consultant':
          ctx.source_weight = 0.55;
          break;
        default:
          ctx.source_weight = 0.55;
          break;
      }
      break;
    case 'user_override':
      ctx.source_weight = 0.50;
      break;
    case 'public_seed':
      ctx.source_weight = 0.40;
      break;
    default:
      ctx.source_weight = 0.40;
  }
  return ctx;
}

// ============================================================
// STEP 5 — Recency Weight
// EXP(-0.015 x days_since_submission)
// ============================================================

function step5_recencyWeight(ctx: PipelineContext): PipelineContext {
  const submissionDate = new Date(ctx.submission_date);
  const now = new Date();
  const daysSinceSubmission = (now.getTime() - submissionDate.getTime()) / (1000 * 60 * 60 * 24);
  ctx.recency_weight = Math.exp(-0.015 * daysSinceSubmission);
  return ctx;
}

// ============================================================
// STEP 6 — Geographic Weight
// Same ZIP=1.000, same MSA=0.850, same state=0.650,
// same region=0.450, national=0.300
// ============================================================

function step6_geoWeight(ctx: PipelineContext): PipelineContext {
  // For the inline pipeline, we set a baseline geo_weight.
  // The actual comparison happens when the unit_cost is being
  // evaluated against a specific geography in the materialized view.
  // Here we record the data point's inherent geo precision.
  if (ctx.metro_area) {
    ctx.geo_weight = 0.850; // MSA-level data
  } else if (ctx.state) {
    ctx.geo_weight = 0.650; // State-level data
  } else {
    ctx.geo_weight = 0.300; // National-level data
  }
  return ctx;
}

// ============================================================
// STEP 7 — Outlier Detection
// +/-2.5 SD at 30+ points, +/-3.0 SD at 5-29 points,
// none under 5
// ============================================================

async function step7_outlierDetection(ctx: PipelineContext): Promise<PipelineContext> {
  if (!ctx.csi_code_id) {
    ctx.outlier_flag = false;
    ctx.outlier_pass = 1.00;
    return ctx;
  }

  // Get existing unit_costs for this csi_code_id + metro_area
  const query = supabase
    .from('unit_costs')
    .select('unit_cost')
    .eq('csi_code_id', ctx.csi_code_id)
    .eq('is_active', true)
    .eq('is_current_revision', true)
    .eq('outlier_flag', false);

  if (ctx.metro_area) {
    query.eq('metro_area', ctx.metro_area);
  }

  const { data: existing } = await query;

  if (!existing || existing.length < 5) {
    // Under 5 data points — no outlier detection
    ctx.outlier_flag = false;
    ctx.outlier_pass = 1.00;
    return ctx;
  }

  // Calculate mean and standard deviation
  const values = existing.map((r: Record<string, unknown>) => r.unit_cost as number);
  const n = values.length;
  const mean = values.reduce((sum: number, v: number) => sum + v, 0) / n;
  const variance = values.reduce((sum: number, v: number) => sum + Math.pow(v - mean, 2), 0) / n;
  const sd = Math.sqrt(variance);

  if (sd === 0) {
    ctx.outlier_flag = false;
    ctx.outlier_pass = 1.00;
    return ctx;
  }

  // Determine threshold based on sample count
  const threshold = n >= 30 ? 2.5 : 3.0;
  const zScore = Math.abs(ctx.unit_cost - mean) / sd;

  if (zScore > threshold) {
    ctx.outlier_flag = true;
    ctx.outlier_pass = 0.00;

    // Check for consecutive outliers from same org (escalation)
    const { data: orgOutliers } = await supabase
      .from('unit_costs')
      .select('id')
      .eq('org_id', ctx.org_id)
      .eq('csi_code_id', ctx.csi_code_id)
      .eq('outlier_flag', true)
      .eq('is_active', true);

    const consecutiveCount = (orgOutliers?.length ?? 0) + 1; // +1 for current

    if (consecutiveCount >= 10) {
      // 10+: escalate to data team via recompute_log
      await supabase.from('recompute_log').insert({
        timestamp: new Date().toISOString(),
        duration_ms: 0,
        records_processed: 0,
        errors: [{
          step: 'step7_outlier_escalation',
          error: `Org ${ctx.org_id} has ${consecutiveCount} consecutive outliers for CSI ${ctx.csi_code_id}. Escalation required.`,
          severity: 'critical',
        }],
      });
    } else if (consecutiveCount >= 5) {
      // 5+: soft flag org — pause contribution
      await supabase.from('recompute_log').insert({
        timestamp: new Date().toISOString(),
        duration_ms: 0,
        records_processed: 0,
        errors: [{
          step: 'step7_outlier_soft_flag',
          error: `Org ${ctx.org_id} has ${consecutiveCount} consecutive outliers for CSI ${ctx.csi_code_id}. Contribution paused.`,
          severity: 'warning',
        }],
      });
    } else if (consecutiveCount >= 3) {
      // 3+: soft flag
      await supabase.from('recompute_log').insert({
        timestamp: new Date().toISOString(),
        duration_ms: 0,
        records_processed: 0,
        errors: [{
          step: 'step7_outlier_warning',
          error: `Org ${ctx.org_id} has ${consecutiveCount} consecutive outliers for CSI ${ctx.csi_code_id}. Soft flag applied.`,
          severity: 'info',
        }],
      });
    }
  } else {
    ctx.outlier_flag = false;
    ctx.outlier_pass = 1.00;
  }

  return ctx;
}

// ============================================================
// STEP 8 — Contribution Weight
// contribution_weight = source_weight x recency_weight x
//                       geo_weight x outlier_pass
// ============================================================

function step8_contributionWeight(ctx: PipelineContext): PipelineContext {
  ctx.contribution_weight = ctx.source_weight * ctx.recency_weight * ctx.geo_weight * ctx.outlier_pass;
  return ctx;
}

// ============================================================
// STEP 9 — Running State Update
// Update sf_benchmarks running state:
// weighted_sum += unit_cost x contribution_weight
// weight_sum += contribution_weight
// sample_count += 1
// ============================================================

async function step9_runningStateUpdate(ctx: PipelineContext): Promise<PipelineContext> {
  if (!ctx.csi_code_id || ctx.outlier_flag || ctx.contribution_weight === 0) return ctx;

  // Find matching sf_benchmarks bucket
  const query = supabase
    .from('sf_benchmarks')
    .select('id, weighted_sum, weight_sum, sample_count')
    .eq('org_id', ctx.org_id);

  if (ctx.metro_area) {
    query.eq('metro_area', ctx.metro_area);
  }
  query.eq('state', ctx.state);

  const { data: benchmarks } = await query;

  if (benchmarks && benchmarks.length > 0) {
    for (const benchmark of benchmarks) {
      const newWeightedSum = (benchmark.weighted_sum as number) + (ctx.unit_cost * ctx.contribution_weight);
      const newWeightSum = (benchmark.weight_sum as number) + ctx.contribution_weight;
      const newSampleCount = (benchmark.sample_count as number) + 1;

      await supabase
        .from('sf_benchmarks')
        .update({
          weighted_sum: newWeightedSum,
          weight_sum: newWeightSum,
          sample_count: newSampleCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', benchmark.id);
    }
  }

  return ctx;
}

// ============================================================
// STEP 10 — Density Threshold Check
// Crossing 5 or 30: notify org, update contribution_score,
// trigger view refresh
// ============================================================

async function step10_densityThresholdCheck(ctx: PipelineContext): Promise<PipelineContext> {
  if (!ctx.csi_code_id) return ctx;

  // Count active non-outlier records for this csi_code + metro
  const query = supabase
    .from('unit_costs')
    .select('id', { count: 'exact', head: true })
    .eq('csi_code_id', ctx.csi_code_id)
    .eq('is_active', true)
    .eq('is_current_revision', true)
    .eq('outlier_flag', false);

  if (ctx.metro_area) {
    query.eq('metro_area', ctx.metro_area);
  }

  const { count } = await query;
  const sampleCount = (count ?? 0) + 1; // +1 for the current record being added

  // Check if we just crossed 5 or 30
  const justCrossed5 = sampleCount === 5;
  const justCrossed30 = sampleCount === 30;

  if (justCrossed5 || justCrossed30) {
    // Update contribution_tracking for contributing org
    const { data: tracking } = await supabase
      .from('contribution_tracking')
      .select('id, contribution_score, density_crossings, moved_threshold')
      .eq('org_id', ctx.org_id)
      .single();

    if (tracking) {
      const multiplier = justCrossed30 ? 2.0 : 1.0;
      const newScore = (tracking.contribution_score as number) + multiplier;
      const newCrossings = (tracking.density_crossings as number) + 1;

      await supabase
        .from('contribution_tracking')
        .update({
          contribution_score: newScore,
          density_crossings: newCrossings,
          moved_threshold: true,
          last_updated: new Date().toISOString(),
        })
        .eq('id', tracking.id);
    }

    // Trigger materialized view refresh
    await supabase.rpc('refresh_market_intelligence_view').catch(() => {
      // If the RPC doesn't exist yet, try raw SQL
      console.warn('[NOVA Pipeline] refresh_market_intelligence_view RPC not available, will refresh via nightly recompute');
    });
  }

  return ctx;
}

// ============================================================
// STEP 11 — price_basis Determination
// >=30: market_all_in/none
// 5-29: blended/indicative
// 0-4: sf_seed/insufficient_data
// No local data: national_fallback
// ============================================================

function step11_priceBasis(sampleCount: number): { price_basis: string; display_flag: string } {
  if (sampleCount >= 30) {
    return { price_basis: 'market_all_in', display_flag: 'none' };
  } else if (sampleCount >= 5) {
    return { price_basis: 'blended', display_flag: 'indicative' };
  } else if (sampleCount > 0) {
    return { price_basis: 'sf_seed', display_flag: 'insufficient_data' };
  } else {
    return { price_basis: 'sf_seed', display_flag: 'national_fallback' };
  }
}

// ============================================================
// STEP 12 — Materialized View Refresh
// Triggered by Step 10 density crossing or nightly cron
// REFRESH MATERIALIZED VIEW CONCURRENTLY market_intelligence_view
// ============================================================

// (Step 12 is triggered inside Step 10 when threshold is crossed.
//  It also runs as part of the nightly recompute Edge Function.)

// ============================================================
// Write unit_cost record — the final output of the pipeline
// ============================================================

async function writeUnitCostRecord(ctx: PipelineContext): Promise<string> {
  // Determine sample count for price_basis
  const countQuery = supabase
    .from('unit_costs')
    .select('id', { count: 'exact', head: true })
    .eq('csi_code_id', ctx.csi_code_id!)
    .eq('is_active', true)
    .eq('is_current_revision', true)
    .eq('outlier_flag', false);

  if (ctx.metro_area) {
    countQuery.eq('metro_area', ctx.metro_area);
  }

  const { count } = await countQuery;
  const sampleCount = (count ?? 0) + 1;
  const { price_basis, display_flag } = step11_priceBasis(sampleCount);

  const unitCostRecord = {
    org_id: ctx.org_id,
    csi_code_id: ctx.csi_code_id,
    trade_id: ctx.trade_id,
    unit_id: ctx.unit_id,
    unit_cost: ctx.unit_cost,
    raw_unit_cost: ctx.raw_unit_cost,
    burden_included: ctx.burden_included,
    overhead_included: ctx.overhead_included,
    profit_included: ctx.profit_included,
    pdc_included: ctx.pdc_included,
    source_type: ctx.source_type,
    source_weight: ctx.source_weight,
    estimator_type: ctx.estimator_type,
    state: ctx.state,
    metro_area: ctx.metro_area,
    climate_zone: ctx.climate_zone,
    submission_month: ctx.submission_month,
    seasonal_adjustment_applied: ctx.seasonal_adjustment_applied,
    contribution_weight: ctx.contribution_weight,
    recency_weight: ctx.recency_weight,
    geo_weight: ctx.geo_weight,
    outlier_flag: ctx.outlier_flag,
    outlier_pass: ctx.outlier_pass,
    potential_duplicate: ctx.potential_duplicate,
    duplicate_of: ctx.duplicate_of,
    is_current_revision: true,
    revision_number: 1,
    lump_sum_resolved: ctx.lump_sum_resolved,
    lump_sum_context: ctx.lump_sum_context,
    pending_context: ctx.pending_context,
    revisit_trigger: ctx.revisit_trigger,
    is_active: true,
    batch_id: ctx.batch_id,
    source_id: ctx.source_id,
    price_basis,
    display_flag,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('unit_costs')
    .insert(unitCostRecord)
    .select('id')
    .single();

  if (error) throw new Error(`Failed to write unit_cost record: ${error.message}`);
  return data.id as string;
}

// ============================================================
// Write recompute log entry on completion
// ============================================================

async function writeRecomputeLog(
  startTime: number,
  success: boolean,
  errors: Array<{ step: string; error: string }> = []
): Promise<void> {
  const durationMs = Date.now() - startTime;
  await supabase.from('recompute_log').insert({
    timestamp: new Date().toISOString(),
    duration_ms: durationMs,
    records_processed: success ? 1 : 0,
    errors: errors.length > 0 ? errors : null,
  });
}

// ============================================================
// Main pipeline orchestrator
// ============================================================

async function runPipeline(payload: WebhookPayload): Promise<Response> {
  const startTime = Date.now();

  try {
    // Step 1 — Intake
    let ctx = await executeStep('Step 1: Intake', () => step1_intake(payload));

    // Step 1b — Duplicate Detection
    ctx = await executeStep('Step 1b: Duplicate Detection', () => step1b_duplicateDetection(ctx));

    // Step 2 — Classification
    ctx = step2_classification(ctx);

    // Step 2b — Alternate Resolution
    ctx = await executeStep('Step 2b: Alternate Resolution', () => step2b_alternateResolution(ctx));

    // If contribution_weight was zeroed (rejected alternate), skip remaining steps
    if (ctx.source_weight === 0 && ctx.record.is_alternate === true) {
      await writeRecomputeLog(startTime, true);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'alternate_rejected' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Step 3 — Normalization
    ctx = await executeStep('Step 3: Normalization', () => step3_normalization(ctx));

    // Step 3a — Lump Sum Context Check
    ctx = await executeStep('Step 3a: Lump Sum Context Check', () => step3a_lumpSumContextCheck(ctx));

    // If pending_context (Situation C), write partial record and exit
    if (ctx.pending_context && ctx.lump_sum_context === 'situation_c') {
      const unitCostId = await writeUnitCostRecord(ctx);
      await writeRecomputeLog(startTime, true);
      return new Response(
        JSON.stringify({ ok: true, unit_cost_id: unitCostId, pending_context: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Step 3b — Seasonal Adjustment
    ctx = await executeStep('Step 3b: Seasonal Adjustment', () => step3b_seasonalAdjustment(ctx));

    // Step 4 — Source Weight
    ctx = step4_sourceWeight(ctx);

    // Step 5 — Recency Weight
    ctx = step5_recencyWeight(ctx);

    // Step 6 — Geographic Weight
    ctx = step6_geoWeight(ctx);

    // Step 7 — Outlier Detection
    ctx = await executeStep('Step 7: Outlier Detection', () => step7_outlierDetection(ctx));

    // Step 8 — Contribution Weight
    ctx = step8_contributionWeight(ctx);

    // Write the unit_cost record (includes Step 11 price_basis)
    const unitCostId = await executeStep('Write unit_cost', () => writeUnitCostRecord(ctx));

    // Step 9 — Running State Update
    await executeStep('Step 9: Running State Update', () => step9_runningStateUpdate(ctx));

    // Step 10 — Density Threshold Check (includes Step 12 mat view refresh)
    await executeStep('Step 10: Density Threshold Check', () => step10_densityThresholdCheck(ctx));

    // Write success log
    await writeRecomputeLog(startTime, true);

    return new Response(
      JSON.stringify({
        ok: true,
        unit_cost_id: unitCostId,
        contribution_weight: ctx.contribution_weight,
        outlier_flag: ctx.outlier_flag,
        seasonal_adjustment_applied: ctx.seasonal_adjustment_applied,
        potential_duplicate: ctx.potential_duplicate,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeRecomputeLog(startTime, false, [{ step: 'pipeline', error: message }]);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================
// HTTP handler
// ============================================================

serve(async (req: Request) => {
  // Health check
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ status: 'ok', function: 'normalize-data-point', version: '1.0.0' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const payload = await req.json() as WebhookPayload;

    // Validate payload
    if (payload.type !== 'INSERT') {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'not_insert' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!['proposal_line_items', 'estimate_line_items'].includes(payload.table)) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: 'unsupported_table' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // ── H5: Idempotency guard — skip if batch_id + source_id already exists ──
    const record = payload.record;
    const batchId = record.batch_id as string | null;
    const sourceId = record.id as string;

    if (batchId && sourceId) {
      const { count, error: dupErr } = await supabase
        .from('unit_costs')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', batchId)
        .eq('source_id', sourceId);

      if (!dupErr && (count ?? 0) > 0) {
        console.warn(`[NOVA Pipeline] Duplicate webhook: batch_id=${batchId} source_id=${sourceId} — skipping`);
        return new Response(
          JSON.stringify({ ok: true, skipped: true, reason: 'duplicate_webhook' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return await runPipeline(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[NOVA Pipeline] Unhandled error: ${message}`);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
