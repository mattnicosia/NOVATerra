-- BLDG Talent Database Setup — Run in Supabase Dashboard > SQL Editor
-- Creates tables for: user roles, candidates, assessments, module results, behavioral results, ROM leads

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Core Tables
-- ═══════════════════════════════════════════════════════════════════════

-- User role mapping (determines which layout a user sees)
CREATE TABLE IF NOT EXISTS bt_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('candidate', 'bt_admin', 'novaterra')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Candidate profiles (estimators taking assessments)
CREATE TABLE IF NOT EXISTS bt_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  location_city TEXT,
  location_state TEXT,
  years_experience INTEGER,
  current_employer TEXT,
  past_employers JSONB DEFAULT '[]',
  trade_focus JSONB DEFAULT '[]',
  project_types JSONB DEFAULT '[]',
  software_tools JSONB DEFAULT '[]',
  salary_min INTEGER,
  salary_max INTEGER,
  availability TEXT CHECK (availability IN ('immediately', '2_weeks', '1_month', 'not_looking')),
  avatar_url TEXT,
  linkedin_url TEXT,
  resume_url TEXT,
  profile_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- Assessment sessions
CREATE TABLE IF NOT EXISTS bt_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES bt_candidates(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'expired')),
  scenario_variant TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_duration_seconds INTEGER,
  overall_score NUMERIC,
  overall_grade TEXT,
  certification_level TEXT CHECK (certification_level IN ('certified', 'advanced', 'expert', 'master')),
  percentile_rank NUMERIC,
  ai_summary TEXT,
  ai_recommendation TEXT,
  salary_recommendation JSONB,
  report_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-module results
CREATE TABLE IF NOT EXISTS bt_module_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES bt_assessments(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL
    CHECK (module_key IN ('bid_leveling', 'communication', 'plan_reading', 'cognitive', 'software', 'behavioral')),
  status TEXT DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  raw_score NUMERIC,
  max_score NUMERIC,
  weighted_score NUMERIC,
  grade TEXT,
  percentile_rank NUMERIC,
  responses JSONB,
  scoring_details JSONB,
  ai_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Behavioral assessment dimension scores
CREATE TABLE IF NOT EXISTS bt_behavioral_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES bt_assessments(id) ON DELETE CASCADE,
  drive_score NUMERIC,
  influence_score NUMERIC,
  steadiness_score NUMERIC,
  conscientiousness_score NUMERIC,
  deadline_mgmt_score NUMERIC,
  risk_assessment_score NUMERIC,
  conflict_resolution_score NUMERIC,
  behavioral_style TEXT,
  professional_strengths TEXT,
  growth_considerations TEXT,
  top_motivators TEXT,
  workplace_impact TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. ROM Lead Capture
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rom_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  rom_result JSONB,
  project_type TEXT,
  project_sf NUMERIC,
  location TEXT,
  converted_to_trial BOOLEAN DEFAULT false,
  converted_to_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- 3. RLS Policies
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE bt_user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_module_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE bt_behavioral_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE rom_leads ENABLE ROW LEVEL SECURITY;

-- bt_user_roles: users can read their own role
CREATE POLICY "bt_user_roles_select" ON bt_user_roles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "bt_user_roles_insert" ON bt_user_roles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- bt_candidates: users can CRUD their own profile
CREATE POLICY "bt_candidates_select_own" ON bt_candidates
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "bt_candidates_insert" ON bt_candidates
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "bt_candidates_update_own" ON bt_candidates
  FOR UPDATE USING (user_id = auth.uid());

-- bt_assessments: candidates can read their own assessments
CREATE POLICY "bt_assessments_select_own" ON bt_assessments
  FOR SELECT USING (
    candidate_id IN (SELECT id FROM bt_candidates WHERE user_id = auth.uid())
  );
CREATE POLICY "bt_assessments_insert" ON bt_assessments
  FOR INSERT WITH CHECK (
    candidate_id IN (SELECT id FROM bt_candidates WHERE user_id = auth.uid())
  );
CREATE POLICY "bt_assessments_update_own" ON bt_assessments
  FOR UPDATE USING (
    candidate_id IN (SELECT id FROM bt_candidates WHERE user_id = auth.uid())
  );

-- bt_module_results: via assessment ownership
CREATE POLICY "bt_module_results_select" ON bt_module_results
  FOR SELECT USING (
    assessment_id IN (
      SELECT a.id FROM bt_assessments a
      JOIN bt_candidates c ON a.candidate_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );
CREATE POLICY "bt_module_results_insert" ON bt_module_results
  FOR INSERT WITH CHECK (
    assessment_id IN (
      SELECT a.id FROM bt_assessments a
      JOIN bt_candidates c ON a.candidate_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- bt_behavioral_results: via assessment ownership
CREATE POLICY "bt_behavioral_results_select" ON bt_behavioral_results
  FOR SELECT USING (
    assessment_id IN (
      SELECT a.id FROM bt_assessments a
      JOIN bt_candidates c ON a.candidate_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );
CREATE POLICY "bt_behavioral_results_insert" ON bt_behavioral_results
  FOR INSERT WITH CHECK (
    assessment_id IN (
      SELECT a.id FROM bt_assessments a
      JOIN bt_candidates c ON a.candidate_id = c.id
      WHERE c.user_id = auth.uid()
    )
  );

-- rom_leads: anyone can insert (public form, no auth required), no select for anon users
CREATE POLICY "rom_leads_insert_public" ON rom_leads
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- rom_leads: only authenticated admins can view leads (future admin panel)
CREATE POLICY "rom_leads_select_admin" ON rom_leads
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM bt_user_roles WHERE role = 'bt_admin')
  );

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Indexes
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_bt_user_roles_user ON bt_user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_bt_candidates_user ON bt_candidates(user_id);
CREATE INDEX IF NOT EXISTS idx_bt_assessments_candidate ON bt_assessments(candidate_id);
CREATE INDEX IF NOT EXISTS idx_bt_module_results_assessment ON bt_module_results(assessment_id);
CREATE INDEX IF NOT EXISTS idx_bt_behavioral_results_assessment ON bt_behavioral_results(assessment_id);
CREATE INDEX IF NOT EXISTS idx_rom_leads_email ON rom_leads(email);
CREATE INDEX IF NOT EXISTS idx_rom_leads_created ON rom_leads(created_at);
