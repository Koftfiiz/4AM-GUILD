-- 4AM GUILD · War Center automation
-- Applies to the existing War Center schema; preserves all historical event and attendance rows.

-- Official Guild War signup always closes Saturday at 14:00 Asia/Bangkok.
create or replace function public.enforce_official_war_signup_deadline()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.registration_type = 'official' then
    if extract(dow from new.event_date) <> 6 then
      raise exception 'Official Guild War must be scheduled on Saturday';
    end if;
    new.signup_closes_at := ((new.event_date::timestamp + time '14:00') at time zone 'Asia/Bangkok');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_official_war_signup_deadline on public.war_events;
create trigger trg_enforce_official_war_signup_deadline
before insert or update of event_date, registration_type, signup_closes_at
on public.war_events
for each row execute function public.enforce_official_war_signup_deadline();

-- Keep cancelled official events as historical records and prevent the generator
-- from recreating an event on the same date.
drop index if exists public.war_events_one_official_event_per_date;
create unique index war_events_one_official_event_per_date
on public.war_events(event_date)
where registration_type = 'official';

create or replace function public.generate_upcoming_war_events()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_next_saturday date;
  v_event_date date;
  v_double_round boolean;
  v_start_time time;
  v_rounds jsonb;
  v_created integer := 0;
  v_existing uuid;
  v_description text;
begin
  perform pg_advisory_xact_lock(hashtext('4am-guild-weekly-war-event-generator'));

  if extract(dow from v_today) = 6
     and (now() at time zone 'Asia/Bangkok')::time < time '14:00' then
    v_next_saturday := v_today;
  else
    v_next_saturday := v_today + ((6 - extract(dow from v_today)::integer + 7) % 7);
    if v_next_saturday <= v_today then
      v_next_saturday := v_next_saturday + 7;
    end if;
  end if;

  for i in 0..1 loop
    v_event_date := v_next_saturday + (i * 7);
    -- 14 Nov 2026 is the confirmed two-round anchor; the cadence alternates weekly.
    v_double_round := mod(((v_event_date - date '2026-11-14') / 7), 2) = 0;

    if v_double_round then
      v_start_time := time '20:30';
      v_rounds := '["20:00","20:30"]'::jsonb;
    else
      v_start_time := time '20:00';
      v_rounds := '["20:00"]'::jsonb;
    end if;

    select id into v_existing
    from public.war_events
    where event_date = v_event_date and registration_type = 'official'
    limit 1;

    if v_existing is null then
      v_description := '[[WAR_CONFIG:' ||
        jsonb_build_object('mode','official','raidCount',2,'rounds',v_rounds)::text || ']]';

      insert into public.war_events (
        event_name, event_date, start_time, description, status,
        created_by, is_draft_confirmed, is_published,
        registration_type, signup_opens_at, signup_closes_at
      ) values (
        'Guild War · ' || to_char(v_event_date, 'DD/MM/YYYY'),
        v_event_date,
        v_start_time,
        v_description,
        'open',
        null,
        true,
        false,
        'official',
        now(),
        ((v_event_date::timestamp + time '14:00') at time zone 'Asia/Bangkok')
      )
      on conflict (event_date) where registration_type = 'official' do nothing;

      if found then v_created := v_created + 1; end if;
    end if;
    v_existing := null;
  end loop;
  return v_created;
end;
$$;

revoke all on function public.generate_upcoming_war_events() from public, anon, authenticated;
grant execute on function public.generate_upcoming_war_events() to postgres;

-- Members can read an event while its signup window exists, even before the
-- management team publishes the final party roster.
drop policy if exists "Members can view published war events" on public.war_events;
create policy "Members can view published war events"
on public.war_events for select to authenticated
using (
  public.is_guild_member()
  and (is_published = true or signup_opens_at is not null or public.is_war_manager())
);

