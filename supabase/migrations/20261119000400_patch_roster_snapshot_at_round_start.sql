-- Correct delayed Patch snapshots to use guild affiliation valid at the round opening time.
-- Additive replacement of the internal worker; existing roster rows remain immutable.

create or replace function public.snapshot_due_patch_rosters()
returns integer language plpgsql security definer set search_path=''
as $$
declare r record; v_count integer:=0; v_inserted integer;
begin
 for r in
  select id,starts_at from public.portfolio_update_rounds
  where archived_at is null and roster_snapshot_at is null and starts_at<=clock_timestamp()
  order by starts_at,id for update
 loop
  insert into public.portfolio_patch_roster
   (round_id,member_id,character_name,game_class,nickname,discord_name,affiliation_id,roster_source)
  select r.id,gm.user_id,gm.character_name,gm.game_class,gm.nickname,gm.discord_name,aff.id,'opening_snapshot'
  from public.guild_member_affiliations aff
  join public.guilds g on g.id=aff.guild_id and g.code='4AM'
  join public.guild_members gm on gm.user_id=aff.user_id
  where aff.user_id is not null
    and aff.started_at<=r.starts_at
    and (aff.ended_at is null or aff.ended_at>r.starts_at)
    and gm.active=true and gm.membership_status='active'
  on conflict(round_id,member_id) do nothing;
  get diagnostics v_inserted=row_count;
  update public.portfolio_update_rounds
    set roster_snapshot_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=r.id and roster_snapshot_at is null;
  v_count:=v_count+v_inserted;
 end loop;
 return v_count;
end; $$;

-- Keep the worker internal. CREATE OR REPLACE preserves the existing grants,
-- but explicitly restate the intended restriction for migration clarity.
revoke all on function public.snapshot_due_patch_rosters() from public,anon,authenticated;
