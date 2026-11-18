-- Staging-only: when a Manual-only 4AM member links an account during an active Patch,
-- snapshot any due round first, then add the canonical account to the active roster.
create or replace function public.merge_manual_affiliation_into_account()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_now timestamptz:=clock_timestamp(); v_user_has_current boolean;
begin
 if new.linked_user_id is null or old.linked_user_id is not null or new.linked_user_id is not distinct from old.linked_user_id then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.linked_user_id::text,4104));
 perform pg_advisory_xact_lock(hashtextextended(new.id::text,4104));
 perform public.snapshot_due_patch_rosters();
 select exists(select 1 from public.guild_member_affiliations where user_id=new.linked_user_id and ended_at is null) into v_user_has_current;
 if v_user_has_current then update public.guild_member_affiliations set ended_at=v_now where manual_member_id=new.id and ended_at is null; end if;
 update public.guild_member_affiliations set user_id=new.linked_user_id,manual_member_id=null where manual_member_id=new.id;
 insert into public.portfolio_patch_roster(round_id,member_id,character_name,game_class,nickname,discord_name,affiliation_id,roster_source)
 select r.id,gm.user_id,gm.character_name,gm.game_class,gm.nickname,gm.discord_name,aff.id,'affiliation_transfer'
 from public.guild_member_affiliations aff
 join public.guilds g on g.id=aff.guild_id and g.code='4AM'
 join public.guild_members gm on gm.user_id=aff.user_id and gm.active=true and gm.membership_status='active'
 join public.portfolio_update_rounds r on r.status='open' and r.archived_at is null
  and r.roster_snapshot_at is not null and v_now between r.starts_at and r.closes_at
 where aff.user_id=new.linked_user_id and aff.ended_at is null
 on conflict(round_id,member_id) do nothing;
 return new;
end; $$;
revoke all on function public.merge_manual_affiliation_into_account() from public,anon,authenticated;
