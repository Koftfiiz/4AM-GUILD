-- Member Management Center: secure class changes and audited 4AM/4PM affiliation updates.
-- Staging was validated with rollback-only RPC tests. Production is intentionally untouched.

begin;

create table if not exists public.guild_affiliation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.guild_members(user_id) on delete restrict,
  manual_member_id uuid references public.guild_manual_members(id) on delete restrict,
  old_guild_code text,
  new_guild_code text,
  change_reason text not null check (char_length(trim(change_reason)) between 1 and 500),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_display_name text not null,
  created_at timestamptz not null default now(),
  constraint guild_affiliation_events_one_identity check (num_nonnulls(user_id,manual_member_id)=1),
  constraint guild_affiliation_events_valid_old_code check (old_guild_code is null or old_guild_code in ('4AM','4PM')),
  constraint guild_affiliation_events_valid_new_code check (new_guild_code is null or new_guild_code in ('4AM','4PM','unassigned'))
);

alter table public.guild_affiliation_events drop constraint if exists guild_affiliation_events_valid_new_code;
alter table public.guild_affiliation_events add constraint guild_affiliation_events_valid_new_code
  check (new_guild_code is null or new_guild_code in ('4AM','4PM','unassigned'));

create index if not exists guild_affiliation_events_user_history_idx
  on public.guild_affiliation_events(user_id,created_at desc) where user_id is not null;
create index if not exists guild_affiliation_events_manual_history_idx
  on public.guild_affiliation_events(manual_member_id,created_at desc) where manual_member_id is not null;

alter table public.guild_affiliation_events enable row level security;
drop policy if exists "Affiliation managers can view change events" on public.guild_affiliation_events;
create policy "Affiliation managers can view change events"
  on public.guild_affiliation_events for select to authenticated
  using (public.can_manage_guild_affiliations());
revoke all on public.guild_affiliation_events from public,anon,authenticated;
grant select on public.guild_affiliation_events to authenticated;

