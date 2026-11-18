-- Phase 3–7 Production migration: Patch Roster, submission review workflow and Command Center APIs.
-- Additive migration. Existing Portfolio folders, Versions, images and Guild War records are not rewritten.

alter table public.portfolio_update_rounds
  add column if not exists roster_snapshot_at timestamptz;

create table if not exists public.portfolio_patch_roster (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.portfolio_update_rounds(id) on delete restrict,
  member_id uuid not null references public.guild_members(user_id) on delete restrict,
  character_name text not null,
  game_class text not null,
  nickname text,
  discord_name text,
  affiliation_id uuid references public.guild_member_affiliations(id) on delete set null,
  roster_source text not null check (roster_source in ('opening_snapshot','affiliation_transfer','manual_link')),
  added_at timestamptz not null default now(),
  unique(round_id,member_id)
);

create table if not exists public.portfolio_patch_submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.portfolio_patch_submissions(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','reviewing','approved','revision_required')),
  review_note text,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status <> 'revision_required' or nullif(trim(review_note),'') is not null)
);

create table if not exists public.portfolio_patch_review_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.portfolio_patch_submissions(id) on delete restrict,
  old_status text,
  new_status text not null,
  review_note text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_patch_roster_round_idx on public.portfolio_patch_roster(round_id,added_at);
create index if not exists portfolio_patch_roster_member_idx on public.portfolio_patch_roster(member_id,round_id);
create index if not exists portfolio_patch_submission_reviews_status_idx on public.portfolio_patch_submission_reviews(status,updated_at desc);
create index if not exists portfolio_patch_review_events_submission_idx on public.portfolio_patch_review_events(submission_id,created_at desc);
create index if not exists portfolio_patch_submissions_portfolio_idx on public.portfolio_patch_submissions(portfolio_id);
create index if not exists portfolio_patch_submissions_version_idx on public.portfolio_patch_submissions(version_id);
create index if not exists portfolio_version_images_version_idx on public.portfolio_version_images(version_id,sort_order);
create index if not exists portfolio_update_rounds_snapshot_due_idx
  on public.portfolio_update_rounds(starts_at)
  where archived_at is null and roster_snapshot_at is null;

alter table public.portfolio_patch_roster enable row level security;
alter table public.portfolio_patch_submission_reviews enable row level security;
alter table public.portfolio_patch_review_events enable row level security;

drop policy if exists patch_roster_read_members on public.portfolio_patch_roster;
create policy patch_roster_read_members on public.portfolio_patch_roster
for select to authenticated using (public.is_guild_member());
drop policy if exists patch_submission_reviews_read_members on public.portfolio_patch_submission_reviews;
create policy patch_submission_reviews_read_members on public.portfolio_patch_submission_reviews
for select to authenticated using (
 exists (
  select 1 from public.portfolio_patch_submissions s
  where s.id=portfolio_patch_submission_reviews.submission_id
   and (s.member_id=(select auth.uid()) or public.can_manage_guild_affiliations())
 )
);
drop policy if exists patch_review_events_read_members on public.portfolio_patch_review_events;
create policy patch_review_events_read_members on public.portfolio_patch_review_events
for select to authenticated using (
 exists (
  select 1 from public.portfolio_patch_submissions s
  where s.id=portfolio_patch_review_events.submission_id
   and (s.member_id=(select auth.uid()) or public.can_manage_guild_affiliations())
 )
);

revoke all on public.portfolio_patch_roster,public.portfolio_patch_submission_reviews,public.portfolio_patch_review_events
from public,anon,authenticated;
grant select on public.portfolio_patch_roster,public.portfolio_patch_submission_reviews,public.portfolio_patch_review_events
to authenticated;

