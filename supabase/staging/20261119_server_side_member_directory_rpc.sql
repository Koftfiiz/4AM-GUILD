-- Staging-only server-side Member Directory RPC.
-- Uses SECURITY INVOKER and current-affiliation read policy; all filtering/pagination
-- happens in PostgreSQL and only the requested page is returned to the browser.
create or replace function public.is_guild_member()
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.guild_members gm
  where gm.user_id=(select auth.uid()) and gm.active=true and gm.membership_status='active');
$$;
revoke all on function public.is_guild_member() from public,anon;
grant execute on function public.is_guild_member() to authenticated;

drop policy if exists affiliations_read_current_directory on public.guild_member_affiliations;
create policy affiliations_read_current_directory on public.guild_member_affiliations
for select to authenticated using (ended_at is null and public.is_guild_member());

create or replace function public.get_guild_member_directory(
 p_search text default null,p_guild_filter text default 'all',p_class_filter text default 'all',
 p_record_type text default 'all',p_limit integer default 50,p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path=''
as $$
with combined as (
 select gm.user_id as member_id,null::uuid as manual_member_id,gm.character_name,gm.game_class,
  gm.nickname,gm.discord_name,'account'::text as record_type,gm.active,gm.membership_status,
  gm.role,g.code as guild_code,aff.started_at as affiliation_started_at
 from public.guild_members gm
 left join public.guild_member_affiliations aff on aff.user_id=gm.user_id and aff.ended_at is null
 left join public.guilds g on g.id=aff.guild_id
 union all
 select null::uuid,mm.id,mm.character_name,mm.game_class,mm.nickname,mm.discord_name,
  'manual'::text,mm.active,'manual'::text,'member'::text,g.code,aff.started_at
 from public.guild_manual_members mm
 left join public.guild_member_affiliations aff on aff.manual_member_id=mm.id and aff.ended_at is null
 left join public.guilds g on g.id=aff.guild_id
 where mm.active=true and mm.linked_user_id is null
), filtered as (
 select * from combined c
 where (nullif(trim(coalesce(p_search,'')),'') is null
  or c.character_name ilike '%'||trim(p_search)||'%'
  or coalesce(c.nickname,'') ilike '%'||trim(p_search)||'%'
  or coalesce(c.discord_name,'') ilike '%'||trim(p_search)||'%')
 and (p_guild_filter='all' or (p_guild_filter='unassigned' and c.guild_code is null) or c.guild_code=p_guild_filter)
 and (p_class_filter='all' or c.game_class=p_class_filter)
 and (p_record_type='all' or c.record_type=p_record_type)
), page as (
 select * from filtered order by lower(character_name),coalesce(member_id,manual_member_id)
 limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(coalesce(p_offset,0),0)
)
select jsonb_build_object(
 'items',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
 'total',(select count(*) from filtered),
 'limit',greatest(1,least(coalesce(p_limit,50),100)),
 'offset',greatest(coalesce(p_offset,0),0),
 'counts',jsonb_build_object(
  'all',(select count(*) from combined),'4AM',(select count(*) from combined where guild_code='4AM'),
  '4PM',(select count(*) from combined where guild_code='4PM'),
  'unassigned',(select count(*) from combined where guild_code is null),
  'account',(select count(*) from combined where record_type='account'),
  'manual',(select count(*) from combined where record_type='manual')
 )
);
$$;
revoke all on function public.get_guild_member_directory(text,text,text,text,integer,integer) from public,anon;
grant execute on function public.get_guild_member_directory(text,text,text,text,integer,integer) to authenticated;