-- Signup RPC: enforce membership, round availability, cancellation and the Saturday cutoff.
create or replace function public.join_war_signup(
  p_event_id uuid,
  p_available_rounds smallint[] default array[1,2]::smallint[]
)
returns table(queue_position integer, signup_status text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_event public.war_events%rowtype;
  v_next_position integer;
  v_existing public.war_signups%rowtype;
  v_rounds smallint[];
  v_deadline timestamptz;
  v_round_count integer := 2;
  v_config_match text[];
  v_config jsonb;
  v_allowed_rounds smallint[];
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.guild_members gm where gm.user_id=auth.uid() and gm.active=true) then
    raise exception 'Active guild membership required';
  end if;

  select * into v_event from public.war_events where id=p_event_id for update;
  if not found then raise exception 'ไม่พบ Event ลงชื่อวอร์นี้'; end if;
  if v_event.status='cancelled' then raise exception 'กิจกรรม Guild War นี้ถูกยกเลิกแล้ว'; end if;

  v_config_match := regexp_match(coalesce(v_event.description,''), '\[\[WAR_CONFIG:(\{.*?\})\]\]');
  if v_config_match is not null then
    begin
      v_config := v_config_match[1]::jsonb;
      if jsonb_typeof(v_config->'rounds')='array' then
        v_round_count := greatest(1,least(2,jsonb_array_length(v_config->'rounds')));
      end if;
    exception when others then
      v_round_count := 2;
    end;
  end if;
  v_allowed_rounds := case when v_round_count=1 then array[1]::smallint[] else array[1,2]::smallint[] end;

  if p_available_rounds is null or cardinality(p_available_rounds) not between 1 and v_round_count
     or not (p_available_rounds <@ v_allowed_rounds) then
    raise exception 'รอบวอร์นี้เปิดแข่ง % รอบ กรุณาเลือกความพร้อมให้ตรงกับรอบที่มีจริง', v_round_count;
  end if;
  select array_agg(distinct x order by x) into v_rounds from unnest(p_available_rounds) as x;

  if v_event.registration_type='official' then
    v_deadline := ((v_event.event_date::timestamp + time '14:00') at time zone 'Asia/Bangkok');
  else
    v_deadline := v_event.signup_closes_at;
  end if;
  if v_event.signup_opens_at is null or v_deadline is null then
    raise exception 'Event นี้ยังไม่ได้ตั้งเวลาเปิดและปิดรับสมัคร';
  end if;
  if now()<v_event.signup_opens_at then raise exception 'ยังไม่ถึงเวลาเปิดรับสมัคร'; end if;
  if now()>=v_deadline then raise exception 'ปิดรับลงชื่อวอร์แล้ว · ระบบปิดรับทุกวันเสาร์ 14:00 น.'; end if;

  select * into v_existing from public.war_signups where event_id=p_event_id and member_id=auth.uid() for update;
  if found then
    if v_existing.status='cancelled' then raise exception 'บัญชีนี้เคยลงชื่อ Event นี้แล้ว ไม่สามารถลงชื่อซ้ำได้'; end if;
    if v_existing.status='standby' then
      update public.war_signups set available_rounds=v_rounds where id=v_existing.id;
    end if;
    return query select v_existing.queue_position,v_existing.status;
    return;
  end if;

  select coalesce(max(s.queue_position),0)+1 into v_next_position
  from public.war_signups s where s.event_id=p_event_id and s.status<>'cancelled';
  if v_next_position>80 then raise exception 'รายชื่อครบ 80 คนแล้ว'; end if;

  insert into public.war_signups(event_id,member_id,raid,status,queue_position,available_rounds)
  values(p_event_id,auth.uid(),null,case when v_next_position<=60 then 'signed_up' else 'standby' end,v_next_position,v_rounds);
  return query select v_next_position,case when v_next_position<=60 then 'signed_up'::text else 'standby'::text end;
end;
$$;
grant execute on function public.join_war_signup(uuid, smallint[]) to authenticated;
revoke all on function public.join_war_signup(uuid, smallint[]) from public, anon;

-- Notifications share the existing member notification inbox; feedback_id is null for war alerts.
alter table public.guild_notifications alter column feedback_id drop not null;
alter table public.guild_notifications drop constraint if exists guild_notifications_notification_type_check;
alter table public.guild_notifications add constraint guild_notifications_notification_type_check
check (notification_type = any (array['new_feedback','status_changed','war_leave']::text[]));

