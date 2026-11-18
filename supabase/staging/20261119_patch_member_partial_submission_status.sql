-- Staging-only: distinguish members with partial folder submissions from members who have not submitted.
create or replace function public.get_patch_command_center(
 p_round_id uuid default null,p_search text default null,p_status_filter text default 'all',
 p_limit integer default 50,p_offset integer default 0
) returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare v_round_id uuid; v_result jsonb;
begin
 if (select auth.uid()) is null or not public.is_guild_admin() then raise exception 'Management access required'; end if;
 if length(trim(coalesce(p_search,'')))>80 then raise exception 'Search text is too long'; end if;
 if p_status_filter not in ('all','not_submitted','partial','pending','reviewing','approved','revision_required') then raise exception 'Invalid Patch status filter'; end if;
 select r.id into v_round_id from public.portfolio_update_rounds r
 where (p_round_id is null or r.id=p_round_id) order by r.archived_at nulls first,r.starts_at desc,r.created_at desc limit 1;
 if v_round_id is null then return jsonb_build_object('rounds','[]'::jsonb,'selected_round',null,'summary',jsonb_build_object('roster_count',0,'submitted_members',0,'not_submitted',0,'partial_members',0,'pending',0,'reviewing',0,'approved',0,'revision_required',0),'members','[]'::jsonb,'review_queue','[]'::jsonb,'recent_activity','[]'::jsonb); end if;
 with roster_stats as (
  select pr.member_id,pr.character_name,pr.game_class,pr.nickname,pr.discord_name,pr.roster_source,pr.added_at,
   count(distinct p.id)::int as folder_count,count(distinct s.id)::int as submitted_folder_count,
   count(s.id) filter(where coalesce(rv.status,'pending')='pending')::int as pending_count,
   count(s.id) filter(where rv.status='reviewing')::int as reviewing_count,
   count(s.id) filter(where rv.status='approved')::int as approved_count,
   count(s.id) filter(where rv.status='revision_required')::int as revision_count,max(s.submitted_at) as last_submitted_at,
   case when count(s.id)=0 then 'not_submitted'
    when count(distinct s.id)<count(distinct p.id) then 'partial'
    when count(s.id) filter(where rv.status='revision_required')>0 then 'revision_required'
    when count(s.id) filter(where rv.status='pending')>0 then 'pending'
    when count(s.id) filter(where rv.status='reviewing')>0 then 'reviewing'
    when count(s.id) filter(where rv.status='approved')=count(s.id) then 'approved' else 'pending' end as member_status
  from public.portfolio_patch_roster pr
  left join public.portfolios p on p.member_id=pr.member_id
  left join public.portfolio_patch_submissions s on s.round_id=pr.round_id and s.member_id=pr.member_id and s.portfolio_id=p.id
  left join public.portfolio_patch_submission_reviews rv on rv.submission_id=s.id
  where pr.round_id=v_round_id
  group by pr.member_id,pr.character_name,pr.game_class,pr.nickname,pr.discord_name,pr.roster_source,pr.added_at
 ), filtered_members as (
  select * from roster_stats m
  where (nullif(trim(coalesce(p_search,'')),'') is null or m.character_name ilike '%'||trim(p_search)||'%' or coalesce(m.nickname,'') ilike '%'||trim(p_search)||'%' or coalesce(m.discord_name,'') ilike '%'||trim(p_search)||'%')
   and (p_status_filter='all' or m.member_status=p_status_filter)
 ), member_page as (
  select * from filtered_members order by character_name,member_id limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),5000))
 ), queue_filtered as (
  select s.id as submission_id,s.member_id,pr.character_name,pr.game_class,p.title as portfolio_title,p.portfolio_type,pv.version_number,pv.version_name,s.submitted_at,s.updated_at,
   coalesce(rv.status,'pending') as review_status,rv.review_note,rv.reviewer_user_id,rv.reviewed_at
  from public.portfolio_patch_submissions s
  join public.portfolio_patch_roster pr on pr.round_id=s.round_id and pr.member_id=s.member_id
  join public.portfolios p on p.id=s.portfolio_id join public.portfolio_versions pv on pv.id=s.version_id
  left join public.portfolio_patch_submission_reviews rv on rv.submission_id=s.id
  where s.round_id=v_round_id and (p_status_filter='all' or (p_status_filter not in ('not_submitted','partial') and coalesce(rv.status,'pending')=p_status_filter))
   and (nullif(trim(coalesce(p_search,'')),'') is null or pr.character_name ilike '%'||trim(p_search)||'%' or p.title ilike '%'||trim(p_search)||'%')
 ), queue_rows as (
  select * from queue_filtered order by submitted_at desc,submission_id
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),5000))
 )
 select jsonb_build_object(
  'rounds',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select id,round_name,starts_at,closes_at,status,archived_at,roster_snapshot_at from public.portfolio_update_rounds order by archived_at nulls first,starts_at desc limit 12) r),
  'selected_round',(select to_jsonb(r) from (select id,round_name,starts_at,closes_at,status,archived_at,roster_snapshot_at from public.portfolio_update_rounds where id=v_round_id) r),
  'summary',(select jsonb_build_object('roster_count',count(*),'submitted_members',count(*) filter(where submitted_folder_count>0),'not_submitted',count(*) filter(where member_status='not_submitted'),'partial_members',count(*) filter(where member_status='partial'),'pending',coalesce(sum(pending_count),0),'reviewing',coalesce(sum(reviewing_count),0),'approved',coalesce(sum(approved_count),0),'revision_required',coalesce(sum(revision_count),0)) from roster_stats),
  'members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from member_page m),'member_total',(select count(*) from filtered_members),
  'review_queue',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from queue_rows q),
  'review_queue_total',(select count(*) from queue_filtered),
  'recent_activity',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (select e.id,e.submission_id,e.old_status,e.new_status,e.review_note,e.created_at,pr.character_name,s.member_id
    from public.portfolio_patch_review_events e join public.portfolio_patch_submissions s on s.id=e.submission_id
    join public.portfolio_patch_roster pr on pr.round_id=s.round_id and pr.member_id=s.member_id
    where s.round_id=v_round_id order by e.created_at desc limit 10) a)
 ) into v_result;
 return v_result;
end; $$;
revoke all on function public.get_patch_command_center(uuid,text,text,integer,integer) from public,anon;
grant execute on function public.get_patch_command_center(uuid,text,text,integer,integer) to authenticated;
