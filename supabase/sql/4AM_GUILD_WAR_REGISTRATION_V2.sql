-- Query Name: 4AM_GUILD_WAR_REGISTRATION_V2
-- Type: Safe migration + RPCs
-- Purpose: Scheduled official/practice war registration, atomic queue 1-80,
--          automatic time-window enforcement, and post-close class summaries.
-- Existing war events, signup rows, parties, and member data are preserved.
--
-- Run this script once in Supabase SQL Editor after reviewing the migration.
-- The website's new registration UI will use create_war_signup_event() and
-- join_war_signup(); it will not insert or update signup rows directly.

begin;

do $$
begin
  if to_regclass('public.war_events') is null then
    raise exception 'public.war_events does not exist; no changes were made.';
  end if;
  if to_regclass('public.war_signups') is null then
    raise exception 'public.war_signups does not exist; no changes were made.';
  end if;
  if to_regclass('public.guild_members') is null then
    raise exception 'public.guild_members does not exist; no changes were made.';
  end if;
  if to_regprocedure('public.is_war_manager()') is null then
    raise exception 'public.is_war_manager() is missing. Install the existing guild management authorization helper before running this migration.';
  end if;
end;
$$;

alter table public.war_events
  add column if not exists registration_type text not null default 'official',
  add column if not exists signup_opens_at timestamptz,
  add column if not exists signup_closes_at timestamptz;

alter table public.war_signups
  add column if not exists queue_position integer;

-- Existing signups are retained and receive a stable historical queue position.
with ranked as (
  select id,
         row_number() over (partition by event_id order by created_at asc, id asc)::integer as position
  from public.war_signups
  where status <> 'cancelled'
    and queue_position is null
)
update public.war_signups s
set queue_position = ranked.position,
    status = case when ranked.position <= 60 then 'signed_up' else 'standby' end
from ranked
where s.id = ranked.id;

-- New registrations do not choose a raid; Raid is assigned later by Management.
alter table public.war_signups alter column raid drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.war_events'::regclass
      and conname = 'war_events_registration_type_check'
  ) then
    alter table public.war_events
      add constraint war_events_registration_type_check
      check (registration_type in ('official','practice'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.war_signups'::regclass
      and conname = 'war_signups_queue_position_check'
  ) then
    alter table public.war_signups
      add constraint war_signups_queue_position_check
      check (queue_position is null or queue_position > 0);
  end if;
end;
$$;

create unique index if not exists war_signups_event_queue_position_uidx
  on public.war_signups(event_id, queue_position)
  where queue_position is not null;

create index if not exists war_events_signup_window_idx
  on public.war_events(signup_opens_at, signup_closes_at)
  where signup_opens_at is not null and signup_closes_at is not null;

-- Only Management/Leader/Developer can create a registration event.
-- Confirmation creates a scheduled event immediately; time controls opening/closing.
create or replace function public.create_war_signup_event(
  p_event_name text,
  p_registration_type text,
  p_event_date date,
  p_start_time time,
  p_signup_opens_at timestamptz,
  p_signup_closes_at timestamptz,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event_id uuid;
  v_raid_count integer;
  v_description text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_war_manager() then
    raise exception 'เฉพาะ Management ขึ้นไปเท่านั้นที่สร้าง Event ลงชื่อวอร์ได้';
  end if;
  if not exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true
  ) then
    raise exception 'Active guild membership required';
  end if;
  if nullif(trim(p_event_name), '') is null or char_length(trim(p_event_name)) > 120 then
    raise exception 'กรุณาระบุชื่อ Event ไม่เกิน 120 ตัวอักษร';
  end if;
  if p_registration_type not in ('official','practice') then
    raise exception 'Invalid registration type';
  end if;
  if p_event_date is null or p_start_time is null
     or p_signup_opens_at is null or p_signup_closes_at is null then
    raise exception 'กรุณากำหนดวันที่และเวลาให้ครบ';
  end if;
  if p_signup_closes_at <= p_signup_opens_at then
    raise exception 'เวลาปิดรับสมัครต้องอยู่หลังเวลาเริ่มลงชื่อ';
  end if;
  if p_signup_closes_at <= now() then
    raise exception 'เวลาปิดรับสมัครต้องเป็นเวลาในอนาคต';
  end if;

  v_raid_count := case when p_registration_type = 'official' then 2 else 4 end;
  v_description := '[[WAR_CONFIG:' ||
    jsonb_build_object('mode', p_registration_type, 'raidCount', v_raid_count)::text ||
    ']]' || case when nullif(trim(p_description), '') is null
      then '' else E'\n' || trim(p_description) end;

  insert into public.war_events (
    event_name, event_date, start_time, description, status,
    created_by, is_draft_confirmed, is_published,
    registration_type, signup_opens_at, signup_closes_at
  ) values (
    trim(p_event_name), p_event_date, p_start_time, v_description, 'open',
    auth.uid(), true, false,
    p_registration_type, p_signup_opens_at, p_signup_closes_at
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- Atomically allocates a unique queue number while holding the event row lock.
-- The database clock is authoritative; a stale browser cannot register late.
create or replace function public.join_war_signup(p_event_id uuid)
returns table(queue_position integer, signup_status text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event public.war_events%rowtype;
  v_next_position integer;
  v_existing public.war_signups%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.guild_members gm
    where gm.user_id = auth.uid() and gm.active = true
  ) then
    raise exception 'Active guild membership required';
  end if;

  select * into v_event
  from public.war_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'ไม่พบ Event ลงชื่อวอร์นี้';
  end if;

  if v_event.signup_opens_at is null or v_event.signup_closes_at is null then
    raise exception 'Event นี้ยังไม่ได้ตั้งเวลาเปิดและปิดรับสมัคร';
  end if;
  if now() < v_event.signup_opens_at then
    raise exception 'ยังไม่ถึงเวลาเปิดรับสมัคร';
  end if;
  if now() >= v_event.signup_closes_at then
    raise exception 'Event นี้ปิดรับสมัครแล้ว';
  end if;

  select * into v_existing
  from public.war_signups
  where event_id = p_event_id and member_id = auth.uid();

  if found then
    if v_existing.status = 'cancelled' then
      raise exception 'บัญชีนี้เคยลงชื่อ Event นี้แล้ว ไม่สามารถลงชื่อซ้ำได้';
    end if;
    return query select v_existing.queue_position, v_existing.status;
    return;
  end if;

  select coalesce(max(s.queue_position), 0) + 1
  into v_next_position
  from public.war_signups s
  where s.event_id = p_event_id
    and s.status <> 'cancelled';

  if v_next_position > 80 then
    raise exception 'รายชื่อครบ 80 คนแล้ว';
  end if;

  insert into public.war_signups(event_id, member_id, raid, status, queue_position)
  values (
    p_event_id,
    auth.uid(),
    null,
    case when v_next_position <= 60 then 'signed_up' else 'standby' end,
    v_next_position
  );

  return query
  select v_next_position,
         case when v_next_position <= 60 then 'signed_up'::text else 'standby'::text;
end;
$$;

-- Keep members read-only for signup rows; all new signup writes go through the RPC.
drop policy if exists "Members can sign themselves up" on public.war_signups;
drop policy if exists "Members can update own signup" on public.war_signups;
drop policy if exists "Members can update their own signup" on public.war_signups;

grant select on public.war_signups to authenticated;
revoke insert, update, delete on public.war_signups from authenticated;
grant execute on function public.create_war_signup_event(text,text,date,time,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.join_war_signup(uuid) to authenticated;

commit;