create or replace function public.snapshot_due_patch_rosters()
returns integer language plpgsql security definer set search_path=''
as $$
declare r record; v_count integer:=0; v_inserted integer;
begin
 for r in
  select id from public.portfolio_update_rounds
  where archived_at is null and roster_snapshot_at is null and starts_at<=clock_timestamp()
  order by starts_at,id for update
 loop
  insert into public.portfolio_patch_roster
   (round_id,member_id,character_name,game_class,nickname,discord_name,affiliation_id,roster_source)
  select r.id,gm.user_id,gm.character_name,gm.game_class,gm.nickname,gm.discord_name,aff.id,'opening_snapshot'
  from public.guild_member_affiliations aff
  join public.guilds g on g.id=aff.guild_id and g.code='4AM'
  join public.guild_members gm on gm.user_id=aff.user_id
  where aff.ended_at is null and aff.user_id is not null
    and gm.active=true and gm.membership_status='active'
  on conflict(round_id,member_id) do nothing;
  get diagnostics v_inserted=row_count;
  update public.portfolio_update_rounds
    set roster_snapshot_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=r.id and roster_snapshot_at is null;
  v_count:=v_count+v_inserted;
 end loop;
 return v_count;
end; $$;
revoke all on function public.snapshot_due_patch_rosters() from public,anon,authenticated;

create or replace function public.add_member_to_active_patch_rosters()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_name text; v_class text; v_nick text; v_discord text;
begin
 if new.ended_at is not null or new.user_id is null then return new; end if;
 if not exists(select 1 from public.guilds where id=new.guild_id and code='4AM') then return new; end if;
 select character_name,game_class,nickname,discord_name into v_name,v_class,v_nick,v_discord
 from public.guild_members where user_id=new.user_id and active=true and membership_status='active';
 if not found then return new; end if;
 insert into public.portfolio_patch_roster
  (round_id,member_id,character_name,game_class,nickname,discord_name,affiliation_id,roster_source)
 select r.id,new.user_id,v_name,v_class,v_nick,v_discord,new.id,'affiliation_transfer'
 from public.portfolio_update_rounds r
 where r.status='open' and r.archived_at is null and r.roster_snapshot_at is not null
  and clock_timestamp() between r.starts_at and r.closes_at
 on conflict(round_id,member_id) do nothing;
 return new;
end; $$;
revoke all on function public.add_member_to_active_patch_rosters() from public,anon,authenticated;
drop trigger if exists guild_affiliation_add_to_patch_roster on public.guild_member_affiliations;
create trigger guild_affiliation_add_to_patch_roster
after insert on public.guild_member_affiliations
for each row execute function public.add_member_to_active_patch_rosters();

create or replace function public.merge_manual_affiliation_into_account()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_now timestamptz:=clock_timestamp(); v_user_has_current boolean;
begin
 if new.linked_user_id is null or old.linked_user_id is not null or new.linked_user_id is not distinct from old.linked_user_id then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.linked_user_id::text,4104));
 perform pg_advisory_xact_lock(hashtextextended(new.id::text,4104));
 perform public.snapshot_due_patch_rosters();
 select exists(select 1 from public.guild_member_affiliations where user_id=new.linked_user_id and ended_at is null)
 into v_user_has_current;
 if v_user_has_current then
  -- If both identities already have a current affiliation, the registered account wins.
  update public.guild_member_affiliations set ended_at=v_now
   where manual_member_id=new.id and ended_at is null;
 end if;
 update public.guild_member_affiliations
  set user_id=new.linked_user_id,manual_member_id=null
  where manual_member_id=new.id;
 -- A Manual-only 4AM member who links during an active Patch becomes eligible for its roster.
 insert into public.portfolio_patch_roster
  (round_id,member_id,character_name,game_class,nickname,discord_name,affiliation_id,roster_source)
 select r.id,gm.user_id,gm.character_name,gm.game_class,gm.nickname,gm.discord_name,aff.id,'manual_link'
 from public.guild_member_affiliations aff
 join public.guilds g on g.id=aff.guild_id and g.code='4AM'
 join public.guild_members gm on gm.user_id=aff.user_id and gm.active=true and gm.membership_status='active'
 join public.portfolio_update_rounds r on r.status='open' and r.archived_at is null
  and r.roster_snapshot_at is not null and v_now between r.starts_at and r.closes_at
 where aff.user_id=new.linked_user_id and aff.ended_at is null
 on conflict(round_id,member_id) do nothing;
 return new;
