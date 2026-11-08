-- Query Name: 4AM_GUILD_WAR_SIGNUP_SETUP
-- Type: Safe schema verification + grants
-- Existing installations already have public.war_signups with:
-- event_id, member_id, raid, status, note, created_at.
-- This script intentionally does NOT create, drop, rename, or rewrite data,
-- constraints, or existing RLS policies.

DO $$
BEGIN
  IF to_regclass('public.war_signups') IS NULL THEN
    RAISE EXCEPTION
      'public.war_signups does not exist. Stop here and verify the database before creating it.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'war_signups'
      AND column_name = 'event_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'war_signups'
      AND column_name = 'member_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'war_signups'
      AND column_name = 'raid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'war_signups'
      AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION
      'war_signups schema does not match the expected existing schema. No changes were made.';
  END IF;
END;
$;

-- Keep row-level security enabled and grant the table operations used by the app.
-- Existing policies remain untouched and continue to control who can do each action.
ALTER TABLE public.war_signups ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.war_signups TO authenticated;
