-- Phase 3–7 schema contract checks. Read-only; run after the production migrations
-- have been applied to the Staging schema baseline.

do $$
begin
  if to_regclass('public.portfolio_patch_roster') is null then
    raise exception 'Missing public.portfolio_patch_roster';
  end if;
  if to_regclass('public.portfolio_patch_submission_reviews') is null then
    raise exception 'Missing public.portfolio_patch_submission_reviews';
  end if;
  if to_regclass('public.portfolio_patch_review_events') is null then
    raise exception 'Missing public.portfolio_patch_review_events';
  end if;
  if to_regclass('public.portfolio_update_edit_permissions') is null
     or to_regclass('public.portfolio_update_edit_requests') is null then
    raise exception 'Legacy Patch late-edit permission/request tables must exist in Staging';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='portfolio_versions' and column_name='round_id')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='portfolio_version_images' and column_name='image_type') then
    raise exception 'Legacy Portfolio nested query columns are incomplete';
  end if;
  if to_regclass('public.portfolio_patch_submission_events') is null then
    raise exception 'Missing public.portfolio_patch_submission_events';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='portfolio_update_rounds'
      and column_name='roster_snapshot_at'
  ) then
    raise exception 'Missing portfolio_update_rounds.roster_snapshot_at';
  end if;

  if to_regprocedure('public.snapshot_due_patch_rosters()') is null
     or to_regprocedure('public.set_guild_member_affiliation(text,uuid,uuid,text)') is null
     or to_regprocedure('public.submit_portfolio_patch(uuid,uuid,uuid)') is null
     or to_regprocedure('public.set_patch_submission_review(uuid,text,text)') is null
     or to_regprocedure('public.get_patch_command_center(uuid,text,text,integer,integer)') is null then
    raise exception 'One or more Patch workflow RPCs are missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.portfolio_patch_roster'::regclass
      and contype='u'
      and pg_get_constraintdef(oid) like 'UNIQUE (round_id, member_id)%'
  ) then
    raise exception 'Patch roster must be unique per round/member';
  end if;

  if has_table_privilege('anon','public.portfolio_patch_roster','INSERT')
     or has_table_privilege('anon','public.portfolio_patch_roster','UPDATE')
     or has_table_privilege('anon','public.portfolio_patch_roster','DELETE')
     or has_table_privilege('authenticated','public.portfolio_patch_roster','INSERT')
     or has_table_privilege('authenticated','public.portfolio_patch_roster','UPDATE')
     or has_table_privilege('authenticated','public.portfolio_patch_roster','DELETE')
     or has_table_privilege('authenticated','public.portfolio_patch_roster','TRUNCATE') then
    raise exception 'Patch roster must remain immutable to client roles';
  end if;

  if has_function_privilege('anon','public.snapshot_due_patch_rosters()','EXECUTE')
     or has_function_privilege('authenticated','public.snapshot_due_patch_rosters()','EXECUTE') then
    raise exception 'Internal Patch snapshot worker must not be executable by client roles';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='portfolio_patch_submission_reviews'
      and policyname='patch_submission_reviews_read_members'
      and qual like '%can_manage_guild_affiliations%'
      and qual like '%member_id%'
  ) then
    raise exception 'Patch review visibility must be restricted to owner/reviewer';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='portfolio_patch_review_events'
      and policyname='patch_review_events_read_members'
      and qual like '%can_manage_guild_affiliations%'
      and qual like '%member_id%'
  ) then
    raise exception 'Patch review event visibility must be restricted to owner/reviewer';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='portfolio_patch_submission_events'
      and policyname='patch_submission_events_read_members'
      and qual like '%can_manage_guild_affiliations%'
      and qual like '%member_id%'
  ) then
    raise exception 'Patch submission version history must be restricted to owner/reviewer';
  end if;
  if to_regprocedure('public.audit_patch_submission_event()') is null
     or not exists(select 1 from pg_trigger where tgname='patch_submission_version_audit' and not tgisinternal) then
    raise exception 'Patch submission version audit trigger is missing';
  end if;

  if not (
    select pg_get_functiondef('public.snapshot_due_patch_rosters()'::regprocedure)
      like '%aff.started_at <= r.starts_at%'
      and pg_get_functiondef('public.snapshot_due_patch_rosters()'::regprocedure)
      like '%aff.ended_at > r.starts_at%'
  ) then
    raise exception 'Opening Patch snapshot must use affiliation validity at round starts_at';
  end if;

  if not (
    select pg_get_functiondef('public.get_patch_command_center(uuid,text,text,integer,integer)'::regprocedure)
      like '%review_queue_total%'
      and pg_get_functiondef('public.get_patch_command_center(uuid,text,text,integer,integer)'::regprocedure)
      like '%attention_members%'
      and pg_get_functiondef('public.get_patch_command_center(uuid,text,text,integer,integer)'::regprocedure)
      like '%portfolio_patch_submission_events%'
      and pg_get_functiondef('public.get_patch_command_center(uuid,text,text,integer,integer)'::regprocedure)
      like '%activity_type%'
  ) then
    raise exception 'Command Center read model must expose bounded review, attention, and submission activity summaries';
  end if;

  if not (
    select pg_get_functiondef('public.submit_portfolio_patch(uuid,uuid,uuid)'::regprocedure)
      like '%snapshot_due_patch_rosters%'
      and pg_get_functiondef('public.submit_portfolio_patch(uuid,uuid,uuid)'::regprocedure)
      like '%membership_status%'
  ) then
    raise exception 'Submission RPC must snapshot due roster and require active membership';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and indexname='portfolio_update_rounds_snapshot_due_idx'
  ) then
    raise exception 'Missing due-snapshot index';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='portfolio_patch_submission_events_new_version_idx')
     or not exists(select 1 from pg_indexes where schemaname='public' and indexname='portfolio_patch_submission_events_previous_version_idx')
     or not exists(select 1 from pg_indexes where schemaname='public' and indexname='portfolio_patch_submission_events_actor_idx')
     or not exists(select 1 from pg_indexes where schemaname='public' and indexname='portfolio_update_edit_permissions_member_idx')
     or not exists(select 1 from pg_indexes where schemaname='public' and indexname='portfolio_update_edit_requests_member_idx')
     or not exists(select 1 from pg_indexes where schemaname='public' and indexname='portfolio_versions_created_by_idx') then
    raise exception 'Missing indexes for Patch audit and legacy foreign keys';
  end if;
  if exists (
    select tablename from pg_policies
    where schemaname='public' and roles @> array['authenticated']::name[]
      and cmd='SELECT'
      and tablename in ('guilds','guild_member_affiliations','portfolio_patch_roster',
        'portfolio_update_rounds','portfolio_update_edit_permissions','portfolios',
        'portfolio_versions','portfolio_version_images','portfolio_patch_submissions')
    group by tablename having count(*)>1
  ) then
    raise exception 'Duplicate permissive SELECT policies remain on the Patch/Portfolio feature tables';
  end if;
end;
$$;