end; $$;
revoke all on function public.merge_manual_affiliation_into_account() from public,anon,authenticated;
drop trigger if exists guild_manual_member_merge_affiliation on public.guild_manual_members;
create trigger guild_manual_member_merge_affiliation
after update of linked_user_id on public.guild_manual_members
for each row when (old.linked_user_id is null and new.linked_user_id is not null)
execute function public.merge_manual_affiliation_into_account();

create or replace function public.set_guild_member_affiliation(
 p_guild_code text,p_user_id uuid default null,p_manual_member_id uuid default null,p_reason text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_guild_id uuid; v_current_guild_id uuid; v_new_id uuid;
 v_started_at timestamptz:=clock_timestamp(); v_manual_linked_user uuid;
begin
 if (p_user_id is null)=(p_manual_member_id is null) then raise exception 'Provide exactly one member identity'; end if;
 if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then raise exception 'Not authorized to change guild affiliation'; end if;
 select id into v_guild_id from public.guilds where code=p_guild_code and is_active=true;
 if v_guild_id is null then raise exception 'Unknown or inactive guild'; end if;
 perform public.snapshot_due_patch_rosters();
 if p_user_id is not null then
  if not exists(select 1 from public.guild_members where user_id=p_user_id and active=true and membership_status='active') then
   raise exception 'Registered member not found or inactive';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,4104));
  select guild_id into v_current_guild_id from public.guild_member_affiliations
   where user_id=p_user_id and ended_at is null for update;
  if v_current_guild_id=v_guild_id then
   select id into v_new_id from public.guild_member_affiliations where user_id=p_user_id and ended_at is null;
   return v_new_id;
  end if;
  update public.guild_member_affiliations set ended_at=v_started_at where user_id=p_user_id and ended_at is null;
  insert into public.guild_member_affiliations(guild_id,user_id,started_at,change_reason,created_by)
   values(v_guild_id,p_user_id,v_started_at,nullif(trim(p_reason),''),(select auth.uid())) returning id into v_new_id;
 else
  perform pg_advisory_xact_lock(hashtextextended(p_manual_member_id::text,4104));
  select linked_user_id into v_manual_linked_user from public.guild_manual_members
   where id=p_manual_member_id and active=true for update;
  if not found then raise exception 'Manual member not found or inactive'; end if;
  if v_manual_linked_user is not null then raise exception 'This Manual record is linked to a registered account; use canonical user_id'; end if;
  select guild_id into v_current_guild_id from public.guild_member_affiliations
   where manual_member_id=p_manual_member_id and ended_at is null for update;
  if v_current_guild_id=v_guild_id then
   select id into v_new_id from public.guild_member_affiliations where manual_member_id=p_manual_member_id and ended_at is null;
   return v_new_id;
  end if;
  update public.guild_member_affiliations set ended_at=v_started_at where manual_member_id=p_manual_member_id and ended_at is null;
  insert into public.guild_member_affiliations(guild_id,manual_member_id,started_at,change_reason,created_by)
   values(v_guild_id,p_manual_member_id,v_started_at,nullif(trim(p_reason),''),(select auth.uid())) returning id into v_new_id;
 end if;
 return v_new_id;
end; $$;
revoke all on function public.set_guild_member_affiliation(text,uuid,uuid,text) from public,anon;
grant execute on function public.set_guild_member_affiliation(text,uuid,uuid,text) to authenticated;

create or replace function public.sync_patch_submission_review()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_op='INSERT' or new.version_id is distinct from old.version_id then
  insert into public.portfolio_patch_submission_reviews(submission_id,status)
   values(new.id,'pending')
   on conflict(submission_id) do update set status='pending',review_note=null,reviewer_user_id=null,
    reviewed_at=null,updated_at=clock_timestamp();
 end if;
 return new;