create or replace function public.notify_management_of_war_leave()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_should_notify boolean := false;
  v_event_name text;
  v_member_name text;
begin
  if tg_op = 'INSERT' then
    v_should_notify := new.status = 'approved';
  else
    v_should_notify := new.status = 'approved' and old.status is distinct from new.status;
  end if;
  if not v_should_notify then return new; end if;

  select e.event_name into v_event_name from public.war_events e where e.id=new.event_id;
  select coalesce(nullif(gm.character_name,''),nullif(gm.nickname,''),'สมาชิก 4AM')
    into v_member_name from public.guild_members gm where gm.user_id=new.member_id;

  insert into public.guild_notifications(recipient_user_id,feedback_id,notification_type,title,body)
  select gm.user_id,null,'war_leave','มีสมาชิกแจ้งลาวอร์',
    coalesce(v_member_name,'สมาชิก 4AM') || ' แจ้งลาวอร์: ' ||
    coalesce(v_event_name,'Guild War') || ' · อนุมัติอัตโนมัติแล้ว · เหตุผล: ' || left(new.reason,700)
  from public.guild_members gm
  where gm.active=true and lower(coalesce(gm.role,'')) in ('developer','leader','management');
  return new;
end;
$$;

drop trigger if exists trg_notify_management_of_war_leave on public.war_leave_requests;
create trigger trg_notify_management_of_war_leave
after insert or update of status on public.war_leave_requests
for each row execute function public.notify_management_of_war_leave();
revoke all on function public.notify_management_of_war_leave() from public, anon, authenticated;

-- Leave RPC: automatic approval before the Saturday 14:00 cutoff, no management queue.
create or replace function public.submit_war_leave(p_event_id uuid, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_member_id uuid;
  v_request_id uuid;
  v_event public.war_events%rowtype;
  v_deadline timestamptz;
  v_existing_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select gm.user_id into v_member_id from public.guild_members gm where gm.user_id=auth.uid() and gm.active=true;
  if v_member_id is null then raise exception 'Active guild membership required'; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'กรุณาระบุเหตุผลการลาวอร์'; end if;

  select * into v_event from public.war_events where id=p_event_id for update;
  if not found then raise exception 'ไม่พบรอบวอร์ที่เลือก'; end if;
  if v_event.status='cancelled' then raise exception 'กิจกรรม Guild War นี้ถูกยกเลิกแล้ว'; end if;

  if v_event.registration_type='official' then
    v_deadline := ((v_event.event_date::timestamp + time '14:00') at time zone 'Asia/Bangkok');
  else
    v_deadline := v_event.signup_closes_at;
  end if;
  if v_deadline is not null and now()>=v_deadline then
    raise exception 'หมดเวลาแจ้งลาวอร์แล้ว · ปิดรับแจ้งลาทุกวันเสาร์ 14:00 น.';
  end if;

  select r.status into v_existing_status from public.war_leave_requests r
  where r.event_id=p_event_id and r.member_id=v_member_id for update;
  if v_existing_status='approved' then raise exception 'คำแจ้งลานี้ได้รับการรับทราบแล้ว'; end if;

  insert into public.war_leave_requests(event_id,member_id,reason,status,reviewed_by,reviewed_at)
  values(p_event_id,v_member_id,trim(p_reason),'approved',null,now())
  on conflict(event_id,member_id) do update set
    reason=excluded.reason,status='approved',reviewed_by=null,reviewed_at=now(),updated_at=now()
  returning id into v_request_id;
  return v_request_id;
end;
$$;
grant execute on function public.submit_war_leave(uuid, text) to authenticated;
revoke all on function public.submit_war_leave(uuid, text) from public, anon;

-- Run every 15 minutes; the function creates the next two Saturdays idempotently.
select cron.schedule('4am-guild-war-event-generator','*/15 * * * *',
  'select public.generate_upcoming_war_events();');

select public.generate_upcoming_war_events();
