-- Phase 1/2 Production migration: 4AM/4PM affiliation directory foundation.
-- Additive only. Existing member IDs and legacy foreign keys remain unchanged.
create table if not exists public.guilds (
 id uuid primary key default gen_random_uuid(),code text not null unique check(code in ('4AM','4PM')),
 name text not null,is_active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.guild_member_affiliations (
 id uuid primary key default gen_random_uuid(),guild_id uuid not null references public.guilds(id) on delete restrict,
 user_id uuid references public.guild_members(user_id) on delete restrict,
 manual_member_id uuid references public.guild_manual_members(id) on delete restrict,
 started_at timestamptz not null default now(),ended_at timestamptz,change_reason text,
 created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),
 constraint guild_member_affiliations_one_identity check((user_id is not null and manual_member_id is null) or (user_id is null and manual_member_id is not null)),
 constraint guild_member_affiliations_valid_period check(ended_at is null or ended_at>started_at)
);
insert into public.guilds(code,name) values('4AM','4AM GUILD'),('4PM','4PM GUILD')
on conflict(code) do update set name=excluded.name;
create index if not exists guild_member_affiliations_guild_current_idx on public.guild_member_affiliations(guild_id,started_at desc) where ended_at is null;
create index if not exists guild_member_affiliations_user_history_idx on public.guild_member_affiliations(user_id,started_at desc) where user_id is not null;
create index if not exists guild_member_affiliations_manual_history_idx on public.guild_member_affiliations(manual_member_id,started_at desc) where manual_member_id is not null;
alter table public.guilds enable row level security;
alter table public.guild_member_affiliations enable row level security;
drop policy if exists affiliations_read_current_directory on public.guild_member_affiliations;
revoke all on public.guilds from public,anon,authenticated;
grant select on public.guilds to authenticated;
revoke insert,update,delete on public.guild_member_affiliations from public,anon,authenticated;
grant select on public.guild_member_affiliations to authenticated;

create or replace function public.get_guild_member_directory(
 p_search text default null,p_guild_filter text default 'all',p_class_filter text default 'all',
 p_record_type text default 'all',p_limit integer default 50,p_offset integer default 0
) returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare v_result jsonb;
begin
 if not public.is_guild_member() then raise exception 'Active guild membership required'; end if;
 if length(trim(coalesce(p_search,'')))>80 then raise exception 'Search text is too long'; end if;
 if p_guild_filter is null or p_guild_filter not in ('all','4AM','4PM','unassigned') then raise exception 'Invalid guild filter'; end if;
 if p_record_type is null or p_record_type not in ('all','account','manual') then raise exception 'Invalid record type filter'; end if;
 with combined as (
  select gm.user_id as member_id,null::uuid as manual_member_id,gm.character_name,gm.game_class,gm.nickname,gm.discord_name,
   'account'::text as record_type,gm.active,gm.membership_status,gm.role,g.code as guild_code,aff.started_at as affiliation_started_at
  from public.guild_members gm
  left join public.guild_member_affiliations aff on aff.user_id=gm.user_id and aff.ended_at is null
  left join public.guilds g on g.id=aff.guild_id
  where gm.active=true and gm.membership_status='active'
  union all
  select null::uuid,mm.id,mm.character_name,mm.game_class,mm.nickname,mm.discord_name,'manual'::text,mm.active,'manual'::text,'member'::text,g.code,aff.started_at
  from public.guild_manual_members mm
  left join public.guild_member_affiliations aff on aff.manual_member_id=mm.id and aff.ended_at is null
  left join public.guilds g on g.id=aff.guild_id
  where mm.active=true and mm.linked_user_id is null
 ), filtered as (
  select * from combined c
  where (nullif(trim(coalesce(p_search,'')),'') is null or c.character_name ilike '%'||trim(p_search)||'%' or coalesce(c.nickname,'') ilike '%'||trim(p_search)||'%' or coalesce(c.discord_name,'') ilike '%'||trim(p_search)||'%')
   and (p_guild_filter='all' or (p_guild_filter='unassigned' and c.guild_code is null) or c.guild_code=p_guild_filter)
   and (p_class_filter='all' or c.game_class=p_class_filter) and (p_record_type='all' or c.record_type=p_record_type)
 ), page as (
  select * from filtered order by lower(character_name),coalesce(member_id,manual_member_id)
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),5000))
 )
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
  'total',(select count(*) from filtered),'limit',greatest(1,least(coalesce(p_limit,50),100)),
  'offset',greatest(0,least(coalesce(p_offset,0),5000)),
  'counts',jsonb_build_object('all',(select count(*) from combined),'4AM',(select count(*) from combined where guild_code='4AM'),
   '4PM',(select count(*) from combined where guild_code='4PM'),'unassigned',(select count(*) from combined where guild_code is null),
   'account',(select count(*) from combined where record_type='account'),'manual',(select count(*) from combined where record_type='manual')))
 into v_result;
 return v_result;
end; $$;
revoke all on function public.get_guild_member_directory(text,text,text,text,integer,integer) from public,anon;
grant execute on function public.get_guild_member_directory(text,text,text,text,integer,integer) to authenticated;