end; $$;
revoke all on function public.sync_patch_submission_review() from public,anon,authenticated;
drop trigger if exists patch_submission_sync_review on public.portfolio_patch_submissions;
create trigger patch_submission_sync_review
after insert or update of version_id on public.portfolio_patch_submissions
for each row execute function public.sync_patch_submission_review();

create or replace function public.audit_patch_submission_review()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.portfolio_patch_review_events(submission_id,old_status,new_status,review_note,actor_user_id)
 values(new.submission_id,case when tg_op='INSERT' then null else old.status end,new.status,new.review_note,(select auth.uid()));
 return new;
end; $$;
revoke all on function public.audit_patch_submission_review() from public,anon,authenticated;
drop trigger if exists patch_submission_review_audit on public.portfolio_patch_submission_reviews;
create trigger patch_submission_review_audit
after insert or update on public.portfolio_patch_submission_reviews
for each row execute function public.audit_patch_submission_review();

insert into public.portfolio_patch_submission_reviews(submission_id,status)
select s.id,'pending' from public.portfolio_patch_submissions s
on conflict(submission_id) do nothing;

create or replace function public.submit_portfolio_patch(target_round_id uuid,target_portfolio_id uuid,target_version_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare current_member_id uuid:=(select auth.uid()); saved_submission_id uuid; saved_submitted_at timestamptz;
begin
 if current_member_id is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.guild_members gm where gm.user_id=current_member_id and gm.active=true and gm.membership_status='active') then
  raise exception 'Active guild membership required';
 end if;
 perform public.snapshot_due_patch_rosters();
 if not exists(select 1 from public.portfolio_patch_roster pr where pr.round_id=target_round_id and pr.member_id=current_member_id) then
  raise exception 'Member is not included in this 4AM Patch roster';
 end if;
 if not exists(select 1 from public.portfolios p where p.id=target_portfolio_id and p.member_id=current_member_id) then
  raise exception 'You can submit only your own Portfolio folder';
 end if;
 if not exists(select 1 from public.portfolio_versions pv where pv.id=target_version_id and pv.portfolio_id=target_portfolio_id) then
  raise exception 'Selected Version does not belong to this Portfolio folder';
 end if;
 if not exists(
  select 1 from public.portfolio_update_rounds r
  where r.id=target_round_id and r.archived_at is null and (
   (r.status='open' and now()>=r.starts_at and now()<=r.closes_at)
   or exists(select 1 from public.portfolio_update_edit_permissions ep
    where ep.round_id=r.id and ep.member_id=current_member_id and ep.expires_at>now()
     and (r.status='closed' or now()>r.closes_at))
  )
 ) then raise exception 'This Patch round is not accepting submissions or your late-submission permission has expired'; end if;
 insert into public.portfolio_patch_submissions(round_id,portfolio_id,version_id,member_id)
 values(target_round_id,target_portfolio_id,target_version_id,current_member_id)
 on conflict(round_id,portfolio_id) do update set version_id=excluded.version_id,member_id=excluded.member_id,updated_at=now()
 returning id,submitted_at into saved_submission_id,saved_submitted_at;
 return jsonb_build_object('success',true,'submission_id',saved_submission_id,'round_id',target_round_id,
  'portfolio_id',target_portfolio_id,'version_id',target_version_id,'submitted_at',saved_submitted_at);
end; $$;
revoke all on function public.submit_portfolio_patch(uuid,uuid,uuid) from public,anon;
grant execute on function public.submit_portfolio_patch(uuid,uuid,uuid) to authenticated;

