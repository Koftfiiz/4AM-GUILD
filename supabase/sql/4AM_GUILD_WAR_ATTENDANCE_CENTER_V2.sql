-- Query Name: 4AM_GUILD_WAR_ATTENDANCE_CENTER_V2
-- Purpose: Round-specific Discord check-ins and post-war attendance reports.
-- Safe additive migration. Existing war_attendance_records and roster data are preserved.
begin;

do $$
begin
  if to_regclass('public.war_events') is null
     or to_regclass('public.guild_members') is null
     or to_regclass('public.war_parties') is null
     or to_regclass('public.war_party_members') is null
     or to_regprocedure('public.is_war_manager()') is null then
    raise exception 'Required Guild War tables or public.is_war_manager() are missing. No changes were made.';
  end if;
end;
$$;

create table if not exists public.war_round_checkins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.war_events(id) on delete cascade,
  round_number smallint not null check (round_number in (1,2)),
  member_id uuid not null references public.guild_members(user_id) on delete restrict,
  discord_user_id text not null,
  checked_in_at timestamptz not null default now(),
  unique(event_id, round_number, member_id)
);

create index if not exists war_round_checkins_event_round_idx
  on public.war_round_checkins(event_id, round_number, checked_in_at);

create table if not exists public.war_attendance_reports (
  event_id uuid primary key references public.war_events(id) on delete cascade,
  report_status text not null default 'draft' check (report_status in ('draft','finalized')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  finalized_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((report_status = 'draft' and finalized_at is null) or (report_status = 'finalized' and finalized_at is not null))
);

create table if not exists public.war_attendance_round_records (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.war_events(id) on delete cascade,
  round_number smallint not null check (round_number in (1,2)),
  member_id uuid not null references public.guild_members(user_id) on delete restrict,
  attendance_status text not null check (attendance_status in ('attended','emergency_leave','absent','reserve_played')),
  replaced_member_id uuid references public.guild_members(user_id) on delete restrict,
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, round_number, member_id),
  check ((attendance_status = 'reserve_played' and replaced_member_id is not null) or (attendance_status <> 'reserve_played' and replaced_member_id is null))
);

create index if not exists war_attendance_round_records_member_idx
  on public.war_attendance_round_records(member_id, event_id, round_number);

create table if not exists public.war_attendance_change_audit (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.war_events(id) on delete cascade,
  round_number smallint not null check (round_number in (1,2)),
  member_id uuid not null references public.guild_members(user_id) on delete restrict,
  old_status text,
  new_status text not null,
  old_replaced_member_id uuid references public.guild_members(user_id) on delete restrict,
  new_replaced_member_id uuid references public.guild_members(user_id) on delete restrict,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);

alter table public.war_round_checkins enable row level security;
alter table public.war_attendance_reports enable row level security;
alter table public.war_attendance_round_records enable row level security;
alter table public.war_attendance_change_audit enable row level security;

drop policy if exists "War managers view round checkins" on public.war_round_checkins;
create policy "War managers view round checkins"
on public.war_round_checkins for select to authenticated
using (public.is_war_manager());

drop policy if exists "War managers manage attendance reports" on public.war_attendance_reports;
create policy "War managers manage attendance reports"
on public.war_attendance_reports for all to authenticated
using (public.is_war_manager())
with check (public.is_war_manager());

drop policy if exists "War managers manage round attendance" on public.war_attendance_round_records;
create policy "War managers manage round attendance"
on public.war_attendance_round_records for all to authenticated
using (public.is_war_manager())
with check (public.is_war_manager());

drop policy if exists "War managers view attendance audit" on public.war_attendance_change_audit;
create policy "War managers view attendance audit"
on public.war_attendance_change_audit for select to authenticated
using (public.is_war_manager());

revoke all on public.war_round_checkins from anon, authenticated;
grant select on public.war_round_checkins to authenticated;
grant all on public.war_round_checkins to service_role;
grant select, insert, update, delete on public.war_attendance_reports to authenticated;
grant select, insert, update, delete on public.war_attendance_round_records to authenticated;
grant select on public.war_attendance_change_audit to authenticated;
grant usage, select on sequence public.war_attendance_change_audit_id_seq to authenticated;

create or replace function public.audit_war_attendance_round_record()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.war_attendance_change_audit(event_id,round_number,member_id,old_status,new_status,new_replaced_member_id,changed_by)
    values(new.event_id,new.round_number,new.member_id,null,new.attendance_status,new.replaced_member_id,coalesce(auth.uid(),new.recorded_by));
    return new;
  end if;
  if old.attendance_status is distinct from new.attendance_status
     or old.replaced_member_id is distinct from new.replaced_member_id then
    insert into public.war_attendance_change_audit(event_id,round_number,member_id,old_status,new_status,old_replaced_member_id,new_replaced_member_id,changed_by)
    values(new.event_id,new.round_number,new.member_id,old.attendance_status,new.attendance_status,old.replaced_member_id,new.replaced_member_id,coalesce(auth.uid(),new.recorded_by));
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_audit_war_attendance_round_record on public.war_attendance_round_records;
create trigger trg_audit_war_attendance_round_record
before insert or update on public.war_attendance_round_records
for each row execute function public.audit_war_attendance_round_record();

create or replace function public.finalize_war_attendance_report(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_missing integer;
begin
  if auth.uid() is null or not public.is_war_manager() then
    raise exception 'เฉพาะ Management ขึ้นไปเท่านั้นที่ปิดรายงานวอร์ได้';
  end if;

  if not exists (select 1 from public.war_events where id = p_event_id) then
    raise exception 'ไม่พบกิจกรรมวอร์';
  end if;

  -- Both rounds must have an attendance decision for every member in the published party roster.
  select count(*) into v_missing
  from (
    select distinct wpm.member_id, rounds.round_number
    from public.war_parties wp
    join public.war_party_members wpm on wpm.party_id = wp.id
    cross join (values (1::smallint),(2::smallint)) as rounds(round_number)
    where wp.event_id = p_event_id
  ) expected
  left join public.war_attendance_round_records r
    on r.event_id = p_event_id
   and r.round_number = expected.round_number
   and r.member_id = expected.member_id
  where r.id is null;

  if v_missing > 0 then
    raise exception 'ยังบันทึกสถานะไม่ครบทั้งสองรอบ: เหลืออีก % รายการ', v_missing;
  end if;

  insert into public.war_attendance_reports(event_id,report_status,created_by,updated_by,finalized_by,finalized_at,updated_at)
  values(p_event_id,'finalized',auth.uid(),auth.uid(),auth.uid(),now(),now())
  on conflict(event_id) do update
    set report_status='finalized',updated_by=auth.uid(),finalized_by=auth.uid(),finalized_at=now(),updated_at=now();
end;
$$;

grant execute on function public.finalize_war_attendance_report(uuid) to authenticated;

commit;

-- Notes:
-- 1) Discord check-in rows are written only by the Edge Function using service_role.
-- 2) Members are not allowed to read management attendance records or audit history.
-- 3) Reports remain drafts until both rounds have complete attendance decisions.
-- 4) The legacy war_attendance_records table is intentionally retained for historical compatibility.
