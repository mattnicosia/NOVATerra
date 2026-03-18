-- ============================================================
-- NOVATerra — Sub Pool Reputation RPC Functions
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Called when a sub submits a proposal via the portal.
-- Updates proposal_count, avg_response_hours, total_bid_volume.
CREATE OR REPLACE FUNCTION update_sub_pool_on_submission(
  p_email TEXT,
  p_trade TEXT,
  p_response_hours NUMERIC,
  p_bid_amount NUMERIC DEFAULT 0
) RETURNS void AS $$
  UPDATE sub_pool SET
    proposal_count = proposal_count + 1,
    last_activity = now(),
    avg_response_hours = CASE
      WHEN avg_response_hours IS NULL THEN p_response_hours
      ELSE (avg_response_hours * (proposal_count - 1) + p_response_hours) / proposal_count
    END,
    total_bid_volume = total_bid_volume + COALESCE(p_bid_amount, 0)
  WHERE email = p_email AND trade = p_trade;
$$ LANGUAGE sql;

-- Called when a bid is awarded or not awarded.
-- Updates win_count or loss_count, and avg_coverage_score.
CREATE OR REPLACE FUNCTION update_sub_pool_on_award(
  p_email TEXT,
  p_trade TEXT,
  p_is_winner BOOLEAN,
  p_coverage_score NUMERIC DEFAULT NULL
) RETURNS void AS $$
  UPDATE sub_pool SET
    win_count = CASE WHEN p_is_winner THEN win_count + 1 ELSE win_count END,
    loss_count = CASE WHEN NOT p_is_winner THEN loss_count + 1 ELSE loss_count END,
    avg_coverage_score = CASE
      WHEN p_coverage_score IS NULL THEN avg_coverage_score
      WHEN avg_coverage_score IS NULL THEN p_coverage_score
      ELSE (avg_coverage_score * (GREATEST(proposal_count, 1) - 1) + p_coverage_score) / GREATEST(proposal_count, 1)
    END,
    last_activity = now()
  WHERE email = p_email AND trade = p_trade;
$$ LANGUAGE sql;