create or replace function public.set_patch_submission_review(p_submission_id uuid,p_status text,p_review_note text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_review_id uuid;
begin
 if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then raise exception 'Not authorized to review Patch submissions'; end if;
 if p_status not in ('pending','reviewing','approved','revision_required') then raise exception 'Invalid review status'; end if;
 if p_status='revision_required' and nullif(trim(p_review_note),'') is null then raise exception 'A revision note is required'; end if;
 update public.portfolio_patch_submission_reviews
 set status=p_status,review_note=case when p_status='revision_required' then trim(p_review_note) else null end,
  reviewer_user_id=(select auth.uid()),reviewed_at=clock_timestamp(),updated_at=clock_timestamp()
 where submission_id=p_submission_id returning id into v_review_id;
 if not found then raise exception 'Patch submission review record not found'; end if;
 return v_review_id;
end; $$;
revoke all on function public.set_patch_submission_review(uuid,text,text) from public,anon;
grant execute on function public.set_patch_submission_review(uuid,text,text) to authenticated;

create or replace function public.create_portfolio_patch_round(p_round_name text,p_starts_at timestamptz,p_closes_at timestamptz)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then raise exception 'Management access required'; end if;
 if nullif(trim(p_round_name),'') is null or length(trim(p_round_name))>120 then raise exception 'Patch name must be 1–120 characters'; end if;
 if p_starts_at is null or p_closes_at is null or p_closes_at<=p_starts_at then raise exception 'Invalid Patch date range'; end if;
 insert into public.portfolio_update_rounds(round_name,starts_at,closes_at,status,created_by)
 values(trim(p_round_name),p_starts_at,p_closes_at,'open',(select auth.uid())) returning id into v_id;
 if p_starts_at <= clock_timestamp() then perform public.snapshot_due_patch_rosters(); end if;
 return v_id;
end; $$;
revoke all on function public.create_portfolio_patch_round(text,timestamptz,timestamptz) from public,anon;
grant execute on function public.create_portfolio_patch_round(text,timestamptz,timestamptz) to authenticated;

create or replace function public.update_portfolio_patch_round(p_round_id uuid,p_action text)
returns uuid language plpgsql security definer set search_path=''
as $$
begin
 if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then raise exception 'Management access required'; end if;
 if p_action not in ('open','close','archive','restore') then raise exception 'Invalid Patch action'; end if;
 perform public.snapshot_due_patch_rosters();
 update public.portfolio_update_rounds
 set status=case when p_action='open' then 'open' when p_action='close' then 'closed' else status end,
  archived_at=case when p_action='archive' then clock_timestamp() when p_action='restore' then null else archived_at end,
  archived_by=case when p_action='archive' then (select auth.uid()) when p_action='restore' then null else archived_by end,
  updated_at=clock_timestamp()
 where id=p_round_id returning id into p_round_id;
 if not found then raise exception 'Patch round not found'; end if;
 return p_round_id;
end; $$;
revoke all on function public.update_portfolio_patch_round(uuid,text) from public,anon;
grant execute on function public.update_portfolio_patch_round(uuid,text) to authenticated;

create or replace function public.get_patch_command_center(
 p_round_id uuid default null,p_search text default null,p_status_filter text default 'all',
 p_limit integer default 50,p_offset integer default 0
) returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare v_round_id uuid; v_result jsonb;
begin
 if (select auth.uid()) is null or not public.can_manage_guild_affiliations() then raise exception 'Management access required'; end if;
 if length(trim(coalesce(p_search,'')))>80 then raise exception 'Search text is too long'; end if;
 if p_status_filter not in ('all','not_submitted','partial','pending','reviewing','approved','revision_required') then raise exception 'Invalid Patch status filter'; end if;
 select r.id into v_round_id from public.portfolio_update_rounds r
 where (p_round_id is null or r.id=p_round_id)
 order by r.archived_at nulls first,r.starts_at desc,r.created_at desc limit 1;
 if v_round_id is null then
  return jsonb_build_object('rounds','[]'::jsonb,'selected_round',null,
   'summary',jsonb_build_object('roster_count',0,'submitted_members',0,'not_submitted',0,'partial_members',0,'pending',0,'reviewing',0,'approved',0,'revision_required',0),
   'members','[]'::jsonb,'attention_members','[]'::jsonb,'review_queue','[]'::jsonb,'review_queue_total',0,'recent_activity','[]'::jsonb);
 end if;
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
  select * from filtered_members order by character_name,member_id
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),5000))
 ), queue_filtered as (
  select s.id as submission_id,s.member_id,pr.character_name,pr.game_class,p.title as portfolio_title,p.portfolio_type,
   pv.version_number,pv.version_name,s.submitted_at,s.updated_at,coalesce(rv.status,'pending') as review_status,
   rv.review_note,rv.reviewer_user_id,rv.reviewed_at
  from public.portfolio_patch_submissions s
  join public.portfolio_patch_roster pr on pr.round_id=s.round_id and pr.member_id=s.member_id
  join public.portfolios p on p.id=s.portfolio_id
  join public.portfolio_versions pv on pv.id=s.version_id
  left join public.portfolio_patch_submission_reviews rv on rv.submission_id=s.id
  where s.round_id=v_round_id
   and (p_status_filter='all' or (p_status_filter not in ('not_submitted','partial') and coalesce(rv.status,'pending')=p_status_filter))
   and (nullif(trim(coalesce(p_search,'')),'') is null or pr.character_name ilike '%'||trim(p_search)||'%' or p.title ilike '%'||trim(p_search)||'%')
 ), queue_rows as (
  select * from queue_filtered order by submitted_at desc,submission_id
  limit greatest(1,least(coalesce(p_limit,50),100)) offset greatest(0,least(coalesce(p_offset,0),5000))
 )
 select jsonb_build_object(
  'rounds',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select id,round_name,starts_at,closes_at,status,archived_at,roster_snapshot_at from public.portfolio_update_rounds order by archived_at nulls first,starts_at desc limit 50) r),
  'selected_round',(select to_jsonb(r) from (select id,round_name,starts_at,closes_at,status,archived_at,roster_snapshot_at from public.portfolio_update_rounds where id=v_round_id) r),
  'summary',(select jsonb_build_object('roster_count',count(*),'submitted_members',count(*) filter(where submitted_folder_count>0),'not_submitted',count(*) filter(where member_status='not_submitted'),'partial_members',count(*) filter(where member_status='partial'),'pending',coalesce(sum(pending_count),0),'reviewing',coalesce(sum(reviewing_count),0),'approved',coalesce(sum(approved_count),0),'revision_required',coalesce(sum(revision_count),0)) from roster_stats),
  'members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from member_page m),
  'attention_members',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (
   select member_id,character_name,game_class,folder_count,submitted_folder_count,member_status
   from roster_stats
   where member_status in ('not_submitted','partial','revision_required')
   order by case member_status when 'revision_required' then 1 when 'not_submitted' then 2 else 3 end,lower(character_name),member_id
   limit 10
  ) a),
  'member_total',(select count(*) from filtered_members),
  'review_queue',(select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from queue_rows q),
  'review_queue_total',(select count(*) from queue_filtered),
  'recent_activity',(select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) from (
   select e.id,e.submission_id,e.old_status,e.new_status,e.review_note,e.created_at,pr.character_name,s.member_id
   from public.portfolio_patch_review_events e
   join public.portfolio_patch_submissions s on s.id=e.submission_id
   join public.portfolio_patch_roster pr on pr.round_id=s.round_id and pr.member_id=s.member_id
   where s.round_id=v_round_id order by e.created_at desc limit 10
  ) a)
 ) into v_result;
 return v_result;
end; $$;
revoke all on function public.get_patch_command_center(uuid,text,text,integer,integer) from public,anon;
grant execute on function public.get_patch_command_center(uuid,text,text,integer,integer) to authenticated;

-- One lightweight database-only worker snapshots due Patch rosters. It does not make HTTP requests
-- and does not download Storage objects. No recurring job is scheduled in Free Staging.
do $$
declare v_job_id bigint;
begin
 for v_job_id in select jobid from cron.job where jobname='4am-patch-roster-snapshot'
 loop perform cron.unschedule(v_job_id); end loop;
 perform cron.schedule('4am-patch-roster-snapshot','* * * * *','select public.snapshot_due_patch_rosters();');
end $$;