create or replace function public.set_guild_member_affiliation(
  p_guild_code text,
  p_user_id uuid default null,
  p_manual_member_id uuid default null,
  p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_guild_id uuid;
  v_current_guild_id uuid;
  v_current_code text;
  v_new_id uuid;
  v_started_at timestamptz:=clock_timestamp();
  v_manual_linked_user uuid;
  v_actor_name text;
begin
  if (p_user_id is null)=(p_manual_member_id is null) then
    raise exception 'Provide exactly one member identity';
  end if;
  if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then
    raise exception 'Not authorized to change guild affiliation';
  end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'กรุณาระบุเหตุผลในการเปลี่ยนสังกัด';
  end if;
  if char_length(trim(p_reason))>500 then
    raise exception 'เหตุผลต้องไม่เกิน 500 ตัวอักษร';
  end if;
  if p_guild_code is null or p_guild_code not in ('4AM','4PM','unassigned') then
    raise exception 'Unknown guild affiliation';
  end if;

  select character_name into v_actor_name
  from public.guild_members where user_id=(select auth.uid());
  v_actor_name:=coalesce(nullif(trim(v_actor_name),''),(select auth.uid())::text);

  if p_guild_code='unassigned' then
    v_guild_id:=null;
  else
    select id into v_guild_id from public.guilds where code=p_guild_code and is_active=true;
    if v_guild_id is null then raise exception 'Unknown or inactive guild'; end if;
  end if;

  perform public.snapshot_due_patch_rosters();

  if p_user_id is not null then
    if not exists(select 1 from public.guild_members where user_id=p_user_id and active=true and membership_status='active') then
      raise exception 'Registered member not found or inactive';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,4104));
    select aff.guild_id,g.code into v_current_guild_id,v_current_code
    from public.guild_member_affiliations aff
    join public.guilds g on g.id=aff.guild_id
    where aff.user_id=p_user_id and aff.ended_at is null for update of aff;
    if v_current_guild_id is not distinct from v_guild_id then
      select id into v_new_id from public.guild_member_affiliations where user_id=p_user_id and ended_at is null;
      return v_new_id;
    end if;
    update public.guild_member_affiliations set ended_at=v_started_at
      where user_id=p_user_id and ended_at is null;
    if v_guild_id is not null then
      insert into public.guild_member_affiliations(guild_id,user_id,started_at,change_reason,created_by)
      values(v_guild_id,p_user_id,v_started_at,trim(p_reason),(select auth.uid()))
      returning id into v_new_id;
    end if;
    insert into public.guild_affiliation_events(user_id,old_guild_code,new_guild_code,change_reason,actor_user_id,actor_display_name,created_at)
    values(p_user_id,v_current_code,p_guild_code,trim(p_reason),(select auth.uid()),v_actor_name,v_started_at);
  else
    perform pg_advisory_xact_lock(hashtextextended(p_manual_member_id::text,4104));
    select linked_user_id into v_manual_linked_user from public.guild_manual_members
      where id=p_manual_member_id and active=true for update;
    if not found then raise exception 'Manual member not found or inactive'; end if;
    if v_manual_linked_user is not null then raise exception 'This Manual record is linked to a registered account; use canonical user_id'; end if;
    select aff.guild_id,g.code into v_current_guild_id,v_current_code
    from public.guild_member_affiliations aff
    join public.guilds g on g.id=aff.guild_id
    where aff.manual_member_id=p_manual_member_id and aff.ended_at is null for update of aff;
    if v_current_guild_id is not distinct from v_guild_id then
      select id into v_new_id from public.guild_member_affiliations where manual_member_id=p_manual_member_id and ended_at is null;
      return v_new_id;
    end if;
    update public.guild_member_affiliations set ended_at=v_started_at
      where manual_member_id=p_manual_member_id and ended_at is null;
    if v_guild_id is not null then
      insert into public.guild_member_affiliations(guild_id,manual_member_id,started_at,change_reason,created_by)
      values(v_guild_id,p_manual_member_id,v_started_at,trim(p_reason),(select auth.uid()))
      returning id into v_new_id;
    end if;
    insert into public.guild_affiliation_events(manual_member_id,old_guild_code,new_guild_code,change_reason,actor_user_id,actor_display_name,created_at)
    values(p_manual_member_id,v_current_code,p_guild_code,trim(p_reason),(select auth.uid()),v_actor_name,v_started_at);
  end if;
  return v_new_id;
end;
$function$;
revoke all on function public.set_guild_member_affiliation(text,uuid,uuid,text) from public,anon;
grant execute on function public.set_guild_member_affiliation(text,uuid,uuid,text) to authenticated;

create or replace function public.set_guild_member_class(
  p_user_id uuid default null,
  p_manual_member_id uuid default null,
  p_game_class text default null
) returns void
language plpgsql
security definer
set search_path=''
as $function$
begin
  if (p_user_id is null)=(p_manual_member_id is null) then
    raise exception 'Provide exactly one member identity';
  end if;
  if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then
    raise exception 'Not authorized to change member class';
  end if;
  if p_game_class not in ('Ironclad','Bloodstrom','Celestune','Numina','Sylph','Nightwaker','Dragonsvelte','Mystech') then
    raise exception 'Unknown game class';
  end if;
  if p_user_id is not null then
    update public.guild_members set game_class=p_game_class
    where user_id=p_user_id and active=true and membership_status='active';
    if not found then raise exception 'Registered member not found or inactive'; end if;
  else
    update public.guild_manual_members set game_class=p_game_class
    where id=p_manual_member_id and active=true and linked_user_id is null;
    if not found then raise exception 'Manual member not found, inactive, or already linked'; end if;
  end if;
end;
$function$;
revoke all on function public.set_guild_member_class(uuid,uuid,text) from public,anon;
grant execute on function public.set_guild_member_class(uuid,uuid,text) to authenticated;

commit;
