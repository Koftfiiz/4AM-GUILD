-- Staging-only Patch Submission Command Center foundation.
-- Apply after the Guild Affiliation and Patch Roster staging migrations.
-- All inserted records are synthetic. Do not apply this file to Production as-is.

create table if not exists public.portfolios (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.guild_members(user_id) on delete cascade,
 title text not null, description text, game_class text not null,
 portfolio_type text not null check(portfolio_type in ('pvp','pve','cultivation_skills')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.portfolio_versions (
 id uuid primary key default gen_random_uuid(),
 portfolio_id uuid not null references public.portfolios(id) on delete restrict,
 version_number integer not null check(version_number>=1), version_name text not null default 'Version',
 title text not null, game_class text not null,
 portfolio_type text not null check(portfolio_type in ('pvp','pve','cultivation_skills')),
 created_at timestamptz not null default now(), unique(portfolio_id,version_number)
);
create table if not exists public.portfolio_version_images (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.portfolio_versions(id) on delete cascade,
 image_url text not null, section_key text not null default 'stats',
 sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.portfolio_patch_submissions (
 id uuid primary key default gen_random_uuid(),
 round_id uuid not null references public.portfolio_update_rounds(id) on delete cascade,
 portfolio_id uuid not null references public.portfolios(id) on delete cascade,
 version_id uuid not null references public.portfolio_versions(id) on delete restrict,
 member_id uuid not null references public.guild_members(user_id) on delete restrict,
 submitted_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint portfolio_patch_submissions_one_per_folder unique(round_id,portfolio_id)
);
create index if not exists portfolio_patch_submissions_round_idx on public.portfolio_patch_submissions(round_id,submitted_at desc);
create index if not exists portfolio_patch_submissions_member_idx on public.portfolio_patch_submissions(member_id,round_id);

create table if not exists public.portfolio_patch_submission_reviews (
 id uuid primary key default gen_random_uuid(),
 submission_id uuid not null unique references public.portfolio_patch_submissions(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','reviewing','approved','revision_required')),
 review_note text, reviewer_user_id uuid, reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status <> 'revision_required' or nullif(trim(review_note),'') is not null)
);
create index if not exists portfolio_patch_submission_reviews_status_idx on public.portfolio_patch_submission_reviews(status,updated_at desc);

create table if not exists public.portfolio_patch_review_events (
 id bigint generated always as identity primary key,
 submission_id uuid not null references public.portfolio_patch_submissions(id) on delete restrict,
 old_status text, new_status text not null, review_note text, actor_user_id uuid,
 created_at timestamptz not null default now()
);
create index if not exists portfolio_patch_review_events_submission_idx on public.portfolio_patch_review_events(submission_id,created_at desc);

alter table public.portfolios enable row level security;
alter table public.portfolio_versions enable row level security;
alter table public.portfolio_version_images enable row level security;
alter table public.portfolio_patch_submissions enable row level security;
alter table public.portfolio_patch_submission_reviews enable row level security;
alter table public.portfolio_patch_review_events enable row level security;
drop policy if exists portfolios_read_members on public.portfolios;
create policy portfolios_read_members on public.portfolios for select to authenticated using(public.is_guild_member());
drop policy if exists versions_read_members on public.portfolio_versions;
create policy versions_read_members on public.portfolio_versions for select to authenticated using(public.is_guild_member());
drop policy if exists version_images_read_members on public.portfolio_version_images;
create policy version_images_read_members on public.portfolio_version_images for select to authenticated using(public.is_guild_member());
drop policy if exists patch_submissions_read_members on public.portfolio_patch_submissions;
create policy patch_submissions_read_members on public.portfolio_patch_submissions for select to authenticated using(public.is_guild_member());
drop policy if exists patch_reviews_read_members on public.portfolio_patch_submission_reviews;
create policy patch_reviews_read_members on public.portfolio_patch_submission_reviews for select to authenticated using(
 exists(select 1 from public.portfolio_patch_submissions s where s.id=submission_id
  and (s.member_id=(select auth.uid()) or public.can_manage_guild_affiliations()))
);
drop policy if exists patch_review_events_read_members on public.portfolio_patch_review_events;
create policy patch_review_events_read_members on public.portfolio_patch_review_events for select to authenticated using(
 exists(select 1 from public.portfolio_patch_submissions s where s.id=submission_id
  and (s.member_id=(select auth.uid()) or public.can_manage_guild_affiliations()))
);
grant select on public.portfolios,public.portfolio_versions,public.portfolio_version_images,
 public.portfolio_patch_submissions,public.portfolio_patch_submission_reviews,public.portfolio_patch_review_events to authenticated;

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
create trigger patch_submission_sync_review after insert or update of version_id on public.portfolio_patch_submissions
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
create trigger patch_submission_review_audit after insert or update on public.portfolio_patch_submission_reviews
for each row execute function public.audit_patch_submission_review();

create or replace function public.submit_portfolio_patch(target_round_id uuid,target_portfolio_id uuid,target_version_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_member_id uuid:=(select auth.uid()); v_submission_id uuid; v_submitted_at timestamptz;
begin
 if v_member_id is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.guild_members where user_id=v_member_id and active=true and membership_status='active') then
  raise exception 'Active guild membership required'; end if;
 perform public.snapshot_due_patch_rosters();
 if not exists(select 1 from public.portfolio_patch_roster where round_id=target_round_id and member_id=v_member_id) then
  raise exception 'Member is not included in this Patch roster'; end if;
 if not exists(select 1 from public.portfolios where id=target_portfolio_id and member_id=v_member_id) then
  raise exception 'You can submit only your own Portfolio folder'; end if;
 if not exists(select 1 from public.portfolio_versions where id=target_version_id and portfolio_id=target_portfolio_id) then
  raise exception 'Selected Version does not belong to this Portfolio folder'; end if;
 if not exists(select 1 from public.portfolio_update_rounds where id=target_round_id and status='open'
  and archived_at is null and now() between starts_at and closes_at) then
  raise exception 'This Patch is not accepting submissions'; end if;
 insert into public.portfolio_patch_submissions(round_id,portfolio_id,version_id,member_id)
 values(target_round_id,target_portfolio_id,target_version_id,v_member_id)
 on conflict(round_id,portfolio_id) do update set version_id=excluded.version_id,member_id=excluded.member_id,updated_at=now()
 returning id,submitted_at into v_submission_id,v_submitted_at;
 return jsonb_build_object('success',true,'submission_id',v_submission_id,'submitted_at',v_submitted_at);
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

-- Synthetic QA fixtures only. No Production member or Portfolio records are copied.
update public.guild_members set role='management' where user_id='10000000-0000-4000-8000-000000000005';
insert into public.portfolio_update_rounds(round_name,starts_at,closes_at,status)
values('Synthetic Patch 2.1',now()-interval '1 day',now()+interval '7 days','open');
select public.snapshot_due_patch_rosters();
insert into public.portfolios(member_id,title,description,game_class,portfolio_type) values
('10000000-0000-4000-8000-000000000001','Astra PvP Build','Synthetic build fixture','Ironclad','pvp'),
('10000000-0000-4000-8000-000000000004','Oracle PvE Build','Synthetic build fixture','Numina','pve');
insert into public.portfolio_versions(portfolio_id,version_number,version_name,title,game_class,portfolio_type)
select p.id,1,'Version 1',p.title,p.game_class,p.portfolio_type from public.portfolios p;
insert into public.portfolio_version_images(version_id,image_url,section_key)
select pv.id,'mock://synthetic-webp/fixture-01.webp','stats' from public.portfolio_versions pv limit 1;
insert into public.portfolio_patch_submissions(round_id,portfolio_id,version_id,member_id)
select r.id,p.id,pv.id,p.member_id from public.portfolio_update_rounds r
join public.portfolios p on p.member_id='10000000-0000-4000-8000-000000000001'
join public.portfolio_versions pv on pv.portfolio_id=p.id
where r.round_name='Synthetic Patch 2.1';
