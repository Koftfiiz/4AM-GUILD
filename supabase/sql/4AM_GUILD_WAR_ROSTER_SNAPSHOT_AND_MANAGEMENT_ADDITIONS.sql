-- Query Name: 4AM_GUILD_WAR_ROSTER_SNAPSHOT_AND_MANAGEMENT_ADDITIONS
-- Purpose: Freeze the eligible roster after signup closes and audit late additions.
-- Safe migration: preserves existing signup, leave, party, and attendance records.

begin;

do $$
begin
  if to_regclass('public.war_events') is null
     or to_regclass('public.war_signups') is null
     or to_regclass('public.war_leave_requests') is null
     or to_regclass('public.guild_members') is null then
    raise exception 'Required war_events, war_signups, war_leave_requests, or guild_members table is missing. No changes were made.';
  end if;
  if to_regprocedure('public.is_war_manager()') is null then
    raise exception 'public.is_war_manager() is missing. No changes were made.';
  end if;
end;
$$;

create table if not exists public.war_event_roster_snapshots (
  event_id uuid not null references public.war_events(id) on delete cascade,
  member_id uuid not null references public.guild_members(user_id) on delete restrict,
  signup_id uuid null references public.war_signups(id) on delete set null,
  leave_request_id uuid null references public.war_leave_requests(id) on delete set null,
  original_status text not null check (original_status in ('signed_up','reserve','leave','absent')),
  roster_status text not null check (roster_status in ('signed_up','reserve','leave','absent','added_by_management')),
  snapshot_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create table if not exists public.war_event_roster_audit (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.war_events(id) on delete cascade,
  member_id uuid not null references public.guild_members(user_id) on delete restrict,
  old_status text not null,
  new_status text not null,
  action text not null check (action in ('management_added','management_corrected')),
  reason text not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

create index if not exists war_event_roster_audit_event_idx
  on public.war_event_roster_audit(event_id, changed_at desc);

alter table public.war_event_roster_snapshots enable row level security;
alter table public.war_event_roster_audit enable row level security;

drop policy if exists "Active guild members can view war roster snapshots" on public.war_event_roster_snapshots;
create policy "Active guild members can view war roster snapshots"
on public.war_event_roster_snapshots for select to authenticated
using (exists (
  select 1 from public.guild_members gm
  where gm.user_id = auth.uid() and gm.active = true
));

drop policy if exists "Management can view war roster audit" on public.war_event_roster_audit;
create policy "Management can view war roster audit"
on public.war_event_roster_audit for select to authenticated
using (public.is_war_manager());

revoke insert, update, delete on public.war_event_roster_snapshots from authenticated;
revoke insert, update, delete on public.war_event_roster_audit from authenticated;
grant select on public.war_event_roster_snapshots, public.war_event_roster_audit to authenticated;
grant usage, select on sequence public.war_event_roster_audit_id_seq to authenticated;

create or replace function public.capture_war_event_roster_snapshot(p_event_id uuid)
returns table (
  event_id uuid,
  member_id uuid,
  signup_id uuid,
  leave_request_id uuid,
  original_status text,
  roster_status text,
  snapshot_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event public.war_events%rowtype;
begin
  if auth.uid() is null or not exists (
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
    raise exception 'ไม่พบ Event วอร์นี้';
  end if;

  if v_event.signup_closes_at is null or now() < v_event.signup_closes_at then
    raise exception 'ยังไม่ถึงเวลาปิดรับสมัคร จึงยังสร้าง Snapshot ไม่ได้';
  end if;

  insert into public.war_event_roster_snapshots (
    event_id, member_id, signup_id, leave_request_id,
    original_status, roster_status
  )
  select
    p_event_id,
    gm.user_id,
    s.id,
    lr.id,
    case
      when lr.id is not null then 'leave'
      when s.id is not null and coalesce(s.queue_position, 999) <= 60 then 'signed_up'
      when s.id is not null then 'reserve'
      else 'absent'
    end,
    case
      when lr.id is not null then 'leave'
      when s.id is not null and coalesce(s.queue_position, 999) <= 60 then 'signed_up'
      when s.id is not null then 'reserve'
      else 'absent'
    end
  from public.guild_members gm
  left join lateral (
    select ws.id, ws.queue_position
    from public.war_signups ws
    where ws.event_id = p_event_id
      and ws.member_id = gm.user_id
      and ws.status <> 'cancelled'
    order by ws.created_at desc
    limit 1
  ) s on true
  left join lateral (
    select wl.id
    from public.war_leave_requests wl
    where wl.event_id = p_event_id
      and wl.member_id = gm.user_id
      and wl.status <> 'rejected'
      and wl.created_at <= v_event.signup_closes_at
    order by wl.created_at desc
    limit 1
  ) lr on true
  where gm.active = true
  on conflict (event_id, member_id) do nothing;

  return query
  select r.event_id, r.member_id, r.signup_id, r.leave_request_id,
         r.original_status, r.roster_status, r.snapshot_at
  from public.war_event_roster_snapshots r
  where r.event_id = p_event_id
  order by r.snapshot_at, r.member_id;
end;
$$;

-- Capture closed events automatically within one minute when pg_cron is available.
-- The Party Assignment page also calls capture_war_event_roster_snapshot() as a fallback.
create or replace function public.capture_due_war_event_roster_snapshots()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $
declare
  v_event record;
  v_rows integer;
  v_total integer := 0;
begin
  for v_event in
    select e.id, e.signup_closes_at
    from public.war_events e
    where e.signup_closes_at is not null
      and e.signup_closes_at <= now()
      and not exists (
        select 1 from public.war_event_roster_snapshots r
        where r.event_id = e.id
      )
    order by e.signup_closes_at
    for update of e
  loop
    insert into public.war_event_roster_snapshots (
      event_id, member_id, signup_id, leave_request_id,
      original_status, roster_status
    )
    select
      v_event.id,
      gm.user_id,
      s.id,
      lr.id,
      case
        when lr.id is not null then 'leave'
        when s.id is not null and coalesce(s.queue_position, 999) <= 60 then 'signed_up'
        when s.id is not null then 'reserve'
        else 'absent'
      end,
      case
        when lr.id is not null then 'leave'
        when s.id is not null and coalesce(s.queue_position, 999) <= 60 then 'signed_up'
        when s.id is not null then 'reserve'
        else 'absent'
      end
    from public.guild_members gm
    left join lateral (
      select ws.id, ws.queue_position
      from public.war_signups ws
      where ws.event_id = v_event.id
        and ws.member_id = gm.user_id
        and ws.status <> 'cancelled'
      order by ws.created_at desc
      limit 1
    ) s on true
    left join lateral (
      select wl.id
      from public.war_leave_requests wl
      where wl.event_id = v_event.id
        and wl.member_id = gm.user_id
        and wl.status <> 'rejected'
        and wl.created_at <= v_event.signup_closes_at
      order by wl.created_at desc
      limit 1
    ) lr on true
    where gm.active = true
    on conflict (event_id, member_id) do nothing;

    get diagnostics v_rows = row_count;
    if v_rows > 0 then v_total := v_total + 1; end if;
  end loop;
  return v_total;
end;
$;

do $
declare
  v_job_id bigint;
begin
  begin
    execute 'create extension if not exists pg_cron';
    if to_regnamespace('cron') is not null then
      select jobid into v_job_id
      from cron.job
      where jobname = '4am-war-roster-snapshot'
      limit 1;
      if v_job_id is not null then
        perform cron.unschedule(v_job_id);
      end if;
      perform cron.schedule(
        '4am-war-roster-snapshot',
        '* * * * *',
        'select public.capture_due_war_event_roster_snapshots();'
      );
    end if;
  exception when others then
    raise notice 'pg_cron was not enabled; Party Assignment will create the snapshot on first access after signup closes. Details: %', sqlerrm;
  end;
end;
$;

create or replace function public.add_member_to_war_event_roster(
  p_event_id uuid,
  p_member_id uuid,
  p_reason text
)
returns public.war_event_roster_snapshots
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event public.war_events%rowtype;
  v_row public.war_event_roster_snapshots%rowtype;
  v_old_status text;
begin
  if auth.uid() is null or not public.is_war_manager() then
    raise exception 'เฉพาะฝ่ายบริหารเท่านั้นที่เพิ่มสมาชิกหลังปิดรับสมัครได้';
  end if;
  if nullif(trim(p_reason), '') is null or char_length(trim(p_reason)) > 500 then
    raise exception 'กรุณาระบุเหตุผลในการเพิ่มสมาชิก (ไม่เกิน 500 ตัวอักษร)';
  end if;

  select * into v_event from public.war_events where id = p_event_id;
  if not found then raise exception 'ไม่พบ Event วอร์นี้'; end if;
  if v_event.signup_closes_at is null or now() < v_event.signup_closes_at then
    raise exception 'สามารถใช้การเพิ่มหลังปิดรับสมัครได้เมื่อ Event ปิดรับสมัครแล้วเท่านั้น';
  end if;
  if not exists (select 1 from public.guild_members gm where gm.user_id = p_member_id and gm.active = true) then
    raise exception 'สมาชิกนี้ไม่ได้อยู่ในสถานะ Active';
  end if;

  perform public.capture_war_event_roster_snapshot(p_event_id);

  insert into public.war_event_roster_snapshots (
    event_id, member_id, original_status, roster_status
  ) values (
    p_event_id, p_member_id, 'absent', 'absent'
  ) on conflict (event_id, member_id) do nothing;

  select * into v_row
  from public.war_event_roster_snapshots
  where event_id = p_event_id and member_id = p_member_id
  for update;

  if not found then raise exception 'ไม่พบสมาชิกใน Snapshot'; end if;
  if v_row.roster_status in ('signed_up','reserve','added_by_management') then
    return v_row;
  end if;

  v_old_status := v_row.roster_status;
  update public.war_event_roster_snapshots
  set roster_status = 'added_by_management', updated_at = now()
  where event_id = p_event_id and member_id = p_member_id
  returning * into v_row;

  insert into public.war_event_roster_audit (
    event_id, member_id, old_status, new_status,
    action, reason, changed_by
  ) values (
    p_event_id, p_member_id, v_old_status, 'added_by_management',
    'management_added', trim(p_reason), auth.uid()
  );

  return v_row;
end;
$$;

grant execute on function public.capture_war_event_roster_snapshot(uuid) to authenticated;
grant execute on function public.add_member_to_war_event_roster(uuid,uuid,text) to authenticated;

commit;
