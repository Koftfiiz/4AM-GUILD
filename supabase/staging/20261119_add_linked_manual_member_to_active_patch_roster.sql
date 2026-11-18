-- Staging-only compatibility migration.
-- This idempotently re-applies the canonical Manual-to-account merge trigger.
-- Keep in sync with 20261119_merge_manual_affiliation_on_account_link.sql.
-- transfer its affiliation history to the canonical user_id and preserve Patch eligibility.
create or replace function public.merge_manual_affiliation_into_account()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_now timestamptz:=clock_timestamp();
 v_user_has_current boolean;
begin
 if new.linked_user_id is null or old.linked_user_id is not null
    or new.linked_user_id is not distinct from old.linked_user_id then
  return new;
 end if;

 perform pg_advisory_xact_lock(hashtextextended(new.linked_user_id::text,4104));
 perform pg_advisory_xact_lock(hashtextextended(new.id::text,4104));

 select exists(
  select 1 from public.guild_member_affiliations
  where user_id=new.linked_user_id and ended_at is null
 ) into v_user_has_current;

 if v_user_has_current then
  -- The registered account's current affiliation is canonical if both identities already have one.
  update public.guild_member_affiliations
  set ended_at=v_now
  where manual_member_id=new.id and ended_at is null;
 end if;

 update public.guild_member_affiliations
 set user_id=new.linked_user_id,manual_member_id=null
 where manual_member_id=new.id;

 -- A Manual-only member could not enter a Patch roster before account linking.
 -- Re-snapshot due rounds after the canonical identity is available.
 perform public.snapshot_due_patch_rosters();

 -- If the opening snapshot already exists, add this newly eligible 4AM account
 -- to the active Patch exactly once, without rewriting the opening snapshot.
 insert into public.portfolio_patch_roster
  (round_id,member_id,character_name,game_class,nickname,discord_name,affiliation_id,roster_source)
 select r.id,gm.user_id,gm.character_name,gm.game_class,gm.nickname,gm.discord_name,aff.id,'manual_link'
 from public.guild_member_affiliations aff
 join public.guilds g on g.id=aff.guild_id and g.code='4AM'
 join public.guild_members gm on gm.user_id=aff.user_id
 join public.portfolio_update_rounds r
  on r.status='open' and r.archived_at is null and r.roster_snapshot_at is not null
  and v_now between r.starts_at and r.closes_at
 where aff.user_id=new.linked_user_id and aff.ended_at is null
  and gm.active=true and gm.membership_status='active'
 on conflict(round_id,member_id) do nothing;

 return new;
end; $$;

revoke all on function public.merge_manual_affiliation_into_account() from public,anon,authenticated;
drop trigger if exists guild_manual_member_merge_affiliation on public.guild_manual_members;
create trigger guild_manual_member_merge_affiliation
after update of linked_user_id on public.guild_manual_members
for each row
when (old.linked_user_id is null and new.linked_user_id is not null)
execute function public.merge_manual_affiliation_into_account();
