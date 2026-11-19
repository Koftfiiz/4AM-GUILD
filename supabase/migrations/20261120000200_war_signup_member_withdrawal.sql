-- Query Name: WAR_SIGNUP_MEMBER_WITHDRAWAL
-- Purpose: Let an authenticated active member withdraw only their own signup.
-- The Discord-side withdrawal RPC remains service-role-only and unchanged.

create or replace function public.cancel_war_signup(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
  v_event public.war_events%rowtype;
  v_signup public.war_signups%rowtype;
  v_deadline timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.guild_members gm
    where gm.user_id = v_user_id and gm.active = true
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
  if v_event.status = 'cancelled' then
    raise exception 'กิจกรรม Guild War นี้ถูกยกเลิกแล้ว';
  end if;

  if v_event.registration_type = 'official' then
    v_deadline := ((v_event.event_date::timestamp + time '14:00') at time zone 'Asia/Bangkok');
  else
    v_deadline := v_event.signup_closes_at;
  end if;

  if v_event.signup_opens_at is null or v_deadline is null then
    raise exception 'Event นี้ยังไม่ได้ตั้งเวลาเปิดและปิดรับสมัคร';
  end if;
  if now() < v_event.signup_opens_at then
    raise exception 'ยังไม่ถึงเวลาเปิดรับสมัคร';
  end if;
  if now() >= v_deadline then
    raise exception 'ปิดรับถอนชื่อแล้ว';
  end if;

  select * into v_signup
  from public.war_signups
  where event_id = p_event_id and member_id = v_user_id
  for update;

  if not found or v_signup.status = 'cancelled' then
    raise exception 'คุณยังไม่มีรายชื่อในกิจกรรมนี้';
  end if;

  update public.war_signups
  set status = 'cancelled',
      queue_position = null
  where id = v_signup.id;

  return jsonb_build_object(
    'success', true,
    'message', 'ถอนชื่อออกจากกิจกรรมเรียบร้อยแล้ว',
    'event_id', p_event_id,
    'member_id', v_user_id
  );
end;
$function$;

revoke all on function public.cancel_war_signup(uuid) from public, anon;
grant execute on function public.cancel_war_signup(uuid) to authenticated;
