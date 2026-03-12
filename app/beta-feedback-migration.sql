-- Beta Feedback table — Sprint 5.3
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS beta_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL DEFAULT 'general',
  message text NOT NULL,
  page text,
  user_email text,
  user_id uuid REFERENCES auth.users(id),
  app_version text,
  user_agent text,
  screen_width int,
  screen_height int,
  created_at timestamptz DEFAULT now(),
  resolved boolean DEFAULT false,
  notes text
);

-- RLS: Users can insert their own feedback, admins can read all
ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert feedback"
  ON beta_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can read own feedback"
  ON beta_feedback FOR SELECT
  USING (auth.uid() = user_id);

-- Index for admin queries
CREATE INDEX idx_beta_feedback_created ON beta_feedback(created_at DESC);
CREATE INDEX idx_beta_feedback_category ON beta_feedback(category);
