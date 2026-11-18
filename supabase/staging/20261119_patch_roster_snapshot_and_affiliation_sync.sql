-- Staging-only Patch Roster prototype. Apply after guild_affiliation_staging_baseline
-- and 20261119_tighten_affiliation_rpc_permissions_and_idempotency.sql.
-- Do not apply to Production until integrated app QA and release approval.

create table public.portfolio_update_rounds (
  id uuid primary key default gen_random_uuid(),
  round_name text not null,
  starts_at timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  roster_snapshot_at timestamptz,
  check (closes_at > starts_at)
);

create table public.portfolio_patch_roster (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.portfolio_update_rounds(id) on delete restrict,
  member_id uuid not null,
  character_name text not null,
  game_class text not null,
  nickname text,
  discord_name text,
  affiliation_id uuid,
  roster_source text not null check (roster_source in ('opening_snapshot','affiliation_transfer')),
  added_at timestamptz not null default now(),
  unique (round_id,member_id)
);
create index portfolio_patch_roster_round_idx on public.portfolio_patch_roster(round_id,added_at);
create index portfolio_patch_roster_member_idx on public.portfolio_patch_roster(member_id,round_id);
create index portfolio_update_rounds_snapshot_due_idx
  on public.portfolio_update_rounds(starts_at)
  where status='open' and archived_at is null and roster_snapshot_at is null;

alter table public.portfolio_update_rounds enable row level security;
alter table public.portfolio_patch_roster enable row level security;
create policy patch_rounds_read on public.portfolio_update_rounds for select to authenticated using (true);
create policy patch_roster_read on public.portfolio_patch_roster for select to authenticated using (true);
grant select on public.portfolio_update_rounds,public.portfolio_patch_roster to authenticated;

create or replace function public.snapshot_due_patch_rosters()
returns integer language plpgsql security definer set search_path = ''
as $$
declare r record; v_count integer := 0; v_inserted integer;
begin
  for r in select id from public.portfolio_update_rounds
    where status='open' and archived_at is null and roster_snapshot_at is null
      and starts_at <= clock_timestamp()
    order by starts_at,id for update skip locked
  loop
    insert into public.portfolio_patch_roster
      (round_id,member_id,character_name,game_class,nickname,discord_name,affiliation_id,roster_source)
    select r.id,gm.user_id,gm.character_name,gm.game_class,gm.nickname,gm.discord_name,aff.id,'opening_snapshot'
    from public.guild_member_affiliations aff
    join public.guilds g on g.id=aff.guild_id and g.code='4AM'
    join public.guild_members gm on gm.user_id=aff.user_id
    where aff.ended_at is null and aff.user_id is not null
      and gm.active=true and gm.membership_status='active'
    on conflict(round_id,member_id) do nothing;
    get diagnostics v_inserted = row_count;
    update public.portfolio_update_rounds set roster_snapshot_at=clock_timestamp(),updated_at=clock_timestamp()
      where id=r.id and roster_snapshot_at is null;
    v_count := v_count + v_inserted;
  end loop;
  return v_count;
end; $$;
revoke all on function public.snapshot_due_patch_rosters() from public,anon,authenticated;

create or replace function public.add_member_to_active_patch_rosters()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_name text; v_class text; v_nick text; v_discord text;
begin
  if new.ended_at is not null or new.user_id is null then return new; end if;
  if not exists(select 1 from public.guilds where id=new.guild_id and code='4AM') then return new; end if;
  select character_name,game_class,nickname,discord_name into v_name,v_class,v_nick,v_discord
    from public.guild_members where user_id=new.user_id and active=true and membership_status='active';
  if not found then return new; end if;
  insert into public.portfolio_patch_roster
    (round_id,member_id,character_name,game_class,nickname,discord_name,affiliation_id,roster_source)
  select r.id,new.user_id,v_name,v_class,v_nick,v_discord,new.id,'affiliation_transfer'
  from public.portfolio_update_rounds r
  where r.status='open' and r.archived_at is null and r.roster_snapshot_at is not null
    and clock_timestamp() between r.starts_at and r.closes_at
  on conflict(round_id,member_id) do nothing;
  return new;
end; $$;
revoke all on function public.add_member_to_active_patch_rosters() from public,anon,authenticated;
create trigger guild_affiliation_add_to_patch_roster
after insert on public.guild_member_affiliations
for each row execute function public.add_member_to_active_patch_rosters();

-- Call snapshot_due_patch_rosters() from a low-frequency pg_cron job in the final
-- Production migration (e.g. once per minute). Do not keep a recurring job active
-- in Free Staging because it can prevent idle-project pausing.

create or replace function public.set_guild_member_affiliation(
  p_guild_code text,p_user_id uuid default null,p_manual_member_id uuid default null,p_reason text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_guild_id uuid; v_current_guild_id uuid; v_new_id uuid;
v_started_at timestamptz:=clock_timestamp(); v_manual_linked_user uuid;
begin
  if (p_user_id is null)=(p_manual_member_id is null) then raise exception 'Provide exactly one member identity'; end if;
  if (select auth.uid()) is null or not public.is_guild_admin() then raise exception 'Not authorized to change guild affiliation'; end if;
  select id into v_guild_id from public.guilds where code=p_guild_code and is_active=true;
  if v_guild_id is null then raise exception 'Unknown or inactive guild'; end if;
  perform public.snapshot_due_patch_rosters();
  if p_user_id is not null then
    if not exists(select 1 from public.guild_members where user_id=p_user_id and active=true and membership_status='active') then raise exception 'Registered member not found or inactive'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,4104));
    select guild_id into v_current_guild_id from public.guild_member_affiliations where user_id=p_user_id and ended_at is null for update;
    if v_current_guild_id=v_guild_id then select id into v_new_id from public.guild_member_affiliations where user_id=p_user_id and ended_at is null; return v_new_id; end if;
    update public.guild_member_affiliations set ended_at=v_started_at where user_id=p_user_id and ended_at is null;
    insert into public.guild_member_affiliations(guild_id,user_id,started_at,change_reason,created_by)
    values(v_guild_id,p_user_id,v_started_at,nullif(trim(p_reason),''),(select auth.uid())) returning id into v_new_id;
  else
    perform pg_advisory_xact_lock(hashtextextended(p_manual_member_id::text,4104));
    select linked_user_id into v_manual_linked_user from public.guild_manual_members where id=p_manual_member_id and active=true for update;
    if not found then raise exception 'Manual member not found or inactive'; end if;
    if v_manual_linked_user is not null then raise exception 'This manual record is linked to a registered account; use canonical user_id'; end if;
    select guild_id into v_current_guild_id from public.guild_member_affiliations where manual_member_id=p_manual_member_id and ended_at is null for update;
    if v_current_guild_id=v_guild_id then select id into v_new_id from public.guild_member_affiliations where manual_member_id=p_manual_member_id and ended_at is null; return v_new_id; end if;
    update public.guild_member_affiliations set ended_at=v_started_at where manual_member_id=p_manual_member_id and ended_at is null;
    insert into public.guild_member_affiliations(guild_id,manual_member_id,started_at,change_reason,created_by)
    values(v_guild_id,p_manual_member_id,v_started_at,nullif(trim(p_reason),''),(select auth.uid())) returning id into v_new_id;
  end if;
  return v_new_id;
end; $$;
revoke all on function public.set_guild_member_affiliation(text,uuid,uuid,text) from public,anon;
grant execute on function public.set_guild_member_affiliation(text,uuid,uuid,text) to authenticated;
