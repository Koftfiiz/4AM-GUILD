-- 4AM GUILD: Discord Guild War / SCRIM signup withdrawal
-- Both website and Discord continue using public.war_signups as the single source of truth.
begin;

create or replace function public.join_war_signup(
  p_event_id uuid,
  p_available_rounds smallint[] default array[1,2]::smallint[]
)
returns table(queue_position integer, signup_status text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
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
  if now()>=v_deadline then raise exception 'ปิดรับลงชื่อวอร์แล้ว'; end if;

  select * into v_existing from public.war_signups
  where event_id=p_event_id and member_id=auth.uid() for update;

  if found then
    if v_existing.status='cancelled' then
      select coalesce(max(s.queue_position),0)+1 into v_next_position
      from public.war_signups s
      where s.event_id=p_event_id and s.status<>'cancelled';
      if v_next_position>80 then
        select min(candidate)::integer into v_next_position
        from generate_series(1,80) as candidate
        where not exists (
          select 1 from public.war_signups s
          where s.event_id=p_event_id and s.queue_position=candidate
        );
      end if;
      if v_next_position is null or v_next_position>80 then
        raise exception 'รายชื่อครบ 80 คนแล้ว';
      end if;
      update public.war_signups
      set queue_position=v_next_position,
          status=case when v_next_position<=60 then 'signed_up' else 'standby' end,
          available_rounds=v_rounds,
          raid=null,
          created_at=now()
      where id=v_existing.id;
      return query select v_next_position,
        case when v_next_position<=60 then 'signed_up'::text else 'standby'::text end;
      return;
    end if;
    if v_existing.status='standby' then
      update public.war_signups set available_rounds=v_rounds where id=v_existing.id;
    end if;
    return query select v_existing.queue_position,v_existing.status;
    return;
  end if;

  select coalesce(max(s.queue_position),0)+1 into v_next_position
  from public.war_signups s where s.event_id=p_event_id and s.status<>'cancelled';
  if v_next_position>80 then
    select min(candidate)::integer into v_next_position
    from generate_series(1,80) as candidate
    where not exists (
      select 1 from public.war_signups s
      where s.event_id=p_event_id and s.queue_position=candidate
    );
  end if;
  if v_next_position is null or v_next_position>80 then raise exception 'รายชื่อครบ 80 คนแล้ว'; end if;

  insert into public.war_signups(event_id,member_id,raid,status,queue_position,available_rounds)
  values(p_event_id,auth.uid(),null,case when v_next_position<=60 then 'signed_up' else 'standby' end,v_next_position,v_rounds);
  return query select v_next_position,
    case when v_next_position<=60 then 'signed_up'::text else 'standby'::text end;
end;
$function$;

create or replace function public.cancel_war_signup_from_discord(
  p_event_id uuid,
  p_discord_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_user_id uuid;
  v_event public.war_events%rowtype;
  v_signup public.war_signups%rowtype;
  v_deadline timestamptz;
begin
  if p_discord_user_id is null or length(trim(p_discord_user_id)) < 10 then
    raise exception 'Discord account is invalid';
  end if;

  select da.user_id into v_user_id
  from public.discord_accounts da
  join public.guild_members gm on gm.user_id=da.user_id
  where da.discord_user_id=trim(p_discord_user_id)
    and da.verified=true
    and da.guild_member_verified=true
    and gm.active=true
  limit 1;

  if v_user_id is null then
    raise exception 'กรุณาเชื่อม Discord กับบัญชี 4AM GUILD และยืนยันการเป็นสมาชิกก่อน';
  end if;

  select * into v_event from public.war_events where id=p_event_id for update;
  if not found then raise exception 'ไม่พบ Event ลงชื่อวอร์นี้'; end if;
  if v_event.status='cancelled' then raise exception 'กิจกรรม Guild War นี้ถูกยกเลิกแล้ว'; end if;

  if v_event.registration_type='official' then
    v_deadline := ((v_event.event_date::timestamp + time '14:00') at time zone 'Asia/Bangkok');
  else
    v_deadline := v_event.signup_closes_at;
  end if;
  if v_event.signup_opens_at is null or v_deadline is null then
    raise exception 'Event นี้ยังไม่ได้ตั้งเวลาเปิดและปิดรับสมัคร';
  end if;
  if now()<v_event.signup_opens_at then raise exception 'ยังไม่ถึงเวลาเปิดรับสมัคร'; end if;
  if now()>=v_deadline then raise exception 'ปิดรับถอนชื่อแล้ว'; end if;

  select * into v_signup from public.war_signups
  where event_id=p_event_id and member_id=v_user_id for update;
  if not found or v_signup.status='cancelled' then
    raise exception 'คุณยังไม่มีรายชื่อในกิจกรรมนี้';
  end if;

  update public.war_signups
  set status='cancelled', queue_position=null
  where id=v_signup.id;

  return jsonb_build_object(
    'success',true,
    'message','ถอนชื่อออกจากกิจกรรมเรียบร้อยแล้ว',
    'event_id',p_event_id,
    'member_id',v_user_id
  );
end;
$function$;

revoke all on function public.cancel_war_signup_from_discord(uuid,text) from public, anon, authenticated;
grant execute on function public.cancel_war_signup_from_discord(uuid,text) to service_role;
grant execute on function public.join_war_signup(uuid,smallint[]) to authenticated;

commit;
