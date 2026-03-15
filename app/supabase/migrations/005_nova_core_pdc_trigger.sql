-- ============================================================
-- NOVA Core — PDC Recalculation Trigger
-- Migration 005: Installs trigger function + trigger on proposals
-- Fires AFTER INSERT OR UPDATE on proposals.
-- Recalculates org's running PDC average for all 7 buckets
-- using recency-weighted average across full history.
-- ============================================================

BEGIN;

-- ── Trigger function: recalculate org's running PDC% on new proposal ──

CREATE OR REPLACE FUNCTION recalculate_org_pdc(p_org_id uuid, p_bucket text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_weighted_sum numeric := 0;
  v_weight_sum numeric := 0;
  v_new_pdc_pct numeric;
  rec RECORD;
BEGIN
  -- Loop all current revisions for this org with valid PDC data
  FOR rec IN
    SELECT
      pl.normalized_pct,
      EXP(-0.015 * EXTRACT(EPOCH FROM (now() - p.submitted_at)) / 86400.0) AS recency_w
    FROM pdc_lines pl
    JOIN proposals p ON p.id = pl.proposal_id
    WHERE p.org_id = p_org_id
      AND p.is_current_revision = true
      AND p.is_active = true
      AND pl.line_type = p_bucket
      AND pl.normalized_pct IS NOT NULL
  LOOP
    v_weighted_sum := v_weighted_sum + (rec.normalized_pct * rec.recency_w);
    v_weight_sum := v_weight_sum + rec.recency_w;
  END LOOP;

  IF v_weight_sum > 0 THEN
    v_new_pdc_pct := v_weighted_sum / v_weight_sum;

    UPDATE pdc_benchmarks
    SET org_running_pdc_pct = v_new_pdc_pct,
        last_recomputed_at = now()
    WHERE org_id = p_org_id
      AND pdc_bucket = p_bucket;
  END IF;
END;
$$;

-- ── Wrapper trigger function that calls recalculate for all 7 buckets ──

CREATE OR REPLACE FUNCTION trigger_pdc_recalculate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_org_id uuid;
  v_bucket text;
  v_buckets text[] := ARRAY[
    'general_requirements',
    'general_conditions',
    'insurance',
    'bond',
    'overhead',
    'fee_profit',
    'total_pdc'
  ];
BEGIN
  -- Use NEW record's org_id
  v_org_id := NEW.org_id;

  -- Only process if the proposal is current and active
  IF NEW.is_current_revision = true AND NEW.is_active = true THEN
    FOREACH v_bucket IN ARRAY v_buckets
    LOOP
      PERFORM recalculate_org_pdc(v_org_id, v_bucket);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

-- ── Trigger: fires on INSERT/UPDATE to proposals ──

DROP TRIGGER IF EXISTS trg_pdc_recalculate ON proposals;

CREATE TRIGGER trg_pdc_recalculate
  AFTER INSERT OR UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION trigger_pdc_recalculate();

COMMIT;
