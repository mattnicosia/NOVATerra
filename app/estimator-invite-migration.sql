-- Estimator Invitation System Migration
-- Run in Supabase Dashboard > SQL Editor
-- Adds email tracking to org_invitations + email column to org_members

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Add email column to org_members (for matching local estimator entries)
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE org_members ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_org_members_email ON org_members(email);

-- Backfill email for existing members from auth.users
UPDATE org_members SET email = (SELECT email FROM auth.users WHERE id = org_members.user_id)
WHERE email IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Add email tracking columns to org_invitations
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE org_invitations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'created';
ALTER TABLE org_invitations ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE org_invitations ADD COLUMN IF NOT EXISTS resend_email_id TEXT;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Update accept_invitation RPC to include email in membership
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION accept_invitation(invitation_token TEXT)
RETURNS JSONB AS $$
DECLARE
  inv RECORD;
  mem RECORD;
BEGIN
  -- Find valid invitation
  SELECT * INTO inv FROM org_invitations
  WHERE token = invitation_token AND accepted_at IS NULL AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation');
  END IF;

  -- Check email matches current user
  IF inv.email != (SELECT email FROM auth.users WHERE id = auth.uid()) THEN
    RETURN jsonb_build_object('error', 'This invitation was sent to a different email address');
  END IF;

  -- Check not already a member
  IF EXISTS(SELECT 1 FROM org_members WHERE org_id = inv.org_id AND user_id = auth.uid()) THEN
    RETURN jsonb_build_object('error', 'You are already a member of this organization');
  END IF;

  -- Create membership (now includes email)
  INSERT INTO org_members (org_id, user_id, role, display_name, email, joined_at)
  VALUES (
    inv.org_id,
    auth.uid(),
    inv.role,
    (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = auth.uid()),
    inv.email,
    now()
  )
  RETURNING * INTO mem;

  -- Mark invitation accepted
  UPDATE org_invitations SET accepted_at = now(), status = 'accepted' WHERE id = inv.id;

  RETURN jsonb_build_object(
    'success', true,
    'org_id', inv.org_id,
    'role', inv.role,
    'member_id', mem.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
