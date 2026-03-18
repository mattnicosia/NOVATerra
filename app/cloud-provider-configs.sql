-- ═══════════════════════════════════════════════════════════════
-- Cloud Provider Configs — API keys for cloud storage downloads
-- Run in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Table: stores API keys for cloud storage providers
-- Platform-level keys (org_id IS NULL) used as defaults
-- Per-org keys override platform keys (future: orgs add their own credentials)
CREATE TABLE IF NOT EXISTS cloud_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id TEXT DEFAULT NULL,           -- null = platform-level, org UUID = per-org override
  provider TEXT NOT NULL,             -- dropbox, google_drive, box, onedrive
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, provider)            -- one key per provider per org (or platform)
);

-- Enable RLS
ALTER TABLE cloud_provider_configs ENABLE ROW LEVEL SECURITY;

-- Platform keys (org_id IS NULL) readable by all authenticated users
CREATE POLICY "Platform keys readable by authenticated users"
  ON cloud_provider_configs FOR SELECT
  TO authenticated
  USING (org_id IS NULL);

-- Org-specific keys readable by org members (future)
-- For now, only platform-level keys are used
CREATE POLICY "Org keys readable by org members"
  ON cloud_provider_configs FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id IN (
      SELECT org_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- Only service_role can insert/update/delete (managed via admin or seed scripts)
-- No INSERT/UPDATE/DELETE policies for authenticated users

-- ═══════════════════════════════════════════════════════════════
-- Seed platform-level keys from environment variables
-- Replace the placeholder values with your actual API keys
-- ═══════════════════════════════════════════════════════════════

-- INSERT INTO cloud_provider_configs (org_id, provider, api_key) VALUES
--   (NULL, 'dropbox', 'YOUR_DROPBOX_APP_KEY'),
--   (NULL, 'google_drive', 'YOUR_GOOGLE_DRIVE_API_KEY'),
--   (NULL, 'box', 'YOUR_BOX_DEVELOPER_TOKEN'),
--   (NULL, 'onedrive', 'YOUR_MICROSOFT_GRAPH_KEY')
-- ON CONFLICT (org_id, provider) DO UPDATE SET
--   api_key = EXCLUDED.api_key,
--   updated_at = now();
