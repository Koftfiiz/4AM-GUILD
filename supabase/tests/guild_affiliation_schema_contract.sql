-- Phase 1 schema contract checks.
-- Run only after the full schema baseline and the Guild Affiliation migration
-- have been applied to Staging. This script is read-only.

do $$
begin
  if to_regclass('public.guilds') is null then
    raise exception 'Missing public.guilds';
  end if;
  if to_regclass('public.guild_member_affiliations') is null then
    raise exception 'Missing public.guild_member_affiliations';
  end if;
  if to_regprocedure('public.can_manage_guild_affiliations()') is null then
    raise exception 'Missing public.can_manage_guild_affiliations()';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'guild_member_affiliations_one_current_user'
  ) then
    raise exception 'Missing unique current-user affiliation index';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'guild_member_affiliations_one_current_manual'
  ) then
    raise exception 'Missing unique current-manual affiliation index';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'guild_member_affiliations'
      and policyname = 'Guild admins can manage member affiliations'
      and qual like '%can_manage_guild_affiliations%'
      and with_check like '%can_manage_guild_affiliations%'
  ) then
    raise exception 'Affiliation write policy is missing or uses the wrong authorization helper';
  end if;

  if exists (
    select 1 from public.guild_member_affiliations
    where num_nonnulls(user_id, manual_member_id) <> 1
  ) then
    raise exception 'Found affiliation rows with invalid member identity';
  end if;

  if exists (
    select 1
    from public.guild_member_affiliations a
    join public.guild_member_affiliations b
      on a.id < b.id
     and a.ended_at is null
     and b.ended_at is null
     and (
       (a.user_id is not null and a.user_id = b.user_id)
       or
       (a.manual_member_id is not null and a.manual_member_id = b.manual_member_id)
     )
  ) then
    raise exception 'Found duplicate current affiliations';
  end if;
end;
$$;
