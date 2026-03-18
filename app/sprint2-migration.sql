-- NOVA Network Sprint 2A — DB Migration
-- Run in Supabase Dashboard SQL Editor

-- Sub reputation columns (prep for Sprint 2B profiles)
ALTER TABLE sub_pool ADD COLUMN IF NOT EXISTS win_count INTEGER DEFAULT 0;
ALTER TABLE sub_pool ADD COLUMN IF NOT EXISTS loss_count INTEGER DEFAULT 0;
ALTER TABLE sub_pool ADD COLUMN IF NOT EXISTS avg_coverage_score NUMERIC(5,2);
ALTER TABLE sub_pool ADD COLUMN IF NOT EXISTS avg_response_hours NUMERIC(8,2);
ALTER TABLE sub_pool ADD COLUMN IF NOT EXISTS total_bid_volume NUMERIC(14,2) DEFAULT 0;

-- Coverage result cache on proposals for portal polling
ALTER TABLE bid_proposals ADD COLUMN IF NOT EXISTS coverage_result JSONB;
